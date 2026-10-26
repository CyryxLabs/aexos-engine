'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const WorkflowOrchestrator = require(path.resolve(
  __dirname,
  '../../../.aexos-core/core/orchestration/workflow-orchestrator',
));
const { runGovernedWorkflow } = require(path.resolve(
  __dirname,
  '../../../.aexos-core/core/execution/workflow-runner',
));
const { createLocalPlanFixture } = require(path.resolve(
  __dirname,
  '../../helpers/local-plan-fixture',
));

describe('governed workflow logging boundary', () => {
  test('defaults to console and binds an explicitly supplied logger instance', () => {
    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    const defaulted = new WorkflowOrchestrator('unused-workflow.yml');
    defaulted._defaultPhaseStart({ phase: 1, phase_name: 'Start', agent: 'dev', action: 'run' });
    expect(consoleLog).toHaveBeenCalledTimes(2);
    consoleLog.mockRestore();

    const calls = [];
    const logger = { log(...args) { calls.push({ receiver: this, args }); } };
    const supplied = new WorkflowOrchestrator('unused-workflow.yml', { logger });
    supplied._defaultPhaseComplete({ phase: 1, creates: ['one', 'two'] }, { status: 'success' });
    expect(calls).toHaveLength(3);
    expect(calls.every((call) => call.receiver === logger)).toBe(true);
  });

  test.each([null, {}, { log: 'not-a-function' }, () => {}])(
    'rejects malformed supplied logger %# before execution',
    (logger) => {
      expect(() => new WorkflowOrchestrator('unused-workflow.yml', { logger }))
        .toThrow(expect.objectContaining({ code: 'WORKFLOW_LOGGER_INVALID' }));
    },
  );

  test('does not fall back to console when a supplied logger throws', () => {
    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    const logger = { log() { throw Object.assign(new Error('sink failed'), { code: 'TEST_SINK_FAILED' }); } };
    const orchestrator = new WorkflowOrchestrator('unused-workflow.yml', { logger });
    expect(() => orchestrator._defaultPhaseStart(
      { phase: 1, phase_name: 'Start', agent: 'dev', action: 'run' },
    )).toThrow(expect.objectContaining({ code: 'TEST_SINK_FAILED' }));
    expect(consoleLog).not.toHaveBeenCalled();
    consoleLog.mockRestore();
  });

  describe('runner diagnostic capture', () => {
    let base;
    let root;
    let control;
    let fixture;
    const run = () => runGovernedWorkflow({ ...fixture, projectRoot: root, controlRoot: control,
      frameworkRoot: path.resolve(__dirname, '../../..'), executor: 'local-plan' });

    beforeEach(() => {
      base = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-workflow-log-'));
      root = path.join(base, 'consumer');
      control = path.join(base, 'control');
      fs.mkdirSync(root);
      fs.mkdirSync(control);
      fixture = createLocalPlanFixture(root);
    });

    afterEach(() => {
      jest.restoreAllMocks();
      if (base && path.dirname(base) === fs.realpathSync(os.tmpdir())
        && path.basename(base).startsWith('aexos-workflow-log-')) {
        fs.rmSync(base, { recursive: true, force: true });
      }
    });

    test('captures actual runner and orchestrator diagnostics without console output', async () => {
      fixture.run.phases[0].estimatedCostUsd = 2;
      fixture.persist();
      const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
      const receipt = await run();
      expect(receipt.status).toBe('BLOCKED');
      expect(consoleLog).not.toHaveBeenCalled();
      expect(receipt.runtimeEvents).toContainEqual(expect.objectContaining({
        type: 'governance_rejected', code: 'DISPATCH_BUDGET_EXHAUSTED',
      }));
      expect(receipt.runtimeEvents).toContainEqual(expect.objectContaining({
        type: 'orchestrator_log', sequence: 1, truncated: false,
      }));
      expect(receipt.runtimeEvents.at(-1)).toMatchObject({
        type: 'orchestrator_log_summary', truncated: false,
      });
    });

    test('bounds multiline ANSI, oversized and repeated diagnostics with an explicit summary', async () => {
      const originalExecute = WorkflowOrchestrator.prototype.execute;
      WorkflowOrchestrator.prototype.execute = async function executeLoggingProbe() {
        this.logger.log('\u001b[31mfirst\nsecond\u001b[0m', 'x'.repeat(10_000), { secret: 'not-read' });
        for (let index = 0; index < 400; index += 1) this.logger.log(`record-${index}`);
        return { status: 'completed', confidenceGate: { passed: true } };
      };
      try {
        const receipt = await run();
        const logs = receipt.runtimeEvents.filter((event) => event.type === 'orchestrator_log');
        const summary = receipt.runtimeEvents.at(-1);
        expect(logs).toHaveLength(255);
        expect(logs[0].text).toContain('\u001b[31mfirst\nsecond\u001b[0m');
        expect(logs[0].text).not.toContain('secret');
        expect(Buffer.byteLength(logs[0].text, 'utf8')).toBeLessThanOrEqual(4096);
        expect(logs[0].truncated).toBe(true);
        expect(logs.reduce((total, event) => total + Buffer.byteLength(event.text, 'utf8'), 0))
          .toBeLessThanOrEqual(65536);
        expect(summary).toMatchObject({
          type: 'orchestrator_log_summary', retainedRecords: 255,
          truncated: true, truncatedRecords: 1, droppedRecords: 146,
          limits: { records: 256, recordBytes: 4096, aggregateBytes: 65536 },
        });
        expect(summary.droppedUtf8Bytes).toBeGreaterThan(0);
      } finally {
        WorkflowOrchestrator.prototype.execute = originalExecute;
      }
    });
  });
});
