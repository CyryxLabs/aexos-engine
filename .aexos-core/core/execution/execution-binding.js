'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Ajv = require('ajv');
const { loadTaskContract, normalizeTaskContract } = require(path.resolve(__dirname, 'task-contract'));
const { validateStoryBinding } = require(path.resolve(__dirname, '../permissions/dispatch-governance'));
const { inspectTarget } = require(path.resolve(__dirname, '../permissions/confined-filesystem'));
const registry = require(path.resolve(__dirname, 'selected-sdlc-tasks.json'));
const schema = require(path.resolve(__dirname, '../../schemas/execution-binding.schema.json'));
const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
const bindings = new WeakMap();

function fail(code, message) { throw Object.assign(new Error(message), { code }); }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
function operationHash(operation) { return sha256(JSON.stringify(stable(operation))); }
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function relativeFile(root, value, { mustExist = false } = {}) {
  if (typeof value !== 'string' || !value || value.length > 1024
    || path.isAbsolute(value) || path.win32.isAbsolute(value) || /[{}]/.test(value)) {
    fail('BINDING_PATH_INVALID', 'Binding paths must be concrete project-relative files.');
  }
  const normalized = value.replace(/\\/g, '/');
  if (normalized.split('/').some((part) => !part || part === '.' || part === '..')) {
    fail('BINDING_PATH_INVALID', 'Binding paths must use unambiguous components.');
  }
  const absolute = path.resolve(root, normalized);
  const decision = inspectTarget(mustExist || fs.existsSync(absolute) ? 'read' : 'create', normalized, root);
  if (!decision.allowed) fail('BINDING_PATH_DENIED', `Binding path denied (${decision.code}).`);
  return normalized;
}

function selectedTask(task, frameworkRoot, projectRoot) {
  if (!Object.hasOwn(registry.tasks, task)) fail('BINDING_TASK_UNSUPPORTED', 'Task is outside the selected SDLC contract set.');
  const taskPath = path.resolve(frameworkRoot, '.aexos-core/development/tasks', `${task}.md`);
  const loaded = loadTaskContract(taskPath, { enforcement: 'strict', projectRoot });
  if (!loaded.valid || loaded.status !== 'contracted') fail('BINDING_CONTRACT_REQUIRED', 'Selected task needs a valid installed V1 contract.');
  return {
    definition: registry.tasks[task], contract: loaded.contract, taskPath,
    taskContractHash: sha256(JSON.stringify(loaded.contract)),
    taskFileHash: sha256(fs.readFileSync(taskPath)),
  };
}

function bindContract(template, inputs, projectRoot) {
  const names = new Set(template.inputs.map((input) => input.name));
  if (Object.keys(inputs).some((name) => !names.has(name))) fail('BINDING_INPUT_UNDECLARED', 'Binding contains undeclared task input.');
  const values = {};
  for (const input of template.inputs) {
    const value = inputs[input.name];
    if (value === undefined) {
      if (input.required) fail('BINDING_INPUT_REQUIRED', `Missing required input ${input.name}.`);
      continue;
    }
    const valid = input.type === 'path' || input.type === 'enum' ? typeof value === 'string'
      : input.type === 'array' ? Array.isArray(value)
        : input.type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value)
          : typeof value === input.type;
    if (!valid) fail('BINDING_INPUT_INVALID', `Invalid input ${input.name}.`);
    values[input.name] = input.type === 'path' ? relativeFile(projectRoot, value) : value;
  }
  const resolve = (value) => {
    if (typeof value !== 'string') return value;
    return value.replace(/\{([^{}]+)\}/g, (_match, name) => {
      if (!Object.hasOwn(values, name) || typeof values[name] !== 'string') fail('BINDING_TEMPLATE_UNRESOLVED', 'Task path has an unresolved binding.');
      return values[name];
    });
  };
  const bound = normalizeTaskContract({
    ...structuredClone(template),
    produces: template.produces.map((output) => output.path ? { ...output, path: relativeFile(projectRoot, resolve(output.path)) } : output),
    verify: template.verify.map((check) => {
      if (check.type === 'file-exists' || check.type === 'directory-exists') {
        return { ...check, target: relativeFile(projectRoot, resolve(check.target)) };
      }
      return { ...check, ...(check.target ? { target: resolve(check.target) } : {}) };
    }),
  }, projectRoot);
  if (new Set(bound.produces.map((output) => output.path)).size !== bound.produces.length) {
    fail('BINDING_OUTPUT_COLLISION', 'Selected task outputs must be distinct.');
  }
  return bound;
}

/** Factory accepts exact leases issued by the caller's real policy broker, never grants authority. */
function createExecutionBinding(spec, options = {}) {
  if (!validate(spec)) fail('BINDING_INVALID', 'Execution binding does not match its strict schema.');
  const projectRoot = fs.realpathSync(path.resolve(options.projectRoot || ''));
  const frameworkRoot = fs.realpathSync(path.resolve(options.frameworkRoot || path.resolve(__dirname, '../../..')));
  if (!options.projectRoot || spec.projectRoot !== projectRoot) fail('BINDING_ROOT_MISMATCH', 'Binding workspace must match the authorized canonical project.');
  const task = selectedTask(spec.task, frameworkRoot, projectRoot);
  if (spec.agentId !== task.definition.owner || spec.taskContractHash !== task.taskContractHash) {
    fail('BINDING_CONTRACT_MISMATCH', 'Task owner or installed contract hash differs from the selected definition.');
  }
  const story = relativeFile(projectRoot, spec.story, { mustExist: true });
  validateStoryBinding(story, { projectRoot });
  if (spec.inputs.story !== story) fail('BINDING_STORY_MISMATCH', 'Task story input must match its authorized story binding.');
  const storyHash = sha256(fs.readFileSync(path.resolve(projectRoot, story)));
  const contract = bindContract(task.contract, spec.inputs, projectRoot);
  if (contract.produces.some((output) => output.path === story)) fail('BINDING_STORY_OUTPUT', 'The active authority story cannot be overwritten by this bound phase.');
  if (!options.capabilityBroker || typeof options.capabilityBroker.verify !== 'function'
    || !Array.isArray(options.leases) || options.leases.length !== spec.requiredCapabilities.length) {
    fail('BINDING_CAPABILITIES_REQUIRED', 'Exact broker-issued operation leases are required.');
  }
  const requiredCapabilities = spec.requiredCapabilities.map((capability, index) => {
    if ((capability.capability === 'process') !== (capability.action === 'node-test')) {
      fail('BINDING_CAPABILITY_INVALID', 'Capability kind and operation must match.');
    }
    if (capability.scope !== projectRoot || !path.isAbsolute(capability.resource)) {
      fail('BINDING_CAPABILITY_SCOPE', 'Capability must bind the exact canonical workspace and absolute file.');
    }
    const relative = path.relative(projectRoot, capability.resource);
    relativeFile(projectRoot, relative);
    const token = options.leases[index]?.token;
    options.capabilityBroker.verify(token, { ...capability, agentId: spec.agentId, task: spec.task });
    return { ...structuredClone(capability), token };
  });
  for (const output of contract.produces) {
    if (!requiredCapabilities.some((capability) => capability.resource === path.resolve(projectRoot, output.path)
      && ['guarded-create', 'guarded-recoverable-replace'].includes(capability.action))) {
      fail('BINDING_OUTPUT_CAPABILITY', 'Every declared file output requires an exact publication lease.');
    }
  }
  const operations = options.approvedFilesystemOperations;
  if (!Array.isArray(operations) || operations.length < 1 || operations.length > 128) {
    fail('BINDING_OPERATIONS_REQUIRED', 'Selected execution requires a bounded approved operation list.');
  }
  const operationHashes = new Set();
  const publishedOutputs = new Set();
  for (const operation of operations) {
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)
      || !['read', 'guarded-create', 'guarded-recoverable-replace', 'guarded-recover'].includes(operation.operation)) {
      fail('BINDING_OPERATION_INVALID', 'Unsupported operation in execution binding.');
    }
    const target = relativeFile(projectRoot, operation.target);
    if (!requiredCapabilities.some((capability) => capability.capability === 'filesystem'
      && capability.action === operation.operation && capability.resource === path.resolve(projectRoot, target))) {
      fail('BINDING_OPERATION_CAPABILITY', 'Approved operation requires its exact lease.');
    }
    const hash = operationHash(operation);
    if (operationHashes.has(hash)) fail('BINDING_OPERATION_DUPLICATE', 'Approved operations must be unique.');
    operationHashes.add(hash);
    if (operation.operation !== 'read') {
      if (!['guarded-create', 'guarded-recoverable-replace'].includes(operation.operation)
        || !contract.produces.some((output) => output.path === target)) {
        fail('BINDING_OPERATION_OUTPUT', 'Selected phases may publish only their declared outputs. Recovery requires its separate authority path.');
      }
      if (publishedOutputs.has(target)) fail('BINDING_OUTPUT_REPEATED', 'A phase may publish each declared output only once.');
      publishedOutputs.add(target);
    }
  }
  if (contract.produces.some((output) => !publishedOutputs.has(output.path))) {
    fail('BINDING_OUTPUT_OPERATION', 'Every declared output requires an actual approved publication operation.');
  }
  const binding = {
    ...structuredClone(spec), story, contract, requiredCapabilities, requiresStory: true,
    approvedFilesystemOperations: structuredClone(operations),
    approvedOperationHashes: [...operationHashes],
    resolvedContractHash: sha256(JSON.stringify(contract)),
  };
  Object.defineProperty(binding, 'toJSON', { value: () => ({
    bindingVersion: binding.bindingVersion, phaseId: binding.phaseId, task: binding.task,
    agentId: binding.agentId, taskContractHash: binding.taskContractHash,
    resolvedContractHash: binding.resolvedContractHash,
    approvedOperationHashes: binding.approvedOperationHashes,
    capabilityCount: binding.requiredCapabilities.length, requireAcceptance: true,
  }) });
  freeze(binding);
  bindings.set(binding, { frameworkRoot, projectRoot, taskFileHash: task.taskFileHash, storyHash, broker: options.capabilityBroker });
  return binding;
}

function assertExecutionBinding(binding, { phase, projectRoot, frameworkRoot } = {}) {
  const authority = bindings.get(binding);
  if (!authority) fail('BINDING_UNTRUSTED', 'Runtime binding must originate from the validated in-process factory.');
  if (authority.projectRoot !== fs.realpathSync(projectRoot)
    || authority.frameworkRoot !== fs.realpathSync(frameworkRoot)
    || binding.phaseId !== phase.id || binding.task !== phase.task || binding.agentId !== phase.agent) {
    fail('BINDING_IDENTITY_MISMATCH', 'Binding does not match this workflow phase and workspace.');
  }
  const task = selectedTask(binding.task, authority.frameworkRoot, authority.projectRoot);
  if (task.taskFileHash !== authority.taskFileHash || task.taskContractHash !== binding.taskContractHash) {
    fail('BINDING_CONTRACT_CHANGED', 'Installed task changed after execution binding.');
  }
  relativeFile(authority.projectRoot, binding.story, { mustExist: true });
  validateStoryBinding(binding.story, { projectRoot: authority.projectRoot });
  if (sha256(fs.readFileSync(path.resolve(authority.projectRoot, binding.story))) !== authority.storyHash) {
    fail('BINDING_STORY_CHANGED', 'Authorized story changed after preparation; explicitly rebind the approved story.');
  }
  for (const capability of binding.requiredCapabilities) {
    authority.broker.verify(capability.token, { ...capability, agentId: binding.agentId, task: binding.task });
  }
  return binding;
}

module.exports = { createExecutionBinding, assertExecutionBinding, bindContract, relativeFile, selectedTask, sha256, operationHash };
