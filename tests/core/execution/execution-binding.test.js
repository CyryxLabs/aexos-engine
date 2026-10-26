'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createExecutionBinding, assertExecutionBinding, selectedTask } = require(path.resolve(__dirname, '../../../.aexos-core/core/execution/execution-binding'));
const { createCapabilityBroker } = require(path.resolve(__dirname, '../../../.aexos-core/core/permissions/capability-broker'));

describe('selected SDLC execution bindings', () => {
  let root;
  let frameworkRoot;
  let broker;
  let spec;
  let operations;
  let leases;
  const phase = { id: 'implement', task: 'dev-develop-story', agent: 'dev' };

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-bind-')));
    frameworkRoot = path.join(root, 'installed-framework');
    const taskDir = path.join(frameworkRoot, '.aexos-core/development/tasks');
    fs.mkdirSync(taskDir, { recursive: true });
    fs.copyFileSync(path.resolve(__dirname, '../../../.aexos-core/development/tasks/dev-develop-story.md'), path.join(taskDir, 'dev-develop-story.md'));
    fs.writeFileSync(path.join(root, 'mission.md'), '# Story TEST-1\n\n## Status\n\nReady\n');
    broker = createCapabilityBroker({ policy: () => true });
    const task = selectedTask(phase.task, frameworkRoot, root);
    spec = {
      bindingVersion: 1, phaseId: phase.id, task: phase.task, agentId: phase.agent,
      projectRoot: root, story: 'mission.md', taskContractHash: task.taskContractHash,
      inputs: { story: 'mission.md', output: 'implementation.json', source: 'app.js' },
      requiredCapabilities: ['implementation.json', 'app.js'].map((name) => ({
        capability: 'filesystem', action: 'guarded-create', resource: path.join(root, name), scope: root,
      })),
      budgetScope: 'binding-test', budgetCeilingUsd: 1, estimatedCostUsd: 0, requireAcceptance: true,
    };
    operations = ['implementation.json', 'app.js'].map((target) => ({ operation: 'guarded-create', target, contentBase64: Buffer.from('verified fixture').toString('base64') }));
    leases = spec.requiredCapabilities.map((requirement) => broker.grant({ ...requirement, actions: [requirement.action], agentId: phase.agent, task: phase.task }));
  });

  afterEach(() => {
    if (root && path.dirname(root) === fs.realpathSync(os.tmpdir()) && path.basename(root).startsWith('aexos-bind-')) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  const make = () => createExecutionBinding(spec, { projectRoot: root, frameworkRoot, capabilityBroker: broker, leases, approvedFilesystemOperations: operations });
  const assert = (binding) => assertExecutionBinding(binding, { phase, projectRoot: root, frameworkRoot });

  it('loads external installed definitions, binds concrete outputs, and hides authority/content from JSON', () => {
    const binding = make();
    expect(assert(binding)).toBe(binding);
    expect(binding.contract.produces.map((output) => output.path)).toEqual(['implementation.json', 'app.js']);
    expect(binding.requireAcceptance).toBe(true);
    expect(Object.isFrozen(binding.requiredCapabilities[0])).toBe(true);
    expect(Object.isFrozen(binding.approvedFilesystemOperations[0])).toBe(true);
    const receipt = JSON.stringify(binding);
    expect(receipt).not.toContain(leases[0].token);
    expect(receipt).not.toContain(operations[0].contentBase64);
    expect(receipt).not.toContain(root.replace(/\\/g, '\\\\'));
  });

  it.each([
    ['owner', (s) => { s.agentId = 'qa'; }, 'BINDING_CONTRACT_MISMATCH'],
    ['contract', (s) => { s.taskContractHash = '0'.repeat(64); }, 'BINDING_CONTRACT_MISMATCH'],
    ['acceptance', (s) => { s.requireAcceptance = false; }, 'BINDING_INVALID'],
    ['budget', (s) => { s.budgetCeilingUsd = 0; }, 'BINDING_INVALID'],
    ['unknown property', (s) => { s.dispatchOverride = {}; }, 'BINDING_INVALID'],
    ['undeclared input', (s) => { s.inputs.unsafe = 'value'; }, 'BINDING_INPUT_UNDECLARED'],
    ['missing input', (s) => { delete s.inputs.source; }, 'BINDING_INPUT_REQUIRED'],
    ['traversal', (s) => { s.inputs.source = '../escape.js'; }, 'BINDING_PATH_INVALID'],
    ['absolute', (s) => { s.inputs.source = 'C:/escape.js'; }, 'BINDING_PATH_INVALID'],
    ['output collision', (s) => { s.inputs.source = s.inputs.output; }, 'BINDING_OUTPUT_COLLISION'],
    ['workspace', (s) => { s.projectRoot += '/other'; }, 'BINDING_ROOT_MISMATCH'],
    ['story input', (s) => { s.inputs.story = 'other.md'; }, 'BINDING_STORY_MISMATCH'],
    ['story overwrite', (s) => { s.inputs.source = s.story; }, 'BINDING_STORY_OUTPUT'],
  ])('rejects %s before dispatch', (_name, edit, code) => {
    edit(spec);
    expect(make).toThrow(expect.objectContaining({ code }));
  });

  it('rejects missing, forged and revoked capabilities through the real broker', () => {
    leases[0] = { token: 'forged' };
    expect(make).toThrow();
    leases = spec.requiredCapabilities.map((r) => broker.grant({ ...r, actions: [r.action], agentId: phase.agent, task: phase.task }));
    const binding = make();
    broker.revoke(leases[0].token);
    expect(() => assert(binding)).toThrow(expect.objectContaining({ code: 'CAPABILITY_REVOKED' }));
  });

  it('rejects unbranded JSON and changed task or story after preparation', () => {
    const binding = make();
    expect(() => assert({ ...binding })).toThrow(expect.objectContaining({ code: 'BINDING_UNTRUSTED' }));
    fs.writeFileSync(path.join(root, 'mission.md'), '# Story TEST-1\n\n## Status\n\nDone\n');
    expect(() => assert(binding)).toThrow(expect.objectContaining({ code: 'DISPATCH_STORY_STATUS' }));
    fs.appendFileSync(path.join(frameworkRoot, '.aexos-core/development/tasks/dev-develop-story.md'), '\nChanged definition\n');
    expect(() => assert(binding)).toThrow(expect.objectContaining({ code: 'BINDING_CONTRACT_CHANGED' }));
  });

  it('rejects operations without exact leases and duplicate approved operations', () => {
    operations[0].target = 'other.json';
    expect(make).toThrow(expect.objectContaining({ code: 'BINDING_OPERATION_CAPABILITY' }));
    operations[0].target = 'implementation.json';
    operations.push({ ...operations[0] });
    expect(make).toThrow(expect.objectContaining({ code: 'BINDING_OPERATION_DUPLICATE' }));
  });

  it('rejects a different still-Ready authority story after binding', () => {
    const binding = make();
    fs.writeFileSync(path.join(root, 'mission.md'), '# Story DIFFERENT-1\n\n## Status\n\nReady\n');
    expect(() => assert(binding)).toThrow(expect.objectContaining({ code: 'BINDING_STORY_CHANGED' }));
  });

  it('rejects extra writes even with an operator lease and rejects omitted publications', () => {
    const extra = { capability: 'filesystem', action: 'guarded-create', resource: path.join(root, 'unrelated.js'), scope: root };
    spec.requiredCapabilities.push(extra);
    leases.push(broker.grant({ ...extra, actions: [extra.action], agentId: phase.agent, task: phase.task }));
    operations.push({ operation: 'guarded-create', target: 'unrelated.js', contentBase64: 'YQ==' });
    expect(make).toThrow(expect.objectContaining({ code: 'BINDING_OPERATION_OUTPUT' }));
    operations.pop();
    operations.pop();
    expect(make).toThrow(expect.objectContaining({ code: 'BINDING_OUTPUT_OPERATION' }));
  });

  it('rejects symlink/junction ancestors and hardlinked source files', () => {
    const actual = path.join(root, 'actual');
    fs.mkdirSync(actual);
    fs.symlinkSync(actual, path.join(root, 'alias'), process.platform === 'win32' ? 'junction' : 'dir');
    spec.inputs.source = 'alias/app.js';
    expect(make).toThrow(expect.objectContaining({ code: 'BINDING_PATH_DENIED' }));
    fs.writeFileSync(path.join(root, 'original.js'), 'retained');
    fs.linkSync(path.join(root, 'original.js'), path.join(root, 'linked.js'));
    spec.inputs.source = 'linked.js';
    expect(make).toThrow(expect.objectContaining({ code: 'BINDING_PATH_DENIED' }));
  });
});
