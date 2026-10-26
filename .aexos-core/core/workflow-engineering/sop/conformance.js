'use strict';

const { clone, digest } = require('../../execution/durable-evidence');
const { fail } = require('./contract');
const { assertVerifiedSnapshot } = require('./lifecycle');
const { compileSop } = require('./compile');

const HASH = /^[a-f0-9]{64}$/;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/;
const STATUS = new Set(['completed', 'skipped', 'exception', 'failed', 'blocked', 'not-observed']);
const RUN_FIELDS = ['projectId', 'sopId', 'version', 'semanticHash', 'compiledMapHash', 'runId', 'environmentId', 'inputDigest', 'startedAt'];
function validId(value) { return typeof value === 'string' && ID.test(value); }
function time(value) { const number = Date.parse(value); return typeof value === 'string' && Number.isFinite(number) && new Date(number).toISOString() === value ? number : NaN; }
function exactRun(snapshot, run, now, projectRoot) {
  if (!run || RUN_FIELDS.some((key) => run[key] === undefined || run[key] === null || run[key] === '')) fail('SOP_RUN_BINDING_INVALID', 'An exact nonempty run binding is required.');
  if (run.sopId !== snapshot.contract.sopId || run.version !== snapshot.contract.version || run.semanticHash !== snapshot.semanticHash) fail('SOP_RUN_VERSION_MISMATCH', 'Run does not bind the effective canonical version.');
  if (run.projectId !== snapshot.lifecycle.projectId || run.environmentId !== snapshot.contract.conformance.requiredEnvironment
    || !validId(run.runId) || !HASH.test(run.inputDigest) || !HASH.test(run.compiledMapHash)
    || run.compiledMapHash !== compileSop(snapshot, { projectRoot }).compiledMapHash
    || !Number.isFinite(time(run.startedAt)) || time(run.startedAt) > now
    || time(run.startedAt) < time(snapshot.lifecycle.effectiveAt)) fail('SOP_RUN_BINDING_INVALID', 'Run project, map, environment, time or digest is invalid.');
}
function receiptReason(receipt, run, obligation, binding, contract, now) {
  if (!receipt) return 'RECEIPT_MISSING';
  if (!validId(receipt.receiptId) || !HASH.test(receipt.receiptHash || '')) return 'RECEIPT_IDENTITY_INVALID';
  const { receiptHash, ...payload } = receipt;
  if (digest(payload) !== receiptHash) return 'RECEIPT_DIGEST_INVALID';
  if (receipt.trusted !== true) return 'RECEIPT_UNAUTHENTICATED';
  if (!['runtime', 'fixture'].includes(receipt.origin)) return 'RECEIPT_ORIGIN_INVALID';
  if (receipt.origin === 'fixture' && contract.conformance.requireRealOrigin) return 'RECEIPT_FIXTURE';
  if (!STATUS.has(receipt.status)) return 'RECEIPT_STATUS_INVALID';
  if (RUN_FIELDS.some((key) => receipt[key] !== run[key])) return 'RECEIPT_BINDING_MISMATCH';
  if (receipt.stepId !== obligation.stepId || receipt.obligationId !== obligation.id) return 'RECEIPT_OBLIGATION_MISMATCH';
  const boundStepId = binding?.stepId || obligation.stepId;
  const boundTaskId = binding?.taskId || obligation.stepId;
  if (!binding || binding.obligationId !== obligation.id || boundStepId !== obligation.stepId
    || !validId(boundTaskId) || receipt.taskId !== boundTaskId || !binding.producer
    || !validId(binding.producer.subjectId) || !validId(binding.producer.dispatchId)
    || !receipt.producer || digest(receipt.producer) !== digest(binding.producer) || !validId(binding.sourceRuntime)
    || receipt.sourceRuntime !== binding.sourceRuntime) return 'RECEIPT_PRODUCER_INVALID';
  const artifact = receipt.artifact;
  if (!artifact || !binding.artifact || ['id', 'kind', 'path'].some((key) => artifact[key] !== obligation.artifact[key])
    || digest(artifact) !== digest(binding.artifact)) return 'RECEIPT_ARTIFACT_INVALID';
  const acceptance = receipt.acceptance;
  if (!acceptance || !['passed', 'failed', 'blocked'].includes(acceptance.result)
    || !Array.isArray(acceptance.checks) || acceptance.checks.length > obligation.requiredChecks.length) return 'RECEIPT_ACCEPTANCE_INVALID';
  if (receipt.status === 'completed' && acceptance.checks.length !== obligation.requiredChecks.length) return 'RECEIPT_ACCEPTANCE_INVALID';
  const expected = obligation.requiredChecks.map(digest).sort();
  const observedChecks = acceptance.checks.map((check) => digest(check?.definition)).sort();
  if (acceptance.checks.some((check) => !check || typeof check.passed !== 'boolean'
    || check.artifactHash !== artifact.hash || !check.definition || !expected.includes(digest(check.definition)))
    || new Set(observedChecks).size !== observedChecks.length) return 'RECEIPT_CHECKS_INVALID';
  if (receipt.status === 'completed' && (!HASH.test(artifact.hash || '') || acceptance.result !== 'passed'
    || acceptance.checks.length !== obligation.requiredChecks.length || digest(observedChecks) !== digest(expected)
    || acceptance.checks.some((check) => !check.passed))) return 'RECEIPT_CHECK_FAILED';
  if (['failed', 'blocked'].includes(receipt.status) && acceptance.result === 'passed') return 'RECEIPT_ACCEPTANCE_INVALID';
  const observed = time(receipt.observedAt);
  if (!Number.isFinite(observed) || observed > now || observed < time(run.startedAt)
    || now - observed > Math.min(contract.conformance.maxReceiptAgeMs, obligation.maxAgeMs)) return 'RECEIPT_STALE';
  // Decision execution adapters are held. Receipt flags cannot impersonate them.
  if (['skipped', 'exception'].includes(receipt.status)) return 'ROUTE_DECISION_ADAPTER_UNAVAILABLE';
  return null;
}

async function auditConformance(snapshot, runRef, trustedReceiptResolver, options = {}) {
  assertVerifiedSnapshot(snapshot, ['Effective'], 'SOP_EFFECTIVE_SNAPSHOT_REQUIRED');
  const contract = snapshot.contract; const run = runRef && clone(runRef); const now = Date.now();
  exactRun(snapshot, run, now, options.projectRoot);
  const unavailable = (reason) => ({ protocol: 'aexos.sop-conformance/v1', status: 'not-observed', reason, run, steps: [] });
  if (typeof trustedReceiptResolver !== 'function') return unavailable('TRUSTED_RECEIPT_RESOLVER_UNAVAILABLE');
  let bundle;
  try { bundle = clone(await trustedReceiptResolver(Object.freeze(clone(run)))); }
  catch (_error) { return unavailable('TRUSTED_RECEIPT_RESOLVER_UNAVAILABLE'); }
  assertVerifiedSnapshot(snapshot, ['Effective'], 'SOP_EFFECTIVE_SNAPSHOT_REQUIRED');
  if (!bundle || !bundle.run || RUN_FIELDS.some((key) => bundle.run[key] !== run[key])
    || !Array.isArray(bundle.receipts) || !Array.isArray(bundle.bindings)
    || bundle.receipts.length > 1000 || bundle.bindings.length > 512
    || bundle.bindings.some((item) => !item || typeof item !== 'object' || Array.isArray(item) || !validId(item.obligationId))
    || new Set(bundle.bindings.map((item) => item.obligationId)).size !== bundle.bindings.length
    || new Set(bundle.receipts.map((item) => item?.receiptId)).size !== bundle.receipts.length) return unavailable('TRUSTED_RUN_ASSOCIATION_REQUIRED');
  const results = contract.evidenceObligations.filter((item) => item.required).map((obligation) => {
    const candidates = bundle.receipts.filter((item) => item?.obligationId === obligation.id);
    const receipt = candidates.length === 1 ? candidates[0] : null;
    const binding = bundle.bindings.find((item) => item.obligationId === obligation.id);
    const reason = candidates.length > 1 ? 'RECEIPT_AMBIGUOUS' : receiptReason(receipt, run, obligation, binding, contract, Date.now());
    const status = reason === 'RECEIPT_CHECK_FAILED' ? 'failed' : reason ? 'not-observed' : receipt.status;
    return { id: obligation.id, stepId: obligation.stepId, status, receiptRefs: reason ? [] : [receipt.receiptId], reasons: reason ? [reason] : [], origin: receipt?.origin || null };
  });
  const stepResults = contract.steps.map((step) => {
    const obligations = results.filter((item) => item.stepId === step.id);
    const required = contract.evidenceObligations.filter((item) => item.required && item.stepId === step.id);
    const incomplete = step.outputs.some((output) => !required.some((item) => item.artifact.id === output.name
      && item.artifact.kind === output.kind && item.artifact.path === output.path))
      || step.verify.some((check) => !required.some((item) => item.requiredChecks.some((definition) => digest(check) === digest(definition))));
    const status = obligations.some((item) => ['failed', 'blocked'].includes(item.status)) ? 'failed'
      : incomplete || !obligations.length || obligations.some((item) => item.status !== 'completed') ? 'not-observed' : 'completed';
    return { stepId: step.id, status, obligations, reason: incomplete ? 'DECLARED_STEP_EVIDENCE_INCOMPLETE' : obligations.length ? null : 'REQUIRED_STEP_EVIDENCE_MISSING' };
  });
  const globalObligations = results.filter((item) => item.stepId === null);
  const hasFailure = results.some((item) => ['failed', 'blocked'].includes(item.status));
  const hasMissing = !results.length || stepResults.some((item) => item.status === 'not-observed') || globalObligations.some((item) => item.status !== 'completed');
  let status = hasFailure ? 'nonconformant' : hasMissing ? 'not-observed' : 'conforms';
  if (status === 'conforms' && (snapshot.lifecycle.assurance === 'fixture' || results.some((item) => item.origin === 'fixture'))) status = 'fixture-conformance';
  return { protocol: 'aexos.sop-conformance/v1', status, reason: null, run, steps: stepResults, globalObligations,
    scope: { oneRun: true, environmentId: run.environmentId, version: run.version, inputDigest: run.inputDigest } };
}

module.exports = { auditConformance };
