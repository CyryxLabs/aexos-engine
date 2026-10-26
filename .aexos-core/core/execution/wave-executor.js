/**
 * Wave Executor
 * Story 10.1 - Parallel Agent Execution
 *
 * Executes task waves in parallel, leveraging the WaveAnalyzer
 * for dependency-aware scheduling.
 */

const EventEmitter = require('events');
const { assertRuntime, createLegacyRuntime } = require('./agent-runtime');
const { normalizeTaskContract } = require('./task-contract');

// Import dependencies with fallbacks
let WaveAnalyzer;
try {
  ({ WaveAnalyzer } = require('../../workflow-intelligence/engine/wave-analyzer'));
} catch {
  WaveAnalyzer = null;
}

let RateLimitManager;
try {
  RateLimitManager = require('./rate-limit-manager');
} catch {
  RateLimitManager = null;
}

class WaveExecutionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'WaveExecutionError';
    this.code = code;
    this.details = details;
  }
}

function validateMaxParallel(value) {
  if (!Number.isInteger(value) || value < 1) {
    throw new WaveExecutionError(
      'WAVE_CONCURRENCY_INVALID',
      'WaveExecutor maxParallel must be a positive integer.',
      { maxParallel: value },
    );
  }
  return value;
}

function createLegacyTaskRuntime(taskExecutor, rateLimitManager, config = {}) {
  if (typeof taskExecutor !== 'function') return null;

  const runtime = createLegacyRuntime((request) => {
    const execute = () => taskExecutor(request.taskDefinition, request.executionContext);
    if (rateLimitManager && typeof rateLimitManager.executeWithRetry === 'function') {
      return rateLimitManager.executeWithRetry(execute, { taskId: request.task });
    }
    return execute();
  }, {
    projectRoot: config.projectRoot,
    governance: config.governance,
    governanceController: config.governanceController,
    governanceTokenSecret: config.governanceTokenSecret,
    governanceTokenTtlMs: config.governanceTokenTtlMs,
    clock: config.clock,
    evidenceSink: config.evidenceSink,
    budgetSink: config.budgetSink,
    budgetFlushIntervalMs: config.budgetFlushIntervalMs,
  });
  const capabilities = runtime.capabilities.bind(runtime);
  runtime.capabilities = () => ({ ...capabilities(), legacyTaskExecutor: true });
  return runtime;
}

class WaveExecutor extends EventEmitter {
  constructor(config = {}) {
    super();

    // Configuration
    this.maxParallel = validateMaxParallel(config.maxParallel ?? 4);
    this.taskTimeout = config.taskTimeout || 10 * 60 * 1000; // 10 minutes
    this.continueOnNonCriticalFailure = config.continueOnNonCriticalFailure !== false;

    // Dependencies
    this.waveAnalyzer = Object.prototype.hasOwnProperty.call(config, 'waveAnalyzer')
      ? config.waveAnalyzer
      : (WaveAnalyzer ? new WaveAnalyzer() : null);
    this.taskExecutor = config.taskExecutor || null;
    this.rateLimitManager = Object.prototype.hasOwnProperty.call(config, 'rateLimitManager')
      ? config.rateLimitManager
      : (RateLimitManager ? new RateLimitManager() : null);
    this.runtime = config.runtime
      || createLegacyTaskRuntime(config.taskExecutor, this.rateLimitManager, config);

    // State
    this.activeExecutions = new Map();
    this.completedWaves = [];
    this.currentWaveIndex = 0;
  }

  /**
   * Execute all waves for a workflow
   * @param {string} workflowId - Workflow identifier
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} - Execution results
   */
  async executeWaves(workflowId, context = {}) {
    const startTime = Date.now();

    const analysis = this._analyzeWorkflow(workflowId, context);

    if (!analysis.waves || analysis.waves.length === 0) {
      return {
        workflowId,
        success: true,
        waves: [],
        totalDuration: 0,
        message: 'No waves to execute',
      };
    }

    assertRuntime(this.runtime);

    this.emit('execution_started', {
      workflowId,
      totalWaves: analysis.waves.length,
      deprecatedRuntime: this.runtime.deprecated === true,
    });

    const results = [];
    let aborted = false;

    for (const wave of analysis.waves) {
      if (aborted) break;

      this.currentWaveIndex = wave.index;
      this.emit('wave_started', {
        waveIndex: wave.index,
        tasks: wave.tasks.map((t) => ({ id: t.id, description: t.description })),
        totalTasks: wave.tasks.length,
      });

      const waveStartedAt = Date.now();
      const waveResult = await this.executeWave(wave, context);
      const wallDuration = Date.now() - waveStartedAt;

      results.push({
        wave: wave.index,
        results: waveResult,
        allSucceeded: waveResult.every((r) => r.success),
        duration: waveResult.reduce((sum, r) => sum + (r.duration || 0), 0),
        wallDuration,
      });
      this.completedWaves.push(wave.index);

      this.emit('wave_completed', {
        waveIndex: wave.index,
        results: waveResult,
        success: waveResult.every((r) => r.success),
      });

      // Check if we should continue
      const criticalFailed = waveResult.some((r) => !r.success && r.critical);
      if (criticalFailed) {
        this.emit('wave_failed', {
          waveIndex: wave.index,
          reason: 'critical_task_failed',
          failedTasks: waveResult.filter((r) => !r.success && r.critical),
        });

        aborted = true;
      } else if (
        waveResult.some((result) => !result.success)
        && !this.continueOnNonCriticalFailure
      ) {
        aborted = true;
      }
    }

    const totalDuration = Date.now() - startTime;

    const executionResult = {
      workflowId,
      waves: results,
      success: !aborted && results.every((w) => w.allSucceeded),
      aborted,
      totalDuration,
      metrics: this.calculateMetrics(results),
    };

    this.emit('execution_completed', executionResult);

    return executionResult;
  }

  _analyzeWorkflow(workflowId, context) {
    const tasks = Array.isArray(context.tasks) ? context.tasks : [];
    let analysis;

    if (this.waveAnalyzer && typeof this.waveAnalyzer.analyzeWaves === 'function') {
      analysis = this.waveAnalyzer.analyzeWaves(workflowId, { customTasks: tasks });
    } else if (this.waveAnalyzer && typeof this.waveAnalyzer.analyze === 'function') {
      analysis = this.waveAnalyzer.analyze(workflowId, { customTasks: tasks });
    } else {
      analysis = {
        workflowId,
        waves: tasks.length > 0 ? [{ index: 1, tasks }] : [],
      };
    }

    const taskMap = new Map();
    for (const task of tasks) {
      if (!task || typeof task !== 'object') continue;
      if (task.id) taskMap.set(task.id, task);
      if (task.name) taskMap.set(task.name, task);
    }

    const waves = (analysis?.waves || []).map((wave, position) => ({
      ...wave,
      index: wave.index ?? wave.waveNumber ?? position + 1,
      tasks: (wave.tasks || []).map((task) => {
        if (task && typeof task === 'object') return task;
        const resolved = taskMap.get(task);
        if (!resolved) {
          throw new WaveExecutionError(
            'WAVE_TASK_NOT_FOUND',
            `Wave analysis referenced an unknown task: ${task}`,
            { workflowId, taskId: task },
          );
        }
        return resolved;
      }),
    }));

    return { ...analysis, workflowId, waves };
  }

  _planWave(tasks, context) {
    const projectRoot = context.projectRoot || process.cwd();
    const parallelTasks = [];
    const serialTasks = [];
    const outputOwners = new Map();

    for (const [position, task] of tasks.entries()) {
      if (!task || typeof task !== 'object' || !task.id) {
        throw new WaveExecutionError(
          'WAVE_TASK_INVALID',
          'Every wave task must be an object with a non-empty id.',
          { position },
        );
      }

      if (!task.contract) {
        serialTasks.push({ ...task, _wavePosition: position });
        continue;
      }

      const contract = normalizeTaskContract(
        task.contract,
        task.projectRoot || projectRoot,
      );
      const plannedTask = { ...task, contract, _wavePosition: position };

      for (const output of contract.produces) {
        if (!output.path) continue;
        const owner = outputOwners.get(output.path);
        if (owner && owner !== task.id) {
          throw new WaveExecutionError(
            'WAVE_OUTPUT_CONFLICT',
            `Tasks ${owner} and ${task.id} both declare output ${output.path}.`,
            { path: output.path, taskIds: [owner, task.id] },
          );
        }
        outputOwners.set(output.path, task.id);
      }

      parallelTasks.push(plannedTask);
    }

    return { parallelTasks, serialTasks };
  }

  async _executeBounded(tasks, worker) {
    const results = new Array(tasks.length);
    let nextIndex = 0;
    const workerCount = Math.min(this.maxParallel, tasks.length);

    const runWorker = async () => {
      while (nextIndex < tasks.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await worker(tasks[currentIndex]);
      }
    };

    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
    return results;
  }

  /**
   * Execute a single wave with parallel task execution
   * @param {Object} wave - Wave definition
   * @param {Object} context - Execution context
   * @returns {Promise<Array>} - Task results
   */
  async executeWave(wave, context) {
    const tasks = wave.tasks || [];

    if (tasks.length === 0) {
      return [];
    }

    const plan = this._planWave(tasks, context);
    assertRuntime(this.runtime);
    const observed = [];

    const executeTask = async (task) => {
      const value = await this.executeTaskWithTimeout(task, context);
      const result = {
        taskId: task.id,
        success: value.success,
        result: value,
        critical: task.critical || false,
        duration: value.duration || 0,
        _wavePosition: task._wavePosition,
      };
      this.emit('task_completed', {
        taskId: task.id,
        success: value.success,
        waveIndex: wave.index,
      });
      return result;
    };

    observed.push(...await this._executeBounded(plan.parallelTasks, executeTask));
    for (const task of plan.serialTasks) {
      observed.push(await executeTask(task));
    }

    return observed
      .sort((left, right) => left._wavePosition - right._wavePosition)
      .map(({ _wavePosition, ...result }) => result);
  }

  /**
   * Execute a task with timeout
   * @param {Object} task - Task to execute
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} - Task result
   */
  async executeTaskWithTimeout(task, context) {
    const startTime = Date.now();
    let timeoutId;

    // Track active execution
    this.activeExecutions.set(task.id, {
      task,
      startTime,
      status: 'running',
    });

    this.emit('task_started', { taskId: task.id, description: task.description });

    try {
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Task ${task.id} timed out after ${this.taskTimeout}ms`));
        }, this.taskTimeout);
      });

      const runtime = assertRuntime(this.runtime);
      const executionPromise = runtime.execute(this._buildRuntimeRequest(task, context));

      // Race between execution and timeout
      const result = await Promise.race([executionPromise, timeoutPromise]);

      // Update active execution
      this.activeExecutions.set(task.id, {
        task,
        startTime,
        endTime: Date.now(),
        status: 'completed',
        success: result.success,
      });

      return {
        ...result,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      // Update active execution
      this.activeExecutions.set(task.id, {
        task,
        startTime,
        endTime: Date.now(),
        status: 'failed',
        error: error.message,
      });

      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      // Remove from active after a delay (for monitoring)
      const cleanupTimer = setTimeout(() => {
        this.activeExecutions.delete(task.id);
      }, 5000);
      cleanupTimer.unref?.();
    }
  }

  _buildRuntimeRequest(task, context) {
    const projectRoot = task.projectRoot || context.projectRoot || process.cwd();
    return {
      agentId: task.agentId
        || context.agentId
        || (this.runtime?.deprecated ? 'legacy-task-executor' : undefined),
      task: task.id,
      prompt: task.prompt || task.description || context.prompt,
      story: task.story || context.story,
      budgetCeilingUsd: task.budgetCeilingUsd ?? context.budgetCeilingUsd,
      budgetScope: task.budgetScope || context.budgetScope,
      estimatedCostUsd: task.estimatedCostUsd ?? context.estimatedCostUsd,
      requiresStory: task.requiresStory ?? context.requiresStory,
      contract: task.contract,
      projectRoot,
      timeout: task.timeout || context.timeout || this.taskTimeout,
      jsonOutput: task.jsonOutput ?? context.jsonOutput,
      taskDefinition: task,
      executionContext: context,
    };
  }

  /**
   * Split array into chunks
   * @param {Array} array - Array to split
   * @param {number} size - Chunk size
   * @returns {Array<Array>} - Chunked arrays
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Calculate execution metrics
   * @param {Array} waveResults - Results from all waves
   * @returns {Object} - Metrics
   */
  calculateMetrics(waveResults) {
    const allTasks = waveResults.flatMap((w) => w.results);
    const successful = allTasks.filter((t) => t.success).length;
    const failed = allTasks.filter((t) => !t.success).length;
    const totalDuration = allTasks.reduce((sum, t) => sum + (t.duration || 0), 0);

    // Sum the wall-clock duration observed around each wave. Falling back to
    // the longest task preserves compatibility for externally supplied result
    // sets that predate wallDuration.
    const wallTime = waveResults.reduce((sum, wave) => {
      if (Number.isFinite(wave.wallDuration)) return sum + wave.wallDuration;
      if (wave.results.length === 0) return sum;
      return sum + Math.max(...wave.results.map((result) => result.duration || 0));
    }, 0);

    return {
      totalTasks: allTasks.length,
      successful,
      failed,
      successRate: allTasks.length > 0 ? (successful / allTasks.length) * 100 : 100,
      totalDuration,
      wallTime,
      parallelEfficiency: wallTime > 0 ? totalDuration / wallTime : 1,
      totalWaves: waveResults.length,
    };
  }

  /**
   * Get current execution status
   * @returns {Object} - Current status
   */
  getStatus() {
    const active = [];
    for (const [taskId, execution] of this.activeExecutions) {
      active.push({
        taskId,
        status: execution.status,
        elapsed: Date.now() - execution.startTime,
      });
    }

    return {
      currentWave: this.currentWaveIndex,
      activeExecutions: active,
      completedWaves: this.completedWaves.length,
    };
  }

  /**
   * Format status for CLI output
   * @returns {string} - Formatted status
   */
  formatStatus() {
    const status = this.getStatus();

    let output = '🌊 Wave Executor Status\n';
    output += '━'.repeat(40) + '\n\n';

    output += `Current Wave: ${status.currentWave}\n`;
    output += `Completed Waves: ${status.completedWaves}\n`;
    output += `Active Executions: ${status.activeExecutions.length}\n\n`;

    if (status.activeExecutions.length > 0) {
      output += '**Active Tasks:**\n';
      for (const exec of status.activeExecutions) {
        const elapsed = Math.round(exec.elapsed / 1000);
        const icon = exec.status === 'running' ? '🔄' : exec.status === 'completed' ? '✅' : '❌';
        output += `  ${icon} ${exec.taskId} - ${elapsed}s\n`;
      }
    }

    return output;
  }

  /**
   * Cancel all active executions
   */
  cancelAll() {
    for (const [taskId, execution] of this.activeExecutions) {
      execution.status = 'cancelled';
      this.emit('task_cancelled', { taskId });
    }
    this.emit('execution_cancelled', { reason: 'user_requested' });
  }
}

module.exports = WaveExecutor;
module.exports.WaveExecutor = WaveExecutor;
module.exports.WaveExecutionError = WaveExecutionError;
