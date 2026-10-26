'use strict';

const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const WorkflowOrchestrator = require(path.resolve(
  __dirname,
  '../../../.aexos-core/core/orchestration/workflow-orchestrator',
));
const ContextManager = require(path.resolve(
  __dirname,
  '../../../.aexos-core/core/orchestration/context-manager',
));

describe('WorkflowOrchestrator execution integrity', () => {
  let tempDir;
  let workflowPath;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aexos-workflow-integrity-'));
    workflowPath = path.join(tempDir, 'workflow.yaml');
    await fs.writeFile(workflowPath, 'workflow:\n  id: integrity\nsequence: []\n', 'utf8');
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  function createOrchestrator(runtimeResult = { success: true, status: 'success', produced: [] }) {
    const runtime = { execute: jest.fn().mockResolvedValue(runtimeResult) };
    const orchestrator = new WorkflowOrchestrator(workflowPath, {
      projectRoot: tempDir,
      runtime,
      enableConfidenceGate: false,
    });
    orchestrator.workflow = { workflow: { id: 'integrity' }, sequence: [] };
    orchestrator.preparePhase = jest.fn(async () => ({}));
    orchestrator.promptBuilder.buildPrompt = jest.fn(async () => 'prompt');
    orchestrator.contextManager = {
      getContextForPhase: jest.fn(async () => ({})),
      savePhaseOutput: jest.fn(async () => {}),
      markFailed: jest.fn(async () => {}),
    };
    return { orchestrator, runtime };
  }

  const phase = {
    phase: 1,
    phase_name: 'Build',
    agent: 'dev',
    action: 'implement',
  };

  it('persists provider failure and does not accept or hand off the phase', async () => {
    const onPhaseComplete = jest.fn();
    const runtime = {
      execute: jest.fn().mockResolvedValue({ success: false, status: 'failed', produced: [] }),
    };
    const orchestrator = new WorkflowOrchestrator(workflowPath, {
      projectRoot: tempDir,
      runtime,
      onPhaseComplete,
    });
    orchestrator.workflow = { workflow: { id: 'integrity' }, sequence: [] };
    orchestrator.preparePhase = jest.fn(async () => ({}));
    orchestrator.promptBuilder.buildPrompt = jest.fn(async () => 'prompt');
    orchestrator.contextManager = {
      getContextForPhase: jest.fn(async () => ({})),
      savePhaseOutput: jest.fn(async () => {}),
      markFailed: jest.fn(async () => {}),
    };

    await expect(orchestrator._executeSinglePhase(phase)).rejects.toMatchObject({
      code: 'WORKFLOW_PHASE_EXECUTION_FAILED',
    });

    expect(orchestrator.contextManager.markFailed).toHaveBeenCalled();
    expect(orchestrator.contextManager.savePhaseOutput).not.toHaveBeenCalled();
    expect(onPhaseComplete).not.toHaveBeenCalled();
    expect(orchestrator.executionState.completedPhases).toEqual([]);
    expect(orchestrator.executionState.failedPhases).toEqual([1]);
  });

  it('rejects ambiguous legacy requires and does not bypass it in yolo mode', async () => {
    const { orchestrator, runtime } = createOrchestrator();
    orchestrator.options.yolo = true;

    await expect(
      orchestrator._executeSinglePhase({
        ...phase,
        requires: ['required-input.md'],
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_REQUIRES_AMBIGUOUS' });

    expect(runtime.execute).not.toHaveBeenCalled();
    expect(orchestrator.contextManager.markFailed).toHaveBeenCalledWith(
      expect.stringContaining('ambiguous legacy requires'),
      1,
    );
    expect(orchestrator.executionState.failedPhases).toEqual([1]);
    expect(orchestrator.executionState.skippedPhases).toEqual([]);
  });

  it.each([
    ['missing output', { creates: ['missing.md'] }],
    ['failed post-action', { postActions: [{ type: 'file_exists', path: 'missing.md' }] }],
    ['rejected checklist', { checklist: 'required.md' }],
  ])('blocks completion for %s', async (_name, phaseOverrides) => {
    const { orchestrator } = createOrchestrator();
    if (phaseOverrides.checklist) {
      orchestrator.checklistRunner.run = jest.fn(async () => ({ passed: false, items: [] }));
    }

    await expect(
      orchestrator._executeSinglePhase({ ...phase, ...phaseOverrides }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_PHASE_VALIDATION_FAILED' });

    expect(orchestrator.contextManager.markFailed).toHaveBeenCalled();
    expect(orchestrator.contextManager.savePhaseOutput).not.toHaveBeenCalled();
    expect(orchestrator.executionState.completedPhases).toEqual([]);
  });

  it('treats checklist exceptions as validation failures', async () => {
    const { orchestrator } = createOrchestrator();
    orchestrator.checklistRunner.run = jest.fn(async () => {
      throw new Error('checklist crashed');
    });

    await expect(
      orchestrator._executeSinglePhase({ ...phase, checklist: 'required.md' }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_PHASE_VALIDATION_FAILED' });
  });

  it('rejects checklist passed values that are truthy but not exact true', async () => {
    const { orchestrator } = createOrchestrator();
    orchestrator.checklistRunner.run = jest.fn(async () => ({ passed: 'false', items: [] }));

    await expect(
      orchestrator._executeSinglePhase({ ...phase, checklist: 'required.md' }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_PHASE_VALIDATION_FAILED' });
  });

  it('treats post-action exceptions as validation failures', async () => {
    const { orchestrator } = createOrchestrator();
    orchestrator._executePostAction = jest.fn(async () => {
      throw new Error('post-action crashed');
    });

    await expect(
      orchestrator._executeSinglePhase({
        ...phase,
        postActions: [{ type: 'file_exists', path: 'artifact.md' }],
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_PHASE_VALIDATION_FAILED' });
  });

  it('rejects malformed post-action success evidence', async () => {
    const { orchestrator } = createOrchestrator();
    orchestrator._executePostAction = jest.fn(async () => ({ success: 'false' }));

    await expect(
      orchestrator._executeSinglePhase({
        ...phase,
        postActions: [{ type: 'file_exists', path: 'artifact.md' }],
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_PHASE_VALIDATION_FAILED' });
  });

  it('rejects malformed phase validation evidence', async () => {
    const { orchestrator } = createOrchestrator();
    orchestrator.validatePhaseOutput = jest.fn(async () => ({
      passed: 'false',
      checks: [],
      errors: [],
    }));

    await expect(orchestrator._executeSinglePhase(phase)).rejects.toMatchObject({
      code: 'WORKFLOW_PHASE_VALIDATION_FAILED',
    });
  });

  it('keeps checklist selection phase-local under concurrent validation', async () => {
    const { orchestrator } = createOrchestrator();
    orchestrator.checklistRunner.run = jest.fn(async (checklist) => ({
      passed: checklist === 'first.md',
      items: [],
    }));

    const [first, second] = await Promise.all([
      orchestrator.validatePhaseOutput({ ...phase, phase: 1, checklist: 'first.md' }, {}),
      orchestrator.validatePhaseOutput({ ...phase, phase: 2, checklist: 'second.md' }, {}),
    ]);

    expect(first.passed).toBe(true);
    expect(second.passed).toBe(false);
    expect(orchestrator.checklistRunner.run).toHaveBeenCalledWith('first.md', undefined);
    expect(orchestrator.checklistRunner.run).toHaveBeenCalledWith('second.md', undefined);
  });

  it('propagates parallel rejection before downstream groups can start', async () => {
    const { orchestrator } = createOrchestrator();
    orchestrator._executeSinglePhase = jest.fn(async (currentPhase) => {
      if (currentPhase.phase === 1) throw new Error('parallel failure');
      return { success: true };
    });

    await expect(
      orchestrator._executeParallelPhases([{ phase: 1 }, { phase: 2 }]),
    ).rejects.toThrow('parallel failure');
  });

  it('keeps real persisted failure terminal when a parallel sibling finishes later', async () => {
    const manager = new ContextManager('parallel-sticky', tempDir);
    await manager.initialize();
    const runtime = {
      execute: jest.fn(async ({ agentId }) => {
        if (agentId === 'qa') {
          return { success: false, status: 'failed', produced: [] };
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { success: true, status: 'success', produced: [] };
      }),
    };
    const orchestrator = new WorkflowOrchestrator(workflowPath, {
      projectRoot: tempDir,
      runtime,
      enableConfidenceGate: false,
    });
    orchestrator.workflow = {
      workflow: { id: 'parallel-sticky' },
      sequence: [
        { ...phase, phase: 1, agent: 'qa' },
        { ...phase, phase: 2, agent: 'dev' },
      ],
    };
    orchestrator.contextManager = manager;
    orchestrator.preparePhase = jest.fn(async () => ({}));
    orchestrator.promptBuilder.buildPrompt = jest.fn(async () => 'prompt');
    orchestrator.validatePhaseOutput = jest.fn(async () => ({ passed: true, checks: [], errors: [] }));

    await expect(
      orchestrator._executeParallelPhases(orchestrator.workflow.sequence),
    ).rejects.toMatchObject({ code: 'WORKFLOW_PHASE_EXECUTION_FAILED' });

    const state = await fs.readJson(manager.statePath);
    expect(state.status).toBe('failed');
    expect(state.failedPhase).toBe(1);
    expect(state.phases['2']).toEqual(expect.objectContaining({
      blockedByWorkflowFailure: true,
      handoff: null,
    }));
    expect(await fs.pathExists(
      path.join(manager.handoffDir, 'parallel-sticky-phase-2.handoff.json'),
    ))
      .toBe(false);
  });

  it('revokes a real persisted handoff when success finishes before parallel failure', async () => {
    const manager = new ContextManager('parallel-success-first', tempDir);
    await manager.initialize();
    const runtime = {
      execute: jest.fn(async ({ agentId }) => {
        if (agentId === 'qa') {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return { success: false, status: 'failed', produced: [] };
        }
        return { success: true, status: 'success', produced: [] };
      }),
    };
    const orchestrator = new WorkflowOrchestrator(workflowPath, {
      projectRoot: tempDir,
      runtime,
      enableConfidenceGate: false,
    });
    orchestrator.workflow = {
      workflow: { id: 'parallel-success-first' },
      sequence: [
        { ...phase, phase: 1, agent: 'dev' },
        { ...phase, phase: 2, agent: 'qa' },
      ],
    };
    orchestrator.contextManager = manager;
    orchestrator.preparePhase = jest.fn(async () => ({}));
    orchestrator.promptBuilder.buildPrompt = jest.fn(async () => 'prompt');
    orchestrator.validatePhaseOutput = jest.fn(async () => ({ passed: true, checks: [], errors: [] }));

    await expect(
      orchestrator._executeParallelPhases(orchestrator.workflow.sequence),
    ).rejects.toMatchObject({ code: 'WORKFLOW_PHASE_EXECUTION_FAILED' });

    const state = await fs.readJson(manager.statePath);
    expect(state.status).toBe('failed');
    expect(state.failedPhase).toBe(2);
    expect(state.phases['1']).toEqual(expect.objectContaining({
      blockedByWorkflowFailure: true,
      handoff: null,
      blockedHandoff: expect.any(Object),
    }));
    expect(await fs.pathExists(
      path.join(manager.handoffDir, 'parallel-success-first-phase-1.handoff.json'),
    )).toBe(false);
  });

  it('rejects missing required task contract before calling the runtime', async () => {
    const { orchestrator, runtime } = createOrchestrator();

    await expect(
      orchestrator._executeSinglePhase({
        ...phase,
        task: 'does-not-exist.md',
        requireAcceptance: true,
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_TASK_CONTRACT_REQUIRED' });

    expect(runtime.execute).not.toHaveBeenCalled();
  });

  it('rejects an invalid selected contract before calling the runtime', async () => {
    const { orchestrator, runtime } = createOrchestrator();

    await expect(
      orchestrator._executeSinglePhase({
        ...phase,
        contract: { contractVersion: 1 },
        requireAcceptance: true,
      }),
    ).rejects.toMatchObject({ code: 'TASK_CONTRACT_INVALID' });

    expect(runtime.execute).not.toHaveBeenCalled();
  });

  it('rejects missing required outcome acceptance after runtime success', async () => {
    const contract = {
      contractVersion: 1,
      inputs: [],
      produces: [],
      verify: [{ type: 'result-status', expected: 'success' }],
    };
    const { orchestrator } = createOrchestrator();

    await expect(
      orchestrator._executeSinglePhase({
        ...phase,
        contract,
        requireAcceptance: true,
      }),
    ).rejects.toMatchObject({ code: 'WORKFLOW_PHASE_ACCEPTANCE_FAILED' });

    expect(orchestrator.contextManager.savePhaseOutput).not.toHaveBeenCalled();
    expect(orchestrator.executionState.completedPhases).toEqual([]);
  });

  it('passes a selected valid contract and requires acceptance', async () => {
    const contract = {
      contractVersion: 1,
      inputs: [],
      produces: [],
      verify: [{ type: 'result-status', expected: 'success' }],
    };
    const runtime = {
      execute: jest.fn().mockResolvedValue({
        success: true,
        status: 'success',
        produced: [],
        acceptance: { verdict: 'ACCEPTED' },
      }),
    };
    const orchestrator = new WorkflowOrchestrator(workflowPath, {
      projectRoot: tempDir,
      runtime,
    });
    orchestrator.workflow = { workflow: { id: 'integrity' }, sequence: [] };
    orchestrator.preparePhase = jest.fn(async () => ({}));
    orchestrator.validatePhaseOutput = jest.fn(async () => ({ passed: true, checks: [], errors: [] }));
    orchestrator.promptBuilder.buildPrompt = jest.fn(async () => 'prompt');
    orchestrator.contextManager = {
      getContextForPhase: jest.fn(async () => ({})),
      savePhaseOutput: jest.fn(async () => {}),
      markFailed: jest.fn(async () => {}),
    };

    const result = await orchestrator._executeSinglePhase({
      ...phase,
      contract,
      requireAcceptance: true,
    });

    expect(runtime.execute).toHaveBeenCalledWith(expect.objectContaining({
      contract,
      requireAcceptance: true,
    }));
    expect(result.certification).toBe('accepted');
    expect(orchestrator.executionState.completedPhases).toEqual([1]);
  });

  it('labels legacy uncontracted phase success as non-certified', async () => {
    const { orchestrator } = createOrchestrator();
    orchestrator.validatePhaseOutput = jest.fn(async () => ({ passed: true, checks: [], errors: [] }));

    const result = await orchestrator._executeSinglePhase(phase);

    expect(result.certification).toBe('non-certified');
    expect(orchestrator.executionState.completedPhases).toEqual([1]);
  });
});
