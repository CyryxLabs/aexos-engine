'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { renderInstallPanel, renderInstallCompletion, getInstallOutcome, readInstalledCounts, renderInstallPlan, renderInstallWelcome, getTerminalCapabilities, stripTerminalControls } = require('../../packages/installer/src/wizard/install-experience');
const { visibleWidth, WORDMARK, WORDMARK_COMPACT, MONOLITH, MONOLITH_COMPACT } = require('../../packages/installer/src/utils/aexos-banner');

describe('Installation experience truth and readability', () => {
  test.each([40, 60, 80, 120])('illustrated welcome fits %i columns with a long Unicode workspace path', (width) => {
    const output = renderInstallWelcome({ width, height: 36, plain: false, colorLevel: 0, projectRoot: `C:/${'équipe-工作區/'.repeat(12)}` });
    expect(output.split('\n').every((line) => visibleWidth(line) <= width)).toBe(true);
    expect(output).toContain(width < 80 ? WORDMARK_COMPACT[0] : WORDMARK[0]);
    expect(output).toContain('INCLUDED IN THIS PACKAGE');
    expect(output).toContain(width < 60 ? 'Host setup: local files only.' : 'No provider session is started.');
    const art = width < 80 ? MONOLITH_COMPACT : MONOLITH;
    expect(output).toContain(art[3]);
    expect(output).not.toContain('Hermes');
  });

  test('short terminal height uses the compact wordmark and emblem even at 80 columns', () => {
    const output = renderInstallWelcome({ width: 80, height: 24, plain: false, colorLevel: 0, projectRoot: 'C:/Example' });
    expect(output).toContain(WORDMARK_COMPACT[0]);
    expect(output).toContain(MONOLITH_COMPACT[3]);
    expect(output.split('\n').length).toBeLessThanOrEqual(24);
  });

  test.each([40, 60, 80, 120])('welcome leaves room for the first selector at %i columns', (width) => {
    const output = renderInstallWelcome({ width, height: 36, plain: false, colorLevel: 0, projectRoot: 'C:/Projects/My Company' });
    expect(output.split('\n').length).toBeLessThanOrEqual(24);
    expect(output.split('\n').every((line) => visibleWidth(line) < width)).toBe(true);
    expect(output).not.toContain('Arrow keys to move.');
  });

  test.each([2, 3])('uses level %i color encoding without changing visible alignment', (colorLevel) => {
    const output = renderInstallWelcome({ width: 80, plain: false, colorLevel });
    expect(output).toContain(colorLevel === 2 ? '\x1b[38;5;' : '\x1b[38;2;');
    if (colorLevel === 2) expect(output).not.toContain('\x1b[38;2;');
    expect(output.split('\n').every((line) => visibleWidth(line) <= 80)).toBe(true);
  });

  test.each([{ NO_COLOR: '1' }, { TERM: 'dumb' }])('plain welcome omits character artwork and ANSI in %j mode', (env) => {
    const output = renderInstallWelcome({ width: 40, output: { isTTY: true }, env, colorLevel: 3 });
    expect(output).not.toContain('\x1b');
    expect(output).not.toMatch(/[█▐▌┌┐]/);
    expect(output).toContain('Included in this package');
    expect(output).toContain('Workspace setup / Cyryx Labs');
  });

  test('reports executing package inventory separately from the target workspace', () => {
    const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-welcome-package-'));
    const target = path.join(packageRoot, 'target');
    const originalPackageRoot = process.env.AEXOS_CORE_PACKAGE_ROOT;
    try {
      fs.mkdirSync(path.join(packageRoot, '.aexos-core/development/agents'), { recursive: true });
      fs.mkdirSync(path.join(packageRoot, '.aexos-core/development/tasks'), { recursive: true });
      fs.mkdirSync(path.join(target, '.aexos-core/development/agents'), { recursive: true });
      fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ name: '@aexos/core', version: '0.0.7-fixture' }));
      fs.writeFileSync(path.join(packageRoot, '.aexos-core/development/agents/dev.md'), 'agent');
      fs.writeFileSync(path.join(packageRoot, '.aexos-core/development/tasks/build.md'), 'task');
      fs.writeFileSync(path.join(packageRoot, '.aexos-core/development/tasks/check.md'), 'task');
      process.env.AEXOS_CORE_PACKAGE_ROOT = packageRoot;
      const output = renderInstallWelcome({ width: 80, plain: false, colorLevel: 0, projectRoot: target });
      expect(output).toContain('AEXOS 0.0.7-fixture');
      expect(output).toContain('1 agent / 2 tasks');
      expect(output).toContain('workflows: unavailable');
      expect(output).not.toContain('0 agents');
      expect(output).not.toContain('Installed:');
    } finally {
      if (originalPackageRoot === undefined) delete process.env.AEXOS_CORE_PACKAGE_ROOT;
      else process.env.AEXOS_CORE_PACKAGE_ROOT = originalPackageRoot;
      fs.rmSync(packageRoot, { recursive: true, force: true });
    }
  });

  test.each([40, 60, 80, 120])('wraps long paths and translated labels within %i columns', (width) => {
    const output = renderInstallPanel('Workspace configuration', [
      `Project: C:/${'long-workspace-directory/'.repeat(8)}`,
      'Configuração avançada / Instalação / 工作区配置',
    ], { width, plain: false });
    expect(output.split('\n').every((line) => visibleWidth(line) <= width)).toBe(true);
    expect(output).toContain('Workspace configuration');
  });

  test.each([40, 60, 80, 120])('keeps welcome and review readable at %i columns', (width) => {
    const options = { width, plain: false };
    const output = `${renderInstallWelcome(options)}\n${renderInstallPlan({ projectRoot: `C:/${'工作區é/'.repeat(20)}`, userProfile: 'bob', selectedIDEs: [] }, options)}`;
    expect(output.split('\n').every((line) => visibleWidth(line) <= width)).toBe(true);
    expect(output).toContain('CLI only');
    expect(output).not.toContain('Recommended');
  });

  test.each([{ NO_COLOR: '' }, { NO_COLOR: '1', FORCE_COLOR: '1' }, { TERM: 'dumb' }])('uses plain mode with %j despite a TTY', (env) => {
    expect(getTerminalCapabilities({ output: { isTTY: true, columns: 40 }, env }).plain).toBe(true);
  });

  test('strips terminal cursor commands, OSC links and carriage-return injection', () => {
    expect(stripTerminalControls('\x1b]8;;https://example.test\x07hello\x1b]8;;\x07\x1b[2J\rworld')).toBe('helloworld');
  });

  test('keeps safely quoted target commands on one logical line at 40 columns', () => {
    const projectRoot = path.resolve("long project with spaces and ' apostrophe");
    const output = renderInstallCompletion({ invocationCwd: path.dirname(projectRoot), projectRoot, validationResult: { overallStatus: 'success' } }, { width: 40, plain: true });
    const command = output.split('\n').find((line) => /^(Set-Location|cd --)/.test(line));
    expect(command).toBe(process.platform === 'win32' ? `Set-Location -LiteralPath '${projectRoot.replace(/'/g, "''")}'` : `cd -- '${projectRoot.replace(/'/g, "'\\''")}'`);
    expect(output.split('\n')).toContain('npx @aexos/core doctor');
  });

  test('review states skipped project dependencies and template compatibility accurately', () => {
    const output = renderInstallPlan({ skipInstall: true, template: 'minimal', nonInteractive: true, projectType: 'brownfield' }, { plain: true, width: 120 });
    expect(output).toContain('skip project dependencies');
    expect(output).toContain('compatibility alias; standard installation');
    expect(output).toContain('merge supported files');
    expect(output).not.toContain('ask how');
  });

  test('plain mode strips escape sequences and retains text status', () => {
    const output = renderInstallPanel('Verification', ['\u001b[31mFAIL: configuration missing\u001b[0m'], { plain: true });
    expect(output).not.toContain('\u001b');
    expect(output).toContain('FAIL: configuration missing');
  });

  test.each([undefined, 'failed', 'error', 'partial', 'invented'])('never marks %s verification successful', (overallStatus) => {
    const answers = { validationResult: { overallStatus } };
    expect(getInstallOutcome(answers).success).toBe(false);
    expect(renderInstallCompletion(answers, { plain: true })).toContain('Installation needs attention');
  });

  test('a failed required component overrides successful validation', () => {
    expect(getInstallOutcome({ cyryxCoreInstalled: false, validationResult: { overallStatus: 'success' } }).success).toBe(false);
    expect(getInstallOutcome({ ideConfigResult: { success: false }, validationResult: { overallStatus: 'success' } }).success).toBe(false);
  });

  test('selected host projection failures cannot be hidden by file validation', () => {
    const result = getInstallOutcome({ selectedIDEs: ['codex', 'claude-code'], ideSyncStatus: 'failed', codexSkillsStatus: 'failed', settingsGenerated: false, validationResult: { overallStatus: 'success' } });
    expect(result.success).toBe(false);
    expect(result.failures).toEqual(expect.arrayContaining(['Host projection sync', 'Codex skills', 'Claude settings']));
  });

  test('completion gives host-specific next steps and installation scope', () => {
    const output = renderInstallCompletion({ selectedIDEs: ['codex'], installedCounts: { agents: 12, tasks: 218, workflows: 19 }, validationResult: { overallStatus: 'warning', warnings: [{}] } }, { plain: true });
    expect(output).toContain('passed with 1 warning');
    expect(output).toContain('/skills > aexos-master');
    expect(output).not.toContain('Claude Code:');
    expect(output).toContain('Host execution');
  });

  test('counts actual installed component files, not top-level directory labels', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-counts-'));
    try {
      const agents = path.join(root, '.aexos-core', 'development', 'agents');
      fs.mkdirSync(path.join(agents, 'ignored'), { recursive: true });
      fs.writeFileSync(path.join(agents, 'dev.md'), 'agent');
      expect(readInstalledCounts(root)).toEqual({ agents: 1, tasks: null, workflows: null, templates: null });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
