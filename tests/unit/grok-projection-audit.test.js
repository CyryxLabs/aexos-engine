'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { validateGrokProjection } = require(path.resolve(__dirname, '../../scripts/validate-grok-projection'));
const canonical = require('../../.aexos-core/infrastructure/scripts/grok-skills-sync/validate');
const { syncGrok } = require('../../.aexos-core/infrastructure/scripts/grok-skills-sync');

test('public command reuses the portable Core validator', () => {
  expect(validateGrokProjection).toBe(canonical.validateGrokProjection);
});

test('real managed projection reports missing, content, ownership and stale drift without target writes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-grok-audit-'));
  const target = path.join(root, '.grok');
  const snapshot = (dir) => Object.fromEntries(fs.readdirSync(dir, { recursive: true })
    .filter((name) => fs.lstatSync(path.join(dir, name)).isFile())
    .sort().map((name) => [name, fs.readFileSync(path.join(dir, name)).toString('base64')]));
  try {
    const agents = path.join(root, '.aexos-core/development/agents');
    fs.mkdirSync(agents, { recursive: true });
    fs.copyFileSync(path.resolve(__dirname, '../../.aexos-core/development/agents/dev.md'), path.join(agents, 'dev.md'));
    syncGrok({ projectRoot: root, quiet: true });
    fs.writeFileSync(path.join(target, 'custom.md'), 'user content');
    const original = snapshot(target);
    expect(validateGrokProjection({ projectRoot: root }).valid).toBe(true);
    expect(snapshot(target)).toEqual(original);
    const manifestPath = path.join(target, '.aexos-managed.json');
    const manifestText = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestText);
    const entry = manifest.files.find((file) => file.path === 'agents/aexos-dev.md');
    const agentPath = path.join(target, entry.path);
    const content = fs.readFileSync(agentPath, 'utf8');
    for (const status of ['missing', 'different', 'ownership-drift', 'stale-managed']) {
      fs.writeFileSync(agentPath, content);
      fs.writeFileSync(manifestPath, manifestText);
      if (status === 'missing') fs.unlinkSync(agentPath);
      if (status === 'different') fs.writeFileSync(agentPath, 'user changed generated content');
      if (status === 'ownership-drift') {
        const changed = JSON.parse(manifestText);
        changed.files.find((file) => file.path === entry.path).sha256 = '0'.repeat(64);
        fs.writeFileSync(manifestPath, JSON.stringify(changed));
      }
      if (status === 'stale-managed') {
        const changed = JSON.parse(manifestText);
        changed.files.push({ ...entry, path: 'old-agent.md' });
        fs.writeFileSync(manifestPath, JSON.stringify(changed));
      }
      const before = snapshot(target);
      const result = validateGrokProjection({ projectRoot: root });
      expect(result.valid).toBe(false);
      expect(result.findings.some((finding) => finding.status === status)).toBe(true);
      expect(snapshot(target)).toEqual(before);
      expect(fs.readFileSync(path.join(target, 'custom.md'), 'utf8')).toBe('user content');
    }
    for (const host of ['.claude', '.codex', '.gemini', '.cursor', '.antigravity', '.github']) {
      expect(fs.existsSync(path.join(root, host))).toBe(false);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('Grok inspection detects drift without rewriting installed content', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-grok-test-'));
  try {
    fs.writeFileSync(path.join(root, 'profile.md'), 'user change');
    const result = validateGrokProjection({ grokRoot: root, generate: ({ grokRoot }) => {
      fs.writeFileSync(path.join(grokRoot, 'profile.md'), 'expected');
      fs.writeFileSync(path.join(grokRoot, 'missing.md'), 'new');
      return { written: [path.join(grokRoot, 'profile.md'), path.join(grokRoot, 'missing.md')] };
    } });
    expect(result).toMatchObject({ valid: false, checked: 2, hostRuntime: 'NOT_ASSESSED' });
    expect(result.findings.map((finding) => finding.status)).toEqual(['different', 'missing']);
    expect(fs.readFileSync(path.join(root, 'profile.md'), 'utf8')).toBe('user change');
    expect(fs.existsSync(path.join(root, 'missing.md'))).toBe(false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
