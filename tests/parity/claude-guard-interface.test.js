'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const HOOK = path.join(ROOT, '.claude', 'hooks', 'enforce-git-push-authority.cjs');
const guard = require(HOOK);
const AGENT_ENV = [
  'AEXOS_ACTIVE_AGENT', 'AEXOS_AGENT', 'AIOX_ACTIVE_AGENT', 'AIOX_AGENT',
  'ACTIVE_AGENT', 'CLAUDE_AGENT_NAME', 'CLAUDE_CODE_AGENT',
  'AEXOS_CURRENT_AGENT', 'AIOX_CURRENT_AGENT', 'GROK_ACTIVE_AGENT',
  'GROK_WORKSPACE_ROOT', 'CLAUDE_PROJECT_DIR',
];

function isolatedEnv(overrides = {}) {
  const env = { ...process.env, ...overrides };
  for (const name of AGENT_ENV) {
    if (!Object.prototype.hasOwnProperty.call(overrides, name)) delete env[name];
  }
  return env;
}

function run(input, cwd, env = {}, hook = HOOK) {
  return spawnSync(process.execPath, [hook], {
    cwd,
    env: isolatedEnv(env),
    input: JSON.stringify(input),
    encoding: 'utf8',
  });
}

describe('Claude guard public interface', () => {
  const roots = [];
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  test.each([
    [{ tool_input: { command: 'git status' } }, 'git status'],
    [{ toolInput: { command: 'git status' } }, 'git status'],
    [{ tool_input: { cmd: 'git status' } }, 'git status'],
    [{ toolInput: { input: { command: 'git status' } } }, 'git status'],
    [{ parameters: { command: 'git status' } }, 'git status'],
    [{ command: 'git status' }, 'git status'],
  ])('extractCommand supports the public envelope contract', (input, expected) => {
    expect(guard.extractCommand(input)).toBe(expected);
  });

  test('extractProjectRoot resolves supported fields and rejects invalid roots', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-claude-root-')); roots.push(root);
    expect(guard.extractProjectRoot({ workspaceRoot: root })).toBe(path.resolve(root));
    expect(guard.extractProjectRoot({ workspace_root: root })).toBe(path.resolve(root));
    expect(guard.extractProjectRoot({ cwd: root })).toBe(path.resolve(root));
    expect(() => guard.extractProjectRoot({ cwd: { invalid: true } })).toThrow(/root must be a string/i);
  });

  test('readBridgeAgent supports current and legacy bridges with freshness', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-claude-bridge-')); roots.push(root);
    const current = path.join(root, '.aexos', 'active-agent.json');
    fs.mkdirSync(path.dirname(current), { recursive: true });
    fs.writeFileSync(current, JSON.stringify({ agentId: 'DevOps' }));
    const currentFresh = new Date(Date.now() - 1000);
    fs.utimesSync(current, currentFresh, currentFresh);
    expect(guard.readBridgeAgent(root)).toBe('devops');

    const stale = new Date(Date.now() - (9 * 60 * 60 * 1000));
    fs.utimesSync(current, stale, stale);
    const legacy = path.join(root, '.aiox', 'active-agent');
    fs.mkdirSync(path.dirname(legacy), { recursive: true });
    fs.writeFileSync(legacy, '@github-devops extra');
    const fresh = new Date(Date.now() - 1000);
    fs.utimesSync(legacy, fresh, fresh);
    expect(guard.readBridgeAgent(root)).toBe('github-devops');
    expect(() => guard.readBridgeAgent({ invalid: true })).toThrow(/root must be a non-empty string/i);
  });

  test('bridge freshness accepts filesystem sub-millisecond precision but rejects future timestamps', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-claude-precision-')); roots.push(root);
    const bridge = path.join(root, '.aexos', 'active-agent');
    fs.mkdirSync(path.dirname(bridge), { recursive: true });
    fs.writeFileSync(bridge, 'devops');
    const now = Date.now();
    const realStatSync = fs.statSync;
    const statSpy = jest.spyOn(fs, 'statSync').mockImplementation((target, ...args) => {
      const stat = realStatSync(target, ...args);
      return path.resolve(String(target)) === path.resolve(bridge)
        ? { ...stat, mtimeMs: now + 0.5 }
        : stat;
    });
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(now);
    try {
      expect(guard.readBridgeAgent(root)).toBe('devops');
      statSpy.mockImplementation((target, ...args) => {
        const stat = realStatSync(target, ...args);
        return path.resolve(String(target)) === path.resolve(bridge)
          ? { ...stat, mtimeMs: now + 1.5 }
          : stat;
      });
      expect(guard.readBridgeAgent(root)).toBe('');
    } finally {
      statSpy.mockRestore();
      nowSpy.mockRestore();
    }
  });

  test('agent resolution prefers environment, then command scope, then bridge', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-claude-preference-')); roots.push(root);
    const bridge = path.join(root, '.aexos', 'active-agent');
    fs.mkdirSync(path.dirname(bridge), { recursive: true });
    fs.writeFileSync(bridge, 'devops');
    const fresh = new Date(Date.now() - 1000);
    fs.utimesSync(bridge, fresh, fresh);
    const previous = process.env.AEXOS_ACTIVE_AGENT;
    try {
      process.env.AEXOS_ACTIVE_AGENT = 'qa';
      expect(guard.getActiveAgent('AEXOS_ACTIVE_AGENT=devops git push', { cwd: root })).toBe('qa');
      delete process.env.AEXOS_ACTIVE_AGENT;
      expect(guard.getActiveAgent('AEXOS_ACTIVE_AGENT=architect git push', { cwd: root })).toBe('architect');
      expect(guard.getActiveAgent('git push', { cwd: root })).toBe('devops');
    } finally {
      if (previous === undefined) delete process.env.AEXOS_ACTIVE_AGENT;
      else process.env.AEXOS_ACTIVE_AGENT = previous;
    }
  });

  test.each([
    'git -C . -c advice.detachedHead=false push origin main',
    'gh api repos/example/example/pulls -X POST -f title=test',
  ])('CLI delegates complete canonical remote-operation policy: %s', (command) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-claude-deny-')); roots.push(root);
    const result = run({ workspaceRoot: root, toolInput: { command } }, root);
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({
      decision: 'deny',
      hookSpecificOutput: { permissionDecision: 'deny' },
    });
  });

  test('CLI accepts a fresh devops bridge without executing the proposed command', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-claude-allow-')); roots.push(root);
    const bridge = path.join(root, '.aexos', 'active-agent.json');
    fs.mkdirSync(path.dirname(bridge), { recursive: true });
    fs.writeFileSync(bridge, JSON.stringify({ id: 'devops' }));
    const result = run({ cwd: root, toolInput: { command: 'git push origin main' } }, root);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  test('invalid root fails closed for a remote operation', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-claude-invalid-')); roots.push(root);
    const result = run({ cwd: { invalid: true }, toolInput: { command: 'git push origin main' } }, root);
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout).reason).toMatch(/evaluation failed/);
  });

  test('a partially copied hook denies when canonical policy is unavailable', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-claude-partial-')); roots.push(root);
    const copiedHook = path.join(root, '.claude', 'hooks', 'enforce-git-push-authority.cjs');
    fs.mkdirSync(path.dirname(copiedHook), { recursive: true });
    fs.copyFileSync(HOOK, copiedHook);

    const result = run({ toolInput: { command: 'git status' } }, root, {}, copiedHook);
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({
      decision: 'deny',
      hookSpecificOutput: { permissionDecision: 'deny' },
    });
  });

  test('uses an installed package fallback but never skips a corrupt project policy', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-claude-package-')); roots.push(root);
    const copiedHook = path.join(root, '.claude', 'hooks', 'enforce-git-push-authority.cjs');
    const relativePolicy = path.join(
      '.aexos-core', 'infrastructure', 'templates', 'grok-hooks',
      'enforce-git-push-authority.cjs',
    );
    const packagePolicy = path.join(root, 'node_modules', '@aexos', 'core', relativePolicy);
    fs.mkdirSync(path.dirname(copiedHook), { recursive: true });
    fs.mkdirSync(path.dirname(packagePolicy), { recursive: true });
    fs.copyFileSync(HOOK, copiedHook);
    fs.copyFileSync(
      path.join(ROOT, relativePolicy),
      packagePolicy,
    );
    const bridge = path.join(root, '.aexos', 'active-agent.json');
    fs.mkdirSync(path.dirname(bridge), { recursive: true });
    fs.writeFileSync(bridge, JSON.stringify({ id: 'devops' }));
    const fresh = new Date(Date.now() - 1000);
    fs.utimesSync(bridge, fresh, fresh);

    const fallback = run({ cwd: root, toolInput: { command: 'git push origin main' } }, root, {}, copiedHook);
    expect(fallback.status).toBe(0);
    expect(fallback.stdout).toBe('');

    const projectPolicy = path.join(root, relativePolicy);
    fs.mkdirSync(path.dirname(projectPolicy), { recursive: true });
    fs.writeFileSync(projectPolicy, 'this is not valid javascript }');
    const corrupt = run({ cwd: root, toolInput: { command: 'git push origin main' } }, root, {}, copiedHook);
    expect(corrupt.status).toBe(2);
    expect(JSON.parse(corrupt.stdout).reason).toMatch(/canonical push-authority policy is unavailable or invalid/);
  });
});
