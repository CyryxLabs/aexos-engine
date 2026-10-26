/**
 * Workflow Orchestrator - Multi-Agent Workflow Execution
 *
 * Executes workflows using real subagents with proper persona transformation.
 * Each phase dispatches to a specialized agent that fully adopts its persona
 * and executes the defined task following AEXOS methodology.
 *
 * @module core/orchestration/workflow-orchestrator
 * @version 1.0.0
 */

const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const yaml = require('js-yaml');
const chalk = require('chalk');

const SubagentPromptBuilder = require('./subagent-prompt-builder');
const ContextManager = require('./context-manager');
const ParallelExecutor = require('./parallel-executor');
const ChecklistRunner = require('./checklist-runner');
const {
  assertRuntime,
  createLegacyRuntime,
} = require(path.resolve(__dirname, '../execution/agent-runtime'));
const {
  loadTaskContract,
  normalizeTaskContract,
} = require(path.resolve(__dirname, '../execution/task-contract'));
const {
  WorkflowNormalizationError,
  normalizeWorkflowDocument,
} = require(path.resolve(__dirname, 'workflow-normalizer'));
const { assertExecutionBinding } = require(path.resolve(
  __dirname,
  '../execution/execution-binding',
));
const { verifyTaskOutcome } = require(path.resolve(__dirname, '../execution/outcome-verifier'));

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// V3.1 Components for Pre-Flight Detection and Skill Dispatch
const TechStackDetector = require('./tech-stack-detector');
const ConditionEvaluator = require('./condition-evaluator');
const SkillDispatcher = require('./skill-dispatcher');
const { resolveExecutionProfile } = require('./execution-profile-resolver');

/**
 * Orchestrates multi-agent workflow execution
 */
class WorkflowOrchestrator {
  /**
   * @param {string} workflowPath - Path to workflow YAML file
   * @param {Object} options - Execution options
   * @param {boolean} options.yolo - YOLO mode (less interaction)
   * @param {boolean} options.parallel - Enable parallel execution
   * @param {Function} options.onPhaseStart - Callback when phase starts
   * @param {Function} options.onPhaseComplete - Callback when phase completes
   * @param {{log: Function}} options.logger - Optional instance logger; defaults to console
   * @param {Object} options.runtime - AgentRuntime execution boundary
   * @param {Function} options.dispatchSubagent - Deprecated explicit legacy executor
   */
  constructor(workflowPath, options = {}) {
    const logger = options.logger === undefined ? console : options.logger;
    if (!logger || typeof logger !== 'object' || typeof logger.log !== 'function') {
      const error = new TypeError('WorkflowOrchestrator logger must expose log(...args).');
      error.code = 'WORKFLOW_LOGGER_INVALID';
      throw error;
    }
    this.workflowPath = workflowPath;
    this.logger = logger;
    this.options = {
      yolo: options.yolo || false,
      executionProfile: options.executionProfile || null,
      executionContext: options.executionContext || 'development',
      parallel: options.parallel !== false, // Default true
      onPhaseStart: options.onPhaseStart || this._defaultPhaseStart.bind(this),
      onPhaseComplete: options.onPhaseComplete || this._defaultPhaseComplete.bind(this),
      projectRoot: path.resolve(options.projectRoot || process.cwd()),
      frameworkRoot: path.resolve(options.frameworkRoot || path.resolve(__dirname, '../../..')),
      stateRoot: options.stateRoot ? path.resolve(options.stateRoot) : null,
      budgetCeilingUsd: options.budgetCeilingUsd,
      workflowBudgetScope: options.workflowBudgetScope,
      workflowBudgetCeilingUsd: options.workflowBudgetCeilingUsd,
      confidenceThreshold: this._resolveConfidenceThreshold(options.confidenceThreshold),
      enableConfidenceGate: options.enableConfidenceGate !== false,
    };
    this.runtime = options.runtime || createLegacyRuntime(options.dispatchSubagent, {
      projectRoot: this.options.projectRoot,
      governanceTokenSecret: options.governanceTokenSecret,
      governanceTokenTtlMs: options.governanceTokenTtlMs,
      clock: options.clock,
      evidenceSink: options.evidenceSink,
      budgetSink: options.budgetSink,
      budgetFlushIntervalMs: options.budgetFlushIntervalMs,
    });
    this.executionBindings = options.executionBindings === undefined
      ? null
      : options.executionBindings;
    this.validatedExecutionBindings = new Map();

    this.workflow = null;
    this.promptBuilder = new SubagentPromptBuilder(this.options.projectRoot, {
      frameworkRoot: this.options.frameworkRoot,
    });
    this.contextManager = null;
    this.parallelExecutor = new ParallelExecutor();
    this.checklistRunner = new ChecklistRunner(this.options.projectRoot, {
      frameworkRoot: this.options.frameworkRoot,
    });

    // V3.1: Pre-flight detection and skill dispatch components
    this.techStackDetector = new TechStackDetector(this.options.projectRoot);
    this.skillDispatcher = new SkillDispatcher(this.options);
    this.conditionEvaluator = null; // Initialized after pre-flight detection
    this.techStackProfile = null; // Populated by pre-flight detection
    this.executionProfile = resolveExecutionProfile({
      explicitProfile: this.options.executionProfile,
      context: this.options.executionContext,
      yolo: this.options.yolo,
    });

    // Execution state
    this.executionState = {
      startTime: null,
      currentPhase: 0,
      completedPhases: [],
      completedPhaseIds: [],
      acceptedPhaseIds: [],
      failedPhases: [],
      skippedPhases: [],
      pendingPhases: [],
      errors: [],
    };
  }

  /**
   * Load and parse workflow definition
   * @returns {Promise<Object>} Parsed workflow
   */
  async loadWorkflow() {
    try {
      const content = await fs.readFile(this.workflowPath, 'utf8');
      this.workflow = normalizeWorkflowDocument(yaml.load(content));

      // Extract workflow metadata
      const workflowId = this.workflow.workflow?.id || path.basename(this.workflowPath, '.yaml');
      this.contextManager = new ContextManager(workflowId, this.options.projectRoot, {
        stateRoot: this.options.stateRoot,
      });

      return this.workflow;
    } catch (error) {
      if (error instanceof WorkflowNormalizationError) throw error;
      throw new Error(`Failed to load workflow: ${error.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                    DETERMINISTIC CODE SECTION
  //          All operations below do NOT depend on AI - pure JavaScript
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Setup all required directories before workflow execution
   * DETERMINISTIC: Creates folders via fs.ensureDir, no AI involved
   * @returns {Promise<string[]>} List of created directories
   */
  async setupDirectories() {
    const dirs = [
      'docs/architecture',
      'docs/frontend',
      'docs/prd',
      'docs/reviews',
      'docs/reports',
      'docs/stories',
      '.aexos/workflow-state',
    ];

    const created = [];
    for (const dir of dirs) {
      const fullPath = path.join(this.options.projectRoot, dir);
      await fs.ensureDir(fullPath);
      created.push(dir);
      this.logger.log(chalk.gray(`   📁 ${dir}`));
    }

    return created;
  }

  /**
   * Prepare phase execution - runs BEFORE subagent dispatch
   * DETERMINISTIC: All operations are code-based, not AI-dependent
   * @param {Object} phase - Phase configuration
   * @returns {Promise<Object>} Preparation result
   */
  async preparePhase(phase) {
    const results = { preActions: [], errors: [] };

    // 1. Create output directory if needed
    if (phase.creates) {
      const creates = Array.isArray(phase.creates) ? phase.creates : [phase.creates];
      for (const outputPath of creates) {
        if (typeof outputPath !== 'string' || path.isAbsolute(outputPath) || outputPath.split(/[\\/]/).includes('..')) {
          throw new Error(`Invalid output path: ${outputPath}`);
        }
        const dir = path.dirname(outputPath);
        const fullDir = path.join(this.options.projectRoot, dir);
        await fs.ensureDir(fullDir);
        results.preActions.push({ type: 'mkdir', path: dir, success: true });
      }
    }

    // 2. Execute preActions if defined
    if (phase.preActions) {
      for (const action of phase.preActions) {
        try {
          const actionResult = await this._executePreAction(action);
          results.preActions.push({ ...action, success: actionResult.success });
          if (!actionResult.success && action.blocking !== false) throw new Error(`Pre-action did not pass: ${action.type}`);
        } catch (error) {
          results.errors.push({ action, error: error.message });
          if (action.blocking !== false) {
            throw new Error(`Pre-action failed: ${action.type} - ${error.message}`);
          }
        }
      }
    }

    return results;
  }

  /**
   * Execute a single pre-action
   * DETERMINISTIC: Pure code operations
   * @private
   */
  async _executePreAction(action) {
    switch (action.type) {
      case 'mkdir':
        await fs.ensureDir(path.join(this.options.projectRoot, action.path));
        return { success: true };

      case 'check_tool':
        return { success: typeof this.options.checkTool === 'function' &&
          (await this.options.checkTool(action.tool)) === true, tool: action.tool };

      case 'check_env': {
        const missing = [];
        for (const varName of action.vars || []) {
          if (!process.env[varName]) {
            missing.push(varName);
          }
        }
        if (missing.length > 0 && action.blocking !== false) {
          throw new Error(`Missing environment variables: ${missing.join(', ')}`);
        }
        return { success: missing.length === 0, missing };
      }

      case 'file_exists': {
        const exists = await fs.pathExists(path.join(this.options.projectRoot, action.path));
        if (!exists && action.blocking !== false) {
          throw new Error(`Required file not found: ${action.path}`);
        }
        return { success: exists };
      }

      default:
        throw new Error(`Unknown pre-action type: ${action.type}`);
    }
  }

  /**
   * Validate phase output - runs AFTER subagent completes
   * DETERMINISTIC: File checks and checklist execution via code
   * @param {Object} phase - Phase configuration
   * @param {Object} result - Subagent execution result
   * @returns {Promise<Object>} Validation result
   */
  async validatePhaseOutput(phase, _result) {
    const validation = { passed: true, checks: [], errors: [] };

    // 1. Check if output files were created
    if (phase.creates) {
      const creates = Array.isArray(phase.creates) ? phase.creates : [phase.creates];
      for (const outputPath of creates) {
        const matches = await this.resolveOutputPaths(outputPath);
        const exists = matches.length > 0;
        validation.checks.push({
          type: 'file_exists',
          path: outputPath,
          passed: exists,
          files: await Promise.all(matches.map(async file => ({ path: file,
            sha256: require('crypto').createHash('sha256').update(await fs.readFile(path.join(this.options.projectRoot, file))).digest('hex') }))),
        });
        if (!exists) {
          validation.passed = false;
          validation.errors.push(`Output not created: ${outputPath}`);
        }
      }
    }

    // 2. Execute postActions if defined
    if (phase.postActions) {
      for (const action of phase.postActions) {
        try {
          const actionResult = await this._executePostAction(action);
          const isValidResult = actionResult
            && typeof actionResult === 'object'
            && !Array.isArray(actionResult)
            && typeof actionResult.success === 'boolean';
          const passed = isValidResult && actionResult.success === true;
          validation.checks.push({ ...action, passed });
          if (!passed) {
            validation.passed = false;
            validation.errors.push(
              isValidResult
                ? `Post-action failed: ${action.type}`
                : `Post-action returned invalid evidence: ${action.type}`,
            );
          }
        } catch (error) {
          validation.passed = false;
          validation.errors.push(`Post-action error: ${error.message}`);
        }
      }
    }

    // 3. Run the phase-local checklist. Shared mutable selection corrupts
    // concurrent phases and can certify one phase with another phase's gate.
    if (phase.checklist) {
      try {
        const checklistResult = await this.checklistRunner.run(
          phase.checklist,
          phase.creates,
        );
        const isValidChecklistResult = checklistResult
          && typeof checklistResult === 'object'
          && !Array.isArray(checklistResult)
          && typeof checklistResult.passed === 'boolean';
        validation.checks.push({
          type: 'checklist',
          checklist: phase.checklist,
          passed: isValidChecklistResult && checklistResult.passed === true,
          items: checklistResult?.items,
        });
        if (!isValidChecklistResult || checklistResult.passed !== true) {
          validation.passed = false;
          validation.errors.push(
            isValidChecklistResult
              ? `Checklist failed: ${phase.checklist}`
              : `Checklist returned invalid evidence: ${phase.checklist}`,
          );
        }
      } catch (error) {
        validation.passed = false;
        validation.errors.push(`Checklist error: ${error.message}`);
      }
    }

    return validation;
  }

  async resolveOutputPaths(pattern) {
    if (typeof pattern !== 'string' || !pattern.trim() || path.isAbsolute(pattern) ||
      pattern.split(/[\\/]/).includes('..')) throw new Error(`Invalid output path: ${pattern}`);
    const matches = await require('fast-glob')(pattern.replace(/\\/g, '/').replace(/X\.X/g, '*.*'), {
      cwd: this.options.projectRoot, onlyFiles: true, followSymbolicLinks: false, dot: true,
    });
    const root = path.resolve(this.options.projectRoot);
    for (const match of matches) {
      let cursor = root;
      for (const segment of match.split('/')) {
        cursor = path.join(cursor, segment);
        if ((await fs.lstat(cursor)).isSymbolicLink()) throw new Error(`Linked output path: ${match}`);
      }
      const stat = await fs.stat(cursor);
      if (!stat.isFile() || stat.size === 0) throw new Error(`Empty or invalid output: ${match}`);
    }
    return matches;
  }

  /**
   * Execute a single post-action
   * DETERMINISTIC: Pure code operations
   * @private
   */
  async _executePostAction(action) {
    switch (action.type) {
      case 'file_exists': {
        const exists = await fs.pathExists(path.join(this.options.projectRoot, action.path));
        return { success: exists };
      }

      case 'min_file_size': {
        const filePath = path.join(this.options.projectRoot, action.path);
        if (await fs.pathExists(filePath)) {
          const stats = await fs.stat(filePath);
          const sizeKb = stats.size / 1024;
          return { success: sizeKb >= (action.minKb || 1), sizeKb };
        }
        return { success: false, reason: 'file_not_found' };
      }

      case 'run_checklist': {
        const result = await this.checklistRunner.run(action.checklist, action.targetPath);
        return { success: result.passed, items: result.items };
      }

      default:
        throw new Error(`Unknown post-action type: ${action.type}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //                         WORKFLOW EXECUTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Execute the complete workflow
   * @returns {Promise<Object>} Execution result
   */
  async execute() {
    this.executionState.startTime = Date.now();

    // Load workflow if not already loaded
    if (!this.workflow) {
      await this.loadWorkflow();
    } else {
      this.workflow = normalizeWorkflowDocument(this.workflow);
    }

    const sequence = this.workflow.sequence;
    const orchestration = this.workflow.orchestration || {};
    const parallelPhases = orchestration.parallel_phases || [];
    const boundMode = this._preflightExecutionBindings(sequence);

    this.logger.log(chalk.blue(`\n🚀 Starting workflow: ${this.workflow.workflow?.name || 'Unknown'}`));
    this.logger.log(
      chalk.gray(
        `   Phases: ${sequence.length} | Mode: ${this.options.yolo ? 'YOLO' : 'Interactive'}`,
      ),
    );
    this.logger.log(chalk.gray(`   Parallel phases: ${parallelPhases.join(', ') || 'None'}`));

    // DETERMINISTIC: Setup directories via code before any AI operations
    if (!boundMode) {
      this.logger.log(chalk.blue('\n📁 Setting up directories...'));
      await this.setupDirectories();
      this.logger.log(chalk.green('   ✅ Directories ready\n'));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 0: PRE-FLIGHT DETECTION (V3.1)
    // DETERMINISTIC: Tech stack detection via file system checks
    // ═══════════════════════════════════════════════════════════════════════════
    this.logger.log(chalk.blue('🔍 Phase 0: Pre-Flight Detection...'));
    this.techStackProfile = await this.techStackDetector.detect();
    this.conditionEvaluator = new ConditionEvaluator(this.techStackProfile);
    // Bound executions keep their state and publications under the caller's
    // governed control root; only interactive/unbound runs scaffold projects.

    // Log detection results
    this.logger.log(
      chalk.gray(
        `   📊 Database: ${this.techStackProfile.hasDatabase ? '✓' : '✗'} ${this.techStackProfile.database.type ? `(${this.techStackProfile.database.type})` : ''}`,
      ),
    );
    this.logger.log(
      chalk.gray(
        `   🎨 Frontend: ${this.techStackProfile.hasFrontend ? '✓' : '✗'} ${this.techStackProfile.frontend.framework ? `(${this.techStackProfile.frontend.framework})` : ''}`,
      ),
    );
    this.logger.log(
      chalk.gray(
        `   🔧 Backend: ${this.techStackProfile.hasBackend ? '✓' : '✗'} ${this.techStackProfile.backend.type ? `(${this.techStackProfile.backend.type})` : ''}`,
      ),
    );
    this.logger.log(chalk.gray(`   📝 TypeScript: ${this.techStackProfile.hasTypeScript ? '✓' : '✗'}`));
    this.logger.log(
      chalk.gray(`   📋 Applicable phases: ${this.techStackProfile.applicablePhases.join(', ')}`),
    );
    this.logger.log(chalk.gray(`   🎯 Confidence: ${this.techStackProfile.confidence}%`));
    this.logger.log(chalk.green('   ✅ Pre-flight detection complete\n'));

    // Store tech stack profile in context for phases
    await this.contextManager.updateMetadata({
      techStackProfile: this.techStackProfile,
    });

    // Group phases by parallel execution
    let remainingSequence = sequence;
    if (this.options.fromPhase != null) {
      const outputs = this.contextManager?.getPreviousPhaseOutputs?.() || {};
      remainingSequence = [];
      for (const phase of sequence.filter(item => !item.workflow_end)) {
        const prior = outputs[phase.phase];
        if (prior?.status === 'skipped' && phase.condition && !this.conditionEvaluator.evaluate(phase.condition)) {
          this.executionState.skippedPhases.push(phase.phase);
        } else {
          const actual = prior?.steps ? prior.steps[phase.step || phase.action || String(phase.phase)]
            : sequence.filter(item => item.phase === phase.phase).length === 1 ? prior : null;
          const current = actual?.validation?.passed ? await this.validatePhaseOutput({ ...phase,
            postActions: undefined, checklist: undefined }, actual.result) : null;
          const beforeFiles = actual?.validation?.checks.filter(check => check.type === 'file_exists') || [];
          const valid = current?.passed && JSON.stringify(beforeFiles) === JSON.stringify(current.checks);
          if (valid) this.executionState.completedPhases.push(phase.phase);
          else if (phase.phase < this.options.fromPhase) throw new Error(`Cannot resume: phase ${phase.phase} lacks valid output`);
          else remainingSequence.push(phase);
        }
      }
    }
    const phaseGroups = this._groupPhases(remainingSequence, parallelPhases);

    // Execute each group
    for (const group of phaseGroups) {
      if (group.parallel && this.options.parallel) {
        await this._executeParallelPhases(group.phases);
      } else {
        for (const phase of group.phases) {
          await this._executeSinglePhase(phase);
          if (this.executionState.pendingPhases.length) break;
        }
      }
      if (this.executionState.failedPhases.length || this.executionState.pendingPhases.length) break;
    }

    await this._assertExecutedWork();

    // Generate execution summary + confidence gate
    const summary = this._generateExecutionSummary();
    if (summary.status === 'failed_confidence_gate') {
      await this.contextManager.markFailed(
        `Delivery confidence ${summary.deliveryConfidence.score}% below threshold ${summary.confidenceGate.threshold}%`,
        this.executionState.currentPhase,
      );
    }
    if (summary.success) await this.contextManager.markCompleted();
    else if (summary.status === 'failed') await this.contextManager.markFailed(
      this.executionState.errors.map(item => item.error).join('; '), this.executionState.currentPhase);
    return summary;
  }

  /**
   * Group phases by parallel execution capability
   * @private
   */
  _groupPhases(sequence, parallelPhases) {
    const groups = [];
    let currentGroup = { parallel: false, phases: [] };

    for (const phase of sequence) {
      // Skip workflow_end marker
      if (phase.workflow_end) continue;

      const phaseNum = phase.phase;
      const isParallel = parallelPhases.includes(phaseNum);

      if (isParallel !== currentGroup.parallel && currentGroup.phases.length > 0) {
        groups.push(currentGroup);
        currentGroup = { parallel: isParallel, phases: [] };
      }

      currentGroup.parallel = isParallel;
      currentGroup.phases.push(phase);
    }

    if (currentGroup.phases.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  /**
   * Validate every strict execution binding before setup or context writes.
   * @private
   */
  _preflightExecutionBindings(sequence) {
    const strictPhases = sequence.filter((phase) => phase.requireAcceptance === true);
    this.validatedExecutionBindings = new Map();
    if (this.executionBindings === null) {
      if (strictPhases.length > 0) {
        throw this._createPhaseError(
          'WORKFLOW_EXECUTION_BINDINGS_REQUIRED',
          'Strict workflow phases require validated execution bindings.',
        );
      }
      return false;
    }
    if (
      !this.executionBindings
      || typeof this.executionBindings !== 'object'
      || Array.isArray(this.executionBindings)
    ) {
      throw this._createPhaseError(
        'WORKFLOW_EXECUTION_BINDINGS_REQUIRED',
        'Strict workflow phases require validated execution bindings.',
      );
    }

    const strictIds = new Set(strictPhases.map((phase) => phase.id));
    const unknownBinding = Object.keys(this.executionBindings)
      .find((phaseId) => !strictIds.has(phaseId));
    if (unknownBinding) {
      throw this._createPhaseError(
        'WORKFLOW_EXECUTION_BINDING_UNKNOWN',
        `Execution binding does not match a strict phase: ${unknownBinding}`,
      );
    }

    for (const phase of strictPhases) {
      const unsupportedSideEffect = ['creates', 'preActions', 'postActions']
        .find((field) => phase[field] !== undefined);
      if (unsupportedSideEffect) {
        throw this._createPhaseError(
          'WORKFLOW_BOUND_PHASE_SIDE_EFFECT_UNSUPPORTED',
          `Bound phase ${phase.id} cannot declare legacy ${unsupportedSideEffect} effects.`,
        );
      }
      const binding = this.executionBindings[phase.id];
      if (!binding) {
        throw this._createPhaseError(
          'WORKFLOW_EXECUTION_BINDING_REQUIRED',
          `Missing execution binding for phase ${phase.id}.`,
        );
      }
    }
    if (
      typeof this.options.workflowBudgetScope !== 'string'
      || this.options.workflowBudgetScope.length === 0
      || !Number.isFinite(this.options.workflowBudgetCeilingUsd)
      || this.options.workflowBudgetCeilingUsd <= 0
    ) {
      throw this._createPhaseError(
        'WORKFLOW_BINDING_BUDGET_REQUIRED',
        'Bound execution requires one trusted workflow budget scope and positive ceiling.',
      );
    }
    for (const phase of strictPhases) {
      const binding = this.executionBindings[phase.id];
      if (
        binding.budgetScope !== this.options.workflowBudgetScope
        || binding.budgetCeilingUsd !== this.options.workflowBudgetCeilingUsd
      ) {
        throw this._createPhaseError(
          'WORKFLOW_BINDING_BUDGET_MISMATCH',
          `Execution binding budget differs from the workflow budget for phase ${phase.id}.`,
        );
      }
    }
    for (const phase of strictPhases) {
      const binding = this.executionBindings[phase.id];
      this.validatedExecutionBindings.set(phase.id, assertExecutionBinding(binding, {
        phase,
        projectRoot: this.options.projectRoot,
        frameworkRoot: this.options.frameworkRoot,
      }));
    }
    return true;
  }

  /**
   * Execute multiple phases in parallel
   * @private
   */
  async _executeParallelPhases(phases) {
    this.logger.log(chalk.yellow(`\n⚡ Executing ${phases.length} phases in parallel...`));

    const phasePromises = phases.map((phase) => this._executeSinglePhase(phase));
    const results = await Promise.allSettled(phasePromises);

    // Process results
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.log(chalk.red(`   Phase ${phases[index].phase} failed: ${result.reason}`));
      }
    });

    const failure = results.find((result) => result.status === 'rejected');
    if (failure) {
      throw failure.reason;
    }

    return results;
  }

  /**
   * Resolve explicit or task-file acceptance contracts before provider dispatch.
   * Contracted tasks are certified; legacy uncontracted guidance remains usable
   * but cannot be represented as accepted execution.
   * @private
   */
  _resolvePhaseAcceptance(phase) {
    if (phase.contract !== undefined) {
      return {
        contract: normalizeTaskContract(phase.contract, this.options.projectRoot),
        requireAcceptance: true,
        certification: 'accepted',
      };
    }

    if (!phase.task) {
      if (phase.requireAcceptance === true) {
        throw this._createPhaseError(
          'WORKFLOW_TASK_CONTRACT_REQUIRED',
          'Required acceptance needs a selected task contract.',
        );
      }
      return { contract: null, requireAcceptance: false, certification: 'non-certified' };
    }

    const taskFile = phase.task.endsWith('.md') ? phase.task : `${phase.task}.md`;
    const taskRoot = path.resolve(
      this.options.frameworkRoot,
      '.aexos-core',
      'development',
      'tasks',
    );
    const taskPath = path.resolve(taskRoot, taskFile);
    const relative = path.relative(taskRoot, taskPath);
    const isInsideTaskRoot = relative && !relative.startsWith('..') && !path.isAbsolute(relative);

    if (!isInsideTaskRoot || !fs.existsSync(taskPath)) {
      if (phase.requireAcceptance === true) {
        throw this._createPhaseError(
          'WORKFLOW_TASK_CONTRACT_REQUIRED',
          `Required task contract was not found: ${phase.task}`,
        );
      }
      return { contract: null, requireAcceptance: false, certification: 'non-certified' };
    }

    const selected = loadTaskContract(taskPath, {
      enforcement: phase.requireAcceptance === true ? 'strict' : 'warn',
      projectRoot: this.options.projectRoot,
    });
    if (selected.status === 'invalid') {
      throw this._createPhaseError(
        'WORKFLOW_TASK_CONTRACT_INVALID',
        `Selected task contract is invalid: ${phase.task}`,
      );
    }
    if (selected.status !== 'contracted') {
      if (phase.requireAcceptance === true) {
        throw this._createPhaseError(
          'WORKFLOW_TASK_CONTRACT_REQUIRED',
          `Required task contract is missing: ${phase.task}`,
        );
      }
      return { contract: null, requireAcceptance: false, certification: 'non-certified' };
    }

    return {
      contract: selected.contract,
      requireAcceptance: true,
      certification: 'accepted',
    };
  }

  /**
   * Create a stable coded workflow failure for callers and persisted state.
   * @private
   */
  _createPhaseError(code, message, details = {}) {
    const error = new Error(message);
    error.name = 'WorkflowPhaseError';
    error.code = code;
    error.details = details;
    return error;
  }

  /**
   * Execute a single phase
   * @private
   */
  async _executeSinglePhase(phase) {
    const phaseNum = phase.phase;
    const phaseName = phase.phase_name || `Phase ${phaseNum}`;

    if (this.conditionEvaluator) {
      this.conditionEvaluator.setPhaseOutputs(this.contextManager?.getPreviousPhaseOutputs?.() || {});
      this.conditionEvaluator.setQAApproval(this._qaReviewApproved());
    }

    // V3.1: Check conditions using ConditionEvaluator with skip reason
    if (phase.condition) {
      const conditionResult = this.conditionEvaluator
        ? this.conditionEvaluator.shouldExecutePhase(phase)
        : {
          shouldExecute: this._evaluateConditionLegacy(phase.condition),
          reason: 'legacy_evaluation',
        };

      if (!conditionResult.shouldExecute) {
        const skipReason = conditionResult.reason;
        const explanation = this.conditionEvaluator
          ? this.conditionEvaluator.getSkipExplanation(phase)
          : 'Condition not met';

        this.logger.log(chalk.gray(`   ⏭️  Skipping ${phaseName}: ${explanation}`));
        this.executionState.skippedPhases.push(phaseNum);

        // V3.1: Save skip result to context with reason
        const skipResult = this.skillDispatcher.createSkipResult(phase, skipReason);
        await this.contextManager.savePhaseOutput(phaseNum, skipResult, {
          handoffTarget: this._getNextPhaseHandoffTarget(phaseNum),
        });

        return { skipped: true, phase: phaseNum, reason: skipReason };
      }
    }

    if (Object.prototype.hasOwnProperty.call(phase, 'requires')) {
      const error = this._createPhaseError(
        'WORKFLOW_REQUIRES_AMBIGUOUS',
        `${phaseName} uses ambiguous legacy requires; use dependsOn or requiresFiles.`,
      );
      this.executionState.currentPhase = phaseNum;
      if (!this.executionState.failedPhases.includes(phaseNum)) {
        this.executionState.failedPhases.push(phaseNum);
      }
      await this.contextManager?.markFailed?.(error.message, phaseNum);
      throw error;
    }

    if (phase.dependsOn?.length) {
      const evidence = phase.requireAcceptance === true
        ? this.executionState.acceptedPhaseIds
        : this.executionState.completedPhaseIds;
      const missingDeps = phase.dependsOn.filter((dependency) => !evidence.includes(dependency));
      if (missingDeps.length > 0) {
        const code = phase.requireAcceptance === true
          ? 'WORKFLOW_PHASE_ACCEPTED_DEPENDENCY_MISSING'
          : 'WORKFLOW_PHASE_DEPENDENCY_MISSING';
        const error = this._createPhaseError(
          code,
          `${phaseName} is missing required dependencies: ${missingDeps.join(', ')}`,
          { missingDependencies: missingDeps },
        );
        this.executionState.currentPhase = phaseNum;
        if (!this.executionState.failedPhases.includes(phaseNum)) {
          this.executionState.failedPhases.push(phaseNum);
        }
        await this.contextManager?.markFailed?.(error.message, phaseNum);
        throw error;
      }
    }

    if (phase.requiresFiles?.length) {
      const missingFiles = await this._checkFilePrerequisites(phase.requiresFiles);
      if (missingFiles.length > 0) {
        const error = this._createPhaseError(
          'WORKFLOW_PHASE_FILE_PREREQUISITE_MISSING',
          `${phaseName} is missing required files: ${missingFiles.join(', ')}`,
          { missingFiles },
        );
        this.executionState.currentPhase = phaseNum;
        if (!this.executionState.failedPhases.includes(phaseNum)) {
          this.executionState.failedPhases.push(phaseNum);
        }
        await this.contextManager?.markFailed?.(error.message, phaseNum);
        throw error;
      }
    }

    // Notify phase start
    await this.options.onPhaseStart(phase);
    this.executionState.currentPhase = phaseNum;

    try {
      // DETERMINISTIC: Prepare phase (create dirs, check pre-conditions)
      this.logger.log(chalk.gray('   🔧 Preparing phase...'));
      await this.preparePhase(phase);

      const acceptance = this._resolvePhaseAcceptance(phase);
      const preflightBinding = this.validatedExecutionBindings.get(phase.id);
      const binding = preflightBinding
        ? assertExecutionBinding(preflightBinding, {
          phase,
          projectRoot: this.options.projectRoot,
          frameworkRoot: this.options.frameworkRoot,
        })
        : null;

      // Bound deterministic execution selects by phaseId and contract identity;
      // legacy guidance continues to receive its full framework prompt.
      const context = await this.contextManager.getContextForPhase(phaseNum);
      const prompt = binding
        ? `Execute selected SDLC task ${binding.task} for phase ${phase.id} with bound contract ${binding.resolvedContractHash}.`
        : await this.promptBuilder.buildPrompt(
          phase.agent,
          phase.task || phase.action,
          {
            ...context,
            phase,
            strictDefinitions: true,
            yoloMode: this.options.yolo,
            elicit: phase.elicit,
            creates: phase.creates,
            notes: phase.notes,
            checklist: phase.checklist,
            template: phase.template,
            executionProfile: this.executionProfile.profile,
            executionPolicy: this.executionProfile.policy,
          },
        );

      // V3.1: Build dispatch payload using SkillDispatcher
      const dispatchPayload = this.skillDispatcher.buildDispatchPayload({
        agentId: phase.agent,
        prompt,
        phase,
        context: {
          ...context,
          workflowId: this.workflow.workflow?.id,
          yoloMode: this.options.yolo,
          executionProfile: this.executionProfile.profile,
          executionPolicy: this.executionProfile.policy,
          previousPhases: this.executionState.completedPhases,
        },
        techStackProfile: this.techStackProfile,
      });

      // Log dispatch info
      this.logger.log(
        chalk.gray(
          `   🚀 ${this.skillDispatcher.formatDispatchLog(dispatchPayload).split('\n')[0]}`,
        ),
      );

      this.logger.log(
        chalk.gray(
          `   🛡️  Execution profile: ${this.executionProfile.profile} (${this.executionProfile.context})`,
        ),
      );

      // AEX-1.2: execution is impossible without an explicit runtime. The
      // deprecated callback is wrapped as a runtime during construction, so
      // there is no manual/pending path that can be mistaken for execution.
      const runtime = assertRuntime(this.runtime);
      const legacyPayload = {
        ...dispatchPayload,
        agentId: phase.agent,
        prompt,
        phase,
        context: dispatchPayload.context,
        baseContext: context,
      };
      const runtimeRequest = binding
        ? {
          phaseId: binding.phaseId,
          story: binding.story,
          contract: binding.contract,
          agentId: binding.agentId,
          task: binding.task,
          projectRoot: binding.projectRoot,
          requiredCapabilities: binding.requiredCapabilities,
          ...(binding.approvedFilesystemOperations === undefined
            ? {}
            : { approvedFilesystemOperations: binding.approvedFilesystemOperations }),
          budgetScope: binding.budgetScope,
          budgetCeilingUsd: binding.budgetCeilingUsd,
          estimatedCostUsd: binding.estimatedCostUsd,
          requireAcceptance: true,
          requiresStory: true,
          prompt,
        }
        : {
          agentId: phase.agent,
          task: phase.task || phase.action || 'workflow-phase',
          prompt,
          story: phase.story || context.storyPath || context.story || null,
          budgetCeilingUsd: this.options.budgetCeilingUsd,
          projectRoot: this.options.projectRoot,
          requiresStory: phase.requiresStory,
          contract: acceptance.contract || undefined,
          requireAcceptance: acceptance.requireAcceptance,
          legacyPayload,
        };
      let result = await runtime.execute(runtimeRequest);

      if (runtime.deprecated) {
        result = this.skillDispatcher.parseSkillOutput(result, phase);
      }

      if (!result || result.success !== true || result.status !== 'success') {
        throw this._createPhaseError(
          'WORKFLOW_PHASE_EXECUTION_FAILED',
          `Phase ${phaseNum} did not return a strict successful result.`,
          { result },
        );
      }
      if (
        acceptance.requireAcceptance
        && result.acceptance?.verdict !== 'ACCEPTED'
      ) {
        throw this._createPhaseError(
          'WORKFLOW_PHASE_ACCEPTANCE_FAILED',
          `Phase ${phaseNum} did not produce required acceptance evidence.`,
        );
      }

      if (['pending_dispatch', 'waiting_for_input', 'blocked'].includes(result.status)) {
        this.executionState.pendingPhases.push(phaseNum);
        await this.savePendingPhase(phase, result);
        return result;
      }
      if (!['success', 'completed', 'APPROVED'].includes(result.status) || result.success === false || result.simulated) {
        throw new Error(result.error || `Phase did not complete: ${result.status}`);
      }

      // DETERMINISTIC: Validate phase output (check files, run checklists)
      this.logger.log(chalk.gray('   🔍 Validating output...'));
      const validation = await this.validatePhaseOutput(phase, result);
      if (
        !validation
        || typeof validation !== 'object'
        || Array.isArray(validation)
        || validation.passed !== true
      ) {
        const validationErrors = Array.isArray(validation?.errors)
          ? validation.errors
          : ['Validation did not return exact passed: true evidence'];
        throw this._createPhaseError(
          'WORKFLOW_PHASE_VALIDATION_FAILED',
          `Phase ${phaseNum} validation failed: ${validationErrors.join(', ')}`,
          { validation },
        );
      }

      const certification = acceptance.certification;

      // Save phase output to context
      const previous = (this.contextManager?.getPreviousPhaseOutputs?.() || {})[phaseNum];
      const stepResult = {
        agent: phase.agent,
        action: phase.action,
        task: phase.task,
        result,
        validation,
        certification,
        ...(binding ? { executionIdentity: this._createExecutionIdentity(phase, binding) } : {}),
        timestamp: new Date().toISOString(),
      };
      await this.contextManager.savePhaseOutput(phaseNum, { ...stepResult,
        steps: { ...previous?.steps, [phase.step || phase.action || String(phaseNum)]: stepResult },
      }, {
        handoffTarget: this._getNextPhaseHandoffTarget(phaseNum),
      });

      // Notify phase complete
      await this.options.onPhaseComplete(phase, result);
      this.executionState.completedPhases.push(phaseNum);
      this.executionState.completedPhaseIds.push(phase.id);
      if (certification === 'accepted') {
        this.executionState.acceptedPhaseIds.push(phase.id);
      }

      return { ...result, validation, certification };
    } catch (error) {
      this.logger.log(chalk.red(`   ❌ ${phaseName} failed: ${error.message}`));
      if (!this.executionState.failedPhases.includes(phaseNum)) {
        this.executionState.failedPhases.push(phaseNum);
      }
      await this.contextManager?.markFailed?.(error.message, phaseNum);
      throw error;
    }
  }

  async savePendingPhase(phase, result) {
    const previous = (this.contextManager?.getPreviousPhaseOutputs?.() || {})[phase.phase];
    const pending = { agent: phase.agent, action: phase.action, task: phase.task, result,
      validation: { passed: false, checks: [], errors: ['Execution pending'] }, timestamp: new Date().toISOString() };
    await this.contextManager.savePhaseOutput(phase.phase, { ...pending,
      steps: { ...previous?.steps, [phase.step || phase.action || String(phase.phase)]: pending },
    });
  }

  /**
   * Evaluate a condition based on context
   * V3.1: Uses ConditionEvaluator with TechStackProfile when available
   * @private
   */
  _evaluateCondition(condition) {
    // V3.1: Use ConditionEvaluator if available (after pre-flight detection)
    if (this.conditionEvaluator) {
      return this.conditionEvaluator.evaluate(condition);
    }

    // Fallback to legacy evaluation
    return this._evaluateConditionLegacy(condition);
  }

  /**
   * Determine next phase handoff target from workflow sequence.
   * @private
   */
  _getNextPhaseHandoffTarget(currentPhaseNum) {
    const sequence = Array.isArray(this.workflow?.sequence) ? this.workflow.sequence : [];
    const currentIndex = sequence.findIndex((p) => p && p.phase === currentPhaseNum);
    if (currentIndex < 0) {
      return { phase: null, agent: null };
    }

    for (let i = currentIndex + 1; i < sequence.length; i += 1) {
      const next = sequence[i];
      if (!next || next.workflow_end || !next.phase) {
        continue;
      }
      return {
        phase: next.phase,
        agent: next.agent || null,
      };
    }

    return { phase: null, agent: null };
  }

  /**
   * Legacy condition evaluation (backward compatibility)
   * @private
   */
  _evaluateConditionLegacy(condition) {
    // Handle string conditions
    if (typeof condition === 'string') {
      switch (condition) {
        case 'project_has_database':
          return this._projectHasDatabase();
        case 'qa_review_approved':
          return this._qaReviewApproved();
        default:
          return true;
      }
    }

    // Handle object conditions
    if (typeof condition === 'object') {
      const { field, operator, value } = condition;
      const fieldValue = this.contextManager?.getPreviousPhaseOutputs()?.[field];

      switch (operator) {
        case 'equals':
          return fieldValue === value;
        case 'exists':
          return fieldValue !== undefined;
        default:
          return true;
      }
    }

    return true;
  }

  /**
   * Check if project has database configuration
   * @private
   */
  _projectHasDatabase() {
    const supabasePath = path.join(this.options.projectRoot, 'supabase');
    const envPath = path.join(this.options.projectRoot, '.env');

    return (
      fs.existsSync(supabasePath) ||
      (fs.existsSync(envPath) && fs.readFileSync(envPath, 'utf8').includes('SUPABASE'))
    );
  }

  /**
   * Check if QA review was approved
   * @private
   */
  _qaReviewApproved() {
    const qaReview = this.contextManager?.getPreviousPhaseOutputs()?.['7'];
    return qaReview?.validation?.passed === true && (qaReview?.result?.status === 'APPROVED' ||
      qaReview?.result?.verdict === 'APPROVED' || qaReview?.result?.review_result?.verdict === 'APPROVED');
  }

  /**
   * Check dependencies (required files)
   * @private
   */
  async _checkFilePrerequisites(requiresFiles) {
    const missing = [];
    const deps = Array.isArray(requiresFiles) ? requiresFiles : [requiresFiles];
    const projectRoot = path.resolve(this.options.projectRoot);

    for (const dep of deps) {
      const depPath = path.resolve(projectRoot, dep);
      const relative = path.relative(projectRoot, depPath);
      const isInside = relative.length > 0
        && !relative.startsWith('..')
        && !path.isAbsolute(relative);
      if (!isInside || !(await fs.pathExists(depPath))) {
        missing.push(dep);
      }
    }

    return missing;
  }

  /**
   * Hash only normalized executable workflow identity. Runtime values and
   * persisted status strings are deliberately excluded.
   * @private
   */
  _workflowIdentityHash() {
    const identity = {
      workflowId: this.workflow.workflow?.id
        || path.basename(this.workflowPath, path.extname(this.workflowPath)),
      sequence: this.workflow.sequence.map((phase) => ({
        id: phase.id,
        phase: phase.phase,
        agent: phase.agent,
        task: phase.task,
        dependsOn: phase.dependsOn,
        requiresFiles: phase.requiresFiles,
        requireAcceptance: phase.requireAcceptance === true,
      })),
    };
    return sha256(JSON.stringify(stable(identity)));
  }

  /**
   * Produce a non-secret execution identity for durable resume validation.
   * Capability leases and approved operation content are never persisted.
   * @private
   */
  _createExecutionIdentity(phase, binding) {
    const storyPath = path.resolve(this.options.projectRoot, binding.story);
    const storyHash = sha256(fs.readFileSync(storyPath));
    const bindingIdentity = {
      phaseId: binding.phaseId,
      task: binding.task,
      agentId: binding.agentId,
      projectRoot: binding.projectRoot,
      story: binding.story,
      storyHash,
      taskContractHash: binding.taskContractHash,
      resolvedContractHash: binding.resolvedContractHash,
      budgetScope: binding.budgetScope,
      budgetCeilingUsd: binding.budgetCeilingUsd,
    };
    return {
      workflowId: this.workflow.workflow?.id
        || path.basename(this.workflowPath, path.extname(this.workflowPath)),
      workflowHash: this._workflowIdentityHash(),
      phaseId: phase.id,
      phaseNumber: phase.phase,
      task: phase.task,
      agentId: phase.agent,
      story: binding.story,
      storyHash,
      taskContractHash: binding.taskContractHash,
      resolvedContractHash: binding.resolvedContractHash,
      budgetScope: binding.budgetScope,
      budgetCeilingUsd: binding.budgetCeilingUsd,
      bindingHash: sha256(JSON.stringify(stable(bindingIdentity))),
    };
  }

  /**
   * A successful return must represent at least one dispatched and accepted
   * phase in this invocation.
   * @private
   */
  async _assertExecutedWork(completedBefore = 0) {
    if (this.executionState.completedPhases.length > completedBefore) return;
    const error = this._createPhaseError(
      'WORKFLOW_ZERO_DISPATCH',
      'Workflow invocation completed without dispatching a successful phase.',
    );
    await this.contextManager?.markFailed?.(error.message, this.executionState.currentPhase);
    throw error;
  }

  /**
   * Restore predecessor evidence from persisted phase outputs for resume.
   * @private
   */
  async _restoreDependencyEvidence(fromPhase) {
    if (!this.contextManager || typeof this.contextManager.loadState !== 'function') {
      throw this._createPhaseError(
        'WORKFLOW_RESUME_EVIDENCE_REQUIRED',
        'Resume requires a trusted persisted workflow state.',
      );
    }
    const state = await this.contextManager.loadState();
    if (state?.status === 'failed') {
      throw this._createPhaseError(
        'WORKFLOW_RESUME_FAILED_STATE',
        'A failed workflow state is terminal and cannot be resumed as successful execution.',
      );
    }
    const workflowId = this.workflow.workflow?.id
      || path.basename(this.workflowPath, path.extname(this.workflowPath));
    if (!state || state.workflowId !== workflowId || !state.phases || typeof state.phases !== 'object') {
      throw this._createPhaseError(
        'WORKFLOW_RESUME_EVIDENCE_INVALID',
        'Persisted state does not match the normalized workflow identity.',
      );
    }
    const persistedPhases = state.phases;
    for (const phase of this.workflow.sequence) {
      if (phase.phase >= fromPhase) continue;
      const persisted = persistedPhases[phase.phase];
      if (!persisted || typeof persisted !== 'object' || Array.isArray(persisted)) {
        throw this._createPhaseError(
          'WORKFLOW_RESUME_EVIDENCE_REQUIRED',
          `Resume requires accepted predecessor evidence for phase ${phase.id}.`,
        );
      }
      const validPersistedShape = persisted.agent === phase.agent
        && persisted.task === phase.task
        && persisted.certification === 'accepted'
        && persisted.result?.success === true
        && persisted.result?.status === 'success'
        && persisted.result?.acceptance?.verdict === 'ACCEPTED'
        && persisted.validation?.passed === true;
      if (!validPersistedShape) {
        throw this._createPhaseError(
          'WORKFLOW_RESUME_EVIDENCE_INVALID',
          `Persisted predecessor evidence is stale or malformed for phase ${phase.id}.`,
        );
      }
      const binding = this.validatedExecutionBindings.get(phase.id);
      if (!binding) {
        throw this._createPhaseError(
          'WORKFLOW_RESUME_BINDING_REQUIRED',
          `Resume cannot establish a current validated binding for phase ${phase.id}.`,
        );
      }
      const expectedIdentity = this._createExecutionIdentity(phase, binding);
      const validIdentity = JSON.stringify(stable(persisted.executionIdentity))
        === JSON.stringify(stable(expectedIdentity));
      if (
        !validIdentity
        || persisted.result.acceptance.contractHash !== binding.resolvedContractHash
      ) {
        throw this._createPhaseError(
          'WORKFLOW_RESUME_EVIDENCE_INVALID',
          `Persisted predecessor identity is stale or malformed for phase ${phase.id}.`,
        );
      }
      let acceptance;
      try {
        acceptance = await verifyTaskOutcome({
          contract: binding.contract,
          success: true,
          produced: persisted.result.produced,
        }, {
          projectRoot: this.options.projectRoot,
          verifiers: this.runtime?.outcomeVerifiers || {},
        });
      } catch (cause) {
        throw this._createPhaseError(
          'WORKFLOW_RESUME_REVERIFICATION_FAILED',
          `Current artifacts failed trusted revalidation for phase ${phase.id}: ${cause.message}`,
          { causeCode: cause.code },
        );
      }
      if (
        acceptance?.verdict !== 'ACCEPTED'
        || acceptance.contractHash !== binding.resolvedContractHash
      ) {
        throw this._createPhaseError(
          'WORKFLOW_RESUME_REVERIFICATION_FAILED',
          `Current artifacts did not reproduce accepted evidence for phase ${phase.id}.`,
        );
      }
      if (!this.executionState.completedPhaseIds.includes(phase.id)) {
        this.executionState.completedPhaseIds.push(phase.id);
      }
      if (!this.executionState.acceptedPhaseIds.includes(phase.id)) {
        this.executionState.acceptedPhaseIds.push(phase.id);
      }
    }
  }

  /**
   * Generate execution summary
   * @private
   */
  _generateExecutionSummary() {
    const duration = Date.now() - this.executionState.startTime;
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);

    const deliveryConfidence = this.contextManager?.getDeliveryConfidence?.() || null;
    const summary = {
      workflow: this.workflow.workflow?.id,
      status: this.executionState.failedPhases.length > 0
        ? 'completed_with_errors'
        : this.executionState.completedPhases.length > 0 ? 'completed' : 'failed_no_execution',
      duration: `${minutes}m ${seconds}s`,
      phases: {
        total: this.workflow.sequence?.length || 0,
        completed: this.executionState.completedPhases.length,
        failed: this.executionState.failedPhases.length,
        skipped: this.executionState.skippedPhases.length,
      },
      completedPhases: this.executionState.completedPhases,
      failedPhases: this.executionState.failedPhases,
      skippedPhases: this.executionState.skippedPhases,
      outputs: this.contextManager?.getPreviousPhaseOutputs() || {},
      deliveryConfidence,
      errors: this.executionState.errors || [],
    };
    summary.phases.total = (this.workflow.sequence || []).filter(phase => !phase.workflow_end).length;
    summary.pendingPhases = this.executionState.pendingPhases || [];
    if (summary.pendingPhases.length) summary.status = 'waiting_for_input';
    else if (!summary.phases.total || summary.phases.completed + summary.phases.skipped !== summary.phases.total) {
      summary.status = summary.phases.failed ? 'failed' : 'incomplete';
    }

    const confidenceGate = this._evaluateConfidenceGate(deliveryConfidence);
    if (confidenceGate.enabled) {
      summary.confidenceGate = confidenceGate;
      if (!confidenceGate.passed && summary.status === 'completed') {
        summary.status = 'failed_confidence_gate';
      }
    }

    summary.success = summary.status === 'completed';
    return summary;
  }

  /**
   * Resolve confidence threshold from explicit option > env > default.
   * @private
   */
  _resolveConfidenceThreshold(explicitThreshold) {
    const explicit = Number(explicitThreshold);
    if (Number.isFinite(explicit)) {
      return explicit;
    }
    const envThreshold = Number(process.env.AEXOS_DELIVERY_CONFIDENCE_THRESHOLD);
    return Number.isFinite(envThreshold) ? envThreshold : 70;
  }

  /**
   * Evaluate delivery confidence gate.
   * @private
   */
  _evaluateConfidenceGate(deliveryConfidence) {
    if (!this.options.enableConfidenceGate) {
      return { enabled: false, threshold: this.options.confidenceThreshold, passed: true };
    }

    if (!deliveryConfidence || !Number.isFinite(deliveryConfidence.score)) {
      return {
        enabled: true,
        threshold: this.options.confidenceThreshold,
        passed: false,
        reason: 'delivery_confidence_unavailable',
      };
    }

    const passed = deliveryConfidence.score >= this.options.confidenceThreshold;
    return {
      enabled: true,
      threshold: this.options.confidenceThreshold,
      score: deliveryConfidence.score,
      passed,
    };
  }

  /**
   * Default phase start callback
   * @private
   */
  _defaultPhaseStart(phase) {
    const icon = this._getAgentIcon(phase.agent);
    this.logger.log(chalk.cyan(`\n${icon} Phase ${phase.phase}: ${phase.phase_name}`));
    this.logger.log(chalk.gray(`   Agent: @${phase.agent} | Action: *${phase.action}`));
  }

  /**
   * Default phase complete callback
   * @private
   */
  _defaultPhaseComplete(phase, result) {
    const status =
      result?.status === 'success' ? '✅' : result?.status === 'pending_dispatch' ? '📤' : '⚠️';
    this.logger.log(chalk.green(`   ${status} Phase ${phase.phase} complete`));
    if (phase.creates) {
      const creates = Array.isArray(phase.creates) ? phase.creates : [phase.creates];
      creates.forEach((c) => this.logger.log(chalk.gray(`      → ${c}`)));
    }
  }

  /**
   * Get agent icon for display
   * @private
   */
  _getAgentIcon(agentId) {
    const icons = {
      architect: '🏗️',
      'data-engineer': '🗄️',
      'ux-expert': '🎨',
      'ux-design-expert': '🎨',
      qa: '🔍',
      analyst: '📊',
      pm: '📋',
      dev: '💻',
      sm: '🔄',
      po: '⚖️',
      devops: '🚀',
      'github-devops': '🚀',
    };
    return icons[agentId] || '👤';
  }

  /**
   * Get current execution state
   */
  getState() {
    return { ...this.executionState };
  }

  /**
   * Resume workflow from a specific phase
   * @param {number} fromPhase - Phase number to resume from
   */
  async resumeFrom(fromPhase) {
    if (!this.workflow) {
      await this.loadWorkflow();
    } else {
      this.workflow = normalizeWorkflowDocument(this.workflow);
    }

    const sequence = this.workflow.sequence;
    if (!Number.isInteger(fromPhase) || !sequence.some((phase) => phase.phase === fromPhase)) {
      throw this._createPhaseError(
        'WORKFLOW_RESUME_CURSOR_INVALID',
        'Resume cursor must identify an actual normalized remaining phase.',
        { fromPhase },
      );
    }
    this._preflightExecutionBindings(sequence);
    await this._restoreDependencyEvidence(fromPhase);
    const remainingPhases = sequence.filter((p) => p.phase >= fromPhase && !p.workflow_end);
    const completedBefore = this.executionState.completedPhases.length;
    if (!this.executionState.startTime) this.executionState.startTime = Date.now();

    this.logger.log(chalk.yellow(`\n🔄 Resuming from phase ${fromPhase}...`));

    for (const phase of remainingPhases) {
      await this._executeSinglePhase(phase);
    }

    await this._assertExecutedWork(completedBefore);

    return this._generateExecutionSummary();
  }
}

module.exports = WorkflowOrchestrator;
