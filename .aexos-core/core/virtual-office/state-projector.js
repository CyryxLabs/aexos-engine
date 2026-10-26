'use strict';

const EventEmitter = require('events');
const { HOSTS } = require('./event-normalizer');

const ACTIVE_STATES = new Set(['available', 'assigned', 'running', 'waiting', 'blocked']);
const RECENT_STATES = new Set(['completed', 'failed']);

function normalizedAlias(value) {
  return String(value || '').trim().replace(/^@/, '').toLowerCase();
}

class VirtualOfficeProjector extends EventEmitter {
  constructor(catalog, options = {}) {
    super();
    this.catalog = catalog;
    this.projectName = options.projectName || 'AEXOS Project';
    this.heartbeatTtlMs = options.heartbeatTtlMs || 30000;
    this.recentCompletionMs = options.recentCompletionMs || 12000;
    this.eventHistoryLimit = options.eventHistoryLimit || 200;
    this.history = [];
    this.sessions = new Map();
    this.seenEventIds = new Set();
    this.agents = new Map();
    this.agentDefaults = new Map();
    this.aliases = new Map();

    catalog.squads.forEach((squad) => {
      squad.agents.forEach((agent) => {
        const state = {
          ...agent,
          squadName: squad.name,
          state: 'offline',
          observed: false,
          task: null,
          storyId: null,
          phase: null,
          toolName: null,
          command: null,
          pid: null,
          sessionId: null,
          runId: null,
          lastSeen: null,
          lastEventType: null,
        };
        this.agents.set(agent.key, state);
        this.agentDefaults.set(agent.key, { ...state });
        [agent.id, agent.name, agent.key].forEach((alias) => this._addAlias(alias, agent.key));
      });
    });
  }

  _addAlias(alias, key) {
    const normalized = normalizedAlias(alias);
    if (!normalized) return;
    const keys = this.aliases.get(normalized) || [];
    if (!keys.includes(key)) keys.push(key);
    this.aliases.set(normalized, keys);
  }

  resolveAgentKey(agentId, squadId) {
    const normalized = normalizedAlias(agentId);
    if (!normalized) return null;
    if (this.agents.has(normalized)) return normalized;

    const candidates = this.aliases.get(normalized) || [];
    if (candidates.length === 1) return candidates[0];
    if (squadId) {
      const expectedPrefix = `${normalizedAlias(squadId)}/`;
      return candidates.find((candidate) => candidate.toLowerCase().startsWith(expectedPrefix)) || null;
    }
    return null;
  }

  apply(event) {
    if (this.seenEventIds.has(event.id)) return { duplicate: true, changed: [] };
    this.seenEventIds.add(event.id);
    if (this.seenEventIds.size > this.eventHistoryLimit * 4) {
      this.seenEventIds = new Set([...this.seenEventIds].slice(-this.eventHistoryLimit * 2));
    }

    const agentKey = this.resolveAgentKey(event.data.agentId, event.data.squadId);
    const agent = agentKey ? this.agents.get(agentKey) : null;
    const sessionKey = JSON.stringify([event.data.projectId || '', event.data.host || 'unknown',
      event.data.sessionId || 'legacy', agentKey || event.data.agentId || 'system', event.data.runId || '']);
    const previous = this.sessions.get(sessionKey);
    let changed = [];
    let ignoredReason = null;
    if (previous && event.timestamp < previous.lastSeen) {
      ignoredReason = 'out-of-order';
    } else if (!agent && event.data.agentId) {
      ignoredReason = 'unresolved-agent';
    } else {
      const session = {
        ...previous, ...event.data, key: sessionKey, agentKey,
        state: event.state || previous?.state || 'available',
        lastSeen: event.timestamp, lastEventType: event.type, observed: true,
      };
      if (event.state) session.workState = event.state;
      // Liveness alone must never revive ended work or change waiting/blocked work.
      if (event.type === 'AgentHeartbeat' && previous?.state === 'stale') {
        session.state = previous.workState || 'available';
      }
      this.sessions.set(sessionKey, session);
      if (this.sessions.size > 2000) this.sessions.delete(this.sessions.keys().next().value);
      if (event.type === 'SessionEnd' && !event.data.agentId) {
        this.sessions.forEach((entry) => {
          if (entry.host === session.host && entry.sessionId === session.sessionId && entry.lastSeen <= event.timestamp) {
            entry.state = 'offline'; entry.workState = 'offline'; entry.lastSeen = event.timestamp;
          }
        });
      }
      changed = this.aggregateAgents();
    }

    const timelineEvent = {
      host: event.data.host || 'unknown',
      evidence: event.data.evidence || 'manual',
      sender: event.data.sender || event.data.agentId || null,
      recipient: event.data.recipient || null,
      correlationId: event.data.correlationId || null,
      deliveryStatus: 'observed-only',
      id: event.id,
      type: event.type,
      timestamp: event.timestamp,
      state: event.state,
      agentKey,
      agentId: event.data.agentId || null,
      agentName: agent?.name || event.data.agentName || event.data.agentId || 'System',
      squadId: agent?.squadId || event.data.squadId || null,
      task: event.data.task || null,
      storyId: event.data.storyId || null,
      phase: event.data.phase || null,
      toolName: event.data.toolName || null,
      command: event.data.command || null,
      sessionId: event.data.sessionId || null,
      runId: event.data.runId || null,
      success: event.data.success,
      message: event.data.message || event.data.reason || null,
      collaborationMessage: event.data.collaborationMessage || null,
      ignoredReason,
    };
    this.history.unshift(timelineEvent);
    this.history = this.history.slice(0, this.eventHistoryLimit);

    const delta = { duplicate: false, event: timelineEvent, changed, counts: this.getCounts(), ...this.liveFields() };
    this.emit('change', delta);
    return delta;
  }

  aggregateAgents() {
    const changed = [];
    this.agents.forEach((agent, key) => {
      const sessions = [...this.sessions.values()].filter((session) => session.agentKey === key);
      const priority = { running: 9, assigned: 8, blocked: 7, waiting: 6, failed: 5,
        completed: 4, available: 3, stale: 2, offline: 1 };
      sessions.sort((a, b) => (priority[b.state] - priority[a.state]) || b.lastSeen - a.lastSeen);
      if (sessions[0]) {
        const { key: _sessionKey, agentKey: _agentKey, ...observed } = sessions[0];
        const projected = { ...this.agentDefaults.get(key), ...observed,
          sessions: sessions.map((session) => ({ ...session })) };
        this.agents.set(key, projected);
        changed.push({ ...projected });
      } else if (agent.observed) {
        const projected = { ...this.agentDefaults.get(key), observed: true, sessions: [] };
        this.agents.set(key, projected);
        changed.push({ ...projected });
      }
    });
    return changed;
  }

  liveFields(now = Date.now()) {
    const sessions = [...this.sessions.values()].map((session) => ({ ...session }));
    return {
      heartbeatTtlMs: this.heartbeatTtlMs,
      sessions,
      hosts: [...HOSTS].filter((id) => id !== 'unknown').map((id) => {
        const entries = sessions.filter((session) => session.host === id);
        const lastSeen = entries.length ? Math.max(...entries.map((session) => session.lastSeen)) : null;
        const live = entries.some((session) => session.state !== 'offline' && now - session.lastSeen <= this.heartbeatTtlMs);
        return { id, status: live ? 'connected' : entries.some((entry) => entry.state !== 'offline') ? 'stale' : 'disconnected',
          lastSeen, evidence: entries.length ? 'bridge-tested' : 'unavailable', nativeVerified: false };
      }),
      messages: this.history.filter((event) => event.collaborationMessage),
    };
  }

  tick(now = Date.now()) {
    let expired = false;
    this.sessions.forEach((session) => {
      if (ACTIVE_STATES.has(session.state) && now - session.lastSeen > this.heartbeatTtlMs) {
        session.workState = session.state;
        session.state = 'stale'; expired = true;
      } else if (RECENT_STATES.has(session.state) && now - session.lastSeen > this.recentCompletionMs) {
        session.state = now - session.lastSeen > this.heartbeatTtlMs ? 'stale' : 'available';
        session.task = null; expired = true;
      }
    });
    const changed = expired ? this.aggregateAgents() : [];
    if (changed.length || expired) this.emit('change', { event: null, changed, counts: this.getCounts(), ...this.liveFields(now) });
    return changed;
  }

  getCounts() {
    const counts = {
      total: this.agents.size,
      available: 0,
      assigned: 0,
      running: 0,
      waiting: 0,
      blocked: 0,
      completed: 0,
      failed: 0,
      stale: 0,
      offline: 0,
    };
    this.agents.forEach((agent) => {
      counts[agent.state] += 1;
    });
    return counts;
  }

  getSnapshot() {
    const agentsBySquad = new Map();
    this.agents.forEach((agent) => {
      const agents = agentsBySquad.get(agent.squadId) || [];
      agents.push({ ...agent });
      agentsBySquad.set(agent.squadId, agents);
    });

    return {
      version: 1,
      sourceScope: this.catalog.sourceScope || 'project',
      ...this.liveFields(),
      generatedAt: Date.now(),
      project: this.projectName,
      registryVersion: this.catalog.version,
      squadCount: this.catalog.squadCount,
      agentCount: this.catalog.agentCount,
      counts: this.getCounts(),
      squads: this.catalog.squads.map((squad) => ({
        id: squad.id,
        name: squad.name,
        domain: squad.domain,
        description: squad.description,
        entryAgent: squad.entryAgent,
        agents: agentsBySquad.get(squad.id) || [],
      })),
      events: [...this.history],
    };
  }
}

module.exports = {
  ACTIVE_STATES,
  RECENT_STATES,
  VirtualOfficeProjector,
  normalizedAlias,
};
