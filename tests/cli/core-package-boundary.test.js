'use strict';

const fs = require('fs');
const path = require('path');
const {
  getPackedFiles,
  loadBoundary,
  validatePackedFiles,
  validateRepositoryBoundary,
} = require('../../scripts/validate-core-package');

const root = path.resolve(__dirname, '..', '..');

jest.setTimeout(330000);

describe('AEXOS Core Free package boundary', () => {
  const manifest = loadBoundary();

  it('binds the repository package allowlist to 12 agents and Security', () => {
    expect(manifest.canonicalAgents).toHaveLength(12);
    expect(manifest.bundledSquads).toEqual(['security']);
    expect(validateRepositoryBoundary(manifest)).toEqual({ valid: true, errors: [] });
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.files).not.toEqual(expect.arrayContaining([
      'squads/', '.claude/commands/', '.claude/skills/',
    ]));
  });

  it.each([
    ['squads/marketing/agents/marketing-chief.md', 'Paid squad leaked'],
    ['.claude/commands/AEXOS/squads/ops/ops-chief.md', 'Paid squad leaked'],
    ['.claude/skills/AEXOS/squads/products/products-chief/SKILL.md', 'Paid squad leaked'],
    ['pro/license-server.js', 'Forbidden Core package path'],
    ['.aexos-core/data/registry-update-log.jsonl', 'Forbidden Core package path'],
    ['.claude/hooks/__pycache__/guard.cpython-313.pyc', 'Local runtime cache leaked'],
    ['packages/installer/cache.pyo', 'Local runtime cache leaked'],
    ['.aexos-core/__pycache__/index.json', 'Local runtime cache leaked'],
  ])('blocks synthetic leak %s', (leak, expected) => {
    const baseline = [
      ...manifest.requiredPaths.filter((entry) => !entry.endsWith('/')),
      ...manifest.requiredPaths.filter((entry) => entry.endsWith('/')).map((entry) => `${entry}fixture.md`),
      ...manifest.canonicalAgents.map((agent) => `.aexos-core/development/agents/${agent}.md`),
    ];
    const result = validatePackedFiles([...baseline, leak], manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain(expected);
  });

  it.each([".claude/commands/AEXOS/scripts/agent-config-loader.js",".claude/commands/AEXOS/scripts/generate-greeting.js",".claude/commands/AEXOS/scripts/greeting-builder.js",".claude/commands/AEXOS/scripts/session-context-loader.js"])('requires the public Claude command helper %s in the real package contract', (helper) => {
    expect(manifest.packageFiles).toContain(helper);
    expect(manifest.requiredPaths).toContain(helper);
    const baseline = manifest.requiredPaths.map((entry) => entry.endsWith('/') ? entry + 'fixture.md' : entry);
    const missing = validatePackedFiles(baseline.filter((entry) => entry !== helper), manifest);
    expect(missing.errors).toContain('Missing required Core path: ' + helper);
  });

  it('blocks a package missing a required Core artifact', () => {
    const result = validatePackedFiles(['package.json'], manifest);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required Core path: bin/aexos.js');
  });

  it('accepts the actual npm dry-run tarball with only Security', () => {
    const source = fs.readFileSync(path.join(root, 'scripts', 'validate-core-package.js'), 'utf8');
    expect(source).toContain("execSync('npm pack --dry-run --json --ignore-scripts'");
    const files = getPackedFiles();
    const result = validatePackedFiles(files, manifest);
    expect(result).toMatchObject({ valid: true, bundledSquads: ['security'] });
    expect(files).not.toContain('.aexos-core/data/registry-update-log.jsonl');
    expect(files.some((file) => /(^|\/)__pycache__\/|\.py[co]$/i.test(file))).toBe(false);
    const squadSources = files
      .filter((file) => file.startsWith('squads/'))
      .map((file) => file.split('/')[1]);
    expect([...new Set(squadSources)]).toEqual(['security']);
  });
});
