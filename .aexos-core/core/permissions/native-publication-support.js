'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { sha256 } = require(path.resolve(__dirname, 'guarded-publication-protocol.js'));

// Only a reviewed source change may add an accepted tuple. No configuration switch exists.
const PRODUCTION_SUPPORT_ALLOWLIST = Object.freeze([]);
const LAUNCHER = path.resolve(__dirname, 'windows-publication-launcher.ps1');
const SOURCE = path.resolve(__dirname, 'windows-publication-helper.cs');
const MANAGED_EXECUTABLE = path.join(os.homedir(), '.aexos/runtimes/powershell/7.6.5/win-x64/pwsh.exe');
const EXECUTABLES = Object.freeze(['C:\\Program Files\\PowerShell\\7\\pwsh.exe',
  path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe')]);
const authorizations = new WeakMap();

function selectNativeExecutable() {
  let managedStat;
  try { managedStat = fs.lstatSync(MANAGED_EXECUTABLE); }
  catch (error) {
    if (error.code !== 'ENOENT') throw new Error('UNTRUSTED_HELPER');
  }
  if (!managedStat) return EXECUTABLES.find((filename) => fs.existsSync(filename));
  if (!managedStat.isFile() || managedStat.isSymbolicLink() || managedStat.nlink !== 1) {
    throw new Error('UNTRUSTED_HELPER');
  }
  // An existing managed runtime must fail closed on aliases, never select a fallback.
  try {
    let current = MANAGED_EXECUTABLE;
    while (true) {
      if (fs.realpathSync.native(current) !== path.resolve(current)) throw new Error('UNTRUSTED_HELPER');
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
      const stat = fs.lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('UNTRUSTED_HELPER');
    }
  } catch { throw new Error('UNTRUSTED_HELPER'); }
  return MANAGED_EXECUTABLE;
}

function inspectNativeCandidateIdentity() {
  const executable = selectNativeExecutable();
  if (!executable) throw new Error('NATIVE_PREREQUISITE_UNAVAILABLE');
  for (const filename of [executable, LAUNCHER, SOURCE]) {
    const stat = fs.lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('UNTRUSTED_HELPER');
  }
  return Object.freeze({ executable,
    tuple: Object.freeze({ platform: process.platform, architecture: process.arch, release: os.release(),
      filesystem: 'NTFS', powershellVersion: '7.6.5' }),
    hashes: Object.freeze({ executableSha256: sha256(fs.readFileSync(executable)),
      helperSha256: sha256(fs.readFileSync(SOURCE)), launcherSha256: sha256(fs.readFileSync(LAUNCHER)) }) });
}

function productionSupportFor(identity) {
  return PRODUCTION_SUPPORT_ALLOWLIST.find((entry) => JSON.stringify(entry.identity) === JSON.stringify(identity)
    && /^[a-f0-9]{64}$/.test(entry.securityEvidenceSha256)
    && /^[a-f0-9]{64}$/.test(entry.installedQaEvidenceSha256)
    && entry.securityEvidenceSha256 !== entry.installedQaEvidenceSha256) || null;
}

function rootIdentity(projectRoot) {
  const canonical = fs.realpathSync.native(projectRoot);
  if (canonical !== path.resolve(projectRoot)) throw new Error('VALIDATION_ROOT_ALIAS');
  const temporary = fs.realpathSync.native(os.tmpdir());
  const relative = path.relative(temporary, canonical);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('VALIDATION_ROOT_NOT_ISOLATED');
  let current = canonical;
  while (current !== path.dirname(current)) {
    const stat = fs.lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('VALIDATION_ROOT_ALIAS');
    current = path.dirname(current);
  }
  const stat = fs.statSync(canonical, { bigint: true });
  return { canonical, identity: `${stat.dev}:${stat.ino}` };
}

/** Trusted harness only: not an operation, plan, environment or serialized token API. */
function authorizeNativeCandidateValidation({ projectRoot, purpose, expectedIdentity, ttlMs = 60_000 }) {
  if (purpose !== 'candidate-validation' || !Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > 60_000) {
    throw new Error('INVALID_VALIDATION_AUTHORIZATION');
  }
  const root = rootIdentity(projectRoot);
  const observed = inspectNativeCandidateIdentity();
  if (JSON.stringify(expectedIdentity) !== JSON.stringify(observed)) throw new Error('VALIDATION_IDENTITY_MISMATCH');
  const authorization = Object.freeze({});
  authorizations.set(authorization, { ...root, identityJson: JSON.stringify(observed),
    expiresAt: Date.now() + ttlMs, deadline: performance.now() + ttlMs });
  return authorization;
}

function verifyNativeCandidateAuthorization(authorization, projectRoot, identity) {
  const binding = authorization && authorizations.get(authorization);
  if (!binding) return 'NATIVE_SUPPORT_DISABLED';
  if (Date.now() >= binding.expiresAt || performance.now() >= binding.deadline) return 'VALIDATION_AUTHORIZATION_EXPIRED';
  try {
    const root = rootIdentity(projectRoot);
    if (root.canonical !== binding.canonical || root.identity !== binding.identity) return 'VALIDATION_ROOT_MISMATCH';
  } catch { return 'VALIDATION_ROOT_MISMATCH'; }
  if (JSON.stringify(identity) !== binding.identityJson) return 'VALIDATION_IDENTITY_MISMATCH';
  return null;
}

module.exports = { PRODUCTION_SUPPORT_ALLOWLIST, LAUNCHER, SOURCE, inspectNativeCandidateIdentity,
  productionSupportFor, authorizeNativeCandidateValidation, verifyNativeCandidateAuthorization };
