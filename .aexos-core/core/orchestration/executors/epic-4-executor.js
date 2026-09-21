/**
 * Epic4Executor - Execution Engine Executor
 *
 * Story: 0.3 - Epic Executors (AC3)
 * Epic: Epic 0 - ADE Master Orchestrator
 *
 * Wraps plan-tracker and subtask-verifier to execute implementation plans.
 * Tracks progress, verifies subtask completion, manages build state.
 *
 * @module core/orchestration/executors/epic-4-executor
 * @version 1.0.0
 */

const fs = require('fs-extra');
const path = require('path');
const EpicExecutor = require('./epic-executor');

/**
 * Epic 4 Executor - Execution Engine
 * Manages plan execution and subtask verification
 */
class Epic4Executor extends EpicExecutor {
  constructor(orchestrator) {
    super(orchestrator, 4);

    // Lazy-load infrastructure scripts
    this._planTracker = null;
    this._subtaskVerifier = null;
  }

  /**
   * Get PlanTracker instance
   * @private
   */
  _getPlanTracker() {
    if (!this._planTracker) {
      try {
        const { PlanTracker } = require('../../../infrastructure/scripts/plan-tracker');
        this._planTracker = PlanTracker;
      } catch (error) {
        this._log(`PlanTracker not available: ${error.message}`, 'warn');
      }
    }
    return this._planTracker;
  }

  /**
   * Get SubtaskVerifier instance
   * @private
   */
  _getSubtaskVerifier() {
    if (!this._subtaskVerifier) {
      try {
        const { SubtaskVerifier } = require('../../../infrastructure/scripts/subtask-verifier');
        this._subtaskVerifier = SubtaskVerifier;
      } catch (error) {
        this._log(`SubtaskVerifier not available: ${error.message}`, 'warn');
      }
    }
    return this._subtaskVerifier;
  }

  /**
   * Execute the Execution Engine
   * @param {Object} context - Execution context
   * @param {string} context.spec - Path to specification
   * @param {string} context.complexity - Complexity level
   * @param {string} context.storyId - Story identifier
   * @returns {Promise<Object>} Execution result
   */
  async execute(context) {
    this._startExecution();

    try {
      const { spec, specPath, complexity, storyId, techStack: _techStack } = context;
      const actualSpecPath = spec || specPath;

      this._log(`Executing for story: ${storyId}`);
      this._log(`Complexity: ${complexity || 'STANDARD'}`);

      // Find or create implementation plan
      const planPath = await this._findOrCreatePlan(storyId, actualSpecPath, context);
      if (!planPath) {
        return this._blockedExecution('No real implementation plan was produced', [
          'An existing implementation.yaml or configured plan-create-implementation executor',
        ]);
      }
      this._log(`Using plan: ${planPath}`);
      this._addArtifact('plan', planPath);

      // Load plan tracker
      const PlanTracker = this._getPlanTracker();
      let tracker = null;
      let planStatus = null;

      if (PlanTracker) {
        tracker = new PlanTracker({
          storyId,
          planPath,
          rootPath: this.projectRoot,
        });

        // Get initial status
        try {
          tracker.load();
          planStatus = tracker.getStats();
          this._log(`Plan status: ${planStatus.completed}/${planStatus.total} subtasks`);
        } catch (error) {
          this._log(`Could not load plan: ${error.message}`, 'warn');
        }
      } else {
        return this._blockedExecution('PlanTracker is unavailable', ['PlanTracker runtime module']);
      }

      const plannedSubtasks = (tracker.plan?.phases || []).flatMap((phase) => phase.subtasks || []);
      if (plannedSubtasks.length === 0) {
        return this._blockedExecution('Implementation plan contains no executable subtasks', [
          'At least one implementation subtask',
        ]);
      }

      // Execute subtasks
      const subtaskResults = await this._executeSubtasks(storyId, tracker, context);
      if (subtaskResults.some((result) => !result.success)) {
        return this._blockedExecution('One or more implementation subtasks did not complete', [
          ...subtaskResults.filter((result) => !result.success).map((result) => result.pendingRequirement || result.subtaskId),
        ]);
      }

      // Collect code changes
      const codeChanges = this._collectCodeChanges(subtaskResults);

      // Run tests if available
      const testResults = await this._runTests(context);
      if (!testResults?.passed) {
        return this._blockedExecution(testResults?.error || 'Tests were not proven to pass', [
          ...(testResults?.pendingRequirements || ['Explicit passing test evidence']),
        ]);
      }

      // Calculate final progress
      const finalStats = tracker.getStats();
      const progress = {
        total: finalStats.total,
        completed: finalStats.completed,
        failed: finalStats.failed,
      };

      this._addArtifact('progress', JSON.stringify(progress));

      return this._completeExecution({
        implementationPath: planPath,
        planPath,
        progress,
        subtaskResults,
        codeChanges,
        testResults,
      });
    } catch (error) {
      return this._failExecution(error);
    }
  }

  /**
   * Find existing plan or create new one
   * @private
   */
  async _findOrCreatePlan(storyId, specPath, context) {
    // Look for existing implementation plan
    const possiblePaths = [
      this._getPath('docs', 'stories', storyId, 'plan', 'implementation.yaml'),
      this._getPath('docs', 'stories', storyId, 'implementation.yaml'),
      this._getPath('.aexos', 'plans', `${storyId}.yaml`),
    ];

    for (const planPath of possiblePaths) {
      const validated = await this._validateConsumerFile(planPath);
      if (validated) return validated;
    }

    if (typeof this.orchestrator?.invokeAgent !== 'function') return null;

    const invocation = await this.orchestrator.invokeAgentForTask(
      'architect',
      'plan-create-implementation.md',
      { ...context, storyId, specPath },
    );
    if (!invocation?.success || invocation.result?.success === false) return null;

    const reportedPath = invocation.result?.planPath || invocation.result?.implementationPath;
    if (reportedPath) {
      const absolute = path.isAbsolute(reportedPath) ? reportedPath : this._getPath(reportedPath);
      const validated = await this._validateConsumerFile(absolute);
      if (validated) return validated;
    }
    for (const candidate of possiblePaths) {
      const validated = await this._validateConsumerFile(candidate);
      if (validated) return validated;
    }
    return null;
  }

  /**
   * Execute subtasks from plan
   * @private
   */
  async _executeSubtasks(storyId, tracker, context) {
    const results = [];

    if (typeof this.orchestrator?.invokeAgent !== 'function') {
      return [{ success: false, pendingRequirement: 'MasterOrchestrator option invokeAgent' }];
    }

    const SubtaskVerifier = this._getSubtaskVerifier();
    if (!SubtaskVerifier) {
      return [{ success: false, pendingRequirement: 'SubtaskVerifier runtime module' }];
    }
    const verifier = new SubtaskVerifier({
      implementationPath: tracker.planPath,
      cwd: this.projectRoot,
      maxRetries: this.orchestrator?.maxRetries || 1,
    });

    for (const phase of tracker.plan?.phases || []) {
      for (const subtask of phase.subtasks || []) {
        if (subtask.status === 'completed' || subtask.status === 'skipped') continue;
        const invocation = await this.orchestrator.invokeAgentForTask('dev', 'plan-execute-subtask.md', {
          ...context,
          storyId,
          planPath: tracker.planPath,
          subtask,
          phase,
        });
        const output = invocation?.result || {};
        if (!invocation?.success || output.success === false || output.status === 'simulated') {
          results.push({
            subtaskId: subtask.id,
            success: false,
            error: invocation?.error || output.error || 'Subtask executor failed',
            pendingRequirement: `Successful real execution of subtask ${subtask.id}`,
          });
          continue;
        }

        const files = await this._validateOutputFiles(output.files || output.filesModified || []);
        if (!files) {
          results.push({
            subtaskId: subtask.id,
            success: false,
            error: 'Subtask output did not contain regular, non-empty consumer files',
            pendingRequirement: `Existing implementation artifacts for subtask ${subtask.id}`,
          });
          continue;
        }

        let verification;
        if (subtask.verification) {
          verification = await verifier.verify(subtask.id);
        } else {
          const explicitlyPassed = output.verified === true || output.verification?.passed === true;
          verification = { passed: explicitlyPassed, verificationType: 'executor-evidence' };
        }
        if (!verification.passed) {
          results.push({
            subtaskId: subtask.id,
            success: false,
            error: verification.error?.message || 'Subtask lacks passing verification evidence',
            pendingRequirement: `Passing verification for subtask ${subtask.id}`,
          });
          continue;
        }

        tracker.completeSubtask(subtask.id);
        results.push({
          subtaskId: subtask.id,
          name: subtask.description || subtask.name,
          success: true,
          files,
          verification,
          invocationId: invocation.invocationId,
        });
      }
    }

    return results;
  }

  async _validateOutputFiles(files) {
    if (!Array.isArray(files) || files.length === 0) return null;
    const validated = [];
    for (const file of files) {
      if (typeof file !== 'string' || !file.trim()) return null;
      const validatedFile = await this._validateConsumerFile(file);
      if (!validatedFile) return null;
      validated.push(validatedFile);
    }
    return validated;
  }

  async _validateConsumerFile(file) {
    if (typeof file !== 'string' || !file.trim()) return null;
    const root = path.resolve(this.projectRoot);
    const absolute = path.isAbsolute(file) ? path.resolve(file) : path.resolve(root, file);
    const relative = path.relative(root, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
    try {
      const stat = await fs.lstat(absolute);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) return null;
      const [realRoot, realArtifact] = await Promise.all([
        fs.realpath(root),
        fs.realpath(absolute),
      ]);
      const physicalRelative = path.relative(realRoot, realArtifact);
      if (physicalRelative.startsWith('..') || path.isAbsolute(physicalRelative)) return null;
      return absolute;
    } catch {
      return null;
    }
  }

  /**
   * Collect code changes from subtask results
   * @private
   */
  _collectCodeChanges(subtaskResults) {
    const changes = [];

    for (const result of subtaskResults) {
      if (result.files) {
        changes.push(...result.files);
      }
    }

    return changes;
  }

  /**
   * Run tests
   * @private
   */
  async _runTests(context) {
    if (typeof this.orchestrator?.invokeAgent !== 'function') {
      return { passed: false, pendingRequirements: ['MasterOrchestrator option invokeAgent'] };
    }
    const invocation = await this.orchestrator.invokeAgentForTask('qa', 'qa-run-tests.md', context);
    const output = invocation?.result || {};
    if (!invocation?.success || output.success === false || output.status === 'simulated') {
      return { passed: false, error: invocation?.error || output.error || 'Test executor failed' };
    }
    if (output.passed !== true) {
      return { passed: false, error: 'Test executor did not provide explicit passing evidence' };
    }
    return { ...output, passed: true, invocationId: invocation.invocationId };
  }

  _blockedExecution(reason, pendingRequirements = []) {
    return { ...this._failExecution(reason), blocked: true, pendingRequirements };
  }
}

module.exports = Epic4Executor;
