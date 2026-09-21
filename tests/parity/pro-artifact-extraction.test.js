'use strict';

const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const tar = require('tar');
const { extractProArtifactToTemp, resolveNpmInvocation } = require('../../packages/installer/src/wizard/pro-setup')._testing;

describe('Public Pro artifact staging without private Pro content', () => {
  let root;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'aexos-artifact-'));
    await fs.outputJson(path.join(root, 'package/package.json'), { name: '@aexos/pro', version: '0.0.0-fixture',
      scripts: { install: 'node -e "throw new Error(\'must not execute\')"' },
      dependencies: { 'intentionally-unavailable-parity-fixture': '0.0.0' } });
    await fs.outputFile(path.join(root, 'package/content.md'), '# Static content fixture');
  });
  afterEach(async () => { await fs.remove(root); });
  const pack = async (files = ['package']) => {
    const file = path.join(root, 'fixture.tgz');
    await tar.c({ cwd: root, file, gzip: true }, files);
    return file;
  };

  test('extracts static content with spaces without scripts, dependency resolution or npm', async () => {
    const source = await extractProArtifactToTemp(await pack(), path.join(root, 'staging with spaces'));
    expect(await fs.readFile(path.join(source, 'content.md'), 'utf8')).toBe('# Static content fixture');
    expect((await fs.readJson(path.join(source, 'package.json'))).name).toBe('@aexos/pro');
    expect(await fs.pathExists(path.join(source, 'node_modules'))).toBe(false);
    expect(await fs.pathExists(path.join(root, 'staging with spaces/package-root/package-lock.json'))).toBe(false);
  });
  test('rejects another package identity', async () => {
    await fs.outputJson(path.join(root, 'package/package.json'), { name: '@other/package' });
    await expect(extractProArtifactToTemp(await pack(), path.join(root, 'staging'))).rejects.toThrow('unexpected package identity');
  });
  test('rejects an alternate archive root before writing content', async () => {
    await fs.outputFile(path.join(root, 'outside.txt'), 'not part of the package');
    await expect(extractProArtifactToTemp(await pack(['package', 'outside.txt']), path.join(root, 'staging'))).rejects.toThrow('Unsafe Pro artifact entry');
    expect(await fs.pathExists(path.join(root, 'staging'))).toBe(false);
  });
  test('rejects a linked staging parent without writing to the external directory', async () => {
    const external = path.join(root, 'external');
    const staging = path.join(root, 'staging');
    await fs.ensureDir(external);
    await fs.writeFile(path.join(external, 'sentinel'), 'unchanged');
    await fs.symlink(external, staging, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(extractProArtifactToTemp(await pack(), staging)).rejects.toThrow('Unsafe Pro staging parent');
    expect(await fs.readdir(external)).toEqual(['sentinel']);
    expect(await fs.readFile(path.join(external, 'sentinel'), 'utf8')).toBe('unchanged');
  });
  test('rejects a reused extraction with stale metadata', async () => {
    const staging = path.join(root, 'staging');
    await fs.outputJson(path.join(staging, 'package-root/node_modules/@aexos/pro/package.json'), { name: '@aexos/pro' });
    await fs.remove(path.join(root, 'package/package.json'));
    await expect(extractProArtifactToTemp(await pack(), staging)).rejects.toThrow('fresh staging directory');
    expect(await fs.pathExists(path.join(staging, 'package-root/node_modules/@aexos/pro/content.md'))).toBe(false);
  });
  test.each(['symbolic', 'hard'])('rejects %s links inside archives before extraction', async kind => {
    if (kind === 'symbolic') {
      await fs.ensureDir(path.join(root, 'external'));
      await fs.symlink(path.join(root, 'external'), path.join(root, 'package/linked'), process.platform === 'win32' ? 'junction' : 'dir');
    } else {
      await fs.link(path.join(root, 'package/content.md'), path.join(root, 'package/linked.md'));
    }
    await expect(extractProArtifactToTemp(await pack(), path.join(root, 'staging'))).rejects.toThrow('Unsafe Pro artifact entry');
    expect(await fs.pathExists(path.join(root, 'staging'))).toBe(false);
  });
  test('direct global Windows invocation resolves the bundled npm CLI without a shell', () => {
    const execPath = 'C:\\Program Files\\nodejs\\node.exe';
    const npm = 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js';
    expect(resolveNpmInvocation({ platform: 'win32', execPath, env: {}, fileExists: file => file === npm }))
      .toEqual({ command: execPath, prefixArgs: [npm], execOptions: {} });
  });
});
