'use strict';

const path = require('path');
const { execFileSync } = require('child_process');
const { _testing } = require('../../bin/aexos');

describe('installer entry UX', () => {
  const cli = path.resolve(__dirname, '../../bin/aexos.js');

  test.each([
    [[], { ci: false, yes: false, force: false, quiet: false }],
    [['--force'], { ci: false, yes: false, force: true, quiet: false }],
    [['--yes'], { ci: false, yes: true, force: true, quiet: false }],
    [['-y'], { ci: false, yes: true, force: true, quiet: false }],
    [['--ci'], { ci: true, yes: false, force: true, quiet: true }],
    [['--quiet'], { ci: false, yes: false, force: false, quiet: true }],
  ])('forwards explicit init execution policy %j', (args, expected) => {
    expect(_testing.parseInitExecutionFlags(args)).toEqual(expected);
  });

  test('help distinguishes a named init target from current-directory install', () => {
    const init = execFileSync(process.execPath, [cli, 'init', '--help'], { encoding: 'utf8' });
    const install = execFileSync(process.execPath, [cli, 'install', '--help'], { encoding: 'utf8' });
    expect(init).toContain('npx @aexos/core init <project-name>');
    expect(init).toContain('The name is required');
    expect(init).toContain('npx @aexos/core install');
    expect(init).toContain('--ci');
    expect(init).toContain('--quiet');
    expect(init).toContain('same standard framework content');
    expect(init).not.toContain('dashboards + team integrations');
    expect(install).toContain('Install AEXOS in the current directory');
    expect(install).toContain('review choices interactively');
    expect(install).not.toContain('Force reinstall without prompts');
  });

  test.each([40, 60, 80, 120])('help keeps descriptions readable at %i columns without splitting commands', (width) => {
    const command = '  npx @aexos/core init "workspace with spaces" --skip-install';
    const help = _testing.formatInstallerHelp(`Options:\n  --skip-install       Skip project dependencies; install framework requirements\n\n${command}`, width);
    expect(help).toContain(command);
    const descriptions = help.split('\n').filter((line) => !line.trim().startsWith('npx '));
    expect(descriptions.every((line) => line.length <= width)).toBe(true);
    expect(descriptions.join(' ')).toContain('framework');
  });

  test('early failures offer target-bound diagnostics and a valid retry', () => {
    const target = process.platform === 'win32' ? "C:\\projects\\Paulo's workspace" : "/projects/Paulo's workspace";
    const recovery = _testing.installerRecovery(target);
    expect(recovery).toContain('npx @aexos/core doctor');
    expect(recovery).toContain('npx @aexos/core install');
    expect(recovery).toContain(process.platform === 'win32' ? "Paulo''s workspace'" : "Paulo'\\''s workspace'");
    expect(_testing.installerRecovery('/projects/unsafe\u001b[31m')).not.toMatch(/(?:cd --|Set-Location)/);
  });
});
