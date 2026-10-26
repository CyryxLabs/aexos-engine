/** Strict protocol and semantic validation for durable local research. */
'use strict';

const fs = require('fs');
const crypto = require('crypto');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { rankAlternatives } = require('../execution/decision-rubric');
const { clone, digest, stableStringify, validateEvidence } = require('../execution/durable-evidence');

const schema = require('../../schemas/research-v1.schema.json');
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(schema);
const validatePlanShape = ajv.compile({ $ref: `${schema.$id}#/definitions/plan` });
const validateArtifactShape = ajv.compile({ $ref: `${schema.$id}#/definitions/artifact` });
const validateCheckpointShape = ajv.compile({ $ref: `${schema.$id}#/definitions/checkpoint` });

const DEFAULT_LIMITS = Object.freeze({
  maxSources: 100,
  maxOperations: 100,
  maxAttemptsPerOperation: 3,
  maxElapsedMs: 60_000,
  maxInputBytes: 1024 * 1024,
  maxContentBytes: 64 * 1024,
  maxStateBytes: 4 * 1024 * 1024,
  maxCheckpointCount: 512,
  budget: { unit: 'collection-attempt', maximum: 100 },
});

const DEFAULT_OPERATOR_POLICY = Object.freeze({
  policyVersion: 'aexos.research-operator-policy/v1',
  allowedProfiles: ['fixture-local'],
  allowedProviderKinds: ['fixture', 'unavailable'],
  maximumLimits: DEFAULT_LIMITS,
});

const TERMINAL = new Set(['completed', 'cancelled', 'blocked', 'failed']);
const BLOCK_REASON_CODES = new Set(['TIME_LIMIT', 'SOURCE_LIMIT', 'RETRY_LIMIT', 'BUDGET_LIMIT',
  'PROVIDER_UNAVAILABLE', 'CITATION_INVALID', 'CHECKPOINT_LIMIT']);
const ALLOWED_ERROR_CODES = new Set([
  'BUDGET_LIMIT', 'CANCELLED', 'CHECKPOINT_LIMIT', 'CITATION_INVALID',
  'COLLECTION_FAILED', 'PROVIDER_UNAVAILABLE', 'RESEARCH_ARTIFACT_INVALID',
  'RESEARCH_BUSY', 'RESEARCH_CANCELLED', 'RESEARCH_CHECKPOINT_CORRUPT',
  'RESEARCH_CHECKPOINT_FORK', 'RESEARCH_CHECKPOINT_INVALID', 'RESEARCH_COLLECTION_ABORTED',
  'RESEARCH_EXPORT_FORMAT', 'RESEARCH_FIXTURE_INVALID',
  'RESEARCH_FIXTURE_LIMIT', 'RESEARCH_INPUT_INVALID', 'RESEARCH_INPUT_ROOT_INVALID',
  'RESEARCH_LOCATOR_INVALID', 'RESEARCH_PLAN_DRIFT', 'RESEARCH_PLAN_INVALID',
  'RESEARCH_POLICY_DENIED', 'RESEARCH_POLICY_DRIFT', 'RESEARCH_POLICY_INVALID',
  'RESEARCH_PRIVATE_CONTENT', 'RESEARCH_RUN_EXISTS', 'RESEARCH_RUN_INVALID',
  'RESEARCH_RUN_NOT_FOUND', 'RESEARCH_SECRET_DETECTED', 'RESEARCH_SECRET_LOCATOR',
  'RESEARCH_SOURCE_INVALID', 'RESEARCH_STATE_LIMIT', 'RESEARCH_STORE_ALIAS',
  'RESEARCH_STORE_CHANGED', 'RESEARCH_STORE_LIMIT', 'RESEARCH_STORE_REQUIRED',
  'RESEARCH_STORE_SCOPE', 'RESEARCH_LOCK_CHANGED', 'RESEARCH_LOCK_REQUIRED',
  'RESEARCH_PERSISTENCE_ERROR', 'RESEARCH_RECOVERY_UNAVAILABLE',
  'RESEARCH_TRANSITION_INVALID', 'RETRY_LIMIT',
  'SOURCE_LIMIT', 'TIME_LIMIT',
]);
const SECRET_PATTERNS = Object.freeze([
  /\b(authorization["']?\s*:\s*["']?bearer\s+)(?:"((?:\\.|[^"\\\r\n])*)"|'((?:\\.|[^'\\\r\n])*)'|([^\s,;"']+))/gi,
  /\b((?:api[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|client[_-]?secret|secret|credential)["']?\s*[:=]\s*)(?:"((?:\\.|[^"\\\r\n])*)"|'((?:\\.|[^'\\\r\n])*)'|([^\s,;"']+))/gi,
  /\b(sk-(?:test-)?[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{8,}|AKIA[A-Z0-9]{12,})\b/g,
]);
const TRANSITIONS = Object.freeze({
  created: new Set(['collecting', 'cancelled', 'blocked', 'failed']),
  collecting: new Set(['validating', 'cancelled', 'blocked', 'failed']),
  validating: new Set(['completed', 'cancelled', 'blocked', 'failed']),
});

function fail(code, message, diagnostics) {
  const error = Object.assign(new Error(message), { code });
  if (diagnostics) error.diagnostics = diagnostics;
  throw error;
}

function ensureSafeValue(value, label = 'input', depth = 0) {
  if (depth > 30) fail('RESEARCH_INPUT_INVALID', `${label} exceeds the nesting limit.`);
  if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)) {
    fail('RESEARCH_INPUT_INVALID', `${label} contains an unsafe number.`);
  }
  if (typeof value === 'string' && Buffer.byteLength(value, 'utf8') > 256 * 1024) {
    fail('RESEARCH_INPUT_INVALID', `${label} contains an oversized string.`);
  }
  if (Array.isArray(value)) value.forEach((item) => ensureSafeValue(item, label, depth + 1));
  else if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => ensureSafeValue(item, label, depth + 1));
  }
}

function serializedBytes(value) {
  let serialized;
  try { serialized = JSON.stringify(value); }
  catch (_error) { fail('RESEARCH_INPUT_INVALID', 'Research input must be acyclic JSON data.'); }
  if (serialized === undefined) fail('RESEARCH_INPUT_INVALID', 'Research input must be JSON data.');
  return Buffer.byteLength(serialized, 'utf8');
}

function sanitizeText(value, handling) {
  let output = value;
  let detected = false;
  for (const [index, pattern] of SECRET_PATTERNS.entries()) {
    pattern.lastIndex = 0;
    output = output.replace(pattern, (...args) => {
      const assignedValue = index < 2 ? (args[2] ?? args[3] ?? args[4]) : null;
      if (index < 2 && (assignedValue === '' || /^\[REDACTED\]$/i.test(assignedValue)
        || /^redacted-[a-f0-9]{64}$/i.test(assignedValue))) return args[0];
      detected = true;
      if (handling === 'reject') return args[0];
      if (index >= 2) return '[REDACTED]';
      const quote = args[2] !== undefined ? '"' : args[3] !== undefined ? "'" : '';
      return `${args[1]}${quote}[REDACTED]${quote}`;
    });
  }
  if (detected && handling === 'reject') {
    fail('RESEARCH_SECRET_DETECTED', 'Persisted text matched the documented secret pattern policy.');
  }
  return output;
}

function applySecretPolicy(value, handling, depth = 0) {
  if (!['reject', 'redact'].includes(handling)) fail('RESEARCH_PLAN_INVALID', 'Secret handling policy is invalid.');
  if (depth > 30) fail('RESEARCH_INPUT_INVALID', 'Research input exceeds the nesting limit.');
  if (typeof value === 'string') return sanitizeText(value, handling);
  if (Array.isArray(value)) return value.map((item) => applySecretPolicy(item, handling, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .map(([key, item]) => [key, applySecretPolicy(item, handling, depth + 1)]));
  }
  return value;
}

function sanitizeErrorCode(code, fallback = 'COLLECTION_FAILED') {
  return typeof code === 'string' && ALLOWED_ERROR_CODES.has(code) ? code : fallback;
}

function schemaFailure(code, validate, value) {
  ensureSafeValue(value);
  if (!validate(value)) {
    const diagnostics = validate.errors.map((item) => ({
      path: item.instancePath || '/',
      keyword: item.keyword,
    }));
    fail(code, 'Research protocol validation failed.', diagnostics);
  }
}

function uniqueIds(items, label) {
  const seen = new Set();
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(item.id)) {
      fail('RESEARCH_PLAN_INVALID', `${label} requires safe ids.`);
    }
    if (seen.has(item.id)) fail('RESEARCH_PLAN_INVALID', `${label} contains duplicate ids.`);
    seen.add(item.id);
  }
}

function validateClaimPlan(claims) {
  uniqueIds(claims, 'claims');
  for (const claim of claims) {
    const keys = Object.keys(claim).sort();
    const allowed = ['citations', 'explanation', 'id', 'material', 'support', 'text', 'uncertainty'];
    if (keys.some((key) => !allowed.includes(key))) fail('RESEARCH_PLAN_INVALID', 'Claim has unknown fields.');
    if (typeof claim.text !== 'string' || !claim.text.trim() || claim.text.length > 4096
      || typeof claim.material !== 'boolean'
      || !['supported', 'unsupported', 'open'].includes(claim.support)
      || typeof claim.uncertainty !== 'string' || claim.uncertainty.length > 2048
      || !Array.isArray(claim.citations) || claim.citations.length > 100) {
      fail('RESEARCH_PLAN_INVALID', 'Claim contract is invalid.');
    }
    if (claim.support !== 'supported' && (typeof claim.explanation !== 'string' || !claim.explanation.trim())) {
      fail('RESEARCH_PLAN_INVALID', 'Unsupported and open claims require an explanation.');
    }
    for (const citation of claim.citations) {
      if (!citation || Object.keys(citation).some((key) => !['sourceId', 'contentHash'].includes(key))
        || typeof citation.sourceId !== 'string' || !/^(s|m)-[a-f0-9]{64}$/.test(citation.sourceId)
        || !/^[a-f0-9]{64}$/.test(citation.contentHash)) {
        fail('RESEARCH_PLAN_INVALID', 'Claim citation contract is malformed.');
      }
    }
  }
}

function validateComparisonPlan(comparisons) {
  uniqueIds(comparisons, 'comparisons');
  for (const comparison of comparisons) {
    const allowed = ['declaredConfidence', 'id', 'rubric'];
    if (Object.keys(comparison).some((key) => !allowed.includes(key))
      || typeof comparison.declaredConfidence !== 'string'
      || comparison.declaredConfidence.length > 128
      || !comparison.rubric || typeof comparison.rubric !== 'object') {
      fail('RESEARCH_PLAN_INVALID', 'Comparison contract is invalid.');
    }
    const rubricKeys = ['alternatives', 'criteria', 'sources', 'weightOverrides'];
    if (Object.keys(comparison.rubric).some((key) => !rubricKeys.includes(key))
      || !Array.isArray(comparison.rubric.criteria)
      || !Array.isArray(comparison.rubric.alternatives)
      || !Array.isArray(comparison.rubric.sources)) {
      fail('RESEARCH_PLAN_INVALID', 'Comparison rubric is invalid.');
    }
    for (const source of comparison.rubric.sources) {
      if (!source || Object.keys(source).some((key) => !['contentHash', 'id', 'sourceId'].includes(key))
        || typeof source.id !== 'string' || typeof source.sourceId !== 'string'
        || !/^(s|m)-[a-f0-9]{64}$/.test(source.sourceId)
        || !/^[a-f0-9]{64}$/.test(source.contentHash)) {
        fail('RESEARCH_PLAN_INVALID', 'Comparison source contract is malformed.');
      }
    }
  }
}

function validatePolicy(plan, operatorPolicy) {
  if (!operatorPolicy || operatorPolicy.policyVersion !== DEFAULT_OPERATOR_POLICY.policyVersion) {
    fail('RESEARCH_POLICY_INVALID', 'Trusted operator policy is missing or unsupported.');
  }
  if (!operatorPolicy.allowedProfiles.includes(plan.profile)
    || !operatorPolicy.allowedProviderKinds.includes(plan.provider.kind)) {
    fail('RESEARCH_POLICY_DENIED', 'Plan requests a provider or profile outside operator policy.');
  }
  const maximum = operatorPolicy.maximumLimits;
  for (const [key, value] of Object.entries(plan.limits)) {
    if (key === 'budget') {
      if (value.unit !== maximum.budget.unit || value.maximum > maximum.budget.maximum) {
        fail('RESEARCH_POLICY_DENIED', 'Plan budget exceeds operator policy.');
      }
    } else if (value > maximum[key]) fail('RESEARCH_POLICY_DENIED', 'Plan limits exceed operator policy.');
  }
}

function readPlan(planFile, operatorPolicy = DEFAULT_OPERATOR_POLICY) {
  const stat = fs.lstatSync(planFile);
  const maximum = operatorPolicy.maximumLimits.maxInputBytes;
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1
    || stat.size > maximum) {
    fail('RESEARCH_PLAN_INVALID', 'Plan must be a bounded ordinary JSON file.');
  }
  const descriptor = fs.openSync(planFile, 'r');
  const chunks = [];
  let byteLength = 0;
  try {
    const opened = fs.fstatSync(descriptor);
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== stat.dev || opened.ino !== stat.ino) {
      fail('RESEARCH_PLAN_INVALID', 'Plan identity changed before reading.');
    }
    while (byteLength <= maximum) {
      const chunk = Buffer.alloc(Math.min(64 * 1024, maximum + 1 - byteLength));
      const count = fs.readSync(descriptor, chunk, 0, chunk.length, null);
      if (!count) break;
      chunks.push(chunk.subarray(0, count));
      byteLength += count;
    }
    const after = fs.fstatSync(descriptor);
    const named = fs.lstatSync(planFile);
    if (byteLength > maximum || byteLength !== stat.size || after.size !== stat.size
      || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs
      || named.isSymbolicLink() || named.nlink !== 1 || named.dev !== stat.dev || named.ino !== stat.ino) {
      fail('RESEARCH_PLAN_INVALID', 'Plan changed while reading or exceeds its byte bound.');
    }
  } finally { fs.closeSync(descriptor); }
  let plan;
  try { plan = JSON.parse(Buffer.concat(chunks, byteLength).toString('utf8')); }
  catch (_error) { fail('RESEARCH_PLAN_INVALID', 'Plan must contain valid JSON.'); }
  const identity = validatePlan(plan, operatorPolicy);
  if (byteLength > identity.plan.limits.maxInputBytes) {
    fail('RESEARCH_PLAN_INVALID', 'Raw plan file exceeds its configured input byte bound.');
  }
  return identity;
}

// Reconstruct accounting from the retained events; matching counters alone do
// not establish that an operation reserved and consumed a collection attempt.
function validateAttemptAccounting(artifact) {
  const operations = new Map(artifact.recovery.operations.map((operation) =>
    [operation.operationId, { operationId: operation.operationId, status: 'pending', attempts: 0, reservations: [] }]));
  let phase = null;
  let retries = 0;
  for (const event of artifact.events) {
    if (['created', 'collecting', 'validating', ...TERMINAL].includes(event.type)) phase = event.type;
    if (!['attempt-reserved', 'attempt-failed', 'attempt-interrupted', 'collection-committed'].includes(event.type)) continue;
    const operation = operations.get(event.payload.operationId);
    const attempt = event.payload.attempt;
    if (phase !== 'collecting' || !operation || !Number.isSafeInteger(attempt)
      || operation.status === 'committed') {
      fail('RESEARCH_ARTIFACT_INVALID', 'Attempt event has no eligible collecting operation.');
    }
    const previous = operation.reservations.at(-1);
    if (event.type === 'attempt-reserved') {
      if (attempt !== operation.attempts + 1 || attempt > artifact.limits.maxAttemptsPerOperation
        || previous?.status === 'pending') {
        fail('RESEARCH_ARTIFACT_INVALID', 'Attempt reservation sequence is invalid.');
      }
      operation.attempts += 1;
      operation.reservations.push({ attempt, unit: 'collection-attempt', status: 'pending' });
    } else {
      if (!previous || previous.attempt !== attempt || previous.status !== 'pending') {
        fail('RESEARCH_ARTIFACT_INVALID', 'Attempt outcome lacks an unsettled reservation.');
      }
      previous.status = event.type === 'collection-committed' ? 'committed'
        : event.type === 'attempt-failed' ? 'failed' : 'interrupted';
      if (previous.status === 'committed') operation.status = 'committed';
      else retries += 1;
    }
  }
  if (stableStringify([...operations.values()]) !== stableStringify(artifact.recovery.operations)
    || artifact.recovery.operations.length > artifact.limits.maxOperations
    || artifact.metrics.consumedLogicalUnits > artifact.limits.budget.maximum
    || artifact.metrics.retries !== retries) {
    fail('RESEARCH_ARTIFACT_INVALID', 'Recovery accounting is not supported by its attempt history.');
  }
  for (const source of artifact.sources) {
    if (source.observations.some((item) => operations.get(item.operationId)?.status !== 'committed')) {
      fail('RESEARCH_ARTIFACT_INVALID', 'Observation lacks a committed collection operation.');
    }
  }
}

function validatePlan(input, operatorPolicy = DEFAULT_OPERATOR_POLICY) {
  const inputBytes = serializedBytes(input);
  if (inputBytes > operatorPolicy.maximumLimits.maxInputBytes) {
    fail('RESEARCH_PLAN_INVALID', 'Plan exceeds the operator input byte bound.');
  }
  ensureSafeValue(input);
  const requestedBound = input?.limits?.maxInputBytes;
  if (Number.isSafeInteger(requestedBound) && inputBytes > requestedBound) {
    fail('RESEARCH_PLAN_INVALID', 'Plan exceeds its configured input byte bound.');
  }
  const handling = input?.sourcePolicy?.secretHandling || 'reject';
  const plan = applySecretPolicy(clone(input), handling);
  schemaFailure('RESEARCH_PLAN_INVALID', validatePlanShape, plan);
  const operationIds = plan.operations.map((item) => ({ id: item.operationId }));
  uniqueIds(operationIds, 'operations');
  if (plan.operations.length > plan.limits.maxOperations) {
    fail('RESEARCH_PLAN_INVALID', 'Operation count exceeds configured limit.');
  }
  validateClaimPlan(plan.claims);
  validateComparisonPlan(plan.comparisons);
  validatePolicy(plan, operatorPolicy);
  return { plan, planHash: digest(plan), policyHash: digest(operatorPolicy), operatorPolicy: clone(operatorPolicy) };
}

function validateArtifact(artifact) {
  schemaFailure('RESEARCH_ARTIFACT_INVALID', validateArtifactShape, artifact);
  const sanitizedArtifact = applySecretPolicy(artifact, artifact.sourcePolicy.secretHandling);
  if (stableStringify(sanitizedArtifact) !== stableStringify(artifact)) {
    fail('RESEARCH_ARTIFACT_INVALID', 'Artifact contains unredacted secret-pattern text.');
  }
  if (artifact.recovery.planHash !== artifact.planHash
    || artifact.recovery.policyHash !== artifact.policyHash) {
    fail('RESEARCH_ARTIFACT_INVALID', 'Recovery identity differs from the artifact identity.');
  }
  if (!validateEvidence(artifact.events)) fail('RESEARCH_ARTIFACT_INVALID', 'Artifact event chain is invalid.');
  validateClaimPlan(artifact.claims);
  uniqueIds(artifact.decisions, 'decisions');
  const sourceIds = new Set();
  const observations = [];
  for (const source of artifact.sources) {
    if (sourceIds.has(source.citationId)) fail('RESEARCH_ARTIFACT_INVALID', 'Artifact has duplicate source identities.');
    sourceIds.add(source.citationId);
    if (source.metadataOnly || source.inaccessible) {
      if (source.contentHash !== null || source.retainedContent !== null) {
        fail('RESEARCH_ARTIFACT_INVALID', 'Inaccessible source retained citation content.');
      }
    } else {
      const contentHash = crypto.createHash('sha256').update(source.retainedContent, 'utf8').digest('hex');
      const citationId = `s-${digest({ normalizationVersion: source.normalizationVersion,
        accessClass: source.accessClass, contentHash })}`;
      if (source.contentHash !== contentHash || source.citationId !== citationId) {
        fail('RESEARCH_ARTIFACT_INVALID', 'Source content identity is invalid.');
      }
    }
    for (const observation of source.observations) observations.push({ source, observation });
  }
  let invalidClaimLineage = false;
  for (const claim of artifact.claims) {
    if (claim.material && claim.support === 'supported' && claim.citations.length === 0) {
      invalidClaimLineage = true;
    }
    for (const citation of claim.citations) {
      const source = artifact.sources.find((item) => item.citationId === citation.sourceId);
      if (!source || source.inaccessible || source.metadataOnly || source.contentHash !== citation.contentHash) {
        invalidClaimLineage = true;
      }
    }
  }
  if (invalidClaimLineage && artifact.lineageStatus !== 'invalid') {
    fail('RESEARCH_ARTIFACT_INVALID', 'Claim citation lineage is invalid.');
  }
  observations.sort((left, right) => left.observation.observationIndex - right.observation.observationIndex);
  const lastByLocator = new Map();
  observations.forEach(({ source, observation }, index) => {
    if (observation.observationIndex !== index + 1
      || observation.locatorId !== `l-${digest(observation.canonicalLocator)}`
      || stableStringify(observation.provider) !== stableStringify(artifact.provider)
      || observation.previousCitationId !== (lastByLocator.get(observation.locatorId) || null)
      || observation.originalContentHash !== source.contentHash) {
      fail('RESEARCH_ARTIFACT_INVALID', 'Source observation lineage is invalid.');
    }
    const expectedObservationId = `o-${digest({ operationId: observation.operationId,
      locatorId: observation.locatorId, retrievedAt: observation.retrievedAt,
      observationIndex: observation.observationIndex })}`;
    if (observation.observationId !== expectedObservationId) {
      fail('RESEARCH_ARTIFACT_INVALID', 'Source observation identity is invalid.');
    }
    lastByLocator.set(observation.locatorId, source.citationId);
  });
  const recoveryIds = new Set();
  for (const operation of artifact.recovery.operations) {
    if (recoveryIds.has(operation.operationId) || operation.attempts !== operation.reservations.length) {
      fail('RESEARCH_ARTIFACT_INVALID', 'Recovery operation accounting is invalid.');
    }
    operation.reservations.forEach((reservation, index) => {
      if (reservation.attempt !== index + 1) fail('RESEARCH_ARTIFACT_INVALID', 'Attempt sequence is invalid.');
    });
    recoveryIds.add(operation.operationId);
  }
  const committed = artifact.recovery.operations.filter((item) => item.status === 'committed')
    .map((item) => item.operationId).sort();
  validateAttemptAccounting(artifact);
  if (stableStringify(committed) !== stableStringify([...artifact.recovery.committedOperationIds].sort())
    || artifact.metrics.attemptedCollections !== artifact.metrics.consumedLogicalUnits
    || artifact.metrics.attemptedCollections !== artifact.recovery.operations
      .reduce((sum, item) => sum + item.reservations.length, 0)
    || artifact.metrics.committedCollections !== committed.length) {
    fail('RESEARCH_ARTIFACT_INVALID', 'Recovery metrics do not match persisted operations.');
  }
  if (['validating', 'completed'].includes(artifact.status)
    && committed.length !== artifact.recovery.operations.length) {
    fail('RESEARCH_ARTIFACT_INVALID', 'Validation or completion requires every operation to be committed.');
  }
  if (['created', 'collecting'].includes(artifact.status)
    && (artifact.claims.length || artifact.decisions.length || artifact.diagnostics.length)) {
    fail('RESEARCH_ARTIFACT_INVALID', 'Unvalidated phases cannot contain validation results.');
  }
  if (artifact.status === 'created'
    && (artifact.sources.length || artifact.metrics.attemptedCollections
      || artifact.metrics.committedCollections || committed.length)) {
    fail('RESEARCH_ARTIFACT_INVALID', 'Created phase cannot contain collection effects.');
  }
  const eventTypes = artifact.events.map((event) => event.type);
  const terminalEvents = artifact.events.filter((event) => TERMINAL.has(event.type));
  if (eventTypes[0] !== 'created'
    || eventTypes.filter((type) => type === 'created').length !== 1
    || eventTypes.filter((type) => type === 'collecting').length > 1
    || eventTypes.filter((type) => type === 'validating').length > 1) {
    fail('RESEARCH_ARTIFACT_INVALID', 'Lifecycle event history is invalid.');
  }
  if (['collecting', 'validating', 'completed'].includes(artifact.status)
    && eventTypes.filter((type) => type === 'collecting').length !== 1) {
    fail('RESEARCH_ARTIFACT_INVALID', 'Artifact lacks its collecting lifecycle event.');
  }
  if ((['validating', 'completed'].includes(artifact.status)
    || (artifact.status === 'blocked' && artifact.reasonCode === 'CITATION_INVALID'))
    && eventTypes.filter((type) => type === 'validating').length !== 1) {
    fail('RESEARCH_ARTIFACT_INVALID', 'Artifact lacks its validating lifecycle event.');
  }
  if (TERMINAL.has(artifact.status)) {
    if (terminalEvents.length !== 1 || terminalEvents[0] !== artifact.events.at(-1)
      || terminalEvents[0].type !== artifact.status) {
      fail('RESEARCH_ARTIFACT_INVALID', 'Terminal event truth is invalid.');
    }
  } else if (terminalEvents.length) fail('RESEARCH_ARTIFACT_INVALID', 'Nonterminal artifact has a terminal event.');
  if (!TERMINAL.has(artifact.status) && artifact.reasonCode !== null) {
    fail('RESEARCH_ARTIFACT_INVALID', 'Nonterminal artifact cannot have a reason code.');
  }
  if (artifact.status === 'cancelled' && artifact.reasonCode !== 'CANCELLED') {
    fail('RESEARCH_ARTIFACT_INVALID', 'Cancelled artifact reason is invalid.');
  }
  if (artifact.status === 'blocked' && !BLOCK_REASON_CODES.has(artifact.reasonCode)) {
    fail('RESEARCH_ARTIFACT_INVALID', 'Blocked artifact reason is invalid.');
  }
  if (artifact.status === 'failed'
    && sanitizeErrorCode(artifact.reasonCode, null) !== artifact.reasonCode) {
    fail('RESEARCH_ARTIFACT_INVALID', 'Failed artifact reason is invalid.');
  }
  if (artifact.status === 'completed') {
    const phases = ['created', 'collecting', 'validating', 'completed'];
    let cursor = -1;
    for (const phase of phases) {
      cursor = eventTypes.indexOf(phase, cursor + 1);
      if (cursor < 0) fail('RESEARCH_ARTIFACT_INVALID', 'Completed artifact lacks required lifecycle evidence.');
    }
    if (artifact.reasonCode !== null || artifact.lineageStatus !== 'valid') {
      fail('RESEARCH_ARTIFACT_INVALID', 'Completed artifact has invalid terminal semantics.');
    }
  }
  for (const decision of artifact.decisions) {
    const allowed = ['declaredConfidence', 'id', 'input', 'lineageStatus',
      'providerVerification', 'recommendationVerification', 'result'];
    if (Object.keys(decision).some((key) => !allowed.includes(key))
      || decision.lineageStatus !== 'valid'
      || decision.providerVerification !== 'unverified'
      || decision.recommendationVerification !== 'unverified') {
      fail('RESEARCH_ARTIFACT_INVALID', 'Decision record is invalid.');
    }
    const input = clone(decision.input);
    for (const source of input.sources) {
      const retained = artifact.sources.find((item) => item.citationId === source.sourceId);
      if (!retained || retained.inaccessible || retained.contentHash !== source.contentHash) {
        fail('RESEARCH_ARTIFACT_INVALID', 'Decision source lineage is invalid.');
      }
    }
    input.sources = input.sources.map((source) => ({ id: source.id, reference: source.sourceId }));
    if (stableStringify(rankAlternatives(input)) !== stableStringify(decision.result)) {
      fail('RESEARCH_ARTIFACT_INVALID', 'Decision rubric result is not reproducible.');
    }
  }
  return artifact;
}

function assertMonotonicArtifact(previous, current) {
  if (stableStringify(previous.recovery.operations.map((item) => item.operationId))
    !== stableStringify(current.recovery.operations.map((item) => item.operationId))) {
    fail('RESEARCH_CHECKPOINT_INVALID', 'Planned collection operations changed.');
  }
  const immutable = ['schemaVersion', 'runId', 'planHash', 'policyHash', 'query', 'profile',
    'sourcePolicy', 'provider', 'limits', 'createdAt', 'uncertainty', 'openQuestions'];
  for (const key of immutable) {
    if (stableStringify(previous[key]) !== stableStringify(current[key])) {
      fail('RESEARCH_CHECKPOINT_INVALID', `Immutable artifact field changed: ${key}.`);
    }
  }
  if (previous.recovery.deadlineAt !== current.recovery.deadlineAt
    || Date.parse(current.updatedAt) < Date.parse(previous.updatedAt)
    || current.events.length < previous.events.length
    || stableStringify(current.events.slice(0, previous.events.length)) !== stableStringify(previous.events)) {
    fail('RESEARCH_CHECKPOINT_INVALID', 'Deadline or event history is not monotonic.');
  }
  if ((previous.claims.length > 0 || previous.status === 'validating')
    && (stableStringify(previous.claims) !== stableStringify(current.claims)
      || stableStringify(previous.decisions) !== stableStringify(current.decisions)
      || stableStringify(previous.diagnostics) !== stableStringify(current.diagnostics))) {
    fail('RESEARCH_CHECKPOINT_INVALID', 'Validated research results were rewritten.');
  }
  if (previous.lineageStatus === 'invalid' && current.lineageStatus !== 'invalid') {
    fail('RESEARCH_CHECKPOINT_INVALID', 'Invalid lineage cannot become valid on resume.');
  }
  for (const priorSource of previous.sources) {
    const nextSource = current.sources.find((item) => item.citationId === priorSource.citationId);
    if (!nextSource || nextSource.observations.length < priorSource.observations.length) {
      fail('RESEARCH_CHECKPOINT_INVALID', 'Source history was removed.');
    }
    const prior = { ...priorSource, observations: undefined };
    const next = { ...nextSource, observations: undefined };
    if (stableStringify(prior) !== stableStringify(next)
      || stableStringify(nextSource.observations.slice(0, priorSource.observations.length))
        !== stableStringify(priorSource.observations)) {
      fail('RESEARCH_CHECKPOINT_INVALID', 'Source history was rewritten.');
    }
  }
  const monotonicMetrics = ['attemptedCollections', 'committedCollections', 'uniqueVersions',
    'duplicateObservations', 'retries', 'consumedLogicalUnits', 'bytesRetained', 'elapsedMs'];
  for (const key of monotonicMetrics) {
    if (current.metrics[key] < previous.metrics[key]) {
      fail('RESEARCH_CHECKPOINT_INVALID', `Metric regressed: ${key}.`);
    }
  }
  for (const priorOperation of previous.recovery.operations) {
    const nextOperation = current.recovery.operations
      .find((item) => item.operationId === priorOperation.operationId);
    if (!nextOperation || nextOperation.attempts < priorOperation.attempts
      || nextOperation.reservations.length < priorOperation.reservations.length
      || (priorOperation.status === 'committed' && nextOperation.status !== 'committed')) {
      fail('RESEARCH_CHECKPOINT_INVALID', 'Recovery operation history regressed.');
    }
    for (const [index, reservation] of priorOperation.reservations.entries()) {
      const nextReservation = nextOperation.reservations[index];
      const allowed = reservation.status === 'pending'
        ? new Set(['pending', 'committed', 'failed', 'interrupted'])
        : new Set([reservation.status]);
      if (!nextReservation || nextReservation.attempt !== reservation.attempt
        || nextReservation.unit !== reservation.unit || !allowed.has(nextReservation.status)) {
        fail('RESEARCH_CHECKPOINT_INVALID', 'Attempt reservation history was rewritten.');
      }
    }
  }
}

function validateCheckpoint(checkpoint) {
  schemaFailure('RESEARCH_CHECKPOINT_INVALID', validateCheckpointShape, checkpoint);
  validateArtifact(checkpoint.artifact);
  if (checkpoint.artifact.recovery.revision !== checkpoint.revision
    || checkpoint.artifact.recovery.previousCheckpointHash !== checkpoint.previousCheckpointHash) {
    fail('RESEARCH_CHECKPOINT_INVALID', 'Checkpoint recovery metadata differs from its envelope.');
  }
  return checkpoint;
}

function assertTransition(from, to) {
  if (from === to) return;
  if (TERMINAL.has(from) || !TRANSITIONS[from]?.has(to)) {
    fail('RESEARCH_TRANSITION_INVALID', `Illegal research transition ${from} to ${to}.`);
  }
}

module.exports = {
  DEFAULT_LIMITS,
  DEFAULT_OPERATOR_POLICY,
  TERMINAL,
  applySecretPolicy,
  assertMonotonicArtifact,
  assertTransition,
  fail,
  readPlan,
  sanitizeErrorCode,
  validateArtifact,
  validateCheckpoint,
  validatePlan,
};
