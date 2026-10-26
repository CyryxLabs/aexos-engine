'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createWorkflowControlStore } = require(path.resolve(__dirname, '../../../.aexos-core/core/execution/workflow-control-store'));

describe('external monotonic publication accounting', () => {
  let base;
  let root;
  let controlRoot;
  let account;
  const rootIdentity = '123:0:987';
  const ledgerIdentity = '123:0:988';
  const reserve = (transactionId, ids = [], ledger = null, reservedBytes = 1048576) => ({ action: 'reserve', rootIdentity,
    ledgerIdentity: ledger, transactionId, observedTransactionIds: ids, reservedBytes, ceilingBytes: 134217728 });
  const anchor = (transactionId, ids = []) => ({ action: 'anchor', rootIdentity, ledgerIdentity, transactionId, observedTransactionIds: ids });
  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-account-'));
    root = path.join(base, 'consumer'); controlRoot = path.join(base, 'control');
    fs.mkdirSync(root); fs.mkdirSync(controlRoot);
    account = createWorkflowControlStore(controlRoot, root).trustedPublicationAccounting;
  });
  afterEach(() => {
    if (path.dirname(base) === fs.realpathSync(os.tmpdir()) && path.basename(base).startsWith('aexos-account-')) fs.rmSync(base, { recursive: true, force: true });
  });

  test('retains reservations and ledger identity across a fresh controller', async () => {
    const first = crypto.randomUUID(); const second = crypto.randomUUID();
    await expect(account(reserve(first))).resolves.toMatchObject({ durablyRecorded: true, action: 'reserve', transactionId: first });
    await account(anchor(first));
    const fresh = createWorkflowControlStore(controlRoot, root).trustedPublicationAccounting;
    await expect(fresh(reserve(second, [first], ledgerIdentity))).resolves.toMatchObject({ durablyRecorded: true });
    await fresh(anchor(second, [first]));
    await expect(fresh({ ...anchor(first, [first, second]), action: 'reconcile' })).resolves.toMatchObject({ durablyRecorded: true });
    expect(fs.readdirSync(root)).toEqual([]);
  });

  test('cannot reset accounting by removing or replacing the mutable workspace ledger', async () => {
    const first = crypto.randomUUID();
    await account(reserve(first)); await account(anchor(first));
    const fresh = createWorkflowControlStore(controlRoot, root).trustedPublicationAccounting;
    await expect(fresh(reserve(crypto.randomUUID()))).rejects.toMatchObject({ code: 'WORKFLOW_ACCOUNTING_INVENTORY' });
    await expect(fresh(reserve(crypto.randomUUID(), [first], '123:0:999'))).rejects.toMatchObject({ code: 'WORKFLOW_ACCOUNTING_LEDGER_CHANGED' });
    await expect(fresh(reserve(crypto.randomUUID(), [first, crypto.randomUUID()], ledgerIdentity))).rejects.toMatchObject({ code: 'WORKFLOW_ACCOUNTING_INVENTORY' });
  });

  test('a committed reservation without an anchor remains charged and blocks fresh admission', async () => {
    await account(reserve(crypto.randomUUID()));
    const fresh = createWorkflowControlStore(controlRoot, root).trustedPublicationAccounting;
    await expect(fresh(reserve(crypto.randomUUID()))).rejects.toMatchObject({ code: 'WORKFLOW_ACCOUNTING_PENDING' });
  });

  test('a missing transaction after anchoring blocks admission and recovery', async () => {
    const first = crypto.randomUUID();
    await account(reserve(first)); await account(anchor(first));
    await expect(account(reserve(crypto.randomUUID(), [], ledgerIdentity))).rejects.toMatchObject({ code: 'WORKFLOW_ACCOUNTING_INVENTORY' });
    await expect(account({ ...anchor(first), action: 'reconcile' })).rejects.toMatchObject({ code: 'WORKFLOW_ACCOUNTING_INVENTORY' });
  });

  test('the retained ceiling cannot be renewed by controller restart', async () => {
    const ids = [];
    for (let index = 0; index < 8; index += 1) {
      const id = crypto.randomUUID();
      await account(reserve(id, ids, index ? ledgerIdentity : null, 16777216));
      await account(anchor(id, ids)); ids.push(id);
    }
    account = createWorkflowControlStore(controlRoot, root).trustedPublicationAccounting;
    await expect(account(reserve(crypto.randomUUID(), ids, ledgerIdentity, 1))).rejects.toMatchObject({ code: 'WORKFLOW_ACCOUNTING_QUOTA' });
    await expect(account({ ...anchor(ids[0], ids), action: 'reconcile' })).resolves.toMatchObject({ durablyRecorded: true });
  });

  test('corrupt, forked or partial trusted records fail closed', async () => {
    const id = crypto.randomUUID(); await account(reserve(id));
    const directory = path.join(controlRoot, fs.readdirSync(controlRoot)[0]);
    const record = path.join(directory, fs.readdirSync(directory)[0]);
    fs.appendFileSync(record, 'broken');
    await expect(account(anchor(id))).rejects.toMatchObject({ code: 'WORKFLOW_ACCOUNTING_CORRUPT' });
  });

  test('an outstanding control lock is not silently reclaimed', async () => {
    const id = crypto.randomUUID(); await account(reserve(id));
    const directory = path.join(controlRoot, fs.readdirSync(controlRoot)[0]);
    fs.writeFileSync(path.join(directory, 'accounting.lock'), 'held');
    await expect(account(anchor(id))).rejects.toMatchObject({ code: 'WORKFLOW_ACCOUNTING_BUSY' });
  });
});
