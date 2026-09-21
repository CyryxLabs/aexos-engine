const ToolHelperExecutor = require('./tool-helper-executor');

const DEFAULT_TIMEOUT_MS = 500;
const PERFORMANCE_TARGET_MS = 50;

class ToolValidationHelper {
  constructor(executableKnowledge = [], options = {}) {
    this.validators = new Map();
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const validators = Array.isArray(executableKnowledge)
      ? executableKnowledge
      : executableKnowledge?.validators || [];

    for (const validator of validators) {
      if (!validator?.validates || typeof validator.function !== 'string') {
        throw new Error('Validator must have validates and function fields');
      }
      this.validators.set(validator.validates, { ...validator });
    }
  }

  async validate(command, commandArgs = {}) {
    const startedAt = Date.now();
    const validator = this.validators.get(command);
    if (!validator) {
      return {
        valid: true,
        errors: [],
        _note: `No validator configured for '${command}'`,
        _duration: Date.now() - startedAt,
      };
    }
    if (typeof validator.function !== 'string') {
      return this._failure(`Validator '${command}' has no function defined`, startedAt);
    }
    if ((validator.language || 'javascript') !== 'javascript') {
      return this._failure(
        `Validator '${command}' uses unsupported language '${validator.language}'`,
        startedAt,
      );
    }

    try {
      const result = ToolHelperExecutor.executeInContext(
        validator.function,
        { args: commandArgs },
        {
          timeoutMs: this.timeoutMs,
          label: `Validator '${command}'`,
          filename: `aexos-tool-validator-${command}.vm.js`,
        },
      );
      if (!result || typeof result !== 'object' || Array.isArray(result)) {
        return this._failure(`Validator '${command}' returned invalid format`, startedAt);
      }
      if (typeof result.valid !== 'boolean' ||
          (result.errors !== undefined && !Array.isArray(result.errors))) {
        return this._failure(`Validator '${command}' returned invalid format`, startedAt);
      }

      const duration = Date.now() - startedAt;
      if (duration > PERFORMANCE_TARGET_MS) {
        console.warn(
          `Validator '${command}' took ${duration}ms (target: <${PERFORMANCE_TARGET_MS}ms)`,
        );
      }
      return {
        ...result,
        valid: result.valid,
        errors: result.errors || [],
        _duration: duration,
      };
    } catch (error) {
      const message = error.code === 'AEXOS_EXECUTION_TIMEOUT'
        ? `Validator '${command}' exceeded ${this.timeoutMs}ms timeout`
        : `Validation error for '${command}': ${error.message}`;
      return this._failure(message, startedAt);
    }
  }

  async validateBatch(operations = []) {
    return Promise.all(
      operations.map(async operation => ({
        ...operation,
        result: await this.validate(operation.command, operation.args),
      })),
    );
  }

  validateDeclarative(command, commandArgs = {}) {
    const validator = this.validators.get(command);
    if (!validator?.checks?.length) {
      return { valid: true, errors: [], _note: `No declarative checks for '${command}'` };
    }

    const errors = [];
    for (const check of validator.checks) {
      for (const field of check.required_fields || []) {
        if (commandArgs[field] === undefined || commandArgs[field] === null) {
          errors.push(`Required field '${field}' is missing`);
        }
      }
    }
    return { valid: errors.length === 0, errors };
  }

  addValidator(validator) {
    if (!validator?.validates || typeof validator.function !== 'string') {
      throw new Error('Validator must have validates and function fields');
    }
    if (this.validators.has(validator.validates)) {
      throw new Error(`Validator '${validator.validates}' already exists`);
    }
    this.validators.set(validator.validates, { ...validator });
  }

  replaceValidator(validator) {
    if (!validator?.validates || typeof validator.function !== 'string') {
      throw new Error('Validator must have validates and function fields');
    }
    if (!this.validators.has(validator.validates)) {
      throw new Error(`Validator '${validator.validates}' not found`);
    }
    this.validators.set(validator.validates, { ...validator });
  }

  removeValidator(command) {
    return this.validators.delete(command);
  }

  clearValidators() {
    this.validators.clear();
  }

  hasValidator(command) {
    return this.validators.has(command);
  }

  listValidators() {
    return Array.from(this.validators.keys());
  }

  getValidatorInfo(command) {
    const validator = this.validators.get(command);
    if (!validator) return null;
    return {
      id: validator.id,
      validates: validator.validates,
      language: validator.language || 'javascript',
      checks: validator.checks,
      hasFunction: typeof validator.function === 'string',
    };
  }

  getStats() {
    const validators = this.listValidators();
    return { count: validators.length, validators };
  }

  _failure(message, startedAt) {
    return { valid: false, errors: [message], _duration: Date.now() - startedAt };
  }
}

ToolValidationHelper.DEFAULT_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;

module.exports = ToolValidationHelper;
