'use strict';

const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');

const {
  WorkflowNormalizationError,
  normalizeWorkflowDocument,
} = require(path.resolve(
  __dirname,
  '../../../.aexos-core/core/orchestration/workflow-normalizer',
));

function phase(id, task, overrides = {}) {
  return {
    id,
    phase: overrides.phase,
    agent: overrides.agent || 'dev',
    task,
    requireAcceptance: overrides.requireAcceptance === true,
    ...(overrides.dependsOn ? { dependsOn: overrides.dependsOn } : {}),
    ...(overrides.requiresFiles ? { requiresFiles: overrides.requiresFiles } : {}),
  };
}

describe('workflow normalizer', () => {
  it.each([
    ['top-level', { workflow: { id: 'top' }, sequence: [phase('build', 'build-task')] }],
    ['nested', { workflow: { id: 'nested', sequence: [phase('build', 'build-task')] } }],
  ])('normalizes a nonempty %s sequence without mutating its source', (_label, source) => {
    const before = JSON.parse(JSON.stringify(source));

    const normalized = normalizeWorkflowDocument(source);

    expect(source).toEqual(before);
    expect(normalized.sequence).toEqual([
      expect.objectContaining({
        id: 'build',
        phase: 1,
        task: 'build-task',
        taskId: 'build-task',
        dependsOn: [],
        requiresFiles: [],
      }),
    ]);
    expect(normalized.workflow.sequence).toBeUndefined();
  });

  it('preserves unique numeric phase metadata and separates phase and file dependencies', () => {
    const normalized = normalizeWorkflowDocument({
      workflow: { id: 'deps' },
      sequence: [
        phase('plan', 'plan-task', { phase: 4 }),
        phase('build', 'build-task.md', {
          phase: 9,
          dependsOn: 'plan',
          requiresFiles: ['docs/stories/STORY-1.md'],
        }),
      ],
    });

    expect(normalized.sequence[1]).toEqual(expect.objectContaining({
      phase: 9,
      task: 'build-task',
      taskId: 'build-task',
      dependsOn: ['plan'],
      requiresFiles: ['docs/stories/STORY-1.md'],
    }));
  });

  it.each([
    ['ambiguous dual sequence', {
      workflow: { id: 'dual', sequence: [phase('a', 'task-a')] },
      sequence: [phase('a', 'task-a')],
    }, 'WORKFLOW_SEQUENCE_AMBIGUOUS'],
    ['missing sequence', { workflow: { id: 'missing' } }, 'WORKFLOW_SEQUENCE_REQUIRED'],
    ['empty sequence', { workflow: { id: 'empty' }, sequence: [] }, 'WORKFLOW_SEQUENCE_EMPTY'],
    ['taskless phase', { workflow: { id: 'taskless' }, sequence: [{ id: 'a', agent: 'dev' }] }, 'WORKFLOW_TASK_REQUIRED'],
    ['agentless phase', { workflow: { id: 'agentless' }, sequence: [{ id: 'a', task: 'task-a' }] }, 'WORKFLOW_AGENT_REQUIRED'],
    ['malformed acceptance policy', {
      workflow: { id: 'acceptance-policy' },
      sequence: [{ ...phase('a', 'task-a'), requireAcceptance: 'true' }],
    }, 'WORKFLOW_ACCEPTANCE_POLICY_INVALID'],
    ['duplicate phase id', {
      workflow: { id: 'duplicate' },
      sequence: [phase('a', 'task-a'), phase('a', 'task-b')],
    }, 'WORKFLOW_PHASE_ID_DUPLICATE'],
    ['unknown dependency', {
      workflow: { id: 'unknown' },
      sequence: [phase('a', 'task-a', { dependsOn: 'missing' })],
    }, 'WORKFLOW_DEPENDENCY_UNKNOWN'],
    ['cycle', {
      workflow: { id: 'cycle' },
      sequence: [
        phase('a', 'task-a', { dependsOn: 'b' }),
        phase('b', 'task-b', { dependsOn: 'a' }),
      ],
    }, 'WORKFLOW_DEPENDENCY_CYCLE'],
    ['forward dependency', {
      workflow: { id: 'forward' },
      sequence: [
        phase('a', 'task-a', { dependsOn: 'b' }),
        phase('b', 'task-b'),
      ],
    }, 'WORKFLOW_DEPENDENCY_FORWARD'],
    ['legacy requires ambiguity', {
      workflow: { id: 'legacy-requires' },
      sequence: [{ ...phase('a', 'task-a'), requires: 'some-input' }],
    }, 'WORKFLOW_REQUIRES_AMBIGUOUS'],
    ['unsafe file prerequisite', {
      workflow: { id: 'unsafe-file' },
      sequence: [phase('a', 'task-a', { requiresFiles: ['../outside.md'] })],
    }, 'WORKFLOW_FILE_PREREQUISITE_INVALID'],
    ['task traversal', {
      workflow: { id: 'task-traversal' },
      sequence: [phase('build', '../../constitution')],
    }, 'WORKFLOW_TASK_ID_INVALID'],
    ['agent traversal', {
      workflow: { id: 'agent-traversal' },
      sequence: [phase('build', 'build-task', { agent: '../dev' })],
    }, 'WORKFLOW_AGENT_ID_INVALID'],
    ['phase identifier traversal', {
      workflow: { id: 'phase-traversal' },
      sequence: [phase('../build', 'build-task')],
    }, 'WORKFLOW_PHASE_ID_INVALID'],
    ['ambiguous numeric phase ordering', {
      workflow: { id: 'numeric-order' },
      sequence: [
        phase('first', 'task-a', { phase: 2 }),
        phase('second', 'task-b', { phase: 1 }),
      ],
    }, 'WORKFLOW_PHASE_ORDER_INVALID'],
    ['workflow end marker', {
      workflow: { id: 'marker' },
      sequence: [{ workflow_end: true, id: 'complete' }],
    }, 'WORKFLOW_PHASE_UNSUPPORTED'],
  ])('rejects %s before execution', (_label, source, code) => {
    expect(() => normalizeWorkflowDocument(source)).toThrow(expect.objectContaining({
      name: 'WorkflowNormalizationError',
      code,
    }));
  });

  it('exports a stable coded normalization error', () => {
    const error = new WorkflowNormalizationError('TEST_CODE', 'message', { field: 'sequence' });
    expect(error).toMatchObject({
      name: 'WorkflowNormalizationError',
      code: 'TEST_CODE',
      details: { field: 'sequence' },
    });
  });

  it('normalizes the canonical story development cycle to six contracted task IDs', () => {
    const workflowPath = path.resolve(
      __dirname,
      '../../../.aexos-core/development/workflows/story-development-cycle.yaml',
    );
    const normalized = normalizeWorkflowDocument(yaml.load(fs.readFileSync(workflowPath, 'utf8')));

    expect(normalized.sequence.map((item) => item.taskId)).toEqual([
      'create-next-story',
      'validate-next-story',
      'plan-create-implementation',
      'dev-develop-story',
      'qa-run-tests',
      'qa-review-story',
    ]);
    expect(normalized.sequence.map((item) => item.dependsOn)).toEqual([
      [],
      ['create-story'],
      ['validate-story'],
      ['plan-implementation'],
      ['implement-story'],
      ['run-tests'],
    ]);
    expect(normalized.sequence.every((item) => item.requireAcceptance === true)).toBe(true);
  });
});
