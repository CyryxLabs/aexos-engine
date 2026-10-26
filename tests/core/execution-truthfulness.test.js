'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const MasterOrchestrator = require('../../.aexos-core/core/orchestration/master-orchestrator');
const { AgentInvoker } = require('../../.aexos-core/core/orchestration/agent-invoker');
let projectRoot;
beforeEach(() => { projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'execution-truth-')); });
afterEach(() => { fs.rmSync(projectRoot, { recursive: true, force: true }); });
function master(execute) {
  const instance = new MasterOrchestrator(projectRoot, { autoRecovery: false });
  instance.executors[3] = { execute };
  return instance;
}
function invoker(options = {}) {
  const instance = new AgentInvoker({ projectRoot, ...options });
  instance._loadAgent = async () => ({ name: 'dev', loaded: true });
  instance._loadTask = async () => ({ name: 'example' });
  instance._buildContext = () => ({});
  return instance;
}
it.each([{ success: false }, { status: 'stub' }, { status: 'simulated' }, undefined])('rejects unsuccessful epic result %j before completion', async (result) => {
  const instance = master(async () => result);
  const completed = jest.fn();
  const failed = jest.fn();
  instance.on('epicComplete', completed);
  instance.on('epicFailed', failed);
  expect((await instance.executeEpic(3)).success).toBe(false);
  expect(instance.executionState.epics[3].status).toBe(result?.status === 'stub' ? 'blocked' : 'failed');
  expect(completed).not.toHaveBeenCalled();
  expect(failed).toHaveBeenCalled();
});
it('propagates thrown errors without completion', async () => {
  const instance = master(async () => { throw new Error('adapter crashed'); });
  expect((await instance.executeEpic(3)).error).toBe('adapter crashed');
  expect(instance.executionState.epics[3].status).toBe('failed');
});
it('evaluates required gate before completion', async () => {
  const instance = master(async () => ({ success: true }));
  instance._inFullPipeline = true;
  instance._evaluateGate = jest.fn(async () => ({ verdict: 'BLOCK', gate: 'required' }));
  instance.gateEvaluator.shouldBlock = () => true;
  const completed = jest.fn();
  instance.on('epicComplete', completed);
  expect((await instance.executeEpic(3)).success).toBe(false);
  expect(instance.executionState.epics[3].status).toBe('blocked');
  expect(completed).not.toHaveBeenCalled();
});
it('completes real successful epic adapters', async () => {
  const instance = master(async () => ({ success: true }));
  expect((await instance.executeEpic(3)).success).toBe(true);
  expect(instance.executionState.epics[3].status).toBe('completed');
});
it('fails closed without an agent adapter', async () => {
  const result = await invoker().invokeAgent('dev', 'example');
  expect(result.success).toBe(false);
  expect(result.error).toContain('No agent executor configured');
});
it('labels explicitly requested simulation as nonexecution', async () => {
  const instance = invoker({ simulate: true });
  const result = await instance.invokeAgent('dev', 'example');
  expect(result).toMatchObject({ success: false, executed: false, simulated: true });
  expect(instance.invocations[0].status).toBe('simulated');
});
it('propagates unsuccessful agent adapter output', async () => {
  expect((await invoker({ executor: async () => ({ success: false }) }).invokeAgent('dev', 'example')).success).toBe(false);
});
it('accepts real successful agent output', async () => {
  expect((await invoker({ executor: async () => ({ success: true }) }).invokeAgent('dev', 'example')).success).toBe(true);
});

it.each(['git status; rm -rf target', 'ls > output.txt', 'git status && unknown-command', 'ls$(touch file)', 'git status-pretend'])('does not whitelist shell composition or prefix collision: %s', (command) => {
  const { OperationGuard } = require('../../.aexos-core/core/permissions/operation-guard');
  expect(new OperationGuard({}).classifyBashCommand(command)).not.toBe('read');
});
it('does not classify an unknown tool as read', () => {
  const { OperationGuard } = require('../../.aexos-core/core/permissions/operation-guard');
  expect(new OperationGuard({}).classifyOperation('UnknownTool', {})).toBe('execute');
});
it.each(['find . -delete', 'env node -e process.exit(0)', 'npm audit fix', 'git branch qa-probe-name', 'gh api repos/owner/repo -X DELETE', 'curl -I --output local-file http://localhost', 'git diff --output=file'])('does not whitelist mutating command arguments: %s', (command) => {
  const { OperationGuard } = require('../../.aexos-core/core/permissions/operation-guard');
  expect(new OperationGuard({}).classifyBashCommand(command)).not.toBe('read');
});
it.each([{ success: true, executed: false }, { success: true, simulated: true }, { status: 'cancelled' }, { status: 'skipped' }])('rejects nonexecution metadata %j in both dispatch layers', async (result) => {
  expect((await invoker({ executor: async () => result }).invokeAgent('dev', 'example')).success).toBe(false);
  const instance = master(async () => result);
  expect((await instance.executeEpic(3)).success).toBe(false);
  expect(instance.executionState.epics[3].status).not.toBe('completed');
});
