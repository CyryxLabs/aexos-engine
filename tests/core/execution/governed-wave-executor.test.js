'use strict';

const WaveExecutor = require('../../../.aexos-core/core/execution/wave-executor');

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function createContract(outputPath) {
  return {
    contractVersion: 1,
    inputs: [],
    produces: [{ name: 'output', kind: 'file', path: outputPath }],
    verify: [{ type: 'file-exists', target: outputPath }],
  };
}

function createTask(id, options = {}) {
  return {
    id,
    agentId: options.agentId || 'dev',
    description: options.description || `Execute ${id}`,
    contract: options.contract,
    critical: options.critical,
    story: options.story,
    budgetCeilingUsd: options.budgetCeilingUsd,
    projectRoot: options.projectRoot,
  };
}

function createAnalyzer(waves) {
  return {
    analyzeWaves: jest.fn(() => ({ workflowId: 'workflow', waves })),
  };
}

describe('Governed WaveExecutor (AEX-1.3)', () => {
  test('consumes analyzeWaves output and resolves task ids from the supplied corpus', async () => {
    const runtime = { execute: jest.fn(async () => ({ success: true, output: 'done' })) };
    const analyzer = createAnalyzer([{ waveNumber: 1, tasks: ['task-a', 'task-b'] }]);
    const tasks = [
      createTask('task-a', { contract: createContract('reports/a.md') }),
      createTask('task-b', { contract: createContract('reports/b.md') }),
    ];
    const executor = new WaveExecutor({
      runtime,
      waveAnalyzer: analyzer,
      rateLimitManager: null,
    });

    const result = await executor.executeWaves('workflow', { tasks });

    expect(analyzer.analyzeWaves).toHaveBeenCalledWith('workflow', { customTasks: tasks });
    expect(result.success).toBe(true);
    expect(result.waves[0].results.map((entry) => entry.taskId)).toEqual(['task-a', 'task-b']);
    expect(runtime.execute).toHaveBeenCalledTimes(2);
  });

  test('bounds contracted task concurrency and preserves result order', async () => {
    let active = 0;
    let peak = 0;
    const runtime = {
      execute: jest.fn(async (request) => {
        active += 1;
        peak = Math.max(peak, active);
        try {
          await delay(request.task === 'task-a' ? 30 : 10);
          return { success: true, output: request.task };
        } finally {
          active -= 1;
        }
      }),
    };
    const tasks = ['a', 'b', 'c', 'd'].map((suffix) => (
      createTask(`task-${suffix}`, { contract: createContract(`reports/${suffix}.md`) })
    ));
    const executor = new WaveExecutor({
      runtime,
      maxParallel: 2,
      waveAnalyzer: createAnalyzer([{ waveNumber: 1, tasks }]),
      rateLimitManager: null,
    });

    const result = await executor.executeWaves('workflow', { tasks });

    expect(peak).toBe(2);
    expect(result.waves[0].results.map((entry) => entry.taskId)).toEqual([
      'task-a',
      'task-b',
      'task-c',
      'task-d',
    ]);
    expect(result.metrics.parallelEfficiency).toBeGreaterThan(1);
  });

  test('executes uncontracted tasks serially and never overlaps them with contracted tasks', async () => {
    let active = 0;
    let peak = 0;
    const runtime = {
      execute: jest.fn(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await delay(10);
        active -= 1;
        return { success: true };
      }),
    };
    const tasks = [createTask('legacy-a'), createTask('legacy-b')];
    const executor = new WaveExecutor({
      runtime,
      maxParallel: 4,
      waveAnalyzer: createAnalyzer([{ waveNumber: 1, tasks }]),
      rateLimitManager: null,
    });

    const result = await executor.executeWaves('workflow', { tasks });

    expect(peak).toBe(1);
    expect(runtime.execute).toHaveBeenCalledTimes(2);
    expect(result.metrics.parallelEfficiency).toBeLessThanOrEqual(1.2);
  });

  test('rejects duplicate declared outputs before any runtime call', async () => {
    const runtime = { execute: jest.fn() };
    const tasks = [
      createTask('task-a', { contract: createContract('reports/shared.md') }),
      createTask('task-b', { contract: createContract('reports/shared.md') }),
    ];
    const executor = new WaveExecutor({
      runtime,
      waveAnalyzer: createAnalyzer([{ waveNumber: 1, tasks }]),
      rateLimitManager: null,
    });

    await expect(executor.executeWaves('workflow', { tasks })).rejects.toMatchObject({
      code: 'WAVE_OUTPUT_CONFLICT',
      details: { path: 'reports/shared.md', taskIds: ['task-a', 'task-b'] },
    });
    expect(runtime.execute).not.toHaveBeenCalled();
  });

  test('detects logically identical outputs after project-relative path normalization', async () => {
    const runtime = { execute: jest.fn() };
    const tasks = [
      createTask('task-a', { contract: createContract('reports/shared.md') }),
      createTask('task-b', { contract: createContract('reports/tmp/../shared.md') }),
    ];
    const executor = new WaveExecutor({
      runtime,
      waveAnalyzer: createAnalyzer([{ waveNumber: 1, tasks }]),
      rateLimitManager: null,
    });

    await expect(executor.executeWaves('workflow', { tasks })).rejects.toMatchObject({
      code: 'WAVE_OUTPUT_CONFLICT',
      details: { path: 'reports/shared.md', taskIds: ['task-a', 'task-b'] },
    });
    expect(runtime.execute).not.toHaveBeenCalled();
  });

  test('propagates the governed task fields unchanged to AgentRuntime', async () => {
    const runtime = { execute: jest.fn(async () => ({ success: true })) };
    const contract = createContract('reports/result.md');
    const task = createTask('task-a', {
      agentId: 'qa',
      contract,
      story: 'AEX-1.3',
      budgetCeilingUsd: 2.5,
      projectRoot: process.cwd(),
    });
    const executor = new WaveExecutor({
      runtime,
      waveAnalyzer: createAnalyzer([{ waveNumber: 1, tasks: [task] }]),
      rateLimitManager: null,
      taskTimeout: 1234,
    });

    await executor.executeWaves('workflow', { tasks: [task], requiresStory: true });

    expect(runtime.execute).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'qa',
      task: 'task-a',
      prompt: 'Execute task-a',
      story: 'AEX-1.3',
      budgetCeilingUsd: 2.5,
      requiresStory: true,
      contract,
      projectRoot: process.cwd(),
      timeout: 1234,
    }));
  });

  test('rejects a non-empty workflow when no runtime or legacy adapter exists', async () => {
    const task = createTask('task-a');
    const executor = new WaveExecutor({
      waveAnalyzer: createAnalyzer([{ waveNumber: 1, tasks: [task] }]),
      rateLimitManager: null,
    });

    await expect(executor.executeWaves('workflow', { tasks: [task] })).rejects.toMatchObject({
      code: 'AGENT_RUNTIME_REQUIRED',
    });
  });

  test('keeps the explicit legacy task executor observable during migration', async () => {
    const taskExecutor = jest.fn(async (task, context) => ({
      success: true,
      output: `${task.id}:${context.marker}`,
    }));
    const executor = new WaveExecutor({
      taskExecutor,
      waveAnalyzer: null,
      rateLimitManager: null,
    });
    const started = jest.fn();
    executor.on('execution_started', started);

    const result = await executor.executeWaves('workflow', {
      tasks: [createTask('legacy-task')],
      marker: 'legacy',
      budgetCeilingUsd: 1,
    });

    expect(result.success).toBe(true);
    expect(taskExecutor).toHaveBeenCalledTimes(1);
    expect(started).toHaveBeenCalledWith(expect.objectContaining({ deprecatedRuntime: true }));
  });

  test('blocks later waves after a critical failure', async () => {
    const runtime = {
      execute: jest.fn(async (request) => ({
        success: request.task !== 'critical-task',
      })),
    };
    const criticalTask = createTask('critical-task', {
      critical: true,
      contract: createContract('reports/critical.md'),
    });
    const laterTask = createTask('later-task', {
      contract: createContract('reports/later.md'),
    });
    const executor = new WaveExecutor({
      runtime,
      waveAnalyzer: createAnalyzer([
        { waveNumber: 1, tasks: [criticalTask] },
        { waveNumber: 2, tasks: [laterTask] },
      ]),
      rateLimitManager: null,
    });

    const result = await executor.executeWaves('workflow', {
      tasks: [criticalTask, laterTask],
    });

    expect(result.aborted).toBe(true);
    expect(result.waves).toHaveLength(1);
    expect(runtime.execute).toHaveBeenCalledTimes(1);
  });

  test('validates maxParallel at construction time', () => {
    expect(() => new WaveExecutor({ maxParallel: 0 })).toThrow(expect.objectContaining({
      code: 'WAVE_CONCURRENCY_INVALID',
    }));
  });
});
