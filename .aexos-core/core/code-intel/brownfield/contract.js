'use strict';

const crypto = require('crypto');
const os = require('os');
const path = require('path');

const CONTRACT_PROTOCOL = 'aexos.brownfield-analysis/v1';
const VIEWS = Object.freeze(['architecture', 'domain', 'api', 'data', 'dependencies', 'tests', 'risks']);
const LIMIT_KEYS = Object.freeze([
  'maxFiles',
  'maxDirectories',
  'maxDepth',
  'maxFileBytes',
  'maxTotalBytes',
  'maxFindings',
  'maxElapsedMs',
]);
const CONTRACT_KEYS = Object.freeze([
  'protocol',
  'analysisId',
  'projectRoot',
  'allowedPaths',
  'exclusions',
  'requestedViews',
  'limits',
  'output',
  'verification',
]);
const DEFAULT_LIMITS = Object.freeze({
  maxFiles: 1000,
  maxDirectories: 500,
  maxDepth: 12,
  maxFileBytes: 512 * 1024,
  maxTotalBytes: 16 * 1024 * 1024,
  maxFindings: 2000,
  maxElapsedMs: 30_000,
});

class BrownfieldContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BrownfieldContractError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new BrownfieldContractError(code, message);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizedRelative(candidate, label) {
  if (typeof candidate !== 'string' || !candidate.trim()) {
    fail('BROWNFIELD_PATH_INVALID', `${label} must be a nonempty project-relative path.`);
  }
  const value = candidate.replace(/\\/g, '/');
  if (value === '.') return '.';
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || /^[/\\]{2}/.test(candidate)
    || /^[a-z]+:/i.test(value) || value.includes('\0') || value.split('/').some((part) => (
    part === '..' || part === '' || /[. ]$/.test(part)
    || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part)
    || part.includes(':')
  ))) {
    fail('BROWNFIELD_PATH_INVALID', `${label} is not a canonical project-relative path.`);
  }
  const normalized = path.posix.normalize(value).replace(/^\.\//, '');
  return normalized === '.' ? '.' : normalized.replace(/\/$/, '');
}

function canonicalRoot(value, fsAdapter) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || /^[a-z]+:\/\//i.test(value)) {
    fail('BROWNFIELD_ROOT_INVALID', 'projectRoot must be an existing absolute local directory.');
  }
  let resolved;
  try {
    resolved = fsAdapter.realpathSync(path.resolve(value));
    if (!fsAdapter.statSync(resolved).isDirectory()) throw new Error('not a directory');
  } catch (_error) {
    fail('BROWNFIELD_ROOT_MISSING', 'projectRoot is unavailable.');
  }
  const parsed = path.parse(resolved);
  if (resolved === parsed.root || resolved.toLowerCase() === path.resolve(os.homedir()).toLowerCase()) {
    fail('BROWNFIELD_ROOT_PROTECTED', 'Filesystem and home roots cannot be analyzed.');
  }
  return resolved;
}

function validateKeys(value, expected, code, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, `${label} must be an object.`);
  const unknown = Object.keys(value).filter((key) => !expected.includes(key));
  if (unknown.length) fail(code, `${label} contains unsupported fields.`);
}

function validateBrownfieldContract(request, options = {}) {
  const fsAdapter = options.fs || require('fs');
  validateKeys(request, CONTRACT_KEYS, 'BROWNFIELD_CONTRACT_INVALID', 'Analysis contract');
  if (request.protocol !== CONTRACT_PROTOCOL) fail('BROWNFIELD_PROTOCOL_INVALID', 'Unsupported analysis protocol.');
  if (typeof request.analysisId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(request.analysisId)) {
    fail('BROWNFIELD_ANALYSIS_ID_INVALID', 'analysisId is invalid.');
  }
  const projectRoot = canonicalRoot(request.projectRoot, fsAdapter);
  const authorizedRoot = canonicalRoot(options.authorizedProjectRoot, fsAdapter);
  if (projectRoot.toLowerCase() !== authorizedRoot.toLowerCase()) {
    fail('BROWNFIELD_ROOT_MISMATCH', 'Contract root must match the separately authorized project root.');
  }
  if (!Array.isArray(request.allowedPaths) || request.allowedPaths.length === 0) {
    fail('BROWNFIELD_SCOPE_MISSING', 'allowedPaths must contain at least one path.');
  }
  const allowedPaths = request.allowedPaths.map((value) => normalizedRelative(value, 'allowedPaths entry'));
  const aliases = new Set();
  for (const value of allowedPaths) {
    const key = process.platform === 'win32' ? value.toLowerCase() : value;
    if (aliases.has(key)) fail('BROWNFIELD_SCOPE_ALIAS', 'allowedPaths contains duplicate aliases.');
    aliases.add(key);
  }
  for (const left of allowedPaths) {
    for (const right of allowedPaths) {
      if (left !== right && left !== '.' && right.startsWith(`${left}/`)) {
        fail('BROWNFIELD_OWNERSHIP_AMBIGUOUS', 'Nested allowed paths require one unambiguous owner.');
      }
    }
  }
  if (!Array.isArray(request.exclusions) || request.exclusions.some((value) => typeof value !== 'string'
    || value.includes('\0') || value.trim().startsWith('!') || path.isAbsolute(value) || path.win32.isAbsolute(value))) {
    fail('BROWNFIELD_EXCLUSIONS_INVALID', 'exclusions must be project-relative glob strings.');
  }
  if (!Array.isArray(request.requestedViews) || request.requestedViews.length === 0
    || request.requestedViews.some((view) => !VIEWS.includes(view))
    || new Set(request.requestedViews).size !== request.requestedViews.length) {
    fail('BROWNFIELD_VIEWS_INVALID', 'requestedViews must contain unique supported views.');
  }
  validateKeys(request.limits, LIMIT_KEYS, 'BROWNFIELD_LIMITS_INVALID', 'limits');
  const limits = {};
  for (const key of LIMIT_KEYS) {
    const value = request.limits[key];
    if (!Number.isSafeInteger(value) || value < 1) fail('BROWNFIELD_LIMITS_INVALID', `limits.${key} must be positive.`);
    limits[key] = value;
  }
  if (limits.maxFileBytes > 16 * 1024 * 1024 || limits.maxTotalBytes < limits.maxFileBytes) {
    fail('BROWNFIELD_LIMITS_INVALID', 'File and total byte limits exceed the confined read boundary.');
  }
  validateKeys(request.output, ['mode', 'path'], 'BROWNFIELD_OUTPUT_INVALID', 'output');
  if (!['return', 'governed'].includes(request.output.mode)) {
    fail('BROWNFIELD_OUTPUT_INVALID', 'output.mode must be return or governed.');
  }
  const outputPath = normalizedRelative(request.output.path, 'output.path');
  if (outputPath === '.' || allowedPaths.includes(outputPath)) {
    fail('BROWNFIELD_OUTPUT_OVERLAP', 'Output cannot identify an input root or source file.');
  }
  validateKeys(request.verification, ['mode', 'requireSourceHashes', 'requireNoMutation'],
    'BROWNFIELD_VERIFICATION_INVALID', 'verification');
  if (request.verification.mode !== 'static-only' || request.verification.requireSourceHashes !== true
    || request.verification.requireNoMutation !== true) {
    fail('BROWNFIELD_VERIFICATION_INVALID', 'Only hash-bound, no-mutation static analysis is supported.');
  }
  const contract = {
    protocol: CONTRACT_PROTOCOL,
    analysisId: request.analysisId,
    projectRoot,
    allowedPaths: [...allowedPaths].sort(),
    exclusions: [...request.exclusions].sort(),
    requestedViews: [...request.requestedViews].sort(),
    limits,
    output: { mode: request.output.mode, path: outputPath },
    verification: { ...request.verification },
  };
  const hashable = { ...contract, projectRoot: '$PROJECT_ROOT' };
  return Object.freeze({ contract, contractHash: sha256(stableStringify(hashable)) });
}

module.exports = {
  BrownfieldContractError,
  CONTRACT_PROTOCOL,
  DEFAULT_LIMITS,
  LIMIT_KEYS,
  VIEWS,
  normalizedRelative,
  sha256,
  stableStringify,
  stableValue,
  validateBrownfieldContract,
};
