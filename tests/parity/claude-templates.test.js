'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '../..');
const syncScript = path.join(projectRoot, 'scripts', 'parity', 'sync-claude-templates.js');
const {
  PROJECTION_MAP,
  PROJECTION_ROOT,
  UPSTREAM_LICENSE,
  sha256,
  syncClaudeTemplates,
} = require('../../scripts/parity/sync-claude-templates');
const {
  copyClaudeTemplatesFolder,
} = require('../../packages/installer/src/wizard/ide-config-generator');

const expectedNames = [
  'agent-template.yaml',
  'architecture-tmpl.yaml',
  'brainstorming-output-tmpl.yaml',
  'brownfield-architecture-tmpl.yaml',
  'brownfield-prd-tmpl.yaml',
  'competitor-analysis-tmpl.yaml',
  'database-schema-request-full.md',
  'database-schema-request-lite.md',
  'front-end-architecture-tmpl.yaml',
  'front-end-spec-tmpl.yaml',
  'fullstack-architecture-tmpl.yaml',
  'market-research-tmpl.yaml',
  'prd-tmpl.yaml',
  'project-brief-tmpl.yaml',
  'qa-gate-tmpl.yaml',
  'story-tmpl.yaml',
  'task-template.md',
  'workflow-template.yaml',
];

function copyFixture() {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-claude-templates-'));
  for (const [name, projection] of Object.entries(PROJECTION_MAP)) {
    const target = path.join(fixture, PROJECTION_ROOT, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(projectRoot, PROJECTION_ROOT, name), target);

    if (projection.source) {
      const source = path.join(fixture, projection.source);
      fs.mkdirSync(path.dirname(source), { recursive: true });
      fs.copyFileSync(path.join(projectRoot, projection.source), source);
    }
  }
  return fixture;
}

describe('Claude template projections', () => {
  const fixtures = [];

  afterEach(() => {
    while (fixtures.length) fs.rmSync(fixtures.pop(), { recursive: true, force: true });
  });

  it('maps the complete frozen 18-template public surface explicitly', () => {
    expect(Object.keys(PROJECTION_MAP).sort()).toEqual(expectedNames);
  });

  it.each(
    Object.entries(PROJECTION_MAP).filter(([, projection]) => projection.source),
  )('%s is byte-identical to its canonical AEXOS template', (name, projection) => {
    const publicContent = fs.readFileSync(path.join(projectRoot, PROJECTION_ROOT, name));
    const canonicalContent = fs.readFileSync(path.join(projectRoot, projection.source));

    expect(publicContent.equals(canonicalContent)).toBe(true);
  });

  it('retains only the two genuinely missing upstream templates with attribution', () => {
    const retained = Object.entries(PROJECTION_MAP).filter(([, projection]) => {
      return projection.upstreamDelta;
    });

    expect(retained.map(([name]) => name).sort()).toEqual([
      'database-schema-request-full.md',
      'database-schema-request-lite.md',
    ]);
    expect(fs.existsSync(path.join(projectRoot, UPSTREAM_LICENSE))).toBe(true);

    for (const [name, projection] of retained) {
      const content = fs.readFileSync(path.join(projectRoot, PROJECTION_ROOT, name));
      expect(sha256(content)).toBe(projection.sha256);
      expect(projection.license).toBe(UPSTREAM_LICENSE);
    }
  });

  it('passes deterministic repository check mode', () => {
    const result = spawnSync(process.execPath, [syncScript, '--check'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Claude templates checked: 18; changed: 0');
  });

  it('detects drift without mutating a canonical projection in check mode', () => {
    const fixture = copyFixture();
    fixtures.push(fixture);
    const target = path.join(fixture, PROJECTION_ROOT, 'agent-template.yaml');
    fs.writeFileSync(target, 'corrupt\n');

    const result = syncClaudeTemplates({ root: fixture, check: true });

    expect(result.ok).toBe(false);
    expect(result.changed).toContain('agent-template.yaml');
    expect(fs.readFileSync(target, 'utf8')).toBe('corrupt\n');
  });

  it('repairs canonical drift while rejecting changes to retained upstream deltas', () => {
    const fixture = copyFixture();
    fixtures.push(fixture);
    const canonicalTarget = path.join(fixture, PROJECTION_ROOT, 'agent-template.yaml');
    const retainedTarget = path.join(
      fixture,
      PROJECTION_ROOT,
      'database-schema-request-lite.md',
    );
    fs.writeFileSync(canonicalTarget, 'corrupt\n');
    fs.writeFileSync(retainedTarget, 'corrupt\n');

    const result = syncClaudeTemplates({ root: fixture });

    expect(result.ok).toBe(false);
    expect(fs.readFileSync(canonicalTarget).equals(
      fs.readFileSync(path.join(fixture, PROJECTION_MAP['agent-template.yaml'].source)),
    )).toBe(true);
    expect(result.errors).toContain(
      'database-schema-request-lite.md: retained upstream delta differs from frozen source',
    );
  });

  it('installs only mapped Claude templates and leaves unrelated source files out', async () => {
    const sourceRoot = copyFixture();
    const installRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-claude-install-'));
    fixtures.push(sourceRoot, installRoot);
    fs.writeFileSync(path.join(sourceRoot, PROJECTION_ROOT, 'unmanaged-private.md'), 'private\n');

    const result = await copyClaudeTemplatesFolder(installRoot, sourceRoot);

    expect(result.skipped).toBe(false);
    expect(result.createdDirectory).toBe(true);
    expect(result.copiedFiles).toHaveLength(18);
    expect(fs.existsSync(path.join(installRoot, PROJECTION_ROOT, 'unmanaged-private.md'))).toBe(
      false,
    );
  });

  it('preserves customized templates on reinstall while restoring missing mapped files', async () => {
    const sourceRoot = copyFixture();
    const installRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-claude-reinstall-'));
    fixtures.push(sourceRoot, installRoot);
    await copyClaudeTemplatesFolder(installRoot, sourceRoot);

    const customized = path.join(installRoot, PROJECTION_ROOT, 'agent-template.yaml');
    const missing = path.join(installRoot, PROJECTION_ROOT, 'workflow-template.yaml');
    fs.writeFileSync(customized, 'user customization\n');
    fs.rmSync(missing);

    const result = await copyClaudeTemplatesFolder(installRoot, sourceRoot);

    expect(fs.readFileSync(customized, 'utf8')).toBe('user customization\n');
    expect(result.preservedFiles).toContain(customized);
    expect(result.copiedFiles).toEqual([missing]);
    expect(fs.readFileSync(missing).equals(
      fs.readFileSync(path.join(sourceRoot, PROJECTION_ROOT, 'workflow-template.yaml')),
    )).toBe(true);
  });
});
