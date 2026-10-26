/** Deterministic process-to-AEXOS-task-contract compiler. */

'use strict';

const crypto = require('crypto');
const { normalizeTaskContract } = require('../execution/task-contract');

const STEP_KINDS = Object.freeze(['manual', 'deterministic', 'agentic', 'external']);

class WorkflowEngineeringError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'WorkflowEngineeringError';
    this.code = code;
    this.details = details;
  }
}

function requiredText(value, field, subject = 'workflow') {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new WorkflowEngineeringError(
      'WORKFLOW_FIELD_REQUIRED',
      `${subject} requires non-empty ${field}.`,
      { subject, field },
    );
  }
  return value.trim();
}

function requiredArray(value, field, subject = 'workflow', allowEmpty = true) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new WorkflowEngineeringError(
      'WORKFLOW_FIELD_REQUIRED',
      `${subject} requires ${allowEmpty ? 'an array' : 'a non-empty array'} for ${field}.`,
      { subject, field },
    );
  }
  return value;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function sourceHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');
}

function normalizeIdentity(item, kind) {
  const id = requiredText(item?.id, 'id', kind).toLowerCase();
  if (!/^[a-z][a-z0-9-]*$/.test(id)) {
    throw new WorkflowEngineeringError(
      'WORKFLOW_ID_INVALID',
      `${kind} id must be kebab-case: ${id}.`,
      { kind, id },
    );
  }
  return {
    id,
    name: requiredText(item.name, 'name', `${kind} ${id}`),
    type: requiredText(item.type, 'type', `${kind} ${id}`).toLowerCase(),
  };
}

function uniqueById(items, kind) {
  const ids = new Set();
  return items.map((item) => {
    const normalized = normalizeIdentity(item, kind);
    if (ids.has(normalized.id)) {
      throw new WorkflowEngineeringError(
        'WORKFLOW_ID_DUPLICATE',
        `Duplicate ${kind} id ${normalized.id}.`,
        { kind, id: normalized.id },
      );
    }
    ids.add(normalized.id);
    return normalized;
  });
}

function normalizeStep(step, actorIds, systemIds, projectRoot) {
  const id = requiredText(step?.id, 'id', 'step').toLowerCase();
  if (!/^[a-z][a-z0-9-]*$/.test(id)) {
    throw new WorkflowEngineeringError(
      'WORKFLOW_ID_INVALID',
      `step id must be kebab-case: ${id}.`,
      { kind: 'step', id },
    );
  }
  const owner = requiredText(step.owner, 'owner', `step ${id}`).toLowerCase();
  if (!actorIds.has(owner)) {
    throw new WorkflowEngineeringError(
      'WORKFLOW_OWNER_UNKNOWN',
      `Step ${id} references unknown owner ${owner}.`,
      { stepId: id, owner },
    );
  }
  const kind = requiredText(step.kind, 'kind', `step ${id}`).toLowerCase();
  if (!STEP_KINDS.includes(kind)) {
    throw new WorkflowEngineeringError(
      'WORKFLOW_STEP_KIND_INVALID',
      `Step ${id} has unsupported kind ${kind}.`,
      { stepId: id, kind },
    );
  }
  const dependsOn = [...new Set(requiredArray(step.dependsOn || [], 'dependsOn', `step ${id}`)
    .map((dependency) => requiredText(dependency, 'dependsOn', `step ${id}`).toLowerCase()))]
    .sort();
  if (dependsOn.includes(id)) {
    throw new WorkflowEngineeringError(
      'WORKFLOW_DEPENDENCY_SELF',
      `Step ${id} cannot depend on itself.`,
      { stepId: id },
    );
  }
  const systems = [...new Set(requiredArray(step.systems || [], 'systems', `step ${id}`)
    .map((system) => requiredText(system, 'systems', `step ${id}`).toLowerCase()))]
    .sort();
  const unknownSystem = systems.find((system) => !systemIds.has(system));
  if (unknownSystem) {
    throw new WorkflowEngineeringError(
      'WORKFLOW_SYSTEM_UNKNOWN',
      `Step ${id} references unknown system ${unknownSystem}.`,
      { stepId: id, system: unknownSystem },
    );
  }
  const capabilities = [...new Set(requiredArray(step.capabilities || [], 'capabilities', `step ${id}`)
    .map((capability) => requiredText(capability, 'capabilities', `step ${id}`)))].sort();
  if (['agentic', 'external'].includes(kind) && capabilities.length === 0) {
    throw new WorkflowEngineeringError(
      'WORKFLOW_CAPABILITY_REQUIRED',
      `Step ${id} requires at least one explicit capability.`,
      { stepId: id, kind },
    );
  }
  const inputs = requiredArray(step.inputs, 'inputs', `step ${id}`);
  const produces = requiredArray(step.outputs, 'outputs', `step ${id}`, false);
  const verify = requiredArray(step.verify, 'verify', `step ${id}`, false);
  let contract;
  try {
    contract = normalizeTaskContract({ contractVersion: 1, inputs, produces, verify }, projectRoot);
  } catch (error) {
    throw new WorkflowEngineeringError(
      'WORKFLOW_TASK_CONTRACT_INVALID',
      `Step ${id} does not produce a valid AEXOS Task Contract V1.`,
      { stepId: id, cause: error.code || error.name, errors: error.details?.errors || [] },
    );
  }
  return {
    id,
    name: requiredText(step.name, 'name', `step ${id}`),
    owner,
    kind,
    dependsOn,
    systems,
    capabilities,
    sideEffects: step.sideEffects === true,
    approvalRequired: step.approvalRequired === true,
    contract,
  };
}

function createWaves(steps) {
  const byId = new Map(steps.map((step) => [step.id, step]));
  for (const step of steps) {
    const unknown = step.dependsOn.find((dependency) => !byId.has(dependency));
    if (unknown) {
      throw new WorkflowEngineeringError(
        'WORKFLOW_DEPENDENCY_UNKNOWN',
        `Step ${step.id} references unknown dependency ${unknown}.`,
        { stepId: step.id, dependency: unknown },
      );
    }
  }
  const remaining = new Set(byId.keys());
  const completed = new Set();
  const waves = [];
  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter((id) => byId.get(id).dependsOn.every((dependency) => completed.has(dependency)))
      .sort();
    if (ready.length === 0) {
      throw new WorkflowEngineeringError(
        'WORKFLOW_DEPENDENCY_CYCLE',
        `Workflow contains a dependency cycle involving: ${[...remaining].sort().join(', ')}.`,
        { stepIds: [...remaining].sort() },
      );
    }
    waves.push({ index: waves.length + 1, taskIds: ready });
    ready.forEach((id) => {
      remaining.delete(id);
      completed.add(id);
    });
  }
  return waves;
}

function ensureUniqueOutputs(steps) {
  const owners = new Map();
  for (const step of steps) {
    for (const output of step.contract.produces) {
      if (!output.path) continue;
      const existing = owners.get(output.path);
      if (existing) {
        throw new WorkflowEngineeringError(
          'WORKFLOW_OUTPUT_CONFLICT',
          `Steps ${existing} and ${step.id} both declare output ${output.path}.`,
          { path: output.path, stepIds: [existing, step.id].sort() },
        );
      }
      owners.set(output.path, step.id);
    }
  }
}

function automationDecision(step) {
  if (step.kind === 'manual') {
    return { taskId: step.id, classification: 'manual', reasons: ['human-step'] };
  }
  const reasons = [];
  if (step.kind === 'agentic') reasons.push('agentic-runtime-required');
  if (step.kind === 'external') reasons.push('external-system');
  if (step.sideEffects) reasons.push('side-effects');
  if (step.approvalRequired) reasons.push('human-approval');
  if (step.capabilities.length > 0) reasons.push('capability-lease-required');
  if (reasons.length > 0) {
    return { taskId: step.id, classification: 'governed', reasons };
  }
  return { taskId: step.id, classification: 'eligible', reasons: [] };
}

function compileWorkflowMap(input = {}, options = {}) {
  const nowValue = options.now ?? new Date();
  const nowMs = nowValue instanceof Date ? nowValue.getTime() : Number(nowValue);
  if (!Number.isFinite(nowMs)) {
    throw new WorkflowEngineeringError('WORKFLOW_CLOCK_INVALID', 'Workflow compiler clock is invalid.');
  }
  const workflowId = requiredText(input.workflowId, 'workflowId').toLowerCase();
  if (!/^[a-z][a-z0-9-]*$/.test(workflowId)) {
    throw new WorkflowEngineeringError(
      'WORKFLOW_ID_INVALID',
      `workflow id must be kebab-case: ${workflowId}.`,
      { kind: 'workflow', id: workflowId },
    );
  }
  const actors = uniqueById(requiredArray(input.actors, 'actors', 'workflow', false), 'actor')
    .sort((left, right) => left.id.localeCompare(right.id));
  const systems = uniqueById(requiredArray(input.systems || [], 'systems'), 'system')
    .sort((left, right) => left.id.localeCompare(right.id));
  const actorIds = new Set(actors.map((actor) => actor.id));
  const systemIds = new Set(systems.map((system) => system.id));
  const stepIds = new Set();
  const projectRoot = options.projectRoot || process.cwd();
  const steps = requiredArray(input.steps, 'steps', 'workflow', false).map((step) => {
    const normalized = normalizeStep(step, actorIds, systemIds, projectRoot);
    if (stepIds.has(normalized.id)) {
      throw new WorkflowEngineeringError(
        'WORKFLOW_ID_DUPLICATE',
        `Duplicate step id ${normalized.id}.`,
        { kind: 'step', id: normalized.id },
      );
    }
    stepIds.add(normalized.id);
    return normalized;
  }).sort((left, right) => left.id.localeCompare(right.id));
  ensureUniqueOutputs(steps);
  const waves = createWaves(steps);
  const automationDecisions = steps.map(automationDecision);
  const governed = automationDecisions
    .filter((decision) => decision.classification === 'governed')
    .map((decision) => decision.taskId);
  return {
    schemaVersion: 1,
    workflowId,
    name: requiredText(input.name, 'name'),
    objective: requiredText(input.objective, 'objective'),
    trigger: requiredText(input.trigger, 'trigger'),
    outcome: requiredText(input.outcome, 'outcome'),
    generatedAt: new Date(nowMs).toISOString(),
    actors,
    systems,
    steps,
    waves,
    taskContracts: steps.map((step) => ({ taskId: step.id, owner: step.owner, contract: step.contract })),
    automationDecisions,
    qa: {
      verdict: governed.length > 0 ? 'CONCERNS' : 'PASS',
      contractedTasks: steps.length,
      governedTaskIds: governed,
    },
    provenance: { sourceHash: sourceHash(input) },
  };
}

module.exports = {
  STEP_KINDS,
  WorkflowEngineeringError,
  compileWorkflowMap,
};
