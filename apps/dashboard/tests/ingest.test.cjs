'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { TextEncoder } = require('node:util');
const { ReadableStream } = require('node:stream/web');

const PROJECT = '11111111-1111-4111-8111-111111111111';
const EPOCH = '22222222-2222-4222-8222-222222222222';
const TOKEN = 'A'.repeat(43);
const SERVICE = 'sb_secret_service_test';
const NOW = 1793020000000;
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

async function setup(send = async () => json({ accepted: true })) {
  const [{ createIngestHandler }, schema, catalog] = await Promise.all([
    import('../supabase/functions/aexos-telemetry/handler.mjs'),
    import('../../../.aexos-core/core/virtual-office/cloud/schema.mjs'),
    Promise.resolve(require('../../../.aexos-core/core/virtual-office/cloud/catalog-keys.json')),
  ]);
  const key = catalog[0];
  const payload = { schemaVersion: 1, projectId: PROJECT, epoch: EPOCH, sequence: 1, observedAt: NOW,
    sessions: [{ id: hash('session'), agentKey: key, host: 'cli', state: 'running', lastSeen: NOW, evidence: 'runtime' }],
    events: [{ id: hash('event'), sessionId: hash('session'), agentKey: key, type: 'CommandStart', state: 'running', timestamp: NOW, host: 'cli', evidence: 'runtime' }],
    omitted: { sessions: 0, events: 0 } };
  return { handler: createIngestHandler({ supabaseUrl: 'https://example.supabase.co', serviceKey: SERVICE,
    catalogKeys: new Set(catalog), fetch: send, now: () => NOW }), payload, schema };
}

function request(body, headers = {}, options = {}) {
  return new Request('https://example.supabase.co/aexos-telemetry/ingest', {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...headers },
    body, ...options,
  });
}

test('edge accepts only the exact bounded metadata envelope and forwards no raw content', async () => {
  const calls = [];
  const { handler, payload } = await setup(async (url, init) => { calls.push({ url: String(url), init }); return json({ accepted: true }); });
  const response = await handler(request(JSON.stringify(payload)));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { accepted: true, sequence: 1 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.redirect, 'error');
  assert.equal(calls[0].url, 'https://example.supabase.co/rest/v1/rpc/aexos_ingest');
  const rpc = JSON.parse(calls[0].init.body);
  assert.deepEqual(rpc.p_payload, payload);
  assert.equal(rpc.p_token_hash, hash(TOKEN));
  assert.doesNotMatch(calls[0].init.body, new RegExp(TOKEN));
  assert.equal(calls[0].init.headers.Authorization, undefined);
});

test('edge accepts the explicit v2 identity and rejects missing or malformed identities', async () => {
  const calls = [];
  const { handler, payload } = await setup(async (_url, init) => { calls.push(JSON.parse(init.body)); return json({ accepted: true }); });
  const next = { ...payload, schemaVersion: 2, identityEpoch: EPOCH };
  assert.equal((await handler(request(JSON.stringify(next)))).status, 200);
  assert.equal(calls[0].p_payload.identityEpoch, EPOCH);
  assert.equal((await handler(request(JSON.stringify({ ...next, identityEpoch: 'bad' })))).status, 400);
  delete next.identityEpoch;
  assert.equal((await handler(request(JSON.stringify(next)))).status, 400);
  assert.equal(calls.length, 1);
});

test('edge rejects unknown fields, wrong types, row excess, future data and unknown catalog keys before DB authority', async () => {
  let calls = 0;
  const { handler, payload, schema } = await setup(async () => { calls += 1; return json({}); });
  const mutations = [
    (value) => { value.prompt = 'private'; },
    (value) => { value.sequence = '1'; },
    (value) => { value.omitted.events = -1; },
    (value) => { value.observedAt = NOW + schema.LIMITS.futureMs + 1; },
    (value) => { value.sessions[0].agentKey = 'not/reviewed'; },
    (value) => { value.events[0].error = 'private'; },
    (value) => { value.sessions = Array.from({ length: schema.LIMITS.sessions + 1 }, (_, index) => ({ ...value.sessions[0], id: hash(`s-${index}`) })); },
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(payload); mutate(candidate);
    const response = await handler(request(JSON.stringify(candidate)));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'REQUEST_REJECTED' });
  }
  assert.equal(calls, 0);
});

test('missing credentials and DB token refusal grant no ingest authority or diagnostic detail', async () => {
  let calls = 0;
  const { handler, payload } = await setup(async () => { calls += 1; return json({ message: 'token not found: PRIVATE' }, 401); });
  for (const authorization of [undefined, 'Bearer short', 'Basic ' + TOKEN]) {
    const headers = authorization ? { Authorization: authorization } : { Authorization: '' };
    const response = await handler(request(JSON.stringify(payload), headers));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'INGEST_DENIED' });
  }
  assert.equal(calls, 0);
  const denied = await handler(request(JSON.stringify(payload), { Authorization: `Bearer ${'B'.repeat(43)}` }));
  assert.equal(denied.status, 401);
  assert.deepEqual(await denied.json(), { error: 'INGEST_DENIED' });
  assert.equal(calls, 1);
});

test('rate limit and reordered sequence statuses are stable while other DB errors remain generic', async () => {
  const { payload } = await setup();
  for (const [message, upstream, expected, code] of [
    ['RATE_LIMIT', 400, 429, 'RATE_LIMITED'],
    ['OLD_SEQUENCE', 400, 409, 'OLD_SEQUENCE'],
    ['PRIVATE database detail', 500, 503, 'INGEST_DENIED'],
  ]) {
    const { handler } = await setup(async () => json({ message }, upstream));
    const response = await handler(request(JSON.stringify(payload)));
    assert.equal(response.status, expected);
    const text = await response.text();
    assert.deepEqual(JSON.parse(text), { error: code });
    assert.doesNotMatch(text, /PRIVATE|database detail/);
  }
});

test('edge returns only a bounded numeric watermark for an authenticated sequence conflict', async () => {
  const { payload } = await setup();
  for (const [details, expected] of [['42', { error: 'OLD_SEQUENCE', lastSequence: 42 }],
    ['PRIVATE secret', { error: 'OLD_SEQUENCE' }], ['9007199254740991', { error: 'OLD_SEQUENCE' }],
    ['0', { error: 'OLD_SEQUENCE' }], ['04', { error: 'OLD_SEQUENCE' }]]) {
    const { handler } = await setup(async () => json({ message: 'OLD_SEQUENCE', details }, 400));
    const response = await handler(request(JSON.stringify(payload)));
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), expected);
  }
});

test('stream reader accepts chunked JSON, rejects oversized bodies, and never leaks body or thrown errors', async () => {
  let calls = 0;
  const { handler, payload, schema } = await setup(async () => { calls += 1; throw new Error('PRIVATE transport credential'); });
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const stream = new ReadableStream({ start(controller) {
    controller.enqueue(bytes.slice(0, 17)); controller.enqueue(bytes.slice(17)); controller.close();
  } });
  const logs = [];
  const originalError = console.error;
  console.error = (...values) => logs.push(values);
  try {
    const failed = await handler(request(stream, {}, { duplex: 'half' }));
    assert.equal(failed.status, 400);
    assert.deepEqual(await failed.json(), { error: 'REQUEST_REJECTED' });
    assert.deepEqual(logs, []);
  } finally { console.error = originalError; }
  assert.equal(calls, 1);

  const atLimit = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(schema.LIMITS.bytes)); controller.close(); } });
  const malformed = await handler(request(atLimit, {}, { duplex: 'half' }));
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { error: 'REQUEST_REJECTED' });

  let cancelled = false;
  const oversized = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(schema.LIMITS.bytes + 1)); }, cancel() { cancelled = true; } });
  const rejected = await handler(request(oversized, {}, { duplex: 'half' }));
  assert.equal(rejected.status, 413);
  assert.deepEqual(await rejected.json(), { error: 'REQUEST_REJECTED' });
  assert.equal(cancelled, true);
  assert.equal(calls, 1);
});

test('edge configuration and routing reject non-HTTPS, unsupported paths and content types', async () => {
  const { createIngestHandler } = await import('../supabase/functions/aexos-telemetry/handler.mjs');
  assert.throws(() => createIngestHandler({ supabaseUrl: 'http://example.supabase.co', serviceKey: SERVICE, catalogKeys: new Set() }), /INVALID_INGEST_CONFIG/);
  assert.throws(() => createIngestHandler({ supabaseUrl: 'https://attacker.example', serviceKey: SERVICE, catalogKeys: new Set() }), /INVALID_INGEST_CONFIG/);
  const { handler, payload } = await setup();
  const missing = await handler(new Request('https://example.supabase.co/other', { method: 'POST' }));
  assert.equal(missing.status, 404);
  const wrongType = await handler(request(JSON.stringify(payload), { 'Content-Type': 'text/plain' }));
  assert.equal(wrongType.status, 415);
});
