'use strict';

const fs = require('fs');
const path = require('path');
const sop = require('../../../.aexos-core/core/workflow-engineering/sop');
const { digest, stableStringify } = require('../../../.aexos-core/core/execution/durable-evidence');
const { fixture, testHost } = require('./sop-test-host');

describe('SOP independent review invariant regressions', () => {
  const hosts = [];
  const setup = (options) => { const host = testHost(options); hosts.push(host); return host; };
  afterEach(() => { while (hosts.length) hosts.pop().cleanup(); });

  test('canonical revisions cannot bypass semantic review as rendering-only changes', async () => {
    const host = setup(); const first = fixture(); await host.act('create', first);
    const second = fixture(); second.version = 2; second.steps[0].instructions = 'Different canonical procedure';
    second.change = { reason: 'Update instructions', compatibilityImpact: 'Procedure changed', affectedConsumers: ['operators'],
      supersedesVersion: 1, migrationRef: 'migration/release-note-v2', classification: 'render-only' };
    const history = host.store.history(first.sopId);
    await expect(host.act('create', second)).rejects.toMatchObject({ code: 'SOP_CHANGE_INVALID' });
    expect(host.store.history(first.sopId)).toEqual(history);
    second.change.classification = 'semantic';
    await expect(host.act('create', second)).resolves.toMatchObject({ lifecycle: { state: 'Draft' } });
  });

  test('raw Effective declarations, forged hosts and public records cannot produce lifecycle authority', async () => {
    const host = setup(); const contract = fixture(); const hash = sop.semanticHash(contract);
    expect(() => sop.compileSop({ contract, semanticHash: hash, lifecycle: { state: 'Effective', assurance: 'operator-host-bound', approvedAt: new Date().toISOString() } })).toThrow(expect.objectContaining({ code: 'SOP_COMPILATION_AUTHORITY_REQUIRED' }));
    expect(() => sop.createSopLifecycle({ store: host.store, authorityHost: { verifyActor() {} } })).toThrow(expect.objectContaining({ code: 'SOP_AUTHORITY_UNAVAILABLE' }));
    host.store.saveVersion(contract);
    const lock = host.store.acquire(contract.sopId);
    try {
      expect(() => host.store.append(contract.sopId, { type: 'version-created', version: 1, semanticHash: hash }, lock)).toThrow(expect.objectContaining({ code: 'SOP_DECLARATION_ONLY' }));
      host.store.append(contract.sopId, { type: 'declaration', assurance: 'operator-host-bound', state: 'Effective' }, lock);
    } finally { host.store.release(lock); }
    expect(host.store.history(contract.sopId)[0].event.assurance).toBe('unverified');
    expect(() => host.lifecycle.snapshot(contract.sopId, 1)).toThrow(expect.objectContaining({ code: 'SOP_VERSION_NOT_FOUND' }));
  });

  test('rejects traversal before IO and locks from another SOP, store, clone or replaced file', () => {
    const host = setup(); const other = setup();
    const before = fs.readdirSync(host.root);
    for (const id of ['../escaped', 'a/b', '..', 'alpha.lock', '', 'a\\b']) {
      expect(() => host.store.acquire(id)).toThrow(expect.objectContaining({ code: 'SOP_ID_INVALID' }));
    }
    expect(fs.readdirSync(host.root)).toEqual(before);
    const alpha = host.store.acquire('alpha'); const beta = host.store.acquire('beta');
    try {
      expect(() => host.store.append('beta', { type: 'declaration' }, alpha)).toThrow();
      expect(() => other.store.append('alpha', { type: 'declaration' }, alpha)).toThrow();
      expect(() => host.store.append('alpha', { type: 'declaration' }, { ...alpha, lockPath: path.join(host.root, 'alpha.lock') })).toThrow();
      expect(host.store.history('beta')).toEqual([]);
    } finally { host.store.release(alpha); host.store.release(beta); }
    const replaced = host.store.acquire('alpha'); const file = path.join(host.root, 'alpha.lock');
    fs.writeFileSync(file, '{}');
    expect(() => host.store.append('alpha', { type: 'declaration' }, replaced)).toThrow(expect.objectContaining({ code: 'SOP_STORE_LOCK_CHANGED' }));
    expect(() => host.store.release(replaced)).toThrow();
  });

  test.each(['author-subject', 'owner-subject'])('uses retained creator and enrolled owner identity for %s self-review', async (subjectId) => {
    const host = setup(); const contract = fixture(); await host.act('create', contract);
    await expect(host.act('review', contract, {}, { subjectId, roleId: 'reviewer', dispatchId: 'different-dispatch' }))
      .rejects.toMatchObject({ code: 'SOP_SELF_REVIEW_DENIED' });
    expect(host.lifecycle.snapshot(contract.sopId, 1).lifecycle.state).toBe('Draft');
  });

  test('fails closed without owner enrollment and when review expires before approval', async () => {
    const missing = setup({ resolveOwner: undefined });
    await expect(missing.act('create', fixture())).rejects.toMatchObject({ code: 'SOP_OWNER_IDENTITY_REQUIRED' });
    const host = setup(); const contract = fixture(); contract.lifecyclePolicy.maxReviewAgeMs = 10;
    await host.advance(contract, 'review'); host.tick(11);
    await expect(host.act('approve', contract)).rejects.toMatchObject({ code: 'SOP_REVIEW_STALE' });
    const stricter = setup({ maxReviewAgeMs: 5 }); const longer = fixture();
    await stricter.advance(longer, 'review'); stricter.tick(6);
    await expect(stricter.act('approve', longer)).rejects.toMatchObject({ code: 'SOP_REVIEW_STALE' });
  });

  test('invalidates previously verified snapshots after lifecycle history changes', async () => {
    const host = setup(); const contract = fixture(); const snapshot = await host.advance(contract, 'approve');
    expect(() => sop.compileSop(structuredClone(snapshot))).toThrow();
    await host.act('activate', contract);
    expect(() => sop.compileSop(snapshot)).toThrow(expect.objectContaining({ code: 'SOP_SNAPSHOT_STALE' }));
    expect(Object.isFrozen(snapshot.lifecycle.events[0].owner)).toBe(true);
  });

  test.each([
    ['skipped gates', (events) => { events[1].action = 'approve'; events[1].to = 'Effective'; }],
    ['wrong hash', (events) => { events[1].semanticHash = '0'.repeat(64); }],
    ['wrong project', (events) => { events[1].projectId = 'other'; }],
    ['wrong policy', (events) => { events[1].policyHash = '0'.repeat(64); }],
    ['future event', (events) => { events[1].at = '2099-01-01T00:00:00.000Z'; }],
    ['time reversal', (events) => { events[2].at = events[0].at; }],
    ['unaccepted decision', (events) => { events[1].decision = 'rejected'; }],
    ['forged assurance', (events) => { events[1].assurance = 'operator-host-bound'; }],
    ['missing owner', (events) => { delete events[0].owner; }],
    ['missing retained review', (events) => { events[1].reviewReceipt = null; events[1].reviewReceiptHash = digest(null); }],
  ])('replay rejects %s even after public hashes are recomputed', async (_name, mutate) => {
    const host = setup(); const contract = fixture(); await host.advance(contract);
    const records = host.store.history(contract.sopId); const events = records.map((item) => item.event); mutate(events);
    // Simulate protected-store corruption, not a supported authority API.
    for (const name of fs.readdirSync(host.root).filter((name) => name.includes('.history.'))) fs.unlinkSync(path.join(host.root, name));
    let previousHash = '0'.repeat(64);
    for (const record of records) {
      record.previousHash = previousHash; const hash = digest(record);
      fs.writeFileSync(path.join(host.root, `${contract.sopId}.history.${String(record.sequence).padStart(6, '0')}.${hash}.json`), stableStringify(record));
      previousHash = hash;
    }
    expect(() => host.lifecycle.snapshot(contract.sopId, 1)).toThrow();
  });

  test.each(['deterministic', 'external', 'agentic', 'manual'])('approved %s compilation retains classifications and remains structural', async (kind) => {
    const host = setup(); const contract = fixture(); contract.steps[0].kind = kind;
    if (['external', 'agentic'].includes(kind)) contract.steps[0].capabilities = ['external.read'];
    const snapshot = await host.advance(contract, 'approve'); const result = sop.compileSop(snapshot);
    expect(result.executable).toBe(false); expect(result.diagnostics).toContain('runtime-adapter-required');
    expect(result.workflowMap.automationDecisions[0].classification).toBe(kind === 'deterministic' ? 'eligible' : kind === 'manual' ? 'manual' : 'governed');
  });

  test('renders untrusted Markdown, URLs, fences and HTML as inert text', () => {
    const contract = fixture();
    const active = '![img](https://example.invalid/a)\n# Heading\n```html\n<script>x</script>\n```\n[x](javascript:alert(1))';
    contract.steps[0].instructions = active; contract.title = active; contract.steps[0].capabilities = [active];
    const rendered = sop.renderSop(contract);
    for (const value of ['![img]', '```', '<script>', 'javascript:', '\n# Heading']) expect(rendered.markdown).not.toContain(value);
    expect(rendered.markdown).toContain('&#33;&#91;img&#93;');
    expect(sop.verifyProjection(contract, rendered.markdown).matches).toBe(true);
  });
});
