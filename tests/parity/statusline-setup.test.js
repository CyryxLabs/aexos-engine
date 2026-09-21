'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const STATUSLINE = path.join(
  ROOT,
  '.aexos-core',
  'product',
  'templates',
  'statusline',
  'statusline-script.js',
);
const INSTALLER = path.join(path.dirname(STATUSLINE), 'install-statusline.js');
const SETUP = path.join(ROOT, '.claude', 'setup');
// eslint-disable-next-line no-control-regex
const ANSI = new RegExp('\\x1b\\[[0-9;]*m', 'g');

function isolatedEnvironment(home) {
  return {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
  };
}

function runStatusline(home, input, cwd = home) {
  return spawnSync(process.execPath, [STATUSLINE], {
    cwd,
    env: isolatedEnvironment(home),
    input: JSON.stringify(input),
    encoding: 'utf8',
  });
}

function runInstaller(home, extraArgs = []) {
  return spawnSync(process.execPath, [INSTALLER, '--home', home, ...extraArgs], {
    cwd: ROOT,
    env: isolatedEnvironment(home),
    encoding: 'utf8',
  });
}

describe('standalone Claude statusline setup', () => {
  let home;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'aexos-statusline-home-'));
  });

  afterEach(async () => {
    await fs.remove(home);
  });

  test('renders AEXOS context, cost, duration, changes, and legitimate host metrics from JSON stdin', () => {
    const result = runStatusline(home, {
      session_id: '1234567890abcdef',
      model: { id: 'claude-opus-4-6' },
      cwd: home,
      context_window: {
        used_percentage: 150,
        total_input_tokens: 1500,
        total_output_tokens: 250,
      },
      cost: {
        total_cost_usd: 1.234,
        total_duration_ms: 65000,
        total_lines_added: 7,
        total_lines_removed: 2,
      },
      agent: { name: 'aexos-dev' },
    });

    expect(result.status).toBe(0);
    const output = result.stdout.replace(ANSI, '');
    expect(output).toContain('12345678');
    expect(output).toContain('Opus 4.6');
    expect(output).toContain('██████████ 100%');
    expect(output).toContain('$1.23');
    expect(output).toContain('⏱ 1m05s');
    expect(output).toContain('🤖 aexos-dev');
    expect(output).toContain('+7 -2');
    expect(output).toMatch(/CPU\(avg\) \d{1,3}% RAM \d{1,3}%/);
    expect(fs.existsSync(path.join(home, '.claude', 'statusline-debug.json'))).toBe(false);
  });

  test.each([-80, 500, 'not-a-number'])('clamps invalid context percentage %p', (percentage) => {
    const result = runStatusline(home, {
      context_window: { used_percentage: percentage },
    });
    expect(result.status).toBe(0);
    const output = result.stdout.replace(ANSI, '');
    expect(output).toMatch(/(?:0|100)%/);
    expect(output).toMatch(/CPU\(avg\) \d{1,3}% RAM \d{1,3}%/);
  });

  test('does not persist or echo malformed raw status input', async () => {
    const sensitiveInput = '{"secret":"do-not-log"';
    const result = spawnSync(process.execPath, [STATUSLINE], {
      cwd: home,
      env: isolatedEnvironment(home),
      input: sensitiveInput,
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain('do-not-log');
    expect(await fs.readFile(STATUSLINE, 'utf8')).not.toMatch(/claude-statusline-debug|\/tmp\//);
  });

  test('installs by merging settings without forcing model or permissions', async () => {
    const claudeDir = path.join(home, '.claude');
    const settingsPath = path.join(claudeDir, 'settings.json');
    const original = {
      model: 'sonnet',
      permissions: { deny: ['Bash(git push:*)'] },
      custom: { retained: true },
    };
    await fs.outputJson(settingsPath, original, { spaces: 2 });

    const result = runInstaller(home);
    expect(result.status).toBe(0);
    const installed = await fs.readJson(settingsPath);
    expect(installed.model).toBe('sonnet');
    expect(installed.permissions).toEqual(original.permissions);
    expect(installed.custom).toEqual(original.custom);
    expect(installed.statusLine.type).toBe('command');
    expect(installed.statusLine.command).toBe(
      process.platform === 'win32'
        ? `node "${path.join(claudeDir, 'statusline-script.js')}"`
        : 'bash ~/.claude/statusline-custom.sh',
    );
    expect(await fs.readFile(path.join(claudeDir, 'statusline-custom.sh'), 'utf8'))
      .toContain('AEXOS_MANAGED_STATUSLINE_WRAPPER');
    expect(await fs.readFile(path.join(claudeDir, 'statusline-script.js'), 'utf8'))
      .toContain('AEXOS Unified Statusline');
    const installedRender = spawnSync(
      process.execPath,
      [path.join(claudeDir, 'statusline-script.js')],
      {
        cwd: home,
        env: isolatedEnvironment(home),
        input: JSON.stringify({ context_window: { used_percentage: 25 } }),
        encoding: 'utf8',
      },
    );
    expect(installedRender.status).toBe(0);
    expect(installedRender.stdout.replace(ANSI, '')).toContain('25%');
    expect((await fs.readdir(claudeDir)).some((name) => name.startsWith('settings.json.backup.')))
      .toBe(true);
  });

  test('reinstall refreshes managed files and creates backups', async () => {
    expect(runInstaller(home).status).toBe(0);
    const claudeDir = path.join(home, '.claude');
    const scriptPath = path.join(claudeDir, 'statusline-script.js');
    const installedBytes = await fs.readFile(scriptPath);

    const result = runInstaller(home);
    expect(result.status).toBe(0);
    expect(await fs.readFile(scriptPath)).toEqual(installedBytes);
    const names = await fs.readdir(claudeDir);
    expect(names.some((name) => name.startsWith('settings.json.backup.'))).toBe(true);
    expect(names.some((name) => name.startsWith('statusline-custom.sh.backup.'))).toBe(true);
    expect(names.some((name) => name.startsWith('statusline-script.js.backup.'))).toBe(true);
  });

  test.each(['statusline-script.js', 'statusline-custom.sh'])(
    'preserves edits to %s even when the managed header remains', async (fileName) => {
      expect(runInstaller(home).status).toBe(0);
      const claudeDir = path.join(home, '.claude');
      const target = path.join(claudeDir, fileName);
      await fs.appendFile(target, '\n# retained user customization\n');
      const custom = await fs.readFile(target);
      const settings = await fs.readFile(path.join(claudeDir, 'settings.json'));
      const names = await fs.readdir(claudeDir);
      const preserved = runInstaller(home);
      expect(preserved.status).toBe(0);
      expect(preserved.stdout).toContain('preserved');
      expect(await fs.readFile(target)).toEqual(custom);
      expect(await fs.readFile(path.join(claudeDir, 'settings.json'))).toEqual(settings);
      expect(await fs.readdir(claudeDir)).toEqual(names);
      expect(runInstaller(home, ['--force-statusline']).status).toBe(0);
      expect(await fs.readFile(target, 'utf8')).not.toContain('retained user customization');
    },
  );

  test('fails closed on malformed settings before installing any files', async () => {
    const claudeDir = path.join(home, '.claude');
    const settingsPath = path.join(claudeDir, 'settings.json');
    await fs.outputFile(settingsPath, '{broken');

    const result = runInstaller(home);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('malformed Claude settings');
    expect(await fs.readFile(settingsPath, 'utf8')).toBe('{broken');
    expect(await fs.pathExists(path.join(claudeDir, 'statusline-custom.sh'))).toBe(false);
    expect(await fs.pathExists(path.join(claudeDir, 'statusline-script.js'))).toBe(false);
  });

  test('preserves a custom statusline unless force is explicit', async () => {
    const claudeDir = path.join(home, '.claude');
    const settingsPath = path.join(claudeDir, 'settings.json');
    const wrapperPath = path.join(claudeDir, 'statusline-custom.sh');
    const scriptPath = path.join(claudeDir, 'statusline-script.js');
    const customSettings = {
      permissions: { allow: ['Read'] },
      statusLine: { type: 'command', command: 'custom-status-command' },
    };
    await fs.outputJson(settingsPath, customSettings);
    await fs.writeFile(wrapperPath, '#!/bin/sh\necho custom-wrapper\n');
    await fs.writeFile(scriptPath, 'console.log("custom-script")\n');

    const preserved = runInstaller(home);
    expect(preserved.status).toBe(0);
    expect(preserved.stdout).toContain('preserved');
    expect(await fs.readJson(settingsPath)).toEqual(customSettings);
    expect(await fs.readFile(wrapperPath, 'utf8')).toContain('custom-wrapper');
    expect(await fs.readFile(scriptPath, 'utf8')).toContain('custom-script');

    const forced = runInstaller(home, ['--force-statusline']);
    expect(forced.status).toBe(0);
    expect((await fs.readJson(settingsPath)).permissions).toEqual(customSettings.permissions);
    expect(await fs.readFile(wrapperPath, 'utf8')).toContain('AEXOS_MANAGED_STATUSLINE_WRAPPER');
    expect(await fs.readFile(scriptPath, 'utf8')).toContain('AEXOS Unified Statusline');
  });

  test('reports an unwritable destination shape without changing settings or custom files', async () => {
    const claudeDir = path.join(home, '.claude');
    const settingsPath = path.join(claudeDir, 'settings.json');
    const original = '{"permissions":{"deny":["Write(.env)"]}}\n';
    await fs.outputFile(settingsPath, original);
    await fs.ensureDir(path.join(claudeDir, 'statusline-script.js'));

    const result = runInstaller(home);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('must be a regular file');
    expect(await fs.readFile(settingsPath, 'utf8')).toBe(original);
    expect(await fs.pathExists(path.join(claudeDir, 'statusline-custom.sh'))).toBe(false);
  });

  test('setup templates contain only the statusline contract and route through the canonical installer', async () => {
    const template = await fs.readJson(path.join(SETUP, 'settings.json'));
    const canonicalTemplate = await fs.readJson(path.join(path.dirname(STATUSLINE), 'settings.json'));
    expect(template).toEqual({
      statusLine: {
        type: 'command',
        command: 'bash ~/.claude/statusline-custom.sh',
      },
    });
    expect(template).toEqual(canonicalTemplate);
    expect(await fs.readFile(path.join(SETUP, 'statusline-custom.sh'), 'utf8'))
      .toBe(await fs.readFile(path.join(path.dirname(STATUSLINE), 'statusline-custom.sh'), 'utf8'));
    const entrypoint = await fs.readFile(path.join(SETUP, 'install.sh'), 'utf8');
    expect(entrypoint).toContain('install-statusline.js');
    expect(entrypoint).not.toMatch(/model|permissions|alwaysThinkingEnabled/);
    for (const wrapper of [
      path.join(SETUP, 'install.sh'),
      path.join(SETUP, 'statusline-custom.sh'),
      path.join(path.dirname(STATUSLINE), 'statusline-custom.sh'),
    ]) {
      expect(await fs.readFile(wrapper, 'utf8')).not.toContain('\r\n');
    }
  });
});
