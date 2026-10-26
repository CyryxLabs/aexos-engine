/**
 * Canonical workflow document normalization.
 *
 * This boundary is intentionally strict: it converts exactly one supported
 * sequence shape into an executable representation or throws before dispatch.
 */

'use strict';

const path = require('path');

class WorkflowNormalizationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'WorkflowNormalizationError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new WorkflowNormalizationError(code, message, details);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeIdentifier(value, code, label, index) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(code, `${label} must be a nonempty string.`, { index });
  }
  return value.trim();
}

const SAFE_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function normalizeSafeIdentifier(value, requiredCode, invalidCode, label, index, transform) {
  const normalized = normalizeIdentifier(value, requiredCode, label, index);
  const transformed = transform ? transform(normalized) : normalized;
  if (!SAFE_ID_PATTERN.test(transformed)) {
    fail(invalidCode, `${label} must be a safe lower-kebab identifier.`, {
      index,
      value: normalized,
    });
  }
  return transformed;
}

function normalizeStringList(value, code, label, index) {
  if (value === undefined) return [];
  const values = Array.isArray(value) ? value : [value];
  const normalized = values.map((item) => normalizeIdentifier(item, code, label, index));
  if (new Set(normalized).size !== normalized.length) {
    fail(code, `${label} cannot contain duplicates.`, { index, values: normalized });
  }
  return normalized;
}

function normalizeFilePrerequisites(value, index) {
  const prerequisites = normalizeStringList(
    value,
    'WORKFLOW_FILE_PREREQUISITE_INVALID',
    'requiresFiles',
    index,
  );
  for (const prerequisite of prerequisites) {
    const components = prerequisite.replace(/\\/g, '/').split('/');
    if (
      path.isAbsolute(prerequisite)
      || path.win32.isAbsolute(prerequisite)
      || components.some((component) => !component || component === '.' || component === '..')
    ) {
      fail(
        'WORKFLOW_FILE_PREREQUISITE_INVALID',
        'requiresFiles entries must be unambiguous project-relative paths.',
        { index, prerequisite },
      );
    }
  }
  return prerequisites;
}

function findDependencyCycle(phases) {
  const dependencies = new Map(phases.map((phase) => [phase.id, phase.dependsOn]));
  const visiting = new Set();
  const visited = new Set();

  function visit(id, trail) {
    if (visiting.has(id)) {
      const cycleStart = trail.indexOf(id);
      return [...trail.slice(cycleStart), id];
    }
    if (visited.has(id)) return null;

    visiting.add(id);
    const nextTrail = [...trail, id];
    for (const dependency of dependencies.get(id) || []) {
      const cycle = visit(dependency, nextTrail);
      if (cycle) return cycle;
    }
    visiting.delete(id);
    visited.add(id);
    return null;
  }

  for (const phase of phases) {
    const cycle = visit(phase.id, []);
    if (cycle) return cycle;
  }
  return null;
}

function normalizePhase(rawPhase, index) {
  if (!isRecord(rawPhase)) {
    fail('WORKFLOW_PHASE_INVALID', 'Each workflow phase must be an object.', { index });
  }
  if (rawPhase.workflow_end !== undefined) {
    fail(
      'WORKFLOW_PHASE_UNSUPPORTED',
      'workflow_end markers are guidance metadata and are not executable phases.',
      { index },
    );
  }
  if (Object.prototype.hasOwnProperty.call(rawPhase, 'requires')) {
    fail(
      'WORKFLOW_REQUIRES_AMBIGUOUS',
      'Legacy requires is ambiguous; use dependsOn for phase IDs or requiresFiles for files.',
      { index },
    );
  }

  const id = normalizeSafeIdentifier(
    rawPhase.id,
    'WORKFLOW_PHASE_ID_REQUIRED',
    'WORKFLOW_PHASE_ID_INVALID',
    'Phase id',
    index,
  );
  const agent = normalizeSafeIdentifier(
    rawPhase.agent,
    'WORKFLOW_AGENT_REQUIRED',
    'WORKFLOW_AGENT_ID_INVALID',
    'Phase agent ID',
    index,
    (value) => value.replace(/^@/, ''),
  );
  const rawTask = rawPhase.taskId ?? rawPhase.task;
  const task = normalizeSafeIdentifier(
    rawTask,
    'WORKFLOW_TASK_REQUIRED',
    'WORKFLOW_TASK_ID_INVALID',
    'Phase task ID',
    index,
    (value) => value.replace(/\.md$/i, ''),
  );
  if (rawPhase.taskId !== undefined && rawPhase.task !== undefined) {
    const taskId = String(rawPhase.taskId).trim().replace(/\.md$/i, '');
    const taskAlias = String(rawPhase.task).trim().replace(/\.md$/i, '');
    if (taskId !== taskAlias) {
      fail('WORKFLOW_TASK_AMBIGUOUS', 'task and taskId must identify the same task.', { index });
    }
  }

  const phaseNumber = rawPhase.phase === undefined ? index + 1 : rawPhase.phase;
  if (!Number.isInteger(phaseNumber) || phaseNumber < 1) {
    fail(
      'WORKFLOW_PHASE_NUMBER_INVALID',
      'Numeric phase metadata must be a positive integer.',
      { index, phase: phaseNumber },
    );
  }
  if (
    rawPhase.requireAcceptance !== undefined
    && typeof rawPhase.requireAcceptance !== 'boolean'
  ) {
    fail(
      'WORKFLOW_ACCEPTANCE_POLICY_INVALID',
      'requireAcceptance must be a boolean when declared.',
      { index },
    );
  }

  return {
    ...rawPhase,
    id,
    agent,
    phase: phaseNumber,
    task,
    taskId: task,
    dependsOn: normalizeStringList(
      rawPhase.dependsOn,
      'WORKFLOW_DEPENDENCY_INVALID',
      'dependsOn',
      index,
    ),
    requiresFiles: normalizeFilePrerequisites(rawPhase.requiresFiles, index),
  };
}

function normalizeWorkflowDocument(document) {
  if (!isRecord(document)) {
    fail('WORKFLOW_DOCUMENT_INVALID', 'Workflow document must be an object.');
  }

  const workflow = isRecord(document.workflow) ? document.workflow : {};
  const hasTopLevelSequence = Object.prototype.hasOwnProperty.call(document, 'sequence');
  const hasNestedSequence = Object.prototype.hasOwnProperty.call(workflow, 'sequence');
  if (hasTopLevelSequence && hasNestedSequence) {
    fail(
      'WORKFLOW_SEQUENCE_AMBIGUOUS',
      'Define sequence either at the document top level or at workflow.sequence, not both.',
    );
  }
  if (!hasTopLevelSequence && !hasNestedSequence) {
    fail('WORKFLOW_SEQUENCE_REQUIRED', 'A workflow sequence is required.');
  }

  const sourceSequence = hasTopLevelSequence ? document.sequence : workflow.sequence;
  if (!Array.isArray(sourceSequence)) {
    fail('WORKFLOW_SEQUENCE_INVALID', 'Workflow sequence must be an array.');
  }
  if (sourceSequence.length === 0) {
    fail('WORKFLOW_SEQUENCE_EMPTY', 'Workflow sequence must contain at least one phase.');
  }

  const sequence = sourceSequence.map(normalizePhase);
  const ids = sequence.map((phase) => phase.id);
  const duplicateId = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicateId) {
    fail('WORKFLOW_PHASE_ID_DUPLICATE', `Duplicate phase id: ${duplicateId}`, { id: duplicateId });
  }
  const phaseNumbers = sequence.map((phase) => phase.phase);
  const duplicatePhase = phaseNumbers.find((number, index) => phaseNumbers.indexOf(number) !== index);
  if (duplicatePhase !== undefined) {
    fail(
      'WORKFLOW_PHASE_NUMBER_DUPLICATE',
      `Duplicate numeric phase metadata: ${duplicatePhase}`,
      { phase: duplicatePhase },
    );
  }
  const outOfOrderIndex = phaseNumbers.findIndex(
    (number, index) => index > 0 && number <= phaseNumbers[index - 1],
  );
  if (outOfOrderIndex !== -1) {
    fail(
      'WORKFLOW_PHASE_ORDER_INVALID',
      'Numeric phase metadata must increase in sequence order.',
      {
        index: outOfOrderIndex,
        previous: phaseNumbers[outOfOrderIndex - 1],
        phase: phaseNumbers[outOfOrderIndex],
      },
    );
  }

  const idSet = new Set(ids);
  for (const phase of sequence) {
    const unknown = phase.dependsOn.find((dependency) => !idSet.has(dependency));
    if (unknown) {
      fail(
        'WORKFLOW_DEPENDENCY_UNKNOWN',
        `Phase ${phase.id} depends on unknown phase ${unknown}.`,
        { phaseId: phase.id, dependency: unknown },
      );
    }
  }

  const cycle = findDependencyCycle(sequence);
  if (cycle) {
    fail('WORKFLOW_DEPENDENCY_CYCLE', `Workflow dependency cycle: ${cycle.join(' -> ')}`, {
      cycle,
    });
  }

  const indexes = new Map(ids.map((id, index) => [id, index]));
  for (const phase of sequence) {
    const forward = phase.dependsOn.find(
      (dependency) => indexes.get(dependency) >= indexes.get(phase.id),
    );
    if (forward) {
      fail(
        'WORKFLOW_DEPENDENCY_FORWARD',
        `Phase ${phase.id} has a forward dependency on ${forward}.`,
        { phaseId: phase.id, dependency: forward },
      );
    }
  }

  const { sequence: _nestedSequence, ...workflowMetadata } = workflow;
  return {
    ...document,
    workflow: workflowMetadata,
    sequence,
    orchestration: document.orchestration || workflow.orchestration || {},
    normalization: { version: 1, source: hasTopLevelSequence ? 'sequence' : 'workflow.sequence' },
  };
}

module.exports = {
  WorkflowNormalizationError,
  normalizeWorkflowDocument,
};
