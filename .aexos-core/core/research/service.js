/** Durable bounded research service. Fixture integrity is not truth verification. */
'use strict';

const {
  appendEvent,
  clone,
} = require('../execution/durable-evidence');
const { rankAlternatives } = require('../execution/decision-rubric');
const {
  DEFAULT_OPERATOR_POLICY,
  TERMINAL,
  fail,
  sanitizeErrorCode,
  validateArtifact,
  validatePlan,
} = require('./contract');
const {
  MAX_OBSERVATIONS_PER_BATCH,
  citationIdentity,
  createFixtureCollector,
  validateCollectedObservation,
} = require('./collector');
const { createResearchStore } = require('./store');

const BLOCK_CODES = new Set([
  'TIME_LIMIT', 'SOURCE_LIMIT', 'RETRY_LIMIT', 'BUDGET_LIMIT',
  'PROVIDER_UNAVAILABLE', 'CITATION_INVALID', 'CHECKPOINT_LIMIT',
]);

async function withRelease(operation, release) {
  let result;
  let primaryError = null;
  try { result = await operation(); }
  catch (error) { primaryError = error; }
  let releaseError = null;
  try { await release(); }
  catch (error) { releaseError = error; }
  if (primaryError) throw primaryError;
  if (releaseError) throw releaseError;
  return result;
}

function acquireExecutionLock(store, runId, clock) {
  return process.platform === 'win32'
    ? store.acquireRecoverable(runId, clock)
    : Promise.resolve(store.acquire(runId, clock));
}

function appendResearchEvent(artifact, type, payload, clock) {
  appendEvent({ evidence: artifact.events }, type, payload, clock);
}

function now(clock) {
  return clock().toISOString();
}

function operationState(plan) {
  return plan.operations.map((operation) => ({
    operationId: operation.operationId,
    status: 'pending',
    attempts: 0,
    reservations: [],
  }));
}

function createArtifact(planIdentity, clock) {
  const { plan, planHash, policyHash } = planIdentity;
  const createdAt = now(clock);
  const artifact = {
    schemaVersion: 'aexos.research/v1',
    runId: plan.runId,
    planHash,
    policyHash,
    query: plan.query,
    profile: plan.profile,
    status: 'created',
    reasonCode: null,
    sourcePolicy: clone(plan.sourcePolicy),
    provider: clone(plan.provider),
    sources: [],
    claims: [],
    decisions: [],
    uncertainty: clone(plan.uncertainty),
    metrics: {
      attemptedCollections: 0,
      committedCollections: 0,
      uniqueVersions: 0,
      duplicateObservations: 0,
      retries: 0,
      consumedLogicalUnits: 0,
      bytesRetained: 0,
      elapsedMs: 0,
      currencySpend: null,
      measurementStatus: 'not-observed',
    },
    events: [],
    openQuestions: clone(plan.openQuestions),
    limits: clone(plan.limits),
    recovery: {
      revision: 0,
      previousCheckpointHash: '0'.repeat(64),
      committedOperationIds: [],
      operations: operationState(plan),
      deadlineAt: new Date(Date.parse(createdAt) + plan.limits.maxElapsedMs).toISOString(),
      planHash,
      policyHash,
    },
    createdAt,
    updatedAt: createdAt,
    lineageStatus: 'valid',
    providerVerification: 'unverified',
    recommendationVerification: 'unverified',
    diagnostics: [],
  };
  appendResearchEvent(artifact, 'created', { runId: plan.runId }, clock);
  return validateArtifact(artifact);
}

function latestCitationForLocator(sources, locatorId) {
  let latest = null;
  for (const source of sources) {
    for (const observation of source.observations) {
      if (observation.locatorId === locatorId
        && (!latest || observation.observationIndex > latest.observationIndex)) {
        latest = { observationIndex: observation.observationIndex, citationId: source.citationId };
      }
    }
  }
  return latest?.citationId || null;
}

function applyObservation(artifact, observation, operationId) {
  const prior = latestCitationForLocator(artifact.sources, observation.locatorId);
  const observationIndex = artifact.sources.reduce((sum, source) => sum + source.observations.length, 0) + 1;
  const base = {
    observationId: `o-${require('../execution/durable-evidence').digest({
      operationId,
      locatorId: observation.locatorId,
      retrievedAt: observation.retrievedAt,
      observationIndex,
    })}`,
    operationId,
    originalLocator: observation.originalLocator,
    canonicalLocator: observation.canonicalLocator,
    locatorId: observation.locatorId,
    retrievedAt: observation.retrievedAt,
    collectorId: artifact.provider.adapterId,
    collectorVersion: artifact.provider.version,
    provider: clone(artifact.provider),
    availability: observation.availability,
    originalContentHash: null,
    previousCitationId: prior,
    observationIndex,
  };

  if (observation.accessClass !== 'public' || observation.availability !== 'available') {
    const metadataId = `m-${require('../execution/durable-evidence').digest({
      locatorId: observation.locatorId,
      accessClass: observation.accessClass,
      availability: observation.availability,
    })}`;
    let source = artifact.sources.find((item) => item.citationId === metadataId);
    if (!source) {
      source = { citationId: metadataId, contentHash: null,
        normalizationVersion: artifact.sourcePolicy.normalizationVersion,
        accessClass: observation.accessClass, retainedContent: null,
        metadataOnly: true, inaccessible: true, observations: [] };
      artifact.sources.push(source);
    }
    source.observations.push(base);
    return;
  }

  const identity = citationIdentity(observation.content, observation.accessClass,
    artifact.sourcePolicy.normalizationVersion);
  let source = artifact.sources.find((item) => item.citationId === identity.citationId);
  if (!source) {
    source = { citationId: identity.citationId, contentHash: identity.contentHash,
      normalizationVersion: artifact.sourcePolicy.normalizationVersion,
      accessClass: observation.accessClass, retainedContent: identity.retainedContent,
      metadataOnly: false, inaccessible: false, observations: [] };
    artifact.sources.push(source);
    artifact.metrics.uniqueVersions += 1;
    artifact.metrics.bytesRetained += Buffer.byteLength(identity.retainedContent, 'utf8');
  } else artifact.metrics.duplicateObservations += 1;
  base.originalContentHash = identity.contentHash;
  source.observations.push(base);
}

function validateCitations(artifact, plan) {
  const diagnostics = [];
  const accessible = new Map();
  for (const source of artifact.sources) {
    if (!source.metadataOnly && !source.inaccessible && source.accessClass === 'public') {
      const identity = citationIdentity(source.retainedContent, source.accessClass, source.normalizationVersion);
      if (identity.citationId === source.citationId && identity.contentHash === source.contentHash) {
        accessible.set(source.citationId, source);
      } else diagnostics.push({ code: 'SOURCE_CONTENT_MISMATCH', sourceId: source.citationId });
    }
  }

  function checkReferences(ownerType, ownerId, references) {
    let valid = true;
    for (const reference of references) {
      const source = accessible.get(reference.sourceId);
      if (!source) {
        diagnostics.push({ code: 'SOURCE_UNKNOWN_OR_INACCESSIBLE', ownerType, ownerId,
          sourceId: reference.sourceId });
        valid = false;
      } else if (source.contentHash !== reference.contentHash) {
        diagnostics.push({ code: 'SOURCE_HASH_MISMATCH', ownerType, ownerId,
          sourceId: reference.sourceId });
        valid = false;
      }
    }
    return valid;
  }

  artifact.claims = clone(plan.claims);
  for (const claim of artifact.claims) {
    if (claim.material && claim.support === 'supported' && claim.citations.length === 0) {
      diagnostics.push({ code: 'MATERIAL_CLAIM_UNSUPPORTED', ownerType: 'claim', ownerId: claim.id });
    }
    checkReferences('claim', claim.id, claim.citations);
  }

  artifact.decisions = [];
  for (const comparison of plan.comparisons) {
    const references = comparison.rubric.sources.map((source) => ({
      sourceId: source.sourceId,
      contentHash: source.contentHash,
    }));
    if (!checkReferences('comparison', comparison.id, references)) continue;
    const rubric = clone(comparison.rubric);
    rubric.sources = rubric.sources.map((source) => ({ id: source.id, reference: source.sourceId }));
    const result = rankAlternatives(rubric);
    artifact.decisions.push({
      id: comparison.id,
      declaredConfidence: comparison.declaredConfidence,
      lineageStatus: 'valid',
      providerVerification: 'unverified',
      recommendationVerification: 'unverified',
      input: clone(comparison.rubric),
      result,
    });
  }
  artifact.diagnostics = diagnostics;
  artifact.lineageStatus = diagnostics.length ? 'invalid' : 'valid';
  return diagnostics.length === 0;
}

function updateElapsed(artifact, clock) {
  artifact.updatedAt = now(clock);
  artifact.metrics.elapsedMs = Math.max(0, Date.parse(artifact.updatedAt) - Date.parse(artifact.createdAt));
}

function isExpired(artifact, clock) {
  return clock().getTime() >= Date.parse(artifact.recovery.deadlineAt);
}

function assertSuccessAllowed(artifact, clock, signal) {
  if (signal?.aborted) fail('RESEARCH_CANCELLED', 'Cancellation requested.');
  if (isExpired(artifact, clock)) fail('TIME_LIMIT', 'Research deadline elapsed.');
}

async function collectWithDeadline(collector, request, artifact, clock, signal) {
  if (signal?.aborted) fail('RESEARCH_CANCELLED', 'Cancellation requested.');
  if (isExpired(artifact, clock)) fail('TIME_LIMIT', 'Research deadline elapsed.');
  const controller = new AbortController();
  const remainingMs = Math.max(1, Date.parse(artifact.recovery.deadlineAt) - clock().getTime());
  let timeout;
  let cancelled;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(Object.assign(new Error('Research deadline elapsed.'), { code: 'TIME_LIMIT' }));
    }, remainingMs);
  });
  const cancellationPromise = new Promise((_, reject) => {
    cancelled = () => {
      controller.abort();
      reject(Object.assign(new Error('Cancellation requested.'), { code: 'RESEARCH_CANCELLED' }));
    };
    signal?.addEventListener('abort', cancelled, { once: true });
  });
  try {
    const result = await Promise.race([
      collector.collect({ ...request, signal: controller.signal }),
      timeoutPromise,
      cancellationPromise,
    ]);
    if (signal?.aborted) fail('RESEARCH_CANCELLED', 'Cancellation requested.');
    if (isExpired(artifact, clock)) fail('TIME_LIMIT', 'Research deadline elapsed.');
    return result;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancelled);
  }
}

function terminalize(artifact, status, reasonCode, clock) {
  if (TERMINAL.has(artifact.status)) return artifact;
  artifact.status = status;
  artifact.reasonCode = reasonCode;
  updateElapsed(artifact, clock);
  appendResearchEvent(artifact, status, { reasonCode }, clock);
  return artifact;
}

function terminalForError(error) {
  if (error.code === 'RESEARCH_CANCELLED') return { status: 'cancelled', reasonCode: 'CANCELLED' };
  if (BLOCK_CODES.has(error.code)) return { status: 'blocked', reasonCode: error.code };
  return { status: 'failed', reasonCode: sanitizeErrorCode(error.code) };
}

async function runResearch({
  mode,
  plan: planInput,
  stateDir,
  inputRoot,
  consumerRoot = process.cwd(),
  operatorPolicy = DEFAULT_OPERATOR_POLICY,
  adapterFactory,
  clock = () => new Date(),
  signal,
  interruptionHook = async () => {},
}) {
  const identity = validatePlan(planInput, operatorPolicy);
  const store = createResearchStore(stateDir, consumerRoot);
  let persisted = store.loadIfPresent(identity.plan.runId, {
    planHash: identity.planHash,
    policyHash: identity.policyHash,
    maxStateBytes: identity.plan.limits.maxStateBytes,
  });

  const lock = await acquireExecutionLock(store, identity.plan.runId, clock);
  try {
    persisted = store.loadIfPresent(identity.plan.runId, {
      planHash: identity.planHash,
      policyHash: identity.policyHash,
      maxStateBytes: identity.plan.limits.maxStateBytes,
    });
    if (mode === 'start' && persisted) fail('RESEARCH_RUN_EXISTS', 'Research run already exists.');
    if (mode === 'resume' && !persisted) fail('RESEARCH_RUN_NOT_FOUND', 'Research run does not exist.');
    if (persisted && TERMINAL.has(persisted.artifact.status)) {
      const terminal = clone(persisted.artifact);
      await store.release(lock);
      return terminal;
    }
  } catch (error) {
    try { await store.release(lock); } catch (_releaseError) { /* preserve primary error */ }
    throw error;
  }
  let artifact = persisted ? clone(persisted.artifact) : createArtifact(identity, clock);
  const persist = () => {
    if (persisted && !TERMINAL.has(artifact.status)
      && persisted.checkpointCount >= artifact.limits.maxCheckpointCount - 1) {
      throw Object.assign(new Error('Checkpoint capacity exhausted.'), { code: 'CHECKPOINT_LIMIT' });
    }
    updateElapsed(artifact, clock);
    validateArtifact(artifact);
    const result = store.commit(artifact, lock);
    persisted = { artifact: clone(artifact), checkpoint: result.checkpoint,
      checkpointCount: result.checkpoint.revision };
  };
  const persistTerminal = (status, reasonCode) => {
    terminalize(artifact, status, reasonCode, clock);
    persist();
  };

  return withRelease(async () => {
    try {
      if (!persisted) persist();
      if (artifact.status === 'created') {
        assertSuccessAllowed(artifact, clock, signal);
        artifact.status = 'collecting';
        appendResearchEvent(artifact, 'collecting', {}, clock);
        persist();
      }
      if (artifact.provider.kind === 'unavailable') {
        persistTerminal('blocked', 'PROVIDER_UNAVAILABLE');
        return clone(artifact);
      }

      for (const operation of identity.plan.operations) {
        const recovery = artifact.recovery.operations.find((item) => item.operationId === operation.operationId);
        if (recovery.status === 'committed') continue;
        while (true) {
          if (signal?.aborted) throw Object.assign(new Error('Cancellation requested.'), { code: 'RESEARCH_CANCELLED' });
          if (isExpired(artifact, clock)) throw Object.assign(new Error('Deadline elapsed.'), { code: 'TIME_LIMIT' });
          if (persisted.checkpointCount >= artifact.limits.maxCheckpointCount - 1) {
            throw Object.assign(new Error('Checkpoint capacity exhausted.'), { code: 'CHECKPOINT_LIMIT' });
          }

          let reservation = recovery.reservations.find((item) => item.status === 'pending');
          if (reservation && mode === 'resume') {
            reservation.status = 'interrupted';
            artifact.metrics.retries += 1;
            appendResearchEvent(artifact, 'attempt-interrupted', {
              operationId: operation.operationId,
              attempt: reservation.attempt,
            }, clock);
            persist();
            reservation = null;
          }
          if (!reservation) {
            await interruptionHook('before-reservation', clone(artifact));
            if (recovery.attempts >= artifact.limits.maxAttemptsPerOperation) {
              throw Object.assign(new Error('Retry limit exhausted.'), { code: 'RETRY_LIMIT' });
            }
            if (artifact.metrics.consumedLogicalUnits >= artifact.limits.budget.maximum) {
              throw Object.assign(new Error('Attempt budget exhausted.'), { code: 'BUDGET_LIMIT' });
            }
            reservation = { attempt: recovery.attempts + 1, unit: 'collection-attempt', status: 'pending' };
            recovery.reservations.push(reservation);
            recovery.attempts += 1;
            artifact.metrics.attemptedCollections += 1;
            artifact.metrics.consumedLogicalUnits += 1;
            appendResearchEvent(artifact, 'attempt-reserved', {
              operationId: operation.operationId,
              attempt: reservation.attempt,
            }, clock);
            persist();
            await interruptionHook('after-reservation', clone(artifact));
          }

          const factory = adapterFactory || ((context) => createFixtureCollector(context));
          const collector = factory({ inputRoot, operation, limits: artifact.limits,
            provider: artifact.provider, sourcePolicy: artifact.sourcePolicy });
          try {
            const remaining = artifact.limits.maxSources - artifact.sources.length;
            const batch = await collectWithDeadline(collector, {
              operationId: operation.operationId,
              cursor: null,
              remaining,
            }, artifact, clock, signal);
            const next = clone(artifact);
            if (!batch || !Array.isArray(batch.observations) || batch.cursor !== null) {
              fail('RESEARCH_SOURCE_INVALID', 'Collector returned an invalid bounded batch.');
            }
            if (batch.observations.length > MAX_OBSERVATIONS_PER_BATCH) {
              fail('SOURCE_LIMIT', 'Collector observation batch exceeds the independent raw bound.');
            }
            const observations = batch.observations.map((observation) =>
              validateCollectedObservation(observation, next.limits, next.sourcePolicy));
            for (const observation of observations) applyObservation(next, observation, operation.operationId);
            if (next.sources.length > next.limits.maxSources) fail('SOURCE_LIMIT', 'Source limit exceeded.');
            const nextRecovery = next.recovery.operations.find((item) => item.operationId === operation.operationId);
            nextRecovery.status = 'committed';
            nextRecovery.reservations.find((item) => item.attempt === reservation.attempt).status = 'committed';
            next.recovery.committedOperationIds.push(operation.operationId);
            next.metrics.committedCollections += 1;
            appendResearchEvent(next, 'collection-committed', {
              operationId: operation.operationId,
              attempt: reservation.attempt,
              observationCount: batch.observations.length,
            }, clock);
            artifact = next;
            await interruptionHook('before-collection-publication', clone(artifact));
            assertSuccessAllowed(artifact, clock, signal);
            persist();
            await interruptionHook('after-collection-commit', clone(artifact));
            break;
          } catch (error) {
            if (!error.transient) throw error;
            reservation.status = 'failed';
            recovery.status = 'pending';
            artifact.metrics.retries += 1;
            appendResearchEvent(artifact, 'attempt-failed', {
              operationId: operation.operationId,
              attempt: reservation.attempt,
              code: 'TRANSIENT_COLLECTION_FAILURE',
            }, clock);
            persist();
          }
        }
      }

      if (artifact.status === 'collecting') {
        await interruptionHook('before-validation', clone(artifact));
        assertSuccessAllowed(artifact, clock, signal);
        artifact.status = 'validating';
        appendResearchEvent(artifact, 'validating', {}, clock);
        validateCitations(artifact, identity.plan);
        await interruptionHook('after-validation', clone(artifact));
        assertSuccessAllowed(artifact, clock, signal);
        persist();
      }
      await interruptionHook('before-terminal', clone(artifact));
      assertSuccessAllowed(artifact, clock, signal);
      if (artifact.lineageStatus !== 'valid') persistTerminal('blocked', 'CITATION_INVALID');
      else persistTerminal('completed', null);
      return clone(artifact);
    } catch (error) {
      const authoritative = store.loadIfPresent(identity.plan.runId, {
        planHash: identity.planHash, policyHash: identity.policyHash,
        maxStateBytes: identity.plan.limits.maxStateBytes,
      });
      artifact = authoritative ? clone(authoritative.artifact) : artifact;
      if (error.code === 'RESEARCH_CONTROLLED_INTERRUPTION') throw error;
      const terminal = terminalForError(error);
      if (!TERMINAL.has(artifact.status)) persistTerminal(terminal.status, terminal.reasonCode);
      return clone(artifact);
    }
  }, () => store.release(lock));
}

function loadResearch({ runId, stateDir, consumerRoot = process.cwd() }) {
  return clone(createResearchStore(stateDir, consumerRoot).load(runId).artifact);
}

function cancelResearch({ runId, stateDir, consumerRoot = process.cwd(), clock = () => new Date() }) {
  const store = createResearchStore(stateDir, consumerRoot);
  const loaded = store.load(runId);
  if (TERMINAL.has(loaded.artifact.status)) return clone(loaded.artifact);
  const lock = store.acquire(runId, clock);
  try {
    const artifact = clone(store.load(runId).artifact);
    terminalize(artifact, 'cancelled', 'CANCELLED', clock);
    store.commit(artifact, lock);
    return clone(artifact);
  } finally { store.release(lock); }
}

async function cancelResearchAsync({
  runId,
  stateDir,
  consumerRoot = process.cwd(),
  clock = () => new Date(),
}) {
  const store = createResearchStore(stateDir, consumerRoot);
  const lock = await acquireExecutionLock(store, runId, clock);
  return withRelease(async () => {
    const loaded = store.load(runId);
    if (TERMINAL.has(loaded.artifact.status)) return clone(loaded.artifact);
    const artifact = clone(loaded.artifact);
    terminalize(artifact, 'cancelled', 'CANCELLED', clock);
    store.commit(artifact, lock);
    return clone(artifact);
  }, () => store.release(lock));
}

async function recoverResearch({ runId, stateDir, consumerRoot = process.cwd(), clock = () => new Date() }) {
  return createResearchStore(stateDir, consumerRoot).recover(runId, clock);
}

module.exports = {
  appendResearchEvent,
  cancelResearch,
  cancelResearchAsync,
  createArtifact,
  loadResearch,
  recoverResearch,
  runResearch,
  validateCitations,
};
