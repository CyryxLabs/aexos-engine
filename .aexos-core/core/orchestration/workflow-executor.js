/**
 * Workflow Executor - Development Cycle Engine
 *
 * Story 11.3: Projeto Bob - Development Cycle Workflow
 * Story 11.5: Session State Persistence (ADR-011)
 *
 * Executes the development cycle workflow with:
 * - Dynamic executor assignment (Story 11.1)
 * - Terminal spawning for clean context (Story 11.2)
 * - Session state persistence (Story 11.5)
 * - Conditional self-healing with CodeRabbit
 * - Quality gate by different agent
 * - Human checkpoints (GO/PAUSE/REVIEW/ABORT)
 *
 * @module core/orchestration/workflow-executor
 * @version 1.1.0
 */

'use strict';

const fs = require('fs').promises;
const fsSync = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');

// Import dependencies from Story 11.1, 11.2, and 11.5
const ExecutorAssignment = require('./executor-assignment');
const TerminalSpawner = require('./terminal-spawner');
const { SessionState, ActionType } = require('./session-state');
const { atomicWriteSync } = require('../synapse/utils/atomic-write');

// Constants
const DEFAULT_TIMEOUT_MS = 7200000; // 2 hours
const CHECKPOINT_TIMEOUT_MS = 1800000; // 30 minutes

/**
 * Workflow phase status
 * @enum {string}
 */
const PhaseStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  WAITING: 'waiting_for_input',
};

/**
 * Checkpoint decision options
 * @enum {string}
 */
const CheckpointDecision = {
  GO: 'GO',
  PAUSE: 'PAUSE',
  REVIEW: 'REVIEW',
  ABORT: 'ABORT',
};

function agentPayload(result) {
  if (result.result && typeof result.result === 'object') return result.result;
  try {
    const text = String(result.output || '');
    const block = /```json\s*([\s\S]*?)```/.exec(text);
    const parsed = JSON.parse(block ? block[1] : text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

function pendingExecution(note, result = {}) {
  return { status: PhaseStatus.WAITING, awaiting_input: true, note,
    output: result.output || null, outputFile: result.outputFile || null };
}

/**
 * Workflow execution state
 * @typedef {Object} WorkflowState
 * @property {string} workflowId - Workflow identifier
 * @property {string} currentPhase - Current phase ID
 * @property {string} currentStory - Path to current story file
 * @property {string} executor - Current executor agent
 * @property {string} qualityGate - Current quality gate agent
 * @property {number} attemptCount - Number of attempts for current phase
 * @property {Date} startedAt - Workflow start time
 * @property {Date} lastUpdated - Last state update time
 * @property {Object} phaseResults - Results from each phase
 * @property {Object} accumulatedContext - Context accumulated across phases
 */

/**
 * Workflow Executor class
 */
class WorkflowExecutor {
  /** Execute a declared multi-agent workflow through the existing YAML orchestrator. */
  async executeWorkflow(workflowPath, options = {}) {
    const WorkflowOrchestrator = require('./workflow-orchestrator');
    const orchestrator = new WorkflowOrchestrator(workflowPath, {
      ...this.options, ...options, projectRoot: this.projectRoot,
    });
    return options.resumeFrom != null ? orchestrator.resumeFrom(options.resumeFrom) : orchestrator.execute();
  }

  /**
   * Creates a new WorkflowExecutor instance
   * @param {string} projectRoot - Project root directory
   * @param {Object} options - Executor options
   */
  constructor(projectRoot, options = {}) {
    this.projectRoot = projectRoot;
    this.options = {
      debug: false,
      autoResume: true,
      saveState: true,
      useSessionState: true, // Story 11.5: Use unified session state
      ...options,
    };

    this.workflowPath = path.join(
      projectRoot,
      '.aexos-core/development/workflows/development-cycle.yaml',
    );
    this.statePath = path.join(projectRoot, '.aexos/workflow-state/');
    this.configPath = path.join(projectRoot, '.aexos-core/core-config.yaml');

    this.workflow = null;
    this.state = null;
    this.config = null;

    // Story 11.5: Session State Manager (ADR-011)
    this.sessionState = new SessionState(projectRoot, { debug: options.debug });

    // Story 12.6: Phase change callbacks for observability
    this._phaseChangeCallbacks = [];
    this._agentSpawnCallbacks = [];
    this._terminalSpawnCallbacks = [];
  }

  /**
   * Registers a callback for phase change events (Story 12.6 - AC1)
   * @param {Function} callback - Callback function (phase, storyId, executor) => void
   * @returns {void}
   */
  onPhaseChange(callback) {
    if (typeof callback === 'function') {
      this._phaseChangeCallbacks.push(callback);
    }
  }

  /**
   * Registers a callback for agent spawn events (Story 12.6 - AC1)
   * @param {Function} callback - Callback function (agent, task) => void
   * @returns {void}
   */
  onAgentSpawn(callback) {
    if (typeof callback === 'function') {
      this._agentSpawnCallbacks.push(callback);
    }
  }

  /**
   * Registers a callback for terminal spawn events (Story 12.6 - AC1)
   * @param {Function} callback - Callback function (agent, pid, task) => void
   * @returns {void}
   */
  onTerminalSpawn(callback) {
    if (typeof callback === 'function') {
      this._terminalSpawnCallbacks.push(callback);
    }
  }

  /**
   * Emits phase change to all registered callbacks (Story 12.6)
   * @param {string} phase - Phase name
   * @param {string} storyId - Story ID
   * @param {string} executor - Executor agent
   * @private
   */
  _emitPhaseChange(phase, storyId, executor) {
    for (const callback of this._phaseChangeCallbacks) {
      try {
        callback(phase, storyId, executor);
      } catch (error) {
        if (this.options.debug) {
          console.log(`[WorkflowExecutor] Phase change callback error: ${error.message}`);
        }
      }
    }
  }

  /**
   * Emits agent spawn to all registered callbacks (Story 12.6)
   * @param {string} agent - Agent ID
   * @param {string} task - Task being executed
   * @private
   */
  _emitAgentSpawn(agent, task) {
    for (const callback of this._agentSpawnCallbacks) {
      try {
        callback(agent, task);
      } catch (error) {
        if (this.options.debug) {
          console.log(`[WorkflowExecutor] Agent spawn callback error: ${error.message}`);
        }
      }
    }
  }

  /**
   * Emits terminal spawn to all registered callbacks (Story 12.6)
   * @param {string} agent - Agent ID
   * @param {number} pid - Process ID
   * @param {string} task - Task being executed
   * @private
   */
  _emitTerminalSpawn(agent, pid, task) {
    for (const callback of this._terminalSpawnCallbacks) {
      try {
        callback(agent, pid, task);
      } catch (error) {
        if (this.options.debug) {
          console.log(`[WorkflowExecutor] Terminal spawn callback error: ${error.message}`);
        }
      }
    }
  }

  /**
   * Loads the workflow definition
   * @returns {Promise<Object>} Workflow definition
   */
  async loadWorkflow() {
    const content = await fs.readFile(this.workflowPath, 'utf8');
    this.workflow = yaml.load(content);
    return this.workflow;
  }

  /**
   * Loads the core configuration
   * @returns {Promise<Object>} Core configuration
   */
  async loadConfig() {
    const defaults = { coderabbit_integration: { enabled: false } };

    try {
      const content = await fs.readFile(this.configPath, 'utf8');
      const parsed = yaml.load(content);

      // `yaml.load` returns undefined for an empty or comment-only file, and
      // that path never threw, so the defaults below were skipped and every
      // caller crashed on `config.coderabbit_integration`. An empty config is
      // the same situation as a missing one: fall back.
      this.config = parsed && typeof parsed === 'object' ? parsed : defaults;
    } catch (error) {
      if (this.options.debug) {
        console.log(`[WorkflowExecutor] Config not found at ${this.configPath}, using defaults`);
        console.log(`[WorkflowExecutor] Error: ${error.message}`);
      }
      this.config = defaults;
    }
    return this.config;
  }

  /**
   * Initializes or resumes workflow state
   * @param {string} storyPath - Path to story file
   * @returns {Promise<WorkflowState>} Workflow state
   */
  async initializeState(storyPath) {
    let stateFile = this.getStateFilePath(storyPath);
    if (!fsSync.existsSync(stateFile)) {
      const legacy = path.join(this.statePath, `${path.basename(storyPath, '.story.md')}-state.yaml`);
      if (fsSync.existsSync(legacy)) {
        const previous = yaml.load(await fs.readFile(legacy, 'utf8'));
        if (typeof previous?.currentStory === 'string' && path.resolve(this.projectRoot, previous.currentStory) ===
          path.resolve(this.projectRoot, storyPath)) stateFile = legacy;
      }
    }

    // Check for existing state
    if (this.options.autoResume && fsSync.existsSync(stateFile)) {
      const content = await fs.readFile(stateFile, 'utf8');
      this.state = yaml.load(content);
      if (!this.state || this.state.workflowId !== 'development-cycle' ||
        typeof this.state.currentStory !== 'string' || path.resolve(this.projectRoot, this.state.currentStory) !==
          path.resolve(this.projectRoot, storyPath) || !this.state.phaseResults ||
        typeof this.state.phaseResults !== 'object' || Array.isArray(this.state.phaseResults) ||
        (this.state.currentPhase === null && !Object.keys(this.state.phaseResults).length)) {
        throw new Error('Invalid or mismatched workflow state; original file preserved');
      }
      this.state.lastUpdated = new Date();

      if (this.options.debug) {
        console.log(`[WorkflowExecutor] Resumed state from: ${stateFile}`);
      }

      return this.state;
    }

    // Create new state
    this.state = {
      workflowId: 'development-cycle',
      currentPhase: '1_validation',
      currentStory: storyPath,
      executor: null,
      qualityGate: null,
      attemptCount: 0,
      startedAt: new Date(),
      lastUpdated: new Date(),
      phaseResults: {},
      accumulatedContext: {},
    };

    await this.saveState();
    return this.state;
  }

  /**
   * Gets the state file path for a story
   * @param {string} storyPath - Path to story file
   * @returns {string} State file path
   */
  getStateFilePath(storyPath) {
    const storyName = path.basename(storyPath, '.story.md');
    const identity = require('crypto').createHash('sha256')
      .update(path.resolve(this.projectRoot, storyPath)).digest('hex').slice(0, 16);
    return path.join(this.statePath, `${storyName}-${identity}-state.yaml`);
  }

  /**
   * Saves the current workflow state
   * @returns {Promise<void>}
   */
  async saveState() {
    if (!this.options.saveState) return;

    await fs.mkdir(this.statePath, { recursive: true });
    const stateFile = this.getStateFilePath(this.state.currentStory);
    this.state.lastUpdated = new Date();
    atomicWriteSync(stateFile, yaml.dump(this.state));

    // Story 11.5: Also update unified session state (ADR-011)
    await this.syncToSessionState();
  }

  /**
   * Syncs internal workflow state to unified session state (Story 11.5)
   * @returns {Promise<void>}
   */
  async syncToSessionState() {
    if (!this.options.useSessionState) return;

    try {
      // Load or create session state
      const sessionExists = await this.sessionState.exists();
      if (!sessionExists) {
        // Session state will be created by Bob orchestrator
        // We just update if it exists
        return;
      }

      await this.sessionState.loadSessionState();

      // Map phase ID to phase name
      const phaseNameMap = {
        '1_validation': 'validation',
        '2_development': 'development',
        '3_self_healing': 'self_healing',
        '4_quality_gate': 'quality_gate',
        '5_push': 'push',
        '6_checkpoint': 'checkpoint',
      };

      const phaseName = phaseNameMap[this.state.currentPhase] || this.state.currentPhase;

      await this.sessionState.updateSessionState({
        workflow: {
          current_phase: phaseName,
          attempt_count: this.state.attemptCount,
          phase_results: this.state.phaseResults,
        },
        last_action: {
          type: ActionType.PHASE_CHANGE,
          story: this.state.currentStory,
          phase: phaseName,
        },
        context_snapshot: {
          last_executor: this.state.executor,
        },
      });

      if (this.options.debug) {
        console.log(`[WorkflowExecutor] Synced to session state: phase=${phaseName}`);
      }
    } catch (error) {
      // Non-fatal - log and continue
      if (this.options.debug) {
        console.log(`[WorkflowExecutor] Session state sync failed: ${error.message}`);
      }
    }
  }

  /**
   * Reads story metadata from YAML frontmatter
   * @param {string} storyPath - Path to story file
   * @returns {Promise<Object>} Story metadata
   */
  async readStoryMetadata(storyPath) {
    const content = await fs.readFile(storyPath, 'utf8');

    // Extract YAML from markdown frontmatter
    const yamlMatch = content.match(/```yaml\n([\s\S]*?)```/);
    if (!yamlMatch) {
      throw new Error(`No YAML frontmatter found in story: ${storyPath}`);
    }

    return yaml.load(yamlMatch[1]);
  }

  /**
   * Executes the development cycle workflow
   * @param {string} storyPath - Path to story file
   * @param {Object} epicContext - Optional epic context
   * @returns {Promise<Object>} Execution result
   */
  async execute(storyPath, epicContext = {}) {
    // Load workflow and config
    await this.loadWorkflow();
    await this.loadConfig();

    // Initialize state
    await this.initializeState(storyPath);

    // Read story metadata
    const storyMetadata = await this.readStoryMetadata(storyPath);
    this.state.executor = storyMetadata.executor;
    this.state.qualityGate = storyMetadata.quality_gate;

    if (this.options.debug) {
      console.log('[WorkflowExecutor] Starting workflow execution');
      console.log(`  Story: ${storyPath}`);
      console.log(`  Executor: ${this.state.executor}`);
      console.log(`  Quality Gate: ${this.state.qualityGate}`);
    }

    // Execute phases
    let currentPhase = this.state.currentPhase;
    let continueExecution = Boolean(currentPhase) && !['workflow_paused', 'workflow_aborted'].includes(currentPhase);

    while (continueExecution) {
      const phaseResult = await this.executePhase(currentPhase, storyPath, epicContext);
      this.state.phaseResults[currentPhase] = phaseResult;
      await this.saveState();

      if (phaseResult.status === PhaseStatus.FAILED) {
        this.state.failureCounts ||= {};
        this.state.failureCounts[currentPhase] = (this.state.failureCounts[currentPhase] || 0) + 1;
        this.state.attemptCount = this.state.failureCounts[currentPhase] - 1;
        const errorHandler = this.getErrorHandler(currentPhase, phaseResult);
        const handlerResult = await this.handleError(errorHandler, phaseResult);

        if (handlerResult.retry) {
          this.state.attemptCount++;
          continue;
        } else if (handlerResult.nextPhase) {
          currentPhase = handlerResult.nextPhase;
          this.state.currentPhase = currentPhase;
          continue;
        } else {
          continueExecution = false;
        }
      } else if (phaseResult.status === PhaseStatus.COMPLETED) {
        currentPhase = this.getNextPhase(currentPhase, phaseResult);

        if (!currentPhase) {
          continueExecution = false;
        } else if (currentPhase === 'workflow_paused') {
          continueExecution = false;
        } else if (currentPhase === 'workflow_aborted') {
          continueExecution = false;
        }

        this.state.currentPhase = currentPhase;
        this.state.attemptCount = 0;
      } else if (phaseResult.status === PhaseStatus.SKIPPED) {
        currentPhase = this.getNextPhase(currentPhase, phaseResult);
        this.state.currentPhase = currentPhase;
        if (!currentPhase) continueExecution = false;
      } else {
        // A human decision or external execution must yield to its caller.
        // Unknown/nonterminal results must never busy-loop or imply completion.
        continueExecution = false;
      }
    }
    await this.saveState();
    const checkpoint = this.state.phaseResults['6_checkpoint'];
    const waiting = checkpoint?.awaiting_input === true ||
      Object.values(this.state.phaseResults).some(result => result.status === PhaseStatus.WAITING);
    const completed = this.state.currentPhase === null && !waiting &&
      Object.values(this.state.phaseResults).every(result => [PhaseStatus.COMPLETED, PhaseStatus.SKIPPED].includes(result.status));
    return {
      success: completed,
      status: completed ? 'completed' : waiting ? 'waiting_for_input' :
        this.state.currentPhase === 'workflow_paused' ? 'paused' :
          this.state.currentPhase === 'workflow_aborted' ? 'aborted' : 'failed',
      awaiting_input: waiting,
      next_story: checkpoint?.next_story || null,
      state: this.state,
      phaseResults: this.state.phaseResults,
    };
  }

  /**
   * Executes a single workflow phase
   * @param {string} phaseId - Phase identifier
   * @param {string} storyPath - Path to story file
   * @param {Object} epicContext - Epic context
   * @returns {Promise<Object>} Phase execution result
   */
  async executePhase(phaseId, storyPath, epicContext) {
    const phase = this.workflow.workflow.phases[phaseId];

    if (!phase) {
      return { status: PhaseStatus.FAILED, error: `Phase not found: ${phaseId}` };
    }

    if (this.options.debug) {
      console.log(`[WorkflowExecutor] Executing phase: ${phaseId}`);
    }

    // Check condition
    if (phase.condition) {
      const conditionMet = this.evaluateCondition(phase.condition);
      if (!conditionMet) {
        return { status: PhaseStatus.SKIPPED, reason: 'Condition not met' };
      }
    }

    // Resolve dynamic agent
    const agent = this.resolveAgent(phase.agent);

    // Story 12.6: Emit phase change for observability (AC1, AC2)
    const storyId = path.basename(storyPath, '.story.md');
    this._emitPhaseChange(phaseId, storyId, agent);

    // Execute based on phase type
    switch (phaseId) {
      case '1_validation':
        return this.executeValidationPhase(phase, agent, storyPath, epicContext);
      case '2_development':
        return this.executeDevelopmentPhase(phase, agent, storyPath);
      case '3_self_healing':
        return this.executeSelfHealingPhase(phase, agent);
      case '4_quality_gate':
        return this.executeQualityGatePhase(phase, agent, storyPath);
      case '5_push':
        return this.executePushPhase(phase, agent, storyPath);
      case '6_checkpoint':
        return this.executeCheckpointPhase(phase, agent, storyPath);
      default:
        return { status: PhaseStatus.FAILED, error: `Unknown phase: ${phaseId}` };
    }
  }

  /**
   * Resolves dynamic agent references
   * @param {string} agentRef - Agent reference (may be dynamic)
   * @returns {string} Resolved agent ID
   */
  resolveAgent(agentRef) {
    if (agentRef === '${story.executor}') {
      return this.state.executor;
    }
    if (agentRef === '${story.quality_gate}') {
      return this.state.qualityGate;
    }
    return agentRef;
  }

  /**
   * Evaluates a condition expression
   * @param {string} condition - Condition expression
   * @returns {boolean} Condition result
   */
  evaluateCondition(condition) {
    // Handle CodeRabbit integration check
    if (condition.includes('coderabbit_integration.enabled')) {
      return this.config?.coderabbit_integration?.enabled === true;
    }
    return true;
  }

  /**
   * Executes Phase 1: Story Validation
   * @param {Object} phase - Phase configuration
   * @param {string} agent - Agent ID
   * @param {string} storyPath - Path to story file
   * @param {Object} epicContext - Epic context
   * @returns {Promise<Object>} Phase result
   */
  async executeValidationPhase(phase, agent, storyPath, epicContext) {
    try {
      // Validate story has required fields
      const storyMetadata = await this.readStoryMetadata(storyPath);

      const issues = [];

      if (!storyMetadata.executor) {
        issues.push('Story must have an executor assigned');
      }
      if (!storyMetadata.quality_gate) {
        issues.push('Story must have a quality_gate assigned');
      }
      if (storyMetadata.executor === storyMetadata.quality_gate) {
        issues.push('Executor and Quality Gate must be different agents');
      }

      // Validate executor assignment using Story 11.1
      if (storyMetadata.executor && storyMetadata.quality_gate) {
        const validation = ExecutorAssignment.validateExecutorAssignment({
          executor: storyMetadata.executor,
          quality_gate: storyMetadata.quality_gate,
          quality_gate_tools: storyMetadata.quality_gate_tools || ['code_review'],
        });
        if (!validation.isValid) {
          issues.push(...validation.errors);
        }
      }

      if (issues.length > 0) {
        return {
          status: PhaseStatus.FAILED,
          validation_result: { passed: false, issues },
        };
      }

      // Update accumulated context with epic info
      this.state.accumulatedContext = {
        ...this.state.accumulatedContext,
        ...epicContext,
        validatedAt: new Date(),
      };

      return {
        status: PhaseStatus.COMPLETED,
        validation_result: { passed: true, score: 100, issues: [] },
      };
    } catch (error) {
      return {
        status: PhaseStatus.FAILED,
        error: error.message,
      };
    }
  }

  /**
   * Executes Phase 2: Development (Dynamic Executor)
   * @param {Object} phase - Phase configuration
   * @param {string} agent - Agent ID (dynamic)
   * @param {string} storyPath - Path to story file
   * @returns {Promise<Object>} Phase result
   */
  async executeDevelopmentPhase(phase, agent, storyPath) {
    try {
      if (this.options.debug) {
        console.log(`[WorkflowExecutor] Spawning ${agent} for development`);
      }

      // Story 12.6: Emit agent spawn for observability (AC1)
      this._emitAgentSpawn(agent, 'development');

      // Use terminal spawning (Story 11.2)
      if (phase.spawn_in_terminal && TerminalSpawner.isSpawnerAvailable()) {
        const context = {
          story: storyPath,
          files: [],
          instructions: `Execute *develop for story: ${storyPath}. Return a JSON completion object with implementation.files_created, files_modified and tests_added arrays containing actual paths.`,
          metadata: this.state.accumulatedContext,
        };

        const result = await TerminalSpawner.spawnAgent(agent.replace('@', ''), 'develop', {
          context,
          timeout: DEFAULT_TIMEOUT_MS,
          debug: this.options.debug,
        });

        // Story 12.6: Emit terminal spawn for observability (AC1)
        if (result.pid) {
          this._emitTerminalSpawn(agent, result.pid, 'development');
        }

        const payload = agentPayload(result);
        if (result.success && !await this.verifyImplementation(payload.implementation)) {
          return pendingExecution('Agent exited without verifiable implementation files; review its output before continuing', result);
        }
        return {
          status: result.success ? PhaseStatus.COMPLETED : PhaseStatus.FAILED,
          implementation: payload.implementation || null,
          output: result.output,
          outputFile: result.outputFile,
        };
      }

      // Fallback: Return pending for manual execution
      return pendingExecution('Terminal spawning not available, manual execution required');
    } catch (error) {
      return {
        status: PhaseStatus.FAILED,
        error: error.message,
      };
    }
  }

  async verifyImplementation(implementation) {
    const fields = ['files_created', 'files_modified', 'tests_added'];
    if (!fields.every(key => Array.isArray(implementation?.[key]))) return false;
    const files = fields.flatMap(key => implementation[key]);
    if (!files.length) return false;
    const root = path.resolve(this.projectRoot);
    for (const file of files) {
      if (typeof file !== 'string' || !file.trim()) return false;
      const destination = path.resolve(root, file);
      const relative = path.relative(root, destination);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return false;
      try {
        let cursor = root;
        for (const part of relative.split(path.sep)) {
          cursor = path.join(cursor, part);
          if ((await fs.lstat(cursor)).isSymbolicLink()) return false;
        }
        if (!(await fs.stat(destination)).isFile()) return false;
      } catch { return false; }
    }
    return true;
  }

  async verifyPublication(publication) {
    const push = publication.push_result;
    if (!/^[a-f0-9]{40,64}$/i.test(push?.commit_hash || '') || typeof push.branch !== 'string') return false;
    try {
      const execFile = require('util').promisify(require('child_process').execFile);
      const run = (command, args) => execFile(command, args, { cwd: this.projectRoot,
        timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true });
      await run('git', ['check-ref-format', `refs/heads/${push.branch}`]);
      const remote = (await run('git', ['remote', 'get-url', 'origin'])).stdout.trim();
      const normalized = remote.replace(/^git@([^:]+):/, 'https://$1/').replace(/\.git$/, '');
      const origin = new URL(normalized);
      const pr = new URL(publication.pr_url);
      if (pr.protocol !== 'https:' || pr.host !== origin.host ||
        !new RegExp(`^${origin.pathname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/pull/\\d+$`).test(pr.pathname)) return false;
      const references = (await run('git', ['ls-remote', '--exit-code', '--refs', 'origin', `refs/heads/${push.branch}`])).stdout;
      if (!references.split(/\r?\n/).some(line => line.split(/\s+/)[0] === push.commit_hash &&
        line.split(/\s+/)[1] === `refs/heads/${push.branch}`)) return false;
      const actual = JSON.parse((await run('gh', ['pr', 'view', pr.toString(), '--json', 'url,headRefOid,headRefName,state'])).stdout);
      return actual.headRefOid === push.commit_hash && actual.headRefName === push.branch &&
        actual.url === pr.toString() && ['OPEN', 'MERGED'].includes(actual.state);
    } catch { return false; }
  }

  /**
   * Executes Phase 3: Self-Healing (Conditional)
   * Uses CodeRabbit CLI to detect and auto-fix issues.
   * @param {Object} phase - Phase configuration
   * @param {string} agent - Agent ID
   * @returns {Promise<Object>} Phase result
   */
  async executeSelfHealingPhase(phase, _agent) {
    try {
      const maxIterations = phase.config?.max_iterations || this.config?.coderabbit_integration?.self_healing?.max_iterations || 3;
      const severityFilter = phase.config?.severity_filter || ['CRITICAL', 'HIGH'];
      let iterations = 0;
      const issuesFixed = [];
      const issuesRemaining = [];

      // Check if CodeRabbit is available
      const coderabbitConfig = this.config?.coderabbit_integration;
      if (!coderabbitConfig?.enabled) {
        if (this.options.debug) {
          console.log('[WorkflowExecutor] CodeRabbit not enabled, skipping self-healing');
        }
        return {
          status: PhaseStatus.SKIPPED,
          reason: 'CodeRabbit integration not enabled',
        };
      }

      // Self-healing loop
      while (iterations < maxIterations) {
        iterations++;

        if (this.options.debug) {
          console.log(`[WorkflowExecutor] Self-healing iteration ${iterations}/${maxIterations}`);
        }

        // Run CodeRabbit analysis
        const analysisResult = await this.runCodeRabbitAnalysis(coderabbitConfig);

        if (!analysisResult.success) {
          if (this.options.debug) {
            console.log(`[WorkflowExecutor] CodeRabbit analysis failed: ${analysisResult.error}`);
          }
          // Graceful degradation - continue without self-healing
          if (coderabbitConfig.graceful_degradation?.skip_if_not_installed) {
            return {
              status: PhaseStatus.COMPLETED,
              healed_code: {
                iterations,
                issues_fixed: issuesFixed,
                issues_remaining: issuesRemaining,
                note: analysisResult.error || coderabbitConfig.graceful_degradation?.fallback_message,
              },
            };
          }
          break;
        }

        // Filter issues by severity
        const relevantIssues = analysisResult.issues.filter(
          (issue) => severityFilter.includes(issue.severity),
        );

        if (relevantIssues.length === 0) {
          if (this.options.debug) {
            console.log('[WorkflowExecutor] No relevant issues found, self-healing complete');
          }
          break;
        }

        // Attempt to fix issues
        for (const issue of relevantIssues) {
          const fixed = await this.attemptAutoFix(issue);
          if (fixed) {
            issuesFixed.push({
              file: issue.file,
              line: issue.line,
              severity: issue.severity,
              message: issue.message,
              fixedAt: new Date().toISOString(),
            });
          } else {
            issuesRemaining.push({
              file: issue.file,
              line: issue.line,
              severity: issue.severity,
              message: issue.message,
            });
          }
        }

        // If no issues were fixed in this iteration, stop
        if (issuesFixed.length === 0 && iterations > 1) {
          if (this.options.debug) {
            console.log('[WorkflowExecutor] No issues fixed in iteration, stopping');
          }
          break;
        }
      }

      return {
        status: PhaseStatus.COMPLETED,
        healed_code: {
          iterations,
          issues_fixed: issuesFixed,
          issues_remaining: issuesRemaining,
        },
      };
    } catch (error) {
      if (this.options.debug) {
        console.log(`[WorkflowExecutor] Self-healing error: ${error.message}`);
      }
      return {
        status: PhaseStatus.FAILED,
        error: error.message,
      };
    }
  }

  /**
   * Runs CodeRabbit analysis on the codebase
   * @param {Object} coderabbitConfig - CodeRabbit configuration
   * @returns {Promise<Object>} Analysis result with issues array
   */
  async runCodeRabbitAnalysis(coderabbitConfig) {
    try {
      const childProcess = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(childProcess.exec);

      // Build command for current platform.
      // - Explicit installation_mode: 'wsl' | 'native' wins (lets ops override).
      // - Default: Windows hosts wrap via WSL, macOS/Linux run the binary directly.
      // - cli_path defaults to ~/.local/bin/coderabbit (matches the CodeRabbit CLI installer default).
      // - Tilde handling differs per mode: native expands via os.homedir() so the
      //   resolved absolute path is shell-agnostic; WSL mode keeps the literal `~`
      //   so the WSL distribution's own bash expands it (the host's HOME would point
      //   at a Windows path that WSL cannot resolve).
      const rawCliPath = coderabbitConfig.cli_path || '~/.local/bin/coderabbit';
      const mode =
        coderabbitConfig.installation_mode ||
        (process.platform === 'win32' ? 'wsl' : 'native');
      let command;
      if (mode === 'wsl') {
        // Probe WSL availability before building the command. Gives a clearer
        // diagnostic than cmd.exe's generic "'wsl' is not recognized" when WSL
        // is not installed. ENOENT (binary missing) and non-zero exit (WSL
        // feature present but no distribution installed) both fail this check.
        const wslProbe = childProcess.spawnSync('wsl', ['-l'], { encoding: 'utf8' });
        if (wslProbe.error || wslProbe.status !== 0) {
          throw new Error(
            'CodeRabbit CLI requires WSL on Windows hosts. Install WSL via ' +
              '`wsl --install` (https://learn.microsoft.com/windows/wsl/install), ' +
              'then install the CodeRabbit CLI inside the WSL distribution. ' +
              'See docs/guides/installation-troubleshooting.md Issue 10. ' +
              'To bypass this check, set coderabbit.installation_mode=\'native\' in your config.',
          );
        }
        const wslPath = this.projectRoot
          .replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`)
          .replace(/\\/g, '/');
        // Keep literal `~` — WSL bash expands it to the WSL user's HOME.
        command = `wsl bash -c 'cd "${wslPath}" && ${rawCliPath} --prompt-only -t uncommitted 2>&1'`;
      } else {
        const cliPath = rawCliPath.startsWith('~')
          ? path.join(os.homedir(), rawCliPath.slice(1))
          : rawCliPath;
        command = `${cliPath} --prompt-only -t uncommitted`;
      }

      if (this.options.debug) {
        console.log(`[WorkflowExecutor] Running CodeRabbit: ${command}`);
      }

      const { stdout, stderr } = await execAsync(command, {
        timeout: (coderabbitConfig.self_healing?.timeout_minutes || 30) * 60 * 1000,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });

      // Parse CodeRabbit output to extract issues
      const issues = this.parseCodeRabbitOutput([stdout || '', stderr || ''].join('\n'));

      return {
        success: true,
        issues,
        rawOutput: stdout,
      };
    } catch (error) {
      // Handle command not found or execution errors
      if (error.code === 'ENOENT' || error.message?.includes('not found')) {
        return {
          success: false,
          error: 'CodeRabbit CLI not installed',
          issues: [],
        };
      }
      if (error.code !== undefined && error.code !== 0) {
        return {
          success: false,
          error:
            `CodeRabbit CLI exited with code ${error.code}. ` +
            `stdout: ${(error.stdout || '').slice(0, 200)}, ` +
            `stderr: ${(error.stderr || '').slice(0, 200)}`,
          issues: [],
        };
      }
      return {
        success: false,
        error: error.message,
        issues: [],
      };
    }
  }

  /**
   * Parses CodeRabbit CLI output to extract issues
   * @param {string} output - Raw CodeRabbit output
   * @returns {Array} Array of issue objects
   */
  parseCodeRabbitOutput(output) {
    const issues = [];

    if (!output) return issues;

    // CodeRabbit outputs issues in various formats
    // Try to parse structured format first (JSON-like blocks)
    const jsonMatch = output.match(/```json\n([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => ({
            file: item.file || item.path || 'unknown',
            line: item.line || item.lineNumber || 0,
            severity: item.severity || 'MEDIUM',
            message: item.message || item.description || '',
            suggestion: item.suggestion || item.fix || null,
          }));
        }
      } catch {
        // Not valid JSON, continue with text parsing
      }
    }

    // Parse text-based output (line-by-line issues)
    const lines = output.split('\n');
    const severityPattern = /\[(CRITICAL|HIGH|MEDIUM|LOW)\]/i;
    const filePattern = /([^\s:]+):(\d+)/;

    for (const line of lines) {
      const severityMatch = line.match(severityPattern);
      const fileMatch = line.match(filePattern);

      if (severityMatch) {
        issues.push({
          file: fileMatch ? fileMatch[1] : 'unknown',
          line: fileMatch ? parseInt(fileMatch[2], 10) : 0,
          severity: severityMatch[1].toUpperCase(),
          message: line.replace(severityPattern, '').replace(filePattern, '').trim(),
          suggestion: null,
        });
      }
    }

    return issues;
  }

  /**
   * Attempts to auto-fix a single issue
   * @param {Object} issue - Issue to fix
   * @returns {Promise<boolean>} True if fixed successfully
   */
  async attemptAutoFix(issue) {
    // For MVP, we don't attempt actual auto-fixes
    // This would require integration with an AI model to generate fixes
    // Just log the attempt and return false
    if (this.options.debug) {
      console.log(`[WorkflowExecutor] Would auto-fix: ${issue.file}:${issue.line} - ${issue.message}`);
    }

    // If issue has a suggestion, we could apply it
    // For now, mark as not fixed - requires human review
    return false;
  }

  /**
   * Executes Phase 4: Quality Gate
   * @param {Object} phase - Phase configuration
   * @param {string} agent - Agent ID (quality gate)
   * @param {string} storyPath - Path to story file
   * @returns {Promise<Object>} Phase result
   */
  async executeQualityGatePhase(phase, agent, storyPath) {
    try {
      // Validate that quality gate is different from executor
      if (agent === this.state.executor) {
        return {
          status: PhaseStatus.FAILED,
          error: 'Quality Gate agent must be different from executor',
        };
      }

      if (this.options.debug) {
        console.log(`[WorkflowExecutor] Spawning ${agent} for quality gate`);
      }

      // Story 12.6: Emit agent spawn for observability (AC1)
      this._emitAgentSpawn(agent, 'quality_gate');

      // Use terminal spawning
      if (phase.spawn_in_terminal && TerminalSpawner.isSpawnerAvailable()) {
        const context = {
          story: storyPath,
          files: [],
          instructions: `Execute quality review for story: ${storyPath}. Return JSON with review_result.verdict (APPROVED or NEEDS_WORK), findings and recommendations arrays, and only measured scores if available.`,
          metadata: {
            executor: this.state.executor,
            implementation: this.state.phaseResults['2_development']?.implementation,
          },
        };

        const result = await TerminalSpawner.spawnAgent(agent.replace('@', ''), 'quality-review', {
          context,
          timeout: DEFAULT_TIMEOUT_MS / 4, // 30 minutes
          debug: this.options.debug,
        });

        // Story 12.6: Emit terminal spawn for observability (AC1)
        if (result.pid) {
          this._emitTerminalSpawn(agent, result.pid, 'quality_gate');
        }

        const review = agentPayload(result).review_result;
        if (result.success && (!['APPROVED', 'NEEDS_WORK'].includes(review?.verdict) || !Array.isArray(review.findings) || !Array.isArray(review.recommendations))) {
          return pendingExecution('Reviewer exited without a structured verdict; approval is still required', result);
        }
        return {
          status: result.success && review?.verdict === 'APPROVED' ? PhaseStatus.COMPLETED : PhaseStatus.FAILED,
          review_result: review || null,
          output: result.output,
        };
      }

      // Fallback
      return pendingExecution('Terminal spawning not available, manual review required');
    } catch (error) {
      return {
        status: PhaseStatus.FAILED,
        error: error.message,
      };
    }
  }

  /**
   * Executes Phase 5: Push & PR
   * @param {Object} phase - Phase configuration
   * @param {string} agent - Agent ID (@devops)
   * @param {string} storyPath - Path to story file
   * @returns {Promise<Object>} Phase result
   */
  async executePushPhase(phase, agent, storyPath) {
    try {
      if (this.options.debug) {
        console.log(`[WorkflowExecutor] Spawning ${agent} for push`);
      }

      // Story 12.6: Emit agent spawn for observability (AC1)
      this._emitAgentSpawn(agent, 'push');

      // Use terminal spawning
      if (phase.spawn_in_terminal && TerminalSpawner.isSpawnerAvailable()) {
        const context = {
          story: storyPath,
          files: [],
          instructions: `Execute *pre-push and *push for story: ${storyPath}. Return JSON with actual push_result.commit_hash, push_result.branch and pr_url; never claim publication without execution evidence.`,
          metadata: {
            review_result: this.state.phaseResults['4_quality_gate']?.review_result,
          },
        };

        const result = await TerminalSpawner.spawnAgent(agent.replace('@', ''), 'push-and-pr', {
          context,
          timeout: DEFAULT_TIMEOUT_MS / 12, // 10 minutes
          debug: this.options.debug,
        });

        // Story 12.6: Emit terminal spawn for observability (AC1)
        if (result.pid) {
          this._emitTerminalSpawn(agent, result.pid, 'push');
        }

        const publication = agentPayload(result);
        if (result.success && !await this.verifyPublication(publication)) {
          return pendingExecution('Publication could not be verified against the remote branch and PR; review is required', result);
        }
        return {
          status: result.success ? PhaseStatus.COMPLETED : PhaseStatus.FAILED,
          push_result: publication.push_result || null,
          pr_url: publication.pr_url || null,
          output: result.output,
        };
      }

      // Fallback
      return pendingExecution('Terminal spawning not available, manual push required');
    } catch (error) {
      return {
        status: PhaseStatus.FAILED,
        error: error.message,
      };
    }
  }

  /**
   * Executes Phase 6: Checkpoint (Human Decision)
   * @param {Object} phase - Phase configuration
   * @param {string} agent - Agent ID (@po)
   * @param {string} storyPath - Path to story file
   * @returns {Promise<Object>} Phase result
   */
  async executeCheckpointPhase(phase, agent, storyPath) {
    if (this.options.debug) {
      console.log('[WorkflowExecutor] Checkpoint reached - awaiting human decision');
    }

    let response = this.state.checkpointResponse;
    delete this.state.checkpointResponse;
    if (!response && typeof this.options.checkpointHandler === 'function') {
      response = await this.options.checkpointHandler({ phase, agent, storyPath, state: this.state });
    }
    if (typeof response === 'string') response = { decision: response };
    if (response && !Object.values(CheckpointDecision).includes(response.decision)) {
      return { status: PhaseStatus.FAILED, error: `Invalid checkpoint decision: ${response.decision}` };
    }
    const awaitingInput = !response || response.decision === CheckpointDecision.REVIEW;
    return {
      status: awaitingInput ? PhaseStatus.WAITING : PhaseStatus.COMPLETED,
      decision: response?.decision || null,
      next_story: response?.next_story || null,
      awaiting_input: awaitingInput,
      review_requested: response?.decision === CheckpointDecision.REVIEW,
      options: {
        GO: 'Continue to next story',
        PAUSE: 'Save state and stop',
        REVIEW: 'Show what was done',
        ABORT: 'Stop the epic',
      },
    };
  }

  async submitCheckpointDecision(storyPath, decision, nextStory = null) {
    if (!Object.values(CheckpointDecision).includes(decision)) throw new Error('Invalid checkpoint decision');
    await this.initializeState(storyPath);
    if (!['6_checkpoint', 'workflow_paused'].includes(this.state.currentPhase)) {
      throw new Error('Workflow is not waiting at a checkpoint');
    }
    this.state.currentPhase = '6_checkpoint';
    this.state.checkpointResponse = { decision, next_story: nextStory, submitted_at: new Date().toISOString() };
    await this.saveState();
  }

  /**
   * Gets the next phase based on current phase result
   * @param {string} currentPhase - Current phase ID
   * @param {Object} result - Phase result
   * @returns {string|null} Next phase ID or null
   */
  getNextPhase(currentPhase, result) {
    const phase = this.workflow.workflow.phases[currentPhase];

    if (!phase) return null;

    if (result.status === PhaseStatus.COMPLETED) {
      // Handle checkpoint decisions
      if (currentPhase === '6_checkpoint') {
        switch (result.decision) {
          case CheckpointDecision.GO:
            return null; // Finish this story; caller schedules an explicit next_story.
          case CheckpointDecision.PAUSE:
            return 'workflow_paused';
          case CheckpointDecision.ABORT:
            return 'workflow_aborted';
          case CheckpointDecision.REVIEW:
            return '6_checkpoint'; // Stay at checkpoint after review
          default:
            return null;
        }
      }
      return phase.on_success;
    }

    if (result.status === PhaseStatus.SKIPPED) {
      return phase.on_skip || phase.on_success;
    }

    return null;
  }

  /**
   * Gets the error handler for a phase
   * @param {string} phaseId - Phase ID
   * @param {Object} result - Phase result
   * @returns {string} Error handler ID
   */
  getErrorHandler(phaseId, _result) {
    const phase = this.workflow.workflow.phases[phaseId];
    return phase?.on_failure || 'default_error_handler';
  }

  /**
   * Handles workflow errors
   * @param {string} handlerId - Error handler ID
   * @param {Object} result - Phase result
   * @returns {Promise<Object>} Handler result
   */
  async handleError(handlerId, _result) {
    const handler = this.workflow.workflow.error_handlers?.[handlerId];

    if (!handler) {
      return { retry: false, nextPhase: null };
    }

    // Check max attempts
    const maxAttempts = handler.actions?.find((a) => a.max_attempts)?.max_attempts || 3;
    if (this.state.attemptCount >= maxAttempts) {
      return { retry: false, nextPhase: null, escalate: true };
    }

    // Determine action
    if (handlerId === 'return_to_development') {
      return { retry: false, nextPhase: '2_development' };
    }

    if (handlerId === 'return_to_quality_gate') {
      return { retry: false, nextPhase: '4_quality_gate' };
    }

    return { retry: true };
  }
}

/**
 * Creates a new workflow executor instance
 * @param {string} projectRoot - Project root directory
 * @param {Object} options - Executor options
 * @returns {WorkflowExecutor} Workflow executor instance
 */
function createWorkflowExecutor(projectRoot, options = {}) {
  return new WorkflowExecutor(projectRoot, options);
}

/**
 * Executes the development cycle for a story
 * @param {string} storyPath - Path to story file
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Execution result
 */
async function executeDevelopmentCycle(storyPath, options = {}) {
  const projectRoot = options.projectRoot || process.cwd();
  const executor = new WorkflowExecutor(projectRoot, options);
  return executor.execute(storyPath, options.epicContext || {});
}

module.exports = {
  WorkflowExecutor,
  createWorkflowExecutor,
  executeDevelopmentCycle,
  PhaseStatus,
  CheckpointDecision,
  DEFAULT_TIMEOUT_MS,
  CHECKPOINT_TIMEOUT_MS,
};
