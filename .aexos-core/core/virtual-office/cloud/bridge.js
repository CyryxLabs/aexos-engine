'use strict';

const crypto = require('crypto');
const fs = require('fs');
const { TextDecoder } = require('util');
const { projectIdentity } = require('../host-bridge');

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const opaque = (projectId, epoch, kind, value) => sha(JSON.stringify([projectId, epoch, kind, value]));

// Conflict bodies carry only a tiny numeric watermark. Bound the bytes and
// the read time even when a custom transport does not honour the fetch signal.
async function readSequenceConflict(response, signal) {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks = []; let size = 0; let done = false;
  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(new Error('INGEST_READ_ABORTED'));
    if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    while (!done) {
      const part = await Promise.race([reader.read(), aborted]);
      done = part.done;
      if (done) break;
      size += part.value.byteLength;
      if (size > 1024) return null;
      chunks.push(part.value);
    }
    const buffer = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
  } catch (_error) { return null; }
  finally {
    signal.removeEventListener('abort', onAbort);
    if (!done) reader.cancel().catch(() => {});
    try { reader.releaseLock(); } catch (_error) { /* A pending read settles after cancellation. */ }
  }
}

async function createCloudBridge(office, options) {
  const schema = await import('./schema.mjs');
  const { projectId, epoch, token } = options;
  if (!schema.UUID.test(projectId) || !schema.UUID.test(epoch) || !/^[A-Za-z0-9_-]{43}$/.test(token || '')) throw new Error('INVALID_CLOUD_CREDENTIAL');
  if (options.identityEpoch !== undefined && !schema.UUID.test(options.identityEpoch)) throw new Error('INVALID_CLOUD_IDENTITY');
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
  const hashId = (kind, value) => opaque(projectId, options.identityEpoch || epoch, kind, value);
  const evidence = (value) => schema.EVIDENCE.includes(value) ? value : 'unavailable';
  const agentKey = (value) => knownKeys.has(value) ? value : null;
  function envelope() {
    const local = office.projector.getSnapshot();
    const sessions = (local.sessions || []).slice().sort((a, b) => b.lastSeen - a.lastSeen);
    const includedSessions = sessions.slice(0, schema.LIMITS.sessions);
    const events = (local.events || []).slice().sort((a, b) => b.timestamp - a.timestamp);
    const eventSession = (row) => {
      const matching = sessions.filter((session) => row.sessionId && session.sessionId === row.sessionId
        && (session.runId || null) === (row.runId || null) && session.host === row.host && session.agentKey === row.agentKey);
      return matching.length === 1 && includedSessions.includes(matching[0]) ? hashId('session', matching[0].key) : null;
    };
    const result = {
      schemaVersion: options.identityEpoch ? 2 : 1, projectId, epoch, ...(options.identityEpoch ? { identityEpoch: options.identityEpoch } : {}), sequence: ++sequence, observedAt: Date.now(),
      sessions: includedSessions.map((row) => ({
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
      const signal = AbortSignal.timeout(10000);
      const response = await (options.fetch || fetch)(endpoint.href, {
        method: 'POST', redirect: 'error', signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(envelope()),
      });
      if (response.status === 409) {
        // A newer server can return its authenticated watermark. Never treat a
        // conflict as success; the next bounded retry sends a fresh snapshot.
        const detail = await readSequenceConflict(response, signal);
        if (detail && detail.error === 'OLD_SEQUENCE' && Number.isSafeInteger(detail.lastSequence)
            && detail.lastSequence >= sequence && detail.lastSequence < Number.MAX_SAFE_INTEGER) {
          sequence = detail.lastSequence;
        }
      }
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

module.exports = { createCloudBridge, opaque, readSequenceConflict };
