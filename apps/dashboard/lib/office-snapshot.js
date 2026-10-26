'use strict';

const catalog = require('./catalog.json');
const STATES = ['available', 'assigned', 'running', 'waiting', 'blocked', 'completed', 'failed', 'stale', 'offline'];
const PRIORITY = { running: 9, assigned: 8, blocked: 7, waiting: 6, failed: 5, completed: 4, available: 3, stale: 2, offline: 1 };
function snapshot(record, project, now = Date.now()) {
  const payload = record?.payload;
  const currentEpoch = payload?.epoch === project.epoch;
  const sessions = (payload?.sessions || []).map((row) => ({ ...row, key: row.id, observed: true,
    state: (!currentEpoch || now - row.lastSeen > 30000) && row.state !== 'offline' ? 'stale' : row.state,
    task: null, storyId: null, phase: null, toolName: null, command: null, pid: null, sessionId: row.id, runId: null,
  }));
  const counts = Object.fromEntries(STATES.map((state) => [state, 0])); counts.total = 0;
  const squads = catalog.squads.map((squad) => ({ ...squad, agents: squad.agents.map((agent) => {
    const observed = sessions.filter((row) => row.agentKey === agent.key).sort((a, b) => PRIORITY[b.state] - PRIORITY[a.state] || b.lastSeen - a.lastSeen);
    const row = { ...agent, squadName: squad.name, observed: false, state: 'offline', lastSeen: null, task: null,
      storyId: null, phase: null, toolName: null, command: null, pid: null, sessionId: null, runId: null,
      ...observed[0], key: agent.key, sessions: observed };
    counts[row.state] += 1; counts.total += 1;
    return row;
  }) }));
  const received = record?.received_at ? Date.parse(record.received_at) : null;
  const connectionState = received === null ? 'never-connected' : now - received > 60000 || payload?.epoch !== project.epoch ? 'offline' : 'connected';
  const events = (record?.history || payload?.events || []).filter((row) => row.timestamp >= now - 86400000).map((row) => ({ ...row, agentId: row.agentKey?.split('/').at(-1) || null,
    agentName: squads.flatMap((squad) => squad.agents).find((agent) => agent.key === row.agentKey)?.name || 'System',
    task: null, storyId: null, phase: null, toolName: null, command: null, message: null, collaborationMessage: null,
    deliveryStatus: 'observed-only',
  }));
  return { version: 1, sourceScope: 'connected-project', project: project.label, generatedAt: now,
    registryVersion: String(catalog.version), squadCount: squads.length, agentCount: counts.total,
    squads, counts, sessions, events, messages: [], heartbeatTtlMs: 30000,
    hosts: ['cli', 'codex', 'claude-code', 'gemini', 'grok', 'chatgpt'].map((id) => {
      const matching = sessions.filter((row) => row.host === id);
      const lastSeen = matching.length ? Math.max(...matching.map((row) => row.lastSeen)) : null;
      return { id, lastSeen, nativeVerified: false, evidence: matching.length ? 'bridge-tested' : 'unavailable',
        status: connectionState === 'connected' && matching.some((row) => row.state !== 'stale' && row.state !== 'offline') ? 'connected' : matching.length ? 'stale' : 'disconnected' };
    }),
    cloud: { projectId: project.id, receivedAt: record?.received_at || null, connectionState, sequence: payload?.sequence || 0,
      omitted: payload?.omitted || { sessions: 0, events: 0 } },
  };
}
module.exports = { catalog, snapshot };
