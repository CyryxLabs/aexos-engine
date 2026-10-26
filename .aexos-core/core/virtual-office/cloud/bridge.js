'use strict';

const crypto = require('crypto');
const fs = require('fs');
const { projectIdentity } = require('../host-bridge');

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const opaque = (projectId, epoch, kind, value) => sha(JSON.stringify([projectId, epoch, kind, value]));

async function createCloudBridge(office, options) {
  const schema = await import('./schema.mjs');
  const { projectId, epoch, token } = options;
  if (!schema.UUID.test(projectId) || !schema.UUID.test(epoch) || !/^[A-Za-z0-9_-]{43}$/.test(token || '')) throw new Error('INVALID_CLOUD_CREDENTIAL');
  const root = fs.realpathSync(options.projectRoot);
  if (fs.realpathSync(office.projectRoot) !== root || office.projectId !== projectIdentity(root)) throw new Error('CLOUD_ROOT_MISMATCH');
  const endpoint = new URL(options.endpoint);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash || endpoint.search || endpoint.pathname !== '/functions/v1/aexos-telemetry/ingest') throw new Error('INVALID_INGEST_ENDPOINT');
  // Origin is explicitly supplied by the operator, never learned from telemetry.
  if (endpoint.origin !== options.approvedOrigin) throw new Error('UNAPPROVED_INGEST_ORIGIN');
  const keys = new Set(office.catalog.squads.flatMap((squad) => squad.agents.map((agent) => agent.key)));
  const reviewedKeys = new Set(require('./catalog-keys.json'));
  const knownKeys = new Set([...reviewedKeys].filter((key) => keys.has(key)));
  let sequence = 0;
  let stopped = false;
  let flight = null;
  let timer = null;
  let failures = 0;
  const status = options.onStatus || (() => {});
  const hashId = (kind, value) => opaque(projectId, epoch, kind, value);
  const evidence = (value) => schema.EVIDENCE.includes(value) ? value : 'unavailable';
  const agentKey = (value) => knownKeys.has(value) ? value : null;
  function envelope() {
    const local = office.projector.getSnapshot();
    const sessions = (local.sessions || []).slice().sort((a, b) => b.lastSeen - a.lastSeen);
    const events = (local.events || []).slice().sort((a, b) => b.timestamp - a.timestamp);
    const eventSession = (row) => {
      const matching = sessions.filter((session) => row.sessionId && session.sessionId === row.sessionId && session.host === row.host && session.agentKey === row.agentKey);
      return matching.length === 1 ? hashId('session', matching[0].key) : null;
    };
    const result = {
      schemaVersion: 1, projectId, epoch, sequence: ++sequence, observedAt: Date.now(),
      sessions: sessions.slice(0, schema.LIMITS.sessions).map((row) => ({
        id: hashId('session', row.key), agentKey: agentKey(row.agentKey), host: row.host,
        state: row.state, lastSeen: row.lastSeen, evidence: evidence(row.evidence),
      })),
      events: events.slice(0, schema.LIMITS.events).map((row) => ({
        id: hashId('event', row.id), sessionId: eventSession(row),
        agentKey: agentKey(row.agentKey), type: row.type, state: row.state,
        timestamp: row.timestamp, host: row.host, evidence: evidence(row.evidence),
      })),
      omitted: { sessions: Math.max(0, sessions.length - schema.LIMITS.sessions), events: Math.max(0, events.length - schema.LIMITS.events) },
    };
    return schema.validateEnvelope(result, knownKeys);
  }
  async function upload() {
    if (stopped) throw new Error('BRIDGE_STOPPED');
    if (flight) return flight;
    flight = (async () => {
      const response = await (options.fetch || fetch)(endpoint.href, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(envelope()),
      });
      if (!response.ok) throw new Error(`INGEST_HTTP_${response.status}`);
      // No response content, local source values, URLs or credentials enter logs.
      failures = 0; status({ state: 'connected', sequence });
      return { accepted: true, sequence };
    })().finally(() => { flight = null; });
    return flight;
  }
  async function tick() {
    try { await upload(); } catch { failures += 1; status({ state: 'disconnected', failures }); }
    if (!stopped) timer = setTimeout(tick, Math.min(30000, 5000 * 2 ** Math.min(failures, 3)));
  }
  return {
    envelope, upload,
    start() { if (timer || flight || stopped) throw new Error('BRIDGE_ALREADY_STARTED'); return tick(); },
    async stop() { stopped = true; clearTimeout(timer); if (flight) await flight.catch(() => {}); },
    binding: { projectId, epoch, localProjectId: office.projectId },
  };
}

module.exports = { createCloudBridge, opaque };
