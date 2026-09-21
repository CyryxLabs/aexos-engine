'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const root = path.resolve(__dirname, '../..');
const pkg = require('../../package.json');
const cli = path.join(root, 'bin/aexos.js');
const execute = args => spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', timeout: 30000, windowsHide: true });

// This suite executes public CLI contracts locally. npm exec of a real tarball
// is separately exercised by scripts/parity/installed.js; no registry is needed.
describe('Public CLI package and execution contracts', () => {
  test.each(['core', 'aexos', 'aexos-core'])('%s resolves to the packaged CLI', bin => {
    expect(pkg.bin[bin]).toBe('bin/aexos.js');
    expect(fs.existsSync(path.join(root, pkg.bin[bin]))).toBe(true);
  });
  test('ships the production implementation and supports local invocation', () => {
    expect(pkg.preferGlobal).toBe(false);
    expect(pkg.files).toEqual(expect.arrayContaining(['bin/', '.aexos-core/', 'packages/']));
    expect(pkg.engines.node).toMatch(/>=?\s*18/);
  });
  test.each(Object.entries(pkg.exports))('public export %s resolves', (_name, target) => {
    if (target.includes('*')) {
      expect(fs.statSync(path.join(root, target.slice(0, target.indexOf('*')))).isDirectory()).toBe(true);
    } else {
      expect(fs.statSync(path.join(root, target)).isFile()).toBe(true);
      expect(() => require(path.join(root, target))).not.toThrow();
    }
  });
  test.each([
    [['--version'], 0, /\d+\.\d+\.\d+/],
    [['--help'], 0, /USAGE:[\s\S]*@aexos\/core/],
    [['info'], 0, /System Information[\s\S]*Platform:/],
    [['invalid-command'], 1, /Unknown command/],
  ])('executes %j with the required exit and output', (args, status, output) => {
    const result = execute(args);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(status);
    expect(result.stdout + result.stderr).toMatch(output);
    if (args[0] === 'info') expect(result.stdout).toContain(process.platform);
  });
  test('ships a Node executable entrypoint', () => {
    expect(fs.readFileSync(cli, 'utf8').startsWith('#!/usr/bin/env node')).toBe(true);
  });
  test.each(['--version', 'info'])('%s completes within the existing five-second budget', arg => {
    const start = performance.now();
    const result = execute([arg]);
    expect(result.status).toBe(0);
    expect(performance.now() - start).toBeLessThan(5000);
  });
});
