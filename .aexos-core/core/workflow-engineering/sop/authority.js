'use strict';

const { clone, digest } = require('../../execution/durable-evidence');
const { fail } = require('./contract');
const { CapabilityBroker } = require('../../permissions/capability-broker');

const brandedActors = new WeakMap();
const brandedHosts = new WeakSet();
const ACTIONS = Object.freeze(['create', 'review', 'approve', 'activate', 'deprecate', 'supersede']);

function transitionResource(intent) {
  return `${intent.sopId}/${intent.version}/${intent.semanticHash}/${digest(intent)}`;
}

function createSopAuthorityHost(options = {}) {
  const broker = options.capabilityBroker;
  if (!(broker instanceof CapabilityBroker)) fail('SOP_AUTHORITY_UNAVAILABLE', 'A trusted host-owned CapabilityBroker is required.');
  if (typeof options.resolveReviewReceipt !== 'function') fail('SOP_AUTHORITY_UNAVAILABLE', 'A trusted review receipt resolver is required.');
  if (typeof options.resolveIdentity !== 'function') fail('SOP_AUTHORITY_UNAVAILABLE', 'A trusted dispatch identity resolver is required.');
  if (!['operator-host-bound', 'fixture'].includes(options.assurance)) fail('SOP_AUTHORITY_UNAVAILABLE', 'Host assurance must be explicit.');
  const scope = options.projectId;
  // Construction is trusted host composition, never a JSON/API enrollment path.
  const resolveIdentity = options.resolveIdentity;
  const resolveReviewReceipt = options.resolveReviewReceipt;
  const resolveCommitGuard = options.resolveCommitGuard;
  const resolveOwner = options.resolveOwner;
  const assurance = options.assurance;
  const policyId = options.policyId;
  const maxReviewAgeMs = options.maxReviewAgeMs === undefined ? 86400000 : options.maxReviewAgeMs;
  if (typeof policyId !== 'string' || !policyId || !Number.isSafeInteger(maxReviewAgeMs) || maxReviewAgeMs < 1 || maxReviewAgeMs > 31536000000) fail('SOP_AUTHORITY_UNAVAILABLE', 'Trusted host policy identity and review-age bound are required.');
  if (typeof scope !== 'string' || !scope) fail('SOP_AUTHORITY_UNAVAILABLE', 'Trusted host project identity is required.');
  if (resolveCommitGuard !== undefined && typeof resolveCommitGuard !== 'function') fail('SOP_AUTHORITY_UNAVAILABLE', 'Trusted commit guard resolver must be a function.');

  function useRequest(identity, intent) {
    return { agentId: identity.dispatchId, task: 'sop-lifecycle', capability: 'sop.lifecycle',
      action: intent.action, resource: transitionResource(intent), scope };
  }
  function brandActor(dispatchRef, intent, token) {
    const identity = clone(resolveIdentity(dispatchRef));
    if (!identity || typeof identity.subjectId !== 'string' || typeof identity.roleId !== 'string'
      || typeof identity.dispatchId !== 'string' || !ACTIONS.includes(intent?.action)) {
      fail('SOP_ACTOR_INVALID', 'Trusted dispatch identity and lifecycle intent are required.');
    }
    broker.verify(token, useRequest(identity, intent));
    const commitGuard = resolveCommitGuard === undefined ? null : resolveCommitGuard(dispatchRef);
    if (commitGuard !== null && typeof commitGuard !== 'function') fail('SOP_ACTOR_INVALID', 'Trusted commit guard resolution is invalid.');
    const actor = Object.freeze({ subjectId: identity.subjectId, roleId: identity.roleId,
      dispatchId: identity.dispatchId, assurance });
    brandedActors.set(actor, { broker, token, host, identity: clone(identity), intentHash: digest(intent), scope, commitGuard });
    return actor;
  }
  function verifyActor(actor, intent) {
    const authority = brandedActors.get(actor);
    if (!authority || authority.host !== host || authority.broker !== broker || authority.intentHash !== digest(intent)) fail('SOP_ACTOR_UNTRUSTED', 'Lifecycle actor is not a live host-bound identity for this intent.');
    broker.verify(authority.token, useRequest(authority.identity, intent));
    if (authority.commitGuard !== null && authority.commitGuard() !== true) fail('SOP_ACTOR_UNTRUSTED', 'Trusted synchronous commit evidence guard rejected the actor.');
    return { actor: clone(authority.identity), assurance };
  }
  async function resolveReview(query, actor, intent) {
    verifyActor(actor, intent);
    let receipt;
    try { receipt = await resolveReviewReceipt(Object.freeze(clone(query))); }
    catch (_error) { fail('SOP_REVIEW_UNAVAILABLE', 'Trusted review receipt resolution failed.'); }
    verifyActor(actor, intent);
    return clone(receipt);
  }
  function ownerIdentity(query) {
    const owner = typeof resolveOwner === 'function' ? resolveOwner(Object.freeze(clone(query))) : null;
    if (!owner || typeof owner.subjectId !== 'string' || !owner.subjectId
      || owner.roleId !== query.ownerRole || owner.projectId !== scope) {
      fail('SOP_OWNER_IDENTITY_REQUIRED', 'Trusted project owner enrollment is required.');
    }
    return clone(owner);
  }
  const host = Object.freeze({ assurance, projectId: scope, policyId, maxReviewAgeMs, brandActor, verifyActor, resolveReview, ownerIdentity });
  brandedHosts.add(host);
  return host;
}

function assertSopAuthorityHost(host) {
  if (!brandedHosts.has(host)) fail('SOP_AUTHORITY_UNAVAILABLE', 'A branded trusted SOP host is required.');
}

function createFixtureSopAuthorityHost(options = {}) {
  return createSopAuthorityHost({ policyId: 'fixture-only-policy', ...options, assurance: 'fixture' });
}

module.exports = { ACTIONS, assertSopAuthorityHost, createFixtureSopAuthorityHost, createSopAuthorityHost, transitionResource };
