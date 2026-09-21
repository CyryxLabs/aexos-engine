/**
 * Epic Executors Tests
 *
 * Story: 0.3 - Epic Executors
 * Epic: Epic 0 - ADE Master Orchestrator
 *
 * Tests for all epic executor classes.
 *
 * @author @dev (Vulcan)
 * @version 1.0.0
 */

const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const { AgentInvoker } = require('../../.aexos-core/core/orchestration/agent-invoker');

const {
  EpicExecutor,
  Epic3Executor,
  Epic4Executor,
  Epic5Executor,
  Epic6Executor,
  ExecutionStatus,
  RecoveryStrategy,
  QAVerdict,
  createExecutor,
  hasExecutor,
  getAvailableEpics,
  EXECUTOR_MAP,
} = require('../../.aexos-core/core/orchestration/executors');

describe('Epic Executors (Story 0.3)', () => {
  let tempDir;
  let mockOrchestrator;

  async function configureAgentExecutor(taskNames, handler) {
    const tasksDir = path.join(tempDir, '.aexos-core', 'development', 'tasks');
    await fs.ensureDir(tasksDir);
    await fs.copy(path.resolve(__dirname, '../../.aexos-core/development/agents'),
      path.join(tempDir, '.aexos-core/development/agents'));
    for (const taskName of taskNames) {
      await fs.writeFile(path.join(tasksDir, taskName), `# ${taskName}\n`);
    }

    mockOrchestrator.invokeAgent = handler;
    const invoker = new AgentInvoker({
      projectRoot: tempDir,
      executor: handler,
      maxRetries: 0,
      validateOutput: true,
    });
    mockOrchestrator.invokeAgentForTask = (agentName, taskPath, inputs) =>
      invoker.invokeAgent(agentName, taskPath, inputs);
  }

  async function writeGate(gate, options = {}) {
    const gatePath = path.join(tempDir, '.aexos', 'qa', `${gate.toLowerCase()}.yml`);
    await fs.outputFile(
      gatePath,
      [
        'schema: 1',
        'story: TEST-001',
        `gate: ${gate}`,
        'reviewer: Argus',
        'reviewed_revision: deterministic-test-revision',
        ...(options.waiver || []),
      ].join('\n'),
    );
    return gatePath;
  }

  beforeEach(async () => {
    // Create temp directory
    tempDir = path.join(os.tmpdir(), `epic-executors-test-${Date.now()}`);
    await fs.ensureDir(tempDir);

    // Create mock orchestrator
    mockOrchestrator = {
      projectRoot: tempDir,
      storyId: 'TEST-001',
      maxRetries: 3,
      _log: jest.fn(),
    };
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  describe('EpicExecutor Base Class (AC1)', () => {
    it('should create instance with orchestrator and epic number', () => {
      const executor = new EpicExecutor(mockOrchestrator, 3);

      expect(executor.orchestrator).toBe(mockOrchestrator);
      expect(executor.epicNum).toBe(3);
      expect(executor.status).toBe(ExecutionStatus.PENDING);
    });

    it('should throw error on execute() - abstract method', async () => {
      const executor = new EpicExecutor(mockOrchestrator, 3);

      await expect(executor.execute({})).rejects.toThrow('must implement execute()');
    });

    it('should return standardized result (AC7)', () => {
      const executor = new EpicExecutor(mockOrchestrator, 3);
      executor.status = ExecutionStatus.SUCCESS;
      executor.startTime = new Date().toISOString();
      executor.endTime = new Date().toISOString();

      const result = executor.getResult();

      expect(result.epicNum).toBe(3);
      expect(result.status).toBe(ExecutionStatus.SUCCESS);
      expect(result.success).toBe(true);
      expect(result.artifacts).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it('should track artifacts', () => {
      const executor = new EpicExecutor(mockOrchestrator, 3);

      executor._addArtifact('file', '/path/to/file.md', { size: 100 });

      expect(executor.artifacts).toHaveLength(1);
      expect(executor.artifacts[0].type).toBe('file');
      expect(executor.artifacts[0].path).toBe('/path/to/file.md');
      expect(executor.artifacts[0].size).toBe(100);
    });

    it('should track logs', () => {
      const executor = new EpicExecutor(mockOrchestrator, 3);

      executor._log('Test message', 'info');
      executor._log('Error message', 'error');

      expect(executor.logs).toHaveLength(2);
      expect(executor.logs[0].message).toBe('Test message');
      expect(executor.logs[1].level).toBe('error');
    });

    it('should calculate duration', () => {
      const executor = new EpicExecutor(mockOrchestrator, 3);
      executor.startTime = new Date(Date.now() - 5000).toISOString();
      executor.endTime = new Date().toISOString();

      const duration = executor._getDuration();
      const durationMs = executor._getDurationMs();

      expect(duration).toBe('5s');
      expect(durationMs).toBeGreaterThanOrEqual(4900);
      expect(durationMs).toBeLessThanOrEqual(5100);
    });
  });

  describe('Epic3Executor - Spec Pipeline (AC2)', () => {
    let executor;

    beforeEach(() => {
      executor = new Epic3Executor(mockOrchestrator);
    });

    it('should create instance with epic number 3', () => {
      expect(executor.epicNum).toBe(3);
    });

    it('should block when no real agent executor is configured', async () => {
      const result = await executor.execute({
        storyId: 'TEST-001',
        source: 'story',
      });

      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.pendingRequirements).toBeDefined();
    });

    it('should use the configured agent adapter and require a real spec artifact', async () => {
      await configureAgentExecutor(
        [
          'spec-gather-requirements.md',
          'spec-assess-complexity.md',
          'spec-research-dependencies.md',
          'spec-write-spec.md',
          'spec-critique.md',
        ],
        async (_agent, task) => {
          if (task.name === 'spec-write-spec') {
            const specPath = path.join(tempDir, 'docs', 'stories', 'TEST-001', 'spec', 'spec.md');
            await fs.ensureDir(path.dirname(specPath));
            await fs.writeFile(specPath, '# Real Spec\n');
            return { success: true, specPath };
          }
          if (task.name === 'spec-gather-requirements') {
            return { success: true, requirements: ['REQ-1'] };
          }
          if (task.name === 'spec-assess-complexity') {
            return { success: true, complexity: 'STANDARD' };
          }
          return { success: true };
        },
      );

      const result = await executor.execute({ storyId: 'TEST-001', source: 'story' });

      expect(result.success).toBe(true);
      expect(result.complexity).toBe('STANDARD');
      expect(result.requirements).toEqual(['REQ-1']);
      expect(await fs.pathExists(result.specPath)).toBe(true);
    });

    it('should fail without storyId', async () => {
      const result = await executor.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('storyId');
    });

    it('should reuse existing spec', async () => {
      // Create existing spec
      const specPath = path.join(tempDir, 'docs', 'stories', 'TEST-001', 'spec.md');
      await fs.ensureDir(path.dirname(specPath));
      await fs.writeFile(specPath, '# Existing Spec');

      const result = await executor.execute({
        storyId: 'TEST-001',
        source: 'story',
      });

      expect(result.success).toBe(true);
      expect(result.reused).toBe(true);
    });

    it('should reject an empty existing spec instead of reusing it', async () => {
      const specPath = path.join(tempDir, 'docs', 'stories', 'TEST-001', 'spec.md');
      await fs.outputFile(specPath, '');

      const result = await executor.execute({ storyId: 'TEST-001', source: 'story' });

      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
    });

    it('should resolve a reported relative spec path from the consumer root', async () => {
      await configureAgentExecutor(
        [
          'spec-gather-requirements.md',
          'spec-assess-complexity.md',
          'spec-research-dependencies.md',
          'spec-write-spec.md',
          'spec-critique.md',
        ],
        async (_agent, task) => {
          if (task.name === 'spec-write-spec') {
            const relative = 'generated/custom-spec.md';
            await fs.outputFile(path.join(tempDir, relative), '# Consumer spec\n');
            return { success: true, specPath: relative };
          }
          return { success: true };
        },
      );

      const result = await executor.execute({ storyId: 'TEST-001', source: 'story' });

      expect(result.success).toBe(true);
      expect(result.specPath).toBe(path.join(tempDir, 'generated', 'custom-spec.md'));
    });
  });

  describe('Epic4Executor - Execution Engine (AC3)', () => {
    let executor;

    beforeEach(() => {
      executor = new Epic4Executor(mockOrchestrator);
    });

    it('should create instance with epic number 4', () => {
      expect(executor.epicNum).toBe(4);
    });

    it('should block rather than fabricate a plan', async () => {
      const result = await executor.execute({
        storyId: 'TEST-001',
        specPath: '/path/to/spec.md',
        complexity: 'STANDARD',
      });

      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.error).toContain('implementation plan');
    });

    it('should execute real plan subtasks through the configured adapter', async () => {
      const planPath = path.join(
        tempDir,
        'docs',
        'stories',
        'TEST-001',
        'plan',
        'implementation.yaml',
      );
      await fs.ensureDir(path.dirname(planPath));
      await fs.writeFile(
        planPath,
        [
          'storyId: TEST-001',
          'phases:',
          '  - id: 1',
          '    name: Implement',
          '    subtasks:',
          '      - id: "1.1"',
          '        description: Write implementation',
          '        status: pending',
        ].join('\n'),
      );
      await configureAgentExecutor(
        ['plan-execute-subtask.md', 'qa-run-tests.md'],
        async (_agent, task) => {
          if (task.name === 'plan-execute-subtask') {
            const created = path.join(tempDir, 'src', 'real-change.js');
            await fs.ensureDir(path.dirname(created));
            await fs.writeFile(created, 'module.exports = true;\n');
            return { success: true, verified: true, files: [created] };
          }
          return { success: true, passed: true, command: 'focused-test' };
        },
      );

      const result = await executor.execute({ storyId: 'TEST-001', specPath: '/spec.md' });

      expect(result.success).toBe(true);
      expect(result.progress).toEqual({ total: 1, completed: 1, failed: 0 });
      expect(result.testResults).toMatchObject({ passed: true, command: 'focused-test' });
      expect(result.codeChanges).toHaveLength(1);
      expect(await fs.readFile(planPath, 'utf8')).toContain('status: completed');
    });

    it('should lazy-load the named plan runtime helpers', () => {
      expect(typeof executor._getPlanTracker()).toBe('function');
      expect(typeof executor._getSubtaskVerifier()).toBe('function');
    });

    it('should block when a subtask reports an artifact that does not exist', async () => {
      const planPath = path.join(tempDir, 'docs', 'stories', 'TEST-001', 'plan', 'implementation.yaml');
      await fs.outputFile(
        planPath,
        'storyId: TEST-001\nphases:\n  - id: 1\n    subtasks:\n      - id: "1.1"\n        status: pending\n',
      );
      await configureAgentExecutor(
        ['plan-execute-subtask.md', 'qa-run-tests.md'],
        async (_agent, task) => task.name === 'plan-execute-subtask'
          ? { success: true, verified: true, files: ['ghost.js'] }
          : { success: true, passed: true },
      );

      const result = await executor.execute({ storyId: 'TEST-001' });

      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      expect(await fs.readFile(planPath, 'utf8')).toContain('status: pending');
    });
  });

  describe('Epic5Executor - Recovery System (AC4)', () => {
    let executor;

    beforeEach(() => {
      executor = new Epic5Executor(mockOrchestrator);
    });

    it('should create instance with epic number 5', () => {
      expect(executor.epicNum).toBe(5);
    });

    it('should execute recovery for failed epic', async () => {
      const result = await executor.execute({
        storyId: 'TEST-001',
        failedEpic: 4,
        error: new Error('Test failure'),
        attempts: 0,
      });

      expect(result.success).toBe(true);
      expect(result.strategy).toBeDefined();
      expect(result.shouldRetry).toBeDefined();
    });

    it('should escalate after max attempts', async () => {
      const result = await executor.execute({
        storyId: 'TEST-001',
        failedEpic: 4,
        error: new Error('Persistent failure'),
        attempts: 5,
      });

      expect(result.strategy).toBe(RecoveryStrategy.ESCALATE_TO_HUMAN);
      expect(result.escalated).toBe(true);
    });

    it('should create escalation report', async () => {
      const result = await executor.execute({
        storyId: 'TEST-001',
        failedEpic: 4,
        error: new Error('Critical failure'),
        attempts: 5,
      });

      expect(result.recoveryResult.reportPath).toBeDefined();
      expect(await fs.pathExists(result.recoveryResult.reportPath)).toBe(true);
    });

    it('should lazy-load the named recovery runtime helpers', () => {
      expect(typeof executor._getStuckDetector()).toBe('function');
      expect(typeof executor._getRollbackManager()).toBe('function');
    });

    it('should block rollback recovery without a failed subtask identifier', async () => {
      const result = await executor.execute({
        storyId: 'TEST-001',
        failedEpic: 4,
        error: new Error('Cannot find module dependency'),
        attempts: 1,
      });

      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.pendingRequirements).toContain('context.subtaskId or context.failedSubtask');
    });

    it('should fail when required recovery context is absent', async () => {
      const result = await executor.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('storyId');
    });
  });

  describe('Epic6Executor - QA Loop (AC5)', () => {
    let executor;

    beforeEach(() => {
      executor = new Epic6Executor(mockOrchestrator);
    });

    it('should create instance with epic number 6', () => {
      expect(executor.epicNum).toBe(6);
    });

    it('should block when no real QA executor is configured', async () => {
      const result = await executor.execute({
        storyId: 'TEST-001',
        buildResult: {},
        testResults: [],
      });

      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.pendingRequirements).toContain('Successful real QA agent execution');
    });

    it('should accept a canonical PASS gate with persisted revision evidence', async () => {
      const gatePath = await writeGate('PASS');
      await configureAgentExecutor(['qa-review-story.md'], async () => ({
        success: true,
        gate: 'PASS',
        gatePath,
        issues: [],
      }));

      const result = await executor.execute({
        storyId: 'TEST-001',
        buildResult: {},
      });

      expect(result.success).toBe(true);
      expect(result.verdict).toBe(QAVerdict.APPROVED);
      expect(result.gatePath).toBe(gatePath);
      expect(result.reportPath).toBeDefined();
      expect(await fs.pathExists(result.reportPath)).toBe(true);
    });

    it('should reject PASS without a persisted canonical gate', async () => {
      await configureAgentExecutor(['qa-review-story.md'], async () => ({
        success: true,
        gate: 'PASS',
        gatePath: path.join(tempDir, 'missing-gate.yml'),
      }));

      const result = await executor.execute({ storyId: 'TEST-001', buildResult: {} });

      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
    });

    it('should reject WAIVED without active approval evidence', async () => {
      const gatePath = await writeGate('WAIVED', {
        waiver: ['waiver:', '  active: true', '  reason: accepted risk'],
      });
      await configureAgentExecutor(['qa-review-story.md'], async () => ({
        success: true,
        gate: 'WAIVED',
        gatePath,
      }));

      const result = await executor.execute({ storyId: 'TEST-001', buildResult: {} });

      expect(result.success).toBe(false);
      expect(result.error).toContain('approver');
    });

    it('should accept WAIVED only with active reason and approver evidence', async () => {
      const gatePath = await writeGate('WAIVED', {
        waiver: [
          'waiver:',
          '  active: true',
          '  reason: accepted bounded risk',
          '  approved_by: product-owner',
        ],
      });
      await configureAgentExecutor(['qa-review-story.md'], async () => ({
        success: true,
        gate: 'WAIVED',
        gatePath,
      }));

      const result = await executor.execute({ storyId: 'TEST-001', buildResult: {} });

      expect(result.success).toBe(true);
      expect(result.gatePath).toBe(gatePath);
    });

    it('should preserve canonical CONCERNS as a completed non-blocking gate', async () => {
      const gatePath = await writeGate('CONCERNS');
      await configureAgentExecutor(['qa-review-story.md'], async () => ({
        success: true,
        gate: 'CONCERNS',
        gatePath,
        issues: [{ severity: 'medium', type: 'risk', message: 'follow-up recommended' }],
      }));

      const result = await executor.execute({ storyId: 'TEST-001', buildResult: {} });

      expect(result.success).toBe(true);
      expect(result.verdict).toBe(QAVerdict.APPROVED);
      expect(result.reviewHistory[0].gate).toBe('CONCERNS');
    });

    it('should block when the canonical gate remains FAIL', async () => {
      executor.maxIterations = 1;
      const gatePath = await writeGate('FAIL');
      await configureAgentExecutor(['qa-review-story.md'], async () => ({
        success: true,
        gate: 'FAIL',
        gatePath,
        issues: [{ severity: 'high', type: 'correctness', message: 'blocking defect' }],
      }));

      const result = await executor.execute({ storyId: 'TEST-001', buildResult: {} });

      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.verdict).toBe(QAVerdict.NEEDS_REVISION);
    });

    it('should lazy-load the named QA runtime helper', () => {
      expect(typeof executor._getQAOrchestrator()).toBe('function');
    });
  });

  describe('Factory Functions', () => {
    it('should create executor with createExecutor()', () => {
      const executor = createExecutor(3, mockOrchestrator);

      expect(executor).toBeInstanceOf(Epic3Executor);
      expect(executor.epicNum).toBe(3);
    });

    it('should throw for unknown epic number', () => {
      expect(() => createExecutor(99, mockOrchestrator)).toThrow('No executor found');
    });

    it('should check executor existence with hasExecutor()', () => {
      expect(hasExecutor(3)).toBe(true);
      expect(hasExecutor(6)).toBe(true);
      expect(hasExecutor(99)).toBe(false);
    });

    it('should return available epics', () => {
      const epics = getAvailableEpics();

      expect(epics).toContain(3);
      expect(epics).toContain(4);
      expect(epics).toContain(5);
      expect(epics).toContain(6);
    });
  });

  describe('Enums', () => {
    it('should export ExecutionStatus enum', () => {
      expect(ExecutionStatus.PENDING).toBe('pending');
      expect(ExecutionStatus.RUNNING).toBe('running');
      expect(ExecutionStatus.SUCCESS).toBe('success');
      expect(ExecutionStatus.FAILED).toBe('failed');
    });

    it('should export RecoveryStrategy enum', () => {
      expect(RecoveryStrategy.RETRY_SAME_APPROACH).toBe('retry_same_approach');
      expect(RecoveryStrategy.ESCALATE_TO_HUMAN).toBe('escalate_to_human');
    });

    it('should export QAVerdict enum', () => {
      expect(QAVerdict.APPROVED).toBe('approved');
      expect(QAVerdict.NEEDS_REVISION).toBe('needs_revision');
      expect(QAVerdict.BLOCKED).toBe('blocked');
    });
  });

  describe('EXECUTOR_MAP', () => {
    it('should map all epic numbers to executor classes', () => {
      expect(EXECUTOR_MAP[3]).toBe(Epic3Executor);
      expect(EXECUTOR_MAP[4]).toBe(Epic4Executor);
      expect(EXECUTOR_MAP[5]).toBe(Epic5Executor);
      expect(EXECUTOR_MAP[6]).toBe(Epic6Executor);
    });
  });
});

describe('Standardized Results (AC7)', () => {
  let tempDir;
  let mockOrchestrator;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `executor-results-test-${Date.now()}`);
    await fs.ensureDir(tempDir);

    mockOrchestrator = {
      projectRoot: tempDir,
      storyId: 'TEST-001',
      _log: jest.fn(),
    };
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('all executors should return consistent result structure', async () => {
    const executors = [
      new Epic3Executor(mockOrchestrator),
      new Epic4Executor(mockOrchestrator),
      new Epic5Executor(mockOrchestrator),
      new Epic6Executor(mockOrchestrator),
    ];

    const contexts = [
      { storyId: 'TEST-001', source: 'story' },
      { storyId: 'TEST-001', specPath: '/path' },
      { storyId: 'TEST-001', failedEpic: 3, error: 'test', attempts: 0 },
      { storyId: 'TEST-001', buildResult: {} },
    ];

    for (let i = 0; i < executors.length; i++) {
      const result = await executors[i].execute(contexts[i]);

      // All results should have these fields
      expect(result).toHaveProperty('epicNum');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('artifacts');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('duration');
    }
  });
});
