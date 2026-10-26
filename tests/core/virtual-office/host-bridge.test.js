'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { normalizeEvent } = require('../../../.aexos-core/core/virtual-office/event-normalizer');
const { VirtualOfficeProjector } = require('../../../.aexos-core/core/virtual-office/state-projector');
const { createVirtualOfficeServer } = require('../../../.aexos-core/core/virtual-office/server');
const { submitEvent, producerToken } = require('../../../.aexos-core/core/virtual-office/host-bridge');
const catalog = { version: '1', squadCount: 1, agentCount: 1, squads: [{ id: 'core', name: 'Core',
  agents: [{ id: 'dev', name: 'Dev', key: 'core/dev', squadId: 'core' }] }] };
const config = { host: '127.0.0.1', port: 0, heartbeatTtlMs: 1000, recentCompletionMs: 500,
  eventHistoryLimit: 50, maxEventBytes: 8192, pollingIntervalMs: 50 };
function event(id, type, host = 'cli', timestamp = Date.now(), extra = {}) {
  return normalizeEvent({ id, type, host, timestamp, agentId: 'dev', sessionId: 's', runId: 'r', ...extra });
}

describe('AEX-4.4 host bridge and durable observation', () => {
  let root;
  let office;
  let url;
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-bridge-'));
    office = createVirtualOfficeServer({ projectRoot: root, catalog, config });
    const address = await office.start();
    url = `http://127.0.0.1:${address.port}`;
  });
  afterEach(async () => {
    await office.stop();
    fs.rmSync(root, { recursive: true, force: true });
  });
  it('keeps concurrent hosts and runs independent and heartbeats preserve waiting', () => {
    const projector = new VirtualOfficeProjector(catalog, { heartbeatTtlMs: 1000 });
    projector.apply(event('a', 'CommandStart', 'claude-code', 1000));
    projector.apply(event('b', 'CommandStart', 'gemini', 1001));
    projector.apply(event('c', 'CommandComplete', 'claude-code', 1002));
    expect(projector.getCounts().running).toBe(1);
    projector.apply(event('d', 'AgentWaiting', 'gemini', 1003));
    projector.apply(event('e', 'AgentHeartbeat', 'gemini', 1004));
    expect(projector.getCounts().waiting).toBe(1);
    projector.apply(event('old', 'CommandStart', 'gemini', 999));
    expect(projector.getCounts().waiting).toBe(1);
    projector.tick(2200);
    expect(projector.getCounts().running).toBe(0);
    expect(projector.getSnapshot().sessions).toHaveLength(2);
  });
  it('never mixes an old session task or tool into a newly selected host session', () => {
    const projector = new VirtualOfficeProjector(catalog, { heartbeatTtlMs: 1000 });
    projector.apply(event('legacy', 'CommandStart', 'unknown', 1000, {
      task: 'Old route', toolName: '*route', command: '*route', storyId: 'old-story',
      progress: 75, reason: 'old reason',
    }));
    projector.tick(2100);
    projector.apply(event('native', 'SessionStart', 'claude-code', 2200, {
      sessionId: 'new-session', storyId: 'native-startup',
    }));
    const agent = projector.getSnapshot().squads[0].agents[0];
    expect(agent).toMatchObject({ host: 'claude-code', storyId: 'native-startup',
      sessionId: 'new-session', task: null, toolName: null, command: null });
    expect(agent).not.toHaveProperty('progress');
    expect(agent).not.toHaveProperty('reason');
    expect(agent.sessions.find((session) => session.host === 'unknown').task).toBe('Old route');
  });
  it('never revives completed work from an earlier stale running state', () => {
    const projector = new VirtualOfficeProjector(catalog, { heartbeatTtlMs: 1000, recentCompletionMs: 500 });
    projector.apply(event('start', 'CommandStart', 'cli', 1000));
    projector.tick(2100);
    projector.apply(event('renew', 'AgentHeartbeat', 'cli', 2200));
    expect(projector.getCounts().running).toBe(1);
    projector.apply(event('done', 'CommandComplete', 'cli', 2300));
    projector.tick(3400);
    projector.apply(event('heartbeat', 'AgentHeartbeat', 'cli', 3500));
    expect(projector.getCounts().running).toBe(0);
    expect(projector.getCounts().completed).toBe(1);
    projector.apply(event('end', 'SessionEnd', 'cli', 3600));
    projector.apply(event('late-heartbeat', 'AgentHeartbeat', 'cli', 3700));
    expect(projector.getCounts().offline).toBe(1);
  });
  it.each(['false', 0, null, {}])('rejects malformed supplied success %p', (success) => {
    expect(() => normalizeEvent({ type: 'CommandComplete', success })).toThrow('boolean');
  });
  it('retries a queued observation after temporary journal failure without restart', async () => {
    fs.mkdirSync(office.eventLogPath);
    await submitEvent(root, event('recover', 'CommandStart'), { url: 'http://127.0.0.1:1/events', queue: true });
    await new Promise((resolve) => setTimeout(resolve, 160));
    expect(office.projector.seenEventIds.has('recover')).toBe(false);
    fs.rmdirSync(office.eventLogPath);
    const deadline = Date.now() + 2000;
    while (!office.projector.seenEventIds.has('recover') && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(office.projector.seenEventIds.has('recover')).toBe(true);
    expect(fs.readFileSync(office.eventLogPath, 'utf8')).toContain('recover');
  });
  it('preserves camelCase identities and public messages through replay normalization', () => {
    const original = event('public', 'AgentCollaborationMessage', 'cli', Date.now(), {
      public_message: 'Review token=secret', recipient: 'qa', correlationId: 'thread', evidence: 'test',
    });
    const twice = normalizeEvent(original);
    expect(twice.data).toEqual(original.data);
    expect(twice.data.collaborationMessage).toBe('Review token=[REDACTED]');
  });
  it('rejects anonymous, cross-origin, cross-project and unknown producer traffic', async () => {
    const payload = event('x', 'CommandStart');
    const headers = { 'Content-Type': 'application/json' };
    expect((await fetch(`${url}/events`, { method: 'POST', headers, body: JSON.stringify(payload) })).status).toBe(401);
    headers.Authorization = `Bearer ${producerToken(root)}`;
    headers.Origin = 'https://evil.example';
    expect((await fetch(`${url}/events`, { method: 'POST', headers, body: JSON.stringify(payload) })).status).toBe(403);
    delete headers.Origin;
    payload.data.projectId = 'another-project';
    expect((await fetch(`${url}/events`, { method: 'POST', headers, body: JSON.stringify(payload) })).status).toBe(400);
    await expect(submitEvent(root, { ...payload, host: 'fake-host' }, { url: `${url}/events` })).rejects.toThrow('Unsupported');
    expect(office.projector.getCounts().running).toBe(0);
  });
  it('persists before publishing, deduplicates and restores its own journal', async () => {
    const payload = event('persist', 'CommandStart');
    await submitEvent(root, payload, { url: `${url}/events` });
    expect(fs.readFileSync(office.eventLogPath, 'utf8')).toContain('persist');
    expect((await submitEvent(root, payload, { url: `${url}/events` })).duplicate).toBe(true);
    await office.stop();
    office = createVirtualOfficeServer({ projectRoot: root, catalog, config });
    await office.start();
    expect(office.projector.getSnapshot().events).toHaveLength(1);
    expect(office.projector.getSnapshot().sessions[0].sessionId).toBe('s');
  });
  it('tails offline fallback events and retains them on collector restart', async () => {
    await submitEvent(root, event('queued', 'CommandStart'), { url: 'http://127.0.0.1:1/events', queue: true });
    const deadline = Date.now() + 2000;
    while (!office.projector.seenEventIds.has('queued') && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(office.projector.seenEventIds.has('queued')).toBe(true);
    expect(fs.readFileSync(office.eventLogPath, 'utf8')).toContain('queued');
  });
  it('does not publish or apply when journal persistence fails', async () => {
    fs.mkdirSync(office.eventLogPath);
    await expect(office.ingest(event('fail', 'CommandStart'))).rejects.toThrow();
    expect(office.projector.getCounts().running).toBe(0);
  });
});
