'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { HELP, findProjectRoot, parseArgs, run } = require('../../../.aexos-core/core/virtual-office/cli');
const { createVirtualOfficeServer } = require('../../../.aexos-core/core/virtual-office/server');

function fixtureCatalog() {
  return {
    version: '1.0.0',
    squadCount: 1,
    agentCount: 1,
    squads: [{
      id: 'engineering',
      name: 'Engineering',
      domain: 'software',
      description: '',
      entryAgent: 'dev',
      agents: [{
        key: 'engineering/dev',
        id: 'dev',
        name: 'Vulcan',
        title: 'Developer',
        squadId: 'engineering',
      }],
    }],
  };
}

function fixtureConfig() {
  return {
    host: '127.0.0.1',
    port: 0,
    openBrowser: false,
    heartbeatTtlMs: 30000,
    recentCompletionMs: 12000,
    eventHistoryLimit: 20,
    maxEventBytes: 1024,
    pollingIntervalMs: 1000,
    logoAsset: 'public/assets/cyryx-labs-logo.png',
  };
}

describe('Virtual Office server, CLI, and UI contracts', () => {
  let office;
  let tempRoot;
  let baseUrl;
  const fetch = (url, options = {}) => {
    if (options.method === 'POST') {
      options.headers = { ...options.headers, Authorization: `Bearer ${fs.readFileSync(path.join(tempRoot, '.aexos/dashboard/producer-token'), 'utf8').trim()}` };
      try { options.body = JSON.stringify({ ...JSON.parse(options.body), projectId: office.projectId }); } catch (_error) { /* Malformed JSON test. */ }
    }
    return globalThis.fetch(url, options);
  };

  beforeEach(async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-office-server-'));
    office = createVirtualOfficeServer({
      projectRoot: tempRoot,
      config: fixtureConfig(),
      catalog: fixtureCatalog(),
    });
    const address = await office.start();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await office.stop();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('serves health, a truthful initial snapshot, and security headers', async () => {
    const health = await fetch(`${baseUrl}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: 'ok', squads: 1, agents: 1 });
    expect(health.headers.get('x-content-type-options')).toBe('nosniff');

    const snapshot = await fetch(`${baseUrl}/api/snapshot`).then((response) => response.json());
    expect(snapshot.counts).toMatchObject({ total: 1, offline: 1, running: 0 });
  });

  it('ingests events, persists only normalized metadata, and updates snapshot state', async () => {
    const response = await fetch(`${baseUrl}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'event-live',
        type: 'CommandStart',
        timestamp: Date.now(),
        cyryx_agent: 'dev',
        data: { command: '*develop', prompt: 'private', env: { TOKEN: 'secret' } },
      }),
    });
    expect(response.status).toBe(202);

    const snapshot = await fetch(`${baseUrl}/api/snapshot`).then((result) => result.json());
    expect(snapshot.counts.running).toBe(1);
    const persisted = fs.readFileSync(office.eventLogPath, 'utf8');
    expect(persisted).toContain('*develop');
    expect(persisted).not.toContain('private');
    expect(persisted).not.toContain('TOKEN');
  });

  it('streams the initial snapshot over SSE', (done) => {
    const request = http.get(`${baseUrl}/api/events`, (response) => {
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
      response.once('data', (chunk) => {
        expect(chunk.toString()).toContain('retry: 2000');
        request.destroy();
        done();
      });
    });
    request.on('error', (error) => {
      if (error.code !== 'ECONNRESET') done(error);
    });
  });

  it('rejects invalid content types, event types, oversized bodies, and unknown paths', async () => {
    expect((await fetch(`${baseUrl}/events`, { method: 'POST', body: '{}' })).status).toBe(415);
    expect((await fetch(`${baseUrl}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'FakeActivity' }),
    })).status).toBe(400);
    expect((await fetch(`${baseUrl}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'CommandStart', padding: 'x'.repeat(1400) }),
    })).status).toBe(413);
    expect((await fetch(`${baseUrl}/../../package.json`)).status).toBe(404);
  });

  it('serves the semantic office and the exact branded asset', async () => {
    const htmlResponse = await fetch(baseUrl);
    const html = await htmlResponse.text();
    expect(html).toContain('AEXOS Virtual Office');
    expect(html).toContain('role="list"');
    expect(html).toContain('aria-live="polite"');
    expect(htmlResponse.headers.get('content-security-policy')).toContain("default-src 'self'");

    const logo = Buffer.from(await fetch(`${baseUrl}/assets/cyryx-labs-logo.png`).then((response) => response.arrayBuffer()));
    expect(crypto.createHash('sha256').update(logo).digest('hex'))
      .toBe('f58edac16908d2b2bf48e65ec4a482a2f2b26e5d207542aef10b3515f1244bbf');

    const campus = await fetch(`${baseUrl}/assets/cyryx-campus-command-hall-v1.png`);
    const sceneManifest = await fetch(`${baseUrl}/scene-manifest.js`);
    const officePlate = await fetch(`${baseUrl}/assets/cyryx-office-isometric-empty-v1.png`);
    expect(officePlate.status).toBe(200);
    expect(officePlate.headers.get('content-type')).toBe('image/png');
    const spriteSheet = await fetch(`${baseUrl}/assets/cyryx-agent-atlas-clean-v3.png`);
    expect(spriteSheet.status).toBe(200);
    expect(Buffer.from(await spriteSheet.arrayBuffer())[25]).toBe(6);
    const brandAssets = await Promise.all([
      'cyryx-labs-mark-crop-v1.png',
      'cyryx-labs-wordmark-crop-v1.png',
      'cyryx-labs-wordmark-clean-v2.png',
      'cyryx-labs-official-lockup-v1.png',
    ].map((asset) => fetch(`${baseUrl}/assets/${asset}`)));
    const identityAtlases = await Promise.all(['a', 'b', 'c', 'd'].map((suffix) => (
      fetch(`${baseUrl}/assets/cyryx-agent-identity-${suffix}-v5.png`)
    )));
    const executiveAssets = await Promise.all([
      'paulo-petruff-ceo-standing-v1.png',
      'paulo-petruff-ceo-workstation-v1.png',
    ].map((asset) => fetch(`${baseUrl}/assets/${asset}`)));
    expect(campus.status).toBe(200);
    expect(campus.headers.get('content-type')).toBe('image/png');
    expect((await campus.arrayBuffer()).byteLength).toBeGreaterThan(100000);
    expect(sceneManifest.status).toBe(200);
    expect(sceneManifest.headers.get('content-type')).toContain('text/javascript');
    expect(await sceneManifest.text()).toContain("id: 'cyryx-isometric-office-v6'");
    for (const asset of brandAssets) {
      expect(asset.status).toBe(200);
      expect(asset.headers.get('content-type')).toBe('image/png');
      expect((await asset.arrayBuffer()).byteLength).toBeGreaterThan(100000);
    }
    for (const atlas of identityAtlases) {
      expect(atlas.status).toBe(200);
      expect(atlas.headers.get('content-type')).toBe('image/png');
      const atlasBuffer = Buffer.from(await atlas.arrayBuffer());
      expect(atlasBuffer.byteLength).toBeGreaterThan(100000);
      expect(atlasBuffer[25]).toBe(6);
    }
    for (const asset of executiveAssets) {
      expect(asset.status).toBe(200);
      expect(asset.headers.get('content-type')).toBe('image/png');
      expect((await asset.arrayBuffer()).byteLength).toBeGreaterThan(500000);
    }
  });

  it('parses CLI options and finds the nearest AEXOS project', () => {
    expect(parseArgs(['--project-root', 'C:\\AEXOS', '--port', '4011', '--no-open', '--json']))
      .toEqual(expect.objectContaining({
        projectRoot: 'C:\\AEXOS',
        port: '4011',
        openBrowser: false,
        json: true,
      }));
    expect(() => parseArgs(['--remote'])).toThrow(/unknown/i);
    expect(findProjectRoot(path.join(process.cwd(), 'tests', 'core'))).toBe(process.cwd());
    expect(() => findProjectRoot(os.tmpdir(), { searchParents: false }))
      .toThrow(/no AEXOS project found/i);
  });

  it('prints help without starting a server', async () => {
    const output = { log: jest.fn() };
    expect(await run(['--help'], { output })).toBeNull();
    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('aexos office'));
    expect(HELP).toContain('never calls an AI API');
  });

  it('routes aexos office --help through the root CLI', () => {
    const result = spawnSync(process.execPath, ['bin/aexos.js', 'office', '--help'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('AEXOS Virtual Office');
  });

  it('serves the accessible observation workspace without bitmap-dependent agent layout', () => {
    const publicRoot = path.join(process.cwd(), '.aexos-core', 'core', 'virtual-office', 'public');
    const html = fs.readFileSync(path.join(publicRoot, 'index.html'), 'utf8');
    const css = fs.readFileSync(path.join(publicRoot, 'styles.css'), 'utf8');
    const client = fs.readFileSync(path.join(publicRoot, 'app.js'), 'utf8');
    expect(html).toContain('/assets/cyryx-labs-mark-crop-v1.png');
    expect(html).toContain('id="host-strip"');
    expect(html).toContain('id="ceo-presence"');
    expect(html).toContain('data-view="list"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('id="retry-connection"');
    expect(html).not.toContain('cyryx-campus-command-hall-v1.png');
    expect(client).not.toContain('innerHTML');
    expect(client).not.toContain('scheduleAmbientStep');
    expect(css).toContain(':focus-visible');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('@media (max-width: 760px)');
  });
});
