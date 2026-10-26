'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { sha256 } = require(path.resolve(__dirname, 'execution-binding'));
const { digest } = require(path.resolve(__dirname, 'durable-evidence'));
const { createPublicationAccountingStore } = require(path.resolve(__dirname, 'publication-accounting-store'));

const controlStores = new WeakSet();
const sopIssuers = new WeakMap();
const issuedSopRecords = new WeakMap();
const SOP_RECORD_LIMIT = 256 * 1024;

function fail(code, message) { throw Object.assign(new Error(message), { code }); }
function inside(root, target) {
  const relative = path.relative(root, target);
  return !relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function sopKey(type, runId, phaseId = '', attempt = 0) {
  return `sop-${sha256(JSON.stringify([type, runId, phaseId, attempt]))}.${type}.json`;
}

function assertSopRecord(record, type) {
  if (!record || record.protocol !== 'aexos.sop-runtime-association/v1'
    || record.recordType !== type || typeof record.runId !== 'string'
    || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/.test(record.runId)
    || !/^[a-f0-9]{64}$/.test(record.recordHash || '')) {
    fail('SOP_ASSOCIATION_RECORD_INVALID', 'SOP association record identity is invalid.');
  }
  const { recordHash, ...payload } = record;
  if (digest(payload) !== recordHash) fail('SOP_ASSOCIATION_RECORD_INVALID', 'SOP association record digest differs.');
  if (type !== 'run' && (typeof record.phaseId !== 'string' || !record.phaseId
    || !Number.isInteger(record.attempt) || record.attempt < 1 || record.attempt > 32)) {
    fail('SOP_ASSOCIATION_RECORD_INVALID', 'SOP phase association identity is invalid.');
  }
}

function assertSopIssuer(store, issuer, type, record = null) {
  const proof = sopIssuers.get(issuer);
  if (!proof || proof.store !== store || (record && (issuedSopRecords.get(record)?.issuer !== issuer
    || issuedSopRecords.get(record)?.type !== type))) {
    fail('SOP_ASSOCIATION_ISSUER_REQUIRED', 'Authenticated SOP association records require their live private issuer.');
  }
  if (record && (record.issuerId !== proof.issuerId || record.issuerBindingHash !== proof.bindingHash)) {
    fail('SOP_ASSOCIATION_ISSUER_MISMATCH', 'SOP association record issuer binding differs.');
  }
  return proof;
}

/** Operator-owned control plane. This path never comes from a task or run file.
 * The operator must protect it from writers able to modify the consumer workspace. */
function createWorkflowControlStore(directory, projectRoot) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) fail('WORKFLOW_CONTROL_REQUIRED', 'Select an existing absolute operator-owned control directory outside the consumer.');
  const root = path.resolve(directory);
  const project = fs.realpathSync(projectRoot);
  if (inside(project, root) || inside(root, project) || root === path.parse(root).root) {
    fail('WORKFLOW_CONTROL_SCOPE', 'The control store must be separate from the consumer project.');
  }
  const chain = [];
  let cursor = path.parse(root).root;
  for (const part of root.slice(cursor.length).split(path.sep)) {
    cursor = path.join(cursor, part);
    const stat = fs.lstatSync(cursor);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('WORKFLOW_CONTROL_ALIAS', 'Control storage requires existing ordinary directory ancestry.');
    chain.push({ path: cursor, dev: stat.dev, ino: stat.ino });
  }
  const assertIdentity = () => {
    for (const expected of chain) {
      const current = fs.lstatSync(expected.path);
      if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== expected.dev || current.ino !== expected.ino) {
        fail('WORKFLOW_CONTROL_CHANGED', 'Operator control storage identity changed.');
      }
    }
  };
  const writeSopRecord = (record, type) => {
    assertSopRecord(record, type);
    const bytes = Buffer.from(JSON.stringify(record), 'utf8');
    if (bytes.length > SOP_RECORD_LIMIT) fail('SOP_ASSOCIATION_RECORD_LIMIT', 'SOP association record exceeds its bounded size.');
    assertIdentity();
    const file = path.join(root, sopKey(type, record.runId, record.phaseId, record.attempt));
    let fd;
    try { fd = fs.openSync(file, 'wx', 0o600); }
    catch (error) {
      if (error.code === 'EEXIST') fail('SOP_ASSOCIATION_RECORD_IMMUTABLE', 'SOP association records cannot be overwritten or replayed.');
      throw error;
    }
    try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    assertIdentity();
    if (sha256(fs.readFileSync(file)) !== sha256(bytes)) fail('SOP_ASSOCIATION_RECORD_CHANGED', 'Retained SOP association bytes differ.');
    return { durablyRetained: true, recordHash: record.recordHash, fileKey: path.basename(file) };
  };
  const readSopRecord = (type, runId, phaseId = '', attempt = 0, optional = false) => {
    assertIdentity();
    const file = path.join(root, sopKey(type, runId, phaseId, attempt));
    if (optional && !fs.existsSync(file)) return null;
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > SOP_RECORD_LIMIT) {
      fail('SOP_ASSOCIATION_RECORD_INVALID', 'Retained SOP association must remain a bounded ordinary file.');
    }
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    assertIdentity();
    assertSopRecord(value, type);
    if (value.runId !== runId || (type !== 'run' && (value.phaseId !== phaseId || value.attempt !== attempt))) {
      fail('SOP_ASSOCIATION_RECORD_INVALID', 'Retained SOP association identity differs.');
    }
    return value;
  };
  const store = {
    root,
    projectRoot: project,
    assertIdentity,
    trustedPublicationAccounting: createPublicationAccountingStore(root, project, assertIdentity),
    async resolvePreparedReceipt(transactionId) {
      if (!/^[a-f0-9-]{32,36}$/i.test(transactionId)) fail('WORKFLOW_RECEIPT_INVALID', 'Recovery transaction identity is invalid.');
      assertIdentity();
      const file = path.join(root, `${transactionId}.prepared.json`);
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 64 * 1024) {
        fail('WORKFLOW_RECEIPT_INVALID', 'Retained receipt must remain a bounded ordinary file.');
      }
      const receipt = JSON.parse(fs.readFileSync(file, 'utf8'));
      assertIdentity();
      if (receipt.transactionId !== transactionId) fail('WORKFLOW_RECEIPT_INVALID', 'Retained transaction identity differs.');
      return receipt;
    },
    async retainPreparedReceipt(receipt) {
      if (!receipt || !/^[a-f0-9-]{32,36}$/i.test(receipt.transactionId)
        || !/^[a-f0-9]{64}$/.test(receipt.preparedSha256)) fail('WORKFLOW_RECEIPT_INVALID', 'Native prepared receipt identity is invalid.');
      const bytes = Buffer.from(JSON.stringify(receipt), 'utf8');
      if (bytes.length > 64 * 1024) fail('WORKFLOW_RECEIPT_LIMIT', 'Prepared receipt exceeds the bounded control record.');
      assertIdentity();
      const file = path.join(root, `${receipt.transactionId}.prepared.json`);
      const fd = fs.openSync(file, 'wx', 0o600);
      try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); }
      finally { fs.closeSync(fd); }
      assertIdentity();
      if (sha256(fs.readFileSync(file)) !== sha256(bytes)) fail('WORKFLOW_RECEIPT_CHANGED', 'Prepared receipt retention did not preserve exact bytes.');
      return { durablyRetained: true, transactionId: receipt.transactionId, preparedSha256: receipt.preparedSha256 };
    },
    async retainSopRun(record, issuer) {
      const proof = assertSopIssuer(store, issuer, 'run', record);
      const result = writeSopRecord(record, 'run');
      proof.retained.add(record.recordHash);
      return result;
    },
    async retainSopDispatch(record, issuer) {
      const proof = assertSopIssuer(store, issuer, 'dispatch', record);
      const header = readSopRecord('run', record?.runId);
      if (!proof.retained.has(header.recordHash) || header.issuerId !== proof.issuerId
        || header.issuerBindingHash !== proof.bindingHash) {
        fail('SOP_ASSOCIATION_RUN_UNAUTHENTICATED', 'SOP dispatch requires this issuer\'s exact retained run header.');
      }
      if (!header.phases.some((phase) => phase.phaseId === record.phaseId && phase.attempt === record.attempt)) {
        fail('SOP_ASSOCIATION_PHASE_UNKNOWN', 'SOP dispatch is outside the retained run header.');
      }
      if (record.headerRecordHash !== header.recordHash) {
        fail('SOP_ASSOCIATION_RUN_MISMATCH', 'SOP dispatch does not bind the exact retained run header.');
      }
      const result = writeSopRecord(record, 'dispatch');
      proof.retained.add(record.recordHash);
      return result;
    },
    async retainSopOutcome(record, issuer) {
      const proof = assertSopIssuer(store, issuer, 'outcome', record);
      const dispatch = readSopRecord('dispatch', record?.runId, record?.phaseId, record?.attempt);
      if (!proof.retained.has(dispatch.recordHash) || dispatch.issuerId !== proof.issuerId
        || dispatch.issuerBindingHash !== proof.bindingHash
        || record.dispatchRecordHash !== dispatch.recordHash || record.associationId !== dispatch.associationId) {
        fail('SOP_ASSOCIATION_DISPATCH_MISMATCH', 'SOP outcome does not bind the retained pending dispatch.');
      }
      const result = writeSopRecord(record, 'outcome');
      proof.retained.add(record.recordHash);
      return result;
    },
    async resolveSopRun(runId, issuer, options = {}) {
      const proof = assertSopIssuer(store, issuer, 'run');
      if (typeof runId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/.test(runId)) {
        fail('SOP_ASSOCIATION_RUN_INVALID', 'SOP run identity is invalid.');
      }
      const header = readSopRecord('run', runId, '', 0, true);
      if (!header) return null;
      if (!proof.retained.has(header.recordHash) || header.issuerId !== proof.issuerId
        || header.issuerBindingHash !== proof.bindingHash) {
        fail('SOP_ASSOCIATION_RUN_UNAUTHENTICATED', 'Retained SOP run was not issued by this live controller.');
      }
      const dispatches = []; const outcomes = []; const ineligibleOutcomeHashes = [];
      for (const phase of header.phases) {
        const dispatch = readSopRecord('dispatch', runId, phase.phaseId, phase.attempt, true);
        const outcome = readSopRecord('outcome', runId, phase.phaseId, phase.attempt, true);
        if (dispatch) {
          if (!proof.retained.has(dispatch.recordHash) || dispatch.issuerId !== proof.issuerId
            || dispatch.issuerBindingHash !== proof.bindingHash || dispatch.headerRecordHash !== header.recordHash
            || dispatch.associationDigest !== header.associationDigest) {
            fail('SOP_ASSOCIATION_LINK_INVALID', 'Retained SOP dispatch linkage or issuer differs.');
          }
          dispatches.push(dispatch);
        }
        if (outcome) {
          if (!dispatch || !proof.retained.has(outcome.recordHash) || outcome.issuerId !== proof.issuerId
            || outcome.issuerBindingHash !== proof.bindingHash || outcome.dispatchRecordHash !== dispatch.recordHash
            || outcome.associationId !== dispatch.associationId) {
            fail('SOP_ASSOCIATION_LINK_INVALID', 'Retained SOP outcome linkage or issuer differs.');
          }
          if (outcome.status !== 'completed' || proof.eligibleOutcomes.has(outcome.recordHash)) outcomes.push(outcome);
          else {
            ineligibleOutcomeHashes.push(outcome.recordHash);
            if (options.includeIneligible === true) outcomes.push(outcome);
          }
        }
      }
      return { header, dispatches, outcomes, ineligibleOutcomeHashes };
    },
  };
  controlStores.add(store);
  return store;
}

function createSopAssociationRecordIssuer(store, descriptor) {
  if (!controlStores.has(store) || !descriptor || typeof descriptor !== 'object') {
    fail('SOP_ASSOCIATION_ISSUER_INVALID', 'A live workflow store and exact host binding are required.');
  }
  const binding = {
    hostInstanceId: descriptor.hostInstanceId,
    policyRevision: descriptor.policyRevision,
    lifecycleProjectId: descriptor.lifecycleProjectId,
    projectRootHash: descriptor.projectRootHash,
    storeRootHash: sha256(store.root),
  };
  if (Object.values(binding).some((value) => typeof value !== 'string' || !value)) {
    fail('SOP_ASSOCIATION_ISSUER_INVALID', 'SOP issuer host, policy, project, root and store binding are required.');
  }
  const proof = { store, issuerId: randomUUID(), bindingHash: digest(binding), retained: new Set(), eligibleOutcomes: new Set() };
  const issuer = Object.freeze({ protocol: 'aexos.sop-runtime-association-issuer/v1' });
  sopIssuers.set(issuer, proof);
  function issue(type, payload) {
    const recordPayload = { ...payload, issuerId: proof.issuerId, issuerBindingHash: proof.bindingHash };
    const record = Object.freeze({ ...recordPayload, recordHash: digest(recordPayload) });
    issuedSopRecords.set(record, { issuer, type });
    return record;
  }
  return Object.freeze({
    issueRun: (payload) => issue('run', payload),
    issueDispatch: (payload) => issue('dispatch', payload),
    issueOutcome: (payload) => issue('outcome', payload),
    retainRun: (record) => store.retainSopRun(record, issuer),
    retainDispatch: (record) => store.retainSopDispatch(record, issuer),
    retainOutcome: (record) => store.retainSopOutcome(record, issuer),
    markOutcomeEligible(record) {
      assertSopIssuer(store, issuer, 'outcome', record);
      if (record.status !== 'completed' || !proof.retained.has(record.recordHash)) {
        fail('SOP_ASSOCIATION_OUTCOME_INELIGIBLE', 'Only an exact retained completed outcome may become conformance-eligible.');
      }
      proof.eligibleOutcomes.add(record.recordHash);
      return true;
    },
    resolveRun: (runId) => store.resolveSopRun(runId, issuer),
    inspectRun: (runId) => store.resolveSopRun(runId, issuer, { includeIneligible: true }),
  });
}

function assertWorkflowControlStore(store, projectRoot) {
  if (!controlStores.has(store) || store.projectRoot !== fs.realpathSync(projectRoot)) {
    fail('WORKFLOW_CONTROL_UNTRUSTED', 'A live workflow control store for the exact project is required.');
  }
  store.assertIdentity();
  return store;
}

module.exports = { assertWorkflowControlStore, createSopAssociationRecordIssuer, createWorkflowControlStore };
