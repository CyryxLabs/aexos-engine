'use strict';

const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const yaml = require('js-yaml');

const WorkflowOrchestrator = require(path.resolve(
  __dirname,
  '../../../.aexos-core/core/orchestration/workflow-orchestrator',
));
const { normalizeWorkflowDocument } = require(path.resolve(
  __dirname,
  '../../../.aexos-core/core/orchestration/workflow-normalizer',
));
const { normalizeTaskContract } = require(path.resolve(
  __dirname,
  '../../../.aexos-core/core/execution/task-contract',
));

const CONTRACT = {
  contractVersion: 1,
  inputs: [],
  produces: [],
  verify: [{ type: 'result-status', expected: 'success' }],
};

describe('WorkflowOrchestrator canonical normalization', () => {
  let projectRoot;
  let frameworkRoot;
  let workflowPath;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aexos-normalized-project-'));
    frameworkRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aexos-normalized-framework-'));
    workflowPath = path.join(projectRoot, 'workflow.yaml');
    await fs.ensureDir(path.join(frameworkRoot, '.aexos-core', 'development', 'tasks'));
    await fs.ensureDir(path.join(frameworkRoot, '.aexos-core', 'development', 'agents'));
    await fs.ensureDir(path.join(frameworkRoot, '.aexos-core', 'product', 'checklists'));
  });

  afterEach(async () => {
    await fs.remove(projectRoot);
    await fs.remove(frameworkRoot);
  });

  function createOrchestrator(document, runtimeResult) {
    const runtime = {
      execute: jest.fn(async () => runtimeResult || ({
        success: true,
        status: 'success',
        produced: [],
        acceptance: { verdict: 'ACCEPTED' },
      })),
    };
    const orchestrator = new WorkflowOrchestrator(workflowPath, {
      projectRoot,
      frameworkRoot,
      runtime,
      enableConfidenceGate: false,
    });
    orchestrator.workflow = document;
    orchestrator.setupDirectories = jest.fn(async () => []);
    orchestrator.techStackDetector.detect = jest.fn(async () => ({
      hasDatabase: false,
      database: {},
      hasFrontend: false,
      frontend: {},
      hasBackend: false,
      backend: {},
      hasTypeScript: false,
      applicablePhases: [],
      confidence: 100,
    }));
    orchestrator.preparePhase = jest.fn(async () => ({}));
    orchestrator.validatePhaseOutput = jest.fn(async () => ({ passed: true, checks: [], errors: [] }));
    orchestrator.promptBuilder.buildPrompt = jest.fn(async () => 'trusted prompt');
    orchestrator.contextManager = {
      updateMetadata: jest.fn(async () => {}),
      getContextForPhase: jest.fn(async () => ({})),
      savePhaseOutput: jest.fn(async () => {}),
      markFailed: jest.fn(async () => {}),
      markCompleted: jest.fn(async () => {}),
      getPreviousPhaseOutputs: jest.fn(() => ({})),
      getDeliveryConfidence: jest.fn(() => ({ score: 100 })),
    };
    return { orchestrator, runtime };
  }

  function workflowPhase(id, phase, task, dependsOn = [], requireAcceptance = false) {
    return {
      id,
      phase,
      phase_name: id,
      agent: 'dev',
      action: task,
      task,
      requireAcceptance,
      dependsOn,
      ...(requireAcceptance ? { contract: CONTRACT } : {}),
    };
  }

  it('dispatches each valid nested phase exactly once and records accepted predecessors', async () => {
    const phases = [
      workflowPhase('plan', 3, 'plan-task'),
      workflowPhase('build', 5, 'build-task', ['plan']),
      workflowPhase('review', 8, 'review-task', ['build']),
    ];
    const { orchestrator, runtime } = createOrchestrator({
      workflow: { id: 'strict-journey', name: 'Strict journey', sequence: phases },
    });

    const result = await orchestrator.execute();

    expect(runtime.execute).toHaveBeenCalledTimes(3);
    expect(runtime.execute.mock.calls.map(([request]) => request.task)).toEqual([
      'plan-task',
      'build-task',
      'review-task',
    ]);
    expect(result.status).toBe('completed');
    expect(orchestrator.contextManager.markCompleted).toHaveBeenCalledTimes(1);
    expect(result.phases).toEqual(expect.objectContaining({ total: 3, completed: 3 }));
  });

  it.each([
    ['empty', { workflow: { id: 'empty', sequence: [] } }],
    ['taskless', { workflow: { id: 'taskless', sequence: [{ id: 'a', phase: 1, agent: 'dev' }] } }],
    ['unknown dependency', {
      workflow: {
        id: 'unknown',
        sequence: [workflowPhase('build', 1, 'build-task', ['missing'])],
      },
    }],
  ])('dispatches zero phases for invalid %s input', async (_label, document) => {
    const { orchestrator, runtime } = createOrchestrator(document);

    await expect(orchestrator.execute()).rejects.toMatchObject({
      name: 'WorkflowNormalizationError',
    });
    expect(runtime.execute).not.toHaveBeenCalled();
    expect(orchestrator.setupDirectories).not.toHaveBeenCalled();
  });

  it('does not treat explicit file prerequisites as phase dependencies', async () => {
    const { orchestrator, runtime } = createOrchestrator({
      workflow: { id: 'files' },
      sequence: [{
        ...workflowPhase('build', 1, 'build-task'),
        requiresFiles: ['inputs/spec.md'],
      }],
    });

    await expect(orchestrator.execute()).rejects.toMatchObject({
      code: 'WORKFLOW_PHASE_FILE_PREREQUISITE_MISSING',
    });
    expect(runtime.execute).not.toHaveBeenCalled();
  });

  it('preflights all strict bindings before setup or context writes', async () => {
    const { orchestrator, runtime } = createOrchestrator({
      workflow: { id: 'binding-preflight' },
      sequence: [workflowPhase('build', 1, 'build-task', [], true)],
    });
    await expect(orchestrator.execute()).rejects.toMatchObject({
      code: 'WORKFLOW_EXECUTION_BINDINGS_REQUIRED',
    });
    expect(runtime.execute).not.toHaveBeenCalled();
    expect(orchestrator.setupDirectories).not.toHaveBeenCalled();
    expect(orchestrator.contextManager.updateMetadata).not.toHaveBeenCalled();
  });

  it('rejects split binding budget scopes before checking provider authority', async () => {
    const { orchestrator, runtime } = createOrchestrator({
      workflow: { id: 'split-budget' },
      sequence: [
        workflowPhase('plan', 1, 'plan-task', [], true),
        workflowPhase('build', 2, 'build-task', ['plan'], true),
      ],
    });
    orchestrator.options.workflowBudgetScope = 'shared-budget';
    orchestrator.options.workflowBudgetCeilingUsd = 2;
    orchestrator.executionBindings = {
      plan: { budgetScope: 'shared-budget', budgetCeilingUsd: 2 },
      build: { budgetScope: 'reset-budget', budgetCeilingUsd: 2 },
    };

    await expect(orchestrator.execute()).rejects.toMatchObject({
      code: 'WORKFLOW_BINDING_BUDGET_MISMATCH',
    });
    expect(runtime.execute).not.toHaveBeenCalled();
    expect(orchestrator.setupDirectories).not.toHaveBeenCalled();
  });

  it('rejects legacy side-effect fields in bound mode before setup', async () => {
    const { orchestrator, runtime } = createOrchestrator({
      workflow: { id: 'bound-side-effect' },
      sequence: [{
        ...workflowPhase('build', 1, 'build-task', [], true),
        creates: ['unsafe-output.md'],
      }],
    });
    orchestrator.executionBindings = { build: Object.freeze({}) };

    await expect(orchestrator.execute()).rejects.toMatchObject({
      code: 'WORKFLOW_BOUND_PHASE_SIDE_EFFECT_UNSUPPORTED',
    });
    expect(runtime.execute).not.toHaveBeenCalled();
    expect(orchestrator.setupDirectories).not.toHaveBeenCalled();
  });

  it('blocks a strict dependent phase without accepted predecessor evidence', async () => {
    const { orchestrator, runtime } = createOrchestrator({
      workflow: { id: 'strict-dependency' },
      sequence: [
        workflowPhase('plan', 1, 'plan-task', [], true),
        workflowPhase('build', 2, 'build-task', ['plan'], true),
      ],
    });
    orchestrator.executionState.completedPhaseIds = ['plan'];
    orchestrator.executionState.acceptedPhaseIds = [];

    await expect(orchestrator._executeSinglePhase({
      ...workflowPhase('build', 2, 'build-task', ['plan'], true),
      requiresFiles: [],
    })).rejects.toMatchObject({
      code: 'WORKFLOW_PHASE_ACCEPTED_DEPENDENCY_MISSING',
    });
    expect(runtime.execute).not.toHaveBeenCalled();
  });

  it('resolves task, agent, and checklist definitions from external frameworkRoot', async () => {
    await fs.writeFile(
      path.join(frameworkRoot, '.aexos-core', 'development', 'tasks', 'external-task.md'),
      [
        '---',
        'contractVersion: 1',
        'inputs: []',
        'produces: []',
        'verify:',
        '  - type: result-status',
        '    expected: success',
        '---',
        '# External task',
      ].join('\n'),
      'utf8',
    );
    await fs.writeFile(
      path.join(frameworkRoot, '.aexos-core', 'development', 'agents', 'dev.md'),
      '# External dev agent',
      'utf8',
    );
    await fs.writeFile(
      path.join(frameworkRoot, '.aexos-core', 'product', 'checklists', 'external-check.md'),
      '- [ ] verify externally',
      'utf8',
    );
    const document = {
      workflow: { id: 'external-framework' },
      sequence: [{
        id: 'external',
        phase: 1,
        agent: 'dev',
        task: 'external-task',
        requireAcceptance: true,
      }],
    };
    await fs.writeFile(workflowPath, yaml.dump(document), 'utf8');
    const runtime = {
      execute: jest.fn(async () => ({
        success: true,
        status: 'success',
        produced: [],
        acceptance: { verdict: 'ACCEPTED' },
      })),
    };
    const orchestrator = new WorkflowOrchestrator(workflowPath, {
      projectRoot,
      frameworkRoot,
      runtime,
      enableConfidenceGate: false,
    });
    await orchestrator.loadWorkflow();

    expect(orchestrator.promptBuilder.paths.tasks).toBe(path.join(
      frameworkRoot,
      '.aexos-core',
      'development',
      'tasks',
    ));
    expect(orchestrator.checklistRunner.checklistsPath).toBe(path.join(
      frameworkRoot,
      '.aexos-core',
      'product',
      'checklists',
    ));
    expect(orchestrator._resolvePhaseAcceptance(orchestrator.workflow.sequence[0])).toMatchObject({
      requireAcceptance: true,
      certification: 'accepted',
      contract: CONTRACT,
    });
  });

  it('normalizes again on resume and rejects zero work before dispatch', async () => {
    const { orchestrator, runtime } = createOrchestrator({ workflow: { id: 'resume', sequence: [] } });

    await expect(orchestrator.resumeFrom(1)).rejects.toMatchObject({
      code: 'WORKFLOW_SEQUENCE_EMPTY',
    });
    expect(runtime.execute).not.toHaveBeenCalled();
  });

  it('does not resume dispatch from a persisted failed terminal state', async () => {
    const { orchestrator, runtime } = createOrchestrator({
      workflow: { id: 'failed-resume' },
      sequence: [workflowPhase('build', 1, 'build-task')],
    });
    orchestrator.contextManager.loadState = jest.fn(async () => ({
      status: 'failed',
      phases: {},
    }));

    await expect(orchestrator.resumeFrom(1)).rejects.toMatchObject({
      code: 'WORKFLOW_RESUME_FAILED_STATE',
    });
    expect(runtime.execute).not.toHaveBeenCalled();
  });

  it('rejects forged predecessor certification instead of promoting it on resume', async () => {
    const { orchestrator, runtime } = createOrchestrator({
      workflow: { id: 'accepted-resume' },
      sequence: [
        workflowPhase('plan', 1, 'plan-task', [], true),
        workflowPhase('build', 2, 'build-task', ['plan'], true),
      ],
    });
    orchestrator.executionBindings = {
      plan: {
        phaseId: 'plan', task: 'plan-task', agentId: 'dev',
        budgetScope: 'resume', budgetCeilingUsd: 1,
      },
      build: {
        phaseId: 'build', task: 'build-task', agentId: 'dev',
        budgetScope: 'resume', budgetCeilingUsd: 1,
      },
    };
    orchestrator.options.workflowBudgetScope = 'resume';
    orchestrator.options.workflowBudgetCeilingUsd = 1;
    orchestrator.contextManager.loadState = jest.fn(async () => ({
      status: 'in_progress',
      workflowId: 'accepted-resume',
      phases: {
        1: {
          phaseId: 'old-plan',
          task: 'different-old-task',
          certification: 'accepted',
          result: { success: false, status: 'failed', acceptance: { verdict: 'ACCEPTED' } },
          validation: { passed: false },
        },
      },
    }));

    orchestrator._preflightExecutionBindings = jest.fn(() => true);

    await expect(orchestrator.resumeFrom(2)).rejects.toMatchObject({
      code: 'WORKFLOW_RESUME_EVIDENCE_INVALID',
    });
    expect(runtime.execute).not.toHaveBeenCalled();
  });

  it('revalidates current predecessor artifacts before downstream resume', async () => {
    const document = {
      workflow: { id: 'artifact-resume' },
      sequence: [
        workflowPhase('plan', 1, 'plan-task', [], true),
        workflowPhase('build', 2, 'build-task', ['plan'], true),
      ],
    };
    const { orchestrator } = createOrchestrator(document);
    orchestrator.workflow = normalizeWorkflowDocument(document);
    await fs.ensureDir(path.join(projectRoot, 'docs', 'stories'));
    await fs.writeFile(path.join(projectRoot, 'docs', 'stories', 'story.md'), '# Story\n');
    await fs.writeFile(path.join(projectRoot, 'plan.txt'), 'accepted plan\n');
    const contract = normalizeTaskContract({
      contractVersion: 1,
      inputs: [],
      produces: [{ name: 'plan', kind: 'file', path: 'plan.txt' }],
      verify: [{ type: 'file-exists', target: 'plan.txt' }],
    }, projectRoot);
    const binding = {
      phaseId: 'plan',
      task: 'plan-task',
      agentId: 'dev',
      projectRoot,
      story: 'docs/stories/story.md',
      contract,
      taskContractHash: 'installed-contract-hash',
      resolvedContractHash: crypto.createHash('sha256')
        .update(JSON.stringify(contract)).digest('hex'),
      budgetScope: 'resume',
      budgetCeilingUsd: 1,
    };
    orchestrator.validatedExecutionBindings.set('plan', binding);
    const identity = orchestrator._createExecutionIdentity(orchestrator.workflow.sequence[0], binding);
    orchestrator.contextManager.loadState = jest.fn(async () => ({
      status: 'in_progress',
      workflowId: 'artifact-resume',
      phases: {
        1: {
          agent: 'dev',
          task: 'plan-task',
          certification: 'accepted',
          executionIdentity: identity,
          result: {
            success: true,
            status: 'success',
            produced: ['plan.txt'],
            acceptance: { verdict: 'ACCEPTED', contractHash: binding.resolvedContractHash },
          },
          validation: { passed: true },
        },
      },
    }));
    await fs.remove(path.join(projectRoot, 'plan.txt'));

    await expect(orchestrator._restoreDependencyEvidence(2)).rejects.toMatchObject({
      code: 'WORKFLOW_RESUME_REVERIFICATION_FAILED',
    });
    expect(orchestrator.executionState.acceptedPhaseIds).toEqual([]);
  });

  it('rejects resume cursors that do not identify an actual remaining phase', async () => {
    const { orchestrator, runtime } = createOrchestrator({
      workflow: { id: 'past-end' },
      sequence: [workflowPhase('build', 1, 'build-task')],
    });

    await expect(orchestrator.resumeFrom(999)).rejects.toMatchObject({
      code: 'WORKFLOW_RESUME_CURSOR_INVALID',
    });
    expect(runtime.execute).not.toHaveBeenCalled();
  });

  it('keeps workflow bookkeeping under the explicit trusted state root', async () => {
    const stateRoot = path.join(projectRoot, '..', `trusted-state-${path.basename(projectRoot)}`);
    await fs.writeFile(workflowPath, yaml.dump({
      workflow: { id: 'trusted-state' },
      sequence: [workflowPhase('build', 1, 'build-task')],
    }));
    const orchestrator = new WorkflowOrchestrator(workflowPath, {
      projectRoot,
      frameworkRoot,
      stateRoot,
      runtime: { execute: jest.fn() },
    });

    await orchestrator.loadWorkflow();

    expect(orchestrator.contextManager.stateDir).toBe(path.resolve(stateRoot));
    await fs.remove(stateRoot);
  });

  it('does not report completion when every normalized phase is skipped', async () => {
    const { orchestrator, runtime } = createOrchestrator({
      workflow: { id: 'all-skipped' },
      sequence: [{
        ...workflowPhase('build', 1, 'build-task'),
        condition: 'never',
      }],
    });
    orchestrator.conditionEvaluator = {
      shouldExecutePhase: jest.fn(() => ({ shouldExecute: false, reason: 'test_skip' })),
      getSkipExplanation: jest.fn(() => 'test skip'),
    };
    orchestrator.skillDispatcher.createSkipResult = jest.fn(() => ({ skipped: true }));

    await expect(orchestrator.execute()).rejects.toMatchObject({
      code: 'WORKFLOW_ZERO_DISPATCH',
    });
    expect(runtime.execute).not.toHaveBeenCalled();
  });
});
