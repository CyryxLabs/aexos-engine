const vm = require('vm');

const DEFAULT_TIMEOUT_MS = 1000;
const MAX_ERROR_LENGTH = 300;

function boundedMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_ERROR_LENGTH);
}

function cloneJsonInput(value) {
  try {
    const serialized = JSON.stringify(value === undefined ? {} : value);
    if (serialized === undefined) {
      throw new Error('arguments must be JSON-serializable');
    }
    return serialized;
  } catch (error) {
    throw new Error(`arguments must be JSON-serializable: ${boundedMessage(error)}`);
  }
}

function timeoutError(label, timeoutMs) {
  const error = new Error(`${label} exceeded ${timeoutMs / 1000}s timeout`);
  error.code = 'AEXOS_EXECUTION_TIMEOUT';
  return error;
}

function remainingTimeout(startedAt, timeoutMs) {
  const remaining = timeoutMs - Number(process.hrtime.bigint() - startedAt) / 1e6;
  // vm requires an integer >= 1. Round only the remaining fractional
  // millisecond, never restart the original budget for a later phase.
  return remaining <= 0 ? 0 : Math.ceil(remaining);
}

/**
 * Execute package-owned executable knowledge with data-only arguments.
 *
 * This is an isolation boundary for the trusted JavaScript shipped in tool YAML,
 * not a general-purpose sandbox for third-party code. No host objects or
 * functions are injected into the context.
 */
function executeInContext(source, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const label = options.label || 'Helper';
  const startedAt = process.hrtime.bigint();

  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('timeoutMs must be a positive integer');
  }

  const serializedArgs = cloneJsonInput(args);
  const context = vm.createContext(Object.create(null), {
    codeGeneration: { strings: false, wasm: false },
    microtaskMode: 'afterEvaluate',
  });
  for (const slot of ['__aexosThrown', '__aexosResult']) {
    const defined = Reflect.defineProperty(context, slot, {
      value: undefined,
      writable: true,
      enumerable: false,
      configurable: false,
    });
    if (!defined) throw new Error(`${label} execution failed: reserved state unavailable`);
  }
  // Pass only a primitive string across the boundary. Compiling a JSON literal
  // would make source compilation proportional to potentially large inputs.
  if (!Reflect.defineProperty(context, '__aexosInputJson', {
    value: serializedArgs, writable: false, enumerable: false, configurable: false,
  })) throw new Error(`${label} execution failed: reserved state unavailable`);
  const wrappedSource = `
    'use strict';
    const __aexosParse = JSON.parse.bind(JSON);
    const __aexosStringify = JSON.stringify.bind(JSON);
    const args = __aexosParse(globalThis.__aexosInputJson);
    globalThis.__aexosThrown = undefined;
    try {
      ${source}
    } catch (__aexosError) {
      let __aexosMessage = 'unknown error';
      try {
        __aexosMessage = __aexosError && typeof __aexosError.message === 'string'
          ? __aexosError.message
          : String(__aexosError);
      } catch (_ignored) {}
      globalThis.__aexosThrown = __aexosStringify({
        message: String(__aexosMessage).slice(0, ${MAX_ERROR_LENGTH})
      });
      throw 0;
    }
  `;

  let result;
  let script;
  try {
    script = new vm.Script(
      wrappedSource,
      { filename: options.filename || 'aexos-tool-helper.vm.js' },
    );
  } catch (_error) {
    throw new Error(`${label} execution failed: source could not be compiled`);
  }

  const executionBudget = remainingTimeout(startedAt, timeoutMs);
  if (executionBudget <= 0) throw timeoutError(label, timeoutMs);
  try {
    result = script.runInContext(context, { timeout: executionBudget });
  } catch (_error) {
    const remaining = remainingTimeout(startedAt, timeoutMs);
    if (remaining <= 0) throw timeoutError(label, timeoutMs);

    let captured = '';
    try {
      captured = new vm.Script(
        'typeof globalThis.__aexosThrown === \'string\' ? globalThis.__aexosThrown : \'\'',
      ).runInContext(context, { timeout: remaining });
    } catch (_captureError) {
      throw timeoutError(label, timeoutMs);
    }
    if (typeof captured !== 'string' || !captured) throw timeoutError(label, timeoutMs);

    let details;
    try {
      details = JSON.parse(captured);
    } catch (_parseError) {
      throw new Error(`${label} execution failed`);
    }
    throw new Error(`${label} execution failed: ${String(details.message).slice(0, MAX_ERROR_LENGTH)}`);
  }

  const resultStored = Reflect.defineProperty(context, '__aexosResult', {
    value: result,
    writable: true,
    enumerable: false,
    configurable: false,
  });
  if (!resultStored) {
    throw new Error(`${label} execution failed: reserved state unavailable`);
  }
  const remaining = remainingTimeout(startedAt, timeoutMs);
  if (remaining <= 0) throw timeoutError(label, timeoutMs);

  let serializedResult;
  try {
    serializedResult = new vm.Script(`
      (function() {
        try {
        const value = globalThis.__aexosResult;
        if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
          if (typeof value.then === 'function') {
            return __aexosStringify({ kind: 'async' });
          }
        }
        return __aexosStringify({
          kind: 'success',
          hasValue: value !== undefined,
          value
        });
        } catch (_serializationError) {
          // Never export or inspect a VM-owned thrown value in the host.
          return '{"kind":"serialization-error"}';
        }
      })();
    `).runInContext(context, { timeout: remaining });
  } catch (_error) {
    // Ordinary serialization exceptions are captured inside the VM. Its
    // uncatchable deadline interruption must not depend on wall-clock ticks.
    throw timeoutError(label, timeoutMs);
  }

  if (typeof serializedResult !== 'string') {
    throw new Error(`${label} execution failed: result could not be serialized`);
  }

  let envelope;
  try {
    envelope = JSON.parse(serializedResult);
  } catch (_error) {
    throw new Error(`${label} execution failed: result could not be serialized`);
  }
  if (envelope.kind === 'async') {
    throw new Error(`${label} execution failed: asynchronous results are not supported`);
  }
  if (envelope.kind === 'serialization-error') {
    throw new Error(`${label} execution failed: result could not be serialized`);
  }
  return envelope.hasValue ? envelope.value : undefined;
}

class ToolHelperExecutor {
  constructor(executableKnowledge = [], options = {}) {
    this.helpers = new Map();
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const helpers = Array.isArray(executableKnowledge)
      ? executableKnowledge
      : executableKnowledge?.helpers || [];

    for (const helper of helpers) {
      if (!helper?.id || typeof helper.function !== 'string') {
        throw new Error('Helper must have id and function fields');
      }
      this.helpers.set(helper.id, { ...helper });
    }
  }

  async execute(helperId, args = {}) {
    const helper = this.helpers.get(helperId);
    if (!helper) {
      const available = this.listHelpers();
      const suffix = available.length ? ` Available helpers: ${available.join(', ')}` : '';
      throw new Error(`Helper '${helperId}' not found.${suffix}`);
    }
    if (typeof helper.function !== 'string') {
      throw new Error(`Helper '${helperId}' has no function defined`);
    }
    if ((helper.language || 'javascript') !== 'javascript') {
      throw new Error(`Helper '${helperId}' uses unsupported language '${helper.language}'`);
    }
    if ((helper.runtime || 'isolated_vm') !== 'isolated_vm') {
      throw new Error(`Helper '${helperId}' uses unsupported runtime '${helper.runtime}'`);
    }

    return executeInContext(helper.function, args, {
      timeoutMs: this.timeoutMs,
      label: `Helper '${helperId}'`,
      filename: `aexos-tool-helper-${helperId}.vm.js`,
    });
  }

  addHelper(helper) {
    if (!helper?.id || typeof helper.function !== 'string') {
      throw new Error('Helper must have id and function fields');
    }
    if (this.helpers.has(helper.id)) {
      throw new Error(`Helper '${helper.id}' already exists`);
    }
    this.helpers.set(helper.id, { ...helper });
  }

  replaceHelper(helper) {
    if (!helper?.id || typeof helper.function !== 'string') {
      throw new Error('Helper must have id and function fields');
    }
    if (!this.helpers.has(helper.id)) {
      throw new Error(`Helper '${helper.id}' not found`);
    }
    this.helpers.set(helper.id, { ...helper });
  }

  removeHelper(helperId) {
    return this.helpers.delete(helperId);
  }

  clearHelpers() {
    this.helpers.clear();
  }

  hasHelper(helperId) {
    return this.helpers.has(helperId);
  }

  listHelpers() {
    return Array.from(this.helpers.keys());
  }

  getHelperInfo(helperId) {
    const helper = this.helpers.get(helperId);
    if (!helper) return null;
    return {
      id: helper.id,
      language: helper.language || 'javascript',
      runtime: helper.runtime || 'isolated_vm',
      hasFunction: typeof helper.function === 'string',
    };
  }

  getStats() {
    const helpers = this.listHelpers();
    return { count: helpers.length, helpers };
  }
}

ToolHelperExecutor.executeInContext = executeInContext;
ToolHelperExecutor.DEFAULT_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;

module.exports = ToolHelperExecutor;
