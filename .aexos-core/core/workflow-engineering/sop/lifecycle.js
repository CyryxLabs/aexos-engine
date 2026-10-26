'use strict';

const { clone, digest } = require('../../execution/durable-evidence');
const { fail, normalizeSopContract } = require('./contract');
const { assertSopAuthorityHost } = require('./authority');
const { assertSopStore } = require('./store');

const NEXT = Object.freeze({ review: ['Draft', 'Reviewed'], approve: ['Reviewed', 'Approved'], activate: ['Approved', 'Effective'], deprecate: ['Effective', 'Deprecated'], supersede: ['Approved', 'Effective'] });
const snapshots = new WeakMap();
const verifiedEvents = new WeakMap();
const hashPattern = /^[a-f0-9]{64}$/;
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function instant(value) { const time = Date.parse(value); return typeof value === 'string' && Number.isFinite(time) && new Date(time).toISOString() === value ? time : NaN; }
function identity(value) { return value && ['subjectId', 'roleId', 'dispatchId'].every((key) => typeof value[key] === 'string' && value[key].length > 0 && value[key].length <= 256); }
function policyHash(contract, host) { return digest({ approvals: contract.approvals, lifecyclePolicy: contract.lifecyclePolicy, hostPolicyId: host.policyId, hostMaxReviewAgeMs: host.maxReviewAgeMs }); }
function assertReview(receipt, contract, event, creation, at, hostMaxAge) {
  if (!receipt || receipt.accepted !== true || typeof receipt.receiptId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/.test(receipt.receiptId) || !hashPattern.test(receipt.artifactHash)
    || receipt.sopId !== contract.sopId || receipt.version !== contract.version || receipt.semanticHash !== event.semanticHash
    || receipt.projectId !== contract.scope.projectId || receipt.subjectId !== event.actor.subjectId
    || receipt.dispatchId !== event.actor.dispatchId || receipt.assurance !== event.assurance
    || !Number.isFinite(instant(receipt.observedAt)) || instant(receipt.observedAt) > at
    || instant(receipt.observedAt) < instant(creation.at)
    || at - instant(receipt.observedAt) > Math.min(contract.lifecyclePolicy.maxReviewAgeMs, hostMaxAge)) fail('SOP_REVIEW_INVALID', 'Exact accepted and fresh independent review evidence is required.');
  if ([creation.actor.subjectId, creation.owner.subjectId].includes(event.actor.subjectId)
    || creation.actor.dispatchId === event.actor.dispatchId) fail('SOP_SELF_REVIEW_DENIED', 'Retained authors and enrolled owners cannot independently review their own content.');
}
function assertFresh(gates, contract, at, hostMaxAge) {
  const review = gates.review;
  if (!review) fail('SOP_REVIEW_REQUIRED', 'Retained independent review is required.');
  if (at - instant(review.reviewReceipt.observedAt) > Math.min(contract.lifecyclePolicy.maxReviewAgeMs, hostMaxAge)) fail('SOP_REVIEW_STALE', 'Independent review has expired.');
}

function createSopLifecycle(options = {}) {
  const store = options.store; const authority = options.authorityHost; const clock = options.clock || (() => new Date());
  assertSopAuthorityHost(authority);
  assertSopStore(store);
  function now() { const value = clock(); if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail('SOP_CLOCK_INVALID', 'Trusted lifecycle clock is invalid.'); return value; }
  function replay(records, versions) {
    const states = new Map(); const gates = new Map(); const creations = new Map(); let effective = null; let lastTime = -Infinity;
    for (const record of records) {
      const event = record.event;
      if (event.type === 'declaration') continue;
      const stored = versions.get(event.version); const contract = stored?.contract;
      const at = instant(event.at);
      if (!contract || event.semanticHash !== stored.semanticHash || event.contentHash !== digest(contract)
        || event.projectId !== authority.projectId || contract.scope.projectId !== authority.projectId
        || event.policyHash !== policyHash(contract, authority) || event.assurance !== authority.assurance
        || !identity(event.actor) || event.decision !== 'accepted' || !Number.isFinite(at) || at < lastTime || at > now().getTime()) fail('SOP_STORE_CORRUPT', 'Lifecycle identity, authority, decision or time does not replay.');
      lastTime = at;
      if (event.type === 'version-created') {
        if (states.has(event.version) || !contract.authors.includes(event.actor.roleId)
          || !event.owner?.subjectId || event.owner.roleId !== contract.ownerRole || event.owner.projectId !== authority.projectId) fail('SOP_STORE_CORRUPT', 'Version creation lacks retained author and enrolled owner identity.');
        if (event.version > 1 && (!states.has(event.version - 1) || contract.change?.supersedesVersion !== event.version - 1)) fail('SOP_STORE_CORRUPT', 'Version sequence or predecessor identity is invalid.');
        states.set(event.version, 'Draft'); gates.set(event.version, {}); creations.set(event.version, event); continue;
      }
      const transition = NEXT[event.action];
      if (!transition || states.get(event.version) !== transition[0] || event.from !== transition[0] || event.to !== transition[1]
        || !['transition', 'atomic-supersession'].includes(event.type)
        || (event.type === 'atomic-supersession') !== (event.action === 'supersede')) fail('SOP_STORE_CORRUPT', 'Lifecycle gates cannot be skipped or replayed out of order.');
      const policy = contract.approvals.find((item) => item.stage === event.action);
      if (!policy || policy.roleId !== event.actor.roleId || policy.prohibitedRoleIds.includes(event.actor.roleId)) fail('SOP_APPROVAL_UNAUTHORIZED', 'Retained actor does not satisfy canonical policy.');
      const previous = gates.get(event.version); const creation = creations.get(event.version);
      if (event.action === 'review') {
        if (event.reviewReceiptHash !== digest(event.reviewReceipt)) fail('SOP_STORE_CORRUPT', 'Review receipt digest differs.');
        assertReview(event.reviewReceipt, contract, event, creation, at, authority.maxReviewAgeMs);
      } else if (['approve', 'activate', 'supersede'].includes(event.action)) assertFresh(previous, contract, at, authority.maxReviewAgeMs);
      if (policy.independent && [creation, ...Object.values(previous)].some((prior) => prior.actor.subjectId === event.actor.subjectId || prior.actor.dispatchId === event.actor.dispatchId)) fail('SOP_SUBJECT_SEPARATION_REQUIRED', 'Independent gates require distinct retained subjects and dispatches.');
      if (event.action === 'supersede') {
        if (effective !== event.oldVersion || states.get(event.oldVersion) !== 'Effective'
          || event.oldVersion !== contract.change?.supersedesVersion || event.oldSemanticHash !== versions.get(event.oldVersion)?.semanticHash) fail('SOP_SUPERSESSION_INVALID', 'Supersession must atomically bind the exact effective predecessor.');
        states.set(event.oldVersion, 'Superseded'); effective = event.version;
      } else if (event.to === 'Effective') {
        if (effective !== null) fail('SOP_EFFECTIVE_CONFLICT', 'Only one Effective SOP version is permitted.');
        effective = event.version;
      } else if (event.from === 'Effective') effective = null;
      states.set(event.version, event.to); previous[event.action] = event;
    }
    return { states, gates, creations, effective };
  }
  function load(sopId) {
    const records = store.history(sopId); const versions = new Map();
    for (const record of records) if (record.event.type === 'version-created') versions.set(record.event.version, store.loadVersion(sopId, record.event.version));
    return { records, versions, ...replay(records, versions) };
  }
  function eventBase(contract, actor, intent) {
    const verified = authority.verifyActor(actor, intent);
    if (intent.sopId !== contract.sopId || intent.version !== contract.version || intent.semanticHash !== normalizeSopContract(contract).semanticHash
      || intent.decision !== 'accepted' || contract.scope.projectId !== authority.projectId) fail('SOP_INTENT_MISMATCH', 'Accepted lifecycle intent must bind exact project and canonical version.');
    return { version: contract.version, semanticHash: intent.semanticHash, contentHash: digest(contract), policyHash: policyHash(contract, authority),
      projectId: authority.projectId, at: now().toISOString(), actor: verified.actor, assurance: verified.assurance, decision: intent.decision };
  }
  function snapshot(sopId, version) {
    const current = load(sopId); const stored = current.versions.get(version);
    if (!stored) fail('SOP_VERSION_NOT_FOUND', 'Verified lifecycle version does not exist.');
    const gates = current.gates.get(version); const state = current.states.get(version);
    const value = freeze({ protocol: 'aexos.sop-snapshot/v1', contract: clone(stored.contract), semanticHash: stored.semanticHash,
      lifecycle: { state, projectId: authority.projectId, assurance: authority.assurance,
        reviewedAt: gates.review?.at || null, approvedAt: gates.approve?.at || null,
        effectiveAt: gates.activate?.at || gates.supersede?.at || null, events: clone([current.creations.get(version), ...Object.values(gates)]) } });
    snapshots.set(value, { assertCurrent: () => {
      const latest = load(sopId);
      if (digest(latest.records) !== digest(current.records)) fail('SOP_SNAPSHOT_STALE', 'Lifecycle changed since this verified snapshot.');
      if (['Approved', 'Effective'].includes(state)) assertFresh(latest.gates.get(version), stored.contract, now().getTime(), authority.maxReviewAgeMs);
    } });
    return value;
  }
  async function registerDraft(contract, actor, intent) {
    const normalized = normalizeSopContract(contract);
    if (intent.action !== 'create') fail('SOP_INTENT_MISMATCH', 'Version creation requires a create intent.');
    const event = { type: 'version-created', ...eventBase(normalized.contract, actor, intent),
      owner: authority.ownerIdentity({ sopId: contract.sopId, version: contract.version, ownerRole: contract.ownerRole, projectId: authority.projectId }) };
    const lock = store.acquire(contract.sopId, clock);
    try {
      const current = load(contract.sopId);
      if (current.versions.has(contract.version)) fail('SOP_VERSION_IMMUTABLE', 'Version already has immutable history.');
      const versions = new Map(current.versions).set(contract.version, { contract: normalized.contract, semanticHash: normalized.semanticHash });
      replay([...current.records, { event }], versions);
      authority.verifyActor(actor, intent); store.saveVersion(normalized.contract, lock);
      verifiedEvents.set(event, { store, lock, sopId: contract.sopId, hash: digest(event) });
      store.append(contract.sopId, event, lock);
      return snapshot(contract.sopId, contract.version);
    } finally { store.release(lock); }
  }
  async function transitionSop(intent, actor) {
    if (!NEXT[intent.action]) fail('SOP_TRANSITION_INVALID', 'Unsupported lifecycle transition.');
    authority.verifyActor(actor, intent); const lock = store.acquire(intent.sopId, clock);
    try {
      const current = load(intent.sopId); const stored = current.versions.get(intent.version);
      if (!stored) fail('SOP_VERSION_NOT_FOUND', 'Version does not exist.');
      const state = current.states.get(intent.version); const [from, to] = NEXT[intent.action];
      if (state !== from) fail(['Deprecated', 'Superseded'].includes(state) ? 'SOP_TERMINAL_STATE' : 'SOP_TRANSITION_INVALID', 'Requested transition is not legal from current state.');
      const event = { type: intent.action === 'supersede' ? 'atomic-supersession' : 'transition', action: intent.action, from, to, ...eventBase(stored.contract, actor, intent) };
      if (intent.action === 'review') {
        event.reviewReceipt = await authority.resolveReview({ projectId: authority.projectId, sopId: intent.sopId, version: intent.version, semanticHash: intent.semanticHash, reviewerSubjectId: actor.subjectId, reviewerDispatchId: actor.dispatchId }, actor, intent);
        event.reviewReceiptHash = digest(event.reviewReceipt);
        event.at = now().toISOString();
      }
      if (intent.action === 'supersede') { event.oldVersion = intent.oldVersion; event.oldSemanticHash = current.versions.get(intent.oldVersion)?.semanticHash || null; }
      replay([...current.records, { event }], current.versions);
      authority.verifyActor(actor, intent);
      verifiedEvents.set(event, { store, lock, sopId: intent.sopId, hash: digest(event) });
      store.append(intent.sopId, event, lock);
      return snapshot(intent.sopId, intent.version);
    } finally { store.release(lock); }
  }
  function recordDeclaration(declaration) {
    if (!declaration || typeof declaration.decision !== 'string') fail('SOP_DECLARATION_INVALID', 'Untrusted declaration is invalid.');
    const lock = store.acquire(declaration.sopId, clock);
    try { return store.append(declaration.sopId, { type: 'declaration', at: now().toISOString(), declaration: clone(declaration) }, lock); }
    finally { store.release(lock); }
  }
  return Object.freeze({ history: store.history, recordDeclaration, registerDraft, snapshot, transitionSop });
}

function assertVerifiedSnapshot(snapshot, states, code) {
  const proof = snapshots.get(snapshot);
  if (!proof || !states.includes(snapshot.lifecycle.state)) fail(code, 'A privately verified current lifecycle snapshot is required.');
  proof.assertCurrent();
  return snapshot;
}
function consumeVerifiedEvent(store, sopId, event, lock) {
  const proof = verifiedEvents.get(event);
  if (!proof || proof.store !== store || proof.sopId !== sopId || proof.lock !== lock || proof.hash !== digest(event)) fail('SOP_DECLARATION_ONLY', 'Public store append cannot create authoritative lifecycle history.');
  verifiedEvents.delete(event);
}
module.exports = { assertVerifiedSnapshot, consumeVerifiedEvent, createSopLifecycle };
