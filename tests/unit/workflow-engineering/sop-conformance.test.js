'use strict';

const { auditConformance, compileSop } = require('../../../.aexos-core/core/workflow-engineering/sop');
const { fixture, testHost, runtimeBundle, seal } = require('./sop-test-host');

describe('SOP exact-run conformance projection', () => {
  let host;
  beforeEach(() => { host = testHost(); });
  afterEach(() => host.cleanup());
  async function setup(contract = fixture()) {
    const snapshot = await host.advance(contract); const bundle = runtimeBundle(snapshot);
    return { snapshot, bundle, run: bundle.run, receipt: bundle.receipts[0] };
  }
  it('retains fixture assurance only with every exact artifact/check/producer obligation', async () => {
    const { snapshot, bundle, run } = await setup();
    await expect(auditConformance(snapshot, run, async () => bundle)).resolves.toMatchObject({ status: 'fixture-conformance', scope: { oneRun: true, environmentId: 'test' } });
    expect(compileSop(snapshot).executable).toBe(false);
    expect(Object.isFrozen(snapshot.contract.steps[0])).toBe(true);
    await expect(auditConformance(structuredClone(snapshot), run, async () => bundle)).rejects.toMatchObject({ code: 'SOP_EFFECTIVE_SNAPSHOT_REQUIRED' });
  });
  it.each([null, [], 'not-a-binding', {}])('reports malformed resolver binding %j without throwing an incidental TypeError', async (binding) => {
    const { snapshot, bundle, run } = await setup(); bundle.bindings[0] = binding;
    await expect(auditConformance(snapshot, run, async () => bundle)).resolves.toMatchObject({ status: 'not-observed', reason: 'TRUSTED_RUN_ASSOCIATION_REQUIRED' });
  });
  it.each([
    ['wrong environment', (r) => { r.environmentId = 'prod'; }, 'RECEIPT_BINDING_MISMATCH'],
    ['fixture origin', (r) => { r.origin = 'fixture'; }, 'RECEIPT_FIXTURE'],
    ['unauthenticated', (r) => { r.trusted = false; }, 'RECEIPT_UNAUTHENTICATED'],
    ['producer absent', (r) => { r.producer = {}; }, 'RECEIPT_PRODUCER_INVALID'],
    ['producer changed', (r) => { r.producer.subjectId = 'stranger'; }, 'RECEIPT_PRODUCER_INVALID'],
    ['artifact changed', (r) => { r.artifact.path = 'other.md'; }, 'RECEIPT_ARTIFACT_INVALID'],
    ['artifact type changed', (r) => { r.artifact.kind = 'json'; }, 'RECEIPT_ARTIFACT_INVALID'],
    ['artifact hash changed', (r) => { r.artifact.hash = 'b'.repeat(64); }, 'RECEIPT_ARTIFACT_INVALID'],
    ['missing receipt identity', (r) => { delete r.receiptId; }, 'RECEIPT_IDENTITY_INVALID'],
    ['unknown status', (r) => { r.status = 'nonsense'; }, 'RECEIPT_STATUS_INVALID'],
    ['future observation', (r) => { r.observedAt = '2099-01-01T00:00:00.000Z'; }, 'RECEIPT_STALE'],
    ['invalid time', (r) => { r.observedAt = 'yesterday'; }, 'RECEIPT_STALE'],
    ['missing check', (r) => { r.acceptance.checks = []; }, 'RECEIPT_ACCEPTANCE_INVALID'],
    ['wrong check', (r) => { r.acceptance.checks[0].definition.type = 'unrelated'; }, 'RECEIPT_CHECKS_INVALID'],
    ['unchecked skip', (r) => { r.status = 'skipped'; r.skipApproval = { authenticated: true }; }, 'ROUTE_DECISION_ADAPTER_UNAVAILABLE'],
  ])('keeps %s evidence not observed under a real verified lifecycle', async (_name, mutate, reason) => {
    const { snapshot, bundle, run } = await setup(); const changed = structuredClone(bundle.receipts[0]); mutate(changed); bundle.receipts[0] = seal(changed);
    const result = await auditConformance(snapshot, run, async () => bundle);
    expect(result.status).toBe('not-observed'); expect(result.steps[0].obligations[0].reasons).toContain(reason);
  });
  it('rejects failed checks despite a passed aggregate and preserves authenticated failures', async () => {
    const { snapshot, bundle, run } = await setup();
    bundle.receipts[0].acceptance.checks[0].passed = false; bundle.receipts[0] = seal(bundle.receipts[0]);
    await expect(auditConformance(snapshot, run, async () => bundle)).resolves.toMatchObject({ status: 'nonconformant' });
    bundle.receipts[0].status = 'failed'; bundle.receipts[0].acceptance.result = 'failed'; bundle.receipts[0] = seal(bundle.receipts[0]);
    await expect(auditConformance(snapshot, run, async () => bundle)).resolves.toMatchObject({ status: 'nonconformant' });
    await expect(auditConformance(snapshot, { ...run, version: 2 }, async () => bundle)).rejects.toMatchObject({ code: 'SOP_RUN_VERSION_MISMATCH' });
  });
  it('requires global obligations and refuses vacuous step success', async () => {
    const contract = fixture(); contract.evidenceObligations.push({ ...structuredClone(contract.evidenceObligations[0]), id: 'global-proof', stepId: null });
    const { snapshot, bundle, run } = await setup(contract); bundle.receipts.pop();
    expect((await auditConformance(snapshot, run, async () => bundle)).status).toBe('not-observed');
    const optional = fixture(); optional.sopId = 'optional-only'; optional.evidenceObligations[0].required = false;
    const second = await host.advance(optional); const empty = runtimeBundle(second);
    const result = await auditConformance(second, empty.run, async () => empty);
    expect(result.status).toBe('not-observed'); expect(result.steps[0].status).toBe('not-observed');
  });
  it('cannot turn fixture origin into production conformance through relaxed policy', async () => {
    const contract = fixture(); contract.conformance.requireRealOrigin = false;
    const { snapshot, bundle, run } = await setup(contract); bundle.receipts[0].origin = 'fixture'; bundle.receipts[0] = seal(bundle.receipts[0]);
    expect((await auditConformance(snapshot, run, async () => bundle)).status).toBe('fixture-conformance');
  });
  it('does not omit canonical step checks or outputs that lack obligations', async () => {
    const contract = fixture();
    contract.steps[0].outputs.push({ name: 'manifest', kind: 'file', path: 'artifacts/manifest.json' });
    contract.steps[0].verify.push({ type: 'file-exists', target: 'artifacts/manifest.json' });
    const { snapshot, bundle, run } = await setup(contract);
    const result = await auditConformance(snapshot, run, async () => bundle);
    expect(result.status).toBe('not-observed'); expect(result.steps[0].reason).toBe('DECLARED_STEP_EVIDENCE_INCOMPLETE');
  });
  it('fails closed on missing resolver, bare receipt arrays, digest drift, and duplicate receipts', async () => {
    const { snapshot, bundle, run } = await setup();
    expect((await auditConformance(snapshot, run, null)).reason).toBe('TRUSTED_RECEIPT_RESOLVER_UNAVAILABLE');
    expect((await auditConformance(snapshot, run, async () => bundle.receipts)).reason).toBe('TRUSTED_RUN_ASSOCIATION_REQUIRED');
    bundle.receipts[0].artifact.hash = 'b'.repeat(64);
    expect((await auditConformance(snapshot, run, async () => bundle)).steps[0].obligations[0].reasons).toContain('RECEIPT_DIGEST_INVALID');
    bundle.receipts.push(bundle.receipts[0]);
    expect((await auditConformance(snapshot, run, async () => bundle)).status).toBe('not-observed');
  });
});
