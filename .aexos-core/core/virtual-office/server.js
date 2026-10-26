'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { loadConfig } = require('./config-loader');
const { createHash, timingSafeEqual } = require('crypto');
const { confinedPath, producerToken, projectIdentity } = require('./host-bridge');
const { normalizeEvent } = require('./event-normalizer');
const { loadRegistry } = require('./registry-loader');
const { VirtualOfficeProjector } = require('./state-projector');

const STATIC_ROOT = path.join(__dirname, 'public');
const STATIC_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/scene-manifest.js', ['scene-manifest.js', 'text/javascript; charset=utf-8']],
  ['/office-navigation.js', ['office-navigation.js', 'text/javascript; charset=utf-8']],
  ['/office-presence.js', ['office-presence.js', 'text/javascript; charset=utf-8']],
  ['/office-scene.js', ['office-scene.js', 'text/javascript; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/assets/cyryx-labs-logo.png', ['assets/cyryx-labs-logo.png', 'image/png']],
  ['/assets/cyryx-labs-mark-crop-v1.png', ['assets/cyryx-labs-mark-crop-v1.png', 'image/png']],
  ['/assets/cyryx-labs-wordmark-crop-v1.png', ['assets/cyryx-labs-wordmark-crop-v1.png', 'image/png']],
  ['/assets/cyryx-labs-wordmark-clean-v2.png', ['assets/cyryx-labs-wordmark-clean-v2.png', 'image/png']],
  ['/assets/cyryx-labs-official-lockup-v1.png', ['assets/cyryx-labs-official-lockup-v1.png', 'image/png']],
  ['/assets/cyryx-campus.png', ['assets/cyryx-campus.png', 'image/png']],
  ['/assets/cyryx-architectural-office-reference.png', ['assets/cyryx-architectural-office-reference.png', 'image/png']],
  ['/assets/cyryx-campus-command-hall-v1.png', ['assets/cyryx-campus-command-hall-v1.png', 'image/png']],
  ['/assets/cyryx-agent-atlas.png', ['assets/cyryx-agent-atlas.png', 'image/png']],
  ['/assets/cyryx-agent-atlas-clean-v3.png', ['assets/cyryx-agent-atlas-clean-v3.png', 'image/png']],
  ['/assets/cyryx-office-isometric-empty-v1.png', ['assets/cyryx-office-isometric-empty-v1.png', 'image/png']],
  ['/assets/cyryx-agent-atlas-ui-v3.png', ['assets/cyryx-agent-atlas-ui-v3.png', 'image/png']],
  ['/assets/cyryx-walk-cycle-v1.png', ['assets/cyryx-walk-cycle-v1.png', 'image/png']],
  ['/assets/cyryx-agent-identity-a-v4.png', ['assets/cyryx-agent-identity-a-v4.png', 'image/png']],
  ['/assets/cyryx-agent-identity-b-v4.png', ['assets/cyryx-agent-identity-b-v4.png', 'image/png']],
  ['/assets/cyryx-agent-identity-c-v4.png', ['assets/cyryx-agent-identity-c-v4.png', 'image/png']],
  ['/assets/cyryx-agent-identity-d-v4.png', ['assets/cyryx-agent-identity-d-v4.png', 'image/png']],
  ['/assets/cyryx-agent-identity-a-v5.png', ['assets/cyryx-agent-identity-a-v5.png', 'image/png']],
  ['/assets/cyryx-agent-identity-b-v5.png', ['assets/cyryx-agent-identity-b-v5.png', 'image/png']],
  ['/assets/cyryx-agent-identity-c-v5.png', ['assets/cyryx-agent-identity-c-v5.png', 'image/png']],
  ['/assets/cyryx-agent-identity-d-v5.png', ['assets/cyryx-agent-identity-d-v5.png', 'image/png']],
  ['/assets/paulo-petruff-ceo-standing-v1.png', ['assets/paulo-petruff-ceo-standing-v1.png', 'image/png']],
  ['/assets/paulo-petruff-ceo-workstation-v1.png', ['assets/paulo-petruff-ceo-workstation-v1.png', 'image/png']],
]);

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

function sendJson(response, status, payload, extraHeaders = {}) {
  response.writeHead(status, {
    ...SECURITY_HEADERS,
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    ...extraHeaders,
  });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request, limit) {
  return new Promise((resolve, reject) => {
    const contentLength = Number(request.headers['content-length'] || 0);
    if (contentLength > limit) {
      const error = new Error(`Event payload exceeds ${limit} bytes`);
      error.statusCode = 413;
      reject(error);
      request.resume();
      return;
    }

    let size = 0;
    let settled = false;
    const chunks = [];
    request.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > limit) {
        settled = true;
        const error = new Error(`Event payload exceeds ${limit} bytes`);
        error.statusCode = 413;
        reject(error);
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (settled) return;
      try {
        settled = true;
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (_error) {
        settled = true;
        const error = new Error('Event payload must contain valid JSON');
        error.statusCode = 400;
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

async function readRecentJsonl(filePath, maximumBytes = 1048576) {
  if (!fs.existsSync(filePath)) return [];
  const stats = await fs.promises.stat(filePath);
  const bytes = Math.min(stats.size, maximumBytes);
  if (!bytes) return [];

  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    await handle.read(buffer, 0, bytes, stats.size - bytes);
    return buffer
      .toString('utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-(maximumBytes > 0 ? 2000 : 0))
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (_error) {
          return null;
        }
      })
      .filter(Boolean);
  } finally {
    await handle.close();
  }
}

function createVirtualOfficeServer(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || process.cwd());
  const config = options.config || loadConfig(options.configOverrides);
  const catalog = options.catalog || loadRegistry(projectRoot);
  const projector = options.projector || new VirtualOfficeProjector(catalog, {
    projectName: path.basename(projectRoot),
    heartbeatTtlMs: config.heartbeatTtlMs,
    recentCompletionMs: config.recentCompletionMs,
    eventHistoryLimit: config.eventHistoryLimit,
  });
  const runtimeDirectory = path.join(projectRoot, '.aexos', 'dashboard');
  const eventLogPath = path.join(runtimeDirectory, 'office-events.jsonl');
  const projectId = projectIdentity(projectRoot);
  const clients = new Set();
  let ingestion = Promise.resolve();
  let fallbackSignature = '';
  let fallbackOffset = 0;
  let fallbackPartial = '';
  let fallbackInode = null;
  let producerSecret;
  let polling = false;
  let pollingWork = Promise.resolve();
  let tickTimer = null;
  let heartbeatTimer = null;
  let listeningAddress = null;

  function writeSse(response, eventName, data) {
    if (response.destroyed || response.writableLength > 262144) { clients.delete(response); response.destroy(); return; }
    response.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  function broadcast(delta) {
    clients.forEach((client) => writeSse(client, 'delta', delta));
  }

  projector.on('change', broadcast);

  async function persistEvent(event) {
    confinedPath(projectRoot, 'office-events.jsonl');
    await fs.promises.mkdir(runtimeDirectory, { recursive: true });
    if (fs.existsSync(eventLogPath) && fs.statSync(eventLogPath).size > 4 * 1024 * 1024) {
      const previous = confinedPath(projectRoot, 'office-events.previous.jsonl');
      await fs.promises.rename(eventLogPath, previous);
    }
    await fs.promises.appendFile(eventLogPath, `${JSON.stringify(event)}\n`, 'utf8');
  }

  function ingest(source, persist = true) {
    const operation = ingestion.then(async () => {
      const event = normalizeEvent(source);
      if (event.data.projectId && event.data.projectId !== projectId) throw new Error('Event belongs to another project');
      event.data.projectId = projectId;
      if (projector.seenEventIds.has(event.id)) return { event, delta: { duplicate: true } };
      if (persist) {
        try { await persistEvent(event); }
        catch (cause) {
          const error = new Error('Unable to persist Virtual Office observation', { cause });
          error.statusCode = 503;
          throw error;
        }
      }
      return { event, delta: projector.apply(event) };
    });
    ingestion = operation.catch(() => {});
    return operation;
  }

  async function replayFile(file) {
    confinedPath(projectRoot, path.basename(file));
    for (const source of await readRecentJsonl(file)) {
      try {
        if (!source.id) source.id = createHash('sha256').update(JSON.stringify(source)).digest('hex');
        await ingest(source, false);
      } catch (_error) { /* Unsupported records cannot assert activity. */ }
    }
  }

  async function replayFallback() {
    const file = confinedPath(projectRoot, 'events.jsonl');
    if (!fs.existsSync(file)) return;
    const stat = fs.statSync(file);
    const signature = `${stat.ino}:${stat.size}:${stat.mtimeMs}`;
    if (signature === fallbackSignature) return;
    if (stat.ino !== fallbackInode || stat.size < fallbackOffset || (stat.size === fallbackOffset && signature !== fallbackSignature)) {
      fallbackOffset = 0; fallbackPartial = '';
    }
    const start = Math.max(fallbackOffset, stat.size - 1048576);
    const handle = await fs.promises.open(file, 'r');
    try {
      const buffer = Buffer.alloc(stat.size - start);
      await handle.read(buffer, 0, buffer.length, start);
      const lines = ((start === fallbackOffset ? fallbackPartial : '') + buffer.toString('utf8')).split('\n');
      const nextPartial = lines.pop().slice(-65536);
      for (const line of lines.slice(-2000)) {
        try {
          const source = JSON.parse(line);
          if (!source.id) source.id = createHash('sha256').update(line).digest('hex');
          await ingest(source, true);
        } catch (error) {
          // Valid observations remain queued until durable persistence recovers.
          if (error.statusCode === 503) throw error;
        }
      }
      fallbackPartial = nextPartial;
    } finally { await handle.close(); }
    fallbackOffset = stat.size;
    fallbackInode = stat.ino;
    fallbackSignature = signature;
  }

  const server = http.createServer(async (request, response) => {
    const authority = request.headers.host;
    const port = listeningAddress?.port || config.port;
    const allowed = [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
    if (!allowed.includes(authority) || (request.headers.origin && request.headers.origin !== `http://${authority}`)) {
      sendJson(response, 403, { error: 'Local same-origin requests required' }); return;
    }
    let requestUrl;
    try { requestUrl = new URL(request.url, `http://${authority}`); }
    catch (_error) { sendJson(response, 400, { error: 'Invalid request URL' }); return; }
    const pathname = requestUrl.pathname;

    if (request.method === 'GET' && pathname === '/health') {
      sendJson(response, 200, {
        status: 'ok',
        service: 'aexos-virtual-office',
        project: path.basename(projectRoot),
        squads: catalog.squadCount,
        agents: catalog.agentCount,
        clients: clients.size,
      });
      return;
    }

    if (request.method === 'GET' && pathname === '/api/snapshot') {
      sendJson(response, 200, projector.getSnapshot());
      return;
    }

    if (request.method === 'GET' && pathname === '/api/events') {
      if (clients.size >= 32) { sendJson(response, 503, { error: 'Stream client limit reached' }); return; }
      response.writeHead(200, {
        ...SECURITY_HEADERS,
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream; charset=utf-8',
      });
      response.write('retry: 2000\n\n');
      writeSse(response, 'snapshot', projector.getSnapshot());
      clients.add(response);
      request.on('close', () => clients.delete(response));
      return;
    }

    if (request.method === 'POST' && pathname === '/events') {
      const supplied = Buffer.from(request.headers.authorization || '');
      const expected = Buffer.from(`Bearer ${producerSecret}`);
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
        sendJson(response, 401, { error: 'Use the project-scoped office emit CLI bridge' }); return;
      }
      const contentType = request.headers['content-type'] || '';
      if (!contentType.toLowerCase().startsWith('application/json')) {
        sendJson(response, 415, { error: 'Content-Type must be application/json' });
        return;
      }

      try {
        const source = await readJsonBody(request, config.maxEventBytes);
        if ((source.projectId || source.data?.projectId) !== projectId) throw new Error('Project identity required');
        const { event, delta } = await ingest(source);
        sendJson(response, delta.duplicate ? 200 : 202, {
          accepted: true,
          duplicate: delta.duplicate,
          id: event.id,
        });
      } catch (error) {
        if (!response.headersSent) {
          sendJson(response, error.statusCode || 400, { error: error.message });
        }
      }
      return;
    }

    if (request.method === 'GET' && STATIC_FILES.has(pathname)) {
      const [relativePath, contentType] = STATIC_FILES.get(pathname);
      const absolutePath = path.resolve(STATIC_ROOT, relativePath);
      const staticPrefix = `${path.resolve(STATIC_ROOT)}${path.sep}`;
      if (!absolutePath.startsWith(staticPrefix)) {
        sendJson(response, 403, { error: 'Forbidden' });
        return;
      }
      try {
        const content = await fs.promises.readFile(absolutePath);
        response.writeHead(200, {
          ...SECURITY_HEADERS,
          'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=3600' : 'no-cache',
          'Content-Type': contentType,
        });
        response.end(content);
      } catch (_error) {
        sendJson(response, 404, { error: 'Asset not found' });
      }
      return;
    }

    sendJson(response, 404, { error: 'Not found' });
  });

  async function start() {
    producerSecret = producerToken(projectRoot, true);
    await replayFile(confinedPath(projectRoot, 'office-events.previous.jsonl'));
    await replayFile(eventLogPath);
    await replayFallback();
    projector.tick();
    await new Promise((resolve, reject) => {
      const onError = (error) => {
        if (error.code === 'EADDRINUSE') {
          reject(new Error(
            `Virtual Office port ${config.port} is already in use. Stop the other process or pass --port <number>.`,
          ));
          return;
        }
        reject(error);
      };
      server.once('error', onError);
      server.listen(config.port, config.host, () => {
        server.off('error', onError);
        listeningAddress = server.address();
        resolve();
      });
    });

    tickTimer = setInterval(() => {
      if (polling) return;
      polling = true;
      pollingWork = (async () => {
        try { await replayFallback(); projector.tick(); }
        catch (_error) { /* Retry next poll; never invent activity after read failure. */ }
        finally { polling = false; }
      })();
    }, config.pollingIntervalMs);
    tickTimer.unref?.();
    heartbeatTimer = setInterval(() => {
      clients.forEach((client) => client.write(': heartbeat\n\n'));
    }, 15000);
    heartbeatTimer.unref?.();
    return listeningAddress;
  }

  async function stop() {
    clearInterval(tickTimer);
    await pollingWork;
    await ingestion;
    clearInterval(heartbeatTimer);
    clients.forEach((client) => client.end());
    clients.clear();
    projector.off('change', broadcast);
    if (!server.listening) return;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }

  return {
    catalog,
    config,
    eventLogPath,
    projectId,
    ingest,
    projector,
    projectRoot,
    server,
    start,
    stop,
  };
}

module.exports = {
  SECURITY_HEADERS,
  STATIC_FILES,
  STATIC_ROOT,
  createVirtualOfficeServer,
  readJsonBody,
  readRecentJsonl,
  sendJson,
};
