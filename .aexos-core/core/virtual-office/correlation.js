/** Read-only, bounded projections of retained workflow evidence and office events. */
'use strict';

const { digest, stableStringify } = require('../execution/durable-evidence');
const { isLiveWorkflowReceipt } = require('../execution/workflow-runner');
const { projectIdentity } = require('./host-bridge');
const { ACCEPTED_EVENT_TYPES, EXPLICIT_STATES, cleanString } = require('./event-normalizer');
const { ConfinedFilesystem } = require('../permissions/confined-filesystem');

const PROTOCOL = 'aexos.correlation/v1';
const LIMITS = Object.freeze({ bytes: 8 * 1024 * 1024, receipts: 128, events: 5000, artifacts: 2000, rows: 512 });
const PHASES = Object.freeze([
  ['create-story', 'create-next-story', 'sm'], ['validate-story', 'validate-next-story', 'po'],
  ['plan-implementation', 'plan-create-implementation', 'architect'], ['implement-story', 'dev-develop-story', 'dev'],
  ['run-tests', 'qa-run-tests', 'qa'], ['review-story', 'qa-review-story', 'qa'],
]);
const SHA = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function fail(code) { throw Object.assign(new Error(code), { code }); }
function id(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(value)
    && !/AKIA[A-Z0-9]{12,}/.test(value)
    && cleanString(value, 96) === value ? value : null;
}
function sha(value) { return typeof value === 'string' && SHA.test(value) ? value : null; }
function artifactPath(value) {
  return typeof value === 'string' && value.length <= 240 && /^[A-Za-z0-9_./-]+$/.test(value)
    && !value.startsWith('/') && !value.split('/').some((part) => !part || part === '.' || part === '..' || part.startsWith('.env'))
    && !/(?:password|passwd|credential|secret|token|api[_-]?key)/i.test(value)
    && !/AKIA[A-Z0-9]{12,}/.test(value)
    && cleanString(value, 240) === value ? value : null;
}
function time(value) { const instant = typeof value === 'string' ? Date.parse(value) : NaN; return Number.isFinite(instant) ? instant : null; }
function safeInput(input) {
  let serialized;
  try { serialized = JSON.stringify(input); } catch { fail('CORRELATION_INPUT_INVALID'); }
  if (!serialized || Buffer.byteLength(serialized) > LIMITS.bytes) fail('CORRELATION_INPUT_LIMIT');
  if (!input || input.protocol !== 'aexos.correlation-input/v1'
    || Object.keys(input).some((key) => !['protocol', 'receipts', 'events'].includes(key))
    || !Array.isArray(input.receipts) || input.receipts.length > LIMITS.receipts
    || !Array.isArray(input.events) || input.events.length > LIMITS.events
    || [...input.receipts, ...input.events].some((item) => !item || typeof item !== 'object' || Array.isArray(item))) fail('CORRELATION_INPUT_INVALID');
}

function projectReceipt(receipt, sourceHash, context) {
  const c = receipt?.correlation;
  const explicitProjects = [c?.projectId, receipt?.projectId].filter((value) => value !== undefined && value !== null);
  if (explicitProjects.some((value) => value !== context.projectId)) return null;
  const base = { sourceHash, sourceKind: 'workflow-receipt', sourcePointers: ['/correlation', '/status'],
    runId: null, storyId: null, workflowId: null, projectId: explicitProjects.length ? context.projectId : null, status: 'legacy',
    declaredStatus: null, assurance: 'unverified-import', phases: [], artifacts: [],
    acceptance: 'not-established', recovery: 'not-observed', provider: { kind: 'unverified', model: null },
    unresolved: ['RUN_IDENTITY_UNAVAILABLE', ...(explicitProjects.length ? [] : ['PROJECT_IDENTITY_UNAVAILABLE'])] };
  if (!receipt || receipt.receiptVersion !== 1 || !c || c.protocol !== 'aexos.workflow-correlation/v1') return base;
  if (c.projectId !== context.projectId) return null;
  const start = time(c.startedAt), finish = time(c.finishedAt);
  if (!UUID.test(c.runId) || !id(c.storyId) || !sha(c.storyHash) || !sha(receipt.runHash)
    || !sha(receipt.policyHash) || !sha(receipt.workflowHash) || !id(receipt.workflowId)
    || start === null || finish === null || finish < start || finish > context.now + 60000
    || !Array.isArray(c.requiredPhases) || c.requiredPhases.length !== PHASES.length
    || PHASES.some(([phaseId, task, owner], index) => {
      const p = c.requiredPhases[index]; return p?.phaseId !== phaseId || p.task !== task || p.owner !== owner;
    })
    || !Array.isArray(receipt.completed) || receipt.completed.length > PHASES.length
    || !Array.isArray(receipt.bindings) || receipt.bindings.length !== PHASES.length
    || !Array.isArray(receipt.observations) || receipt.observations.length > 2000) {
    return { ...base, status: 'error', unresolved: ['RECEIPT_CONTRACT_INVALID'] };
  }
  const live = isLiveWorkflowReceipt(receipt);
  const fixture = receipt.executor?.kind === 'fixture' || receipt.executor?.kind === 'simulated';
  const row = { ...base, runId: c.runId, storyId: c.storyId, workflowId: receipt.workflowId,
    storyHash: c.storyHash, runHash: receipt.runHash, workflowHash: receipt.workflowHash,
    startedAt: new Date(start).toISOString(), finishedAt: new Date(finish).toISOString(),
    declaredStatus: ['ACCEPTED', 'BLOCKED', 'FAILED', 'CANCELLED', 'RUNNING', 'QUEUED'].includes(receipt.status) ? receipt.status : null,
    assurance: fixture ? 'fixture' : live ? 'live-runtime' : 'unverified-import', unresolved: [],
    provider: { kind: receipt.executor?.kind === 'deterministic-local' ? 'deterministic-local' : 'unverified', model: null },
  };
  if (new Set(receipt.completed.map((phase) => phase?.phaseId)).size !== receipt.completed.length
    || receipt.completed.some((phase) => !PHASES.some(([name]) => phase?.phaseId === name))) row.unresolved.push('PHASE_IDENTITY_CONFLICT');
  for (const [phaseId, task, owner] of PHASES) {
    const matches = receipt.completed.map((value, index) => ({ value, index })).filter(({ value }) => value?.phaseId === phaseId);
    const binding = receipt.bindings.filter((value) => value?.phaseId === phaseId);
    const entry = matches[0], phase = entry?.value, acceptance = phase?.acceptance;
    let verified = matches.length === 1 && phase.task === task && binding.length === 1 && binding[0].task === task
      && binding[0].agentId === owner && binding[0].requireAcceptance === true
      && sha(binding[0].resolvedContractHash) && acceptance?.contractHash === binding[0].resolvedContractHash
      && acceptance.verdict === 'ACCEPTED' && acceptance.evidenceLevel === 'declared-checks-passed'
      && Array.isArray(acceptance.checks) && acceptance.checks.length > 0 && acceptance.checks.every((check) => check?.passed === true)
      && Array.isArray(acceptance.artifacts) && acceptance.artifacts.length > 0 && acceptance.artifacts.length <= LIMITS.artifacts
      && Array.isArray(phase.produced);
    if (receipt.observations.some((check) => check?.phaseId === phaseId && check.stage === 'after' && check.passed === false)) {
      verified = false; row.unresolved.push('CONTRADICTORY_OR_FAILED_CHECK');
    }
    if (verified) {
      for (const [index, artifact] of acceptance.artifacts.entries()) {
        const target = artifactPath(artifact?.path);
        const observed = receipt.observations.filter((check) => check?.phaseId === phaseId && check.stage === 'after'
          && check.target === artifact?.path && check.passed === true && sha(check.sha256));
        if (!target || !phase.produced.includes(artifact.path) || !Number.isSafeInteger(artifact.bytes) || artifact.bytes < 0
          || observed.length === 0 || new Set(observed.map((check) => check.sha256)).size !== 1) {
          verified = false; row.unresolved.push('ARTIFACT_EVIDENCE_MISSING'); continue;
        }
        row.artifacts.push({ artifactId: digest({ runId: c.runId, phaseId, target }), phaseId, path: target,
          sha256: observed[0].sha256, bytes: artifact.bytes,
          sourcePointer: `/completed/${entry.index}/acceptance/artifacts/${index}`,
          observationPointers: observed.map((check) => `/observations/${receipt.observations.indexOf(check)}`) });
      }
    }
    row.phases.push({ phaseId, task, owner, status: verified ? 'checks-passed' : phase ? 'unaccepted' : 'missing',
      contractHash: sha(acceptance?.contractHash), sourcePointer: entry ? `/completed/${entry.index}` : null });
  }
  if (row.artifacts.length > LIMITS.artifacts) fail('CORRELATION_ARTIFACT_LIMIT');
  const complete = row.phases.every((phase) => phase.status === 'checks-passed') && row.unresolved.length === 0
    && receipt.workflowOutcome?.status === 'completed' && receipt.workflowOutcome.confidenceGatePassed === true
    && Array.isArray(receipt.workflowOutcome.failedPhases) && receipt.workflowOutcome.failedPhases.length === 0;
  if (!complete) row.unresolved.push('REQUIRED_GATE_OR_ACCEPTANCE_MISSING');
  row.status = receipt.status === 'ACCEPTED' ? complete ? 'completed-unaccepted' : 'partial'
    : ({ BLOCKED: 'blocked', FAILED: 'failed', CANCELLED: 'cancelled', RUNNING: 'running', QUEUED: 'queued' }[receipt.status] || 'partial');
  if (live && complete && receipt.status === 'ACCEPTED') { row.status = 'accepted'; row.acceptance = 'local-declared-checks'; }
  else if (complete) row.acceptance = 'declared-only';
  if (!live) row.unresolved.push('RUNTIME_ORIGIN_UNVERIFIED');
  if (fixture) { row.status = receipt.executor.kind; row.acceptance = 'fixture-only'; }
  if (context.now - finish > context.maxAgeMs) { row.status = 'stale'; row.acceptance = 'not-current'; row.unresolved.push('EVIDENCE_STALE'); }
  row.unresolved = [...new Set(row.unresolved)].sort();
  return row;
}

function projectCorrelation(input, options = {}) {
  safeInput(input);
  const projectId = projectIdentity(options.projectRoot);
  const now = options.now === undefined ? Date.now() : options.now;
  const maxAgeMs = options.maxAgeMs === undefined ? 86400000 : options.maxAgeMs;
  const limit = options.limit === undefined ? LIMITS.rows : options.limit;
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(maxAgeMs) || maxAgeMs < 1 || maxAgeMs > 604800000
    || !Number.isSafeInteger(limit) || limit < 1 || limit > LIMITS.rows
    || (options.runId !== undefined && !UUID.test(options.runId))
    || (options.storyId !== undefined && !id(options.storyId))) fail('CORRELATION_OPTIONS_INVALID');
  const seen = new Set(), rows = [], runHashes = new Map(), eventHashes = new Map(), groupedReceipts = new Map();
  let excluded = 0, duplicates = 0;
  for (const receipt of input.receipts) {
    const sourceHash = digest(receipt);
    if (groupedReceipts.has(sourceHash)) {
      duplicates += 1;
      if (isLiveWorkflowReceipt(receipt)) groupedReceipts.set(sourceHash, receipt);
    } else groupedReceipts.set(sourceHash, receipt);
  }
  for (const [sourceHash, receipt] of groupedReceipts) {
    seen.add(sourceHash);
    const row = projectReceipt(receipt, sourceHash, { projectId, now, maxAgeMs });
    if (!row) { excluded += 1; continue; }
    rows.push(row);
    if (row.runId) {
      const hashes = runHashes.get(row.runId) || new Set(); hashes.add(sourceHash); runHashes.set(row.runId, hashes);
    }
  }
  for (const event of input.events) {
    if (!event || event.projectId !== projectId) { excluded += 1; continue; }
    const sourceHash = digest(event);
    if (seen.has(sourceHash)) { duplicates += 1; continue; }
    seen.add(sourceHash);
    const stamp = Number.isSafeInteger(event.timestamp) ? event.timestamp : null;
    const eventId = id(event.id);
    const supported = Boolean(eventId) && ACCEPTED_EVENT_TYPES.has(event.type) && stamp !== null && stamp <= now + 60000;
    if (eventId) { const hashes = eventHashes.get(eventId) || new Set(); hashes.add(sourceHash); eventHashes.set(eventId, hashes); }
    rows.push({ sourceHash, sourceKind: 'office-event', sourcePointers: ['/id', '/type', '/timestamp', '/state'],
      projectId, eventId, runId: null, storyId: id(event.storyId || event.cyryx_story_id),
      status: !supported ? 'error' : now - stamp > maxAgeMs ? 'stale'
        : event.state === 'completed' ? 'completed-unaccepted' : EXPLICIT_STATES.has(event.state) ? event.state : 'partial',
      assurance: 'telemetry-only', acceptance: 'not-established', recovery: 'not-observed',
      phases: [], artifacts: [], unresolved: ['EXACT_RUNTIME_LINK_UNAVAILABLE'],
    });
  }
  for (const row of rows) if (row.runId && runHashes.get(row.runId).size > 1) {
    row.status = 'error'; row.acceptance = 'not-established'; row.unresolved.push('RUN_RECEIPT_CONFLICT');
  }
  for (const row of rows) if (row.eventId && eventHashes.get(row.eventId).size > 1) {
    row.status = 'error'; row.acceptance = 'not-established'; row.unresolved.push('EVENT_IDENTITY_CONFLICT');
  }
  const filtered = rows.filter((row) => (!options.runId || row.runId === options.runId)
    && (!options.storyId || row.storyId === options.storyId)).sort((a, b) => a.sourceHash.localeCompare(b.sourceHash));
  return { protocol: PROTOCOL, projectId, observedAt: new Date(now).toISOString(), readOnly: true,
    controls: [], rows: filtered.slice(0, limit), limits: LIMITS,
    counts: { projected: Math.min(filtered.length, limit), omitted: Math.max(0, filtered.length - limit), excluded, duplicates },
    exclusions: ['No provider or release certification', 'Imports and telemetry do not authenticate runtime acceptance',
      'Recovery and supplemental research, database and SOP links remain not-observed without exact runtime associations'] };
}

function correlationGraph(model) {
  if (model?.protocol !== PROTOCOL || model.readOnly !== true || model.controls.length) fail('CORRELATION_MODEL_INVALID');
  const nodes = [], edges = [];
  for (const row of model.rows) {
    nodes.push({ id: row.sourceHash, kind: row.sourceKind, status: row.status });
    for (const artifact of row.artifacts) {
      const nodeId = `${row.sourceHash}:${artifact.artifactId}`;
      nodes.push({ id: nodeId, kind: 'artifact', path: artifact.path, sha256: artifact.sha256 });
      edges.push({ from: row.sourceHash, to: nodeId, relation: 'declares-artifact', sourcePointer: artifact.sourcePointer });
    }
  }
  return { protocol: 'aexos.correlation-graph/v1', readOnly: true, controls: [], nodes, edges };
}

async function readCorrelationFile(file, options) {
  const reader = new ConfinedFilesystem({ projectRoot: options.projectRoot });
  const result = await reader.dispatch({ operation: 'read', target: file, maxBytes: LIMITS.bytes });
  if (!result.success) fail('CORRELATION_READ_DENIED');
  let input;
  try { input = JSON.parse(result.data); } catch { fail('CORRELATION_INPUT_INVALID'); }
  return projectCorrelation(input, options);
}

module.exports = { PROTOCOL, LIMITS, PHASES, projectCorrelation, correlationGraph, readCorrelationFile, stableStringify };
