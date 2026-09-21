/**
 * Epic3Executor - Spec Pipeline Executor
 *
 * Story: 0.3 - Epic Executors (AC2)
 * Epic: Epic 0 - ADE Master Orchestrator
 *
 * Wraps the spec-pipeline.yaml workflow to generate specifications
 * from requirements/PRD through phases: gather → assess → research → spec → critique
 *
 * @module core/orchestration/executors/epic-3-executor
 * @version 1.0.0
 */

const fs = require('fs-extra');
const path = require('path');
const EpicExecutor = require('./epic-executor');

const PHASE_EXECUTION = {
  'gather-requirements': { agent: 'pm', task: 'spec-gather-requirements.md' },
  'assess-complexity': { agent: 'architect', task: 'spec-assess-complexity.md' },
  'research-dependencies': { agent: 'analyst', task: 'spec-research-dependencies.md' },
  'write-spec': { agent: 'pm', task: 'spec-write-spec.md' },
  critique: { agent: 'qa', task: 'spec-critique.md' },
};

/**
 * Spec Pipeline phases
 */
const SPEC_PHASES = [
  'gather-requirements',
  'assess-complexity',
  'research-dependencies',
  'write-spec',
  'critique',
];

/**
 * Epic 3 Executor - Spec Pipeline
 * Generates specifications from requirements/stories
 */
class Epic3Executor extends EpicExecutor {
  constructor(orchestrator) {
    super(orchestrator, 3);
    this.pipelinePath = this._getPath(
      '.aexos-core',
      'development',
      'workflows',
      'spec-pipeline.yaml',
    );
  }

  /**
   * Execute the Spec Pipeline
   * @param {Object} context - Execution context
   * @param {string} context.storyId - Story identifier
   * @param {string} context.source - Source type (story, prd, prompt)
   * @param {string} [context.prdPath] - Path to PRD if source is 'prd'
   * @returns {Promise<Object>} Execution result with specPath
   */
  async execute(context) {
    this._startExecution();

    try {
      const { storyId, source, prdPath, techStack } = context;

      this._log(`Executing Spec Pipeline for ${storyId}`);
      this._log(`Source: ${source}, Tech Stack: ${techStack ? 'detected' : 'none'}`);

      // Validate inputs
      if (!storyId) {
        return this._failExecution('storyId is required');
      }

      // Check for existing spec
      const existingSpec = await this._findExistingSpec(storyId);
      if (existingSpec) {
        this._log(`Found existing spec: ${existingSpec}`);
        this._addArtifact('spec', existingSpec, { reused: true });
        return this._completeExecution({
          specPath: existingSpec,
          reused: true,
        });
      }

      // Execute spec pipeline phases
      const phaseResults = {};
      let specPath = null;

      for (const phase of SPEC_PHASES) {
        this._log(`Running phase: ${phase}`);

        const phaseResult = await this._executePhase(phase, {
          storyId,
          source,
          prdPath,
          techStack,
          previousPhases: phaseResults,
        });

        phaseResults[phase] = phaseResult;

        if (!phaseResult.success) {
          this._log(`Phase ${phase} failed`, 'warn');
          return this._blockedExecution(
            phaseResult.error || `Spec pipeline phase failed: ${phase}`,
            phaseResult.pendingRequirements || [],
          );
        }

        // Extract spec path from write-spec phase
        if (phase === 'write-spec' && phaseResult.specPath) {
          specPath = phaseResult.specPath;
        }
      }

      // Validate spec was created
      specPath = await this._validateSpecArtifact(specPath);
      if (!specPath) {
        specPath = await this._findExistingSpec(storyId);
      }
      if (!specPath) {
        return this._blockedExecution('Spec pipeline completed without producing a specification', [
          'A configured spec executor must write and return a real specification artifact',
        ]);
      }

      this._addArtifact('spec', specPath);

      // Collect complexity and requirements from phases
      const complexity = phaseResults['assess-complexity']?.complexity || 'STANDARD';
      const requirements = phaseResults['gather-requirements']?.requirements || [];

      return this._completeExecution({
        specPath,
        complexity,
        requirements,
        phases: Object.keys(phaseResults),
      });
    } catch (error) {
      return this._failExecution(error);
    }
  }

  /**
   * Find existing spec for story
   * @private
   */
  async _findExistingSpec(storyId) {
    const possiblePaths = [
      this._getPath('docs', 'stories', storyId, 'spec.md'),
      this._getPath('docs', 'stories', storyId, 'SPEC.md'),
      this._getPath('docs', 'stories', storyId, 'spec', 'spec.md'),
      this._getPath('docs', 'specs', `${storyId}.md`),
      this._getPath('.aexos', 'specs', `${storyId}.md`),
    ];

    for (const specPath of possiblePaths) {
      const validated = await this._validateSpecArtifact(specPath);
      if (validated) return validated;
    }

    return null;
  }

  async _validateSpecArtifact(specPath) {
    if (!specPath || typeof specPath !== 'string') return null;
    const absolute = path.isAbsolute(specPath)
      ? path.resolve(specPath)
      : path.resolve(this.projectRoot, specPath);
    const relative = path.relative(path.resolve(this.projectRoot), absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
    try {
      const stat = await fs.lstat(absolute);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) return null;
      const [realRoot, realArtifact] = await Promise.all([
        fs.realpath(path.resolve(this.projectRoot)),
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
   * Execute a single pipeline phase
   * @private
   */
  async _executePhase(phase, context) {
    const execution = PHASE_EXECUTION[phase];
    const taskPath = this._getPath('.aexos-core', 'development', 'tasks', execution.task);

    // Check if task file exists
    if (!(await fs.pathExists(taskPath))) {
      this._log(`Task file not found: ${taskPath}`, 'warn');
      return {
        success: false,
        blocked: true,
        error: `Task file not found: ${taskPath}`,
        pendingRequirements: [execution.task],
      };
    }

    if (typeof this.orchestrator?.invokeAgent !== 'function') {
      return {
        success: false,
        blocked: true,
        error: `No real agent executor configured for spec phase ${phase}`,
        pendingRequirements: ['MasterOrchestrator option invokeAgent'],
      };
    }

    const invocation = await this.orchestrator.invokeAgentForTask(
      execution.agent,
      execution.task,
      context,
    );
    if (!invocation?.success || !invocation.result || invocation.result.status === 'simulated') {
      return {
        success: false,
        blocked: true,
        error: invocation?.error || `Agent execution failed for spec phase ${phase}`,
        pendingRequirements: [`Successful real execution of ${execution.task}`],
      };
    }

    if (invocation.result.success === false) {
      return {
        ...invocation.result,
        success: false,
        error: invocation.result.error || `Agent execution failed for spec phase ${phase}`,
      };
    }

    return { ...invocation.result, success: true, phase, invocationId: invocation.invocationId };
  }

  _blockedExecution(reason, pendingRequirements = []) {
    return {
      ...this._failExecution(reason),
      blocked: true,
      pendingRequirements,
    };
  }
}

module.exports = Epic3Executor;
