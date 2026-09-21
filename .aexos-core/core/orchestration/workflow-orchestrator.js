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
const yaml = require('js-yaml');
const chalk = require('chalk');

const SubagentPromptBuilder = require('./subagent-prompt-builder');
const ContextManager = require('./context-manager');
const ParallelExecutor = require('./parallel-executor');
const ChecklistRunner = require('./checklist-runner');

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
   * @param {Function} options.dispatchSubagent - Function to dispatch subagent (Task tool)
   */
  constructor(workflowPath, options = {}) {
    this.workflowPath = workflowPath;
    this.options = {
      yolo: options.yolo || false,
      executionProfile: options.executionProfile || null,
      executionContext: options.executionContext || 'development',
      parallel: options.parallel !== false, // Default true
      onPhaseStart: options.onPhaseStart || this._defaultPhaseStart.bind(this),
      onPhaseComplete: options.onPhaseComplete || this._defaultPhaseComplete.bind(this),
      dispatchSubagent: options.dispatchSubagent || null,
      checkTool: options.checkTool || null,
      onPhaseError: options.onPhaseError || null,
      projectRoot: options.projectRoot || process.cwd(),
      confidenceThreshold: this._resolveConfidenceThreshold(options.confidenceThreshold),
      enableConfidenceGate: options.enableConfidenceGate !== false,
    };

    this.workflow = null;
    this.promptBuilder = new SubagentPromptBuilder(this.options.projectRoot);
    this.contextManager = null;
    this.parallelExecutor = new ParallelExecutor();
    this.checklistRunner = new ChecklistRunner(this.options.projectRoot);

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
      this.workflow = yaml.load(content);
      if (!this.workflow || typeof this.workflow !== 'object') throw new Error('Workflow must be an object');
      // Shipped workflows keep sequence/orchestration inside their workflow envelope.
      this.workflow.sequence = this.workflow.sequence || this.workflow.workflow?.sequence;
      this.workflow.orchestration = this.workflow.orchestration || this.workflow.workflow?.orchestration;
      if (Array.isArray(this.workflow.sequence)) this.workflow.sequence = this.workflow.sequence.map(
        phase => phase.meta === 'end' ? { ...phase, workflow_end: true } : phase);
      if (!Array.isArray(this.workflow.sequence) || !this.workflow.sequence.some(phase => !phase.workflow_end)) {
        throw new Error('Workflow has no executable sequence');
      }

      // Extract workflow metadata
      const workflowId = this.workflow.workflow?.id || path.basename(this.workflowPath, '.yaml');
      this.contextManager = new ContextManager(workflowId, this.options.projectRoot);

      return this.workflow;
    } catch (error) {
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
      console.log(chalk.gray(`   📁 ${dir}`));
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
          validation.checks.push({ ...action, passed: actionResult.success });
          if (!actionResult.success) {
            validation.passed = false;
            validation.errors.push(`Post-action failed: ${action.type}`);
          }
        } catch (error) {
          validation.passed = false;
          validation.errors.push(`Post-action error: ${error.message}`);
        }
      }
    }

    // 3. Run checklist if defined
    if (phase.checklist) {
      try {
        const checklistResult = await this.checklistRunner.run(
          phase.checklist,
          phase.creates,
        );
        validation.checks.push({
          type: 'checklist',
          checklist: phase.checklist,
          passed: checklistResult.passed,
          items: checklistResult.items,
        });
        if (!checklistResult.passed) {
          validation.passed = false;
          validation.errors.push(`Checklist failed: ${phase.checklist}`);
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
    }

    const sequence = this.workflow.sequence || [];
    const orchestration = this.workflow.orchestration || {};
    const parallelPhases = orchestration.parallel_phases || [];

    console.log(chalk.blue(`\n🚀 Starting workflow: ${this.workflow.workflow?.name || 'Unknown'}`));
    console.log(
      chalk.gray(
        `   Phases: ${sequence.length} | Mode: ${this.options.yolo ? 'YOLO' : 'Interactive'}`,
      ),
    );
    console.log(chalk.gray(`   Parallel phases: ${parallelPhases.join(', ') || 'None'}`));

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 0: PRE-FLIGHT DETECTION (V3.1)
    // DETERMINISTIC: Tech stack detection via file system checks
    // ═══════════════════════════════════════════════════════════════════════════
    console.log(chalk.blue('🔍 Phase 0: Pre-Flight Detection...'));
    this.techStackProfile = await this.techStackDetector.detect();
    this.conditionEvaluator = new ConditionEvaluator(this.techStackProfile);
    // Detect the real project before output scaffolding creates supabase/docs.
    await this.setupDirectories();

    // Log detection results
    console.log(
      chalk.gray(
        `   📊 Database: ${this.techStackProfile.hasDatabase ? '✓' : '✗'} ${this.techStackProfile.database.type ? `(${this.techStackProfile.database.type})` : ''}`,
      ),
    );
    console.log(
      chalk.gray(
        `   🎨 Frontend: ${this.techStackProfile.hasFrontend ? '✓' : '✗'} ${this.techStackProfile.frontend.framework ? `(${this.techStackProfile.frontend.framework})` : ''}`,
      ),
    );
    console.log(
      chalk.gray(
        `   🔧 Backend: ${this.techStackProfile.hasBackend ? '✓' : '✗'} ${this.techStackProfile.backend.type ? `(${this.techStackProfile.backend.type})` : ''}`,
      ),
    );
    console.log(chalk.gray(`   📝 TypeScript: ${this.techStackProfile.hasTypeScript ? '✓' : '✗'}`));
    console.log(
      chalk.gray(`   📋 Applicable phases: ${this.techStackProfile.applicablePhases.join(', ')}`),
    );
    console.log(chalk.gray(`   🎯 Confidence: ${this.techStackProfile.confidence}%`));
    console.log(chalk.green('   ✅ Pre-flight detection complete\n'));

    // Store tech stack profile in context for phases
    await this.contextManager.updateMetadata({
      techStackProfile: this.techStackProfile,
    });

    // Group phases by parallel execution
    let remainingSequence = sequence;
    if (this.options.fromPhase != null) {
      const outputs = this.contextManager.getPreviousPhaseOutputs();
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
      try {
        if (group.parallel && this.options.parallel) {
          await this._executeParallelPhases(group.phases);
        } else {
          for (const phase of group.phases) {
            await this._executeSinglePhase(phase);
            if (this.executionState.pendingPhases.length) break;
          }
        }
      } catch { break; } // The phase records its actual error before yielding the summary.
      if (this.executionState.failedPhases.length || this.executionState.pendingPhases.length) break;
    }

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
   * Execute multiple phases in parallel
   * @private
   */
  async _executeParallelPhases(phases) {
    console.log(chalk.yellow(`\n⚡ Executing ${phases.length} phases in parallel...`));

    const phasePromises = phases.map((phase) => this._executeSinglePhase(phase));
    const results = await Promise.allSettled(phasePromises);

    // Process results
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.log(chalk.red(`   Phase ${phases[index].phase} failed: ${result.reason}`));
      }
    });

    return results;
  }

  /**
   * Execute a single phase
   * @private
   */
  async _executeSinglePhase(phase) {
    const phaseNum = phase.phase;
    const phaseName = phase.phase_name || `Phase ${phaseNum}`;

    if (this.conditionEvaluator) {
      this.conditionEvaluator.setPhaseOutputs(this.contextManager.getPreviousPhaseOutputs());
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

        console.log(chalk.gray(`   ⏭️  Skipping ${phaseName}: ${explanation}`));
        this.executionState.skippedPhases.push(phaseNum);

        // V3.1: Save skip result to context with reason
        const skipResult = this.skillDispatcher.createSkipResult(phase, skipReason);
        await this.contextManager.savePhaseOutput(phaseNum, skipResult, {
          handoffTarget: this._getNextPhaseHandoffTarget(phaseNum),
        });

        return { skipped: true, phase: phaseNum, reason: skipReason };
      }
    }

    // Check dependencies
    if (phase.requires) {
      const missingDeps = await this._checkDependencies(phase.requires);
      if (missingDeps.length > 0) {
        console.log(
          chalk.yellow(`   ⚠️  ${phaseName}: Missing dependencies: ${missingDeps.join(', ')}`),
        );
        this.executionState.pendingPhases.push(phaseNum);
        const pending = { status: 'waiting_for_input', phase: phaseNum, reason: 'missing_dependencies', missingDeps };
        await this.savePendingPhase(phase, pending);
        return pending;
      }
    }

    // Notify phase start
    await this.options.onPhaseStart(phase);
    this.executionState.currentPhase = phaseNum;

    try {
      // DETERMINISTIC: Prepare phase (create dirs, check pre-conditions)
      console.log(chalk.gray('   🔧 Preparing phase...'));
      await this.preparePhase(phase);

      // Build subagent prompt with REAL TASK (not generic prompt)
      const context = await this.contextManager.getContextForPhase(phaseNum);
      const prompt = await this.promptBuilder.buildPrompt(
        phase.agent,
        phase.task || phase.action, // Use task file if specified
        {
          ...context,
          phase,
          yoloMode: this.options.yolo,
          elicit: phase.elicit,
          creates: phase.creates,
          notes: phase.notes,
          checklist: phase.checklist,
          template: phase.template,
          executionProfile: this.executionProfile.profile,
          executionPolicy: this.executionProfile.policy,
          strictDefinitions: true,
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
      console.log(
        chalk.gray(
          `   🚀 ${this.skillDispatcher.formatDispatchLog(dispatchPayload).split('\n')[0]}`,
        ),
      );
      console.log(
        chalk.gray(
          `   🛡️  Execution profile: ${this.executionProfile.profile} (${this.executionProfile.context})`,
        ),
      );

      // Dispatch to subagent
      let result;
      if (this.options.dispatchSubagent) {
        result = await this.options.dispatchSubagent({
          // V3.1: Include skill dispatch payload
          ...dispatchPayload,
          // Backward compatibility: include original params
          agentId: phase.agent,
          prompt,
          phase,
          context: dispatchPayload.context,
          baseContext: context,
        });

        // A process exit or plain prose is not an explicit completion result.
        let declared = result;
        if (typeof declared === 'string') {
          try { declared = JSON.parse(/```json\s*([\s\S]*?)```/.exec(declared)?.[1] || declared); }
          catch { declared = null; }
        }
        result = declared && typeof declared === 'object' && typeof declared.status === 'string'
          ? this.skillDispatcher.parseSkillOutput(declared, phase)
          : { status: 'pending_dispatch', output: result, message: 'Explicit completion result required' };
      } else {
        // Fallback: return prompt for manual execution
        result = {
          status: 'pending_dispatch',
          prompt,
          skill: dispatchPayload.skill,
          message: 'Subagent dispatch function not provided',
        };
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
      console.log(chalk.gray('   🔍 Validating output...'));
      const validation = await this.validatePhaseOutput(phase, result);
      if (!validation.passed) {
        throw new Error(`Output validation failed: ${validation.errors.join(', ')}`);
      }

      // Save phase output to context
      const previous = this.contextManager.getPreviousPhaseOutputs()[phaseNum];
      const stepResult = {
        agent: phase.agent,
        action: phase.action,
        task: phase.task,
        result,
        validation,
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

      return { ...result, validation };
    } catch (error) {
      console.log(chalk.red(`   ❌ ${phaseName} failed: ${error.message}`));
      this.executionState.failedPhases.push(phaseNum);
      this.executionState.errors.push({ phase: phaseNum, error: error.message });
      if (this.options.onPhaseError) await this.options.onPhaseError(phase, error);
      throw error;
    }
  }

  async savePendingPhase(phase, result) {
    const previous = this.contextManager.getPreviousPhaseOutputs()[phase.phase];
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
  async _checkDependencies(requires) {
    const missing = [];
    const deps = Array.isArray(requires) ? requires : [requires];

    for (const dep of deps) {
      // Handle conditional dependencies like "supabase/docs/SCHEMA.md (if exists)"
      if (dep.includes('(if exists)')) continue;

      const depPath = path.join(this.options.projectRoot, dep);
      if (!(await fs.pathExists(depPath))) {
        missing.push(dep);
      }
    }

    return missing;
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
      status: this.executionState.failedPhases.length === 0 ? 'completed' : 'completed_with_errors',
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
    console.log(chalk.cyan(`\n${icon} Phase ${phase.phase}: ${phase.phase_name}`));
    console.log(chalk.gray(`   Agent: @${phase.agent} | Action: *${phase.action}`));
  }

  /**
   * Default phase complete callback
   * @private
   */
  _defaultPhaseComplete(phase, result) {
    const status =
      result?.status === 'success' ? '✅' : result?.status === 'pending_dispatch' ? '📤' : '⚠️';
    console.log(chalk.green(`   ${status} Phase ${phase.phase} complete`));
    if (phase.creates) {
      const creates = Array.isArray(phase.creates) ? phase.creates : [phase.creates];
      creates.forEach((c) => console.log(chalk.gray(`      → ${c}`)));
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
    if (!Number.isInteger(fromPhase) || fromPhase < 1) throw new Error('Resume phase must be a positive integer');
    this.options.fromPhase = fromPhase;
    this.executionState = { startTime: null, currentPhase: 0, completedPhases: [],
      failedPhases: [], skippedPhases: [], pendingPhases: [], errors: [] };
    return this.execute();
  }
}

module.exports = WorkflowOrchestrator;
