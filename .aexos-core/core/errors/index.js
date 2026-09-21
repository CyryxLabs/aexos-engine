const {
  ErrorCategory,
  ErrorSeverity,
  DEFAULT_ERROR_CODE,
  CORE_ERROR_DEFINITIONS,
} = require('./constants');
const { ErrorRegistry, defaultErrorRegistry } = require('./error-registry');
const {
  AEXOSError,
  AIOXError,
  CYRYXError,
  isAEXOSError,
  isAIOXError,
  isCYRYXError,
  normalizeError,
} = require('./aexos-error');
const { shouldExposeErrorStack, sanitizeValue, serializeError } = require('./serializer');
const { deepMerge, isPlainObject, normalizeErrorCode } = require('./utils');

module.exports = {
  AEXOSError,
  AIOXError,
  CYRYXError,
  ErrorRegistry,
  ErrorCategory,
  ErrorSeverity,
  DEFAULT_ERROR_CODE,
  CORE_ERROR_DEFINITIONS,
  defaultErrorRegistry,
  isAEXOSError,
  isAIOXError,
  isCYRYXError,
  normalizeError,
  serializeError,
  sanitizeValue,
  shouldExposeErrorStack,
  deepMerge,
  isPlainObject,
  normalizeErrorCode,
};
