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
      { step: 'create', phase: 1, agent: 'dev', task: 'create-output', creates: 'docs/result.txt' },
      { step: 'dependent', phase: 2, agent: 'dev', task: 'create-output', requires: ['docs/result.txt'], creates: 'docs/second.txt' },
    ] } }));
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(async () => { jest.restoreAllMocks(); await fs.remove(root); });

  test('loads the shipped nested sequence and yields at the first undispatched phase', async () => {
    const result = await new WorkflowExecutor(root).executeWorkflow(workflow);
    expect(result).toMatchObject({ success: false, status: 'waiting_for_input', pendingPhases: [1],
      phases: { total: 2, completed: 0 } });
    const persisted = await fs.readJson(path.join(root, '.aexos/workflow-state/runtime-contract.json'));
    expect(persisted.phases['1'].result.status).toBe('pending_dispatch');
    expect(persisted.phases['2']).toBeUndefined();
  });

  test.each([undefined, 'Completed without artifacts', { status: 'success' }, { status: 'failed', error: 'Executor failure' }])(
    'never completes from a missing, unstructured, false or failed result: %p', async output => {
      let calls = 0;
      const result = await new WorkflowExecutor(root, { dispatchSubagent: async () => { calls++; return output; } }).executeWorkflow(workflow);
      expect(result.success).toBe(false);
      expect(result.completedPhases).toEqual([]);
      expect(calls).toBe(1);
    },
  );

  test('dispatches real definitions, verifies files, and propagates actual predecessor context', async () => {
    const seen = [];
    const result = await new WorkflowExecutor(root, { dispatchSubagent: async payload => {
      expect(payload.prompt).toContain('Implement the assigned task');
      expect(payload.prompt).toContain('Create the requested output');
      seen.push(payload.phase.phase);
      if (payload.phase.phase === 2) expect(payload.baseContext.previousPhases['1'].result.status).toBe('success');
      await fs.outputFile(path.join(root, payload.phase.creates), `Actual output ${payload.phase.phase}\n`);
      return { status: 'success', summary: 'Output created and available for verification' };
    } }).executeWorkflow(workflow);
    expect(seen).toEqual([1, 2]);
    expect(result).toMatchObject({ success: true, status: 'completed', phases: { completed: 2, failed: 0 } });
    expect(result.outputs['2'].validation.passed).toBe(true);
  });

  test('missing requirements yield even in YOLO mode instead of counting a skipped capability', async () => {
    const declared = yaml.load(await fs.readFile(workflow, 'utf8'));
    declared.workflow.sequence[0].requires = ['missing-input.md'];
    await fs.writeFile(workflow, yaml.dump(declared));
    const dispatch = jest.fn();
    const result = await new WorkflowExecutor(root, { yolo: true, dispatchSubagent: dispatch }).executeWorkflow(workflow);
    expect(result.success).toBe(false);
    expect(result.pendingPhases).toEqual([1]);
    expect(result.skippedPhases).toEqual([]);
    expect(dispatch).not.toHaveBeenCalled();
  });

  test('rejects missing explicit definitions and empty workflows', async () => {
    await fs.remove(path.join(root, '.aexos-core/development/agents/dev.md'));
    const result = await new WorkflowExecutor(root).executeWorkflow(workflow);
    expect(result.failedPhases).toEqual([1]);
    await fs.writeFile(workflow, 'workflow:\n  id: empty\n');
    await expect(new WorkflowExecutor(root).executeWorkflow(workflow)).rejects.toThrow('no executable sequence');
  });

  test('resumes a pending later phase with verified previous outputs and rejects missing history', async () => {
    const first = await new WorkflowExecutor(root, { dispatchSubagent: async ({ phase }) => {
      if (phase.phase === 2) return { status: 'waiting_for_input' };
      await fs.outputFile(path.join(root, phase.creates), 'Persisted first output\n');
      return { status: 'success' };
    } }).executeWorkflow(workflow);
    expect(first.pendingPhases).toEqual([2]);
    const calls = [];
    const resumed = await new WorkflowExecutor(root, { dispatchSubagent: async ({ phase }) => {
      calls.push(phase.phase);
      await fs.outputFile(path.join(root, phase.creates), 'Actual second output\n');
      return { status: 'success' };
    } }).executeWorkflow(workflow, { resumeFrom: 2 });
    expect(calls).toEqual([2]);
    expect(resumed.success).toBe(true);
    expect((await fs.readJson(path.join(root, '.aexos/workflow-state/runtime-contract.json'))).status).toBe('completed');
    await fs.remove(path.join(root, 'docs/result.txt'));
    await expect(new WorkflowExecutor(root).executeWorkflow(workflow, { resumeFrom: 2 })).rejects.toThrow('lacks valid output');
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

  test('resume preserves a completed step when another step shares its phase number', async () => {
    const declared = yaml.load(await fs.readFile(workflow, 'utf8'));
    declared.workflow.sequence[1].phase = 1;
    await fs.writeFile(workflow, yaml.dump(declared));
    const first = await new WorkflowExecutor(root, { dispatchSubagent: async ({ phase }) => {
      if (phase.step === 'dependent') return { status: 'waiting_for_input' };
      await fs.outputFile(path.join(root, phase.creates), 'Original completed step\n');
      return { status: 'success' };
    } }).executeWorkflow(workflow);
    expect(first.pendingPhases).toEqual([1]);
    const executed = [];
    const resumed = await new WorkflowExecutor(root, { dispatchSubagent: async ({ phase }) => {
      executed.push(phase.step);
      await fs.outputFile(path.join(root, phase.creates), 'Newly completed step\n');
      return { status: 'success' };
    } }).executeWorkflow(workflow, { resumeFrom: 1 });
    expect(resumed.success).toBe(true);
    expect(executed).toEqual(['dependent']);
    expect(await fs.readFile(path.join(root, 'docs/result.txt'), 'utf8')).toBe('Original completed step\n');
    expect(Object.keys(resumed.outputs['1'].steps)).toEqual(['create', 'dependent']);
  });

  test('resume cannot use a sibling step result for a failed step without declared files', async () => {
    const declared = yaml.load(await fs.readFile(workflow, 'utf8'));
    for (const phase of declared.workflow.sequence) { phase.phase = 1; delete phase.creates; delete phase.requires; }
    await fs.writeFile(workflow, yaml.dump(declared));
    const first = await new WorkflowExecutor(root, { dispatchSubagent: async ({ phase }) => {
      if (phase.step === 'dependent') throw new Error('Second step failed');
      return { status: 'success' };
    } }).executeWorkflow(workflow);
    expect(first.success).toBe(false);
    const executed = [];
    const resumed = await new WorkflowExecutor(root, { dispatchSubagent: async ({ phase }) => {
      executed.push(phase.step);
      return { status: 'success' };
    } }).executeWorkflow(workflow, { resumeFrom: 1 });
    expect(resumed.success).toBe(true);
    expect(executed).toEqual(['dependent']);
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
