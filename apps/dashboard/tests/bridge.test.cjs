'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCloudBridge } = require('../../../.aexos-core/core/virtual-office/cloud/bridge');
const { parse, runConnect } = require('../../../.aexos-core/core/virtual-office/cloud/connect-cli');
const { projectIdentity } = require('../../../.aexos-core/core/virtual-office/host-bridge');
const { normalizeEvent } = require('../../../.aexos-core/core/virtual-office/event-normalizer');
const { VirtualOfficeProjector } = require('../../../.aexos-core/core/virtual-office/state-projector');
const { createVirtualOfficeServer } = require('../../../.aexos-core/core/virtual-office/server');
const reviewedKeys = require('../../../.aexos-core/core/virtual-office/cloud/catalog-keys.json');

const PROJECT = '11111111-1111-4111-8111-111111111111';
const EPOCH = '22222222-2222-4222-8222-222222222222';
const TOKEN = 'A'.repeat(43);
const ENDPOINT = 'https://example.supabase.co/functions/v1/aexos-telemetry/ingest';
const PRIVATE = 'PRIVATE-prompt-message-source-path-error-credential';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-cloud-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const known = reviewedKeys[0];
  const now = Date.now();
  const catalog = { version: 'test', squadCount: 1, agentCount: 2, squads: [{ id: 'test', name: 'Test', agents: [
    { id: 'known', name: 'Known', key: known, squadId: 'test' },
    { id: 'private', name: 'Private', key: 'private/not-reviewed', squadId: 'test' },
  ] }] };
  const projector = new VirtualOfficeProjector(catalog);
  projector.apply(normalizeEvent({ id: 'event-exact', type: 'CommandStart', timestamp: now, agentId: 'known',
    sessionId: 'local-one', host: 'cli', state: 'running', evidence: 'runtime', message: PRIVATE, task: PRIVATE, command: PRIVATE }));
  projector.apply(normalizeEvent({ id: 'event-private', type: 'AgentWaiting', timestamp: now - 1, agentId: 'private',
    sessionId: 'local-two', host: 'codex', state: 'waiting', evidence: 'invented', message: PRIVATE }));
  const office = {
    projectRoot: root,
    projectId: projectIdentity(root),
    catalog,
    projector: { getSnapshot: () => { const snapshot = projector.getSnapshot(); return { ...snapshot,
      sessions: snapshot.sessions.map((row) => row.agentKey === 'private/not-reviewed' ? { ...row, evidence: 'invented' } : row),
      events: [...snapshot.events.map((row) => row.agentKey === 'private/not-reviewed' ? { ...row, evidence: 'invented' } : row),
        { ...snapshot.events[0], id: 'event-unmatched', sessionId: 'not-local', timestamp: now - 2 }] }; } },
    stop: async () => {},
  };
  return { root, office, known };
}

function options(root, overrides = {}) {
  return { projectRoot: root, projectId: PROJECT, epoch: EPOCH, token: TOKEN,
    endpoint: ENDPOINT, approvedOrigin: 'https://example.supabase.co', ...overrides };
}

function textFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const candidate = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...textFiles(candidate));
    else if (entry.isFile()) files.push(fs.readFileSync(candidate, 'utf8'));
  }
  return files;
}

test('bridge emits only bounded reviewed metadata with exact or null session links', async (t) => {
  const { root, office, known } = fixture(t);
  const bridge = await createCloudBridge(office, options(root));
  const payload = bridge.envelope();
  const encoded = JSON.stringify(payload);

  assert.equal(payload.sessions[0].agentKey, known);
  assert.equal(payload.sessions[1].agentKey, null);
  assert.equal(payload.events[0].agentKey, known);
  assert.equal(payload.events[0].sessionId, payload.sessions[0].id);
  assert.equal(payload.events[1].agentKey, null);
  assert.equal(payload.events[2].sessionId, null);
  assert.equal(payload.events[1].evidence, 'unavailable');
  assert.doesNotMatch(encoded, /PRIVATE|prompt|message|sourcePath|credential|local-one|local-two|not-local/);
  assert.doesNotMatch(encoded, new RegExp(TOKEN));

  await bridge.stop();
});

test('bridge rejects root, endpoint and redirect violations before accepting transport', async (t) => {
  const { root, office } = fixture(t);
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-other-'));
  t.after(() => fs.rmSync(other, { recursive: true, force: true }));
  await assert.rejects(createCloudBridge(office, options(other)), /CLOUD_ROOT_MISMATCH/);
  await assert.rejects(createCloudBridge(office, options(root, { endpoint: ENDPOINT.replace('https:', 'http:') })), /INVALID_INGEST_ENDPOINT/);
  await assert.rejects(createCloudBridge(office, options(root, { endpoint: `${ENDPOINT}?redirect=https://attacker.example` })), /INVALID_INGEST_ENDPOINT/);
  await assert.rejects(createCloudBridge(office, options(root, { approvedOrigin: 'https://attacker.example' })), /UNAPPROVED_INGEST_ORIGIN/);

  let request;
  const bridge = await createCloudBridge(office, options(root, { fetch: async (url, init) => {
    request = { url, init };
    return new Response('', { status: 302, headers: { Location: 'https://attacker.example' } });
  } }));
  await assert.rejects(bridge.upload(), /INGEST_HTTP_302/);
  assert.equal(request.init.redirect, 'error');
  await bridge.stop();
});

test('bridge coalesces uploads, reports sanitized status, and stop waits for the active flight', async (t) => {
  const { root, office } = fixture(t);
  const statuses = [];
  let calls = 0;
  let release;
  const response = new Promise((resolve) => { release = resolve; });
  const bridge = await createCloudBridge(office, options(root, {
    onStatus: (value) => statuses.push(value),
    fetch: async (_url, init) => { calls += 1; assert.equal(init.redirect, 'error'); return response; },
  }));
  const first = bridge.upload();
  const second = bridge.upload();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  const stopping = bridge.stop();
  release(new Response('', { status: 200 }));
  assert.deepEqual(await first, { accepted: true, sequence: 1 });
  assert.deepEqual(await second, { accepted: true, sequence: 1 });
  await stopping;
  assert.deepEqual(statuses, [{ state: 'connected', sequence: 1 }]);
  assert.doesNotMatch(JSON.stringify(statuses), /PRIVATE|example\.supabase|Bearer|A{20}/);
  await assert.rejects(bridge.upload(), /BRIDGE_STOPPED/);
});

test('connect CLI accepts token only from process environment or hidden reader and never persists it', async (t) => {
  const { root, office } = fixture(t);
  const args = ['--project-root', root, '--project-id', PROJECT, '--epoch', EPOCH, '--ingest-url', ENDPOINT, '--origin', 'https://example.supabase.co'];
  assert.throws(() => parse([...args, '--token', TOKEN]), /INVALID_CONNECT_OPTION/);
  assert.throws(() => parse([...args, '--ingest-url', ENDPOINT]), /DUPLICATE_CONNECT_OPTION/);

  const records = { officeArgs: null, logs: [], fetches: 0, stopped: 0 };
  const env = { AEXOS_DASHBOARD_INGEST_TOKEN: TOKEN };
  const result = await runConnect(args, {
    env, handleSignals: false,
    output: { log: (value) => records.logs.push(value) },
    runOffice: async (officeArgs) => {
      records.officeArgs = officeArgs;
      const local = createVirtualOfficeServer({ projectRoot: root, catalog: office.catalog, config: {
        host: '127.0.0.1', port: 0, heartbeatTtlMs: 30000, recentCompletionMs: 12000,
        eventHistoryLimit: 50, maxEventBytes: 8192, pollingIntervalMs: 50,
      } });
      await local.start();
      const stop = local.stop.bind(local);
      local.stop = async () => { records.stopped += 1; await stop(); };
      return local;
    },
    fetch: async () => { records.fetches += 1; return new Response('', { status: 200 }); },
    readToken: async () => { throw new Error('hidden reader should not run'); },
  });
  assert.equal(Object.hasOwn(env, 'AEXOS_DASHBOARD_INGEST_TOKEN'), false);
  assert.equal(records.fetches, 1);
  assert.deepEqual(records.officeArgs, ['--project-root', fs.realpathSync(root), '--no-open']);
  assert.doesNotMatch(JSON.stringify([args, records.officeArgs, records.logs]), new RegExp(TOKEN));
  await result.stop();
  assert.equal(records.stopped, 1);
  assert.doesNotMatch(textFiles(root).join('\n'), new RegExp(TOKEN));

  let hiddenReads = 0;
  const second = await runConnect(args, { env: {}, handleSignals: false, output: { log() {} },
    readToken: async () => { hiddenReads += 1; return TOKEN; },
    runOffice: async () => office, fetch: async () => new Response('', { status: 200 }) });
  assert.equal(hiddenReads, 1);
  await second.stop();
});
