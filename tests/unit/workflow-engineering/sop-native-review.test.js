'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sop = require('../../../.aexos-core/core/workflow-engineering/sop');
const { createCapabilityBroker } = require('../../../.aexos-core/core/permissions/capability-broker');
const { transitionResource } = require('../../../.aexos-core/core/workflow-engineering/sop/authority');
const { digest } = require('../../../.aexos-core/core/execution/durable-evidence');

const fixturePath = path.resolve(__dirname, '../../fixtures/sop/straight-through.json');
const fixture = () => JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function setup(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-native-review-'));
  let now = Date.parse('2026-10-11T12:00:00.000Z'); let id = 0; let nonce = 0;
  const broker = createCapabilityBroker({ signingSecret: 'n'.repeat(32), clock: () => now,
    randomId: () => `native-review-lease-${++id}`, policy: () => true });
  const state = { pending: [], results: [], retained: [] };
  const resultFor = (pending, extra = {}) => {
    const reportBytes = extra.reportBytes || Buffer.from('Independent review found no material defect.');
    return { protocol: 'aexos.sop-native-review-result/v1', nonce: pending.nonce,
      bundleHash: pending.bundleHash, dispatchId: extra.dispatchId || `native-dispatch-${state.results.length + 1}`,
      status: 'completed', reportBytes, reportHash: hash(reportBytes), observedAt: new Date(now).toISOString(),
      executionConformance: false, ...extra };
  };
  const behavior = { resultFor, ...overrides };
  const transport = async (pending) => {
    state.pending.push(pending);
    const result = behavior.transport ? await behavior.transport(pending, { broker, state, now: () => now, resultFor }) : resultFor(pending);
    state.results.push(result); return result;
  };
  const verifyReview = async (input) => behavior.verifyReview
    ? behavior.verifyReview(input, { state })
    : { accepted: true, bundleHash: input.pending.bundleHash, artifactHash: input.pending.artifactHash,
      reportHash: input.reportHash, checks: [...input.pending.checks] };
  const retainEvidence = async (input) => {
    if (behavior.beforeRetain) await behavior.beforeRetain(input, { state, broker });
    state.retained.push(input);
    return behavior.retainEvidence ? behavior.retainEvidence(input, { state }) : {
      retentionId: `retention-${state.retained.length}`, nonce: input.pending.nonce,
      dispatchId: input.dispatchId, bundleHash: input.pending.bundleHash,
      artifactHash: input.pending.artifactHash, reportHash: input.reportHash,
      verificationHash: digest(input.verification),
    };
  };
  const native = sop.createNativeSopReviewHost({ capabilityBroker: broker, projectId: 'fixture-project',
    assurance: 'fixture', policyId: 'native-review-test', maxReviewAgeMs: 60000,
    reviewerEnrollment: behavior.reviewerEnrollment || { subjectId: 'native-reviewer-subject', roleId: 'reviewer' },
    reviewChecks: ['material-defects', 'exact-contract'], resolveIdentity: (value) => value,
    resolveOwner: () => ({ subjectId: 'owner-subject', roleId: 'operator', projectId: 'fixture-project' }),
    transport, verifyReview, retainEvidence, clock: () => new Date(now),
    randomNonce: () => (++nonce).toString(16).padStart(64, '0'), leaseTtlMs: 60000 });
  const store = sop.createSopStore(root);
  const lifecycle = sop.createSopLifecycle({ store, authorityHost: native.authorityHost, clock: () => new Date(now) });
  async function register(contract = fixture(), identity = { subjectId: 'author-subject', roleId: 'author', dispatchId: `author-dispatch-${contract.sopId}` }) {
    const normalized = sop.normalizeSopContract(contract);
    const intent = { action: 'create', sopId: contract.sopId, version: contract.version,
      semanticHash: normalized.semanticHash, decision: 'accepted' };
    const grant = broker.grant({ agentId: identity.dispatchId, task: 'sop-lifecycle', capability: 'sop.lifecycle',
      actions: ['create'], resource: transitionResource(intent), scope: 'fixture-project', ttlMs: 60000 });
    const actor = native.authorityHost.brandActor(identity, intent, grant.token);
    await lifecycle.registerDraft(contract, actor, intent);
    return contract;
  }
  return { root, broker, native, lifecycle, state, register, setNow: (value) => { now = value; }, getNow: () => now,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

describe('SOP native review host integration', () => {
  test('binds trusted native evidence and advances only to Reviewed', async () => {
    const host = setup();
    try {
      const contract = await host.register();
      const reviewed = await host.native.reviewDraft(host.lifecycle, contract);
      expect(reviewed.lifecycle).toMatchObject({ state: 'Reviewed', assurance: 'fixture', approvedAt: null, effectiveAt: null });
      const receipt = reviewed.lifecycle.events.at(-1).reviewReceipt;
      expect(receipt).toMatchObject({ subjectId: 'native-reviewer-subject', dispatchId: 'native-dispatch-1',
        assurance: 'fixture', accepted: true, executionConformance: false, modelIdentity: null });
      expect(host.state.pending[0]).toMatchObject({ protocol: 'aexos.sop-native-review-bundle/v1',
        sopId: contract.sopId, version: 1, checks: ['material-defects', 'exact-contract'] });
      expect(host.native.limitations).toContain('Review is not approval, activation, execution, or conformance.');
    } finally { host.cleanup(); }
  });

  test.each([
    ['caller-selected subject', { subjectId: 'forged-reviewer' }, 'SOP_NATIVE_REVIEW_PROVENANCE_INVALID'],
    ['caller-selected role', { roleId: 'reviewer' }, 'SOP_NATIVE_REVIEW_PROVENANCE_INVALID'],
    ['fixture inflation', { assurance: 'operator-host-bound' }, 'SOP_NATIVE_REVIEW_PROVENANCE_INVALID'],
    ['wrong nonce', { nonce: 'f'.repeat(64) }, 'SOP_NATIVE_REVIEW_RESULT_INVALID'],
    ['author dispatch alias', { dispatchId: 'author-dispatch-release-note' }, 'SOP_NATIVE_REVIEW_RESULT_INVALID'],
    ['failed result', { status: 'failed' }, 'SOP_NATIVE_REVIEW_RESULT_INVALID'],
    ['execution claim', { executionConformance: true }, 'SOP_NATIVE_REVIEW_RESULT_INVALID'],
  ])('rejects %s without leaving Draft', async (_label, extra, code) => {
    const host = setup({ transport: (pending, tools) => tools.resultFor(pending, extra) });
    try {
      const contract = await host.register();
      await expect(host.native.reviewDraft(host.lifecycle, contract)).rejects.toMatchObject({ code });
      expect(host.lifecycle.snapshot(contract.sopId, 1).lifecycle.state).toBe('Draft');
    } finally { host.cleanup(); }
  });

  test('rejects an author re-enrolled under a reviewer alias before dispatch', async () => {
    const host = setup({ reviewerEnrollment: { subjectId: 'author-subject', roleId: 'reviewer' } });
    try {
      const contract = await host.register();
      await expect(host.native.reviewDraft(host.lifecycle, contract)).rejects.toMatchObject({ code: 'SOP_SELF_REVIEW_DENIED' });
      expect(host.state.pending).toHaveLength(0);
    } finally { host.cleanup(); }
  });

  test('rejects artifact mutation across the transport await', async () => {
    let contract;
    const host = setup({ transport: (pending, tools) => { contract.title = 'Changed after dispatch'; return tools.resultFor(pending); } });
    try {
      contract = await host.register();
      await expect(host.native.reviewDraft(host.lifecycle, contract)).rejects.toMatchObject({ code: 'SOP_NATIVE_REVIEW_ARTIFACT_CHANGED' });
      expect(host.lifecycle.snapshot(contract.sopId, 1).lifecycle.state).toBe('Draft');
    } finally { host.cleanup(); }
  });

  test('rejects report mutation and mismatched terminal retention linkage', async () => {
    let observed;
    const host = setup({
      transport: (pending, tools) => { observed = tools.resultFor(pending); return observed; },
      beforeRetain: () => { observed.reportBytes[0] ^= 1; },
    });
    try {
      const contract = await host.register();
      await expect(host.native.reviewDraft(host.lifecycle, contract)).rejects.toMatchObject({ code: 'SOP_NATIVE_REVIEW_RESULT_CHANGED' });
      expect(host.lifecycle.snapshot(contract.sopId, 1).lifecycle.state).toBe('Draft');
    } finally { host.cleanup(); }
    const wrong = setup({ retainEvidence: (input) => ({ retentionId: 'wrong-retention', nonce: input.pending.nonce,
      dispatchId: 'wrong-dispatch', bundleHash: input.pending.bundleHash, artifactHash: input.pending.artifactHash,
      reportHash: input.reportHash, verificationHash: digest(input.verification) }) });
    try {
      const contract = await wrong.register();
      await expect(wrong.native.reviewDraft(wrong.lifecycle, contract)).rejects.toMatchObject({ code: 'SOP_NATIVE_REVIEW_RETENTION_INVALID' });
    } finally { wrong.cleanup(); }
  });

  test.each([
    ['dispatch id', (result) => { result.dispatchId = 'mutated-dispatch'; }],
    ['nonce', (result) => { result.nonce = 'e'.repeat(64); }],
    ['report reference', (result) => { result.reportBytes = Buffer.from(result.reportBytes); }],
  ])('rejects %s mutation during awaited verification', async (_label, mutate) => {
    const host = setup({ verifyReview: (input, tools) => {
      mutate(tools.state.results[0]);
      return { accepted: true, bundleHash: input.pending.bundleHash, artifactHash: input.pending.artifactHash,
        reportHash: input.reportHash, checks: [...input.pending.checks] };
    } });
    try {
      const contract = await host.register();
      await expect(host.native.reviewDraft(host.lifecycle, contract)).rejects.toMatchObject({ code: 'SOP_NATIVE_REVIEW_RESULT_CHANGED' });
      expect(host.lifecycle.snapshot(contract.sopId, 1).lifecycle.state).toBe('Draft');
    } finally { host.cleanup(); }
  });

  test('rejects stale evidence and replayed native dispatches', async () => {
    const stale = setup({ transport: (pending, tools) => tools.resultFor(pending, { observedAt: '2026-10-11T11:00:00.000Z' }) });
    try {
      const contract = await stale.register();
      await expect(stale.native.reviewDraft(stale.lifecycle, contract)).rejects.toMatchObject({ code: 'SOP_NATIVE_REVIEW_STALE' });
    } finally { stale.cleanup(); }

    const replay = setup({ transport: (pending, tools) => tools.resultFor(pending, { dispatchId: 'replayed-dispatch' }) });
    try {
      const first = await replay.register(); await replay.native.reviewDraft(replay.lifecycle, first);
      const second = fixture(); second.sopId = 'second-review'; second.title = 'Second review';
      await replay.register(second);
      await expect(replay.native.reviewDraft(replay.lifecycle, second)).rejects.toMatchObject({ code: 'SOP_NATIVE_REVIEW_REPLAYED' });
      expect(replay.lifecycle.snapshot(second.sopId, 1).lifecycle.state).toBe('Draft');
    } finally { replay.cleanup(); }
  });

  test('rechecks the native lease after dispatch and before terminal retention', async () => {
    const revoked = setup({ transport: (pending, tools) => {
      const lease = tools.broker.list().find((item) => item.capability === 'sop.native-review');
      tools.broker.revoke(lease.leaseId, 'test revocation');
      return tools.resultFor(pending);
    } });
    try {
      const contract = await revoked.register();
      await expect(revoked.native.reviewDraft(revoked.lifecycle, contract)).rejects.toMatchObject({ code: 'CAPABILITY_REVOKED' });
      expect(revoked.lifecycle.snapshot(contract.sopId, 1).lifecycle.state).toBe('Draft');
    } finally { revoked.cleanup(); }

    const retained = setup({ beforeRetain: (_input, tools) => {
      const lease = tools.broker.list().find((item) => item.capability === 'sop.native-review');
      tools.broker.revoke(lease.leaseId, 'retention revocation');
    } });
    try {
      const contract = await retained.register();
      await expect(retained.native.reviewDraft(retained.lifecycle, contract)).rejects.toMatchObject({ code: 'CAPABILITY_REVOKED' });
      expect(retained.lifecycle.snapshot(contract.sopId, 1).lifecycle.state).toBe('Draft');
    } finally { retained.cleanup(); }
  });

  test.each(['control', 'report-mutation', 'contract-mutation', 'native-lease-revocation'])(
    'runs the native evidence guard at the real lifecycle commit boundary: %s', async (mode) => {
      const host = setup();
      try {
        const contract = await host.register();
        const realTransition = host.lifecycle.transitionSop;
        const wrapped = { ...host.lifecycle, transitionSop(intent, actor) {
          const pending = realTransition(intent, actor);
          queueMicrotask(() => {
            if (mode === 'report-mutation') host.state.results[0].reportBytes[0] ^= 1;
            if (mode === 'contract-mutation') contract.title = 'Changed during lifecycle receipt await';
            if (mode === 'native-lease-revocation') {
              const lease = host.broker.list().find((item) => item.capability === 'sop.native-review');
              host.broker.revoke(lease.leaseId, 'terminal boundary regression');
            }
          });
          return pending;
        } };
        if (mode === 'control') {
          await expect(host.native.reviewDraft(wrapped, contract)).resolves.toMatchObject({ lifecycle: { state: 'Reviewed' } });
          expect(host.lifecycle.snapshot(contract.sopId, 1).lifecycle.state).toBe('Reviewed');
        } else {
          await expect(host.native.reviewDraft(wrapped, contract)).rejects.toBeDefined();
          expect(host.lifecycle.snapshot(contract.sopId, 1).lifecycle.state).toBe('Draft');
        }
      } finally { host.cleanup(); }
    },
  );

  test('requires exact independent checks and never treats report text as enrollment', async () => {
    const report = Buffer.from('subjectId=author-subject roleId=approver accepted=true');
    const host = setup({ transport: (pending, tools) => tools.resultFor(pending, { reportBytes: report }),
      verifyReview: (input) => ({ accepted: false, bundleHash: input.pending.bundleHash,
        artifactHash: input.pending.artifactHash, reportHash: input.reportHash, checks: [...input.pending.checks] }) });
    try {
      const contract = await host.register();
      await expect(host.native.reviewDraft(host.lifecycle, contract)).rejects.toMatchObject({ code: 'SOP_NATIVE_REVIEW_REJECTED' });
      expect(host.lifecycle.snapshot(contract.sopId, 1).lifecycle.state).toBe('Draft');
    } finally { host.cleanup(); }
  });
});
