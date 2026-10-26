'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { StringDecoder } = require('node:string_decoder');
const { sha256 } = require(path.resolve(__dirname, 'guarded-publication-protocol.js'));
const { inspectNativeCandidateIdentity, verifyNativeCandidateAuthorization } =
  require(path.resolve(__dirname, 'native-publication-support.js'));

const CLIENT_LAUNCHER = path.resolve(__dirname, 'windows-publication-session.ps1');
const COMPONENTS = [CLIENT_LAUNCHER, path.resolve(__dirname, 'windows-publication-finite-relay.cs'),
  path.resolve(__dirname, 'windows-publication-finite-transport.cs')];
const PROTECTED_LAUNCHER = path.resolve(__dirname, 'windows-publication-protected-session.ps1');
const PROTECTED_COMPONENTS = [PROTECTED_LAUNCHER, ...['transport', 'relay-base', 'native', 'relay']
  .map(name => path.resolve(__dirname, `windows-publication-protected-${name}.cs`))];
const sessions = new WeakMap();
const HEX = /^[a-f0-9]{64}$/;
const ENROLLMENT_MARKER = '@@AEXOS_FINITE_ENROLL@@';
// This first qualification profile is intentionally smaller than native v1.
const FINITE_REQUEST_LIMIT = 16 * 1024;
const isProtectedMode = mode => ['protected-qualification', 'protected-workflow-qualification'].includes(mode);
const activationLimit = mode => isProtectedMode(mode) ? 257 * 1024 : 65536;

function fail(code) { throw Object.assign(new Error(code), { code }); }
function exact(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function isolatedDirectory(directory) {
  const canonical = fs.realpathSync.native(directory);
  const relative = path.relative(fs.realpathSync.native(os.tmpdir()), canonical);
  if (canonical !== path.resolve(directory) || !relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    fail('FINITE_SESSION_ROOT_INVALID');
  }
  for (let current = canonical; current !== path.dirname(current); current = path.dirname(current)) {
    const stat = fs.lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('FINITE_SESSION_ROOT_INVALID');
  }
  const stat = fs.statSync(canonical, { bigint: true });
  return { canonical, identity: String(stat.dev) + ':' + String(stat.ino) };
}
function activationDirectory(directory, mode) {
  if (mode === 'ordinary-qualification') return isolatedDirectory(directory);
  const canonical = fs.realpathSync.native(directory);
  const relative = path.relative('C:\\Program Files', canonical);
  if (canonical !== path.resolve(directory) || !relative || relative.startsWith('..') || path.isAbsolute(relative)
    || !/^AexosGovernedPublication-[a-zA-Z0-9-]+(?:\\|$)/.test(relative)) fail('FINITE_PROTECTED_ACTIVATION_ROOT_INVALID');
  for (let at = canonical; at !== path.dirname(at); at = path.dirname(at)) {
    const stat = fs.lstatSync(at);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('FINITE_PROTECTED_ACTIVATION_ROOT_INVALID');
  }
  const stat = fs.statSync(canonical, { bigint: true });
  return { canonical, identity: String(stat.dev) + ':' + String(stat.ino) };
}
function fileIdentity(file, maximum = 1024 * 1024) {
  const stat = fs.lstatSync(file, { bigint: true });
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n || stat.size > BigInt(maximum)) {
    fail('FINITE_SESSION_FILE_INVALID');
  }
  return { sha256: sha256(fs.readFileSync(file)), identity: String(stat.dev) + ':' + String(stat.ino) };
}
function inspectFiniteClientIdentity(mode = 'ordinary-qualification') {
  if (!['ordinary-qualification', 'protected-qualification', 'protected-workflow-qualification'].includes(mode)) {
    fail('FINITE_SESSION_PROFILE_INVALID');
  }
  return Object.fromEntries((mode === 'ordinary-qualification' ? COMPONENTS : PROTECTED_COMPONENTS)
    .map(file => [path.basename(file), fileIdentity(file)]));
}
function validateProfile(profile) {
  if (!exact(profile, ['version', 'mode', 'activationId', 'slotId', 'endpoint', 'manifestSha256',
    'activationFile', 'serverPid', 'serverStarted', 'serverImageSha256', 'serverSid'])
    || !((profile.version === 1 && profile.mode === 'ordinary-qualification')
      || (profile.version === 2 && profile.mode === 'protected-qualification')
      || (profile.version === 3 && profile.mode === 'protected-workflow-qualification'))
    || !/^[a-f0-9]{32}$/.test(profile.activationId) || !Number.isInteger(profile.slotId)
    || profile.slotId < 1 || profile.slotId > (profile.version === 3 ? 2 : 3)
    || !/^aexos-finite-[a-f0-9]{32}$/.test(profile.endpoint)
    || !HEX.test(profile.manifestSha256) || !HEX.test(profile.serverImageSha256)
    || !Number.isInteger(profile.serverPid) || profile.serverPid < 1
    || typeof profile.serverStarted !== 'string' || !/^[0-9]{1,20}$/.test(profile.serverStarted)
    || !/^S-1-[0-9-]+$/.test(profile.serverSid)
    || typeof profile.activationFile !== 'string' || !path.isAbsolute(profile.activationFile)
    || Buffer.byteLength(JSON.stringify(profile)) > 8192) fail('FINITE_SESSION_PROFILE_INVALID');
}
function protectedRuntime(profile, candidate) {
  // This binds the proposed tuple. Native held-file/ACL and connected-peer admission must still prove it.
  const activation = JSON.parse(fs.readFileSync(profile.activationFile, 'utf8'));
  const manifest = activation.manifest;
  if (activation.manifestSha256 !== profile.manifestSha256 || manifest?.version !== profile.version
    || manifest.mode !== profile.mode || manifest.activationId !== profile.activationId
    || manifest.activationFile !== profile.activationFile || !HEX.test(manifest.runtimeSha256)
    || manifest.ordinaryRuntimeSha256 !== candidate.hashes.executableSha256
    || manifest.helperSha256 !== candidate.hashes.helperSha256 || manifest.launcherSha256 !== candidate.hashes.launcherSha256
    || profile.serverImageSha256 !== manifest.runtimeSha256
    || manifest.nodeSha256 !== fileIdentity(process.execPath, 200 * 1024 * 1024).sha256) fail('FINITE_PROTECTED_MANIFEST_MISMATCH');
  return Object.freeze({ executableSha256: manifest.runtimeSha256, ...candidate.tuple });
}
function operationBinding(operation, authority) {
  return JSON.stringify({ operation, authority: {
    agentId: authority?.agentId, task: authority?.task, story: authority?.story,
  } });
}

/** Trusted qualification harness only. No serialized plan or environment selection. */
function authorizeNativeFiniteSession({ projectRoot, candidateAuthorization, expectedClientIdentity,
  profile, operation, authority, enrollmentFile, ttlMs = 60_000 }) {
  if (!Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > 60_000) fail('FINITE_SESSION_TTL_INVALID');
  validateProfile(profile);
  const operations = profile.mode === 'ordinary-qualification' ? ['guarded-create', 'guarded-recover']
    : profile.mode === 'protected-workflow-qualification' ? ['guarded-recoverable-replace']
      : ['guarded-recoverable-replace', 'guarded-recover'];
  if (!operations.includes(operation?.operation)
    || typeof operation.target !== 'string' || !operation.target
    || !authority?.agentId || !authority?.task || !authority?.story) fail('FINITE_SESSION_BINDING_INVALID');
  if (profile.mode === 'protected-workflow-qualification'
    && (operation.target !== 'app.cjs' || authority.agentId !== 'dev'
      || authority.task !== 'dev-develop-story' || authority.story !== 'FIXTURE-1')) {
    fail('FINITE_SESSION_BINDING_INVALID');
  }
  const root = isolatedDirectory(projectRoot);
  const candidate = inspectNativeCandidateIdentity();
  const denial = verifyNativeCandidateAuthorization(candidateAuthorization, root.canonical, candidate);
  if (denial) fail(denial);
  const clientIdentity = inspectFiniteClientIdentity(profile.mode);
  if (JSON.stringify(expectedClientIdentity) !== JSON.stringify(clientIdentity)) fail('FINITE_CLIENT_IDENTITY_MISMATCH');
  const activationParent = activationDirectory(path.dirname(profile.activationFile), profile.mode);
  const activation = fileIdentity(profile.activationFile, activationLimit(profile.mode));
  const nativeRuntimeIdentity = isProtectedMode(profile.mode) ? protectedRuntime(profile, candidate)
    : Object.freeze({ executableSha256: candidate.hashes.executableSha256, ...candidate.tuple });
  if (typeof enrollmentFile !== 'string' || path.resolve(enrollmentFile) !== enrollmentFile
    || fs.existsSync(enrollmentFile)) fail('FINITE_ENROLLMENT_INVALID');
  const enrollmentParent = isolatedDirectory(path.dirname(enrollmentFile));
  const relation = path.relative(root.canonical, enrollmentParent.canonical);
  if (!relation || (!relation.startsWith('..') && !path.isAbsolute(relation))) fail('FINITE_ENROLLMENT_IN_PROJECT');
  const authorization = Object.freeze({});
  sessions.set(authorization, { root, candidateAuthorization, candidate: JSON.stringify(candidate),
    clientIdentity: JSON.stringify(clientIdentity), activationParent, activation, nativeRuntimeIdentity,
    enrollmentParent, enrollmentFile, profile: structuredClone(profile),
    binding: operationBinding(operation, authority), target: operation.target, operation: operation.operation,
    expires: Date.now() + ttlMs, deadline: performance.now() + ttlMs, consumed: false });
  return authorization;
}

function verify(binding, projectRoot) {
  if (Date.now() >= binding.expires || performance.now() >= binding.deadline) return 'FINITE_SESSION_EXPIRED';
  try {
    if (JSON.stringify(isolatedDirectory(projectRoot)) !== JSON.stringify(binding.root)) return 'FINITE_SESSION_ROOT_CHANGED';
    const candidate = inspectNativeCandidateIdentity();
    const denied = verifyNativeCandidateAuthorization(binding.candidateAuthorization, projectRoot, candidate);
    if (denied) return denied;
    if (JSON.stringify(candidate) !== binding.candidate
      || JSON.stringify(inspectFiniteClientIdentity(binding.profile.mode)) !== binding.clientIdentity) return 'FINITE_SESSION_SOURCE_CHANGED';
    if (JSON.stringify(activationDirectory(path.dirname(binding.profile.activationFile), binding.profile.mode)) !== JSON.stringify(binding.activationParent)
      || JSON.stringify(fileIdentity(binding.profile.activationFile, activationLimit(binding.profile.mode))) !== JSON.stringify(binding.activation)) {
      return 'FINITE_SESSION_ACTIVATION_CHANGED';
    }
  } catch { return 'FINITE_SESSION_IDENTITY_UNAVAILABLE'; }
  return null;
}

function verifyNativeFiniteSessionAuthorization(authorization, projectRoot) {
  if (authorization === undefined) return null;
  const binding = authorization && sessions.get(authorization);
  return binding ? verify(binding, projectRoot) : 'FINITE_SESSION_AUTHORIZATION_REQUIRED';
}

/** Consumes the matching operation before any launch; foreign/serialized brands fail closed. */
function claimNativeFiniteSession(authorization, operation, context) {
  if (authorization === undefined) return null;
  const binding = authorization && sessions.get(authorization);
  if (!binding) fail('FINITE_SESSION_AUTHORIZATION_REQUIRED');
  const denied = verify(binding, context.projectRoot);
  if (denied) fail(denied);
  // Other approved workflow writes still use the existing direct native transport.
  if (operation.operation !== binding.operation || operation.target !== binding.target) return null;
  if (operationBinding(operation, context.authority) !== binding.binding) fail('FINITE_SESSION_OPERATION_MISMATCH');
  if (binding.consumed) fail('FINITE_SESSION_CONSUMED');
  binding.consumed = true;
  let terminal = null;
  let terminalInvalid = false;
  let cancelled = false;
  let cancelledBeforeTerminal = false;
  let launched = false;
  const profile = binding.profile;
  return {
    nativeRuntimeIdentity: binding.nativeRuntimeIdentity,
    verify: () => verify(binding, context.projectRoot),
    observeTerminal(value) {
      if (terminal || !exact(value, ['version', 'activationId', 'slotId', 'manifestSha256', 'nativePid',
        'terminationObserved', 'jobActiveProcesses', 'nativeExitCode', 'cancelRequested', 'reason'])
        || value.version !== 1 || value.activationId !== profile.activationId || value.slotId !== profile.slotId
        || value.manifestSha256 !== profile.manifestSha256 || !Number.isInteger(value.nativePid) || value.nativePid < 1
        || typeof value.terminationObserved !== 'boolean' || typeof value.cancelRequested !== 'boolean'
        || !(value.jobActiveProcesses === null || (Number.isInteger(value.jobActiveProcesses) && value.jobActiveProcesses >= 0))
        || !(value.nativeExitCode === null || Number.isInteger(value.nativeExitCode))
        || typeof value.reason !== 'string' || !/^[A-Z0-9_]{1,80}$/.test(value.reason)) {
        terminalInvalid = true; fail('FINITE_TERMINAL_INVALID');
      }
      terminal = structuredClone(value);
    },
    confirmed() {
      return !terminalInvalid && terminal?.terminationObserved === true && terminal.jobActiveProcesses === 0
        && terminal.nativeExitCode !== null && (!cancelledBeforeTerminal || terminal.cancelRequested === true);
    },
    successful() {
      return this.confirmed() && !cancelled && terminal.nativeExitCode === 0 && terminal.cancelRequested === false;
    },
    evidence() {
      return { mode: profile.mode, activationId: profile.activationId, slotId: profile.slotId,
        manifestSha256: profile.manifestSha256, cancellationRequested: cancelled,
        terminationEvidence: terminal, terminalInvalid, productionEnabled: false };
    },
    launch(executable, options, request) {
      if (launched) fail('FINITE_SESSION_CONSUMED');
      launched = true;
      const denied = verify(binding, context.projectRoot);
      if (denied) fail(denied);
      if (Buffer.byteLength(request) > FINITE_REQUEST_LIMIT) fail('FINITE_REQUEST_LIMIT');
      if (JSON.stringify(isolatedDirectory(path.dirname(binding.enrollmentFile))) !== JSON.stringify(binding.enrollmentParent)
        || fs.existsSync(binding.enrollmentFile)) fail('FINITE_ENROLLMENT_INVALID');
      const launcher = profile.mode === 'ordinary-qualification' ? CLIENT_LAUNCHER : PROTECTED_LAUNCHER;
      const child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', launcher], {
        ...options, cwd: path.dirname(launcher),
      });
      let enrollmentWritten = false;
      let diagnostics = '';
      const decoder = new StringDecoder('utf8');
      child.stderr.on('data', chunk => {
        diagnostics += decoder.write(chunk);
        if (Buffer.byteLength(diagnostics) > 8192) { terminalInvalid = true; child.kill(); return; }
        let end;
        while ((end = diagnostics.indexOf('\n')) >= 0) {
          const line = diagnostics.slice(0, end).trimEnd(); diagnostics = diagnostics.slice(end + 1);
          if (!line.startsWith(ENROLLMENT_MARKER)) continue;
          try {
            if (enrollmentWritten) fail('FINITE_ENROLLMENT_REPEATED');
            const evidence = JSON.parse(line.slice(ENROLLMENT_MARKER.length));
            const pin = profile.mode === 'ordinary-qualification' ? evidence : evidence.shim;
            if (pin?.Pid !== child.pid || pin.Elevated !== false
              || typeof pin.Started !== 'string' || !/^[0-9]{1,20}$/.test(pin.Started) || !pin.ImageSha256
              || !pin.Sid || !pin.TokenId) fail('FINITE_ENROLLMENT_MISMATCH');
            if (isProtectedMode(profile.mode)) {
              const controller = evidence.controller;
              if (!exact(evidence, ['shim', 'controller']) || controller?.Pid !== process.pid || controller.Elevated !== false
                || typeof controller.Started !== 'string' || !/^[0-9]{1,20}$/.test(controller.Started)
                || controller.ImageSha256?.toLowerCase() !== fileIdentity(process.execPath, 200 * 1024 * 1024).sha256
                || controller.Sid !== pin.Sid || !controller.TokenId) fail('FINITE_CONTROLLER_ENROLLMENT_MISMATCH');
            }
            if (JSON.stringify(isolatedDirectory(path.dirname(binding.enrollmentFile))) !== JSON.stringify(binding.enrollmentParent)) {
              fail('FINITE_ENROLLMENT_CHANGED');
            }
            const fd = fs.openSync(binding.enrollmentFile, 'wx', 0o600);
            try { fs.writeFileSync(fd, JSON.stringify(evidence) + '\n'); fs.fsyncSync(fd); }
            finally { fs.closeSync(fd); }
            enrollmentWritten = true;
          } catch { terminalInvalid = true; child.kill(); }
        }
      });
      let cancellationTimer;
      child.once('close', () => {
        clearTimeout(cancellationTimer);
        if (!enrollmentWritten) terminalInvalid = true;
      });
      child.cancelNative = () => {
        if (cancelled) return;
        cancelled = true;
        cancelledBeforeTerminal = !terminal;
        if (!child.stdin.destroyed) child.stdin.write('{"type":"finite-cancel"}\n');
        cancellationTimer = setTimeout(() => child.kill(), 5000);
      };
      child.stdin.write(JSON.stringify(profile) + '\n');
      return child;
    },
  };
}

module.exports = { authorizeNativeFiniteSession, inspectFiniteClientIdentity, claimNativeFiniteSession,
  verifyNativeFiniteSessionAuthorization, FINITE_REQUEST_LIMIT };
