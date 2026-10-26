'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { CodexSessionObserver } = require('../../../.aexos-core/core/virtual-office/codex-observer');
const { parseArgs } = require('../../../.aexos-core/core/virtual-office/cli');
const { createVirtualOfficeServer } = require('../../../.aexos-core/core/virtual-office/server');
const meta = (cwd, originator = 'Codex Desktop') => JSON.stringify({ type: 'session_meta', payload: { id: 'session-1', cwd, originator, source: 'vscode' } }) + '\n';
const record = (type, id = 'turn-1', timestamp = '2026-01-01T00:00:00Z') => JSON.stringify({ type: 'event_msg', timestamp, payload: { type, turn_id: id, last_agent_message: 'PRIVATE-CANARY' } }) + '\n';

describe('Opt-in Codex session observer', () => {
  let root;
  let sessionsRoot;
  let file;
  let events;
  let submit;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-observer-'));
    sessionsRoot = path.join(root, 'sessions'); fs.mkdirSync(sessionsRoot);
    file = path.join(sessionsRoot, 'rollout-session-1.jsonl');
    events = [];
    submit = jest.fn(async (_root, event) => { events.push(event); return { accepted: true }; });
  });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });
  const observer = () => new CodexSessionObserver(root, { sessionsRoot, submit });
  it('accepts stdin marker without accepting a missing file value', () => {
    expect(parseArgs(['emit', '--file', '-', '--producer-host', 'cli']).file).toBe('-');
    expect(() => parseArgs(['emit', '--file', '--producer-host'])).toThrow();
  });
  it('filters other sessions from the same project before attributing agent activity', async () => {
    fs.writeFileSync(file, meta(root) + record('task_started'));
    fs.writeFileSync(path.join(sessionsRoot, 'other.jsonl'), meta(root).replace('session-1', 'session-2') + record('task_complete'));
    const reader = new CodexSessionObserver(root, { sessionsRoot, submit, sessionId: 'session-1', agentId: 'aexos-master' });
    await reader.scan();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ sessionId: 'session-1', agentId: 'aexos-master', type: 'CommandStart' });
    expect(parseArgs(['--observe-codex', '--session-id', 'session-1']).sessionId).toBe('session-1');
  });
  it('finds an exact older session despite more than 64 unrelated newer files', async () => {
    const recent = path.join(sessionsRoot, '2026/09/07');
    const older = path.join(sessionsRoot, '2026/09/06');
    fs.mkdirSync(recent, { recursive: true }); fs.mkdirSync(older, { recursive: true });
    for (let i = 0; i < 80; i += 1) fs.writeFileSync(path.join(recent, `rollout-new-${i}.jsonl`), meta(root) + record('task_complete'));
    fs.writeFileSync(path.join(older, 'rollout-session-1.jsonl'), meta(root) + record('task_started'));
    // A matching filename with another session's metadata is still untrusted.
    fs.writeFileSync(path.join(recent, 'rollout-session-1.jsonl'), meta(root).replace('session-1', 'session-2') + record('task_complete'));
    const reader = new CodexSessionObserver(root, { sessionsRoot, submit, sessionId: 'session-1' });
    await reader.scan();
    expect(events).toHaveLength(1); expect(events[0].type).toBe('CommandStart');
  });
  it('observes custom tools by name while excluding their freeform input', async () => {
    fs.writeFileSync(file, meta(root) + record('task_started') + JSON.stringify({
      type: 'response_item', timestamp: '2026-01-01T00:00:01Z', payload: {
        type: 'custom_tool_call', name: 'exec', call_id: 'custom-1', input: 'PRIVATE-CANARY',
      },
    }) + '\n');
    await observer().scan();
    expect(events.at(-1)).toMatchObject({ type: 'PreToolUse', toolName: 'exec' });
    expect(JSON.stringify(events)).not.toContain('PRIVATE-CANARY');
  });
  it('binds checkpoints to session selection and agent mapping, preserving replay after mapping changes', async () => {
    fs.writeFileSync(file, meta(root) + record('task_started'));
    const first = new CodexSessionObserver(root, { sessionsRoot, submit, sessionId: 'session-1', agentId: 'dev' });
    await first.scan();
    const same = new CodexSessionObserver(root, { sessionsRoot, submit, sessionId: 'session-1', agentId: 'dev' });
    await same.scan(); expect(events).toHaveLength(1);
    const mapped = new CodexSessionObserver(root, { sessionsRoot, submit, sessionId: 'session-1', agentId: 'qa' });
    expect(mapped.binding).not.toBe(first.binding);
    await mapped.scan(); expect(events).toHaveLength(2);
    expect(events[1].agentId).toBe('qa');
    expect(events[1].id).not.toBe(events[0].id);
    const filtered = new CodexSessionObserver(root, { sessionsRoot, submit, sessionId: 'session-2', agentId: 'qa' });
    expect(filtered.binding).not.toBe(mapped.binding);
    await filtered.scan(); expect(events).toHaveLength(2);
  });
  it('validates project and originator before any event, including vscode-sourced desktop', async () => {
    fs.writeFileSync(file, meta(os.tmpdir()) + record('task_started'));
    await observer().scan(); expect(events).toHaveLength(0);
    fs.writeFileSync(file, meta(root) + record('task_started'));
    await observer().scan();
    expect(events[0]).toMatchObject({ host: 'codex', originator: 'Codex Desktop', sessionId: 'session-1', runId: 'turn-1',
      type: 'CommandStart', timestamp: Date.parse('2026-01-01T00:00:00Z'), evidence: 'local-session-log' });
  });
  it('handles partial records and durable restart without duplicate emission or private checkpoint data', async () => {
    const complete = record('task_complete');
    fs.writeFileSync(file, meta(root) + record('task_started') + complete.slice(0, -8));
    await observer().scan(); expect(events).toHaveLength(1);
    fs.appendFileSync(file, complete.slice(-8));
    const second = observer(); await second.scan(); await second.scan();
    expect(events).toHaveLength(2);
    expect(events[1].type).toBe('CommandComplete');
    expect(JSON.stringify(events)).not.toContain('PRIVATE-CANARY');
    expect(fs.readFileSync(second.checkpoint, 'utf8')).not.toContain('PRIVATE-CANARY');
  });
  it('forwards tool name only, never arguments/results/reasoning, and skips malformed records', async () => {
    const tool = JSON.stringify({ type: 'response_item', timestamp: '2026-01-01T00:00:01Z', payload: {
      type: 'function_call', name: 'exec_command', call_id: 'tool-1', arguments: 'PRIVATE-CANARY',
    } });
    fs.writeFileSync(file, meta(root) + record('task_started') + 'null\ninvalid\n' + tool + '\n');
    await observer().scan();
    expect(events).toHaveLength(2); expect(events[1].toolName).toBe('exec_command');
    expect(JSON.stringify(events)).not.toContain('PRIVATE-CANARY');
  });
  it('retries failed delivery with identical deterministic ID and original time', async () => {
    fs.writeFileSync(file, meta(root) + record('task_started'));
    submit.mockRejectedValueOnce(new Error('HTTP 401'));
    const reader = observer(); expect((await reader.scan()).status).toBe('delivery-unavailable');
    await reader.scan();
    expect(submit.mock.calls[0][1].id).toBe(submit.mock.calls[1][1].id);
    expect(events).toHaveLength(1);
  });
  it('recovers truncation and rotation without adopting an unrelated project', async () => {
    fs.writeFileSync(file, meta(root) + record('task_started'));
    const reader = observer(); await reader.scan();
    fs.writeFileSync(file, meta(root) + record('task_complete'));
    await reader.scan(); expect(events.at(-1).type).toBe('CommandComplete');
    fs.unlinkSync(file); fs.writeFileSync(file, meta(os.tmpdir()) + record('task_started', 'wrong'));
    await reader.scan(); expect(events).toHaveLength(2);
  });
  it('bootstraps a long active log backwards without exposing oversized private records', async () => {
    const huge = JSON.stringify({ type: 'response_item', payload: { type: 'message', content: 'PRIVATE-CANARY'.repeat(30000) } }) + '\n';
    fs.writeFileSync(file, meta(root) + record('task_started') + huge + record('task_complete'));
    const reader = observer();
    for (let cycle = 0; cycle < 5; cycle += 1) await reader.scan();
    expect(events.some((event) => event.type === 'CommandComplete')).toBe(true);
    expect(JSON.stringify(events)).not.toContain('PRIVATE-CANARY');
    expect(fs.statSync(reader.checkpoint).size).toBeLessThan(2048);
  });
  it('finds an earlier turn boundary before forwarding later tool names', async () => {
    const huge = JSON.stringify({ type: 'response_item', payload: { type: 'message', content: 'PRIVATE-CANARY'.repeat(30000) } }) + '\n';
    const tool = JSON.stringify({ type: 'response_item', timestamp: '2026-01-01T00:00:01Z', payload: {
      type: 'function_call', name: 'exec_command', call_id: 'tool-1', arguments: 'PRIVATE-CANARY',
    } }) + '\n';
    fs.writeFileSync(file, meta(root) + record('task_started') + huge + tool);
    const reader = observer();
    for (let cycle = 0; cycle < 8; cycle += 1) await reader.scan();
    expect(events.some((event) => event.toolName === 'exec_command' && event.runId === 'turn-1')).toBe(true);
  });
  it('reports missing roots unavailable and refuses links', async () => {
    const missing = new CodexSessionObserver(root, { sessionsRoot: path.join(root, 'absent'), submit });
    expect((await missing.scan()).status).toBe('unavailable');
    const linked = path.join(root, 'linked'); fs.symlinkSync(sessionsRoot, linked, 'junction');
    expect((await new CodexSessionObserver(root, { sessionsRoot: linked, submit }).scan()).status).toBe('unavailable');
  });
  it('delivers authenticated historical lifecycle without claiming current work', async () => {
    const catalog = { version: '1', squadCount: 0, agentCount: 0, squads: [] };
    const config = { host: '127.0.0.1', port: 0, heartbeatTtlMs: 1000, recentCompletionMs: 500,
      eventHistoryLimit: 20, maxEventBytes: 8192, pollingIntervalMs: 50 };
    const office = createVirtualOfficeServer({ projectRoot: root, catalog, config });
    try {
      const address = await office.start();
      fs.writeFileSync(file, meta(root) + record('task_started'));
      const reader = new CodexSessionObserver(root, { sessionsRoot, url: `http://127.0.0.1:${address.port}/events` });
      expect((await reader.scan()).observed).toBe(1);
      office.projector.tick();
      const snapshot = office.projector.getSnapshot();
      expect(snapshot.sessions[0]).toMatchObject({ state: 'stale', originator: 'Codex Desktop', evidence: 'local-session-log' });
      expect(snapshot.hosts.find((host) => host.id === 'codex').status).toBe('stale');
    } finally { await office.stop(); }
  });
});
