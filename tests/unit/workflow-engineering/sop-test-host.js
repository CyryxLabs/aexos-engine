'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const sop = require('../../../.aexos-core/core/workflow-engineering/sop');
const { createCapabilityBroker } = require('../../../.aexos-core/core/permissions/capability-broker');
const { digest } = require('../../../.aexos-core/core/execution/durable-evidence');

const fixture = () => JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../fixtures/sop/straight-through.json'), 'utf8'));
function testHost(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-sop-test-'));
  const projectId = options.projectId || 'fixture-project';
  let now = Date.now() - 10000;
  const store = sop.createSopStore(root);
  const broker = createCapabilityBroker({ policy: () => true, clock: () => now });
  const host = sop.createFixtureSopAuthorityHost({ capabilityBroker: broker, projectId,
    resolveIdentity: (value) => value,
    resolveOwner: () => ({ subjectId: 'owner-subject', roleId: 'operator', projectId }),
    resolveReviewReceipt: async (query) => ({ ...query, receiptId: 'review-receipt', accepted: true,
      subjectId: query.reviewerSubjectId, dispatchId: query.reviewerDispatchId,
      artifactHash: 'a'.repeat(64), observedAt: new Date(now).toISOString(), assurance: 'fixture' }),
    ...options,
  });
  const lifecycle = sop.createSopLifecycle({ store, authorityHost: host, clock: () => new Date(now) });
  function intent(action, contract, extra = {}) { return { action, sopId: contract.sopId, version: contract.version, semanticHash: sop.semanticHash(contract), decision: 'accepted', ...extra }; }
  function actor(action, selected, identity = {}) {
    const role = { create: 'author', review: 'reviewer', approve: 'approver', activate: 'activator', supersede: 'activator', deprecate: 'activator' }[action];
    const subject = { subjectId: `${role}-subject`, roleId: role, dispatchId: `${action}-dispatch`, ...identity };
    const lease = broker.grant({ agentId: subject.dispatchId, task: 'sop-lifecycle', capability: 'sop.lifecycle', actions: [action], resource: sop.transitionResource(selected), scope: projectId, ttlMs: 60000 });
    return host.brandActor(subject, selected, lease.token);
  }
  async function act(action, contract, extra = {}, identity = {}) {
    now += 1;
    const selected = intent(action, contract, extra); const identityActor = actor(action, selected, identity);
    return action === 'create' ? lifecycle.registerDraft(contract, identityActor, selected) : lifecycle.transitionSop(selected, identityActor);
  }
  async function advance(contract = fixture(), through = 'activate') {
    let snapshot;
    for (const action of ['create', 'review', 'approve', 'activate']) {
      snapshot = await act(action, contract);
      if (action === through) break;
    }
    return snapshot;
  }
  return { root, store, broker, host, lifecycle, intent, actor, act, advance,
    now: () => now, tick: (ms) => { now += ms; }, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
function seal(receipt) { const { receiptHash: _old, ...value } = receipt; return { ...value, receiptHash: digest(value) }; }
function runtimeBundle(snapshot) {
  const run = { projectId: snapshot.lifecycle.projectId, sopId: snapshot.contract.sopId, version: snapshot.contract.version,
    semanticHash: snapshot.semanticHash, compiledMapHash: sop.compileSop(snapshot).compiledMapHash,
    runId: 'run-one', environmentId: 'test', inputDigest: 'd'.repeat(64), startedAt: new Date(Date.now() - 1000).toISOString() };
  const bindings = snapshot.contract.evidenceObligations.filter((item) => item.required).map((item) => ({
    obligationId: item.id, producer: { subjectId: 'worker', dispatchId: 'worker-dispatch' },
    sourceRuntime: 'aexos-governed-runtime', artifact: { ...item.artifact, hash: 'a'.repeat(64) },
  }));
  const receipts = bindings.map((binding, index) => {
    const obligation = snapshot.contract.evidenceObligations.find((item) => item.id === binding.obligationId);
    return seal({ ...run, ...binding, taskId: obligation.stepId, stepId: obligation.stepId,
      receiptId: `receipt-${index}`, trusted: true, origin: 'runtime', status: 'completed',
      observedAt: new Date().toISOString(), acceptance: { result: 'passed', checks: obligation.requiredChecks.map((definition) => ({ definition, passed: true, artifactHash: binding.artifact.hash })) },
    });
  });
  return { run, bindings, receipts };
}
module.exports = { fixture, testHost, runtimeBundle, seal };
