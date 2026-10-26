/**
 * AEXOS task contract loader and output boundary.
 *
 * Story AEX-1.1 adds an execution-safe contract without rewriting task bodies.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const yaml = require('js-yaml');

const CONTRACT_KEYS = ['contractVersion', 'inputs', 'produces', 'verify'];
const SCHEMA_PATH = path.resolve(__dirname, '../../schemas/task-contract.schema.json');
const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
const validateSchema = ajv.compile(schema);

class TaskContractError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'TaskContractError';
    this.code = code;
    this.details = details;
  }
}

function parseFrontmatter(content) {
  const match = String(content || '').match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return null;

  // Many legacy task files begin with a Markdown horizontal rule. Do not treat
  // the next horizontal rule as a frontmatter terminator when the candidate
  // contains unmistakable Markdown body syntax.
  if (/^(?:#{1,6}\s|```|\*\*)/m.test(match[1])) return null;
  if (!CONTRACT_KEYS.some((key) => new RegExp(`^${key}:`, 'm').test(match[1]))) return null;

  try {
    const parsed = yaml.load(match[1]);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    throw new TaskContractError('TASK_FRONTMATTER_INVALID', error.message);
  }
}

function formatSchemaErrors(errors = []) {
  return errors.map((error) => ({
    path: error.instancePath || '/',
    keyword: error.keyword,
    message: error.message,
    params: error.params,
  }));
}

function hasAnyContractKey(frontmatter) {
  return CONTRACT_KEYS.some((key) => Object.prototype.hasOwnProperty.call(frontmatter, key));
}

function extractContract(frontmatter) {
  return Object.fromEntries(CONTRACT_KEYS.map((key) => [key, frontmatter[key]]));
}

function assertInsideProject(candidatePath, projectRoot) {
  if (path.isAbsolute(candidatePath)) {
    throw new TaskContractError(
      'TASK_OUTPUT_ABSOLUTE_PATH',
      `Declared output must be project-relative: ${candidatePath}`,
    );
  }

  const safeTemplatePath = candidatePath.replace(/\{[^{}]+\}/g, '__template__');
  const root = path.resolve(projectRoot);
  const resolved = path.resolve(root, safeTemplatePath);
  const relative = path.relative(root, resolved);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new TaskContractError(
      'TASK_OUTPUT_PATH_TRAVERSAL',
      `Declared output escapes the project root: ${candidatePath}`,
    );
  }

  return path.normalize(candidatePath).split(path.sep).join('/');
}

function validateDeclaredPaths(contract, projectRoot) {
  return {
    ...contract,
    produces: contract.produces.map((output) => (
      output.path
        ? { ...output, path: assertInsideProject(output.path, projectRoot) }
        : { ...output }
    )),
  };
}

function normalizeTaskContract(contract, projectRoot = process.cwd()) {
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    throw new TaskContractError(
      'TASK_CONTRACT_INVALID',
      'Task contract must be an object.',
    );
  }

  if (!validateSchema(contract)) {
    throw new TaskContractError(
      'TASK_CONTRACT_INVALID',
      'Task contract does not match the AEXOS task contract schema.',
      { errors: formatSchemaErrors(validateSchema.errors) },
    );
  }

  return validateDeclaredPaths(contract, projectRoot);
}

function uncontractedResult(filePath, enforcement) {
  const result = {
    filePath,
    status: 'uncontracted',
    valid: enforcement !== 'strict',
    parallelSafe: false,
    contract: null,
    errors: [],
  };

  if (enforcement === 'strict') {
    result.errors.push({
      code: 'TASK_CONTRACT_REQUIRED',
      message: 'Task contract is required in strict mode.',
    });
  }

  return result;
}

function loadTaskContract(filePath, options = {}) {
  const enforcement = options.enforcement || 'warn';
  const projectRoot = path.resolve(options.projectRoot || process.cwd());
  if (!['warn', 'strict'].includes(enforcement)) {
    throw new TaskContractError(
      'TASK_CONTRACT_ENFORCEMENT_INVALID',
      `Unsupported task contract enforcement mode: ${enforcement}`,
    );
  }

  const absoluteFile = path.resolve(filePath);
  const content = fs.readFileSync(absoluteFile, 'utf8');
  let frontmatter;

  try {
    frontmatter = parseFrontmatter(content);
  } catch (error) {
    return {
      filePath: absoluteFile,
      status: 'invalid',
      valid: false,
      parallelSafe: false,
      contract: null,
      errors: [{ code: error.code, message: error.message }],
    };
  }

  if (!frontmatter || !hasAnyContractKey(frontmatter)) {
    return uncontractedResult(absoluteFile, enforcement);
  }

  const contract = extractContract(frontmatter);
  if (!validateSchema(contract)) {
    return {
      filePath: absoluteFile,
      status: 'invalid',
      valid: false,
      parallelSafe: false,
      contract,
      errors: formatSchemaErrors(validateSchema.errors),
    };
  }

  try {
    const normalized = normalizeTaskContract(contract, projectRoot);
    return {
      filePath: absoluteFile,
      status: 'contracted',
      valid: true,
      parallelSafe: true,
      contract: normalized,
      errors: [],
    };
  } catch (error) {
    return {
      filePath: absoluteFile,
      status: 'invalid',
      valid: false,
      parallelSafe: false,
      contract,
      errors: [{ code: error.code, message: error.message }],
    };
  }
}

function templatePathToRegExp(declaredPath) {
  const escaped = declaredPath
    .split(/(\{[^{}]+\})/g)
    .map((part) => (
      /^\{[^{}]+\}$/.test(part)
        ? '[^/]+'
        : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    ))
    .join('');
  return new RegExp(`^${escaped}$`);
}

function normalizeActualOutput(actualPath, projectRoot) {
  const root = path.resolve(projectRoot);
  const resolved = path.resolve(root, actualPath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new TaskContractError(
      'TASK_OUTPUT_PATH_TRAVERSAL',
      `Produced output escapes the project root: ${actualPath}`,
    );
  }
  return relative.split(path.sep).join('/');
}

function assertProducedPaths(contract, actualPaths, projectRoot = process.cwd()) {
  const declarations = (contract?.produces || [])
    .filter((output) => output.path)
    .map((output) => templatePathToRegExp(output.path.replace(/\\/g, '/')));

  return (actualPaths || []).map((actualPath) => {
    const normalized = normalizeActualOutput(actualPath, projectRoot);
    if (!declarations.some((pattern) => pattern.test(normalized))) {
      throw new TaskContractError(
        'TASK_OUTPUT_UNDECLARED',
        `Produced output is not declared by the task contract: ${normalized}`,
      );
    }
    return normalized;
  });
}

function walkMarkdownFiles(root, output = []) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) walkMarkdownFiles(absolute, output);
    else if (entry.isFile() && entry.name.endsWith('.md')) output.push(absolute);
  }
  return output;
}

function validateTaskCorpus(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || process.cwd());
  const taskRoot = path.resolve(
    options.taskRoot || path.join(projectRoot, '.aexos-core', 'development', 'tasks'),
  );
  const enforcement = options.enforcement || 'warn';
  const files = walkMarkdownFiles(taskRoot).sort();
  const results = files.map((filePath) => loadTaskContract(filePath, {
    enforcement,
    projectRoot,
  }));
  const contracted = results.filter((result) => result.status === 'contracted').length;
  const uncontracted = results.filter((result) => result.status === 'uncontracted').length;
  const invalid = results.filter((result) => result.status === 'invalid').length;

  return {
    enforcement,
    taskRoot,
    total: results.length,
    contracted,
    uncontracted,
    invalid,
    coverage: results.length === 0 ? 100 : Number(((contracted / results.length) * 100).toFixed(2)),
    valid: invalid === 0 && (enforcement !== 'strict' || uncontracted === 0),
    results,
  };
}

module.exports = {
  TaskContractError,
  parseFrontmatter,
  loadTaskContract,
  normalizeTaskContract,
  assertProducedPaths,
  validateTaskCorpus,
};
