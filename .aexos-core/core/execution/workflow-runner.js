'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const yaml = require('js-yaml');
const Ajv = require('ajv');
const { AgentRuntime } = require(path.resolve(__dirname, 'agent-runtime'));
const { createExecutionBinding, relativeFile, selectedTask, sha256 } = require(path.resolve(__dirname, 'execution-binding'));
const { LocalPlanProvider } = require(path.resolve(__dirname, 'local-plan-provider'));
const { LocalPlanChecker } = require(path.resolve(__dirname, 'local-plan-checker'));
const { createWorkflowControlStore } = require(path.resolve(__dirname, 'workflow-control-store'));
const { createCapabilityBroker } = require(path.resolve(__dirname, '../permissions/capability-broker'));
const { createDispatchGovernance, scanAutomatedIntent, validateStoryBinding } = require(path.resolve(__dirname, '../permissions/dispatch-governance'));
const { normalizeWorkflowDocument } = require(path.resolve(__dirname, '../orchestration/workflow-normalizer'));
const WorkflowOrchestrator = require(path.resolve(__dirname, '../orchestration/workflow-orchestrator'));
const { createSopRuntimeHooks, prepareSelectedSopRun } = require(path.resolve(__dirname, '../workflow-engineering/sop/runtime-association'));
const ajv = new Ajv({ allErrors: true, strict: false });
const validateRun = ajv.compile(require(path.resolve(__dirname, '../../schemas/local-plan-run.schema.json')));
const validatePolicy = ajv.compile(require(path.resolve(__dirname, '../../schemas/local-plan-policy.schema.json')));
const liveReceipts = new WeakMap();
const DIAGNOSTIC_CODE = /^[A-Z][A-Z0-9_]{0,79}$/;
const ORCHESTRATOR_LOG_LIMITS = Object.freeze({ records: 256, recordBytes: 4096,
  aggregateBytes: 65536 });

function diagnosticArgument(value) {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string': return value;
    case 'undefined': return 'undefined';
    case 'boolean':
    case 'number':
    case 'bigint':
    case 'symbol': return String(value);
    case 'function': return '[function]';
    default:
      try { return Array.isArray(value) ? '[array]' : '[object]'; }
      catch { return '[unavailable]'; }
  }
}

function truncateUtf8(value, maximumBytes) {
  if (Buffer.byteLength(value, 'utf8') <= maximumBytes) return value;
  let bytes = 0;
  let result = '';
  for (const character of value) {
    const width = Buffer.byteLength(character, 'utf8');
    if (bytes + width > maximumBytes) break;
    result += character;
    bytes += width;
  }
  return result;
}

function createBoundedOrchestratorLogger(runtimeEvents) {
  let retainedRecords = 0;
  let retainedUtf8Bytes = 0;
  let truncatedRecords = 0;
  let droppedRecords = 0;
  let droppedUtf8Bytes = 0;
  let finalized = false;
  let failure = null;
  const saturatingAdd = (left, right) => Math.min(Number.MAX_SAFE_INTEGER, left + right);
  const sinkFailure = (cause) => {
    const error = new Error('The governed workflow diagnostic sink failed.');
    error.code = 'WORKFLOW_DIAGNOSTIC_SINK_FAILED';
    error.cause = cause;
    failure = error;
    return error;
  };
  const append = (record) => {
    try { runtimeEvents.push(Object.freeze(record)); }
    catch (cause) { throw sinkFailure(cause); }
  };
  const logger = Object.freeze({
    log(...args) {
      if (failure) throw failure;
      if (finalized) throw sinkFailure(new Error('DIAGNOSTIC_SINK_FINALIZED'));
      try {
        const text = args.map(diagnosticArgument).join(' ');
        const originalBytes = Buffer.byteLength(text, 'utf8');
        const availableBytes = ORCHESTRATOR_LOG_LIMITS.aggregateBytes - retainedUtf8Bytes;
        if (retainedRecords >= ORCHESTRATOR_LOG_LIMITS.records - 1 || availableBytes <= 0) {
          droppedRecords = saturatingAdd(droppedRecords, 1);
          droppedUtf8Bytes = saturatingAdd(droppedUtf8Bytes, originalBytes);
          return;
        }
        const maximumBytes = Math.min(ORCHESTRATOR_LOG_LIMITS.recordBytes, availableBytes);
        const retained = truncateUtf8(text, maximumBytes);
        const retainedBytes = Buffer.byteLength(retained, 'utf8');
        const truncated = retainedBytes < originalBytes;
        append({ type: 'orchestrator_log', level: 'log', sequence: retainedRecords + 1,
          text: retained, truncated });
        retainedRecords += 1;
        retainedUtf8Bytes += retainedBytes;
        if (truncated) {
          truncatedRecords = saturatingAdd(truncatedRecords, 1);
          droppedUtf8Bytes = saturatingAdd(droppedUtf8Bytes, originalBytes - retainedBytes);
        }
      } catch (cause) {
        if (cause?.code === 'WORKFLOW_DIAGNOSTIC_SINK_FAILED') throw cause;
        throw sinkFailure(cause);
      }
    },
  });
  return {
    logger,
    finalize() {
      if (failure) throw failure;
      if (finalized) return;
      finalized = true;
      append({ type: 'orchestrator_log_summary', retainedRecords, retainedUtf8Bytes,
        truncatedRecords, droppedRecords, droppedUtf8Bytes,
        limits: ORCHESTRATOR_LOG_LIMITS,
        truncated: truncatedRecords > 0 || droppedRecords > 0 });
    },
    assertHealthy() { if (failure) throw failure; },
  };
}

function isLiveWorkflowReceipt(receipt) {
  return Boolean(receipt && liveReceipts.has(receipt)
    && liveReceipts.get(receipt) === sha256(JSON.stringify(receipt)));
}

function fail(code, message) { throw Object.assign(new Error(message), { code }); }

function boundedDiagnosticCode(value) {
  return typeof value === 'string' && DIAGNOSTIC_CODE.test(value) ? value : null;
}

function projectWorkflowFailure({ error, canonical, failedPhases, observations }) {
  const result = error?.details?.result;
  const phaseNumber = failedPhases?.at(-1);
  const phase = Number.isInteger(phaseNumber) && phaseNumber > 0
    ? canonical?.sequence?.[phaseNumber - 1]
    : null;
  const outerCode = boundedDiagnosticCode(error?.code);
  if (!result || typeof result !== 'object' || Array.isArray(result)
    || result.success !== false || result.status !== 'failed'
    || !phase || typeof phase.id !== 'string' || typeof phase.task !== 'string'
    || typeof phase.agent !== 'string' || !outerCode) return null;

  const phaseObservationIndexes = [];
  const effectObservationIndexes = [];
  for (const [index, observation] of (Array.isArray(observations) ? observations : []).entries()) {
    if (phaseObservationIndexes.length >= 64 || observation?.phaseId !== phase.id) continue;
    phaseObservationIndexes.push(index);
    if ((observation.effects && typeof observation.effects === 'object')
      || typeof observation.transactionId === 'string'
      || (observation.receipt && typeof observation.receipt === 'object')) {
      effectObservationIndexes.push(index);
    }
  }

  const causeCode = boundedDiagnosticCode(result.error?.code);
  const acceptanceCode = boundedDiagnosticCode(result.acceptance?.code);
  return {
    phase: { number: phaseNumber, phaseId: phase.id, task: phase.task, owner: phase.agent },
    outerCode,
    success: false,
    status: 'failed',
    ...(causeCode ? { causeCode } : {}),
    ...(result.acceptance?.verdict === 'REJECTED' && acceptanceCode
      ? { acceptance: { verdict: 'REJECTED', code: acceptanceCode } }
      : {}),
    diagnosticRefs: {
      collection: 'observations',
      phaseObservationIndexes,
      effectObservationIndexes,
    },
  };
}

function readJson(file, root, validator, code) {
  const relative = relativeFile(root, path.relative(root, path.resolve(file)), { mustExist: true });
  const absolute = path.resolve(root, relative);
  if (fs.statSync(absolute).size > 6 * 1024 * 1024) fail('WORKFLOW_INPUT_SIZE', 'Workflow input exceeds the bounded JSON limit.');
  const bytes = fs.readFileSync(absolute);
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); }
  catch { fail('WORKFLOW_INPUT_JSON', 'Workflow input must be valid JSON.'); }
  if (!validator(value)) fail(code, 'Workflow input does not match its strict versioned schema.');
  return { value, hash: sha256(bytes) };
}

function scanPlan(run) {
  const content = [JSON.stringify(run)];
  for (const phase of run.phases) {
    for (const operation of phase.operations) {
      if (operation.contentBase64 !== undefined) {
        if (typeof operation.contentBase64 !== 'string' || operation.contentBase64.length > 5592416) {
          fail('WORKFLOW_CONTENT_INVALID', 'Operation content exceeds the supported bound.');
        }
        const bytes = Buffer.from(operation.contentBase64, 'base64');
        if (bytes.toString('base64') !== operation.contentBase64 || bytes.length > 4 * 1024 * 1024) {
          fail('WORKFLOW_CONTENT_INVALID', 'Operation content must be canonical bounded base64.');
        }
        content.push(bytes.toString('utf8'));
      }
    }
  }
  if (!scanAutomatedIntent(content.join('\n')).safe) fail('WORKFLOW_INTENT_REJECTED', 'Workflow intent/content failed the existing intent scanner.');
}

function validateJourney(run, canonical, root, protectedPaths = []) {
  const ids = run.phases.map((phase) => phase.id);
  if (new Set(ids).size !== ids.length || ids.some((id, index) => id !== canonical.sequence[index].id)) {
    fail('WORKFLOW_PHASE_SET_INVALID', 'The selected journey requires exactly the canonical ordered phases.');
  }
  const writes = new Set();
  const pathKey = (value) => {
    const normalized = value.replace(/\\/g, '/');
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
  };
  const protectedFiles = new Set([run.story, ...protectedPaths,
    ...run.phases.map((phase) => phase.inputs.brownfieldEvidence).filter(Boolean),
    ...run.phases.flatMap((phase) => phase.checks.filter((check) => check.type === 'node-test').map((check) => check.target)),
  ].map(pathKey));
  const phaseMap = new Map(run.phases.map((phase) => [phase.id, phase]));
  for (const phase of run.phases) {
    if (phase.inputs.brownfieldEvidence) {
      if (phase.id !== 'plan-implementation' || run.journey !== 'brownfield') {
        fail('WORKFLOW_BROWNFIELD_SCOPE', 'Brownfield evidence is a planning input for the brownfield journey only.');
      }
      relativeFile(root, phase.inputs.brownfieldEvidence, { mustExist: true });
      if (!phase.checks.some((check) => check.target === phase.inputs.brownfieldEvidence
        && check.type === 'utf8-sha256' && check.stage === 'before')) {
        fail('WORKFLOW_BROWNFIELD_HASH_REQUIRED', 'Brownfield evidence requires an operator-approved before hash.');
      }
    }
    for (const operation of phase.operations) {
      relativeFile(root, operation.target);
      if (operation.operation !== 'read') {
        const key = pathKey(operation.target);
        if (protectedFiles.has(key)) fail('WORKFLOW_PROTECTED_INPUT', 'A run may not overwrite its authority, input plan, policy or approved acceptance tests.');
        if (writes.has(key)) fail('WORKFLOW_OUTPUT_COLLISION', 'A selected run may publish each artifact only once.');
        writes.add(key);
        if (!phase.checks.some((check) => check.stage === 'after' && check.type === 'utf8-sha256' && check.target === operation.target)) {
          fail('WORKFLOW_OUTPUT_CHECK_REQUIRED', 'Every publication needs an independently executed after-hash check.');
        }
      }
    }
    for (const check of phase.checks) relativeFile(root, check.target);
    if (!phase.checks.some((check) => check.stage === 'after')) fail('WORKFLOW_ACCEPTANCE_REQUIRED', 'Every phase requires independent after checks.');
  }
  const implementation = phaseMap.get('implement-story');
  const source = implementation.inputs.source;
  const sourceWrite = implementation.operations.find((operation) => operation.target === source);
  if (!sourceWrite) fail('WORKFLOW_SOURCE_REQUIRED', 'Implementation must actually publish its declared source.');
  if (run.journey === 'greenfield') {
    if (sourceWrite.operation !== 'guarded-create' || fs.existsSync(path.resolve(root, source))) fail('WORKFLOW_GREENFIELD_INVALID', 'Greenfield requires a newly created source artifact.');
  } else {
    if (sourceWrite.operation !== 'guarded-recoverable-replace') fail('WORKFLOW_REPLACEMENT_REQUIRED', 'Existing projects require the reviewed conditional replacement operation.');
    const before = implementation.checks.find((check) => check.target === source && check.stage === 'before' && check.type === 'utf8-sha256');
    const after = implementation.checks.find((check) => check.target === source && check.stage === 'after' && check.type === 'utf8-sha256');
    if (!before || !after || before.sha256 === after.sha256) fail('WORKFLOW_CHANGE_REQUIRED', 'Existing-project delivery requires a verified non-no-op change.');
    if (!phaseMap.get('review-story').checks.some((check) => check.type === 'utf8-sha256' && !writes.has(pathKey(check.target)))) {
      fail('WORKFLOW_PRESERVATION_REQUIRED', 'Existing-project acceptance requires an unrelated preservation check.');
    }
  }
  for (const id of ['run-tests', 'review-story']) {
    if (!phaseMap.get(id).checks.some((check) => check.type === 'node-test' && check.stage === 'after' && check.expectedExit === 0)) {
      fail('WORKFLOW_TEST_REQUIRED', 'Test and review phases must execute a nonempty actual Node test suite.');
    }
  }
  if (run.journey === 'defect') {
    const red = implementation.checks.find((check) => check.type === 'node-test' && check.stage === 'before' && check.expectedExit === 1);
    if (!red || !phaseMap.get('run-tests').checks.some((check) => check.type === 'node-test' && check.expectedExit === 0
      && check.target === red.target && check.sha256 === red.sha256)) {
      fail('WORKFLOW_DEFECT_REPRODUCTION_REQUIRED', 'Defect acceptance needs the same approved test to fail before and pass after repair.');
    }
  }
  return phaseMap;
}

function requirementsFor(phase, root, phases) {
  const requirements = new Map();
  const add = (capability, action, target) => {
    const requirement = { capability, action, resource: path.resolve(root, target), scope: root };
    requirements.set(JSON.stringify(requirement), requirement);
  };
  phase.operations.forEach((operation) => add('filesystem', operation.operation, operation.target));
  phase.checks.forEach((check) => {
    add('filesystem', 'read', check.target);
    if (check.type === 'node-test') add('process', 'node-test', check.target);
  });
  if (phase.id === 'validate-story') add('filesystem', 'read', phases.get('create-story').inputs.output);
  return [...requirements.values()];
}

/** Assemble existing broker, governance, runtime and orchestrator. There is no second phase loop. */
async function runGovernedWorkflow(options = {}) {
  const root = fs.realpathSync(path.resolve(options.projectRoot || process.cwd()));
  const frameworkRoot = fs.realpathSync(path.resolve(options.frameworkRoot || path.resolve(__dirname, '../../..')));
  if (options.executor !== 'local-plan') fail('WORKFLOW_EXECUTOR_UNAVAILABLE', 'Explicit supported executor local-plan is required.');
  if (options.nativePhaseObserver !== undefined && typeof options.nativePhaseObserver !== 'function') {
    fail('WORKFLOW_NATIVE_OBSERVER_INVALID', 'The native phase observer must be a trusted runtime callback.');
  }
  if (!options.runFile || !options.policyFile) fail('WORKFLOW_POLICY_REQUIRED', 'A run file and separate operator policy are required.');
  const runInput = readJson(options.runFile, root, validateRun, 'WORKFLOW_RUN_INVALID');
  const policyInput = readJson(options.policyFile, root, validatePolicy, 'WORKFLOW_POLICY_INVALID');
  const run = runInput.value;
  const policy = policyInput.value;
  if (policy.projectRoot !== root || policy.runHash !== runInput.hash) fail('WORKFLOW_POLICY_MISMATCH', 'Operator policy must bind this exact run and canonical project.');
  scanPlan(run);
  relativeFile(root, run.story, { mustExist: true });
  const story = validateStoryBinding(run.story, { projectRoot: root });
  const correlation = { protocol: 'aexos.workflow-correlation/v1', runId: randomUUID(),
    projectId: sha256(root).slice(0, 32), storyId: story.storyId,
    storyHash: sha256(fs.readFileSync(path.resolve(root, run.story))), startedAt: new Date().toISOString() };
  const workflowPath = path.resolve(frameworkRoot, '.aexos-core/development/workflows/story-development-cycle.yaml');
  const workflowHash = sha256(fs.readFileSync(workflowPath));
  const canonical = normalizeWorkflowDocument(yaml.load(fs.readFileSync(workflowPath, 'utf8')));
  const phaseMap = validateJourney(run, canonical, root, [options.runFile, options.policyFile]
    .map((file) => path.relative(root, path.resolve(file)).replace(/\\/g, '/')));
  if (!policy.allowChildProcessIO) fail('WORKFLOW_PROCESS_AUTHORITY_REQUIRED', 'Actual Node checks require explicit operator authorization for child-process I/O; no sandbox is claimed.');
  const control = createWorkflowControlStore(options.controlRoot, root);
  const observations = [];
  const runtimeEvents = [];
  const orchestratorDiagnostics = createBoundedOrchestratorLogger(runtimeEvents);
  const completed = [];
  const capabilityBroker = createCapabilityBroker({
    // Untrusted run requirements cannot grant themselves permission.
    policy: (request) => policy.grants.some((grant) => grant.agentId === request.agentId && grant.task === request.task
      && grant.capability === request.capability && grant.resource === request.resource && grant.scope === request.scope
      && request.actions.length === 1 && grant.action === request.actions[0]),
  });
  const governance = createDispatchGovernance();
  let runtime;
  const checker = new LocalPlanChecker({ projectRoot: root, capabilityBroker, getGuard: () => runtime.operationGuard, phases: phaseMap,
    evidenceSink: (record) => observations.push(record),
  });
  const provider = new LocalPlanProvider({ phases: phaseMap, beforePhase: (phase) => checker.verify(phase, 'before'),
    evidenceSink: (record) => observations.push(record),
  });
  const outputOwners = new Map();
  const executionBindings = {};
  for (const phase of canonical.sequence) {
    const plan = phaseMap.get(phase.id);
    const task = selectedTask(phase.task, frameworkRoot, root);
    const requiredCapabilities = requirementsFor(plan, root, phaseMap);
    const leases = requiredCapabilities.map((requirement) => capabilityBroker.grant({ ...requirement,
      agentId: phase.agent, task: phase.task, actions: [requirement.action], ttlMs: 300000,
    }));
    const binding = createExecutionBinding({ bindingVersion: 1, phaseId: phase.id, task: phase.task, agentId: phase.agent,
      projectRoot: root, story: run.story, taskContractHash: task.taskContractHash, inputs: plan.inputs,
      requiredCapabilities, budgetScope: policy.budgetScope, budgetCeilingUsd: policy.budgetCeilingUsd,
      estimatedCostUsd: plan.estimatedCostUsd || 0, requireAcceptance: true,
    }, { projectRoot: root, frameworkRoot, capabilityBroker, leases, approvedFilesystemOperations: plan.operations });
    executionBindings[phase.id] = binding;
    checker.bind(phase.id, binding);
    for (const output of binding.contract.produces) {
      if (outputOwners.has(output.path)) fail('WORKFLOW_CONTRACT_COLLISION', 'Phase contracts cannot share outputs.');
      outputOwners.set(output.path, phase.id);
    }
  }
  const selectedBindings = canonical.sequence.map((phase) => executionBindings[phase.id]);
  const sopPlan = options.sopRuntimeAssociation ? await prepareSelectedSopRun(options.sopRuntimeAssociation, {
    runId: correlation.runId, projectId: correlation.projectId, runHash: runInput.hash,
    policyHash: policyInput.hash, storyHash: correlation.storyHash, workflowHash,
    startedAt: correlation.startedAt,
  }, selectedBindings) : null;
  runtime = new AgentRuntime({ provider, projectRoot: root, capabilityBroker, governanceController: governance,
    trustedReceiptSink: control.retainPreparedReceipt,
    trustedReceiptResolver: control.resolvePreparedReceipt,
    nativeValidationAuthorization: options.nativeValidationAuthorization,
    nativePhaseObserver: options.nativePhaseObserver,
    nativeFiniteSessionAuthorization: options.nativeFiniteSessionAuthorization,
    trustedPublicationAccounting: control.trustedPublicationAccounting,
    ...(sopPlan ? { sopRuntimeHooks: createSopRuntimeHooks(sopPlan) } : {}),
    evidenceSink: (record) => runtimeEvents.push(record),
    outcomeVerifiers: { checklist: async (check, context) => {
      if (check.ref !== 'selected-sdlc-phase' || context.artifacts.length === 0) return false;
      const owners = new Set(context.artifacts.map((artifact) => outputOwners.get(artifact.path)));
      if (owners.size !== 1 || owners.has(undefined)) return false;
      return checker.verify(phaseMap.get([...owners][0]), 'after');
    } },
  });
  const orchestrator = new WorkflowOrchestrator(workflowPath, { projectRoot: root, frameworkRoot, runtime,
    executionBindings, parallel: false,
    workflowBudgetScope: policy.budgetScope, workflowBudgetCeilingUsd: policy.budgetCeilingUsd,
    stateRoot: path.join(control.root, `workflow-${runInput.hash}`),
    logger: orchestratorDiagnostics.logger,
    onPhaseStart: () => {}, onPhaseComplete: (phase, result) => completed.push({ phaseId: phase.id, task: phase.task,
      produced: result.produced, acceptance: result.acceptance, usage: result.usage, evidence: result.evidence,
    }),
  });
  let summary;
  let errorCode = null;
  let failure = null;
  try { control.assertIdentity(); summary = await orchestrator.execute(); }
  catch (error) {
    errorCode = boundedDiagnosticCode(error.code) || 'WORKFLOW_EXECUTION_FAILED';
    failure = projectWorkflowFailure({ error, canonical,
      failedPhases: orchestrator.executionState.failedPhases, observations });
  }
  try {
    orchestratorDiagnostics.finalize();
    orchestratorDiagnostics.assertHealthy();
  } catch (_error) {
    summary = undefined;
    errorCode = 'WORKFLOW_DIAGNOSTIC_SINK_FAILED';
    failure = null;
  }
  const accepted = errorCode === null && completed.length === canonical.sequence.length
    && completed.every((phase) => phase.acceptance?.verdict === 'ACCEPTED')
    && orchestrator.executionState.failedPhases.length === 0 && summary?.status === 'completed'
    && summary?.confidenceGate?.passed === true;
  const receipt = {
    receiptVersion: 1, status: accepted ? 'ACCEPTED' : 'BLOCKED', errorCode,
    correlation: { ...correlation, finishedAt: new Date().toISOString(),
      requiredPhases: canonical.sequence.map(({ id, task, agent }) => ({ phaseId: id, task, owner: agent })) },
    journey: run.journey, runHash: runInput.hash, policyHash: policyInput.hash,
    workflowId: canonical.workflow.id, workflowHash,
    workflowOutcome: { status: summary?.status || 'blocked', confidenceGatePassed: summary?.confidenceGate?.passed === true,
      failedPhases: [...orchestrator.executionState.failedPhases] },
    ...(failure ? { failure } : {}),
    executor: { configured: 'local-plan', observed: provider.name, kind: 'deterministic-local', model: null,
      providerEffects: 'not-assessed', independentAcceptance: 'deterministic-checker; separate implementation QA required' },
    bindings: Object.values(executionBindings).map((binding) => binding.toJSON()),
    ...(sopPlan ? { sopAssociation: { protocol: sopPlan.protocol, run: sopPlan.run,
      associationDigest: sopPlan.associationDigest, assurance: options.sopRuntimeAssociation.assurance } } : {}),
    completed, observations, runtimeEvents, budget: governance.getBudgetState(policy.budgetScope),
    exclusions: ['No LLM generation or provider certification', 'No arbitrary subprocess filesystem sandbox',
      'No release or commercial acceptance', 'Native write support is separately gated by AEX-4.28'],
  };
  liveReceipts.set(receipt, sha256(JSON.stringify(receipt)));
  return receipt;
}

module.exports = { runGovernedWorkflow, isLiveWorkflowReceipt, validateJourney, requirementsFor, scanPlan,
  projectWorkflowFailure };
