/** Immutable checkpoint store for operator-owned durable research state. */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  digest,
  stableStringify,
  validateEvidence,
} = require('../execution/durable-evidence');
const {
  TERMINAL,
  assertMonotonicArtifact,
  assertTransition,
  fail,
  validateCheckpoint,
} = require('./contract');
const {
  acquireWriterLease,
  assertWriterLease,
  closeWriterLease,
} = require('./writer-lease');

const ZERO_HASH = '0'.repeat(64);
const MAX_INVENTORY = 1024;
const MAX_COORDINATION_BYTES = 4096;
const RUN_ID = /^[a-z][a-z0-9-]{0,63}$/;

function validateRunId(runId) {
  if (typeof runId !== 'string' || !RUN_ID.test(runId)) {
    fail('RESEARCH_RUN_INVALID', 'Run identity is invalid.');
  }
}

function fileIdentity(stat) {
  return { dev: String(stat.dev), ino: String(stat.ino) };
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

async function withLeaseRelease(operation, release) {
  let result;
  let primaryError = null;
  try { result = await operation(); }
  catch (error) { primaryError = error; }
  let releaseError = null;
  try { await release(); }
  catch (error) { releaseError = error; }
  if (primaryError) throw primaryError;
  if (releaseError) throw releaseError;
  return result;
}

function isCanonicalTimestamp(value) {
  if (typeof value !== 'string') return false;
  try { return new Date(value).toISOString() === value; }
  catch (_error) { return false; }
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return !relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function ordinaryDirectoryChain(root) {
  const chain = [];
  let cursor = path.parse(root).root;
  for (const part of root.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    const stat = fs.lstatSync(cursor);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      fail('RESEARCH_STORE_ALIAS', 'Research state requires ordinary directory ancestry.');
    }
    chain.push({ path: cursor, dev: stat.dev, ino: stat.ino });
  }
  return chain;
}

function createResearchStore(directory, consumerRoot = process.cwd()) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) {
    fail('RESEARCH_STORE_REQUIRED', 'Select an existing absolute operator-owned state directory.');
  }
  const selectedRoot = path.resolve(directory);
  const selectedChain = ordinaryDirectoryChain(selectedRoot);
  const root = fs.realpathSync(selectedRoot);
  if (path.relative(root, selectedRoot) || path.relative(selectedRoot, root)) {
    fail('RESEARCH_STORE_ALIAS', 'Research state directory aliases another location.');
  }
  const consumer = fs.realpathSync(consumerRoot);
  if (root === path.parse(root).root || inside(consumer, root) || inside(root, consumer)) {
    fail('RESEARCH_STORE_SCOPE', 'Research state must remain separate from the consumer workspace.');
  }
  const chain = selectedChain;
  const rootIdentity = fileIdentity(fs.statSync(root, { bigint: true }));
  const legacyLocks = new WeakMap();
  const recoverableLocks = new WeakMap();

  function assertIdentity() {
    for (const expected of chain) {
      const current = fs.lstatSync(expected.path);
      if (!current.isDirectory() || current.isSymbolicLink()
        || current.dev !== expected.dev || current.ino !== expected.ino) {
        fail('RESEARCH_STORE_CHANGED', 'Operator state directory identity changed.');
      }
    }
  }

  function inventory() {
    assertIdentity();
    const names = fs.readdirSync(root);
    if (names.length > MAX_INVENTORY) fail('RESEARCH_STORE_LIMIT', 'Research state inventory exceeds its bound.');
    return names;
  }

  function checkpointEntries(runId) {
    validateRunId(runId);
    const expression = new RegExp(`^${runId}\\.(\\d{6})\\.([a-f0-9]{64})\\.json$`);
    return inventory().map((name) => ({ name, match: name.match(expression) }))
      .filter((entry) => entry.match)
      .map((entry) => ({ name: entry.name, revision: Number(entry.match[1]), fileHash: entry.match[2] }))
      .sort((left, right) => left.revision - right.revision || left.name.localeCompare(right.name));
  }

  function readEntry(entry, stateLimit) {
    const file = path.join(root, entry.name);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > stateLimit) {
      fail('RESEARCH_CHECKPOINT_CORRUPT', 'Checkpoint is not a bounded ordinary file.');
    }
    let checkpoint;
    try { checkpoint = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (_error) { fail('RESEARCH_CHECKPOINT_CORRUPT', 'Checkpoint JSON is corrupt.'); }
    validateCheckpoint(checkpoint);
    if (digest(checkpoint) !== entry.fileHash || checkpoint.revision !== entry.revision) {
      fail('RESEARCH_CHECKPOINT_CORRUPT', 'Checkpoint filename identity does not match its contents.');
    }
    return checkpoint;
  }

  function validateLoaded(checkpoints, expected = {}) {
    let previousHash = ZERO_HASH;
    let previousArtifact = null;
    const seenRevisions = new Set();
    for (const checkpoint of checkpoints) {
      if (seenRevisions.has(checkpoint.revision)
        || checkpoint.revision !== seenRevisions.size + 1
        || checkpoint.previousCheckpointHash !== previousHash) {
        fail('RESEARCH_CHECKPOINT_CORRUPT', 'Checkpoint sequence is missing, duplicated, or forked.');
      }
      seenRevisions.add(checkpoint.revision);
      const artifact = checkpoint.artifact;
      if (!previousArtifact && (artifact.status !== 'created'
        || artifact.events.length !== 1 || artifact.events[0].type !== 'created')) {
        fail('RESEARCH_CHECKPOINT_CORRUPT', 'First checkpoint must be the created lifecycle state.');
      }
      if (!validateEvidence(artifact.events)) fail('RESEARCH_CHECKPOINT_CORRUPT', 'Research event chain is invalid.');
      if (expected.planHash && artifact.planHash !== expected.planHash) fail('RESEARCH_PLAN_DRIFT', 'Plan differs from persisted run identity.');
      if (expected.policyHash && artifact.policyHash !== expected.policyHash) fail('RESEARCH_POLICY_DRIFT', 'Operator policy differs from persisted run identity.');
      if (previousArtifact) {
        if (artifact.runId !== previousArtifact.runId
          || artifact.planHash !== previousArtifact.planHash
          || artifact.policyHash !== previousArtifact.policyHash) {
          fail('RESEARCH_CHECKPOINT_CORRUPT', 'Checkpoint protocol identity changed.');
        }
        assertTransition(previousArtifact.status, artifact.status);
        assertMonotonicArtifact(previousArtifact, artifact);
        if (TERMINAL.has(previousArtifact.status)) {
          fail('RESEARCH_CHECKPOINT_CORRUPT', 'A terminal research state has a successor.');
        }
      }
      previousArtifact = artifact;
      previousHash = digest(checkpoint);
    }
    if (previousArtifact) {
      const terminalEvents = previousArtifact.events.filter((event) => TERMINAL.has(event.type));
      if (TERMINAL.has(previousArtifact.status)) {
        if (terminalEvents.length !== 1 || terminalEvents[0].type !== previousArtifact.status) {
          fail('RESEARCH_CHECKPOINT_CORRUPT', 'Terminal state does not have exactly one matching terminal event.');
        }
      } else if (terminalEvents.length) fail('RESEARCH_CHECKPOINT_CORRUPT', 'Nonterminal state contains a terminal event.');
      if (previousArtifact.status === 'completed' && previousArtifact.lineageStatus !== 'valid') {
        fail('RESEARCH_CHECKPOINT_CORRUPT', 'Completed research must have valid citation lineage.');
      }
    }
    return previousArtifact;
  }

  function load(runId, expected = {}) {
    validateRunId(runId);
    const entries = checkpointEntries(runId);
    if (!entries.length) fail('RESEARCH_RUN_NOT_FOUND', 'Research run does not exist.');
    const first = readEntry(entries[0], expected.maxStateBytes || 4 * 1024 * 1024);
    const stateLimit = first.artifact.limits.maxStateBytes;
    const retainedBytes = entries.reduce((sum, entry) => {
      const stat = fs.lstatSync(path.join(root, entry.name));
      return sum + stat.size;
    }, 0);
    if (retainedBytes > stateLimit) {
      fail('RESEARCH_STATE_LIMIT', 'Retained checkpoint bytes exceed the run state bound.');
    }
    const checkpoints = entries.map((entry, index) => index === 0 ? first : readEntry(entry, stateLimit));
    if (checkpoints.length > first.artifact.limits.maxCheckpointCount) {
      fail('RESEARCH_CHECKPOINT_LIMIT', 'Persisted checkpoint count exceeds the run limit.');
    }
    const artifact = validateLoaded(checkpoints, expected);
    return { artifact, checkpoint: checkpoints.at(-1), checkpointCount: checkpoints.length };
  }

  function loadIfPresent(runId, expected = {}) {
    return checkpointEntries(runId).length ? load(runId, expected) : null;
  }

  function acquire(runId, clock = () => new Date()) {
    validateRunId(runId);
    assertIdentity();
    const token = crypto.randomBytes(32).toString('hex');
    const lock = { protocol: 'aexos.research-lock/v1', runId, pid: process.pid,
      token, createdAt: clock().toISOString() };
    const lockPath = path.join(root, `${runId}.lock`);
    let fd;
    try { fd = fs.openSync(lockPath, 'wx', 0o600); }
    catch (error) {
      if (error.code === 'EEXIST') fail('RESEARCH_BUSY', 'Research run already has an exclusive writer.');
      throw error;
    }
    try { fs.writeFileSync(fd, `${stableStringify(lock)}\n`); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    const issued = { ...lock, lockPath };
    const coordination = readCoordination(lockPath);
    legacyLocks.set(issued, {
      coordination: { ...coordination, metadata: Object.freeze({ ...coordination.metadata }) },
      lockPath,
    });
    return issued;
  }

  function readCoordination(lockPath) {
    let before;
    try { before = fs.lstatSync(lockPath, { bigint: true }); }
    catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
      || before.size > BigInt(MAX_COORDINATION_BYTES)) {
      fail('RESEARCH_LOCK_CHANGED', 'Research coordination metadata is unsafe.');
    }
    let fd;
    let bytes;
    let opened;
    let after;
    try {
      fd = fs.openSync(lockPath, 'r');
      opened = fs.fstatSync(fd, { bigint: true });
      if (!opened.isFile() || opened.nlink !== 1n || !sameFileIdentity(fileIdentity(before), fileIdentity(opened))) {
        fail('RESEARCH_LOCK_CHANGED', 'Research coordination metadata changed while opening.');
      }
      bytes = fs.readFileSync(fd);
      after = fs.fstatSync(fd, { bigint: true });
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
    if (bytes.length > MAX_COORDINATION_BYTES
      || !sameFileIdentity(fileIdentity(opened), fileIdentity(after))
      || opened.size !== after.size || opened.mtimeNs !== after.mtimeNs) {
      fail('RESEARCH_LOCK_CHANGED', 'Research coordination metadata changed while reading.');
    }
    let metadata;
    try { metadata = JSON.parse(bytes.toString('utf8')); }
    catch (_error) { fail('RESEARCH_LOCK_CHANGED', 'Research coordination metadata is corrupt.'); }
    return { bytes, identity: fileIdentity(after), metadata };
  }

  function validateV2Metadata(metadata, runId, namespace) {
    const keys = ['createdAt', 'namespace', 'pid', 'protocol', 'rootIdentity', 'runId', 'token'];
    if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object'
      || Object.keys(metadata).sort().join('|') !== keys.join('|')
      || metadata.protocol !== 'aexos.research-lock/v2'
      || metadata.runId !== runId || metadata.namespace !== namespace
      || !Number.isSafeInteger(metadata.pid) || metadata.pid <= 0
      || typeof metadata.token !== 'string' || !/^[a-f0-9]{64}$/.test(metadata.token)
      || !isCanonicalTimestamp(metadata.createdAt)
      || !metadata.rootIdentity || Array.isArray(metadata.rootIdentity)
      || Object.keys(metadata.rootIdentity).sort().join('|') !== 'dev|ino'
      || !sameFileIdentity(metadata.rootIdentity, rootIdentity)) {
      fail('RESEARCH_LOCK_CHANGED', 'Research coordination metadata is not valid v2 state.');
    }
  }

  function sameCoordination(left, right) {
    return sameFileIdentity(left.identity, right.identity) && left.bytes.equals(right.bytes);
  }

  async function acquireRecoverable(runId, clock = () => new Date()) {
    validateRunId(runId);
    assertIdentity();
    const lease = await acquireWriterLease({ rootIdentity, runId });
    const lockPath = path.join(root, `${runId}.lock`);
    let recovered = false;
    try {
      assertIdentity();
      const existing = readCoordination(lockPath);
      if (existing) {
        if (existing.metadata?.protocol === 'aexos.research-lock/v1') {
          fail('RESEARCH_RECOVERY_UNAVAILABLE', 'Legacy research locks are not recoverable.');
        }
        validateV2Metadata(existing.metadata, runId, lease.namespace);
        loadIfPresent(runId);
        assertIdentity();
        const current = readCoordination(lockPath);
        if (!current || !sameCoordination(existing, current)) {
          fail('RESEARCH_LOCK_CHANGED', 'Research coordination metadata changed before recovery.');
        }
        fs.unlinkSync(lockPath);
        recovered = true;
      }

      const token = crypto.randomBytes(32).toString('hex');
      const metadata = {
        protocol: 'aexos.research-lock/v2',
        runId,
        pid: process.pid,
        token,
        namespace: lease.namespace,
        rootIdentity,
        createdAt: clock().toISOString(),
      };
      const bytes = Buffer.from(`${stableStringify(metadata)}\n`, 'utf8');
      let fd;
      try { fd = fs.openSync(lockPath, 'wx', 0o600); }
      catch (error) {
        if (error.code === 'EEXIST') fail('RESEARCH_BUSY', 'Research run already has an exclusive writer.');
        throw error;
      }
      try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); }
      finally { fs.closeSync(fd); }
      const current = readCoordination(lockPath);
      validateV2Metadata(current.metadata, runId, lease.namespace);
      if (!current.bytes.equals(bytes)) fail('RESEARCH_LOCK_CHANGED', 'Research coordination metadata changed.');
      const registryMetadata = Object.freeze({
        ...current.metadata,
        rootIdentity: Object.freeze({ ...current.metadata.rootIdentity }),
      });
      const lock = { ...registryMetadata, rootIdentity: { ...registryMetadata.rootIdentity }, lockPath };
      recoverableLocks.set(lock, {
        coordination: { ...current, metadata: registryMetadata },
        lease,
        lockPath,
        recovered,
      });
      return lock;
    } catch (error) {
      try { await closeWriterLease(lease); } catch (_closeError) { /* preserve primary error */ }
      throw error;
    }
  }

  function assertLock(lock, expectedRunId) {
    if (lock && recoverableLocks.has(lock)) {
      const state = recoverableLocks.get(lock);
      const metadata = state.coordination.metadata;
      if (expectedRunId !== undefined && expectedRunId !== metadata.runId) {
        fail('RESEARCH_LOCK_REQUIRED', 'Research writer lock does not authorize this run.');
      }
      assertIdentity();
      if (lock.lockPath !== state.lockPath || lock.protocol !== metadata.protocol
        || lock.runId !== metadata.runId || lock.pid !== metadata.pid
        || lock.token !== metadata.token || lock.namespace !== metadata.namespace
        || lock.createdAt !== metadata.createdAt) {
        fail('RESEARCH_LOCK_CHANGED', 'Research writer lock object changed.');
      }
      assertWriterLease(state.lease);
      const current = readCoordination(lock.lockPath);
      if (!current || !sameCoordination(state.coordination, current)) {
        fail('RESEARCH_LOCK_CHANGED', 'Research writer lock identity changed.');
      }
      validateV2Metadata(current.metadata, lock.runId, state.lease.namespace);
      return metadata.runId;
    }
    if (lock?.protocol === 'aexos.research-lock/v2') {
      fail('RESEARCH_LOCK_REQUIRED', 'Research writer lock is not recognized.');
    }
    const state = lock && legacyLocks.get(lock);
    if (!state) {
      fail('RESEARCH_LOCK_REQUIRED', 'Checkpoint commit requires the exclusive writer lock.');
    }
    const metadata = state.coordination.metadata;
    if (expectedRunId !== undefined && expectedRunId !== metadata.runId) {
      fail('RESEARCH_LOCK_REQUIRED', 'Research writer lock does not authorize this run.');
    }
    assertIdentity();
    if (lock.lockPath !== state.lockPath || lock.protocol !== 'aexos.research-lock/v1'
      || metadata.protocol !== 'aexos.research-lock/v1' || lock.runId !== metadata.runId
      || lock.pid !== process.pid || lock.pid !== metadata.pid || lock.token !== metadata.token
      || lock.createdAt !== metadata.createdAt) {
      fail('RESEARCH_LOCK_CHANGED', 'Research writer lock object changed.');
    }
    const current = readCoordination(state.lockPath);
    if (!current || !sameCoordination(state.coordination, current)) {
      fail('RESEARCH_LOCK_CHANGED', 'Research writer lock identity changed.');
    }
    return metadata.runId;
  }

  function release(lock) {
    if (lock && recoverableLocks.has(lock)) return releaseRecoverable(lock);
    assertLock(lock);
    fs.unlinkSync(lock.lockPath);
    legacyLocks.delete(lock);
  }

  async function releaseRecoverable(lock) {
    const state = lock && recoverableLocks.get(lock);
    if (!state) fail('RESEARCH_LOCK_REQUIRED', 'Research writer lock is not recognized.');
    let primaryError = null;
    try {
      assertLock(lock);
      fs.unlinkSync(lock.lockPath);
    } catch (error) {
      primaryError = error;
    } finally {
      recoverableLocks.delete(lock);
      try { await closeWriterLease(state.lease); }
      catch (error) { if (!primaryError) primaryError = error; }
    }
    if (primaryError) throw primaryError;
  }

  async function recover(runId, clock = () => new Date()) {
    const lock = await acquireRecoverable(runId, clock);
    const status = recoverableLocks.get(lock).recovered ? 'recovered' : 'not-needed';
    return withLeaseRelease(async () => {
      load(runId);
      return { schemaVersion: 'aexos.research-recovery/v1', runId, status };
    }, () => releaseRecoverable(lock));
  }

  function commit(artifact, lock) {
    const runId = assertLock(lock, artifact?.runId);
    const loaded = loadIfPresent(runId, { planHash: artifact.planHash, policyHash: artifact.policyHash,
      maxStateBytes: artifact.limits.maxStateBytes });
    if (!loaded && (artifact.status !== 'created'
      || artifact.events.length !== 1 || artifact.events[0].type !== 'created')) {
      fail('RESEARCH_CHECKPOINT_INVALID', 'First checkpoint must be the created lifecycle state.');
    }
    const revision = (loaded?.checkpoint.revision || 0) + 1;
    if (revision > artifact.limits.maxCheckpointCount) fail('CHECKPOINT_LIMIT', 'Research checkpoint limit is exhausted.');
    const previousCheckpointHash = loaded ? digest(loaded.checkpoint) : ZERO_HASH;
    artifact.recovery.revision = revision;
    artifact.recovery.previousCheckpointHash = previousCheckpointHash;
    const checkpoint = { protocol: 'aexos.research-checkpoint/v1', revision,
      previousCheckpointHash, artifact };
    validateCheckpoint(checkpoint);
    if (loaded) {
      assertTransition(loaded.artifact.status, artifact.status);
      assertMonotonicArtifact(loaded.artifact, artifact);
    }
    const bytes = Buffer.from(`${stableStringify(checkpoint)}\n`, 'utf8');
    if (bytes.length > artifact.limits.maxStateBytes) fail('RESEARCH_STATE_LIMIT', 'Research checkpoint exceeds the configured state bound.');
    const retainedBytes = checkpointEntries(runId).reduce((sum, entry) =>
      sum + fs.lstatSync(path.join(root, entry.name)).size, 0);
    const requiredBytes = TERMINAL.has(artifact.status) ? bytes.length : bytes.length * 2 + 4096;
    if (retainedBytes + requiredBytes > artifact.limits.maxStateBytes) {
      fail('CHECKPOINT_LIMIT', 'Research retained checkpoint storage is exhausted.');
    }
    const fileHash = digest(checkpoint);
    const filename = `${runId}.${String(revision).padStart(6, '0')}.${fileHash}.json`;
    const target = path.join(root, filename);
    const token = recoverableLocks.get(lock)?.coordination.metadata.token || lock.token;
    const temporary = path.join(root, `.${runId}.${revision}.${token}.tmp`);
    let fd = fs.openSync(temporary, 'wx', 0o600);
    try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    try {
      assertLock(lock, runId);
      if (fs.existsSync(target)) fail('RESEARCH_CHECKPOINT_FORK', 'Checkpoint target already exists.');
      // Same-directory rename publishes complete bytes atomically for this trusted local store.
      // The exclusive lock is coordination, not protection from a hostile filesystem writer.
      fs.renameSync(temporary, target);
      fd = fs.openSync(target, 'r+');
      try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      if (!fs.readFileSync(target).equals(bytes)) fail('RESEARCH_PERSISTENCE_ERROR', 'Persisted checkpoint bytes differ.');
    } finally {
      try { fs.unlinkSync(temporary); } catch (_error) {
        // Orphaned temporary files are never checkpoints and are ignored on recovery.
      }
    }
    assertLock(lock, runId);
    return { checkpoint, fileHash };
  }

  return {
    root,
    acquire,
    acquireRecoverable,
    assertIdentity,
    commit,
    load,
    loadIfPresent,
    recover,
    release,
    releaseRecoverable,
  };
}

module.exports = { createResearchStore };
