'use strict';

const {
  WorkflowEngineeringError,
  compileWorkflowMap,
} = require('../../../.aexos-core/core/workflow-engineering/workflow-map');
const { normalizeTaskContract } = require('../../../.aexos-core/core/execution/task-contract');

function baseInput() {
  return {
    workflowId: 'lead-review',
    name: 'Lead Review',
    objective: 'Produce an evidence-backed disposition',
    trigger: 'A lead is submitted',
    outcome: 'Disposition is recorded',
    actors: [
      { id: 'reviewer', name: 'Reviewer', type: 'human' },
      { id: 'analyst-agent', name: 'Analyst Agent', type: 'agent' },
    ],
    systems: [{ id: 'crm', name: 'CRM', type: 'saas' }],
    steps: [
      {
        id: 'approve', name: 'Approve disposition', owner: 'reviewer', kind: 'manual',
        dependsOn: ['analyze'], systems: ['crm'], capabilities: [],
        sideEffects: true, approvalRequired: true,
        inputs: [{ name: 'analysis', type: 'object', required: true }],
        outputs: [{ name: 'approval', kind: 'state' }],
        verify: [{ type: 'result-status', expected: 'approved' }],
      },
      {
        id: 'intake', name: 'Normalize intake', owner: 'reviewer', kind: 'deterministic',
        dependsOn: [], systems: [], capabilities: [],
        sideEffects: false, approvalRequired: false,
        inputs: [{ name: 'lead', type: 'object', required: true }],
        outputs: [{ name: 'normalized', kind: 'file', path: 'artifacts/lead.json' }],
        verify: [{ type: 'file-exists', target: 'artifacts/lead.json' }],
      },
      {
        id: 'analyze', name: 'Analyze evidence', owner: 'analyst-agent', kind: 'agentic',
        dependsOn: ['intake'], systems: ['crm'], capabilities: ['model:invoke', 'crm:read'],
        sideEffects: false, approvalRequired: false,
        inputs: [{ name: 'normalized', type: 'object', required: true }],
        outputs: [{ name: 'analysis', kind: 'report', path: 'artifacts/analysis.md' }],
        verify: [{ type: 'file-exists', target: 'artifacts/analysis.md' }],
      },
    ],
  };
}

describe('Workflow Engineering compiler', () => {
  it('compiles deterministic waves and canonical Task Contract V1 artifacts', () => {
    const result = compileWorkflowMap(baseInput(), { now: new Date('2026-09-04T00:00:00Z') });
    expect(result).toMatchObject({
      schemaVersion: 1,
      workflowId: 'lead-review',
      generatedAt: '2026-09-04T00:00:00.000Z',
      waves: [
        { index: 1, taskIds: ['intake'] },
        { index: 2, taskIds: ['analyze'] },
        { index: 3, taskIds: ['approve'] },
      ],
      qa: { verdict: 'CONCERNS', contractedTasks: 3, governedTaskIds: ['analyze'] },
    });
    expect(result.steps.map((step) => step.id)).toEqual(['analyze', 'approve', 'intake']);
    expect(result.automationDecisions).toEqual([
      {
        taskId: 'analyze', classification: 'governed',
        reasons: ['agentic-runtime-required', 'capability-lease-required'],
      },
      { taskId: 'approve', classification: 'manual', reasons: ['human-step'] },
      { taskId: 'intake', classification: 'eligible', reasons: [] },
    ]);
    for (const item of result.taskContracts) {
      expect(normalizeTaskContract(item.contract)).toEqual(item.contract);
    }
    expect(result.provenance.sourceHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns PASS only when no task requires governed execution', () => {
    const input = baseInput();
    input.steps = [input.steps.find((step) => step.id === 'intake')];
    const result = compileWorkflowMap(input, { now: 0 });
    expect(result.qa).toEqual({ verdict: 'PASS', contractedTasks: 1, governedTaskIds: [] });
  });

  it('keeps source provenance stable across object key order', () => {
    const input = baseInput();
    const reversed = Object.fromEntries(Object.entries(input).reverse());
    expect(compileWorkflowMap(input, { now: 0 }).provenance.sourceHash)
      .toBe(compileWorkflowMap(reversed, { now: 0 }).provenance.sourceHash);
  });

  it.each([
    ['unknown owner', (input) => { input.steps[0].owner = 'ghost'; }, 'WORKFLOW_OWNER_UNKNOWN'],
    ['unknown system', (input) => { input.steps[0].systems = ['ghost']; }, 'WORKFLOW_SYSTEM_UNKNOWN'],
    ['unknown dependency', (input) => { input.steps[0].dependsOn = ['ghost']; }, 'WORKFLOW_DEPENDENCY_UNKNOWN'],
    ['self dependency', (input) => { input.steps[0].dependsOn = ['approve']; }, 'WORKFLOW_DEPENDENCY_SELF'],
    ['missing capability', (input) => { input.steps[2].capabilities = []; }, 'WORKFLOW_CAPABILITY_REQUIRED'],
    ['invalid task contract', (input) => { input.steps[1].outputs = []; }, 'WORKFLOW_FIELD_REQUIRED'],
  ])('fails closed for %s', (_label, mutate, code) => {
    const input = baseInput();
    mutate(input);
    expect(() => compileWorkflowMap(input)).toThrow(expect.objectContaining({ code }));
  });

  it('rejects dependency cycles with stable evidence', () => {
    const input = baseInput();
    input.steps.find((step) => step.id === 'intake').dependsOn = ['approve'];
    expect(() => compileWorkflowMap(input)).toThrow(expect.objectContaining({
      code: 'WORKFLOW_DEPENDENCY_CYCLE',
      details: { stepIds: ['analyze', 'approve', 'intake'] },
    }));
  });

  it('rejects conflicting produced paths', () => {
    const input = baseInput();
    input.steps.find((step) => step.id === 'analyze').outputs[0].path = 'artifacts/lead.json';
    expect(() => compileWorkflowMap(input)).toThrow(expect.objectContaining({
      code: 'WORKFLOW_OUTPUT_CONFLICT',
    }));
  });

  it('rejects duplicate actors, systems and steps', () => {
    for (const kind of ['actors', 'systems', 'steps']) {
      const input = baseInput();
      input[kind].push({ ...input[kind][0] });
      expect(() => compileWorkflowMap(input)).toThrow(expect.objectContaining({
        code: 'WORKFLOW_ID_DUPLICATE',
      }));
    }
  });

  it('uses stable typed errors', () => {
    try {
      compileWorkflowMap({});
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(WorkflowEngineeringError);
      expect(error.code).toBe('WORKFLOW_FIELD_REQUIRED');
    }
  });
});
