'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CEILING = 128 * 1024 * 1024;
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const fail = (code) => { throw Object.assign(new Error('Trusted publication accounting cannot authorize this operation.'), { code }); };
const idPattern = /^[a-f0-9-]{32,36}$/i;
const identityPattern = /^[0-9]+:[0-9]+:[0-9]+$/;
const sameIds = (left, right) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());

/** Monotonic reservations in operator-protected storage, never the mutable workspace ledger.
 * No charge release or stale-lock reclamation is performed automatically. */
function createPublicationAccountingStore(controlRoot, projectRoot, assertIdentity) {
  const projectKey = hash(process.platform === 'win32' ? projectRoot.toLowerCase() : projectRoot);
  const directory = path.join(controlRoot, `${projectKey}.publication-accounting`);
  const ensureDirectory = () => {
    assertIdentity();
    try { fs.mkdirSync(directory); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('WORKFLOW_ACCOUNTING_STORAGE');
  };

  function replay() {
    const names = fs.readdirSync(directory).filter((name) => name !== 'accounting.lock').sort();
    if (names.length > 2048 || names.some((name) => !/^\d{8}-[a-f0-9]{64}\.json$/.test(name))) fail('WORKFLOW_ACCOUNTING_CORRUPT');
    const state = { rootIdentity: null, ledgerIdentity: null, reservations: new Map(), total: 0, revision: 0, head: '0'.repeat(64) };
    for (const name of names) {
      const file = path.join(directory, name);
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 8192) fail('WORKFLOW_ACCOUNTING_CORRUPT');
      let record;
      try { record = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { fail('WORKFLOW_ACCOUNTING_CORRUPT'); }
      if (record.version !== 1 || record.projectKey !== projectKey || record.revision !== state.revision + 1
        || record.previousHash !== state.head || hash(JSON.stringify(record)) !== name.slice(9, 73)
        || Number(name.slice(0, 8)) !== record.revision || !identityPattern.test(record.rootIdentity)
        || !idPattern.test(record.transactionId)) fail('WORKFLOW_ACCOUNTING_CORRUPT');
      if (state.rootIdentity && record.rootIdentity !== state.rootIdentity) fail('WORKFLOW_ACCOUNTING_CORRUPT');
      state.rootIdentity = record.rootIdentity;
      if (record.action === 'reserve') {
        if (state.reservations.has(record.transactionId) || [...state.reservations.values()].some((item) => !item.anchored)
          || record.ledgerIdentity !== state.ledgerIdentity || !Number.isSafeInteger(record.reservedBytes)
          || record.reservedBytes < 1 || record.reservedBytes > 16 * 1024 * 1024) fail('WORKFLOW_ACCOUNTING_CORRUPT');
        state.total += record.reservedBytes;
        if (state.total > CEILING) fail('WORKFLOW_ACCOUNTING_CORRUPT');
        state.reservations.set(record.transactionId, { reservedBytes: record.reservedBytes, anchored: false });
      } else if (record.action === 'anchor') {
        const reservation = state.reservations.get(record.transactionId);
        if (!reservation || reservation.anchored || !identityPattern.test(record.ledgerIdentity)
          || (state.ledgerIdentity && state.ledgerIdentity !== record.ledgerIdentity)) fail('WORKFLOW_ACCOUNTING_CORRUPT');
        state.ledgerIdentity = record.ledgerIdentity;
        reservation.anchored = true;
      } else if (record.action === 'reconcile') {
        if (!state.reservations.get(record.transactionId)?.anchored || record.ledgerIdentity !== state.ledgerIdentity) fail('WORKFLOW_ACCOUNTING_CORRUPT');
      } else fail('WORKFLOW_ACCOUNTING_CORRUPT');
      state.revision = record.revision;
      state.head = name.slice(9, 73);
    }
    return state;
  }

  return async function trustedPublicationAccounting(event) {
    if (!event || !['reserve', 'anchor', 'reconcile'].includes(event.action)
      || !identityPattern.test(event.rootIdentity) || !idPattern.test(event.transactionId)
      || !(event.ledgerIdentity === null || identityPattern.test(event.ledgerIdentity))
      || !Array.isArray(event.observedTransactionIds) || event.observedTransactionIds.length > 512
      || event.observedTransactionIds.some((id) => !idPattern.test(id))
      || new Set(event.observedTransactionIds).size !== event.observedTransactionIds.length) fail('WORKFLOW_ACCOUNTING_EVENT');
    ensureDirectory();
    const lock = path.join(directory, 'accounting.lock');
    let descriptor;
    try { descriptor = fs.openSync(lock, 'wx', 0o600); }
    catch (error) { if (error.code === 'EEXIST') fail('WORKFLOW_ACCOUNTING_BUSY'); throw error; }
    const lockIdentity = fs.fstatSync(descriptor);
    try {
      const state = replay();
      if (state.rootIdentity && state.rootIdentity !== event.rootIdentity) fail('WORKFLOW_ACCOUNTING_ROOT_CHANGED');
      const expectedIds = [...state.reservations].filter(([, item]) => item.anchored).map(([id]) => id);
      if (!sameIds(event.observedTransactionIds, expectedIds)) fail('WORKFLOW_ACCOUNTING_INVENTORY');
      if (event.action !== 'anchor' && event.ledgerIdentity !== state.ledgerIdentity) fail('WORKFLOW_ACCOUNTING_LEDGER_CHANGED');
      if (event.action === 'reserve') {
        if ([...state.reservations.values()].some((item) => !item.anchored)) fail('WORKFLOW_ACCOUNTING_PENDING');
        if (state.reservations.has(event.transactionId)) fail('WORKFLOW_ACCOUNTING_DUPLICATE');
        if (event.ceilingBytes !== CEILING || !Number.isSafeInteger(event.reservedBytes)
          || event.reservedBytes < 1 || event.reservedBytes > 16 * 1024 * 1024) fail('WORKFLOW_ACCOUNTING_EVENT');
        if (state.total + event.reservedBytes > CEILING) fail('WORKFLOW_ACCOUNTING_QUOTA');
      } else if (event.action === 'anchor') {
        const pending = state.reservations.get(event.transactionId);
        if (!pending || pending.anchored || !identityPattern.test(event.ledgerIdentity)
          || (state.ledgerIdentity && state.ledgerIdentity !== event.ledgerIdentity)) fail('WORKFLOW_ACCOUNTING_ANCHOR');
      } else if (!state.reservations.get(event.transactionId)?.anchored
        || [...state.reservations.values()].some((item) => !item.anchored)) fail('WORKFLOW_ACCOUNTING_PENDING');
      if (state.revision >= 2048) fail('WORKFLOW_ACCOUNTING_LIMIT');
      const record = { version: 1, projectKey, revision: state.revision + 1, previousHash: state.head,
        action: event.action, rootIdentity: event.rootIdentity, ledgerIdentity: event.ledgerIdentity,
        transactionId: event.transactionId, ...(event.action === 'reserve' ? { reservedBytes: event.reservedBytes } : {}),
        observedInventoryHash: hash(JSON.stringify([...event.observedTransactionIds].sort())),
      };
      const bytes = Buffer.from(JSON.stringify(record), 'utf8');
      const target = path.join(directory, `${String(record.revision).padStart(8, '0')}-${hash(bytes)}.json`);
      assertIdentity();
      const fd = fs.openSync(target, 'wx', 0o600);
      try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      assertIdentity();
      return { durablyRecorded: true, action: event.action, rootIdentity: event.rootIdentity,
        ledgerIdentity: event.ledgerIdentity, transactionId: event.transactionId };
    } finally {
      fs.closeSync(descriptor);
      const current = fs.lstatSync(lock);
      if (current.dev === lockIdentity.dev && current.ino === lockIdentity.ino && current.isFile() && !current.isSymbolicLink()) fs.unlinkSync(lock);
    }
  };
}

module.exports = { createPublicationAccountingStore };
