'use strict';

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const yaml = require('js-yaml');
const WorkflowOrchestrator = require('../../.aexos-core/core/orchestration/workflow-orchestrator');
const { WorkflowExecutor } = require('../../.aexos-core/core/orchestration/workflow-executor');

describe('declared YAML workflow runtime', () => {
  let root, workflow;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'aexos-yaml-runtime-'));
    workflow = path.join(root, 'workflow.yaml');
    await fs.outputFile(path.join(root, '.aexos-core/development/agents/dev.md'), '# Developer\nImplement the assigned task and report actual results.\n');
    await fs.outputFile(path.join(root, '.aexos-core/development/tasks/create-output.md'), '# Create output\nCreate the requested output from the supplied input.\n');
    await fs.writeFile(workflow, yaml.dump({ workflow: { id: 'runtime-contract', sequence: [
      { id: 'create', step: 'create', phase: 1, agent: 'dev', task: 'create-output', creates: 'docs/result.txt' },
      { id: 'dependent', step: 'dependent', phase: 2, agent: 'dev', task: 'create-output', dependsOn: ['create'], requiresFiles: ['docs/result.txt'], creates: 'docs/second.txt' },
    ] } }));
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(async () => { jest.restoreAllMocks(); await fs.remove(root); });

  function executor(dispatch) {
    return new WorkflowExecutor(root, {
      frameworkRoot: root, enableConfidenceGate: false,
      runtime: { execute: request => dispatch(request.legacyPayload) },
    });
  }

  test('loads the canonical nested sequence and refuses an unconfigured runtime', async () => {
    await expect(new WorkflowExecutor(root, { frameworkRoot: root }).executeWorkflow(workflow))
      .rejects.toThrow();
    const persisted = await fs.readJson(path.join(root, '.aexos/workflow-state/runtime-contract.json'));
    expect(persisted.status).toBe('failed');
    expect(persisted.phases['1']).toBeUndefined();
    expect(persisted.phases['2']).toBeUndefined();
  });

  test.each([undefined, 'Completed without artifacts', { status: 'success' }, { status: 'failed', error: 'Executor failure' }])(
    'never completes from a missing, unstructured, false or failed result: %p', async output => {
      let calls = 0;
      await expect(executor(async () => { calls++; return output; }).executeWorkflow(workflow))
        .rejects.toMatchObject({ code: 'WORKFLOW_PHASE_EXECUTION_FAILED' });
      expect(calls).toBe(1);
    },
  );

  test('dispatches real definitions, verifies files, and propagates actual predecessor context', async () => {
    const seen = [];
    const result = await executor(async payload => {
      expect(payload.prompt).toContain('Implement the assigned task');
      expect(payload.prompt).toContain('Create the requested output');
      seen.push(payload.phase.phase);
      if (payload.phase.phase === 2) expect(payload.baseContext.previousPhases['1'].result.status).toBe('success');
      await fs.outputFile(path.join(root, payload.phase.creates), `Actual output ${payload.phase.phase}\n`);
      return { success: true, status: 'success', summary: 'Output created and available for verification' };
    }).executeWorkflow(workflow);
    expect(seen).toEqual([1, 2]);
    expect(result).toMatchObject({ success: true, status: 'completed', phases: { completed: 2, failed: 0 } });
    expect(result.outputs['2'].validation.passed).toBe(true);
  });

  test('missing requirements yield even in YOLO mode instead of counting a skipped capability', async () => {
    const declared = yaml.load(await fs.readFile(workflow, 'utf8'));
    declared.workflow.sequence[0].requiresFiles = ['missing-input.md'];
    await fs.writeFile(workflow, yaml.dump(declared));
    const dispatch = jest.fn();
    await expect(executor(dispatch).executeWorkflow(workflow, { yolo: true }))
      .rejects.toMatchObject({ code: 'WORKFLOW_PHASE_FILE_PREREQUISITE_MISSING' });
    expect(dispatch).not.toHaveBeenCalled();
  });

  test('rejects missing explicit definitions and empty workflows', async () => {
    await fs.remove(path.join(root, '.aexos-core/development/agents/dev.md'));
    const dispatch = jest.fn();
    await expect(executor(dispatch).executeWorkflow(workflow)).rejects.toThrow();
    expect(dispatch).not.toHaveBeenCalled();
    await fs.writeFile(workflow, 'workflow:\n  id: empty\n');
    await expect(new WorkflowExecutor(root).executeWorkflow(workflow)).rejects.toThrow('A workflow sequence is required');
  });

  test('retains verified earlier output but refuses to resume a terminal failed workflow', async () => {
    await expect(executor(async ({ phase }) => {
      if (phase.phase === 2) return { status: 'waiting_for_input' };
      await fs.outputFile(path.join(root, phase.creates), 'Persisted first output\n');
      return { success: true, status: 'success' };
    }).executeWorkflow(workflow)).rejects.toMatchObject({ code: 'WORKFLOW_PHASE_EXECUTION_FAILED' });
    const calls = [];
    await expect(executor(async ({ phase }) => {
      calls.push(phase.phase);
      await fs.outputFile(path.join(root, phase.creates), 'Actual second output\n');
      return { success: true, status: 'success' };
    }).executeWorkflow(workflow, { resumeFrom: 2 })).rejects.toMatchObject({ code: 'WORKFLOW_RESUME_FAILED_STATE' });
    expect(calls).toEqual([]);
    expect(await fs.readFile(path.join(root, 'docs/result.txt'), 'utf8')).toBe('Persisted first output\n');
    expect((await fs.readJson(path.join(root, '.aexos/workflow-state/runtime-contract.json'))).status).toBe('failed');
    await fs.remove(path.join(root, 'docs/result.txt'));
    await expect(new WorkflowExecutor(root).executeWorkflow(workflow, { resumeFrom: 2 }))
      .rejects.toMatchObject({ code: 'WORKFLOW_RESUME_FAILED_STATE' });
  });

  test('output validation supports story placeholders, rejects empty files and fails unknown actions', async () => {
    const runner = new WorkflowOrchestrator(workflow, { projectRoot: root });
    await fs.outputFile(path.join(root, 'docs/stories/story-1.1-build.md'), '# Real story\n');
    expect(await runner.resolveOutputPaths('docs/stories/story-X.X-*.md')).toEqual(['docs/stories/story-1.1-build.md']);
    await fs.outputFile(path.join(root, 'docs/empty.txt'), '');
    await expect(runner.resolveOutputPaths('docs/empty.txt')).rejects.toThrow('Empty');
    await expect(runner.resolveOutputPaths('../outside.md')).rejects.toThrow('Invalid');
    await expect(runner._executePreAction({ type: 'unknown' })).rejects.toThrow('Unknown');
    await expect(runner._executePostAction({ type: 'unknown' })).rejects.toThrow('Unknown');
    expect(await runner._executePreAction({ type: 'check_tool', tool: 'unavailable' })).toMatchObject({ success: false });
  });

  test.each([true, false])('rejects ambiguous duplicate numeric phases before dispatch (files: %s)', async withFiles => {
    const declared = yaml.load(await fs.readFile(workflow, 'utf8'));
    for (const phase of declared.workflow.sequence) {
      phase.phase = 1;
      if (!withFiles) { delete phase.creates; delete phase.requiresFiles; }
    }
    await fs.writeFile(workflow, yaml.dump(declared));
    const dispatch = jest.fn();
    await expect(executor(dispatch).executeWorkflow(workflow, { resumeFrom: 1 }))
      .rejects.toThrow('Duplicate numeric phase metadata');
    expect(dispatch).not.toHaveBeenCalled();
    expect(await fs.pathExists(path.join(root, 'docs/result.txt'))).toBe(false);
  });
  test('a context replacement failure leaves the previous persisted state readable', async () => {
    const ContextManager = require('../../.aexos-core/core/orchestration/context-manager');
    const context = new ContextManager('atomic-state', root);
    await context.initialize();
    const bytes = await fs.readFile(context.statePath);
    jest.spyOn(require('fs'), 'renameSync').mockImplementation(() => { throw new Error('Injected context rename failure'); });
    await expect(context.updateMetadata({ newValue: true })).rejects.toThrow('Injected context rename failure');
    expect(await fs.readFile(context.statePath)).toEqual(bytes);
    expect((await fs.readJson(context.statePath)).metadata.newValue).toBeUndefined();
  });
});
