'use strict';

const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');
const { VERSION, LIMITS, rejected, validateOperation } = require(path.resolve(__dirname, 'guarded-publication-protocol.js'));
const { LAUNCHER, inspectNativeCandidateIdentity, productionSupportFor, verifyNativeCandidateAuthorization }
  = require(path.resolve(__dirname, 'native-publication-support.js'));
const { claimNativeFiniteSession } = require(path.resolve(__dirname, 'native-publication-session.js'));

/** Fixed experimental native candidate. No production support acceptance is implied. */
async function inspectNativePublication(operation, context) {
  const invalid = validateOperation(operation);
  if (invalid) return rejected(invalid);
  let identity;
  try { identity = inspectNativeCandidateIdentity(); }
  catch { return rejected('NATIVE_PREREQUISITE_UNAVAILABLE', 'UNSUPPORTED_BEFORE_MUTATION'); }
  const acceptedSupport = productionSupportFor(identity);
  let session;
  const validateSupport = () => session?.verify() || (acceptedSupport ? null
    : verifyNativeCandidateAuthorization(context?.nativeValidationAuthorization, context?.projectRoot, inspectNativeCandidateIdentity()));
  const supportDenial = validateSupport();
  if (supportDenial) return rejected(supportDenial, 'UNSUPPORTED_BEFORE_MUTATION');
  if (process.platform !== 'win32' || process.arch !== 'x64' || os.release() !== '10.0.26300') {
    return rejected('UNSUPPORTED_HOST', 'UNSUPPORTED_BEFORE_MUTATION');
  }
  if (!context || typeof context.verifyAuthority !== 'function' || !context.authority?.leaseId
    || !context.authority?.task || !context.authority?.story) return rejected('AUTHORITY_REQUIRED');
  if (typeof context.trustedReceiptSink !== 'function') return rejected('TRUSTED_RECEIPT_SINK_REQUIRED');
  if (typeof context.trustedPublicationAccounting !== 'function') return rejected('TRUSTED_ACCOUNTING_REQUIRED');
  if (operation.operation === 'guarded-recover') {
    if (typeof context.trustedReceiptResolver !== 'function') return rejected('TRUSTED_RECEIPT_RESOLVER_REQUIRED', 'RECOVERY_CONFLICT');
    let anchored;
    try { anchored = await context.trustedReceiptResolver(operation.trustedReceipt.transactionId); }
    catch { return rejected('TRUSTED_RECEIPT_UNAVAILABLE', 'RECOVERY_CONFLICT'); }
    if (!anchored || JSON.stringify(anchored) !== JSON.stringify(operation.trustedReceipt)) {
      return rejected('TRUSTED_RECEIPT_MISMATCH', 'RECOVERY_CONFLICT');
    }
  }
  await context.verifyAuthority();
  const { executable, hashes } = identity;
  try { session = claimNativeFiniteSession(context.nativeFiniteSessionAuthorization, operation, context); }
  catch (error) { return rejected(error.code || 'FINITE_SESSION_INVALID', 'UNSUPPORTED_BEFORE_MUTATION'); }
  const input = JSON.stringify({ protocol: VERSION, root: context.projectRoot, ...operation,
    authority: context.authority, helperSha256: hashes.helperSha256, launcherSha256: hashes.launcherSha256,
    runtimeIdentity: session?.nativeRuntimeIdentity || { executableSha256: hashes.executableSha256, ...identity.tuple } });
  if (Buffer.byteLength(input) > LIMITS.request) return rejected('REQUEST_LIMIT');
  await context.verifyAuthority();
  const finalSupportDenial = validateSupport();
  if (finalSupportDenial) return rejected(finalSupportDenial, 'UNSUPPORTED_BEFORE_MUTATION');
  return new Promise((resolve) => {
    let child;
    let settled = false;
    let output = '';
    const decoder = new StringDecoder('utf8');
    let outputBytes = 0;
    let errors = 0;
    let timedOut = false;
    let finalResult;
    let lastFrame;
    let retainedReceipt = operation.operation === 'guarded-recover' ? operation.trustedReceipt : undefined;
    let cancellationWatchdog;
    let frames = Promise.resolve();
    let abortFrames;
    const aborted = new Promise((resolveAbort) => { abortFrames = resolveAbort; });
    const terminate = () => {
      if (timedOut || settled) return;
      timedOut = true; abortFrames();
      if (child?.cancelNative) child.cancelNative(); else child?.kill();
      cancellationWatchdog = setTimeout(() => finish({ success: false,
        code: 'NATIVE_TERMINATION_UNCONFIRMED', phase: 'RECOVERY_REQUIRED',
        effects: { transactionArtifactsMayExist: true, originalNameMayBeAbsent: Boolean(retainedReceipt),
          destinationMayExist: Boolean(retainedReceipt) }, productionEnabled: false }), 8000);
    };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(cancellationWatchdog);
      resolve({ ...result, receipt: { protocol: VERSION, ...hashes,
        productionEnabled: false, nativeMode: 'experimental-candidate', operation: operation.operation,
        task: context.authority.task, leaseId: context.authority.leaseId,
        host: { platform: process.platform, architecture: process.arch, release: os.release() },
        runtimeIdentity: 'unverified', phase: result.phase, effects: result.effects,
        preparedReceipt: retainedReceipt || result.receipt || null,
        ...(session ? { finiteSession: session.evidence() } : {}) } });
    };
    const timer = setTimeout(terminate, LIMITS.timeoutMs);
    const sendAck = (line) => {
      if (timedOut || settled) return;
      if (validateSupport()) throw new Error('Native validation authorization expired');
      child.stdin.write(line);
    };
    try {
      const spawnOptions = {
        shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], cwd: path.dirname(LAUNCHER),
        env: { SystemRoot: process.env.SystemRoot || 'C:\\Windows', WINDIR: process.env.SystemRoot || 'C:\\Windows',
          TEMP: os.tmpdir(), TMP: os.tmpdir() },
      };
      child = session ? session.launch(executable, spawnOptions, input)
        : spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', LAUNCHER], spawnOptions);
    } catch (error) { finish(rejected(error.code || 'NATIVE_LAUNCH_FAILED', 'UNSUPPORTED_BEFORE_MUTATION')); return; }
    child.stdout.on('data', (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > LIMITS.stdout) { terminate(); return; }
      output += decoder.write(chunk);
      let end;
      while ((end = output.indexOf('\n')) >= 0) {
        const line = output.slice(0, end); output = output.slice(end + 1);
        let frame;
        try {
          frame = JSON.parse(line);
          // Termination evidence cannot wait behind a stalled trusted callback.
          if (frame.type === 'finite-terminal') {
            if (!session || Object.keys(frame).length !== 2) throw new Error('Unexpected finite terminal');
            session.observeTerminal(frame.value);
            continue;
          }
        } catch { terminate(); continue; }
        frames = frames.then(async () => {
          if (timedOut || settled) return;
          if (!frame.type) { finalResult = frame; return; }
          if (!['barrier', 'phase', 'prepared', 'accounting', 'quota'].includes(frame.type)) throw new Error('Unknown native frame');
          if (!['accounting', 'quota'].includes(frame.type)) lastFrame = frame;
          if (validateSupport()) throw new Error('Native validation authorization expired');
          await context.verifyAuthority();
          if (context.nativePhaseObserver) await context.nativePhaseObserver(frame, { terminate });
          if (timedOut) return;
          if (validateSupport()) throw new Error('Native validation authorization expired');
          await context.verifyAuthority();
          if (frame.type === 'quota') {
            const ack = await context.trustedPublicationAccounting(structuredClone(frame.value));
            if (!ack || ack.durablyRecorded !== true || ['action', 'rootIdentity', 'ledgerIdentity', 'transactionId']
              .some((key) => ack[key] !== frame.value[key])) throw new Error('Trusted accounting not acknowledged');
            if (validateSupport()) throw new Error('Native validation authorization expired');
            await context.verifyAuthority();
            sendAck('{"type":"continue"}\n');
          } else if (frame.type === 'accounting') {
            const anchor = await context.trustedReceiptResolver?.(frame.value.transactionId);
            if (!anchor || anchor.preparedSha256 !== frame.value.preparedSha256
              || anchor.preparedIdentity !== frame.value.preparedIdentity
              || anchor.prepared.transactionIdentity !== frame.value.transactionIdentity
              || anchor.prepared.reservedBytes !== frame.value.reservedBytes
              || anchor.prepared.rootIdentity !== frame.value.rootIdentity) throw new Error('Unknown retained accounting entry');
            if (validateSupport()) throw new Error('Native validation authorization expired');
            await context.verifyAuthority();
            sendAck('{"type":"continue"}\n');
          } else if (frame.type === 'prepared') {
            const acknowledgement = await context.trustedReceiptSink(structuredClone(frame.value));
            if (timedOut || settled) return;
            if (!acknowledgement || acknowledgement.durablyRetained !== true
              || acknowledgement.preparedSha256 !== frame.value.preparedSha256
              || acknowledgement.transactionId !== frame.value.transactionId) throw new Error('Receipt retention not acknowledged');
            retainedReceipt = frame.value;
            if (validateSupport()) throw new Error('Native validation authorization expired');
            await context.verifyAuthority();
            if (timedOut || settled) return;
            sendAck(JSON.stringify({ type: 'retained', transactionId: frame.value.transactionId,
              preparedSha256: frame.value.preparedSha256 }) + '\n');
          } else sendAck('{"type":"continue"}\n');
        }).catch(terminate);
      }
    });
    child.stderr.on('data', (chunk) => { errors += chunk.length; if (errors > LIMITS.stderr) terminate(); });
    child.stdin.on('error', () => {});
    child.on('error', () => {
      // An error after spawn (for example failed termination) says nothing about retained effects.
      if (child.pid) terminate();
      else finish(rejected('NATIVE_LAUNCH_FAILED', 'UNSUPPORTED_BEFORE_MUTATION'));
    });
    child.on('close', async (exitCode) => {
      await Promise.race([frames, aborted]);
      if (session && (!session.confirmed() || (!timedOut && exitCode !== 0))) {
        finish({ success: false, code: 'NATIVE_TERMINATION_UNCONFIRMED', phase: 'RECOVERY_REQUIRED',
          effects: { transactionArtifactsMayExist: true, originalNameMayBeAbsent: Boolean(retainedReceipt),
            destinationMayExist: Boolean(retainedReceipt) }, productionEnabled: false }); return;
      }
      if (timedOut || !finalResult) {
        finish({ success: false, code: 'NATIVE_INTERRUPTED', phase: retainedReceipt ? 'RECOVERY_REQUIRED' : 'PREPARED',
          lastReconstructablePhase: lastFrame?.value?.phase || 'UNKNOWN',
          transactionId: retainedReceipt?.transactionId || lastFrame?.value?.transactionId || null,
          effects: { transactionArtifactsMayExist: true, originalNameMayBeAbsent: Boolean(retainedReceipt),
            destinationMayExist: Boolean(retainedReceipt) }, productionEnabled: false }); return;
      }
      try {
        const result = finalResult;
        if (typeof result.success !== 'boolean' || !result.effects
          || (result.success && !['VERIFIED', 'RECOVERED'].includes(result.phase))) {
          throw new Error('Invalid terminal frame');
        }
        try {
          if (validateSupport()) throw new Error('Native validation authorization expired');
          await Promise.race([context.verifyAuthority(), aborted.then(() => { throw new Error('Native operation interrupted'); })]);
          if (timedOut || settled || validateSupport()) {
            throw new Error('Native operation cannot be accepted');
          }
          if (session && result.success && !session.successful()) {
            throw Object.assign(new Error('Native outcome cannot be accepted'), { code: 'FINITE_NATIVE_OUTCOME_REJECTED' });
          }
        } catch (error) {
          result.success = false;
          result.acceptanceCode = timedOut ? 'NATIVE_INTERRUPTED' : error.code || 'FILESYSTEM_AUTHORITY_EXPIRED';
        }
        finish(result);
      } catch {
        finish({ success: false, code: 'NATIVE_RESPONSE_INVALID', phase: 'RECOVERY_REQUIRED',
          effects: { transactionArtifactsMayExist: true, originalNameMayBeAbsent: Boolean(retainedReceipt),
            destinationMayExist: Boolean(retainedReceipt) }, productionEnabled: false });
      }
    });
    child.stdin.write(`${input.length}\n${input}\n`);
  });
}

module.exports = { inspectNativePublication };
