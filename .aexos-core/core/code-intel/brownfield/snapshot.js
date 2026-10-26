'use strict';

const path = require('path');
const { TextDecoder } = require('util');
const { sha256 } = require('./contract');
const { computeSourceId } = require('./evidence');

const SUPPORTED_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']);
const DATA_FILES = new Set(['package.json', 'openapi.json']);
const HARD_DIRECTORY_NAMES = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  'vendor',
  'dist',
  'build',
  'coverage',
  '.cache',
  '.next',
]);
const SECRET_NAMES = /^(?:\.env(?:\..+)?|credentials?(?:\..+)?|secrets?(?:\..+)?|id_(?:rsa|dsa|ecdsa|ed25519)|.*\.(?:pem|p12|pfx|key))$/i;

function codeError(code, message) {
  return Object.assign(new Error(message), { code });
}

function normalize(relativePath) {
  const value = relativePath.split(path.sep).join('/');
  return value || '.';
}

function languageFor(relativePath) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  if (['.ts', '.tsx', '.mts', '.cts'].includes(extension)) return 'typescript';
  if (['.js', '.jsx', '.mjs', '.cjs'].includes(extension)) return 'javascript';
  if (extension === '.json') return 'json';
  if (extension === '.py') return 'python';
  if (extension === '.sql') return 'sql';
  if (extension === '.go') return 'go';
  if (extension === '.java') return 'java';
  if (extension === '.rs') return 'rust';
  return 'unknown';
}

function ownerFor(relativePath, allowedPaths) {
  const candidates = allowedPaths.filter((candidate) => candidate === '.' || relativePath === candidate
    || relativePath.startsWith(`${candidate}/`));
  return candidates.sort((left, right) => right.length - left.length)[0] || null;
}

function createIgnoreState(ignoreFactory, exclusions) {
  if (!ignoreFactory) return null;
  const matcher = ignoreFactory();
  if (exclusions.length) matcher.add(exclusions);
  return matcher;
}

async function boundaryRead(readBoundary, relativePath, maxBytes) {
  if (!readBoundary) throw codeError('BROWNFIELD_READ_BOUNDARY_REQUIRED', 'A confined read boundary is required.');
  const dispatch = typeof readBoundary === 'function'
    ? readBoundary
    : readBoundary.dispatch?.bind(readBoundary);
  if (!dispatch) throw codeError('BROWNFIELD_READ_BOUNDARY_REQUIRED', 'Read boundary must expose dispatch().');
  const result = await dispatch({ operation: 'read', target: relativePath, maxBytes });
  if (!result || result.success !== true) {
    throw codeError(result?.code || 'BROWNFIELD_READ_DENIED', 'Confined source read was denied.');
  }
  return result;
}

function loadIgnoreFactory() {
  try {
    const frameworkRoot = path.resolve(__dirname, '..', '..', '..', '..');
    return require(require.resolve('ignore', { paths: [frameworkRoot] }));
  } catch (_error) {
    return null;
  }
}

function createSnapshotFs(snapshot) {
  const root = snapshot.projectRoot;
  const directorySet = new Set(['.']);
  for (const relativePath of snapshot.entries.keys()) {
    let current = path.posix.dirname(relativePath);
    while (current && current !== '.') {
      directorySet.add(current);
      current = path.posix.dirname(current);
    }
  }
  const locate = (input) => {
    const relative = normalize(path.relative(root, path.resolve(input)));
    if (relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) {
      throw codeError('SNAPSHOT_PATH_OUTSIDE', 'Snapshot access escaped the authorized project.');
    }
    return relative;
  };
  const existsSync = (input) => {
    try {
      const relative = locate(input);
      return snapshot.entries.has(relative) || directorySet.has(relative);
    } catch (_error) {
      return false;
    }
  };
  const stat = async (input) => {
    const relative = locate(input);
    const entry = snapshot.entries.get(relative);
    if (entry) return { size: entry.byteLength, mtime: new Date(0), mtimeMs: 0, isFile: () => true, isDirectory: () => false };
    if (directorySet.has(relative)) return { size: 0, mtime: new Date(0), mtimeMs: 0, isFile: () => false, isDirectory: () => true };
    throw Object.assign(new Error('Snapshot entry not found.'), { code: 'ENOENT' });
  };
  const readFile = async (input, encoding) => {
    const relative = locate(input);
    const entry = snapshot.entries.get(relative);
    if (!entry || entry.text === null) throw Object.assign(new Error('Snapshot entry not readable.'), { code: 'ENOENT' });
    return encoding ? entry.text : Buffer.from(entry.text, 'utf8');
  };
  const readdir = async (input, options = {}) => {
    const relative = locate(input);
    if (!directorySet.has(relative)) throw Object.assign(new Error('Snapshot directory not found.'), { code: 'ENOENT' });
    const prefix = relative === '.' ? '' : `${relative}/`;
    const names = new Map();
    for (const filePath of snapshot.entries.keys()) {
      if (!filePath.startsWith(prefix)) continue;
      const remainder = filePath.slice(prefix.length);
      const name = remainder.split('/')[0];
      if (!name) continue;
      names.set(name, remainder.includes('/') ? 'directory' : 'file');
    }
    return [...names.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([name, kind]) => (
      options.withFileTypes
        ? { name, isDirectory: () => kind === 'directory', isFile: () => kind === 'file', isSymbolicLink: () => false }
        : name
    ));
  };
  return Object.freeze({ existsSync, promises: Object.freeze({ readFile, readdir, stat }) });
}

async function createBrownfieldSnapshot(contract, options = {}) {
  const fsAdapter = options.fs || require('fs');
  const readBoundary = options.readBoundary;
  const startedAt = (options.monotonicClock || (() => Date.now()))();
  const rootIdentity = fsAdapter.realpathSync(contract.projectRoot);
  const entries = new Map();
  const sources = [];
  const diagnostics = [];
  const coverageCounts = {};
  const state = { files: 0, directories: 0, totalBytes: 0, truncated: false, secretExcluded: 0 };
  const ignoreFactory = options.ignoreFactory === undefined ? loadIgnoreFactory() : options.ignoreFactory;
  if (!ignoreFactory && contract.exclusions.length) {
    throw codeError('BROWNFIELD_IGNORE_UNAVAILABLE', 'Operator exclusions require the installed ignore parser.');
  }
  const operatorIgnoreState = createIgnoreState(ignoreFactory, contract.exclusions);
  const repositoryPolicies = new Map();
  const policyDirectories = new Map();
  const enumeratedDirectories = new Set();

  const count = (status) => { coverageCounts[status] = (coverageCounts[status] || 0) + 1; };
  const expired = () => (options.monotonicClock || (() => Date.now()))() - startedAt > contract.limits.maxElapsedMs;
  const relativeToRoot = (absolute) => normalize(path.relative(contract.projectRoot, absolute));
  const isOperatorExcluded = (relativePath, directory = false) => relativePath !== '.'
    && Boolean(operatorIgnoreState?.ignores(`${relativePath}${directory ? '/' : ''}`));
  // Keep policy syntax intact. A deeper policy may override a file rule, but
  // cannot resurrect an excluded ancestor directory (Git traversal semantics).
  const repositoryDecision = (relativePath, directory) => {
    let ignored = false;
    const policies = [...repositoryPolicies].sort(([left], [right]) => left.split('/').length
      - right.split('/').length || left.localeCompare(right));
    for (const [base, matcher] of policies) {
      if (base !== '.' && !relativePath.startsWith(`${base}/`)) continue;
      const local = base === '.' ? relativePath : relativePath.slice(base.length + 1);
      const decision = matcher.test(`${local}${directory ? '/' : ''}`);
      if (decision.ignored) ignored = true;
      else if (decision.unignored) ignored = false;
    }
    return ignored;
  };
  const isRepositoryIgnored = (relativePath, directory = false) => {
    if (relativePath === '.') return false;
    const parts = relativePath.split('/');
    for (let index = 1; index < parts.length; index += 1) {
      if (repositoryDecision(parts.slice(0, index).join('/'), true)) return true;
    }
    return repositoryDecision(relativePath, directory);
  };
  const isHardExcluded = (relativePath) => relativePath.split('/').some((part) => HARD_DIRECTORY_NAMES.has(part.toLowerCase()));

  async function registerIgnore(relativeDirectory, names) {
    if (policyDirectories.has(relativeDirectory)) return policyDirectories.get(relativeDirectory);
    if (!names.includes('.gitignore')) {
      policyDirectories.set(relativeDirectory, true);
      return true;
    }
    const ignorePath = relativeDirectory === '.' ? '.gitignore' : `${relativeDirectory}/.gitignore`;
    if (ignorePath === contract.output.path || isHardExcluded(relativeDirectory) || isOperatorExcluded(ignorePath)
      || isRepositoryIgnored(ignorePath)) {
      // Unknown rules must not silently widen the readable scope.
      diagnostics.push({ code: 'IGNORE_POLICY_EXCLUDED', path: ignorePath });
      count('unreadable');
      policyDirectories.set(relativeDirectory, false);
      return false;
    }
    if (!ignoreFactory) {
      throw codeError('BROWNFIELD_IGNORE_UNAVAILABLE', 'Nested ignore rules require the installed ignore parser.');
    }
    if (expired()) throw codeError('BROWNFIELD_ELAPSED_LIMIT', 'Snapshot policy capture exceeded its deadline.');
    if (state.files >= contract.limits.maxFiles) {
      throw codeError('BROWNFIELD_IGNORE_LIMIT', 'Ignore policies exceed the authorized snapshot limits.');
    }
    const remaining = contract.limits.maxTotalBytes - state.totalBytes;
    if (remaining < 1) throw codeError('BROWNFIELD_IGNORE_LIMIT', 'Ignore policy byte budget is exhausted.');
    const result = await boundaryRead(readBoundary, ignorePath, Math.min(contract.limits.maxFileBytes, remaining));
    const text = result.data;
    if (Buffer.byteLength(text, 'utf8') !== result.byteLength || sha256(Buffer.from(text, 'utf8')) !== result.sha256) {
      throw codeError('BROWNFIELD_IGNORE_INVALID', 'Ignore rules are not valid UTF-8 text.');
    }
    if (result.byteLength > contract.limits.maxFileBytes
      || state.totalBytes + result.byteLength > contract.limits.maxTotalBytes) {
      throw codeError('BROWNFIELD_IGNORE_LIMIT', 'Ignore rules exceed the authorized snapshot byte limit.');
    }
    state.totalBytes += result.byteLength;
    state.files += 1;
    const source = {
      id: computeSourceId(ignorePath, result.sha256),
      path: ignorePath,
      sha256: result.sha256,
      byteLength: result.byteLength,
      language: 'ignore',
      workspaceOwner: ownerFor(ignorePath, contract.allowedPaths),
      status: 'metadata-only',
    };
    sources.push(source);
    entries.set(ignorePath, { ...source, text });
    count('metadata-only');
    repositoryPolicies.set(relativeDirectory, ignoreFactory().add(text));
    policyDirectories.set(relativeDirectory, true);
    return true;
  }

  async function visitFile(absolutePath, relativePath, stat) {
    if (entries.has(relativePath)) return;
    if (expired()) {
      state.truncated = true;
      diagnostics.push({ code: 'MAX_ELAPSED_REACHED', path: relativePath });
      return;
    }
    state.files += 1;
    if (state.files > contract.limits.maxFiles) {
      state.truncated = true;
      diagnostics.push({ code: 'MAX_FILES_REACHED', path: null });
      return;
    }
    if (stat.nlink !== 1) {
      sources.push({ path: relativePath, language: languageFor(relativePath), workspaceOwner: ownerFor(relativePath, contract.allowedPaths), status: 'aliased' });
      count('aliased');
      return;
    }
    if (stat.size > contract.limits.maxFileBytes || state.totalBytes + stat.size > contract.limits.maxTotalBytes) {
      sources.push({ path: relativePath, language: languageFor(relativePath), workspaceOwner: ownerFor(relativePath, contract.allowedPaths), status: 'oversized', byteLength: stat.size });
      count('oversized');
      if (state.totalBytes + stat.size > contract.limits.maxTotalBytes) state.truncated = true;
      return;
    }
    let result;
    try {
      const remaining = contract.limits.maxTotalBytes - state.totalBytes;
      if (remaining < 1) throw codeError('BROWNFIELD_TOTAL_LIMIT', 'Snapshot byte budget is exhausted.');
      result = await boundaryRead(readBoundary, relativePath, Math.min(contract.limits.maxFileBytes, remaining));
    } catch (error) {
      sources.push({ path: relativePath, language: languageFor(relativePath), workspaceOwner: ownerFor(relativePath, contract.allowedPaths), status: error.code === 'CHANGED' ? 'changed' : 'unreadable' });
      diagnostics.push({ code: error.code || 'BROWNFIELD_READ_DENIED', path: relativePath });
      count(error.code === 'CHANGED' ? 'changed' : 'unreadable');
      return;
    }
    if (result.byteLength > contract.limits.maxFileBytes
      || state.totalBytes + result.byteLength > contract.limits.maxTotalBytes) {
      throw codeError('BROWNFIELD_TOTAL_LIMIT', 'Actual source bytes exceed the authorized snapshot byte limit.');
    }
    state.totalBytes += result.byteLength;
    const bytes = Buffer.from(result.data, 'utf8');
    let text = null;
    let status = 'metadata-only';
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (bytes.length !== result.byteLength || sha256(bytes) !== result.sha256) throw new Error('round-trip');
      text = result.data;
      const base = path.posix.basename(relativePath);
      status = SUPPORTED_EXTENSIONS.has(path.posix.extname(relativePath).toLowerCase()) || DATA_FILES.has(base)
        || base.endsWith('.schema.json') ? 'analyzed' : 'unsupported';
    } catch (_error) {
      status = 'binary';
    }
    const language = languageFor(relativePath);
    const source = {
      id: computeSourceId(relativePath, result.sha256),
      path: relativePath,
      sha256: result.sha256,
      byteLength: result.byteLength,
      language,
      workspaceOwner: ownerFor(relativePath, contract.allowedPaths),
      status,
    };
    sources.push(source);
    count(status);
    entries.set(relativePath, { ...source, text });
  }

  async function visitDirectory(absoluteDirectory, depth) {
    if (state.truncated || expired()) {
      state.truncated = true;
      if (!diagnostics.some((item) => item.code === 'MAX_ELAPSED_REACHED')) diagnostics.push({ code: 'MAX_ELAPSED_REACHED', path: null });
      return;
    }
    const relativeDirectory = relativeToRoot(absoluteDirectory);
    if (!enumeratedDirectories.has(relativeDirectory)) state.directories += 1;
    enumeratedDirectories.add(relativeDirectory);
    if (state.directories > contract.limits.maxDirectories || depth > contract.limits.maxDepth) {
      state.truncated = true;
      diagnostics.push({ code: depth > contract.limits.maxDepth ? 'MAX_DEPTH_REACHED' : 'MAX_DIRECTORIES_REACHED', path: null });
      return;
    }
    const before = fsAdapter.lstatSync(absoluteDirectory);
    if (!before.isDirectory() || before.isSymbolicLink()) {
      diagnostics.push({ code: 'DIRECTORY_ALIAS_REJECTED', path: relativeToRoot(absoluteDirectory) });
      return;
    }
    const rawEntries = fsAdapter.readdirSync(absoluteDirectory, { withFileTypes: true });
    if (expired()) {
      state.truncated = true;
      diagnostics.push({ code: 'MAX_ELAPSED_REACHED', path: relativeToRoot(absoluteDirectory) });
      return;
    }
    const names = rawEntries.map((entry) => entry.name).sort();
    if (!await registerIgnore(relativeDirectory, names)) return;
    for (const name of names) {
      if (state.truncated) break;
      const absolutePath = path.join(absoluteDirectory, name);
      const relativePath = relativeToRoot(absolutePath);
      if (relativePath === contract.output.path || relativePath.startsWith(`${contract.output.path}/`)) continue;
      const stat = fsAdapter.lstatSync(absolutePath);
      if (stat.isSymbolicLink()) {
        diagnostics.push({ code: 'ALIAS_REJECTED', path: relativePath });
        count('aliased');
        continue;
      }
      if (stat.isDirectory()) {
        if (HARD_DIRECTORY_NAMES.has(name.toLowerCase())) {
          count(['node_modules', 'vendor'].includes(name.toLowerCase()) ? 'vendored' : 'generated');
          continue;
        }
        if (isOperatorExcluded(relativePath, true) || isRepositoryIgnored(relativePath, true)) { count('ignored'); continue; }
        await visitDirectory(absolutePath, depth + 1);
        continue;
      }
      if (!stat.isFile()) continue;
      if (name === '.gitignore') continue;
      if (SECRET_NAMES.test(name)) { state.secretExcluded += 1; count('secret-excluded'); continue; }
      if (isOperatorExcluded(relativePath) || isRepositoryIgnored(relativePath)) { count('ignored'); continue; }
      await visitFile(absolutePath, relativePath, stat);
    }
    const after = fsAdapter.lstatSync(absoluteDirectory);
    if (before.dev !== after.dev || before.ino !== after.ino || before.mtimeMs !== after.mtimeMs) {
      throw codeError('BROWNFIELD_SOURCE_CHANGED', 'Directory identity changed during snapshot enumeration.');
    }
  }

  async function loadAncestorIgnores(relativePath) {
    const parent = path.posix.dirname(relativePath);
    const parts = parent === '.' ? [] : parent.split('/');
    const directories = ['.'];
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      directories.push(current);
    }
    for (const directory of directories) {
      if (isHardExcluded(directory) || isOperatorExcluded(directory, true)
        || isRepositoryIgnored(directory, true)) return false;
      if (policyDirectories.has(directory)) {
        if (!policyDirectories.get(directory)) return false;
        continue;
      }
      if (expired()) throw codeError('BROWNFIELD_ELAPSED_LIMIT', 'Ancestor policy traversal exceeded its deadline.');
      if (directories.length > contract.limits.maxDepth + 1) {
        throw codeError('BROWNFIELD_IGNORE_LIMIT', 'Ancestor policy traversal exceeds snapshot limits.');
      }
      if (!enumeratedDirectories.has(directory)) state.directories += 1;
      enumeratedDirectories.add(directory);
      if (state.directories > contract.limits.maxDirectories) {
        throw codeError('BROWNFIELD_IGNORE_LIMIT', 'Ancestor policy enumeration exceeds directory limits.');
      }
      const absoluteDirectory = directory === '.' ? contract.projectRoot : path.resolve(contract.projectRoot, directory);
      const names = fsAdapter.readdirSync(absoluteDirectory, { withFileTypes: true }).map((entry) => entry.name);
      if (!await registerIgnore(directory, names)) return false;
    }
    return true;
  }

  for (const allowedPath of contract.allowedPaths) {
    const absolute = path.resolve(contract.projectRoot, allowedPath);
    if (isHardExcluded(allowedPath)) {
      const pathParts = allowedPath.toLowerCase().split('/');
      count(['node_modules', 'vendor'].some((name) => pathParts.includes(name)) ? 'vendored' : 'generated');
      continue;
    }
    if (isOperatorExcluded(allowedPath)) { count('ignored'); continue; }
    let stat;
    try { stat = fsAdapter.lstatSync(absolute); } catch (_error) {
      throw codeError('BROWNFIELD_INPUT_MISSING', 'An allowed input is missing or unreadable.');
    }
    if (stat.isSymbolicLink()) throw codeError('BROWNFIELD_INPUT_ALIAS', 'Allowed inputs cannot be aliases.');
    if (isOperatorExcluded(allowedPath, stat.isDirectory())) { count('ignored'); continue; }
    if (!await loadAncestorIgnores(allowedPath)) { count('ignored'); continue; }
    if (isRepositoryIgnored(allowedPath, stat.isDirectory())) { count('ignored'); continue; }
    if (stat.isFile() && SECRET_NAMES.test(path.posix.basename(allowedPath))) { count('secret-excluded'); continue; }
    if (stat.isDirectory()) await visitDirectory(absolute, 0);
    else if (stat.isFile()) await visitFile(absolute, allowedPath, stat);
    else throw codeError('BROWNFIELD_INPUT_KIND', 'Allowed inputs must be ordinary files or directories.');
  }
  if (fsAdapter.realpathSync(contract.projectRoot) !== rootIdentity) {
    throw codeError('BROWNFIELD_ROOT_CHANGED', 'Project root identity changed during snapshot capture.');
  }
  sources.sort((left, right) => left.path.localeCompare(right.path));
  diagnostics.sort((left, right) => `${left.code}:${left.path || ''}`.localeCompare(`${right.code}:${right.path || ''}`));
  const snapshot = {
    projectRoot: contract.projectRoot,
    entries,
    sources,
    diagnostics,
    stats: { ...state, coverageCounts },
  };
  snapshot.fs = createSnapshotFs(snapshot);
  return snapshot;
}

module.exports = {
  DATA_FILES,
  HARD_DIRECTORY_NAMES,
  SECRET_NAMES,
  SUPPORTED_EXTENSIONS,
  createBrownfieldSnapshot,
  createSnapshotFs,
  languageFor,
};
