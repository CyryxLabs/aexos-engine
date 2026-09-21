'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CANONICAL_HOOK = path.join(
  ROOT,
  '.aexos-core',
  'infrastructure',
  'templates',
  'grok-hooks',
  'enforce-git-push-authority.cjs',
);
const GENERATED_HOOK = path.join(ROOT, '.grok', 'hooks', 'enforce-git-push-authority.cjs');
const AGENT_ENV = [
  'AEXOS_ACTIVE_AGENT',
  'AEXOS_AGENT',
  'AIOX_ACTIVE_AGENT',
  'AIOX_AGENT',
  'ACTIVE_AGENT',
  'CLAUDE_AGENT_NAME',
  'CLAUDE_CODE_AGENT',
  'AEXOS_CURRENT_AGENT',
  'AIOX_CURRENT_AGENT',
  'GROK_ACTIVE_AGENT',
  'GROK_WORKSPACE_ROOT',
  'CLAUDE_PROJECT_DIR',
];

function hookEnv(overrides = {}) {
  const env = { ...process.env, ...overrides };
  for (const name of AGENT_ENV) {
    if (!Object.prototype.hasOwnProperty.call(overrides, name)) delete env[name];
  }
  return env;
}

function runHook(input, options = {}) {
  return spawnSync(process.execPath, [options.hook || CANONICAL_HOOK], {
    cwd: options.cwd || ROOT,
    env: hookEnv(options.env),
    input: options.rawInput === undefined ? JSON.stringify(input) : options.rawInput,
    encoding: 'utf8',
    timeout: 5000,
  });
}

function expectDeny(result, reasonPattern) {
  expect(result.status).toBe(2);
  expect(result.stderr).toBe('');
  const output = JSON.parse(result.stdout);
  expect(output).toMatchObject({
    decision: 'deny',
    hookSpecificOutput: { permissionDecision: 'deny' },
  });
  expect(output.reason).toMatch(reasonPattern);
}

describe('Grok remote-operation authority guard', () => {
  test.each([
    'git push origin main',
    'git -C /repo push origin main',
    'git -c protocol.version=2 push origin main',
    'git --git-dir=/repo/.git push origin main',
    'git --work-tree /repo push origin main',
    'git --no-pager push origin main',
    ['git \\', 'push origin main'].join('\n'),
    'gh --repo owner/repo pr create --title change',
    'gh pr -R owner/repo merge 42',
    'gh pr close 42',
    'gh pr reopen 42',
    'gh release create v2.0.0',
    'git tag v2.0.0',
    'gh api repos/owner/repo/pulls -f title=change',
    'gh api -X PUT repos/owner/repo/pulls/42/merge',
    'gh api repos/owner/repo/pulls --method POST',
    "gh api graphql -f query='mutation { createPullRequest(input: {}) { pullRequest { id } } }'",
    "gh --repo owner/repo api graphql -f query='mutation { mergePullRequest(input: {}) { pullRequest { id } } }'",
  ])('denies non-devops remote operation syntax: %s', (command) => {
    expectDeny(runHook({ tool_input: { command } }, { env: { AEXOS_ACTIVE_AGENT: 'dev' } }), /exclusive to @devops/);
  });

  test.each([
    'git status --short',
    'git log -1',
    'gh pr view 42',
    'gh release view v2.0.0',
    'gh api repos/owner/repo/pulls',
    "gh api graphql -f query='query { repository(owner: \"o\", name: \"r\") { id } }'",
  ])('allows benign read syntax: %s', (command) => {
    const result = runHook({ tool_input: { command } });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });

  test.each([
    (command) => ({ tool_input: { command } }),
    (command) => ({ toolInput: { command } }),
    (command) => ({ tool_input: { cmd: command } }),
    (command) => ({ toolInput: { cmd: command } }),
    (command) => ({ input: { command } }),
    (command) => ({ parameters: { command } }),
    (command) => ({ tool_input: { input: { command } } }),
    (command) => ({ toolInput: { input: { command } } }),
    (command) => ({ command }),
  ])('denies remote operations from every supported payload envelope', (envelope) => {
    expectDeny(runHook(envelope('git push origin main')), /git push is exclusive/);
  });

  test('denies git push when no agent identity is available', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-grok-unknown-'));
    try {
      const result = runHook(
        { workspaceRoot: workspace, tool_input: { command: 'git push origin main' } },
        { cwd: workspace },
      );
      expectDeny(result, /Current agent: @unknown/);
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  test('loads the active-agent bridge from the hook workspace', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-grok-authority-'));
    try {
      fs.mkdirSync(path.join(workspace, '.aexos'), { recursive: true });
      fs.writeFileSync(
        path.join(workspace, '.aexos', 'active-agent.json'),
        JSON.stringify({ id: 'devops' }),
      );
      const result = runHook({
        cwd: workspace,
        toolInput: { command: 'git push origin main' },
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  test('allows the explicit devops identity and allows benign commands', () => {
    const devops = runHook(
      { command: 'git push origin main' },
      { env: { AEXOS_ACTIVE_AGENT: 'devops' } },
    );
    const benign = runHook({ tool_input: { command: 'git status --short' } });

    expect(devops.status).toBe(0);
    expect(devops.stdout).toBe('');
    expect(benign.status).toBe(0);
    expect(benign.stdout).toBe('');
  });

  test.each([
    'devops', '@devops', 'github-devops', '@github-devops',
    'aexos-devops', '@aexos-devops', 'aiox-devops', '@aiox-devops', 'gage', '@gage',
  ])('allows the supported devops alias: %s', (agent) => {
    const result = runHook(
      { tool_input: { command: 'git push origin main' } },
      { env: { AEXOS_ACTIVE_AGENT: agent } },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });

  test.each([
    'AEXOS_ACTIVE_AGENT', 'AEXOS_AGENT', 'AIOX_ACTIVE_AGENT', 'AIOX_AGENT',
    'ACTIVE_AGENT', 'CLAUDE_AGENT_NAME', 'CLAUDE_CODE_AGENT',
    'AEXOS_CURRENT_AGENT', 'AIOX_CURRENT_AGENT', 'GROK_ACTIVE_AGENT',
  ])('reads the supported environment identity: %s', (name) => {
    const result = runHook(
      { tool_input: { command: 'git push origin main' } },
      { env: { [name]: 'devops' } },
    );
    expect(result.status).toBe(0);
  });

  test('uses environment, command scope, then bridge precedence', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-grok-precedence-'));
    try {
      fs.mkdirSync(path.join(workspace, '.aexos'), { recursive: true });
      fs.writeFileSync(path.join(workspace, '.aexos', 'active-agent'), 'devops');
      expectDeny(runHook({
        cwd: workspace,
        tool_input: { command: 'AEXOS_ACTIVE_AGENT=devops git push origin main' },
      }, { env: { AEXOS_ACTIVE_AGENT: 'dev' } }), /Current agent: dev/);
      const envWins = runHook({
        cwd: workspace,
        tool_input: { command: 'AEXOS_ACTIVE_AGENT=dev git push origin main' },
      }, { env: { AEXOS_ACTIVE_AGENT: 'devops' } });
      expect(envWins.status).toBe(0);

      fs.writeFileSync(path.join(workspace, '.aexos', 'active-agent'), 'dev');
      const commandWins = runHook({
        cwd: workspace,
        tool_input: { command: 'export AIOX_ACTIVE_AGENT=devops; git push origin main' },
      });
      expect(commandWins.status).toBe(0);
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  test.each([
    ['id', 'github-devops'],
    ['agentId', 'gage'],
    ['agent_id', 'aexos-devops'],
    ['name', 'devops'],
  ])('reads the Synapse bridge identity field: %s', (field, value) => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-grok-synapse-'));
    try {
      const bridge = path.join(workspace, '.synapse', 'sessions', '_active-agent.json');
      fs.mkdirSync(path.dirname(bridge), { recursive: true });
      fs.writeFileSync(bridge, JSON.stringify({ [field]: value }));
      const result = runHook({ workspace_root: workspace, tool_input: { command: 'git push origin main' } });
      expect(result.status).toBe(0);
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  test('rejects stale or future-dated bridges and honors workspaceRoot precedence', () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-grok-freshness-'));
    const fallback = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-grok-fallback-'));
    try {
      const bridge = path.join(workspace, '.aexos', 'active-agent.json');
      fs.mkdirSync(path.dirname(bridge), { recursive: true });
      fs.writeFileSync(bridge, JSON.stringify({ id: 'devops' }));
      const stale = new Date(Date.now() - (9 * 60 * 60 * 1000));
      fs.utimesSync(bridge, stale, stale);
      expectDeny(runHook({ workspaceRoot: workspace, cwd: fallback, tool_input: { command: 'git push' } }), /@unknown/);
      const future = new Date(Date.now() + 60_000);
      fs.utimesSync(bridge, future, future);
      expectDeny(runHook({ workspaceRoot: workspace, cwd: fallback, tool_input: { command: 'git push' } }), /@unknown/);
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
      fs.rmSync(fallback, { recursive: true, force: true });
    }
  });

  test('denies malformed input instead of silently succeeding', () => {
    const result = runHook(null, { rawInput: '{invalid-json' });

    expectDeny(result, /malformed input/);
  });

  test('denies empty input instead of silently succeeding', () => {
    expectDeny(runHook(null, { rawInput: '' }), /received no input/);
  });

  test('fails closed when authorization evaluation throws', () => {
    const result = runHook({
      cwd: { invalid: true },
      tool_input: { command: 'git push origin main' },
    });

    expectDeny(result, /evaluation failed/);
  });

  test('keeps the generated hook byte-identical to the canonical template', () => {
    expect(fs.readFileSync(GENERATED_HOOK)).toEqual(fs.readFileSync(CANONICAL_HOOK));
    const result = runHook(
      { tool_input: { command: 'gh pr merge 42' } },
      { hook: GENERATED_HOOK, env: { AEXOS_ACTIVE_AGENT: 'qa' } },
    );
    expectDeny(result, /Current agent: qa/);
  });
});
