'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const CLI = path.join(ROOT, 'bin', 'aexos.js');
const {
  AEXOS_FOOTPRINT,
  removeFootprint,
  serializeManagedConfig,
  serializeManagedRuleSections,
} = require(path.join(ROOT, 'packages/installer/src/installer/install-footprint'));

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const grokItem = () => AEXOS_FOOTPRINT.find((item) => item.path === '.grok');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-uninstall-'));
  const grok = path.join(root, '.grok');
  const full = '# generated agent\n';
  const rules = 'custom header\n\n<!-- AEXOS-MANAGED-START: core -->\nmanaged rule\n<!-- AEXOS-MANAGED-END: core -->\n';
  const config = 'custom = true\n# AEXOS-MANAGED-START: harness\n[harness]\nenabled = true\n# AEXOS-MANAGED-END: harness\n';
  fs.mkdirSync(path.join(grok, 'agents'), { recursive: true });
  fs.mkdirSync(path.join(grok, 'rules'), { recursive: true });
  fs.writeFileSync(path.join(grok, 'agents', 'dev.md'), full);
  fs.writeFileSync(path.join(grok, 'rules', 'aexos-core.md'), rules);
  fs.writeFileSync(path.join(grok, 'config.toml'), config);
  fs.writeFileSync(path.join(grok, 'custom.txt'), 'keep me');
  fs.writeFileSync(path.join(grok, 'aexos-managed.json'), `${JSON.stringify({
    schemaVersion: 1,
    generatedBy: 'aexos-grok-skills-sync',
    files: [
      { path: 'agents/dev.md', mode: 'full', sha256: hash(full) },
      { path: 'rules/aexos-core.md', mode: 'managed-sections', sha256: hash(serializeManagedRuleSections(rules)) },
      { path: 'config.toml', mode: 'managed-config', sha256: hash(serializeManagedConfig(config)) },
    ],
  }, null, 2)}\n`);
  return root;
}

describe('managed uninstall', () => {
  const roots = [];
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  test('removes intact generated files and managed blocks while preserving custom Grok content', () => {
    const root = fixture(); roots.push(root);
    const result = removeFootprint(root, [grokItem()]);

    expect(result.failed).toEqual([]);
    expect(fs.existsSync(path.join(root, '.grok', 'agents', 'dev.md'))).toBe(false);
    expect(fs.readFileSync(path.join(root, '.grok', 'rules', 'aexos-core.md'), 'utf8')).toContain('custom header');
    expect(fs.readFileSync(path.join(root, '.grok', 'rules', 'aexos-core.md'), 'utf8')).not.toContain('AEXOS-MANAGED');
    expect(fs.readFileSync(path.join(root, '.grok', 'config.toml'), 'utf8')).toContain('custom = true');
    expect(fs.readFileSync(path.join(root, '.grok', 'config.toml'), 'utf8')).not.toContain('[harness]');
    expect(fs.readFileSync(path.join(root, '.grok', 'custom.txt'), 'utf8')).toBe('keep me');
    expect(fs.existsSync(path.join(root, '.grok', 'aexos-managed.json'))).toBe(false);
  });

  test('preserves a customized generated file and retains its ownership record', () => {
    const root = fixture(); roots.push(root);
    fs.appendFileSync(path.join(root, '.grok', 'agents', 'dev.md'), 'custom change\n');
    const result = removeFootprint(root, [grokItem()]);

    expect(result.failed).toEqual([]);
    expect(result.preserved).toContain('.grok/agents/dev.md');
    expect(fs.readFileSync(path.join(root, '.grok', 'agents', 'dev.md'), 'utf8')).toContain('custom change');
    const manifest = JSON.parse(fs.readFileSync(path.join(root, '.grok', 'aexos-managed.json'), 'utf8'));
    expect(manifest.files.map((entry) => entry.path)).toEqual(['agents/dev.md']);
  });

  test('dry run is byte-for-byte read only', () => {
    const root = fixture(); roots.push(root);
    const before = fs.readFileSync(path.join(root, '.grok', 'aexos-managed.json'));
    const result = removeFootprint(root, [grokItem()], { dryRun: true });

    expect(result.failed).toEqual([]);
    expect(result.removed).toContain('.grok/agents/dev.md');
    expect(fs.readFileSync(path.join(root, '.grok', 'aexos-managed.json')).equals(before)).toBe(true);
    expect(fs.existsSync(path.join(root, '.grok', 'agents', 'dev.md'))).toBe(true);
  });

  test('rejects traversal and a linked managed parent without touching external content', () => {
    const root = fixture(); roots.push(root);
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-uninstall-external-')); roots.push(external);
    const sentinel = path.join(external, 'sentinel.md');
    fs.writeFileSync(sentinel, 'outside');
    const manifestPath = path.join(root, '.grok', 'aexos-managed.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.files.push({ path: '../../sentinel.md', mode: 'full', sha256: hash('outside') });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));

    const linked = path.join(root, '.grok', 'linked');
    try {
      fs.symlinkSync(external, linked, process.platform === 'win32' ? 'junction' : 'dir');
      manifest.files.push({ path: 'linked/sentinel.md', mode: 'full', sha256: hash('outside') });
      fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    } catch (error) {
      if (!['EPERM', 'EACCES'].includes(error.code)) throw error;
    }

    const result = removeFootprint(root, [grokItem()]);
    expect(result.failed.some((failure) => failure.path.includes('sentinel.md'))).toBe(true);
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('outside');
  });

  test('rejects dangling owned paths and retains their Grok ownership record', () => {
    const root = fixture(); roots.push(root);
    const targets = ['.grok/agents/dev.md', '.claude/templates/agent-template.yaml',
      '.claude/commands/AEXOS/scripts/generate-greeting.js'];
    for (const relative of targets) {
      const target = path.join(root, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      if (fs.existsSync(target)) fs.unlinkSync(target);
      fs.symlinkSync(path.join(root, 'absent-target'), target, process.platform === 'win32' ? 'junction' : 'dir');
    }
    const { AEXOS_FOOTPRINT } = require('../../packages/installer/src/installer/install-footprint');
    const result = removeFootprint(root, AEXOS_FOOTPRINT.filter(item =>
      ['.grok', '.claude/templates', '.claude/commands/AEXOS'].includes(item.path)));
    for (const relative of targets) {
      expect(result.failed.some(failure => failure.path === relative)).toBe(true);
      expect(fs.lstatSync(path.join(root, relative)).isSymbolicLink()).toBe(true);
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(root, '.grok/aexos-managed.json'), 'utf8'));
    expect(manifest.files.map(entry => entry.path)).toContain('agents/dev.md');
  });

  test('atomic rewrite failure preserves original Grok file and manifest bytes', () => {
    const root = fixture(); roots.push(root);
    const rulesPath = path.join(root, '.grok', 'rules', 'aexos-core.md');
    const manifestPath = path.join(root, '.grok', 'aexos-managed.json');
    const rulesBefore = fs.readFileSync(rulesPath);
    const manifestBefore = fs.readFileSync(manifestPath);
    const rename = jest.spyOn(fs, 'renameSync').mockImplementation(() => {
      const error = new Error('injected rename failure'); error.code = 'EACCES'; throw error;
    });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const result = removeFootprint(root, [grokItem()]);
      expect(result.failed.some((failure) => failure.message.includes('injected rename failure'))).toBe(true);
      expect(fs.readFileSync(rulesPath).equals(rulesBefore)).toBe(true);
      expect(fs.readFileSync(manifestPath).equals(manifestBefore)).toBe(true);
    } finally {
      rename.mockRestore();
      consoleError.mockRestore();
    }
  });

  test('real CLI keeps project data and customized templates', () => {
    const root = fixture(); roots.push(root);
    fs.mkdirSync(path.join(root, '.aexos-core'), { recursive: true });
    fs.writeFileSync(path.join(root, '.aexos-core', 'marker'), 'core');
    fs.mkdirSync(path.join(root, '.aexos'), { recursive: true });
    fs.writeFileSync(path.join(root, '.aexos', 'data.json'), '{}');
    const source = path.join(ROOT, '.claude', 'templates', 'agent-template.yaml');
    const templateDir = path.join(root, '.claude', 'templates');
    fs.mkdirSync(templateDir, { recursive: true });
    fs.copyFileSync(source, path.join(templateDir, 'agent-template.yaml'));
    fs.writeFileSync(path.join(templateDir, 'custom.md'), 'custom');
    const commandRoot = path.join(root, '.claude', 'commands', 'AEXOS', 'scripts');
    fs.mkdirSync(commandRoot, { recursive: true });
    const customizedHelper = path.join(commandRoot, 'agent-config-loader.js');
    fs.copyFileSync(path.join(ROOT, '.claude', 'commands', 'AEXOS', 'scripts', 'agent-config-loader.js'), customizedHelper);
    fs.appendFileSync(customizedHelper, '\n// consumer customization\n');
    const intactHelper = path.join(commandRoot, 'generate-greeting.js');
    fs.copyFileSync(path.join(ROOT, '.claude', 'commands', 'AEXOS', 'scripts', 'generate-greeting.js'), intactHelper);

    const dryRun = spawnSync(process.execPath, [CLI, 'uninstall', '--force', '--quiet', '--keep-data', '--dry-run'], { cwd: root, encoding: 'utf8' });
    expect(dryRun.status).toBe(0);
    expect(fs.existsSync(path.join(root, '.aexos-core', 'marker'))).toBe(true);

    const actual = spawnSync(process.execPath, [CLI, 'uninstall', '--force', '--quiet', '--keep-data'], { cwd: root, encoding: 'utf8' });
    expect({ status: actual.status, stderr: actual.stderr }).toEqual({ status: 0, stderr: '' });
    expect(fs.existsSync(path.join(root, '.aexos-core'))).toBe(false);
    expect(fs.existsSync(path.join(root, '.aexos', 'data.json'))).toBe(true);
    expect(fs.existsSync(path.join(templateDir, 'agent-template.yaml'))).toBe(false);
    expect(fs.readFileSync(path.join(templateDir, 'custom.md'), 'utf8')).toBe('custom');
    expect(fs.readFileSync(customizedHelper, 'utf8')).toContain('consumer customization');
    expect(fs.existsSync(intactHelper)).toBe(false);
  });
});
