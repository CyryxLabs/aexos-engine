'use strict';

// Transport metadata is controlled here; native truth is covered by separate Windows qualifications.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const source = path.resolve(__dirname, '../../../.aexos-core/core/permissions/windows-publication-adapter.js');

async function observe(mode, nativeRuntimeIdentity = null,
  host = { platform: 'win32', architecture: 'x64', release: '10.0.26300' }) {
  let terminal = null, cancelled = false, calls = 0, claimed = 0;
  let sentRequest = null;
  const child = new EventEmitter();
  child.pid = 42;
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
  child.stdin.write = () => true;
  child.cancelNative = () => {
    cancelled = true;
    if (mode === 'post-spawn-error') setImmediate(() => child.emit('close', null));
  };
  const session = {
    nativeRuntimeIdentity,
    verify: () => mode === 'authority-expiry' && calls >= 3 ? 'FINITE_SESSION_EXPIRED' : null,
    observeTerminal: value => { terminal = value; },
    confirmed: () => terminal?.terminationObserved === true && terminal.jobActiveProcesses === 0 && terminal.nativeExitCode !== null,
    successful: () => terminal?.nativeExitCode === 0 && !terminal.cancelRequested && !cancelled,
    evidence: () => ({ terminal, cancelled }),
    launch: (executable, options, request) => {
      sentRequest = JSON.parse(request);
      setImmediate(() => {
        if (mode === 'post-spawn-error') { child.emit('error', new Error('kill failed')); return; }
        if (mode === 'spawn-error') { child.pid = undefined; child.emit('error', new Error('spawn failed')); return; }
        const lines = [{ success: true, phase: 'VERIFIED', effects: { destination: true } }];
        if (mode !== 'no-native-terminal') lines.push({ type: 'finite-terminal', value: {
          terminationObserved: true, jobActiveProcesses: 0, nativeExitCode: mode === 'native-failure' ? 92 : 0,
          cancelRequested: mode === 'native-cancel',
        } });
        child.stdout.emit('data', Buffer.from(lines.map(value => JSON.stringify(value)).join('\n') + '\n'));
        setImmediate(() => child.emit('close', 0));
      });
      return child;
    },
  };
  const controlledRequire = id => {
    if (id.endsWith('guarded-publication-protocol.js')) {
      const actual = require(id);
      return { ...actual, LIMITS: { ...actual.LIMITS, timeoutMs: 40 } };
    }
    if (id.endsWith('native-publication-support.js')) return { LAUNCHER: 'fixture',
      inspectNativeCandidateIdentity: () => ({ executable: 'fixture', hashes: {}, tuple: {} }),
      productionSupportFor: () => false, verifyNativeCandidateAuthorization: () => null };
    if (id.endsWith('native-publication-session.js')) return { claimNativeFiniteSession: () => { claimed++; return session; } };
    if (id === 'node:os') return { release: () => host.release, tmpdir: () => 'fixture' };
    return require(id);
  };
  const box = { require: controlledRequire, module: { exports: {} }, __dirname: path.dirname(source),
    process: { platform: host.platform, arch: host.architecture, env: {} }, Buffer, setTimeout, clearTimeout, structuredClone };
  vm.runInNewContext(fs.readFileSync(source, 'utf8'), box, { filename: source });
  const result = await box.module.exports.inspectNativePublication({ operation: 'guarded-create', target: 'x', contentBase64: '' }, {
    projectRoot: 'fixture', nativeFiniteSessionAuthorization: {}, authority: { leaseId: 'x', task: 'x', story: 'x' },
    trustedReceiptSink: async () => {}, trustedPublicationAccounting: async () => {},
    verifyAuthority: async () => { calls++; if (mode === 'authority-stall' && calls === 3) await new Promise(() => {}); },
  });
  return { result, cancelled, sentRequest, authorityCalls: calls, claimed };
}

describe('native adapter acceptance state machine (controlled transport)', () => {
  test('admits only the exact current Windows host before authority, session claim and launch', async () => {
    const outcomes = {};
    for (const [name, host] of Object.entries({
      current: { platform: 'win32', architecture: 'x64', release: '10.0.26300' },
      old: { platform: 'win32', architecture: 'x64', release: '10.0.26200' },
      nearby: { platform: 'win32', architecture: 'x64', release: '10.0.26301' },
      platform: { platform: 'linux', architecture: 'x64', release: '10.0.26300' },
      architecture: { platform: 'win32', architecture: 'arm64', release: '10.0.26300' },
    })) outcomes[name] = await observe('normal', null, host);
    expect({
      current: { success: outcomes.current.result.success, authority: outcomes.current.authorityCalls > 0,
        claimed: outcomes.current.claimed, launched: outcomes.current.sentRequest !== null },
      old: { code: outcomes.old.result.code, authority: outcomes.old.authorityCalls,
        claimed: outcomes.old.claimed, launched: outcomes.old.sentRequest !== null },
    }).toEqual({
      current: { success: true, authority: true, claimed: 1, launched: true },
      old: { code: 'UNSUPPORTED_HOST', authority: 0, claimed: 0, launched: false },
    });
    for (const name of ['nearby', 'platform', 'architecture']) {
      expect(outcomes[name]).toMatchObject({ result: { success: false, code: 'UNSUPPORTED_HOST',
        phase: 'UNSUPPORTED_BEFORE_MUTATION' }, authorityCalls: 0, claimed: 0, sentRequest: null });
    }
  });
  test('serializes the admitted native runtime tuple before launching the ordinary client', async () => {
    const runtime = { executableSha256: 'a'.repeat(64), platform: 'win32', architecture: 'x64',
      release: '10.0.26300', filesystem: 'NTFS', powershellVersion: '7.6.5' };
    expect((await observe('normal', runtime)).sentRequest.runtimeIdentity).toEqual(runtime);
    expect((await observe('normal')).sentRequest.runtimeIdentity).toEqual({});
  });
  test('requires a normal native exit as well as a successful helper result', async () => {
    expect((await observe('normal')).result.success).toBe(true);
    for (const mode of ['native-failure', 'native-cancel']) {
      expect((await observe(mode)).result).toMatchObject({ success: false, acceptanceCode: 'FINITE_NATIVE_OUTCOME_REJECTED' });
    }
  });
  test('shim exit alone cannot establish native termination', async () => {
    expect((await observe('no-native-terminal')).result).toMatchObject({ success: false, code: 'NATIVE_TERMINATION_UNCONFIRMED' });
  });
  test('stalled final authority is bounded and never accepted after timeout', async () => {
    expect(await observe('authority-stall')).toMatchObject({ cancelled: true, result: { success: false, acceptanceCode: 'NATIVE_INTERRUPTED' } });
  });
  test('session expiry during the final authority await rejects acceptance', async () => {
    expect((await observe('authority-expiry')).result).toMatchObject({ success: false, acceptanceCode: 'FILESYSTEM_AUTHORITY_EXPIRED' });
  });
  test('post-spawn errors retain uncertain effects; pre-spawn failure has no native mutation', async () => {
    expect(await observe('post-spawn-error')).toMatchObject({ cancelled: true, result: {
      success: false, code: 'NATIVE_TERMINATION_UNCONFIRMED', effects: { transactionArtifactsMayExist: true } } });
    expect((await observe('spawn-error')).result).toMatchObject({ success: false, code: 'NATIVE_LAUNCH_FAILED',
      phase: 'UNSUPPORTED_BEFORE_MUTATION', effects: { destination: false } });
  });
});
