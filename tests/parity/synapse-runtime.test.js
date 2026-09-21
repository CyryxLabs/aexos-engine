'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_CORE = path.join(REPOSITORY_ROOT, '.aexos-core', 'core');
const SOURCE_HOOK = path.join(REPOSITORY_ROOT, '.claude', 'hooks', 'synapse-engine.cjs');
const SOURCE_RUNTIME = path.join(
  REPOSITORY_ROOT,
  '.aexos-core',
  'core',
  'synapse',
  'runtime',
  'hook-runtime.js',
);

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function linkDirectory(target, linkPath) {
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  fs.symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
}

/**
 * Create a real SYNAPSE consumer layout for checkout and package-only tests.
 * Exported so installed-tarball parity tests can reuse the same scenario.
 *
 * @param {'canonical'|'package'} mode
 * @param {{packageRoot?: string}} [options]
 * @returns {{root: string, hookPath: string, runtimePath: string, cleanup: Function}}
 */
function createSynapseRuntimeFixture(mode, options = {}) {
  if (mode !== 'canonical' && mode !== 'package') {
    throw new Error(`Unsupported fixture mode: ${mode}`);
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `aexos-synapse-${mode}-`));
  const hookPath = path.join(root, '.claude', 'hooks', 'synapse-engine.cjs');
  const packageRoot = options.packageRoot || REPOSITORY_ROOT;

  writeFile(
    path.join(root, '.aexos-core', 'core-config.yaml'),
    ['synapse:', '  pipelineTimeoutMs: 5000', '  session:', '    staleTTLHours: 48'].join('\n'),
  );
  writeFile(
    path.join(root, '.synapse', 'manifest'),
    [
      'DEVMODE=false',
      'CONSTITUTION_STATE=active',
      'CONSTITUTION_NON_NEGOTIABLE=true',
      'AGENT_UX_STATE=active',
      'AGENT_UX_AGENT_TRIGGER=ux-design-expert',
    ].join('\n'),
  );
  writeFile(
    path.join(root, '.synapse', 'constitution'),
    'CONSTITUTION_RULE_1=CYRYX_PARITY_CONSTITUTION_RULE',
  );
  writeFile(path.join(root, '.synapse', 'agent-ux'), 'AGENT_UX_RULE_1=CYRYX_PARITY_UX_AUTH_RULE');
  fs.mkdirSync(path.dirname(hookPath), { recursive: true });
  fs.copyFileSync(SOURCE_HOOK, hookPath);

  let runtimePath;
  if (mode === 'canonical') {
    linkDirectory(SOURCE_CORE, path.join(root, '.aexos-core', 'core'));
    runtimePath = path.join(
      root,
      '.aexos-core',
      'core',
      'synapse',
      'runtime',
      'hook-runtime.js',
    );
  } else if (mode === 'package') {
    linkDirectory(packageRoot, path.join(root, 'node_modules', '@aexos', 'core'));
    runtimePath = path.join(
      root,
      'node_modules',
      '@aexos',
      'core',
      '.aexos-core',
      'core',
      'synapse',
      'runtime',
      'hook-runtime.js',
    );
  }

  return {
    root,
    hookPath,
    runtimePath,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

function invokeHook(fixture, input) {
  const result = spawnSync(process.execPath, [fixture.hookPath], {
    cwd: fixture.root,
    input: JSON.stringify(input),
    encoding: 'utf8',
    timeout: 10000,
  });
  if (result.error) throw result.error;
  return result;
}

/**
 * Run two real hook invocations and prove context plus persisted session state.
 *
 * @param {'canonical'|'package'} mode
 * @param {{packageRoot?: string}} [options]
 */
function runSynapseHookScenario(mode, options = {}) {
  const fixture = createSynapseRuntimeFixture(mode, options);
  try {
    const sessionId = `parity-${mode}`;
    const input = { cwd: fixture.root, sessionId, prompt: 'Review the UX authority boundary' };

    const first = invokeHook(fixture, input);
    const firstOutput = JSON.parse(first.stdout);
    const sessionPath = path.join(fixture.root, '.synapse', 'sessions', `${sessionId}.json`);
    const seededSession = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    seededSession.active_agent = {
      id: 'ux-design-expert',
      activated_at: new Date().toISOString(),
      activation_quality: 'explicit',
    };
    fs.writeFileSync(sessionPath, JSON.stringify(seededSession, null, 2));

    const second = invokeHook(fixture, input);
    const secondOutput = JSON.parse(second.stdout);
    const persistedSession = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));

    return { fixture, first, firstOutput, second, secondOutput, persistedSession };
  } catch (error) {
    fixture.cleanup();
    throw error;
  }
}

if (typeof describe === 'function') {
  describe.each(['canonical', 'package'])('SYNAPSE %s runtime parity', (mode) => {
    let scenario;

    afterEach(() => {
      if (scenario) scenario.fixture.cleanup();
      scenario = null;
    });

    test('emits routed context and persists a repeated hook session', () => {
      scenario = runSynapseHookScenario(mode);

      expect(scenario.first.status).toBe(0);
      expect(scenario.first.stderr).toBe('');
      expect(scenario.firstOutput.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
      expect(scenario.firstOutput.hookSpecificOutput.additionalContext)
        .toContain('CYRYX_PARITY_CONSTITUTION_RULE');

      expect(scenario.second.status).toBe(0);
      expect(scenario.second.stderr).toBe('');
      expect(scenario.secondOutput.hookSpecificOutput.additionalContext)
        .toContain('CYRYX_PARITY_UX_AUTH_RULE');
      expect(scenario.persistedSession.prompt_count).toBe(2);
      expect(scenario.persistedSession.context.last_bracket).toBe('FRESH');
    });

    test('routes project configuration and manifest into the selected engine', () => {
      const fixture = createSynapseRuntimeFixture(mode);
      scenario = { fixture };
      const { resolveHookRuntime } = require(fixture.runtimePath);
      const runtime = resolveHookRuntime({ cwd: fixture.root, sessionId: `config-${mode}` });

      expect(runtime).toBeTruthy();
      expect(runtime.engine.config.synapse).toMatchObject({
        pipelineTimeoutMs: 5000,
        session: { staleTTLHours: 48 },
      });
      expect(runtime.engine.config.manifest.domains.AGENT_UX).toMatchObject({
        file: 'agent-ux',
        state: 'active',
        agentTrigger: 'ux-design-expert',
      });
    });

    test('loads a public activation bridge into routed context without double-counting prompts', () => {
      const fixture = createSynapseRuntimeFixture(mode);
      scenario = { fixture };
      writeFile(path.join(fixture.root, '.synapse/sessions/_active-agent.json'), JSON.stringify({
        id: 'ux-design-expert', activated_at: new Date().toISOString(), activation_quality: 'full', source: 'uap',
      }));
      const result = invokeHook(fixture, { cwd: fixture.root, sessionId: 'activation-bridge', prompt: 'Review UX' });
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout).hookSpecificOutput.additionalContext).toContain('CYRYX_PARITY_UX_AUTH_RULE');
      const session = JSON.parse(fs.readFileSync(path.join(fixture.root, '.synapse/sessions/activation-bridge.json'), 'utf8'));
      expect(session.active_agent.id).toBe('ux-design-expert');
      expect(session.prompt_count).toBe(1);
    });

    test('uses layered configuration overrides after migration', () => {
      const fixture = createSynapseRuntimeFixture(mode);
      scenario = { fixture };
      writeFile(path.join(fixture.root, '.aexos-core/framework-config.yaml'), 'synapse:\n  pipelineTimeoutMs: 250\n');
      writeFile(path.join(fixture.root, '.aexos-core/local-config.yaml'), 'synapse:\n  pipelineTimeoutMs: 731\n');
      const { resolveHookRuntime } = require(fixture.runtimePath);
      const runtime = resolveHookRuntime({ cwd: fixture.root, sessionId: `layered-${mode}` });
      expect(runtime.engine.config.synapse.pipelineTimeoutMs).toBe(731);
    });

    test.each(['malformed', 'stale', 'invalid-id'])('ignores a %s activation bridge', kind => {
      const fixture = createSynapseRuntimeFixture(mode);
      scenario = { fixture };
      const bridgePath = path.join(fixture.root, '.synapse/sessions/_active-agent.json');
      writeFile(bridgePath, kind === 'malformed' ? '{broken' : JSON.stringify({
        id: kind === 'invalid-id' ? '../agent-ux' : 'ux-design-expert',
        activated_at: new Date(kind === 'stale' ? Date.now() - 9 * 3600000 : Date.now()).toISOString(),
      }));
      const result = invokeHook(fixture, { cwd: fixture.root, sessionId: 'ignored-bridge', prompt: 'Review UX' });
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout).hookSpecificOutput.additionalContext).not.toContain('CYRYX_PARITY_UX_AUTH_RULE');
    });

    test('keeps a newer explicit session identity and consumes a later bridge activation', () => {
      const fixture = createSynapseRuntimeFixture(mode);
      scenario = { fixture };
      const input = { cwd: fixture.root, sessionId: 'bridge-precedence', prompt: 'Review UX' };
      invokeHook(fixture, input);
      const sessionPath = path.join(fixture.root, '.synapse/sessions/bridge-precedence.json');
      const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
      session.active_agent = { id: 'ux-design-expert', activated_at: new Date(Date.now() - 30000).toISOString(), activation_quality: 'explicit' };
      writeFile(sessionPath, JSON.stringify(session));
      const bridgePath = path.join(fixture.root, '.synapse/sessions/_active-agent.json');
      writeFile(bridgePath, JSON.stringify({ id: 'dev', activated_at: new Date(Date.now() - 60000).toISOString() }));
      expect(JSON.parse(invokeHook(fixture, input).stdout).hookSpecificOutput.additionalContext)
        .toContain('CYRYX_PARITY_UX_AUTH_RULE');
      writeFile(bridgePath, JSON.stringify({ id: 'dev', activated_at: new Date().toISOString() }));
      expect(JSON.parse(invokeHook(fixture, input).stdout).hookSpecificOutput.additionalContext)
        .not.toContain('CYRYX_PARITY_UX_AUTH_RULE');
      const persisted = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
      expect(persisted.active_agent.id).toBe('dev');
      expect(persisted.prompt_count).toBe(3);
    });
  });

  describe('SYNAPSE runtime dependency selection', () => {
    let root;

    afterEach(() => {
      if (root) fs.rmSync(root, { recursive: true, force: true });
      root = null;
    });

    function createIncompleteCanonicalRuntime(engineSource) {
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-synapse-incomplete-'));
      fs.mkdirSync(path.join(root, '.synapse'), { recursive: true });
      writeFile(
        path.join(root, '.aexos-core', 'core', 'synapse', 'session', 'session-manager.js'),
        [
          'module.exports = {',
          '  loadSession: () => ({ prompt_count: 1 }),',
          '  createSession: () => ({ prompt_count: 0 }),',
          '  updateSession: () => null,',
          '  cleanStaleSessions: () => 0,',
          '};',
        ].join('\n'),
      );
      if (engineSource) {
        writeFile(path.join(root, '.aexos-core', 'core', 'synapse', 'engine.js'), engineSource);
      }
    }

    test('does not mix in a package engine when the canonical engine is missing', () => {
      createIncompleteCanonicalRuntime();
      const { resolveHookRuntime } = require(SOURCE_RUNTIME);

      expect(resolveHookRuntime({ cwd: root, sessionId: 'missing-engine' })).toBeNull();
    });

    test('does not hide canonical module execution errors with package fallback', () => {
      createIncompleteCanonicalRuntime("throw new Error('canonical engine execution failed');");
      const { resolveHookRuntime } = require(SOURCE_RUNTIME);

      expect(resolveHookRuntime({ cwd: root, sessionId: 'broken-engine' })).toBeNull();
    });
  });
}

module.exports = {
  createSynapseRuntimeFixture,
  runSynapseHookScenario,
};
