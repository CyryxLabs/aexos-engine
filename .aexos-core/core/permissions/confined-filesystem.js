'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { checkDenyList } = require('./path-guard');
const { OPERATIONS, rejected, validateOperation } = require(path.resolve(__dirname, 'guarded-publication-protocol.js'));
const { inspectNativePublication } = require(path.resolve(__dirname, 'windows-publication-adapter.js'));

const MESSAGES = {
  INVALID: 'Require an explicit read/create operation, authorized absolute project root and nonempty target.',
  OUTSIDE: 'Target must remain inside the authorized project.',
  PROTECTED: 'Protected/system paths cannot be authorized for structured access.',
  ALIAS: 'Traversal, device names, alternate streams and filesystem aliases are not supported.',
  KIND: 'Only regular single-link files and existing ordinary parent directories are supported.',
  CHANGED: 'Filesystem identity changed; retry after reviewing the project.',
  RECOVERY_REQUIRED: 'Deletion, move, replacement and overwrite require a reviewed recovery contract.',
  UNSUPPORTED_CREATE: 'Atomic confined creation requires a reviewed handle-relative filesystem adapter on this platform.',
  IO: 'Structured filesystem access failed; check target existence and access permissions.',
  READ_LIMIT: 'Structured read exceeds the explicitly authorized byte limit.',
  INVALID_READ_LIMIT: 'maxBytes must be an integer between 1 byte and 16 MiB.',
};

function reject(code) { return { allowed: false, code, reason: MESSAGES[code] }; }
function inside(root, target) {
  const rel = path.relative(root, target);
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}
function same(a, b) { return a.dev === b.dev && a.ino === b.ino; }
function readBounded(handle, maximum, opened) {
  const exceeded = () => { throw Object.assign(new Error('READ_LIMIT'), { code: 'READ_LIMIT' }); };
  if (opened.size > maximum) exceeded();
  const bytes = Buffer.alloc(maximum + 1);
  let length = 0;
  while (length < bytes.length) {
    const count = fs.readSync(handle, bytes, length, bytes.length - length, length);
    if (count === 0) break;
    length += count;
  }
  if (length > maximum) exceeded();
  const current = fs.fstatSync(handle);
  if (current.size > maximum) exceeded();
  if (current.size !== opened.size || current.mtimeMs !== opened.mtimeMs || current.ctimeMs !== opened.ctimeMs) {
    throw Object.assign(new Error('CHANGED'), { code: 'CHANGED' });
  }
  return bytes.subarray(0, length);
}
function protectedRoot(root) {
  const forbidden = process.platform === 'win32'
    ? [process.env.SystemRoot || 'C:\\Windows', process.env.ProgramFiles || 'C:\\Program Files',
      process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', process.env.ProgramData || 'C:\\ProgramData']
    : ['/etc', '/usr', '/bin', '/sbin', '/lib', '/lib64', '/proc', '/sys', '/dev', '/boot'];
  return root === path.parse(root).root || path.relative(root, os.homedir()) === ''
    || forbidden.some((entry) => inside(path.resolve(entry), root));
}

// Validate every existing ancestor without following links, including project ancestors.
function inspectTarget(operation, target, projectRoot) {
  if (typeof operation !== 'string' || !operation) return reject('INVALID');
  if (!['read', 'create'].includes(operation)) return reject('RECOVERY_REQUIRED');
  if (typeof projectRoot !== 'string' || !path.isAbsolute(projectRoot)
    || typeof target !== 'string' || !target.trim()) return reject('INVALID');
  const pieces = target.split(/[/\\]/);
  if (pieces.some((part) => part === '..' || /[. ]$/.test(part)
    || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))
    // Control bytes are deliberately rejected before resolving filesystem paths.
    // eslint-disable-next-line no-control-regex
    || /[\x00-\x1f%]/.test(target) || /^[/\\]{2}/.test(target)
    || /:/.test(target.replace(/^[A-Za-z]:[/\\]/, ''))
    || (process.platform !== 'win32' && /\\/.test(target))) return reject('ALIAS');
  const root = path.resolve(projectRoot);
  const resolved = path.resolve(root, target);
  if (!inside(root, resolved) || resolved === root) return reject('OUTSIDE');
  if (protectedRoot(root) || checkDenyList(resolved.toLowerCase(), root.toLowerCase()).denied
    || path.relative(root, resolved).split(path.sep).some((part) => ['.ssh', '.aws', '.gnupg', '.git'].includes(part.toLowerCase()))) return reject('PROTECTED');
  try {
    const chain = [];
    let cursor = path.parse(resolved).root;
    const parts = resolved.slice(cursor.length).split(path.sep);
    for (let i = 0; i < parts.length; i++) {
      cursor = path.join(cursor, parts[i]);
      let stat;
      try { stat = fs.lstatSync(cursor); } catch (error) {
        if (error.code === 'ENOENT' && i === parts.length - 1 && operation === 'create') break;
        throw error;
      }
      if (stat.isSymbolicLink()) return reject('ALIAS');
      if (i < parts.length - 1 && !stat.isDirectory()) return reject('KIND');
      if (i === parts.length - 1) {
        if (!stat.isFile() || stat.nlink !== 1) return reject('KIND');
        if (operation === 'create') return reject('RECOVERY_REQUIRED');
      }
      chain.push({ target: cursor, stat });
    }
    const canonical = fs.realpathSync(root);
    if (canonical.toLowerCase() !== root.toLowerCase()) return reject('ALIAS');
    return { allowed: true, resolved, root, identity: path.relative(root, resolved), chain };
  } catch (_error) { return reject('IO'); }
}

class ConfinedFilesystem {
  constructor({ projectRoot, audit = () => {} } = {}) {
    this.projectRoot = projectRoot;
    this.audit = audit;
  }

  async dispatch(request = {}, context = {}) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) request = {};
    const { operation, target } = request;
    if (OPERATIONS.includes(operation)) {
      const invalid = validateOperation(request);
      if (invalid) return rejected(invalid);
      const inspectionOperation = operation === 'guarded-recoverable-replace' ? 'read' : 'create';
      const inspected = inspectTarget(inspectionOperation, target, this.projectRoot);
      if (!inspected.allowed) return rejected(inspected.code, operation === 'guarded-recover' ? 'RECOVERY_CONFLICT' : 'REJECTED_BEFORE_MUTATION');
      return inspectNativePublication(request, { ...context, projectRoot: this.projectRoot });
    }
    let decision = inspectTarget(operation, target, this.projectRoot);
    if (operation === 'read' && request.maxBytes !== undefined
      && (!Number.isSafeInteger(request.maxBytes) || request.maxBytes < 1 || request.maxBytes > 16 * 1024 * 1024)) {
      decision = reject('INVALID_READ_LIMIT');
    }
    let handle;
    let data;
    let fileIdentity;
    let sha256;
    let byteLength;
    try {
      if (decision.allowed && operation === 'create') {
        // Node exposes no portable directory-relative exclusive atomic publication.
        // Fail closed until an adapter can guarantee publication without parent races.
        decision = reject('UNSUPPORTED_CREATE');
      }
      if (decision.allowed) {
        handle = fs.openSync(decision.resolved, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
        const opened = fs.fstatSync(handle);
        const latest = inspectTarget(operation, target, this.projectRoot);
        if (!latest.allowed || !same(opened, decision.chain.at(-1).stat)
          || latest.chain.length !== decision.chain.length
          || latest.chain.some((entry, index) => !same(entry.stat, decision.chain[index].stat))) {
          decision = reject('CHANGED');
        } else {
          const bytes = request.maxBytes === undefined ? fs.readFileSync(handle) : readBounded(handle, request.maxBytes, opened);
          data = bytes.toString('utf8');
          byteLength = bytes.length;
          sha256 = require('node:crypto').createHash('sha256').update(bytes).digest('hex');
          const identity = fs.fstatSync(handle, { bigint: true });
          fileIdentity = `${identity.dev}:${identity.ino >> 32n}:${identity.ino & 0xffffffffn}`;
        }
      }
    } catch (error) { decision = reject(['READ_LIMIT', 'CHANGED'].includes(error.code) ? error.code : 'IO'); }
    finally { if (handle !== undefined) fs.closeSync(handle); }
    const record = Object.freeze({ operation: ['read', 'create', 'delete', 'move', 'overwrite'].includes(operation) ? operation : 'invalid',
      decision: decision.allowed ? 'allowed' : 'denied', code: decision.code || 'OK',
      ...(decision.allowed ? { identity: decision.identity.slice(0, 240) } : {}) });
    this.audit(record);
    return decision.allowed ? { success: true, data, identity: decision.identity, fileIdentity, sha256, byteLength }
      : { success: false, status: 'denied', code: decision.code, reason: decision.reason };
  }
}

module.exports = { ConfinedFilesystem, inspectTarget };
