'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const lockfile = require('proper-lockfile');
const { fork } = require('child_process');
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

  const messageFrom = (child, code) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error(`Child did not report ${code}`)), 8000);
    const onExit = () => finish(new Error(`Child exited before ${code}`));
    const onMessage = (message) => { if (message.code === code) finish(null, message); };
    function finish(error, value) {
      clearTimeout(timeout); child.off('exit', onExit); child.off('error', finish); child.off('message', onMessage);
      if (error) reject(error); else resolve(value);
    }
    child.once('error', finish); child.once('exit', onExit); child.on('message', onMessage);
  });

  const stopChild = async (child) => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Child termination was not observed')), 5000);
      child.once('exit', () => { clearTimeout(timeout); resolve(); });
      child.kill('SIGKILL');
    });
  };

  it('coordinates a real child process and resumes its committed checkpoint', async () => {
    fs.writeFileSync(file, meta(root) + record('task_started'));
    const stale = observer();
    const child = fork(path.resolve(__dirname, '../../helpers/codex-observer-child.cjs'), [root, sessionsRoot],
      { silent: true, windowsHide: true });
    try {
      await messageFrom(child, 'SUBMISSION_HELD');
      expect((await stale.scan()).status).toBe('busy');
      const done = messageFrom(child, 'SCAN_COMPLETE'); child.send('release');
      expect((await done).result).toMatchObject({ status: 'observing', observed: 1 });
      await stale.scan();
      expect(events).toHaveLength(0);
    } finally { await stopChild(child); }
  });

  it('recovers scan ownership after an actual child-process interruption', async () => {
    fs.writeFileSync(file, meta(root) + record('task_started'));
    const child = fork(path.resolve(__dirname, '../../helpers/codex-observer-child.cjs'), [root, sessionsRoot],
      { silent: true, windowsHide: true });
    try {
      await messageFrom(child, 'SUBMISSION_HELD');
      const replacement = observer();
      expect((await replacement.scan()).status).toBe('busy');
      await stopChild(child);
      const deadline = Date.now() + 13000;
      let result;
      do {
        result = await replacement.scan();
        if (result.status !== 'busy') break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      } while (Date.now() < deadline);
      expect(result).toMatchObject({ status: 'observing', observed: 1 });
      expect(events).toHaveLength(1);
      expect(fs.existsSync(`${replacement.checkpoint}.lock`)).toBe(false);
    } finally { await stopChild(child); }
  }, 25000);

  it('reloads committed cursors when same-binding readers were constructed before either scan', async () => {
    fs.writeFileSync(file, meta(root) + record('task_started'));
    const first = observer(); const second = observer();
    expect((await first.scan()).status).toBe('observing');
    expect((await second.scan()).status).toBe('observing');
    expect(events).toHaveLength(1);
    fs.appendFileSync(file, record('task_complete'));
    await second.scan(); await first.scan();
    expect(events.map((event) => event.type)).toEqual(['CommandStart', 'CommandComplete']);
  });

  it('defers an overlapping same-binding scan without delivery or cursor changes', async () => {
    fs.writeFileSync(file, meta(root) + record('task_started'));
    let signalEntered; let unblock;
    const entered = new Promise((resolve) => { signalEntered = resolve; });
    const held = new Promise((resolve) => { unblock = resolve; });
    const first = new CodexSessionObserver(root, { sessionsRoot, submit: async (...args) => {
      signalEntered(); await held; return submit(...args);
    } });
    const second = observer(); const work = first.scan();
    try {
      await entered;
      expect(await second.scan()).toMatchObject({ status: 'busy', observed: 0 });
      expect(fs.existsSync(first.checkpoint)).toBe(false);
      expect(events).toHaveLength(0);
    } finally { unblock(); await work; }
    await second.scan();
    expect(events).toHaveLength(1);
  });

  it('releases coordination after delivery failure and retries the unchanged observation', async () => {
    fs.writeFileSync(file, meta(root) + record('task_started'));
    const unavailable = new CodexSessionObserver(root, { sessionsRoot,
      submit: async () => { throw new Error('collector offline'); } });
    expect((await unavailable.scan()).status).toBe('delivery-unavailable');
    expect((await observer().scan()).status).toBe('observing');
    expect(events).toHaveLength(1);
    expect(events[0].timestamp).toBe(Date.parse('2026-01-01T00:00:00Z'));
  });

  it('releases coordination after checkpoint failure and replays with stable identity', async () => {
    fs.writeFileSync(file, meta(root) + record('task_started'));
    const first = observer();
    const rename = jest.spyOn(fs, 'renameSync').mockImplementationOnce(() => { throw new Error('checkpoint unavailable'); });
    try { expect((await first.scan()).status).toBe('unavailable'); }
    finally { rename.mockRestore(); }
    await first.scan();
    expect(events).toHaveLength(2);
    expect(events[1]).toEqual(events[0]);
  });
  it('reloads the checkpoint for observers constructed before either scans', async () => {
    fs.writeFileSync(file, meta(root) + record('task_started'));
    const first = observer(); const stale = observer();
    await first.scan(); await stale.scan();
    expect(events).toHaveLength(1);
  });
  it('defers overlapping same-binding scans without submissions or checkpoint changes', async () => {
    fs.writeFileSync(file, meta(root) + record('task_started'));
    let entered; const entering = new Promise((resolve) => { entered = resolve; });
    let resume; const barrier = new Promise((resolve) => { resume = resolve; });
    submit.mockImplementationOnce(async (_root, event) => {
      events.push(event); entered(); await barrier; return { accepted: true };
    });
    const first = observer(); const second = observer();
    const active = first.scan(); await entering;
    let deferred;
    try {
      deferred = await second.scan();
      expect(deferred.status).toBe('busy');
      expect(events).toHaveLength(1);
      expect(fs.existsSync(first.checkpoint)).toBe(false);
    } finally { resume(); await active; }
    await second.scan(); expect(events).toHaveLength(1);
  });
  it('allows different bindings to scan while one binding is held', async () => {
    fs.writeFileSync(file, meta(root) + record('task_started'));
    let entered; const entering = new Promise((resolve) => { entered = resolve; });
    let resume; const barrier = new Promise((resolve) => { resume = resolve; });
    const first = new CodexSessionObserver(root, { sessionsRoot, agentId: 'dev', submit: async () => {
      entered(); await barrier; return { accepted: true };
    } });
    const active = first.scan(); await entering;
    try {
      const second = new CodexSessionObserver(root, { sessionsRoot, agentId: 'qa', submit });
      expect((await second.scan()).status).toBe('observing');
      expect(events).toHaveLength(1);
    } finally { resume(); await active; }
  });
  it('releases scan ownership after a scan failure', async () => {
    const first = observer();
    fs.rmdirSync(sessionsRoot);
    expect((await first.scan()).status).toBe('unavailable');
    fs.mkdirSync(sessionsRoot); fs.writeFileSync(file, meta(root) + record('task_started'));
    expect((await observer().scan()).observed).toBe(1);
    expect(fs.existsSync(`${first.checkpoint}.lock`)).toBe(false);
  });
  it('reports release errors and allows subsequent scans to retry', async () => {
    fs.writeFileSync(file, meta(root) + record('task_started'));
    const actual = lockfile.lock;
    const spy = jest.spyOn(lockfile, 'lock').mockImplementationOnce(async (...args) => {
      const release = await actual(...args);
      return async () => { await release(); throw new Error('release failed'); };
    });
    try { expect((await observer().scan()).status).toBe('unavailable'); }
    finally { spy.mockRestore(); }
    await observer().scan(); expect(events).toHaveLength(1);
  });
  it('stops after lock compromise without advancing the durable checkpoint', async () => {
    fs.writeFileSync(file, meta(root) + record('task_started') + record('task_complete'));
    const actual = lockfile.lock; let compromise;
    const spy = jest.spyOn(lockfile, 'lock').mockImplementationOnce(async (target, options) => {
      compromise = options.onCompromised; return actual(target, options);
    });
    submit.mockImplementationOnce(async (_root, event) => {
      events.push(event); compromise(new Error('ownership lost')); return { accepted: true };
    });
    const reader = observer();
    try {
      expect((await reader.scan()).status).toBe('unavailable');
      expect(events).toHaveLength(1);
      expect(fs.existsSync(reader.checkpoint)).toBe(false);
    } finally { spy.mockRestore(); }
  });
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
    expect(events[0]).toMatchObject({ sessionId: 'session-1', agentId: 'aexos-master', type: 'CommandStart', evidence: 'manual' });
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
  it('keeps independent checkpoints when observers with different bindings restart', async () => {
    fs.writeFileSync(file, meta(root) + record('task_started'));
    const dev = { sessionsRoot, submit, sessionId: 'session-1', agentId: 'dev' };
    const qa = { sessionsRoot, submit, sessionId: 'session-1', agentId: 'qa' };
    await new CodexSessionObserver(root, dev).scan();
    await new CodexSessionObserver(root, qa).scan();
    await new CodexSessionObserver(root, dev).scan();
    await new CodexSessionObserver(root, qa).scan();
    expect(events.map((event) => event.agentId)).toEqual(['dev', 'qa']);
  });
  it('resumes a matching legacy checkpoint without replay and without modifying it', async () => {
    fs.writeFileSync(file, meta(root) + record('task_started'));
    const reader = observer();
    await reader.scan();
    const legacy = path.join(root, '.aexos', 'dashboard', 'codex-observer.json');
    fs.renameSync(reader.checkpoint, legacy);
    const original = fs.readFileSync(legacy, 'utf8');
    await observer().scan();
    expect(events).toHaveLength(1);
    expect(fs.readFileSync(legacy, 'utf8')).toBe(original);
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
  it('does not claim a successful task merely because the Codex turn ended', async () => {
    fs.writeFileSync(file, meta(root) + record('task_complete'));
    await observer().scan();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('CommandComplete');
    expect(events[0].success).toBeUndefined();
  });
  it('marks a manually assigned agent as manual without claiming success when its turn ends', async () => {
    fs.writeFileSync(file, meta(root) + record('task_complete'));
    await new CodexSessionObserver(root, { sessionsRoot, submit, sessionId: 'session-1', agentId: 'dev' }).scan();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ agentId: 'dev', evidence: 'manual', type: 'CommandComplete' });
    const { normalizeEvent } = require('../../../.aexos-core/core/virtual-office/event-normalizer');
    expect(normalizeEvent(events[0]).state).toBe('available');
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
