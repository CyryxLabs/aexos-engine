'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { runDoctorChecks } = require('../../../.aexos-core/core/doctor');
const { applyFixes } = require('../../../.aexos-core/core/doctor/fix-handler');
const npmCheck = require('../../../.aexos-core/core/doctor/checks/npm-packages');
const hostCheck = require('../../../.aexos-core/core/doctor/checks/selected-hosts');
const coreCheck = require('../../../.aexos-core/core/doctor/checks/core-config');

let projectRoot;
function write(relative, content) {
  const file = path.join(projectRoot, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
}
function select(hosts) {
  write('.aexos-core/core-config.yaml', `project: {}\nboundary: {}\nide:\n  selected: ${JSON.stringify(hosts)}\n`);
}
beforeEach(() => { projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-truth-')); });
afterEach(() => { fs.rmSync(projectRoot, { recursive: true, force: true }); });

it('does not mark unselected Claude integration passed or create its artifacts with --fix', async () => {
  select([]);
  const { data, formatted } = await runDoctorChecks({ projectRoot, fix: true });
  for (const name of ['claude-md', 'settings-json', 'rules-files', 'hooks-claude-count', 'ide-sync', 'skills-count', 'commands-count']) {
    expect(data.checks.find((check) => check.check === name).status).toBe('INFO');
  }
  expect(fs.existsSync(path.join(projectRoot, '.claude'))).toBe(false);
  expect(data.scope).toContain('Task contracts');
  expect(formatted).toContain('not certified');
  expect(data.summary.fail).toBe(data.checks.filter((check) => check.status === 'FAIL').length);
});
it.each(['claude-code', 'codex', 'gemini'])('fails missing explicitly selected %s configuration', async (host) => {
  select([host]);
  expect((await hostCheck.run({ projectRoot })).status).toBe('FAIL');
});
it('rejects a directory at a selected host configuration path consistently with evidence reporting', async () => {
  select(['codex']); fs.mkdirSync(path.join(projectRoot, 'AGENTS.md'));
  expect((await hostCheck.run({ projectRoot })).status).toBe('FAIL');
});
it('recognizes existing Codex configuration without claiming live connectivity', async () => {
  select(['codex']);
  write('AGENTS.md', '# Project rules');
  const result = await hostCheck.run({ projectRoot });
  expect(result.status).toBe('PASS');
  expect(result.message).toContain('connectivity not tested');
  expect(result.hostEvidence).toEqual([expect.objectContaining({ host: 'codex', configured: 'present',
    staticParity: 'NOT_ASSESSED', installedClient: 'NOT_ASSESSED', nativeExecution: 'NOT_ASSESSED', endToEndAcceptance: 'NOT_ASSESSED' })]);
});
it.each(['ide: [', 'project: {}\nboundary: {}\nide:\n  selected: false'])('fails malformed config: %s', async (content) => {
  write('.aexos-core/core-config.yaml', content);
  expect((await coreCheck.run({ projectRoot })).status).toBe('FAIL');
  expect((await hostCheck.run({ projectRoot })).status).toBe('FAIL');
});
it('does not require node_modules without dependency declarations', async () => {
  expect((await npmCheck.run({ projectRoot })).status).toBe('INFO');
});
it('does not let an empty node_modules hide a missing dependency', async () => {
  write('package.json', { dependencies: { 'aexos-missing-regression': '*' } });
  fs.mkdirSync(path.join(projectRoot, 'node_modules'));
  const result = await npmCheck.run({ projectRoot });
  expect(result.status).toBe('FAIL');
  expect(result.message).toContain('aexos-missing-regression');
});
it('checks framework dependencies even without project package.json', async () => {
  write('.aexos-core/package.json', { dependencies: { 'aexos-missing-regression': '*' } });
  expect((await npmCheck.run({ projectRoot })).status).toBe('FAIL');
});
it('fails corrupt package manifests instead of reporting green', async () => {
  write('package.json', '{ broken');
  expect((await npmCheck.run({ projectRoot })).status).toBe('FAIL');
});
it('does not claim manual-only fixes were applied', async () => {
  const fixes = await applyFixes(['claude-md', 'settings-json'].map((check) => ({ check, status: 'FAIL' })), { projectRoot, frameworkRoot: projectRoot, options: {} });
  expect(fixes.every((fix) => fix.applied === false)).toBe(true);
});

it('does not claim all hooks registered when only one is referenced', async () => {
  const hooks = require('../../../.aexos-core/core/doctor/checks/hooks-claude-count');
  select(['claude-code']);
  write('.claude/hooks/first.cjs', '// first');
  write('.claude/hooks/second.cjs', '// second');
  write('.claude/settings.json', { hooks: { PreToolUse: [{ hooks: [{ command: 'node .claude/hooks/first.cjs' }] }] } });
  expect((await hooks.run({ projectRoot })).status).toBe('WARN');
  write('.claude/settings.local.json', { hooks: { PostToolUse: [{ hooks: [{ command: 'node .claude/hooks/second.cjs' }] }] } });
  expect((await hooks.run({ projectRoot })).status).toBe('PASS');
});

it.each(['ide: false', 'ide: null', 'ide: []', 'ide:\n  selected: ["codex "]', 'ide:\n  selected: ["codex", "codex"]'])('fails malformed host configuration: %s', async (ide) => {
  write('.aexos-core/core-config.yaml', `project: {}\nboundary: {}\n${ide}\n`);
  expect((await hostCheck.run({ projectRoot })).status).toBe('FAIL');
});

it.each([
  ['synapse-wrapper.cjs', 'synapse-engine.cjs'],
  ['precompact-wrapper.cjs', 'precompact-session-digest.cjs'],
])('recognizes reviewed %s delegation but rejects fake wrappers and unregistered helpers', async (wrapper, helper) => {
  const hooks = require('../../../.aexos-core/core/doctor/checks/hooks-claude-count');
  select(['claude-code']);
  const canonical = fs.readFileSync(path.resolve(__dirname, '../../../.claude/hooks', wrapper), 'utf8');
  write(`.claude/hooks/${wrapper}`, canonical);
  write(`.claude/hooks/${helper}`, '// delegated helper');
  write('.claude/settings.json', { hooks: { UserPromptSubmit: [{ hooks: [{ command: `node ".claude/hooks/${wrapper}"` }] }] } });
  expect((await hooks.run({ projectRoot })).status).toBe('PASS');
  write('.claude/hooks/unregistered.cjs', '// genuinely unregistered');
  expect((await hooks.run({ projectRoot })).status).toBe('WARN');
  fs.unlinkSync(path.join(projectRoot, '.claude/hooks/unregistered.cjs'));
  write(`.claude/hooks/${wrapper}`, `// fake wrapper merely mentions ${helper}\nprocess.exit(0);`);
  expect((await hooks.run({ projectRoot })).status).toBe('WARN');
  write(`.claude/hooks/${wrapper}`, canonical);
  write('.claude/settings.json', { hooks: {} });
  expect((await hooks.run({ projectRoot })).status).toBe('WARN');
});
it.each(['1.0.0', undefined])('rejects installed version %s for a required range', async (version) => {
  write('package.json', { dependencies: { 'test-required-version': '^2.0.0' } });
  write('node_modules/test-required-version/package.json', { name: 'test-required-version', version });
  expect((await npmCheck.run({ projectRoot })).status).toBe('FAIL');
});
it('accepts a matching installed required version', async () => {
  write('package.json', { dependencies: { 'test-required-version': '^2.0.0' } });
  write('node_modules/test-required-version/package.json', { name: 'test-required-version', version: '2.1.0' });
  expect((await npmCheck.run({ projectRoot })).status).toBe('PASS');
});
it('warns when a source requirement cannot be version-verified locally', async () => {
  write('package.json', { dependencies: { 'test-required-version': 'file:../local-package' } });
  write('node_modules/test-required-version/package.json', { name: 'test-required-version', version: '2.1.0' });
  expect((await npmCheck.run({ projectRoot })).status).toBe('WARN');
});
it('does not certify unavailable optional peer comparison', async () => {
  const check = require('../../../.aexos-core/core/doctor/checks/framework-3way-diff');
  const result = await check.run({ projectRoot });
  expect(result.status).not.toBe('PASS');
});
it('does not report missing-source rule repair applied', async () => {
  const result = await applyFixes([{ check: 'rules-files', status: 'FAIL' }], { projectRoot, frameworkRoot: projectRoot, options: {} });
  expect(result[0].applied).toBe(false);
  expect(result[0].message).toContain('still missing');
});
it('audits and repairs only installed agent definitions rather than the legacy roster', async () => {
  const memory = require('../../../.aexos-core/core/doctor/checks/agent-memory');
  write('.aexos-core/development/agents/aexos-master.md', '# Master');
  write('.aexos-core/development/agents/ux-design-expert.md', '# UX');
  write('.aexos-core/development/agents/aexos-master/MEMORY.md', '# Existing memory');
  const before = await memory.run({ projectRoot });
  expect(before.status).toBe('WARN');
  expect(before.message).toContain('ux-design-expert');
  const fixed = await applyFixes([before], { projectRoot, frameworkRoot: projectRoot, options: {} });
  expect(fixed[0].applied).toBe(true);
  expect((await memory.run({ projectRoot })).status).toBe('PASS');
  expect(fs.existsSync(path.join(projectRoot, '.aexos-core/development/agents/ux'))).toBe(false);
  expect(fs.readFileSync(path.join(projectRoot, '.aexos-core/development/agents/aexos-master/MEMORY.md'), 'utf8')).toBe('# Existing memory');
});
it('does not certify memory for an empty agent roster', async () => {
  fs.mkdirSync(path.join(projectRoot, '.aexos-core/development/agents'), { recursive: true });
  const memory = require('../../../.aexos-core/core/doctor/checks/agent-memory');
  expect((await memory.run({ projectRoot })).status).toBe('FAIL');
});
it('does not treat explicitly disabled protection as enforced or broken', async () => {
  const check = require('../../../.aexos-core/core/doctor/checks/settings-json');
  write('.aexos-core/core-config.yaml', 'project: {}\nide:\n  selected: [claude-code]\nboundary:\n  frameworkProtection: false\n');
  write('.claude/settings.json', {});
  expect((await check.run({ projectRoot })).status).toBe('INFO');
  write('.claude/settings.json', { permissions: { deny: 'not-an-array' } });
  expect((await check.run({ projectRoot })).status).toBe('FAIL');
});
it('warns about unavailable explicitly configured framework peers', async () => {
  const old = process.env.AEXOS_HUB_ROOT;
  process.env.AEXOS_HUB_ROOT = path.join(projectRoot, 'missing-peer');
  try {
    const check = require('../../../.aexos-core/core/doctor/checks/framework-3way-diff');
    const result = await check.run({ projectRoot });
    expect(result.status).toBe('WARN');
    expect(result.message).toContain('AEXOS_HUB_ROOT');
  } finally {
    if (old === undefined) delete process.env.AEXOS_HUB_ROOT;
    else process.env.AEXOS_HUB_ROOT = old;
  }
});
