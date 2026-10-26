'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AgentRuntime } = require(path.resolve(__dirname, '../../../.aexos-core/core/execution/agent-runtime'));
const { createWorkflowControlStore } = require(path.resolve(__dirname, '../../../.aexos-core/core/execution/workflow-control-store'));
const { CapabilityBroker } = require(path.resolve(__dirname, '../../../.aexos-core/core/permissions/capability-broker'));
const { createDispatchGovernance } = require(path.resolve(__dirname, '../../../.aexos-core/core/permissions/dispatch-governance'));
const { sha256 } = require(path.resolve(__dirname, '../../../.aexos-core/core/permissions/guarded-publication-protocol'));
const { authorizeNativeCandidateValidation, inspectNativeCandidateIdentity, PRODUCTION_SUPPORT_ALLOWLIST }
  = require(path.resolve(__dirname, '../../../.aexos-core/core/permissions/native-publication-support'));

const nativeDescribe = process.platform === 'win32' && os.release() === '10.0.26300' ? describe : describe.skip;
nativeDescribe('default-disabled Windows publication and trusted candidate validation', () => {
  let root, ancestorRoot, receiptRoot, broker, observer, receipts, control;
  beforeEach(() => {
    ancestorRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-native-'));
    root = path.join(ancestorRoot, 'workspace'); fs.mkdirSync(root);
    receiptRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-receipts-'));
    fs.mkdirSync(path.join(root, '.aexos'));
    fs.writeFileSync(path.join(root, '.aexos/config.yaml'), 'permissions:\n  mode: auto\n');
    fs.mkdirSync(path.join(root, 'docs/stories'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs/stories/native.md'), '# Story AEX-4.28\n\n## Status\n\nReady\n');
    broker = new CapabilityBroker({ policy: () => true });
    control = createWorkflowControlStore(receiptRoot, root);
    observer = undefined; receipts = [];
  });
  afterEach(() => {
    fs.rmSync(ancestorRoot, { recursive: true, force: true });
    fs.rmSync(receiptRoot, { recursive: true, force: true });
  });
  const create = (target = 'target.bin', bytes = Buffer.from([0, 255, 128, 42])) => ({ operation: 'guarded-create', target, contentBase64: bytes.toString('base64') });
  function authorization(projectRoot = root, ttlMs = 60_000) {
    return authorizeNativeCandidateValidation({ projectRoot, ttlMs, purpose: 'candidate-validation', expectedIdentity: inspectNativeCandidateIdentity() });
  }
  async function execute(operation, overrides = {}, options = {}) {
    const identity = { agentId: 'dev', task: 'native', capability: 'filesystem', resource: path.join(root, operation.target), scope: root };
    const lease = broker.grant({ ...identity, actions: [operation.operation] });
    const instance = new AgentRuntime({ projectRoot: root, provider: { execute: async () => ({ success: false }) },
      capabilityBroker: broker, nativePhaseObserver: observer, nativeValidationAuthorization: authorization(),
      trustedPublicationAccounting: control.trustedPublicationAccounting, trustedReceiptResolver: control.resolvePreparedReceipt,
      trustedReceiptSink: async (receipt) => { const ack = await control.retainPreparedReceipt(receipt); receipts.push(receipt); return ack; }, ...options });
    return instance.execute({ agentId: 'dev', task: 'native', prompt: 'test native operation', story: 'docs/stories/native.md',
      requiresStory: true, budgetCeilingUsd: 1, filesystemOperation: operation,
      requiredCapabilities: [{ ...identity, action: operation.operation, token: lease.token }], ...overrides });
  }
  test('ordinary governed runtime remains disabled before native invocation', async () => {
    observer = jest.fn();
    expect(Object.isFrozen(PRODUCTION_SUPPORT_ALLOWLIST)).toBe(true); expect(PRODUCTION_SUPPORT_ALLOWLIST).toHaveLength(0);
    expect((await execute(create(), {}, { nativeValidationAuthorization: undefined })).filesystemResult)
      .toMatchObject({ code: 'NATIVE_SUPPORT_DISABLED', phase: 'UNSUPPORTED_BEFORE_MUTATION' });
    expect(observer).not.toHaveBeenCalled(); expect(fs.existsSync(path.join(root, '.aexos-transactions'))).toBe(false);
  });
  test('forged, expired and wrong-root authorizations cannot invoke helper', async () => {
    observer = jest.fn(); const expired = authorization(root, 1);
    await new Promise((resolve) => setTimeout(resolve, 5)); fs.mkdirSync(path.join(ancestorRoot, 'other'));
    for (const [value, code] of [[{}, 'NATIVE_SUPPORT_DISABLED'], [expired, 'VALIDATION_AUTHORIZATION_EXPIRED'],
      [authorization(path.join(ancestorRoot, 'other')), 'VALIDATION_ROOT_MISMATCH']]) {
      expect((await execute(create(), {}, { nativeValidationAuthorization: value })).filesystemResult.code).toBe(code);
    }
    expect(observer).not.toHaveBeenCalled();
  });
  test('wrong hashes, runtime tuple and purpose cannot mint a brand', () => {
    for (const field of ['helperSha256', 'launcherSha256', 'executableSha256']) {
      const expectedIdentity = structuredClone(inspectNativeCandidateIdentity()); expectedIdentity.hashes[field] = '0'.repeat(64);
      expect(() => authorizeNativeCandidateValidation({ projectRoot: root, purpose: 'candidate-validation', expectedIdentity })).toThrow('VALIDATION_IDENTITY_MISMATCH');
    }
    const expectedIdentity = structuredClone(inspectNativeCandidateIdentity()); expectedIdentity.tuple.powershellVersion = '7.0.0';
    expect(() => authorizeNativeCandidateValidation({ projectRoot: root, purpose: 'candidate-validation', expectedIdentity })).toThrow('VALIDATION_IDENTITY_MISMATCH');
    expect(() => authorizeNativeCandidateValidation({ projectRoot: root, purpose: 'production', expectedIdentity })).toThrow('INVALID_VALIDATION_AUTHORIZATION');
    expect(() => authorizeNativeCandidateValidation({ projectRoot: path.resolve(__dirname, '../../..'), purpose: 'candidate-validation', expectedIdentity })).toThrow('VALIDATION_ROOT_NOT_ISOLATED');
  });
  test('operation fields and serialized brands cannot authorize native validation', async () => {
    expect((await execute({ ...create(), nativeValidationAuthorization: {} })).filesystemResult.code).toBe('INVALID_PROTOCOL');
    expect((await execute(create(), {}, { nativeValidationAuthorization: JSON.parse(JSON.stringify(authorization())) })).filesystemResult.code).toBe('NATIVE_SUPPORT_DISABLED');
  });
  test('forged finite sessions cannot select another transport or create transaction artifacts', async () => {
    observer = jest.fn();
    for (const value of [{}, null, { mode: 'protected' }]) {
      expect((await execute(create(), {}, { nativeFiniteSessionAuthorization: value })).filesystemResult.code)
        .toBe('FINITE_SESSION_AUTHORIZATION_REQUIRED');
    }
    expect(observer).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(root, '.aexos-transactions'))).toBe(false);
  });
  test('candidate publication uses real governance and binary native create, never production support', async () => {
    const operation = create(); const result = await execute(operation);
    expect(result.filesystemResult).toMatchObject({ success: true, phase: 'VERIFIED', productionEnabled: false, receipt: { nativeMode: 'experimental-candidate' } });
    expect(fs.readFileSync(path.join(root, operation.target))).toEqual(Buffer.from(operation.contentBase64, 'base64'));
    expect(receipts[0].prepared.runtimeIdentity).toMatchObject({ powershellVersion: '7.6.5', executableSha256: inspectNativeCandidateIdentity().hashes.executableSha256 });
    expect((await execute(operation)).filesystemResult.code).toBe('RECOVERY_REQUIRED');
  }, 90_000);
  test('unavailable full security fidelity denies replacement before any retained mutation', async () => {
    const operation = create(); expect((await execute(operation)).success).toBe(true);
    const ledger = path.join(root, '.aexos-transactions');
    const previousLedger = fs.readdirSync(ledger);
    const previousRoot = fs.readdirSync(root);
    const previousReceipts = receipts.length;
    const beforeBytes = fs.readFileSync(path.join(root, operation.target));
    const before = fs.statSync(path.join(root, operation.target), { bigint: true });
    observer = jest.fn();
    const result = await execute({ operation: 'guarded-recoverable-replace', target: operation.target, contentBase64: 'bmV3',
      isolatedWorkspace: true, allowAbsentName: true, expectedBefore: { identity: receipts[0].prepared.stageIdentity, sha256: sha256(Buffer.from(operation.contentBase64, 'base64')) } });
    expect(result.filesystemResult).toMatchObject({ success: false, phase: 'UNSUPPORTED_BEFORE_MUTATION',
      code: 'FULL_SECURITY_OPEN_NATIVE_1314', productionEnabled: false,
      effects: { transactionDirectory: false, staging: false, backup: false, journal: false,
        parked: false, destination: false, retainedArtifactsMayExist: false, originalNameMayBeAbsent: false },
      receipt: { preparedReceipt: null } });
    expect(observer).not.toHaveBeenCalled();
    expect(receipts).toHaveLength(previousReceipts);
    expect(fs.readdirSync(ledger)).toEqual(previousLedger);
    expect(fs.readdirSync(root)).toEqual(previousRoot);
    expect(fs.readFileSync(path.join(root, operation.target))).toEqual(beforeBytes);
    const after = fs.statSync(path.join(root, operation.target), { bigint: true });
    expect({ dev: after.dev, ino: after.ino }).toEqual({ dev: before.dev, ino: before.ino });
  }, 90_000);
  test.each(['BEFORE_RESERVATION', 'STAGED', 'prepared', 'RECEIPT_ACKNOWLEDGED', 'PUBLISHED', 'VERIFIED'])(
    'real candidate create termination at %s preserves honest effects', async (barrier) => {
      observer = async (frame, controls) => { if ((barrier === 'prepared' && frame.type === 'prepared') || frame.value?.phase === barrier) controls.terminate(); };
      const result = await execute(create()); expect(result.success).toBe(false);
      expect(fs.existsSync(path.join(root, 'target.bin'))).toBe(['PUBLISHED', 'VERIFIED'].includes(barrier));
      expect(result.filesystemResult.effects.transactionArtifactsMayExist).toBe(true);
    }, 90_000);
  test('permission revocation after receipt acknowledgment prevents publication', async () => {
    observer = async (frame) => { if (frame.value?.phase === 'RECEIPT_ACKNOWLEDGED') fs.writeFileSync(path.join(root, '.aexos/config.yaml'), 'permissions:\n  mode: explore\n'); };
    const result = await execute(create()); expect(result.success).toBe(false);
    expect(fs.existsSync(path.join(root, 'target.bin'))).toBe(false); expect(result.filesystemResult.receipt.preparedReceipt).toBeTruthy();
  }, 90_000);
  test('pinned ancestry rejects ancestor, project and parent renames', async () => {
    fs.mkdirSync(path.join(root, 'nested')); let checked = false;
    observer = async (frame) => { if (frame.value?.phase !== 'BEFORE_RESERVATION') return;
      for (const source of [ancestorRoot, root, path.join(root, 'nested')]) expect(() => fs.renameSync(source, `${source}-moved`)).toThrow(); checked = true; };
    expect((await execute(create('nested/data.bin'))).success).toBe(true); expect(checked).toBe(true);
  }, 90_000);
  test('actual permission, story, budget and lease denials prevent helper invocation', async () => {
    observer = jest.fn();
    await expect(execute(create(), { budgetCeilingUsd: 0 })).rejects.toMatchObject({ code: 'DISPATCH_BUDGET_REQUIRED' });
    await expect(execute(create(), { story: 'missing.md' })).rejects.toMatchObject({ code: 'DISPATCH_STORY_REQUIRED' });
    await expect(execute(create(), { requiredCapabilities: [] })).rejects.toMatchObject({ code: 'FILESYSTEM_CAPABILITY_REQUIRED' });
    fs.writeFileSync(path.join(root, '.aexos/config.yaml'), 'permissions:\n  mode: explore\n');
    expect((await execute(create())).filesystemResult.code).toBe('PERMISSION_REQUIRED'); expect(observer).not.toHaveBeenCalled();
  });
  test('content bound rejects oversized input and publishes exactly 4 MiB candidate bytes', async () => {
    observer = jest.fn(); expect((await execute(create('large.bin', Buffer.alloc(4 * 1024 * 1024 + 1)))).filesystemResult.code).toBe('CONTENT_LIMIT_OR_ENCODING');
    expect(observer).not.toHaveBeenCalled(); const bytes = Buffer.alloc(4 * 1024 * 1024, 193);
    expect((await execute(create('large.bin', bytes))).success).toBe(true); expect(sha256(fs.readFileSync(path.join(root, 'large.bin')))).toBe(sha256(bytes));
  }, 90_000);
  test.each(['ledger', 'transaction'])('moving retained %s cannot reset external inventory', async (which) => {
    expect((await execute(create())).success).toBe(true); const ledger = path.join(root, '.aexos-transactions');
    fs.renameSync(which === 'ledger' ? ledger : path.join(ledger, receipts[0].transactionId), path.join(root, 'moved-retained'));
    expect((await execute(create('second.bin'))).success).toBe(false); expect(fs.existsSync(path.join(root, 'second.bin'))).toBe(false);
    if (which === 'ledger') expect(fs.existsSync(ledger)).toBe(false);
  }, 90_000);
  test('two native creators have exactly one winner', async () => {
    const results = await Promise.all(['one', 'two'].map((text) => execute(create('winner.bin', Buffer.from(text)))));
    expect(results.filter((result) => result.success)).toHaveLength(1);
  }, 90_000);

  // Synthetic retained states prove rejection only. Full-security access blocks positive replacement/recovery on this host.
  async function syntheticRetainedFixture() {
    observer = async (frame, controls) => { if (frame.value?.phase === 'RECEIPT_ACKNOWLEDGED') controls.terminate(); };
    await execute(create('target.bin', Buffer.from('new'))); observer = undefined;
    const anchor = structuredClone(receipts[0]); const directory = path.join(root, '.aexos-transactions', anchor.transactionId);
    const parked = path.join(directory, 'parked.bin'); fs.writeFileSync(parked, 'original'); fs.writeFileSync(path.join(directory, 'backup.bin'), 'original');
    const identity = (file) => { const stat = fs.statSync(file, { bigint: true }); return `${stat.dev}:${stat.ino >> 32n}:${stat.ino & 0xffffffffn}`; };
    anchor.prepared.beforeIdentity = identity(parked); anchor.prepared.beforeSha256 = sha256(Buffer.from('original'));
    anchor.prepared.backupIdentity = identity(path.join(directory, 'backup.bin')); anchor.prepared.absentNameInterval = true;
    const bytes = Buffer.from(JSON.stringify(anchor.prepared)); fs.writeFileSync(path.join(directory, 'prepared.json'), bytes);
    anchor.preparedSha256 = sha256(bytes); fs.writeFileSync(path.join(receiptRoot, `${anchor.transactionId}.prepared.json`), JSON.stringify(anchor));
    fs.writeFileSync(path.join(directory, '001-ORIGINAL_PARKED.json'), JSON.stringify({ version: 1, transactionId: anchor.transactionId, phase: 'ORIGINAL_PARKED', previous: anchor.preparedSha256 }));
    return { anchor, directory, parked, stage: path.join(root, anchor.prepared.stageName) };
  }
  test('unavailable full security during recovery retains conflict state and effects', async () => {
    const fixture = await syntheticRetainedFixture();
    const result = await execute({ operation: 'guarded-recover', target: 'target.bin', trustedReceipt: fixture.anchor });
    expect(result.filesystemResult).toMatchObject({ success: false, code: 'FULL_SECURITY_OPEN_NATIVE_1314',
      phase: 'RECOVERY_CONFLICT', effects: { transactionDirectory: true, staging: true, journal: true,
        retainedArtifactsMayExist: true, originalNameMayBeAbsent: true } });
    expect(fs.readFileSync(fixture.parked, 'utf8')).toBe('original');
    expect(fs.existsSync(path.join(root, 'target.bin'))).toBe(false);
  }, 90_000);
  test.each(['missing', 'identity', 'bytes', 'ADS', 'hardlink'])('synthetic retained stage %s tamper blocks real recovery', async (tamper) => {
    const fixture = await syntheticRetainedFixture();
    if (tamper === 'missing') fs.unlinkSync(fixture.stage);
    if (tamper === 'identity') { fs.renameSync(fixture.stage, `${fixture.stage}.retained`); fs.writeFileSync(fixture.stage, 'new'); }
    if (tamper === 'bytes') fs.writeFileSync(fixture.stage, 'altered');
    if (tamper === 'ADS') fs.writeFileSync(`${fixture.stage}:extra`, 'extra');
    if (tamper === 'hardlink') fs.linkSync(fixture.stage, `${fixture.stage}.link`);
    const result = await execute({ operation: 'guarded-recover', target: 'target.bin', trustedReceipt: fixture.anchor });
    expect(result.filesystemResult).toMatchObject({ success: false, phase: 'RECOVERY_CONFLICT', effects: { retainedArtifactsMayExist: true, originalNameMayBeAbsent: true } });
    expect(result.filesystemResult.code).toBe({ missing: 'NATIVE_2', identity: 'STAGE_MISMATCH', bytes: 'STAGE_MISMATCH', ADS: 'ADS_DENIED', hardlink: 'KIND_DENIED' }[tamper]);
    expect(fs.readFileSync(fixture.parked, 'utf8')).toBe('original'); expect(fs.existsSync(path.join(root, 'target.bin'))).toBe(false);
  }, 90_000);
  test.each(['schema', 'sequence', 'order', 'reservation'])('synthetic journal %s tamper blocks real recovery', async (tamper) => {
    const fixture = await syntheticRetainedFixture(); const phase = path.join(fixture.directory, '001-ORIGINAL_PARKED.json');
    if (tamper === 'schema') { const record = JSON.parse(fs.readFileSync(phase)); record.version = 2; fs.writeFileSync(phase, JSON.stringify(record)); }
    if (tamper === 'sequence') fs.renameSync(phase, path.join(fixture.directory, '002-ORIGINAL_PARKED.json'));
    if (tamper === 'order') { const record = JSON.parse(fs.readFileSync(phase)); record.phase = 'VERIFIED'; fs.unlinkSync(phase); fs.writeFileSync(path.join(fixture.directory, '001-VERIFIED.json'), JSON.stringify(record)); }
    if (tamper === 'reservation') fs.writeFileSync(path.join(fixture.directory, 'reservation.json'), '{}');
    const result = await execute({ operation: 'guarded-recover', target: 'target.bin', trustedReceipt: fixture.anchor });
    expect(result.filesystemResult.code).toBe({ schema: 'PHASE_SCHEMA_MISMATCH', sequence: 'PHASE_SEQUENCE_MISMATCH', order: 'PHASE_ORDER_MISMATCH', reservation: 'RESERVATION_MISMATCH' }[tamper]);
    expect(result.success).toBe(false); expect(fs.readFileSync(fixture.parked, 'utf8')).toBe('original');
  }, 90_000);
  test('real timeout returns conservative effects without waiting for stalled trusted callback', async () => {
    observer = async (frame) => { if (frame.value?.phase === 'RECEIPT_ACKNOWLEDGED') await new Promise(() => {}); };
    const governance = createDispatchGovernance();
    const settle = jest.spyOn(governance, 'settle');
    const started = Date.now();
    const result = await execute(create(), {}, { governanceController: governance });
    expect(Date.now() - started).toBeLessThan(40_000);
    expect(result).toMatchObject({ success: false, error: { code: 'DISPATCH_TOKEN_EXPIRED' } });
    expect(result.filesystemResult).toMatchObject({ success: false, code: 'NATIVE_INTERRUPTED',
      phase: 'RECOVERY_REQUIRED', transactionId: expect.any(String),
      effects: { transactionArtifactsMayExist: true, destinationMayExist: true },
      receipt: expect.any(Object) });
    expect(fs.existsSync(path.join(root, 'target.bin'))).toBe(false);
    expect(settle).toHaveBeenCalledTimes(1);
    expect(settle.mock.results[0].value.reservedUsd).toBe(0);
  }, 90_000);
});
