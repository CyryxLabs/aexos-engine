'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const { createHandler, COOKIE, body } = require('../lib/backend');
const { snapshot, catalog } = require('../lib/office-snapshot');
const PROJECT = '11111111-1111-4111-8111-111111111111';
const EPOCH = '22222222-2222-4222-8222-222222222222';
const KEY = catalog.squads[0].agents[0].key;
const NOW = Date.now();
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
function envelope() { return { schemaVersion: 1, projectId: PROJECT, epoch: EPOCH, sequence: 1, observedAt: NOW,
  sessions: [{ id: hash('s'), agentKey: KEY, host: 'cli', state: 'running', lastSeen: NOW, evidence: 'runtime' }],
  events: [{ id: hash('e'), sessionId: hash('s'), agentKey: KEY, host: 'cli', state: 'running', type: 'CommandStart', timestamp: NOW, evidence: 'runtime' }],
  omitted: { sessions: 0, events: 0 } }; }
async function server(t, send) {
  const handler = createHandler({ AEXOS_SUPABASE_URL: 'https://example.supabase.co', AEXOS_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }, { fetch: send });
  const app = http.createServer(handler); await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => app.close(resolve)));
  const request = async (route, options = {}) => fetch(`http://127.0.0.1:${app.address().port}${route}`, options);
  request.origin = `https://127.0.0.1:${app.address().port}`;
  return request;
}
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
test('Vercel parsed body and native body share limits; malformed getters fail closed', async () => {
  const headers = { 'content-type': 'application/json' };
  assert.deepEqual(await body({ headers, body: { label: 'Work' } }), { label: 'Work' });
  await assert.rejects(body({ headers, body: { payload: 'x'.repeat(17000) } }), /BODY_LIMIT/);
  await assert.rejects(body({ headers: { ...headers, 'content-length': '17000' }, get body() { throw Error('must not parse'); } }), /BODY_LIMIT/);
  await assert.rejects(body({ headers, get body() { throw SyntaxError('Malformed JSON'); } }), /INVALID_JSON/);
});
test('exact metadata schema rejects secrets, malformed types, excess rows and future observations', async () => {
  const { validateEnvelope } = await import('../../../.aexos-core/core/virtual-office/cloud/schema.mjs');
  const keys = new Set([KEY]);
  assert.equal(validateEnvelope(envelope(), keys, NOW).schemaVersion, 1);
  for (const mutate of [(e) => { e.prompt = 'CONFIDENTIAL'; }, (e) => { e.projectId = [PROJECT]; }, (e) => { e.sessions[0].id = [hash('s')]; },
    (e) => { e.events[0].command = 'CONFIDENTIAL'; }, (e) => { e.observedAt = NOW + 60001; }, (e) => { e.sessions[0].agentKey = 'private/secret'; },
    (e) => { e.sessions = Array(201).fill(e.sessions[0]); }]) { const value = envelope(); mutate(value); assert.throws(() => validateEnvelope(value, keys, NOW)); }
});
test('private reads require verified live user identity and clear stale cookies', async (t) => {
  let calls = 0;
  const request = await server(t, async (url) => { calls++; return String(url).includes('/auth/') ? json({ id: PROJECT, email: 'owner@example.test' }) : json(false); });
  assert.equal((await request('/api/snapshot?projectId=' + PROJECT)).status, 401); assert.equal(calls, 0);
  const revoked = await request('/api/snapshot?projectId=' + PROJECT, { headers: { Cookie: COOKIE + '=signed.jwt.token' } });
  assert.equal(revoked.status, 401); assert.match(revoked.headers.get('set-cookie'), /Max-Age=0/); assert.equal(calls, 2);
});
test('mutations reject missing or foreign origin before authentication or persistence', async (t) => {
  let calls = 0; const request = await server(t, async () => { calls++; return json({}); });
  for (const route of ['/api/login', '/api/activate']) {
    for (const origin of [undefined, 'https://attacker.example']) {
      const response = await request(route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: route.endsWith('activate') ? '{"accessToken":"signed.jwt.token","password":"long-enough-password"}' : '{"email":"x","password":"y"}' });
      assert.equal(response.status, 403);
    }
  }
  assert.equal(calls, 0);
});
test('activation accepts only an exact bounded body and never reads token material from query', async (t) => {
  let calls = 0; const request = await server(t, async () => { calls++; return json({}); });
  const headers = { Origin: request.origin, 'Content-Type': 'application/json' };
  for (const bodyValue of [
    { accessToken: 'signed.jwt.token' },
    { accessToken: 'signed.jwt.token', password: 'short' },
    { accessToken: 'signed.jwt.token', password: 'long-enough-password', email: 'owner@example.test' },
    { accessToken: 'bad token', password: 'long-enough-password' },
  ]) {
    const response = await request('/api/activate?accessToken=query.jwt.token', { method: 'POST', headers, body: JSON.stringify(bodyValue) });
    assert.equal(response.status, 400);
  }
  assert.equal(calls, 0);
});
test('activation verifies one live nonanonymous identity before and after changing only its password', async (t) => {
  const user = { id: PROJECT, email: 'owner@example.test', is_anonymous: false };
  const seen = [];
  const request = await server(t, async (url, options) => {
    seen.push({ url: String(url), method: options.method || 'GET', authorization: options.headers.Authorization, body: options.body });
    const route = new URL(url).pathname;
    if (route === '/auth/v1/user' && options.method === 'PUT') return json(user);
    if (route === '/auth/v1/user') return json(user);
    if (route.endsWith('aexos_session_live')) return json(true);
    throw new Error('Unexpected route');
  });
  const response = await request('/api/activate', { method: 'POST', headers: { Origin: request.origin, 'Content-Type': 'application/json' }, body: '{"accessToken":"signed.jwt.token","password":"long-enough-password"}' });
  assert.equal(response.status, 200); assert.match(response.headers.get('set-cookie'), new RegExp(`${COOKIE}=signed\\.jwt\\.token`));
  assert.deepEqual(await response.json(), { authenticated: true, user: { id: PROJECT, email: 'owner@example.test' } });
  assert.deepEqual(seen.map((call) => [new URL(call.url).pathname, call.method]), [
    ['/auth/v1/user', 'GET'], ['/rest/v1/rpc/aexos_session_live', 'POST'], ['/auth/v1/user', 'PUT'],
    ['/auth/v1/user', 'GET'], ['/rest/v1/rpc/aexos_session_live', 'POST'],
  ]);
  assert.equal(seen.every((call) => call.authorization === 'Bearer signed.jwt.token'), true);
  assert.equal(seen.find((call) => call.method === 'PUT').body, '{"password":"long-enough-password"}');
});
test('activation fails closed for invalid, anonymous, mismatched, or upstream-failed identity', async (t) => {
  const cases = [
    { name: 'invalid token', send: async () => json({}, 401), expected: 401 },
    { name: 'anonymous user', send: async (url) => new URL(url).pathname === '/auth/v1/user' ? json({ id: PROJECT, is_anonymous: true }) : json(true), expected: 401 },
    { name: 'identity mismatch', send: async (url, options) => {
      const route = new URL(url).pathname;
      if (route === '/auth/v1/user' && options.method === 'PUT') return json({ id: EPOCH, email: 'other@example.test' });
      if (route === '/auth/v1/user') return json({ id: PROJECT, email: 'owner@example.test' });
      return json(true);
    }, expected: 401 },
    { name: 'upstream update failure', send: async (url, options) => new URL(url).pathname === '/auth/v1/user' && options.method === 'PUT'
      ? json({ message: 'private upstream detail' }, 500) : new URL(url).pathname === '/auth/v1/user' ? json({ id: PROJECT, email: 'owner@example.test' }) : json(true), expected: 502 },
  ];
  for (const item of cases) {
    await t.test(item.name, async (inner) => {
      const request = await server(inner, item.send);
      const response = await request('/api/activate', { method: 'POST', headers: { Origin: request.origin, 'Content-Type': 'application/json' }, body: '{"accessToken":"signed.jwt.token","password":"long-enough-password"}' });
      assert.equal(response.status, item.expected);
      assert.deepEqual(await response.json(), { error: item.expected === 401 ? 'AUTHENTICATION_REQUIRED' : 'REQUEST_FAILED' });
      assert.doesNotMatch(response.headers.get('set-cookie') || '', new RegExp(`${COOKIE}=signed`));
    });
  }
});
test('logout clears local cookie while accurately reporting a failed server revocation', async (t) => {
  const request = await server(t, async () => json({ error: 'network' }, 503));
  const response = await request('/api/logout', { method: 'POST', headers: { Origin: request.origin, Cookie: COOKIE + '=signed.jwt.token' } });
  assert.equal(response.status, 503); assert.equal((await response.json()).error, 'REVOCATION_UNCONFIRMED'); assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
});
test('snapshot reads honor owner-filtered result and durable history independently of latest events', async (t) => {
  const seen = [];
  const request = await server(t, async (url) => { const route = new URL(url).pathname; seen.push(String(url));
    if (route === '/auth/v1/user') return json({ id: EPOCH, email: 'owner@example.test' });
    if (route.endsWith('aexos_session_live')) return json(true);
    if (route.endsWith('aexos_projects')) return json([{ id: PROJECT, epoch: EPOCH, label: 'Work' }]);
    if (route.endsWith('aexos_snapshots')) return json([{ payload: { ...envelope(), events: [] }, received_at: new Date(NOW).toISOString() }]);
    if (route.endsWith('aexos_events')) return json(envelope().events.map((payload) => ({ payload })));
    throw new Error('Unexpected route');
  });
  const response = await request('/api/snapshot?projectId=' + PROJECT, { headers: { Cookie: COOKIE + '=signed.jwt.token' } });
  const data = await response.json(); assert.equal(response.status, 200); assert.equal(data.events.length, 1); assert.equal(data.messages.length, 0);
  assert.ok(seen.some((url) => /observed_at=gte\./.test(url))); assert.equal(data.cloud.projectId, PROJECT);
  assert.equal(data.squads.flatMap((squad) => squad.agents).find((row) => row.key === KEY).command, null);
});
test('retired epochs and historical uploads never revive agent liveness', () => {
  const record = { payload: envelope(), received_at: new Date(NOW).toISOString(), history: [...envelope().events, { ...envelope().events[0], timestamp: NOW - 86400001 }] };
  const current = snapshot(record, { id: PROJECT, label: 'Work', epoch: EPOCH }, NOW);
  assert.equal(current.cloud.connectionState, 'connected'); assert.equal(current.events.length, 1);
  const retired = snapshot(record, { id: PROJECT, label: 'Work', epoch: PROJECT }, NOW);
  assert.equal(retired.cloud.connectionState, 'offline'); assert.equal(retired.sessions[0].state, 'stale');
  const historical = snapshot({ ...record, payload: { ...record.payload, sessions: [{ ...record.payload.sessions[0], lastSeen: NOW - 31000 }] } }, { id: PROJECT, label: 'Work', epoch: EPOCH }, NOW);
  assert.equal(historical.sessions[0].state, 'stale'); assert.equal(historical.cloud.connectionState, 'connected');
});
