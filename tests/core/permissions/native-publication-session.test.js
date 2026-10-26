'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const os = require('node:os');
const { performance } = require('node:perf_hooks');
const { authorizeNativeCandidateValidation, inspectNativeCandidateIdentity }
  = require(path.resolve(__dirname, '../../../.aexos-core/core/permissions/native-publication-support.js'));
const { authorizeNativeFiniteSession, inspectFiniteClientIdentity, claimNativeFiniteSession,
  verifyNativeFiniteSessionAuthorization, FINITE_REQUEST_LIMIT }
  = require(path.resolve(__dirname, '../../../.aexos-core/core/permissions/native-publication-session.js'));

const nativeDescribe = process.platform === 'win32' && os.release() === '10.0.26300' ? describe : describe.skip;
nativeDescribe('trusted ordinary finite session admission (no native invocation)', () => {
  let fixture, root, options;
  const operation = { operation: 'guarded-create', target: 'result.bin', contentBase64: 'YWJj' };
  const authority = { agentId: 'dev', task: 'finite', story: 'AEX-4.28' };
  beforeEach(() => {
    fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-session-admission-'));
    root = path.join(fixture, 'workspace'); fs.mkdirSync(root);
    const activationFile = path.join(fixture, 'activation.json'); fs.writeFileSync(activationFile, '{}');
    const candidateAuthorization = authorizeNativeCandidateValidation({ projectRoot: root,
      purpose: 'candidate-validation', expectedIdentity: inspectNativeCandidateIdentity() });
    options = { projectRoot: root, candidateAuthorization, expectedClientIdentity: inspectFiniteClientIdentity(), operation, authority,
      enrollmentFile: path.join(fixture, 'enrollment.json'), profile: {
        version: 1, mode: 'ordinary-qualification', activationId: 'a'.repeat(32), slotId: 1,
        endpoint: 'aexos-finite-' + 'a'.repeat(32), manifestSha256: 'b'.repeat(64), activationFile,
        serverPid: 1, serverStarted: '134362830425376148', serverImageSha256: 'c'.repeat(64), serverSid: 'S-1-5-21',
      } };
  });
  // Admission-only files contain no publication/recovery artifacts.
  afterEach(() => {
    const relative = path.relative(fs.realpathSync.native(os.tmpdir()), fs.realpathSync.native(fixture));
    if (!relative.startsWith('aexos-session-admission-') || relative.includes(path.sep)) throw new Error('Fixture scope changed');
    fs.rmSync(fixture, { recursive: true });
  });
  const claim = (token, changed = operation, actor = authority) => claimNativeFiniteSession(token, changed, { projectRoot: root, authority: actor });
  test('no protected mode, numeric process start or unbound component hashes', () => {
    for (const profile of [{ ...options.profile, mode: 'protected' }, { ...options.profile, serverStarted: Number('134362830425376148') }]) {
      expect(() => authorizeNativeFiniteSession({ ...options, profile })).toThrow('FINITE_SESSION_PROFILE_INVALID');
    }
    expect(() => authorizeNativeFiniteSession({ ...options, expectedClientIdentity: {} })).toThrow('FINITE_CLIENT_IDENTITY_MISMATCH');
  });
  test('one-use brand binds exact payload and original authority without selecting other workflow writes', () => {
    const token = authorizeNativeFiniteSession(options);
    expect(() => claim(JSON.parse(JSON.stringify(token)))).toThrow('FINITE_SESSION_AUTHORIZATION_REQUIRED');
    expect(claim(token, { ...operation, target: 'another.bin' })).toBeNull();
    expect(() => claim(token, { ...operation, contentBase64: 'ZA==' })).toThrow('FINITE_SESSION_OPERATION_MISMATCH');
    expect(() => claim(token, operation, { ...authority, task: 'different' })).toThrow('FINITE_SESSION_OPERATION_MISMATCH');
    expect(claim(token)).toBeTruthy();
    expect(() => claim(token)).toThrow('FINITE_SESSION_CONSUMED');
  });
  test('activation drift and elapsed session lifetime invalidate the same brand', async () => {
    const token = authorizeNativeFiniteSession(options);
    fs.writeFileSync(options.profile.activationFile, '{"changed":true}');
    expect(verifyNativeFiniteSessionAuthorization(token, root)).toBe('FINITE_SESSION_ACTIVATION_CHANGED');
    const expired = authorizeNativeFiniteSession({ ...options, ttlMs: 1 });
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(() => claim(expired)).toThrow('FINITE_SESSION_EXPIRED');
  });
  test('oversized finite request is rejected before spawning and consumes the matching brand', () => {
    const token = authorizeNativeFiniteSession(options);
    const session = claim(token);
    expect(() => session.launch('never-launched', {}, 'x'.repeat(FINITE_REQUEST_LIMIT + 1))).toThrow('FINITE_REQUEST_LIMIT');
    expect(() => claim(token)).toThrow('FINITE_SESSION_CONSUMED');
    expect(fs.existsSync(options.enrollmentFile)).toBe(false);
  });
  test('protected qualification cannot enroll a Temp activation or a create operation', () => {
    const profile = { ...options.profile, version: 2, mode: 'protected-qualification' };
    const expectedClientIdentity = inspectFiniteClientIdentity(profile.mode);
    expect(Object.keys(expectedClientIdentity)).toHaveLength(5);
    expect(() => authorizeNativeFiniteSession({ ...options, profile, expectedClientIdentity }))
      .toThrow('FINITE_SESSION_BINDING_INVALID');
    expect(() => authorizeNativeFiniteSession({ ...options, profile, expectedClientIdentity,
      operation: { operation: 'guarded-recover', target: 'result.bin', trustedReceipt: {} } }))
      .toThrow('FINITE_PROTECTED_ACTIVATION_ROOT_INVALID');
    expect(fs.existsSync(options.enrollmentFile)).toBe(false);
  });

  describe('protected workflow qualification profile', () => {
    const protectedDirectory = 'C:\\Program Files\\AexosGovernedPublication-workflow-v3';
    const protectedActivation = path.join(protectedDirectory, 'activation.json');
    const workflowAuthority = { agentId: 'dev', task: 'dev-develop-story', story: 'FIXTURE-1' };
    const workflowOperation = {
      operation: 'guarded-recoverable-replace', target: 'app.cjs', contentBase64: 'YWJj',
    };

    function workflowOptions(slotId = 1) {
      const candidate = inspectNativeCandidateIdentity();
      const manifestSha256 = 'd'.repeat(64);
      const profile = {
        ...options.profile, version: 3, mode: 'protected-workflow-qualification', slotId,
        activationFile: protectedActivation, manifestSha256, serverImageSha256: 'e'.repeat(64),
      };
      const activation = JSON.stringify({ manifestSha256, manifest: {
        version: 3, mode: profile.mode, activationId: profile.activationId,
        activationFile: protectedActivation, runtimeSha256: profile.serverImageSha256,
        ordinaryRuntimeSha256: candidate.hashes.executableSha256,
        helperSha256: candidate.hashes.helperSha256, launcherSha256: candidate.hashes.launcherSha256,
        nodeSha256: crypto.createHash('sha256').update(fs.readFileSync(process.execPath)).digest('hex'),
      } });
      return { ...options, profile, operation: workflowOperation, authority: workflowAuthority,
        expectedClientIdentity: inspectFiniteClientIdentity(profile.mode), activation };
    }

    function virtualActivation(raw, run) {
      const originalRealpath = fs.realpathSync.native;
      const originalLstat = fs.lstatSync;
      const originalStat = fs.statSync;
      const originalRead = fs.readFileSync;
      const realpath = jest.spyOn(fs.realpathSync, 'native').mockImplementation((value) => {
        if (value === protectedDirectory || value === protectedActivation) return value;
        return originalRealpath(value);
      });
      const lstat = jest.spyOn(fs, 'lstatSync').mockImplementation((value, settings) => {
        if (value === protectedActivation) return {
          isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false,
          nlink: settings?.bigint ? 1n : 1, size: settings?.bigint ? BigInt(Buffer.byteLength(raw.value)) : Buffer.byteLength(raw.value),
          dev: settings?.bigint ? 7n : 7, ino: settings?.bigint ? 17n : 17,
        };
        if (value === protectedDirectory || value === 'C:\\Program Files') return {
          isFile: () => false, isDirectory: () => true, isSymbolicLink: () => false,
        };
        return originalLstat(value, settings);
      });
      const stat = jest.spyOn(fs, 'statSync').mockImplementation((value, settings) => {
        if (value === protectedDirectory) return {
          dev: settings?.bigint ? 7n : 7, ino: settings?.bigint ? 11n : 11,
        };
        return originalStat(value, settings);
      });
      const read = jest.spyOn(fs, 'readFileSync').mockImplementation((value, settings) => {
        if (value === protectedActivation) return settings ? raw.value : Buffer.from(raw.value);
        return originalRead(value, settings);
      });
      try { return run({ read, originalRead }); }
      finally { read.mockRestore(); stat.mockRestore(); lstat.mockRestore(); realpath.mockRestore(); }
    }

    test('accepts only the explicit V3 pair, two slots, app target and fixed authority', () => {
      const configured = workflowOptions();
      virtualActivation({ value: configured.activation }, () => {
        expect(claim(authorizeNativeFiniteSession(configured), workflowOperation, workflowAuthority)).toBeTruthy();
        for (const profile of [
          { ...configured.profile, version: 2 },
          { ...configured.profile, mode: 'protected-qualification' },
          { ...configured.profile, slotId: 0 },
          { ...configured.profile, slotId: 3 },
          { ...configured.profile, unexpected: true },
          { ...configured.profile, serverStarted: Number(configured.profile.serverStarted) },
        ]) expect(() => authorizeNativeFiniteSession({ ...configured, profile })).toThrow('FINITE_SESSION_PROFILE_INVALID');
        expect(() => authorizeNativeFiniteSession({ ...configured,
          operation: { ...workflowOperation, target: 'target.bin' } })).toThrow('FINITE_SESSION_BINDING_INVALID');
        expect(() => authorizeNativeFiniteSession({ ...configured,
          operation: { operation: 'guarded-recover', target: 'app.cjs', trustedReceipt: {} } }))
          .toThrow('FINITE_SESSION_BINDING_INVALID');
        expect(() => authorizeNativeFiniteSession({ ...configured,
          authority: { ...workflowAuthority, task: 'finite' } })).toThrow('FINITE_SESSION_BINDING_INVALID');
      });
    });

    test('rejects foreign roots, serialized/replayed grants, expiry and post-mint activation drift', () => {
      const configured = workflowOptions(2);
      const raw = { value: configured.activation };
      virtualActivation(raw, () => {
        const foreign = fs.mkdtempSync(path.join(fixture, 'foreign-'));
        const token = authorizeNativeFiniteSession(configured);
        expect(verifyNativeFiniteSessionAuthorization(token, foreign)).toBe('FINITE_SESSION_ROOT_CHANGED');
        expect(() => claim(JSON.parse(JSON.stringify(token)), workflowOperation, workflowAuthority))
          .toThrow('FINITE_SESSION_AUTHORIZATION_REQUIRED');
        expect(claim(token, workflowOperation, workflowAuthority)).toBeTruthy();
        expect(() => claim(token, workflowOperation, workflowAuthority)).toThrow('FINITE_SESSION_CONSUMED');

        const changed = authorizeNativeFiniteSession(configured);
        raw.value = configured.activation.replace('"version":3', '"version":2');
        expect(verifyNativeFiniteSessionAuthorization(changed, root)).toBe('FINITE_SESSION_ACTIVATION_CHANGED');
        raw.value = configured.activation;

        const now = Date.now();
        const monotonic = performance.now();
        const wallSpy = jest.spyOn(Date, 'now').mockReturnValue(now);
        const monotonicSpy = jest.spyOn(performance, 'now').mockReturnValue(monotonic);
        const wallExpired = authorizeNativeFiniteSession({ ...configured, ttlMs: 10 });
        wallSpy.mockReturnValue(now + 11);
        expect(verifyNativeFiniteSessionAuthorization(wallExpired, root)).toBe('FINITE_SESSION_EXPIRED');
        wallSpy.mockReturnValue(now);
        const monotonicExpired = authorizeNativeFiniteSession({ ...configured, ttlMs: 10 });
        monotonicSpy.mockReturnValue(monotonic + 11);
        expect(verifyNativeFiniteSessionAuthorization(monotonicExpired, root)).toBe('FINITE_SESSION_EXPIRED');
        monotonicSpy.mockRestore(); wallSpy.mockRestore();
      });
    });

    test('rejects post-mint protected client source drift', () => {
      const configured = workflowOptions();
      virtualActivation({ value: configured.activation }, ({ read, originalRead }) => {
        const token = authorizeNativeFiniteSession(configured);
        const source = path.resolve(__dirname,
          '../../../.aexos-core/core/permissions/windows-publication-protected-relay.cs');
        read.mockImplementation((value, settings) => value === source
          ? Buffer.concat([originalRead(value), Buffer.from('\n')]) : originalRead(value, settings));
        expect(verifyNativeFiniteSessionAuthorization(token, root)).toBe('FINITE_SESSION_SOURCE_CHANGED');
      });
    });
  });
});
