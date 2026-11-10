'use strict';

const { randomUUID } = require('crypto');

const HOSTS = new Set(['cli', 'codex', 'chatgpt', 'claude-code', 'grok', 'gemini', 'unknown']);

const MAX_FUTURE_SKEW_MS = 60000;

const ACCEPTED_EVENT_TYPES = new Set([
  'AgentActivated',
  'AgentDeactivated',
  'AgentCollaborationMessage',
  'AgentStateChange',
  'AgentWaiting',
  'AgentBlocked',
  'AgentHeartbeat',
  'AgentOffline',
  'CommandStart',
  'CommandComplete',
  'CommandError',
  'StoryStatusChange',
  'SessionStart',
  'SessionEnd',
  'BobPhaseChange',
  'BobAgentSpawned',
  'BobAgentCompleted',
  'BobSurfaceDecision',
  'BobError',
  'PreToolUse',
  'PostToolUse',
]);

const EXPLICIT_STATES = new Set([
  'available',
  'assigned',
  'running',
  'waiting',
  'blocked',
  'completed',
  'failed',
  'stale',
  'offline',
]);

function cleanString(value, maximum = 240) {
  if (value === undefined || value === null) return undefined;
  const text = Array.from(String(value), (character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 ? ' ' : character;
  }).join('').trim();
  const redacted = text
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{20,})\b/g, '[REDACTED]')
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/((?:api[_-]?key|token|secret|password)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]');
  return redacted ? redacted.slice(0, maximum) : undefined;
}

function cleanBoolean(value) {
  return typeof value === 'boolean' ? value : undefined;
}

function cleanNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function deriveState(type, data) {
  const explicit = cleanString(data.status || data.state, 32)?.toLowerCase();
  if (type === 'AgentStateChange' && EXPLICIT_STATES.has(explicit)) return explicit;

  switch (type) {
    case 'AgentActivated':
      return 'assigned';
    case 'CommandStart':
    case 'BobAgentSpawned':
    case 'PreToolUse':
    case 'PostToolUse':
      return 'running';
    case 'AgentWaiting':
      return 'waiting';
    case 'AgentBlocked':
    case 'BobError':
      return 'blocked';
    case 'CommandError':
      return 'failed';
    case 'CommandComplete':
      // Codex's session log records the end of a turn, not its outcome.
      if (data.host === 'codex' && (data.evidence === 'local-session-log'
        || (data.evidence === 'manual' && ['CodexDesktop', 'Codex Desktop', 'codex_cli_rs', 'codex_exec', 'codex_vscode', 'codex-cli'].includes(data.originator)))
        && data.success === undefined) return 'available';
      return data.success === false ? 'failed' : 'completed';
    case 'BobAgentCompleted':
      return data.success === false ? 'failed' : 'completed';
    case 'SessionStart':
      return 'available';
    case 'AgentDeactivated':
    case 'SessionEnd':
      return 'offline';
    case 'AgentOffline':
      return 'offline';
    default:
      return null;
  }
}

function normalizeEvent(source, receivedAt = Date.now()) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('Event payload must be a JSON object');
  }

  const type = cleanString(source.type || source.hook_event_name, 64);
  if (!type || !ACCEPTED_EVENT_TYPES.has(type)) {
    throw new Error(`Unsupported event type: ${type || '<missing>'}`);
  }

  const sourceData = source.data && typeof source.data === 'object' ? source.data : {};
  for (const candidate of [source, sourceData]) {
    if (Object.prototype.hasOwnProperty.call(candidate, 'success') && candidate.success !== undefined && typeof candidate.success !== 'boolean') {
      throw new Error('Event success must be a boolean when supplied');
    }
  }
  const timestampCandidate = firstDefined(source.timestamp, sourceData.timestamp);
  const parsedTimestamp = Number(timestampCandidate);
  const timestamp = Number.isFinite(parsedTimestamp) &&
    parsedTimestamp > 0 &&
    parsedTimestamp <= receivedAt + MAX_FUTURE_SKEW_MS
    ? parsedTimestamp
    : receivedAt;

  const agentId = cleanString(
    firstDefined(
      source.cyryx_agent,
      source.agentId,
      source.agent,
      sourceData.agentId,
      sourceData.agent,
      sourceData.cyryx_agent,
    ),
    96,
  )?.replace(/^@/, '');

  const data = {
    agentId,
    agentName: cleanString(firstDefined(source.agentName, sourceData.agentName), 120),
    squadId: cleanString(firstDefined(source.squadId, sourceData.squadId), 96),
    command: cleanString(firstDefined(source.command, sourceData.command), 160),
    toolName: cleanString(
      firstDefined(source.tool_name, source.toolName, sourceData.tool_name, sourceData.toolName),
      120,
    ),
    task: cleanString(firstDefined(source.task, sourceData.task), 240),
    storyId: cleanString(
      firstDefined(
        source.cyryx_story_id,
        source.storyId,
        sourceData.cyryx_story_id,
        sourceData.storyId,
        sourceData.story,
      ),
      120,
    ),
    phase: cleanString(firstDefined(source.phase, sourceData.phase), 120),
    executor: cleanString(firstDefined(source.executor, sourceData.executor), 96),
    pid: cleanNumber(firstDefined(source.pid, sourceData.pid)),
    success: cleanBoolean(firstDefined(source.success, sourceData.success)),
    durationMs: cleanNumber(
      firstDefined(source.duration_ms, source.duration, sourceData.duration_ms, sourceData.duration, sourceData.durationMs),
    ),
    reason: cleanString(firstDefined(source.reason, sourceData.reason), 240),
    message: cleanString(
      firstDefined(source.message, source.error, sourceData.message, sourceData.error),
      320,
    ),
    collaborationMessage: cleanString(
      firstDefined(
        source.public_message,
        source.collaboration_message,
        sourceData.public_message,
        sourceData.collaboration_message,
        sourceData.collaborationMessage,
      ),
      640,
    ),
    sessionId: cleanString(firstDefined(source.sessionId, source.session_id, sourceData.sessionId, sourceData.session_id), 160),
    runId: cleanString(firstDefined(source.runId, source.run_id, sourceData.runId, sourceData.run_id), 160),
    status: cleanString(firstDefined(source.status, source.state, sourceData.status, sourceData.state), 32),
  };

  const host = firstDefined(source.host, sourceData.host, 'unknown');
  if (!HOSTS.has(host)) throw new Error('Unsupported producer host');
  data.host = host;
  data.projectId = cleanString(firstDefined(source.projectId, sourceData.projectId), 96);
  data.evidence = ['manual', 'test', 'runtime', 'local-session-log'].includes(source.evidence || sourceData.evidence)
    ? (source.evidence || sourceData.evidence) : 'manual';
  for (const field of ['sender', 'recipient', 'correlationId', 'originator']) {
    data[field] = cleanString(firstDefined(source[field], sourceData[field]), 160);
  }
  const progress = cleanNumber(firstDefined(source.progress, sourceData.progress));
  if (progress !== undefined) data.progress = Math.max(0, Math.min(100, progress));

  Object.keys(data).forEach((key) => data[key] === undefined && delete data[key]);

  return {
    schemaVersion: 2,
    id: cleanString(source.id, 160) || randomUUID(),
    type,
    timestamp,
    receivedAt: source.schemaVersion === 2 && Number.isFinite(source.receivedAt) ? source.receivedAt : receivedAt,
    state: deriveState(type, data),
    data,
  };
}

module.exports = {
  HOSTS,
  ACCEPTED_EVENT_TYPES,
  EXPLICIT_STATES,
  MAX_FUTURE_SKEW_MS,
  cleanString,
  deriveState,
  normalizeEvent,
};
