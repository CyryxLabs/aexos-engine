'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const state = require('../public/dashboard-state');
const officeSnapshot = require('../lib/office-snapshot');

const ROOT = path.resolve(__dirname, '../../..');
const PUBLIC = path.join(ROOT, 'apps', 'dashboard', 'public');
const read = (file) => fs.readFileSync(path.join(PUBLIC, file), 'utf8');
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PROJECT_ID = '22222222-2222-4222-8222-222222222222';

function snapshot(now, overrides = {}) {
  return {
    generatedAt: now,
    squads: [],
    cloud: { projectId: PROJECT_ID, receivedAt: new Date(now).toISOString(), connectionState: 'connected', sequence: 1, omitted: {}, ...overrides },
  };
}

test('product contract preserves CLI authority and metadata privacy', () => {
  const product = fs.readFileSync(path.join(ROOT, 'apps', 'dashboard', 'PRODUCT.md'), 'utf8');
  assert.match(product, /CLI remains the authority/);
  assert.match(product, /read-only/);
  assert.match(product, /Never display prompts, reasoning, project paths/);
  assert.match(product, /No paid AI\/provider API/);
});

test('cloud state distinguishes live, stale observation, and offline bridge', () => {
  const now = Date.parse('2026-10-26T18:00:00.000Z');
  assert.equal(state.connection(snapshot(now), now).live, true);
  assert.deepEqual(state.connection(snapshot(now - 30001, { receivedAt: new Date(now).toISOString() }), now), {
    live: false, label: 'Observation stale', title: 'Agent observation is stale',
  });
  assert.deepEqual(state.connection(snapshot(now, { receivedAt: new Date(now - 60001).toISOString() }), now), {
    live: false, label: 'Bridge offline', title: 'Local bridge offline',
  });
});

test('new project snapshot is an explicit setup state rather than a dashboard error', () => {
  const now = Date.parse('2026-10-26T18:00:00.000Z');
  const initial = officeSnapshot.snapshot(null, { id: PROJECT_ID, label: 'Primary', epoch: OTHER_PROJECT_ID }, now);
  assert.equal(state.snapshot(initial, PROJECT_ID), initial);
  assert.deepEqual(state.connection(initial, now), {
    live: false, setup: true, label: 'Awaiting local bridge', title: 'Connect this project',
  });
  assert.throws(() => state.snapshot(snapshot(now, { connectionState: 'never-connected', receivedAt: null, sequence: 1 }), PROJECT_ID), /Invalid project snapshot/);
});

test('snapshot and project DTO checks reject cross-project or malformed metadata', () => {
  const now = Date.now();
  assert.equal(state.snapshot(snapshot(now), PROJECT_ID).cloud.projectId, PROJECT_ID);
  assert.throws(() => state.snapshot(snapshot(now), OTHER_PROJECT_ID), /Invalid project snapshot/);
  assert.throws(() => state.snapshot({ ...snapshot(now), messages: [{ collaborationMessage: 'private' }] }, PROJECT_ID), /Private messages/);
  assert.throws(() => state.snapshot({ ...snapshot(now), squads: [{ id: 'ops', agents: [{ prompt: 'secret' }] }] }, PROJECT_ID), /Private metadata/);
  assert.doesNotThrow(() => state.snapshot({ ...snapshot(now), squads: [{ id: 'ops', agents: [{ task: null, command: null }] }] }, PROJECT_ID));
  assert.deepEqual(state.projects({ projects: [{ id: PROJECT_ID, label: 'Primary', connected: false, lastReceivedAt: null }] }), [
    { id: PROJECT_ID, label: 'Primary', connected: false, lastReceivedAt: null },
  ]);
  assert.throws(() => state.projects({ projects: [{ id: '../private', label: 'Bad', connected: true, lastReceivedAt: null }] }), /Invalid project metadata/);
});

test('one-time token memory clears without browser persistence', () => {
  const token = state.tokenMemory();
  token.set('ingest-secret-once'); assert.equal(token.read(), 'ingest-secret-once');
  token.clear(); assert.equal(token.read(), '');
  assert.doesNotMatch(read('dashboard-state.js'), /localStorage|sessionStorage|indexedDB/);
});

test('connection guidance keeps the token out of the non-secret command', () => {
  const binding = state.binding({
    project: { id: PROJECT_ID, label: 'Primary', epoch: OTHER_PROJECT_ID },
    ingestToken: 'secret-token', epoch: OTHER_PROJECT_ID,
    ingestUrl: 'https://dashboard.example/api/ingest', origin: 'https://dashboard.example', expiresAt: '2026-10-27T00:00:00.000Z',
  });
  assert.equal(binding.command, `aexos office connect --project-root <your-project-path> --project-id ${PROJECT_ID} --epoch ${OTHER_PROJECT_ID} --ingest-url https://dashboard.example/api/ingest --origin https://dashboard.example`);
  assert.doesNotMatch(binding.command, /secret-token|--token|--ingest-token/);
  assert.throws(() => state.binding({ project: { id: PROJECT_ID, epoch: OTHER_PROJECT_ID }, ingestToken: 'x', epoch: OTHER_PROJECT_ID, ingestUrl: 'http://dashboard.example/api/ingest', origin: 'http://dashboard.example' }), /Invalid connection binding/);
});

test('UI binds only authenticated read/setup routes and bounded polling', () => {
  const source = read('app.js');
  assert.match(source, /const POLL_INTERVAL_MS = 5000/);
  assert.match(source, /credentials: 'include', cache: 'no-store'/);
  for (const route of ['/api/session', '/api/login', '/api/logout', '/api/projects', '/api/catalog', '/api/snapshot?projectId=']) assert.ok(source.includes(route), route);
  assert.match(source, /\/api\/projects\/\$\{encodeURIComponent\(appState\.projectId\)\}\/token/);
  assert.doesNotMatch(source, /EventSource|\/api\/events|localStorage.*token|dispatch|cancel|execute/);
  assert.doesNotMatch(source, /collaborationMessage|agent\.task|session\.task|event\.message|event\.toolName|Copy CLI status command/);
  assert.match(source, /appState\.pollInFlight/);
  assert.match(source, /generation !== appState\.generation/);
  assert.match(source, /clearPrivateState\(\)/);
  assert.match(source, /replaceChildren\(\)/);
  assert.match(source, /prevented confirmation that the server revoked this session/);
});

test('authentication and setup controls are accessible and token display is explicit', () => {
  const html = read('index.html');
  for (const id of ['login-form', 'login-email', 'login-password', 'activation-form', 'activation-password', 'activation-confirm', 'activation-abort', 'project-select', 'project-form', 'token-reveal', 'connect-command', 'copy-command', 'copy-token', 'clear-token', 'close-setup', 'logout']) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /role="alert"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(read('styles.css'), /prefers-reduced-motion: reduce/);
  assert.match(html, /id="office-surface" inert aria-hidden="true"/);
  assert.doesNotMatch(html, /AEXOS LIVE OFFICE/);
  const css = read('styles.css');
  assert.match(css, /\.architectural-office #auth-title[^}]*font-size: clamp\(26px,4vw,36px\)[^}]*line-height: 1\.2/);
  const source = read('app.js');
  assert.match(source, /surface\.inert = !available/);
  assert.match(source, /setOfficeAvailable\(false\)/);
  assert.match(source, /setOfficeAvailable\(true\)/);
  assert.match(source, /element\('login-email'\)\.focus\(\)/);
});

test('invite and recovery fragments are consumed once, cleared immediately, and never sourced from query or storage', () => {
  const source = read('app.js');
  const match = source.match(/function consumeActivationFragment[\s\S]*?\n}\nlet initialActivation/);
  assert.ok(match, 'fragment consumer');
  const context = { URLSearchParams };
  vm.runInNewContext(`${match[0].replace(/\nlet initialActivation$/, '')}; result = consumeActivationFragment`, context);
  for (const type of ['invite', 'recovery']) {
    let clears = 0;
    assert.deepEqual({ ...context.result(`#access_token=signed.jwt.token&type=${type}&refresh_token=ignored`, () => { clears++; }) },
      { requested: true, type, accessToken: 'signed.jwt.token' });
    assert.equal(clears, 1);
  }
  let clears = 0;
  assert.deepEqual({ ...context.result('#access_token=signed.jwt.token&type=signup', () => { clears++; }) }, { requested: false, accessToken: '' });
  assert.equal(clears, 1);
  clears = 0;
  assert.deepEqual({ ...context.result('#access_token=bad%20token&type=invite', () => { clears++; }) }, { requested: true, type: 'invite', accessToken: '' });
  assert.equal(clears, 1);
  const consumeAt = source.indexOf('const initialActivation = consumeActivationFragment');
  const mutableConsumeAt = source.indexOf('let initialActivation = consumeActivationFragment');
  assert.ok(mutableConsumeAt >= 0 && mutableConsumeAt < source.indexOf('window.localStorage'));
  assert.equal(consumeAt, -1);
  assert.ok(source.indexOf("initialActivation.accessToken = '';") < source.indexOf('window.localStorage'));
  assert.ok(source.indexOf('initialActivation = null;') < source.indexOf('window.localStorage'));
  assert.match(source, /history\.replaceState\(window\.history\.state, '', window\.location\.pathname \+ window\.location\.search\)/);
  assert.doesNotMatch(source, /location\.search[^\n]*(?:access_token|accessToken)|(?:access_token|accessToken)[^\n]*location\.search/);
  assert.doesNotMatch(source, /(?:localStorage|sessionStorage|indexedDB)[^\n]*(?:activation|accessToken)/);
});

test('activation remains human-submitted, bounded, confirm-matched, and clears secret form state', () => {
  const html = read('index.html'); const source = read('app.js');
  assert.match(html, /id="activation-password"[^>]*autocomplete="new-password"[^>]*minlength="12"[^>]*maxlength="1024"/);
  assert.match(html, /id="activation-confirm"[^>]*autocomplete="new-password"[^>]*minlength="12"[^>]*maxlength="1024"/);
  assert.match(source, /element\('activation-form'\)\.addEventListener\('submit'/);
  assert.match(source, /password\.length < 12 \|\| password\.length > 1024 \|\| password !== confirmation/);
  assert.match(source, /requestJson\('\/api\/activate', \{ method: 'POST', body: JSON\.stringify\(\{ accessToken, password }\) }\)/);
  assert.match(source, /activationAccessToken = '';[\s\S]*element\('activation-password'\)\.value = '';[\s\S]*element\('activation-confirm'\)\.value = '';/);
  assert.match(source, /element\('activation-abort'\)\.addEventListener\('click', \(\) => activationFlow\.abort\(\)\)/);
});

test('activation flow blocks abort while a request is in flight and allows idle abort', async () => {
  const source = read('app.js');
  const match = source.match(/function createActivationFlow[\s\S]*?\n}\nlet initialActivation/);
  assert.ok(match, 'activation flow');
  const context = {};
  vm.runInNewContext(`${match[0].replace(/\nlet initialActivation$/, '')}; result = createActivationFlow`, context);
  let resolveRequest; const transitions = []; let completed = 0; let failed = 0; let aborted = 0;
  const request = new Promise((resolve) => { resolveRequest = resolve; });
  const flow = context.result(() => request, async () => { completed++; }, () => { failed++; }, (pending) => transitions.push(pending), () => { aborted++; });
  const submission = flow.submit({ accessToken: 'signed.jwt.token', password: 'long-enough-password' });
  assert.equal(flow.isPending(), true);
  assert.equal(flow.abort(), false);
  assert.equal(aborted, 0);
  resolveRequest();
  assert.equal(await submission, true);
  assert.equal(flow.isPending(), false);
  assert.equal(completed, 1); assert.equal(failed, 0);
  assert.deepEqual(transitions, [true, false]);

  const idle = context.result(async () => {}, async () => {}, () => {}, () => {}, () => { aborted++; });
  assert.equal(idle.abort(), true);
  assert.equal(aborted, 1);
});

test('reviewed Office modules and all assets remain byte-identical to source', () => {
  const sourceRoot = path.join(ROOT, '.aexos-core', 'core', 'virtual-office', 'public');
  const provenance = JSON.parse(read('SOURCE-PROVENANCE.json'));
  for (const [file, expected] of Object.entries(provenance.copiedUnchanged)) {
    assert.equal(sha256(path.join(sourceRoot, file)), expected);
    assert.equal(sha256(path.join(PUBLIC, file)), expected);
  }
  const assets = fs.readdirSync(path.join(sourceRoot, 'assets')).sort();
  assert.equal(assets.length, provenance.assets.count);
  for (const file of assets) assert.equal(sha256(path.join(PUBLIC, 'assets', file)), sha256(path.join(sourceRoot, 'assets', file)), file);
});
