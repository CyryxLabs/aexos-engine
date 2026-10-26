/* global TextEncoder */
// Shared by the shipped CLI bridge and the isolated ingestion function.
export const LIMITS = Object.freeze({ bytes: 262144, sessions: 200, events: 200, futureMs: 60000, staleMs: 30000, offlineMs: 60000 });
export const HOSTS = Object.freeze(['cli', 'codex', 'chatgpt', 'claude-code', 'grok', 'gemini', 'unknown']);
export const STATES = Object.freeze(['available', 'assigned', 'running', 'waiting', 'blocked', 'completed', 'failed', 'stale', 'offline']);
export const EVIDENCE = Object.freeze(['runtime', 'manual', 'test', 'unavailable']);
export const TYPES = Object.freeze(['AgentActivated', 'AgentDeactivated', 'AgentCollaborationMessage', 'AgentStateChange', 'AgentWaiting', 'AgentBlocked', 'AgentHeartbeat', 'AgentOffline', 'CommandStart', 'CommandComplete', 'CommandError', 'StoryStatusChange', 'SessionStart', 'SessionEnd', 'BobPhaseChange', 'BobAgentSpawned', 'BobAgentCompleted', 'BobSurfaceDecision', 'BobError', 'PreToolUse', 'PostToolUse']);
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) throw new Error('INVALID_FIELDS');
}
function integer(value, minimum = 0) { if (!Number.isSafeInteger(value) || value < minimum) throw new Error('INVALID_INTEGER'); }
function timestamp(value, now) { integer(value, 1); if (value > now + LIMITS.futureMs) throw new Error('FUTURE_OBSERVATION'); }
function member(value, values) { if (!values.includes(value)) throw new Error('INVALID_ENUM'); }
function identifier(value, nullable = false) { if (!(nullable && value === null) && (typeof value !== 'string' || !HASH.test(value))) throw new Error('INVALID_IDENTIFIER'); }
export function validateEnvelope(value, catalogKeys, now = Date.now()) {
  exact(value, ['schemaVersion', 'projectId', 'epoch', 'sequence', 'observedAt', 'sessions', 'events', 'omitted']);
  if (value.schemaVersion !== 1 || typeof value.projectId !== 'string' || typeof value.epoch !== 'string' || !UUID.test(value.projectId) || !UUID.test(value.epoch)) throw new Error('INVALID_BINDING');
  integer(value.sequence, 1); timestamp(value.observedAt, now);
  exact(value.omitted, ['sessions', 'events']); integer(value.omitted.sessions); integer(value.omitted.events);
  const agent = (key) => { if (key !== null && !catalogKeys.has(key)) throw new Error('UNKNOWN_CATALOG_AGENT'); };
  for (const [field, maximum] of [['sessions', LIMITS.sessions], ['events', LIMITS.events]]) {
    if (!Array.isArray(value[field]) || value[field].length > maximum) throw new Error('ROW_LIMIT');
    const seen = new Set();
    for (const row of value[field]) {
      exact(row, field === 'sessions' ? ['id', 'agentKey', 'host', 'state', 'lastSeen', 'evidence'] : ['id', 'sessionId', 'agentKey', 'type', 'state', 'timestamp', 'host', 'evidence']);
      identifier(row.id); if (seen.has(row.id)) throw new Error('DUPLICATE_IDENTIFIER'); seen.add(row.id);
      agent(row.agentKey); member(row.host, HOSTS); member(row.evidence, EVIDENCE);
      if (field === 'sessions') { member(row.state, STATES); timestamp(row.lastSeen, now); }
      else { identifier(row.sessionId, true); member(row.type, TYPES); if (row.state !== null) member(row.state, STATES); timestamp(row.timestamp, now); }
    }
  }
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > LIMITS.bytes) throw new Error('BYTE_LIMIT');
  return value;
}
