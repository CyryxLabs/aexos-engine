'use strict';

const crypto = require('node:crypto');
const path = require('node:path');

const VERSION = 'aexos-guarded-publication-v1';
const OPERATIONS = Object.freeze(['guarded-create', 'guarded-recoverable-replace', 'guarded-recover']);
const LIMITS = Object.freeze({ content: 4 * 1024 * 1024, request: 6 * 1024 * 1024,
  record: 64 * 1024, stdout: 256 * 1024, stderr: 8 * 1024, timeoutMs: 30_000,
  components: 64, path: 1024, retained: 128 * 1024 * 1024 });
const HASH = /^[a-f0-9]{64}$/;
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function rejected(code, phase = 'REJECTED_BEFORE_MUTATION') {
  return { success: false, status: 'denied', code, phase, lastReconstructablePhase: phase,
    effects: phase === 'RECOVERY_CONFLICT' ? { mutationPerformed: false, retainedArtifactsMayExist: true, originalNameMayBeAbsent: true }
      : { staging: false, journal: false, backup: false, parked: false, destination: false,
        originalNameMayBeAbsent: false }, productionEnabled: false };
}
function validateOperation(operation) {
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) return 'INVALID_PROTOCOL';
  const keys = ['operation', 'target', 'contentBase64', 'expectedBefore', 'trustedReceipt', 'isolatedWorkspace', 'allowAbsentName'];
  if (Object.keys(operation).some((key) => !keys.includes(key))
    || !OPERATIONS.includes(operation.operation)) return 'INVALID_PROTOCOL';
  const forbidden = operation.operation === 'guarded-create' ? ['expectedBefore', 'trustedReceipt', 'isolatedWorkspace', 'allowAbsentName']
    : operation.operation === 'guarded-recover' ? ['contentBase64', 'expectedBefore', 'isolatedWorkspace', 'allowAbsentName'] : ['trustedReceipt'];
  if (forbidden.some((key) => Object.hasOwn(operation, key))) return 'INVALID_PROTOCOL';
  if (typeof operation.target !== 'string' || !operation.target || operation.target.length > LIMITS.path
    || path.win32.isAbsolute(operation.target) || operation.target.split(/[/\\]/).length > LIMITS.components
    || operation.target.split(/[/\\]/).some((part) => !part || part === '.' || part === '..'
      || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))
    // eslint-disable-next-line no-control-regex
    || /[\x00-\x1f:%]/.test(operation.target)) return 'INVALID_TARGET';
  if (operation.operation !== 'guarded-recover') {
    if (typeof operation.contentBase64 !== 'string' || operation.contentBase64.length > Math.ceil(LIMITS.content / 3) * 4
      || Buffer.from(operation.contentBase64, 'base64').length > LIMITS.content
      || Buffer.from(operation.contentBase64, 'base64').toString('base64') !== operation.contentBase64) return 'CONTENT_LIMIT_OR_ENCODING';
  }
  if (operation.operation === 'guarded-recoverable-replace') {
    if (operation.isolatedWorkspace !== true || operation.allowAbsentName !== true) return 'ABSENT_NAME_OPT_IN_REQUIRED';
    const before = operation.expectedBefore;
    if (!before || Object.keys(before).sort().join(',') !== 'identity,sha256'
      || typeof before.identity !== 'string' || !/^\d+:\d+:\d+$/.test(before.identity)
      || !HASH.test(before.sha256)) return 'EXPECTED_BEFORE_REQUIRED';
  }
  if (operation.operation === 'guarded-recover' && (!operation.trustedReceipt
    || typeof operation.trustedReceipt !== 'object')) return 'TRUSTED_RECEIPT_REQUIRED';
  if (Buffer.byteLength(JSON.stringify(operation)) > LIMITS.request) return 'REQUEST_LIMIT';
  return null;
}

module.exports = { VERSION, OPERATIONS, LIMITS, sha256, rejected, validateOperation };
