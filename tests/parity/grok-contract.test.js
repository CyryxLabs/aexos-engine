'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const {
  syncGrok,
  AGENT_PROFILES,
  SHORT_WORKFLOW_ALIASES,
  SHORT_AGENT_ALIASES,
  MANAGED_MANIFEST_FILENAME,
  serializeManagedRuleSections,
} = require('../../.aexos-core/infrastructure/scripts/grok-skills-sync');
const { validateGrok } = require('../../.aexos-core/infrastructure/scripts/grok-skills-sync/validate');

const repoRoot = path.resolve(__dirname, '..', '..');

describe('Grok generator and validator parity contract', () => {
  let tempRoot;
  let grokRoot;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-grok-contract-'));
    grokRoot = path.join(tempRoot, '.grok');
  });

  afterEach(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

  test('generates the complete deterministic AEXOS projection and validates it', () => {
    const result = syncGrok({ projectRoot: repoRoot, grokRoot, quiet: true });
    expect(result.agents).toBe(Object.keys(AGENT_PROFILES).length);
    expect(result.files).toBeGreaterThanOrEqual(87);
    expect(fs.existsSync(path.join(grokRoot, MANAGED_MANIFEST_FILENAME))).toBe(true);

    for (const { name, target } of SHORT_WORKFLOW_ALIASES) {
      expect(fs.readFileSync(path.join(grokRoot, 'skills', name, 'SKILL.md'), 'utf8'))
        .toContain(`.grok/skills/${target}/SKILL.md`);
    }
    for (const { alias, target } of SHORT_AGENT_ALIASES) {
      const content = fs.readFileSync(path.join(grokRoot, 'agents', `${alias}.md`), 'utf8');
      expect(content).toContain(`.grok/agents/${target}.md`);
      expect(content).toContain('> .aexos/active-agent');
      expect(content).toContain('> .aexos/active-agent.json');
      expect(content).toContain('> .synapse/sessions/_active-agent.json');
    }
    const activation = fs.readFileSync(path.join(grokRoot, 'skills', 'aexos-dev', 'SKILL.md'), 'utf8');
    expect(activation).toMatch(/^user-invocable:\s*true$/m);
    expect(activation).toContain('> .aexos/active-agent');
    expect(activation).toContain('> .aexos/active-agent.json');
    expect(activation).toContain('> .synapse/sessions/_active-agent.json');
    const hook = JSON.parse(fs.readFileSync(path.join(grokRoot, 'hooks', 'git-push-authority.json'), 'utf8'));
    expect(hook.hooks.PreToolUse[0].matcher).toContain('run_terminal_command');
    expect(validateGrok({ projectRoot: repoRoot, grokRoot, strict: true }).ok).toBe(true);
  });

  test('preserves custom rules while repairing managed sections', () => {
    fs.mkdirSync(path.join(grokRoot, 'rules'), { recursive: true });
    fs.writeFileSync(path.join(grokRoot, 'rules', 'aexos-core.md'), '# Company rules\n\nKEEP-CUSTOM\n');
    syncGrok({ projectRoot: repoRoot, grokRoot, quiet: true });
    const first = fs.readFileSync(path.join(grokRoot, 'rules', 'aexos-core.md'), 'utf8');
    expect(first).toContain('KEEP-CUSTOM');
    expect(first).toContain('<!-- AEXOS-MANAGED-START: core -->');
    syncGrok({ projectRoot: repoRoot, grokRoot, quiet: true });
    expect(fs.readFileSync(path.join(grokRoot, 'rules', 'aexos-core.md'), 'utf8')).toBe(first);
  });

  test('detects deliberate managed corruption and sync repairs it', () => {
    syncGrok({ projectRoot: repoRoot, grokRoot, quiet: true });
    const target = path.join(grokRoot, 'agents', 'aexos-dev.md');
    fs.appendFileSync(target, '\nDELIBERATE-CORRUPTION\n');
    const broken = validateGrok({ projectRoot: repoRoot, grokRoot, strict: true });
    expect(broken.ok).toBe(false);
    expect(broken.errors).toContain('Managed content drift: agents/aexos-dev.md');
    syncGrok({ projectRoot: repoRoot, grokRoot, quiet: true });
    expect(validateGrok({ projectRoot: repoRoot, grokRoot, strict: true }).ok).toBe(true);
  });

  test('removes stale owned files and keeps unowned extensions', () => {
    syncGrok({ projectRoot: repoRoot, grokRoot, quiet: true });
    const stale = path.join(grokRoot, 'skills', 'aexos-obsolete', 'SKILL.md');
    const custom = path.join(grokRoot, 'skills', 'company-custom', 'SKILL.md');
    fs.mkdirSync(path.dirname(stale), { recursive: true });
    fs.mkdirSync(path.dirname(custom), { recursive: true });
    fs.writeFileSync(stale, 'stale');
    fs.writeFileSync(custom, 'custom');
    const manifestPath = path.join(grokRoot, MANAGED_MANIFEST_FILENAME);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.files.push({ path: 'skills/aexos-obsolete/SKILL.md', mode: 'full', sha256: crypto.createHash('sha256').update('stale').digest('hex') });
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    syncGrok({ projectRoot: repoRoot, grokRoot, quiet: true });
    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.existsSync(custom)).toBe(true);
  });

  test('preserves project TOML settings across sync and hashes only generated comments', () => {
    fs.mkdirSync(grokRoot, { recursive: true });
    const settings = '# CUSTOM\n[mcp.company]\ncommand = "local-tool"\n[permissions]\nmode = "strict"\n';
    const target = path.join(grokRoot, 'config.toml');
    fs.writeFileSync(target, settings);
    syncGrok({ projectRoot: repoRoot, grokRoot, quiet: true });
    const first = fs.readFileSync(target, 'utf8');
    expect(first.startsWith(settings)).toBe(true);
    fs.appendFileSync(target, '\n[plugins.company]\nenabled = true\n');
    const customized = fs.readFileSync(target, 'utf8');
    expect(validateGrok({ projectRoot: repoRoot, grokRoot, strict: true }).ok).toBe(true);
    syncGrok({ projectRoot: repoRoot, grokRoot, quiet: true });
    expect(fs.readFileSync(target, 'utf8')).toBe(customized);
    fs.appendFileSync(target, '# AEXOS-MANAGED-START: harness\n');
    expect(validateGrok({ projectRoot: repoRoot, grokRoot }).ok).toBe(false);
  });

  test('preserves and reports customized retired files instead of deleting them', () => {
    syncGrok({ projectRoot: repoRoot, grokRoot, quiet: true });
    const retired = path.join(grokRoot, 'skills/retired/SKILL.md');
    fs.mkdirSync(path.dirname(retired), { recursive: true });
    fs.writeFileSync(retired, 'USER-MODIFIED\n');
    const manifestPath = path.join(grokRoot, MANAGED_MANIFEST_FILENAME);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.files.push({ path: 'skills/retired/SKILL.md', mode: 'full', sha256: crypto.createHash('sha256').update('ORIGINAL\n').digest('hex') });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const result = syncGrok({ projectRoot: repoRoot, grokRoot, quiet: true });
    expect(fs.readFileSync(retired, 'utf8')).toBe('USER-MODIFIED\n');
    expect(result.preserved).toContain(retired);
    expect(result.removed).not.toContain(retired);
  });

  test('fails closed when the canonical agent source is absent', () => {
    expect(() => syncGrok({
      projectRoot: repoRoot,
      sourceDir: path.join(tempRoot, 'missing-agents'),
      grokRoot,
      quiet: true,
    })).toThrow(/Agent source dir not found/);
    expect(fs.existsSync(grokRoot)).toBe(false);
  });

  test('reports parse failures instead of silently dropping agents', () => {
    const sourceDir = path.join(tempRoot, 'agents');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'broken.md'), '# no canonical YAML block\n');
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = syncGrok({ projectRoot: repoRoot, sourceDir, grokRoot });
      expect(result.agents).toBe(0);
      expect(warning).toHaveBeenCalledWith(expect.stringContaining('No YAML block found — skipped'));
    } finally {
      warning.mockRestore();
    }
  });

  test.each([
    {
      label: 'activation target',
      relative: ['skills', 'aexos-dev', 'SKILL.md'],
      mutate: (content) => content.replace('.grok/agents/aexos-dev.md', '.grok/agents/missing.md'),
      expected: 'skill aexos-dev does not load .grok/agents/aexos-dev.md',
    },
    {
      label: 'persona instructions',
      relative: ['personas', 'aexos-dev.toml'],
      mutate: (content) => content.replace('instructions =', 'details ='),
      expected: 'persona aexos-dev missing instructions',
    },
    {
      label: 'workflow frontmatter',
      relative: ['skills', 'aexos-sdc', 'SKILL.md'],
      mutate: (content) => content.replace('name: aexos-sdc', 'name: broken-sdc'),
      expected: 'Workflow skill aexos-sdc has invalid name',
    },
    {
      label: 'alias identity bridge',
      relative: ['agents', 'dev.md'],
      mutate: (content) => content.replaceAll('.synapse/sessions/_active-agent.json', '.synapse/sessions/missing.json'),
      expected: 'Agent alias dev missing identity bridge: .synapse/sessions/_active-agent.json',
    },
    {
      label: 'hook registration',
      relative: ['hooks', 'synapse-prompt.json'],
      mutate: (content) => content.replace('synapse-wrapper.cjs', 'missing-wrapper.cjs'),
      expected: 'synapse-prompt.json does not register synapse-wrapper.cjs for UserPromptSubmit',
    },
  ])('detects $label semantically in addition to hash drift', ({ relative, mutate, expected }) => {
    syncGrok({ projectRoot: repoRoot, grokRoot, quiet: true });
    const target = path.join(grokRoot, ...relative);
    fs.writeFileSync(target, mutate(fs.readFileSync(target, 'utf8')));
    const result = validateGrok({ projectRoot: repoRoot, grokRoot });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain(expected);
  });

  test('managed rule serialization binds section names as well as bodies', () => {
    const core = '<!-- AEXOS-MANAGED-START: core -->\nRULE\n<!-- AEXOS-MANAGED-END: core -->';
    const renamed = '<!-- AEXOS-MANAGED-START: renamed -->\nRULE\n<!-- AEXOS-MANAGED-END: renamed -->';
    expect(serializeManagedRuleSections(core)).not.toBe(serializeManagedRuleSections(renamed));
  });
});
