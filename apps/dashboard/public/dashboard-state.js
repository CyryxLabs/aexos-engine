'use strict';

/* global window */

(function registerDashboardState(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AexosDashboardState = api;
}(typeof window === 'object' ? window : null, () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const CONNECTIONS = new Set(['never-connected', 'connected', 'stale', 'offline']);
  const PRIVATE_KEYS = new Set(['prompt', 'reasoning', 'message', 'collaborationmessage', 'task', 'command', 'args', 'arguments', 'toolinput', 'tooloutput', 'path', 'environment', 'rawerror', 'error']);
  const OBSERVATION_STALE_MS = 30000;
  const BRIDGE_OFFLINE_MS = 60000;
  const time = (value) => typeof value === 'number' ? value : Date.parse(value);

  function projects(body) {
    if (!body || !Array.isArray(body.projects) || body.projects.length > 100) throw new Error('Invalid project list');
    return body.projects.map((project) => {
      if (!project || !UUID.test(project.id) || typeof project.label !== 'string' || !project.label.trim() || project.label.length > 80
          || typeof project.connected !== 'boolean' || (project.lastReceivedAt !== null && typeof project.lastReceivedAt !== 'string')) {
        throw new Error('Invalid project metadata');
      }
      return { id: project.id, label: project.label, connected: project.connected, lastReceivedAt: project.lastReceivedAt };
    });
  }

  function snapshot(snapshot, expectedProjectId) {
    const cloud = snapshot?.cloud;
    const awaitingConnection = cloud?.connectionState === 'never-connected';
    if (!snapshot || !Array.isArray(snapshot.squads) || !cloud || cloud.projectId !== expectedProjectId
        || !UUID.test(cloud.projectId)
        || (awaitingConnection ? cloud.receivedAt !== null || cloud.sequence !== 0 : !Number.isFinite(time(cloud.receivedAt)))
        || !CONNECTIONS.has(cloud.connectionState) || !Number.isSafeInteger(cloud.sequence) || cloud.sequence < 0
        || !cloud.omitted || typeof cloud.omitted !== 'object' || Array.isArray(cloud.omitted)) {
      throw new Error('Invalid project snapshot');
    }
    const inspect = (value, depth = 0) => {
      if (depth > 12) throw new Error('Invalid project snapshot');
      if (!value || typeof value !== 'object') return;
      for (const [key, nested] of Object.entries(value)) {
        if (PRIVATE_KEYS.has(key.toLowerCase()) && nested !== null) throw new Error('Private metadata is not renderable');
        inspect(nested, depth + 1);
      }
    };
    if (Array.isArray(snapshot.messages) && snapshot.messages.length) throw new Error('Private messages are not renderable');
    inspect(snapshot);
    return snapshot;
  }

  function connection(snapshotValue, now = Date.now()) {
    if (snapshotValue.cloud.connectionState === 'never-connected') return { live: false, setup: true, label: 'Awaiting local bridge', title: 'Connect this project' };
    const receivedAt = time(snapshotValue.cloud.receivedAt);
    const observedAt = time(snapshotValue.generatedAt);
    const receiptAge = Number.isFinite(receivedAt) ? Math.max(0, now - receivedAt) : Infinity;
    const observationAge = Number.isFinite(observedAt) ? Math.max(0, now - observedAt) : Infinity;
    if (snapshotValue.cloud.connectionState === 'offline' || receiptAge > BRIDGE_OFFLINE_MS) return { live: false, label: 'Bridge offline', title: 'Local bridge offline' };
    if (snapshotValue.cloud.connectionState === 'stale' || observationAge > OBSERVATION_STALE_MS) return { live: false, label: 'Observation stale', title: 'Agent observation is stale' };
    return { live: true, label: 'Live metadata connected', title: '' };
  }

  function tokenMemory() {
    let value = '';
    return {
      set(token) { if (typeof token !== 'string' || !token) throw new Error('Invalid token'); value = token; },
      read() { return value; },
      clear() { value = ''; },
    };
  }

  function binding(body) {
    const project = body?.project;
    if (!project || !UUID.test(project.id) || !UUID.test(project.epoch) || body.epoch !== project.epoch
        || typeof project.label !== 'string' || !project.label.trim() || project.label.length > 80
        || typeof body.ingestToken !== 'string' || !body.ingestToken || typeof body.expiresAt !== 'string'
        || !Number.isFinite(Date.parse(body.expiresAt))) throw new Error('Invalid connection binding');
    let ingest; let origin;
    try { ingest = new URL(body.ingestUrl); origin = new URL(body.origin); } catch { throw new Error('Invalid connection binding'); }
    if (ingest.protocol !== 'https:' || origin.protocol !== 'https:' || ingest.origin !== origin.origin
        || body.origin !== origin.origin || ingest.username || ingest.password || ingest.hash
        || /[\s"'`;$|&<>]/.test(body.ingestUrl) || /[\s"'`;$|&<>]/.test(body.origin)) throw new Error('Invalid connection binding');
    const command = `aexos office connect --project-root <your-project-path> --project-id ${project.id} --epoch ${project.epoch} --ingest-url ${body.ingestUrl} --origin ${body.origin}`;
    return Object.freeze({ project, ingestToken: body.ingestToken, command, expiresAt: body.expiresAt || null });
  }

  return Object.freeze({ binding, connection, projects, snapshot, tokenMemory });
}));
