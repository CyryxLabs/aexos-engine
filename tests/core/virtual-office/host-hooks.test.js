'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { Readable } = require('stream');
const { hookConfiguration, normalizeHook, installHooks, observeHook } = require('../../../.aexos-core/core/virtual-office/host-hooks');

describe('Native office hook adapter', () => {
  let root;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'office-hooks-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });
  it.each([
    ['claude-code', 'SessionStart', 'SessionStart'], ['claude-code', 'Stop', 'AgentWaiting'],
    ['claude-code', 'PostToolUseFailure', 'CommandError'], ['gemini', 'BeforeTool', 'PreToolUse'],
    ['gemini', 'AfterAgent', 'AgentWaiting'], ['gemini', 'SessionEnd', 'SessionEnd'],
  ])('maps %s %s safely', (host, hook, type) => {
    const result = normalizeHook(host, { cwd: root, session_id: 'native-s', hook_event_name: hook,
      tool_name: 'Read', prompt: 'private prompt', tool_input: { token: 'credential' },
      tool_response: { llmContent: 'private output' }, transcript_path: 'private-path' }, root);
    expect(result.type).toBe(type);
    expect(result.data).toMatchObject({ host, sessionId: 'native-s', evidence: 'runtime' });
    expect(JSON.stringify(result)).not.toMatch(/private|credential/);
  });
  it('rejects cross-project hooks without attributing work to a guessed agent', () => {
    expect(() => normalizeHook('claude-code', { cwd: os.tmpdir(), session_id: 's', hook_event_name: 'SessionStart' }, root)).toThrow('another project');
    expect(normalizeHook('claude-code', { cwd: root, session_id: 's', hook_event_name: 'SessionStart' }, root).data.agentId).toBeUndefined();
  });
  it('installs idempotently with preserved hooks and an exact backup', () => {
    fs.mkdirSync(path.join(root, '.claude'));
    const file = path.join(root, '.claude/settings.json');
    const original = JSON.stringify({ permissions: { allow: [] }, hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'existing' }] }] } });
    fs.writeFileSync(file, original);
    const first = installHooks(root, 'claude-code');
    expect(fs.readFileSync(first.backup, 'utf8')).toBe(original);
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(config.hooks.PreToolUse).toHaveLength(2);
    expect(config.permissions).toEqual({ allow: [] });
    expect(installHooks(root, 'claude-code').changed).toBe(false);
  });
  it('executes a portable generated command from a project path with spaces', () => {
    const spacedRoot = path.join(root, 'Project with spaces');
    const target = path.join(spacedRoot, '.aexos-core/core/virtual-office');
    fs.mkdirSync(target, { recursive: true });
    const source = path.resolve(__dirname, '../../../.aexos-core/core/virtual-office');
    for (const entry of fs.readdirSync(source)) {
      if (entry.endsWith('.js') || entry.endsWith('.yaml')) fs.copyFileSync(path.join(source, entry), path.join(target, entry));
    }
    const command = hookConfiguration(spacedRoot, 'claude-code').hooks.SessionStart[0].hooks[0].command;
    expect(command).not.toContain(spacedRoot);
    const result = spawnSync(process.execPath, [...command.split(' ').slice(1), '--port', '1'], {
      cwd: spacedRoot, encoding: 'utf8', timeout: 5000,
      env: { ...process.env, NODE_PATH: path.resolve(__dirname, '../../../node_modules') },
      input: JSON.stringify({ cwd: spacedRoot, session_id: 'portable-native', hook_event_name: 'SessionStart' }),
    });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('{}');
    expect(fs.readFileSync(path.join(spacedRoot, '.aexos/dashboard/events.jsonl'), 'utf8')).toContain('portable-native');
  });
  it('migrates previous absolute office commands without adding a second observer', () => {
    fs.mkdirSync(path.join(root, '.claude'));
    const file = path.join(root, '.claude/settings.json');
    fs.writeFileSync(file, JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command',
      command: 'node "C:/old/.aexos-core/core/virtual-office/cli.js" hook --project-root "C:/old" --producer-host claude-code',
    }] }] } }));
    installHooks(root, 'claude-code');
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(config.hooks.SessionStart).toHaveLength(1);
    expect(config.hooks.SessionStart[0].hooks[0].command).toContain('--project-root .');
  });
  it('queues a normalized raw-hook observation while collector is unavailable', async () => {
    const input = Readable.from([JSON.stringify({ cwd: root, session_id: 'native-s', hook_event_name: 'SessionStart' })]);
    const result = await observeHook(root, 'gemini', { input, url: 'http://127.0.0.1:1/events' });
    expect(result.queued).toBe(true);
    expect(fs.readFileSync(path.join(root, '.aexos/dashboard/events.jsonl'), 'utf8')).toContain('native-s');
  });
});
