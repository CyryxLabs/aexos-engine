'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { verifyTaskOutcome } = require(path.resolve(__dirname, '../../../.aexos-core/core/execution/outcome-verifier'));
const { AgentRuntime } = require(path.resolve(__dirname, '../../../.aexos-core/core/execution/agent-runtime'));

describe('required outcome acceptance', () => {
  let root;
  let contract;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-outcome-test-'));
    contract = { contractVersion: 1, inputs: [], produces: [{ name: 'report', kind: 'file', path: 'report.md' }],
      verify: [{ type: 'file-exists', target: 'report.md' }] };
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  const evaluate = (root, contract, produced = ['report.md'], options = {}) => verifyTaskOutcome({
    contract, produced, success: true,
  }, { projectRoot: root, ...options });

  test('requires both a reported and an existing artifact', async () => {
    await expect(evaluate(root, contract, [])).rejects.toMatchObject({ code: 'OUTCOME_OUTPUT_MISSING' });
    await expect(evaluate(root, contract)).rejects.toMatchObject({ code: 'ENOENT' });
    fs.writeFileSync(path.join(root, 'report.md'), 'verified content');
    await expect(evaluate(root, contract)).resolves.toMatchObject({ verdict: 'ACCEPTED', checks: [{ passed: true }] });
  });
  test('rejects wrong kinds and undeclared outputs', async () => {
    fs.mkdirSync(path.join(root, 'report.md'));
    await expect(evaluate(root, contract)).rejects.toMatchObject({ code: 'OUTCOME_OUTPUT_KIND' });
    await expect(evaluate(root, contract, ['other.md'])).rejects.toMatchObject({ code: 'TASK_OUTPUT_UNDECLARED' });
  });
  test('rejects outside-root verification paths', async () => {
    contract.produces = [];
    contract.verify = [{ type: 'file-exists', target: '../outside.md' }];
    await expect(evaluate(root, contract, [])).rejects.toMatchObject({ code: 'OUTCOME_PATH_OUTSIDE' });
  });
  test('rejects parent junctions as well as symlink leaves', async () => {
    fs.mkdirSync(path.join(root, 'safe'));
    fs.writeFileSync(path.join(root, 'safe', 'report.md'), 'data');
    fs.symlinkSync(path.join(root, 'safe'), path.join(root, 'link'), 'junction');
    contract.produces[0].path = 'link/report.md';
    await expect(evaluate(root, contract, ['link/report.md'])).rejects.toMatchObject({ code: 'OUTCOME_PATH_SYMLINK' });
  });
  test('requires trusted adapters and exact boolean pass', async () => {
    contract.produces = [];
    contract.verify = [{ type: 'command', target: 'do-not-execute' }];
    await expect(evaluate(root, contract, [])).rejects.toMatchObject({ code: 'OUTCOME_VERIFIER_REQUIRED' });
    await expect(evaluate(root, contract, [], { verifiers: { command: async () => 'PASS' } }))
      .rejects.toMatchObject({ code: 'OUTCOME_CHECK_FAILED' });
    await expect(evaluate(root, contract, [], { verifiers: { command: async () => true } }))
      .resolves.toMatchObject({ verdict: 'ACCEPTED' });
  });
  test('rejects output bytes changed while an awaited verifier is running', async () => {
    fs.writeFileSync(path.join(root, 'report.md'), 'checked bytes');
    contract.verify = [{ type: 'checklist', ref: 'check-bytes' }];
    await expect(evaluate(root, contract, ['report.md'], { verifiers: { checklist: async (_check, context) => {
      expect(context.artifacts[0]).toMatchObject({ sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        identity: { dev: expect.any(String), ino: expect.any(String) } });
      await Promise.resolve();
      fs.writeFileSync(path.join(root, 'report.md'), 'changed after check');
      return true;
    } } })).rejects.toMatchObject({ code: 'OUTCOME_ARTIFACT_CHANGED' });
  });
  test('resolves template output paths but rejects unresolved checks', async () => {
    fs.writeFileSync(path.join(root, 'report.md'), 'content');
    contract.produces[0].path = '{name}.md';
    await expect(evaluate(root, contract)).resolves.toMatchObject({ verdict: 'ACCEPTED' });
    contract.verify[0].target = '{name}.md';
    await expect(evaluate(root, contract)).rejects.toMatchObject({ code: 'OUTCOME_PATH_INVALID' });
  });
  test('result-status cannot accept failed execution or arbitrary expected text', async () => {
    contract.produces = [];
    contract.verify = [{ type: 'result-status', expected: 'approved' }];
    await expect(evaluate(root, contract, [])).rejects.toMatchObject({ code: 'OUTCOME_CHECK_FAILED' });
    await expect(verifyTaskOutcome({ contract, success: false, produced: [] }, { projectRoot: root }))
      .rejects.toMatchObject({ code: 'OUTCOME_EXECUTION_FAILED' });
  });

  function runtime(provider) {
    const governance = { evaluate: jest.fn(() => ({ token: 'test', story: {} })),
      verify: jest.fn(() => ({})), settle: jest.fn() };
    return { runtime: new AgentRuntime({ provider, projectRoot: root, governanceController: governance }), governance };
  }
  test('missing contract prevents any provider call', async () => {
    const provider = { execute: jest.fn() };
    const { runtime: agent } = runtime(provider);
    await expect(agent.execute({ agentId: 'dev', task: 'test', prompt: 'test', requireAcceptance: true }))
      .rejects.toMatchObject({ code: 'OUTCOME_CONTRACT_REQUIRED' });
    expect(provider.execute).not.toHaveBeenCalled();
  });
  test('provider cannot weaken acceptance and failure still settles actual cost', async () => {
    const provider = { execute: async (_prompt, options) => {
      options.request.contract.produces = [];
      options.request.contract.verify = [{ type: 'result-status', expected: true }];
      return { success: true, produced: [], metadata: { costUsd: 0.01 } };
    } };
    const { runtime: agent, governance } = runtime(provider);
    await expect(agent.execute({ agentId: 'dev', task: 'test', prompt: 'test', contract, requireAcceptance: true }))
      .rejects.toMatchObject({ code: 'OUTCOME_OUTPUT_MISSING' });
    expect(governance.settle).toHaveBeenCalledWith({}, 0.01);
  });
  test('legacy execution receives no acceptance claim', async () => {
    const { runtime: agent } = runtime({ execute: async () => ({ success: true }) });
    const result = await agent.execute({ agentId: 'dev', task: 'test', prompt: 'test' });
    expect(result.acceptance).toBeUndefined();
  });
  test('runtime attaches acceptance only after required artifact checks pass', async () => {
    fs.writeFileSync(path.join(root, 'report.md'), 'accepted output');
    const { runtime: agent, governance } = runtime({ execute: async () => ({ success: true, produced: ['report.md'] }) });
    const result = await agent.execute({ agentId: 'dev', task: 'test', prompt: 'test', contract, requireAcceptance: true });
    expect(result.acceptance).toMatchObject({ verdict: 'ACCEPTED', evidenceLevel: 'declared-checks-passed' });
    expect(governance.settle).toHaveBeenCalledTimes(1);
  });
});
