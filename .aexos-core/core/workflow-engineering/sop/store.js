'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { TextDecoder } = require('util');
const { clone, digest, stableStringify } = require('../../execution/durable-evidence');
const { fail, semanticHash, validateSopContract } = require('./contract');

const ZERO_HASH = '0'.repeat(64);
const MAX_FILES = 4096; const MAX_BYTES = 8 * 1024 * 1024; const MAX_HISTORY = 1024;
const stores = new WeakSet();
function inside(parent, child) { const relative = path.relative(parent, child); return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)); }
function validId(value) { return typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value); }
function assertId(value) { if (!validId(value)) fail('SOP_ID_INVALID', 'SOP identity is invalid.'); }

function ordinaryAncestry(selected) {
  let cursor = path.resolve(selected);
  while (true) {
    const stat = fs.lstatSync(cursor);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('SOP_STORE_ALIAS', 'Ordinary directory ancestry is required.');
    if (cursor === path.dirname(cursor)) break;
    cursor = path.dirname(cursor);
  }
}

function readOrdinaryFile(file, maxBytes = MAX_BYTES) {
  ordinaryAncestry(path.dirname(file));
  const before = fs.lstatSync(file);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) fail('SOP_INPUT_INVALID', 'Input must be an ordinary unaliased file.');
  if (before.size > maxBytes) fail('SOP_INPUT_LIMIT', 'Input exceeds its raw byte limit.');
  const fd = fs.openSync(file, 'r');
  try {
    const opened = fs.fstatSync(fd);
    if (opened.dev !== before.dev || opened.ino !== before.ino || opened.nlink !== 1) fail('SOP_INPUT_CHANGED', 'Input identity changed.');
    const bytes = Buffer.alloc(maxBytes + 1); let length = 0;
    while (length < bytes.length) {
      const read = fs.readSync(fd, bytes, length, bytes.length - length, null);
      if (!read) break;
      length += read;
    }
    if (length > maxBytes) fail('SOP_INPUT_LIMIT', 'Input exceeds its raw byte limit.');
    const after = fs.fstatSync(fd); const named = fs.lstatSync(file);
    if (after.size !== length || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs
      || named.dev !== opened.dev || named.ino !== opened.ino || named.nlink !== 1 || named.isSymbolicLink()) fail('SOP_INPUT_CHANGED', 'Input changed during bounded reading.');
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length)), stat: after };
  } finally { fs.closeSync(fd); }
}

function directoryIdentity(selected) {
  if (!path.isAbsolute(selected) || !fs.existsSync(selected)) fail('SOP_STORE_REQUIRED', 'Select an existing absolute protected operator control directory.');
  const resolved = path.resolve(selected); const real = fs.realpathSync(resolved);
  ordinaryAncestry(resolved);
  if (resolved !== real) fail('SOP_STORE_ALIAS', 'SOP control directory must not alias another path.');
  const stat = fs.lstatSync(real);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('SOP_STORE_UNPROTECTED', 'SOP control root must be an ordinary directory.');
  return { root: real, dev: stat.dev, ino: stat.ino };
}

function createSopStore(directory, options = {}) {
  const identity = directoryIdentity(directory);
  const consumer = fs.realpathSync(path.resolve(options.consumerRoot || process.cwd()));
  if (identity.root === path.parse(identity.root).root || inside(consumer, identity.root) || inside(identity.root, consumer)) fail('SOP_STORE_SCOPE', 'SOP state must remain outside the consumer workspace.');
  function assertIdentity() {
    ordinaryAncestry(identity.root);
    const stat = fs.lstatSync(identity.root);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.dev !== identity.dev || stat.ino !== identity.ino) fail('SOP_STORE_CHANGED', 'SOP control directory identity changed.');
  }
  function inventory() {
    assertIdentity(); const names = fs.readdirSync(identity.root);
    if (names.length > MAX_FILES) fail('SOP_STORE_LIMIT', 'SOP store inventory exceeds its bound.');
    return names;
  }
  function versionName(contract) { return `${contract.sopId}.v${String(contract.version).padStart(6, '0')}.${semanticHash(contract)}.json`; }
  function writeExclusive(name, value) {
    const bytes = Buffer.from(`${stableStringify(value)}\n`);
    if (bytes.length > MAX_BYTES) fail('SOP_STORE_LIMIT', 'SOP record exceeds its byte bound.');
    const target = path.join(identity.root, name); const temporary = path.join(identity.root, `.${name}.${crypto.randomBytes(12).toString('hex')}.tmp`);
    let fd = fs.openSync(temporary, 'wx', 0o600);
    try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    try {
      assertIdentity(); fs.linkSync(temporary, target); fs.unlinkSync(temporary);
      fd = fs.openSync(target, 'r+'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    } catch (error) { try { fs.unlinkSync(temporary); } catch (_ignored) { /* Best-effort orphan cleanup. */ } if (error.code === 'EEXIST') fail('SOP_STORE_CONFLICT', 'Immutable SOP record already exists.'); throw error; }
    return target;
  }
  function persistVersion(contract, lock) {
    assertLock(lock, contract.sopId);
    validateSopContract(contract); const name = versionName(contract);
    const existing = inventory().filter((item) => item.startsWith(`${contract.sopId}.v${String(contract.version).padStart(6, '0')}.`) && item.endsWith('.json'));
    if (existing.length) fail('SOP_VERSION_IMMUTABLE', 'SOP version content cannot be rewritten.');
    writeExclusive(name, { protocol: 'aexos.sop-version/v1', semanticHash: semanticHash(contract), contentHash: digest(contract), contract: clone(contract) });
    return { name, semanticHash: semanticHash(contract) };
  }
  function saveVersion(contract, heldLock = null) {
    validateSopContract(contract);
    if (heldLock) return persistVersion(contract, heldLock);
    const lock = acquire(contract.sopId);
    try { return persistVersion(contract, lock); } finally { release(lock); }
  }
  function loadVersion(sopId, version) {
    if (!validId(sopId) || !Number.isInteger(version)) fail('SOP_ID_INVALID', 'SOP identity is invalid.');
    const prefix = `${sopId}.v${String(version).padStart(6, '0')}.`;
    const names = inventory().filter((item) => item.startsWith(prefix) && item.endsWith('.json'));
    if (names.length !== 1) fail(names.length ? 'SOP_STORE_FORK' : 'SOP_VERSION_NOT_FOUND', names.length ? 'SOP version has conflicting immutable records.' : 'SOP version does not exist.');
    const file = path.join(identity.root, names[0]); const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > MAX_BYTES) fail('SOP_STORE_CORRUPT', 'SOP version is not a bounded ordinary file.');
    let value; try { value = JSON.parse(readOrdinaryFile(file).text); } catch (_error) { fail('SOP_STORE_CORRUPT', 'SOP version JSON is corrupt.'); }
    if (value.protocol !== 'aexos.sop-version/v1' || !value.contract || value.contract.sopId !== sopId || value.contract.version !== version || value.semanticHash !== semanticHash(value.contract) || value.contentHash !== digest(value.contract) || !names[0].endsWith(`.${value.semanticHash}.json`)) fail('SOP_STORE_CORRUPT', 'SOP version identity or content hash is invalid.');
    validateSopContract(value.contract); return clone(value);
  }
  function entries(sopId) {
    const expression = new RegExp(`^${sopId}\\.history\\.(\\d{6})\\.([a-f0-9]{64})\\.json$`);
    return inventory().map((name) => ({ name, match: name.match(expression) })).filter((item) => item.match)
      .map((item) => ({ name: item.name, sequence: Number(item.match[1]), hash: item.match[2] })).sort((a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name));
  }
  function history(sopId) {
    if (!validId(sopId)) fail('SOP_ID_INVALID', 'SOP identity is invalid.');
    const found = entries(sopId); if (found.length > MAX_HISTORY) fail('SOP_STORE_LIMIT', 'SOP history exceeds its bound.');
    let previousHash = ZERO_HASH;
    return found.map((entry, index) => {
      if (entry.sequence !== index + 1) fail('SOP_STORE_CORRUPT', 'SOP history has a gap, duplicate, or fork.');
      const file = path.join(identity.root, entry.name); const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > MAX_BYTES) fail('SOP_STORE_CORRUPT', 'SOP history record is invalid.');
      let record; try { record = JSON.parse(readOrdinaryFile(file, 64 * 1024).text); } catch (_error) { fail('SOP_STORE_CORRUPT', 'SOP history JSON is corrupt.'); }
      if (record.protocol !== 'aexos.sop-history/v1' || record.sopId !== sopId || record.sequence !== entry.sequence || record.previousHash !== previousHash || digest(record) !== entry.hash) fail('SOP_STORE_CORRUPT', 'SOP history hash chain is invalid.');
      previousHash = entry.hash; return record;
    });
  }
  const locks = new WeakMap();
  function acquire(sopId, clock = () => new Date()) {
    assertId(sopId);
    assertIdentity(); const token = crypto.randomBytes(24).toString('hex'); const lockPath = path.join(identity.root, `${sopId}.lock`);
    const value = { protocol: 'aexos.sop-lock/v1', sopId, pid: process.pid, token, createdAt: clock().toISOString() };
    let fd; try { fd = fs.openSync(lockPath, 'wx', 0o600); } catch (error) { if (error.code === 'EEXIST') fail('SOP_STORE_BUSY', 'SOP already has an exclusive writer.'); throw error; }
    let stat;
    try { fs.writeFileSync(fd, `${stableStringify(value)}\n`); fs.fsyncSync(fd); stat = fs.fstatSync(fd); } finally { fs.closeSync(fd); }
    const lock = Object.freeze({ sopId });
    locks.set(lock, { value, lockPath, stat });
    return lock;
  }
  function assertLock(lock, sopId = lock?.sopId) {
    assertId(sopId);
    const held = locks.get(lock);
    if (!held || held.value.sopId !== sopId) fail('SOP_STORE_LOCK_REQUIRED', 'SOP mutation requires this store and SOP writer lock.');
    assertIdentity();
    let current;
    try { current = readOrdinaryFile(held.lockPath, 4096); } catch (_error) { fail('SOP_STORE_LOCK_CHANGED', 'SOP writer lock cannot be verified.'); }
    if (current.stat.dev !== held.stat.dev || current.stat.ino !== held.stat.ino
      || current.stat.mtimeMs !== held.stat.mtimeMs || current.stat.ctimeMs !== held.stat.ctimeMs
      || digest(JSON.parse(current.text)) !== digest(held.value)) fail('SOP_STORE_LOCK_CHANGED', 'SOP writer lock identity changed.');
    return held;
  }
  function appendLifecycle(sopId, event, lock) {
    assertId(sopId); assertLock(lock, sopId);
    if (Buffer.byteLength(stableStringify(event)) > 60 * 1024) fail('SOP_STORE_LIMIT', 'Lifecycle event exceeds its byte bound.');
    const records = history(sopId); if (records.length >= MAX_HISTORY) fail('SOP_STORE_LIMIT', 'SOP history is full.');
    const record = { protocol: 'aexos.sop-history/v1', sopId, sequence: records.length + 1,
      previousHash: records.length ? digest(records.at(-1)) : ZERO_HASH, event: clone(event) };
    const hash = digest(record); writeExclusive(`${sopId}.history.${String(record.sequence).padStart(6, '0')}.${hash}.json`, record); return clone(record);
  }
  function append(sopId, event, lock) {
    assertId(sopId); assertLock(lock, sopId);
    if (event?.type === 'declaration') return appendLifecycle(sopId, { ...clone(event), assurance: 'unverified' }, lock);
    // The lifecycle module exposes only a verifier, never a public brand/mint.
    require('./lifecycle').consumeVerifiedEvent(store, sopId, event, lock);
    return appendLifecycle(sopId, event, lock);
  }
  function release(lock) { const held = assertLock(lock); fs.unlinkSync(held.lockPath); locks.delete(lock); }
  const store = Object.freeze({ root: identity.root, acquire, append, assertIdentity, history, loadVersion, release, saveVersion });
  stores.add(store);
  return store;
}

function assertSopStore(store) {
  if (!stores.has(store)) fail('SOP_STORE_REQUIRED', 'A branded ordinary immutable SOP store is required.');
}

module.exports = { createSopStore, assertSopStore, readOrdinaryFile };
