'use strict';

const fs = require('fs'); const os = require('os'); const path = require('path');
const { createCapabilityBroker } = require('../../../.aexos-core/core/permissions/capability-broker');
const { compileSop, createFixtureSopAuthorityHost, createSopLifecycle, createSopStore,
  normalizeSopContract, transitionResource } = require('../../../.aexos-core/core/workflow-engineering/sop');

const fixture = () => JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../fixtures/sop/straight-through.json'), 'utf8'));

describe('SOP immutable lifecycle and host authority', () => {
  let controlRoot; let now; let counter; let broker; let host; let lifecycle;
  beforeEach(() => {
    controlRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-sop-')); now = Date.parse('2026-10-10T12:00:00.000Z'); counter = 0;
    broker = createCapabilityBroker({ signingSecret: 's'.repeat(32), clock: () => now, randomId: () => `sop-lease-${++counter}`, policy: () => true });
    host = createFixtureSopAuthorityHost({ capabilityBroker: broker, projectId: 'fixture-project', resolveIdentity: (identity) => identity,
      resolveOwner: () => ({ subjectId: 'owner-subject', roleId: 'operator', projectId: 'fixture-project' }),
      resolveReviewReceipt: async (query) => ({ ...query, accepted: true, subjectId: query.reviewerSubjectId,
        dispatchId: query.reviewerSubjectId === 'reviewer-subject' ? 'review-dispatch' : 'hidden-dispatch',
        receiptId: 'review-receipt', observedAt: new Date(now).toISOString(), artifactHash: 'a'.repeat(64), authorSubjectIds: ['author-subject'], assurance: 'fixture' }) });
    lifecycle = createSopLifecycle({ store: createSopStore(controlRoot), authorityHost: host, clock: () => new Date(now) });
  });
  afterEach(() => fs.rmSync(controlRoot, { recursive: true, force: true }));

  function actor(identity, intent, ttlMs = 60_000, selectedHost = host, selectedBroker = broker) {
    const lease = selectedBroker.grant({ agentId: identity.dispatchId, task: 'sop-lifecycle', capability: 'sop.lifecycle', actions: [intent.action], resource: transitionResource(intent), scope: 'fixture-project', ttlMs });
    return selectedHost.brandActor(identity, intent, lease.token);
  }
  function intent(action, contract, extra = {}) { const normalized = normalizeSopContract(contract); return { action, sopId: contract.sopId, version: contract.version, semanticHash: normalized.semanticHash, decision: 'accepted', ...extra }; }
  async function createAndAdvance(contract, through = 'activate') {
    const identities = { create: { subjectId: 'author-subject', roleId: 'author', dispatchId: 'author-dispatch' }, review: { subjectId: 'reviewer-subject', roleId: 'reviewer', dispatchId: 'review-dispatch' }, approve: { subjectId: 'approver-subject', roleId: 'approver', dispatchId: 'approve-dispatch' }, activate: { subjectId: 'activator-subject', roleId: 'activator', dispatchId: 'activate-dispatch' } };
    for (const action of ['create', 'review', 'approve', 'activate']) {
      const selected = intent(action, contract); if (action === 'create') await lifecycle.registerDraft(contract, actor(identities[action], selected), selected); else await lifecycle.transitionSop(selected, actor(identities[action], selected));
      if (action === through) break;
    }
  }

  it('advances only with exact live leases and retains fixture assurance', async () => {
    const contract = fixture(); await createAndAdvance(contract);
    const snapshot = lifecycle.snapshot(contract.sopId, 1); expect(snapshot.lifecycle.state).toBe('Effective'); expect(snapshot.lifecycle.assurance).toBe('fixture');
    expect(lifecycle.history(contract.sopId)).toHaveLength(4);
  });

  it('rejects hidden self-review, wrong broker and expired leases', async () => {
    const contract = fixture(); const create = intent('create', contract); await lifecycle.registerDraft(contract, actor({ subjectId: 'author-subject', roleId: 'author', dispatchId: 'author-dispatch' }, create), create);
    const review = intent('review', contract);
    const self = actor({ subjectId: 'author-subject', roleId: 'reviewer', dispatchId: 'hidden-dispatch' }, review);
    await expect(lifecycle.transitionSop(review, self)).rejects.toMatchObject({ code: 'SOP_SELF_REVIEW_DENIED' });
    const otherBroker = createCapabilityBroker({ signingSecret: 'o'.repeat(32), clock: () => now, randomId: () => 'other-lease', policy: () => true });
    const otherHost = createFixtureSopAuthorityHost({ capabilityBroker: otherBroker, projectId: 'fixture-project', resolveIdentity: (identity) => identity, resolveReviewReceipt: async () => ({}) });
    const wrong = actor({ subjectId: 'reviewer-subject', roleId: 'reviewer', dispatchId: 'review-dispatch' }, review, 1000, otherHost, otherBroker);
    await expect(lifecycle.transitionSop(review, wrong)).rejects.toMatchObject({ code: 'SOP_ACTOR_UNTRUSTED' });
    const expired = actor({ subjectId: 'reviewer-subject', roleId: 'reviewer', dispatchId: 'review-dispatch' }, review, 1); now += 2;
    await expect(lifecycle.transitionSop(review, expired)).rejects.toMatchObject({ code: 'CAPABILITY_EXPIRED' });
  });

  it('compiles an Approved exact snapshot and rejects compiler status as authority', async () => {
    const contract = fixture(); await createAndAdvance(contract, 'approve'); const approved = lifecycle.snapshot(contract.sopId, 1);
    expect(compileSop(approved, { projectRoot: process.cwd() })).toMatchObject({ executable: false, compilationMode: 'approved' });
    expect(() => compileSop({ contract: { ...contract, lifecycleState: 'Approved' }, semanticHash: normalizeSopContract(contract).semanticHash, lifecycle: { approvedAt: now, assurance: 'unverified' } })).toThrow(expect.objectContaining({ code: 'SOP_COMPILATION_AUTHORITY_REQUIRED' }));
  });

  it('creates immutable semantic versions and atomically supersedes the effective version', async () => {
    const first = fixture(); await createAndAdvance(first);
    const second = fixture(); second.version = 2; second.title = 'Publish a revised release note'; second.change = { reason: 'Clarify the procedure', compatibilityImpact: 'Consumers must use the revised title', affectedConsumers: ['release operators'], supersedesVersion: 1, migrationRef: 'migration/release-note-v2', classification: 'semantic' };
    await createAndAdvance(second, 'approve'); const replace = intent('supersede', second, { oldVersion: 1 });
    await lifecycle.transitionSop(replace, actor({ subjectId: 'activator-subject', roleId: 'activator', dispatchId: 'activate-dispatch' }, replace));
    expect(lifecycle.snapshot(first.sopId, 1).lifecycle.state).toBe('Superseded'); expect(lifecycle.snapshot(first.sopId, 2).lifecycle.state).toBe('Effective');
    const resurrect = intent('activate', first); expect(() => actor({ subjectId: 'activator-subject', roleId: 'activator', dispatchId: 'activate-dispatch' }, resurrect)).not.toThrow();
    await expect(lifecycle.transitionSop(resurrect, actor({ subjectId: 'activator-subject', roleId: 'activator', dispatchId: 'activate-dispatch' }, resurrect))).rejects.toMatchObject({ code: 'SOP_TERMINAL_STATE' });
  });

  it('fails closed on immutable content rewrite and corrupt history', async () => {
    const contract = fixture(); const create = intent('create', contract); await lifecycle.registerDraft(contract, actor({ subjectId: 'author-subject', roleId: 'author', dispatchId: 'author-dispatch' }, create), create);
    const altered = fixture(); altered.title = 'Changed in place'; const changed = intent('create', altered);
    await expect(lifecycle.registerDraft(altered, actor({ subjectId: 'author-subject', roleId: 'author', dispatchId: 'author-dispatch' }, changed), changed)).rejects.toMatchObject({ code: 'SOP_VERSION_IMMUTABLE' });
    fs.writeFileSync(path.join(controlRoot, `${contract.sopId}.history.000003.${'0'.repeat(64)}.json`), '{}');
    expect(() => lifecycle.history(contract.sopId)).toThrow(expect.objectContaining({ code: 'SOP_STORE_CORRUPT' }));
  });
});
