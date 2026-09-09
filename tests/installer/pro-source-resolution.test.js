'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const fsExtra = require('fs-extra');
const proSetup = require(path.resolve(__dirname, '..', '..', 'packages', 'installer', 'src', 'wizard', 'pro-setup.js'));

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BUNDLED_PRO = path.join(REPO_ROOT, 'pro');
const TARGET = path.join(REPO_ROOT, 'acl10-fixture-project');
const TARGET_PRO = path.join(TARGET, 'node_modules', '@aexos', 'pro');
const GITMODULES = path.join(REPO_ROOT, '.gitmodules');

describe('ACL.10 implemented Pro source resolution', () => {
  let files;
  let directories;
  let bootstrap;
  let originalVersion;

  function addPackage(directory, metadata = { scaffold: false, implemented: true }, version = '1.2.3') {
    directories.add(directory);
    directories.add(path.join(directory, 'squads'));
    files.set(path.join(directory, 'package.json'), JSON.stringify({
      name: '@aexos/pro', version, ...(metadata === undefined ? {} : { aexosPro: metadata }),
    }));
    files.set(path.join(directory, 'pro-config.yaml'), 'version: 1\n');
  }

  beforeEach(() => {
    files = new Map();
    directories = new Set();
    originalVersion = process.env.AEXOS_PRO_ARTIFACT_VERSION;
    delete process.env.AEXOS_PRO_ARTIFACT_VERSION;
    const originalRead = fs.readFileSync;
    const originalExists = fs.existsSync;
    const fixtureRead = (filename, ...args) => {
      if (files.has(filename)) return files.get(filename);
      if (String(filename).startsWith(BUNDLED_PRO) || String(filename).startsWith(TARGET_PRO)) {
        throw new Error('Fixture file unavailable');
      }
      return originalRead(filename, ...args);
    };
    jest.spyOn(fs, 'readFileSync').mockImplementation(fixtureRead);
    jest.spyOn(fsExtra, 'readFileSync').mockImplementation(fixtureRead);
    jest.spyOn(fs, 'statSync').mockImplementation((filename) => {
      if (!files.has(filename) && !directories.has(filename)) throw new Error('Fixture entry unavailable');
      return { isFile: () => files.has(filename), isDirectory: () => directories.has(filename) };
    });
    jest.spyOn(fs, 'existsSync').mockImplementation((filename) => {
      if (filename === GITMODULES || String(filename).startsWith(BUNDLED_PRO) || String(filename).startsWith(TARGET_PRO)) {
        return files.has(filename) || directories.has(filename);
      }
      return originalExists(filename);
    });
    bootstrap = jest.spyOn(childProcess, 'execFileSync').mockImplementation(() => {
      throw new Error('Git unavailable in fixture');
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalVersion === undefined) delete process.env.AEXOS_PRO_ARTIFACT_VERSION;
    else process.env.AEXOS_PRO_ARTIFACT_VERSION = originalVersion;
  });

  test.each([
    ['scaffold', { scaffold: true, implemented: false }],
    ['implemented', { implemented: true }],
  ])('prefers the installed target over %s bundled content without invoking Git', (_, metadata) => {
    addPackage(BUNDLED_PRO, metadata);
    addPackage(TARGET_PRO);
    files.set(GITMODULES, 'fixture');
    expect(proSetup._testing.resolveProSourceDir(TARGET)).toEqual({ proSourceDir: TARGET_PRO });
    expect(bootstrap).not.toHaveBeenCalled();
  });

  test('uses implemented bundled content when no target is available', () => {
    addPackage(BUNDLED_PRO);
    expect(proSetup._testing.resolveProSourceDir(TARGET)).toEqual({ proSourceDir: BUNDLED_PRO });
    expect(bootstrap).not.toHaveBeenCalled();
  });

  test('retains compatibility with legacy metadata lacking maturity flags', () => {
    addPackage(TARGET_PRO);
    files.set(path.join(TARGET_PRO, 'package.json'), '{"name":"@aexos/pro","version":"0.4.2"}');
    expect(proSetup._testing.resolveProSourceDir(TARGET)).toEqual({ proSourceDir: TARGET_PRO });
  });

  test.each([
    ['explicit scaffold', (dir) => addPackage(dir, { scaffold: true })],
    ['explicit unimplemented', (dir) => addPackage(dir, { implemented: false })],
    ['invalid JSON', (dir) => files.set(path.join(dir, 'package.json'), '{broken')],
    ['missing metadata', (dir) => files.delete(path.join(dir, 'package.json'))],
    ['missing squads', (dir) => directories.delete(path.join(dir, 'squads'))],
    ['squads is a file', (dir) => { directories.delete(path.join(dir, 'squads')); files.set(path.join(dir, 'squads'), ''); }],
    ['missing config', (dir) => files.delete(path.join(dir, 'pro-config.yaml'))],
    ['config is a directory', (dir) => { files.delete(path.join(dir, 'pro-config.yaml')); directories.add(path.join(dir, 'pro-config.yaml')); }],
  ])('rejects %s in both target and bundled candidates', (_, invalidate) => {
    for (const directory of [TARGET_PRO, BUNDLED_PRO]) {
      addPackage(directory);
      invalidate(directory);
    }
    expect(proSetup._testing.resolveProSourceDir(TARGET)).toEqual({ proSourceDir: null });
    expect(bootstrap).not.toHaveBeenCalled();
  });

  test('falls back from an invalid target to implemented bundled content', () => {
    addPackage(TARGET_PRO, { implemented: false });
    addPackage(BUNDLED_PRO);
    expect(proSetup._testing.resolveProSourceDir(TARGET)).toEqual({ proSourceDir: BUNDLED_PRO });
  });

  test.each([
    null, [], 'package', false, 42, {},
    { name: '@other/package', version: '1.2.3' },
    { name: '@aexos/pro' },
    { name: '@aexos/pro', version: 123 },
    { name: '@aexos/pro', version: 'not-semver' },
    ...[null, [], false, 'metadata', { scaffold: 'true' }, { implemented: 'false' },
      { scaffold: 0 }, { implemented: 1 }].map((aexosPro) => ({
      name: '@aexos/pro', version: '1.2.3', aexosPro,
    })),
  ])('rejects malformed package metadata %j without selecting it', (metadata) => {
    for (const directory of [TARGET_PRO, BUNDLED_PRO]) {
      addPackage(directory);
      files.set(path.join(directory, 'package.json'), JSON.stringify(metadata));
    }
    expect(proSetup._testing.resolveProSourceDir(TARGET)).toEqual({ proSourceDir: null });
    expect(bootstrap).not.toHaveBeenCalled();
  });

  test('preserves the bootstrap diagnostic only when no usable source exists', () => {
    addPackage(BUNDLED_PRO, { scaffold: true });
    files.set(GITMODULES, 'fixture');
    expect(proSetup._testing.resolveProSourceDir(TARGET)).toEqual({
      proSourceDir: null, bootstrapError: 'Git unavailable in fixture',
    });
  });

  test.each([true, false])('revalidates content after successful Git bootstrap (implemented: %s)', (implemented) => {
    directories.add(BUNDLED_PRO);
    files.set(GITMODULES, 'fixture');
    bootstrap.mockImplementation(() => addPackage(BUNDLED_PRO, { implemented }));
    expect(proSetup._testing.resolveProSourceDir(TARGET)).toEqual({
      proSourceDir: implemented ? BUNDLED_PRO : null,
    });
    expect(bootstrap).toHaveBeenCalledTimes(1);
  });

  test('ignores the bundled scaffold version and retains the existing default', () => {
    addPackage(BUNDLED_PRO, { scaffold: true, implemented: false }, '0.0.0');
    expect(proSetup._testing.getProArtifactVersion()).toBe('0.4.2');
  });

  test('infers an implemented bundled version without caching stale metadata', () => {
    addPackage(BUNDLED_PRO, { implemented: true }, '1.2.3');
    expect(proSetup._testing.getProArtifactVersion()).toBe('1.2.3');
    addPackage(BUNDLED_PRO, { implemented: false }, '1.2.3');
    expect(proSetup._testing.getProArtifactVersion()).toBe('0.4.2');
  });

  test('retains legacy bundled version compatibility', () => {
    addPackage(BUNDLED_PRO);
    files.set(path.join(BUNDLED_PRO, 'package.json'), '{"name":"@aexos/pro","version":"0.3.0"}');
    expect(proSetup._testing.getProArtifactVersion()).toBe('0.3.0');
  });

  test('preserves explicit option then environment version precedence', () => {
    addPackage(BUNDLED_PRO, { implemented: true }, '1.2.3');
    process.env.AEXOS_PRO_ARTIFACT_VERSION = '2.0.0';
    expect(proSetup._testing.getProArtifactVersion({ proArtifactVersion: '3.0.0' })).toBe('3.0.0');
    expect(proSetup._testing.getProArtifactVersion()).toBe('2.0.0');
  });
});
