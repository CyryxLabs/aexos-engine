'use strict';

const crypto = require('crypto');
const { clone, digest, stableStringify } = require('../../execution/durable-evidence');
const { createSopAuthorityHost, transitionResource } = require('./authority');
const { fail, normalizeSopContract } = require('./contract');

const MAX_BUNDLE_BYTES = 1024 * 1024;
const MAX_REPORT_BYTES = 256 * 1024;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/;
const NONCE = /^[a-f0-9]{64}$/;

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function freeze(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value && typeof value === 'object') Object.values(value).forEach(freeze);
  return value && typeof value === 'object' ? Object.freeze(value) : value;
}
function exactInstant(value) {
  const time = Date.parse(value);
  return typeof value === 'string' && Number.isFinite(time) && new Date(time).toISOString() === value ? time : NaN;
}
function assertCurrent(contract, expected) {
  const current = normalizeSopContract(contract);
  if (current.semanticHash !== expected.semanticHash || digest(current.contract) !== digest(expected.contract)
    || current.canonical !== expected.canonical) fail('SOP_NATIVE_REVIEW_ARTIFACT_CHANGED', 'SOP bytes changed while native review was pending.');
  return current;
}
function nativeResource(pending) {
  return `${pending.projectId}/${pending.sopId}/${pending.version}/${pending.semanticHash}/${pending.bundleHash}/${pending.nonce}`;
}

function createNativeSopReviewHost(options = {}) {
  const broker = options.capabilityBroker;
  const transport = options.transport;
  const retainEvidence = options.retainEvidence;
  const verifyReview = options.verifyReview;
  const baseResolveIdentity = options.resolveIdentity;
  const reviewer = options.reviewerEnrollment === undefined ? null : clone(options.reviewerEnrollment);
  const checks = options.reviewChecks === undefined ? null : clone(options.reviewChecks);
  const clock = options.clock || (() => new Date());
  const randomNonce = options.randomNonce || (() => crypto.randomBytes(32).toString('hex'));
  if (!broker || typeof broker.grant !== 'function' || typeof broker.verify !== 'function'
    || typeof transport !== 'function' || typeof retainEvidence !== 'function' || typeof verifyReview !== 'function'
    || typeof baseResolveIdentity !== 'function') fail('SOP_NATIVE_REVIEW_HOST_INVALID', 'Trusted native review construction callbacks are required.');
  if (!reviewer || !ID.test(reviewer.subjectId || '') || !ID.test(reviewer.roleId || '')) fail('SOP_NATIVE_REVIEW_ENROLLMENT_INVALID', 'A fixed host-enrolled reviewer subject and role are required.');
  if (!Array.isArray(checks) || checks.length < 1 || checks.length > 64
    || checks.some((item) => typeof item !== 'string' || item.length < 1 || item.length > 512)) fail('SOP_NATIVE_REVIEW_CHECKS_INVALID', 'Fixed bounded review checks are required.');

  const reviewerRefs = new WeakMap();
  const retained = new Map();
  const consumedNonces = new Set();
  const consumedDispatches = new Set();
  function now() {
    const value = clock();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail('SOP_CLOCK_INVALID', 'Trusted native review clock is invalid.');
    return value;
  }
  function resolveIdentity(reference) {
    if (reference && reviewerRefs.has(reference)) return clone(reviewerRefs.get(reference).identity);
    return baseResolveIdentity(reference);
  }
  function resolveCommitGuard(reference) {
    return reference && reviewerRefs.has(reference) ? reviewerRefs.get(reference).commitGuard : null;
  }
  async function resolveReviewReceipt(query) {
    const entry = retained.get(query.reviewerDispatchId);
    if (!entry || query.reviewerSubjectId !== reviewer.subjectId || query.sopId !== entry.receipt.sopId
      || query.version !== entry.receipt.version || query.semanticHash !== entry.receipt.semanticHash
      || query.projectId !== entry.receipt.projectId) fail('SOP_REVIEW_UNAVAILABLE', 'No exact retained native review receipt exists.');
    entry.verifyNativeLease();
    await Promise.resolve();
    entry.verifyNativeLease();
    return clone(entry.receipt);
  }

  const authorityHost = createSopAuthorityHost({
    capabilityBroker: broker,
    projectId: options.projectId,
    assurance: options.assurance,
    policyId: options.policyId,
    maxReviewAgeMs: options.maxReviewAgeMs,
    resolveOwner: options.resolveOwner,
    resolveIdentity,
    resolveCommitGuard,
    resolveReviewReceipt,
  });

  async function reviewDraft(lifecycle, contract) {
    if (!lifecycle || typeof lifecycle.snapshot !== 'function' || typeof lifecycle.transitionSop !== 'function') fail('SOP_NATIVE_REVIEW_LIFECYCLE_INVALID', 'The real SOP lifecycle is required.');
    const normalized = normalizeSopContract(contract);
    if (normalized.contract.scope.projectId !== authorityHost.projectId) fail('SOP_NATIVE_REVIEW_SCOPE_INVALID', 'SOP project differs from the trusted host scope.');
    const snapshot = lifecycle.snapshot(normalized.contract.sopId, normalized.contract.version);
    if (snapshot.lifecycle.state !== 'Draft' || snapshot.semanticHash !== normalized.semanticHash
      || digest(snapshot.contract) !== digest(normalized.contract)) fail('SOP_NATIVE_REVIEW_STATE_INVALID', 'Only the exact retained Draft can be reviewed.');
    const creation = snapshot.lifecycle.events[0];
    if (!creation?.actor || !creation.owner
      || [creation.actor.subjectId, creation.owner.subjectId].includes(reviewer.subjectId)) fail('SOP_SELF_REVIEW_DENIED', 'The host-enrolled reviewer must differ from retained author and owner subjects.');
    const policy = normalized.contract.approvals.find((item) => item.stage === 'review');
    if (!policy || policy.roleId !== reviewer.roleId) fail('SOP_APPROVAL_UNAUTHORIZED', 'Host reviewer enrollment does not match canonical review policy.');

    const nonce = randomNonce();
    if (!NONCE.test(nonce) || consumedNonces.has(nonce)) fail('SOP_NATIVE_REVIEW_NONCE_INVALID', 'A fresh host nonce is required.');
    consumedNonces.add(nonce);
    const createdAt = now().toISOString();
    const artifactHash = digest(normalized.contract);
    const bundle = {
      protocol: 'aexos.sop-native-review-bundle/v1', nonce, projectId: authorityHost.projectId,
      sopId: normalized.contract.sopId, version: normalized.contract.version,
      semanticHash: normalized.semanticHash, artifactHash, canonical: normalized.canonical,
      checks, createdAt,
    };
    const bundleBytes = Buffer.from(stableStringify(bundle));
    if (bundleBytes.length > MAX_BUNDLE_BYTES) fail('SOP_NATIVE_REVIEW_BUNDLE_LIMIT', 'Native review bundle exceeds its byte limit.');
    const pending = freeze({ ...bundle, bundleHash: sha256(bundleBytes) });
    const grant = broker.grant({ agentId: reviewer.subjectId, task: 'sop-native-review', capability: 'sop.native-review',
      actions: ['dispatch'], resource: nativeResource(pending), scope: authorityHost.projectId, ttlMs: options.leaseTtlMs });
    const verifyNativeLease = () => broker.verify(grant.token, { agentId: reviewer.subjectId, task: 'sop-native-review',
      capability: 'sop.native-review', action: 'dispatch', resource: nativeResource(pending), scope: authorityHost.projectId });

    verifyNativeLease();
    const result = await transport(freeze(clone(pending)));
    verifyNativeLease();
    assertCurrent(contract, normalized);
    if (!result || typeof result !== 'object' || ['subjectId', 'reviewerSubjectId', 'roleId', 'assurance'].some((key) => key in result)) fail('SOP_NATIVE_REVIEW_PROVENANCE_INVALID', 'Transport output cannot enroll or select reviewer authority.');
    if (result.protocol !== 'aexos.sop-native-review-result/v1' || result.nonce !== pending.nonce
      || result.bundleHash !== pending.bundleHash || !ID.test(result.dispatchId || '')
      || result.dispatchId === creation.actor.dispatchId || result.status !== 'completed'
      || result.executionConformance === true || (result.modelIdentity !== undefined
        && (typeof result.modelIdentity !== 'string' || result.modelIdentity.length > 256))) fail('SOP_NATIVE_REVIEW_RESULT_INVALID', 'Native result does not bind the pending independent dispatch or claims unsupported authority.');
    if (!Buffer.isBuffer(result.reportBytes) || result.reportBytes.length < 1 || result.reportBytes.length > MAX_REPORT_BYTES) fail('SOP_NATIVE_REVIEW_REPORT_INVALID', 'Native report bytes are missing or exceed their bound.');
    const reportReference = result.reportBytes;
    const reportHash = sha256(reportReference);
    if (result.reportHash !== reportHash) fail('SOP_NATIVE_REVIEW_REPORT_INVALID', 'Native report hash differs from observed report bytes.');
    const observedResult = freeze({ protocol: result.protocol, nonce: result.nonce, bundleHash: result.bundleHash,
      dispatchId: result.dispatchId, status: result.status, observedAt: result.observedAt,
      reportHash: result.reportHash, executionConformance: result.executionConformance,
      modelIdentity: result.modelIdentity });
    function assertObservedResultCurrent() {
      if (result.protocol !== observedResult.protocol || result.nonce !== observedResult.nonce
        || result.bundleHash !== observedResult.bundleHash || result.dispatchId !== observedResult.dispatchId
        || result.status !== observedResult.status || result.observedAt !== observedResult.observedAt
        || result.reportHash !== observedResult.reportHash || result.executionConformance !== observedResult.executionConformance
        || result.modelIdentity !== observedResult.modelIdentity || result.reportBytes !== reportReference
        || sha256(reportReference) !== reportHash) fail('SOP_NATIVE_REVIEW_RESULT_CHANGED', 'Observed native dispatch or report changed across a trust boundary.');
    }
    if (consumedDispatches.has(observedResult.dispatchId)) fail('SOP_NATIVE_REVIEW_REPLAYED', 'Native dispatch was already consumed.');
    consumedDispatches.add(observedResult.dispatchId);
    const observed = exactInstant(observedResult.observedAt); const created = exactInstant(createdAt); const terminal = now().getTime();
    const ageLimit = Math.min(normalized.contract.lifecyclePolicy.maxReviewAgeMs, authorityHost.maxReviewAgeMs);
    if (!Number.isFinite(observed) || observed < created || observed > terminal || terminal - observed > ageLimit) fail('SOP_NATIVE_REVIEW_STALE', 'Native review observation is not fresh for this pending bundle.');

    const verification = await verifyReview(freeze({ pending: clone(pending), dispatchId: observedResult.dispatchId,
      reportBytes: Buffer.from(reportReference), reportHash, observedAt: observedResult.observedAt, status: observedResult.status }));
    verifyNativeLease();
    assertCurrent(contract, normalized);
    assertObservedResultCurrent();
    if (!verification || verification.bundleHash !== pending.bundleHash || verification.artifactHash !== artifactHash
      || verification.reportHash !== reportHash || verification.accepted !== true
      || !Array.isArray(verification.checks) || verification.checks.length !== checks.length
      || verification.checks.some((item, index) => item !== checks[index])) fail('SOP_NATIVE_REVIEW_REJECTED', 'Independent native review checks did not accept the exact artifact and report.');
    const verificationHash = digest(verification);

    const retention = await retainEvidence(freeze({ protocol: 'aexos.sop-native-review-evidence/v1',
      pending: clone(pending), dispatchId: observedResult.dispatchId, reportBytes: Buffer.from(reportReference),
      reportHash, observedAt: observedResult.observedAt, verification: clone(verification) }));
    verifyNativeLease();
    assertCurrent(contract, normalized);
    assertObservedResultCurrent();
    if (!retention || !ID.test(retention.retentionId || '') || retention.nonce !== pending.nonce
      || retention.dispatchId !== observedResult.dispatchId || retention.bundleHash !== pending.bundleHash
      || retention.reportHash !== reportHash || retention.artifactHash !== artifactHash
      || retention.verificationHash !== verificationHash) fail('SOP_NATIVE_REVIEW_RETENTION_INVALID', 'Terminal native review evidence was not retained exactly.');
    const retainedResult = freeze({ retentionId: retention.retentionId, nonce: retention.nonce,
      dispatchId: retention.dispatchId, bundleHash: retention.bundleHash, reportHash: retention.reportHash,
      artifactHash: retention.artifactHash, verificationHash: retention.verificationHash });
    function assertRetentionCurrent() {
      if (retention.retentionId !== retainedResult.retentionId || retention.nonce !== retainedResult.nonce
        || retention.dispatchId !== retainedResult.dispatchId || retention.bundleHash !== retainedResult.bundleHash
        || retention.reportHash !== retainedResult.reportHash || retention.artifactHash !== retainedResult.artifactHash
        || retention.verificationHash !== retainedResult.verificationHash || digest(verification) !== verificationHash) {
        fail('SOP_NATIVE_REVIEW_RETENTION_CHANGED', 'Retained native review verification changed before lifecycle commit.');
      }
    }

    const receipt = freeze({ receiptId: retention.retentionId, artifactHash, sopId: pending.sopId,
      version: pending.version, semanticHash: pending.semanticHash, projectId: pending.projectId,
      subjectId: reviewer.subjectId, dispatchId: observedResult.dispatchId, assurance: authorityHost.assurance,
      observedAt: observedResult.observedAt, accepted: true, nonce: pending.nonce, bundleHash: pending.bundleHash,
      reportHash, verificationHash, retentionId: retention.retentionId, executionConformance: false,
      modelIdentity: typeof observedResult.modelIdentity === 'string' ? observedResult.modelIdentity : null });
    retained.set(observedResult.dispatchId, { receipt, verifyNativeLease });
    const commitGuard = () => {
      verifyNativeLease();
      assertCurrent(contract, normalized);
      assertObservedResultCurrent();
      assertRetentionCurrent();
      const entry = retained.get(observedResult.dispatchId);
      if (!entry || entry.receipt !== receipt) fail('SOP_NATIVE_REVIEW_RETENTION_CHANGED', 'Retained native review receipt changed before lifecycle commit.');
      return true;
    };
    const intent = freeze({ action: 'review', sopId: pending.sopId, version: pending.version,
      semanticHash: pending.semanticHash, decision: 'accepted' });
    const lifecycleGrant = broker.grant({ agentId: observedResult.dispatchId, task: 'sop-lifecycle', capability: 'sop.lifecycle',
      actions: ['review'], resource: transitionResource(intent), scope: authorityHost.projectId, ttlMs: options.leaseTtlMs });
    const reference = Object.freeze({});
    reviewerRefs.set(reference, { identity: { subjectId: reviewer.subjectId, roleId: reviewer.roleId,
      dispatchId: observedResult.dispatchId }, commitGuard });
    const actor = authorityHost.brandActor(reference, intent, lifecycleGrant.token);
    const reviewed = await lifecycle.transitionSop(intent, actor);
    if (reviewed.lifecycle.state !== 'Reviewed') fail('SOP_NATIVE_REVIEW_STATE_INVALID', 'Accepted native review may only produce Reviewed.');
    return reviewed;
  }

  return Object.freeze({ authorityHost, reviewDraft,
    limitations: Object.freeze(['No model identity claim.', 'No adversarial OS confinement claim.', 'Review is not approval, activation, execution, or conformance.']) });
}

module.exports = { createNativeSopReviewHost };
