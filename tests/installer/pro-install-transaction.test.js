'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createProInstallTransaction } = require(path.resolve(__dirname, '..', '..', 'packages', 'installer', 'src', 'utils', 'pro-install-transaction.js'));
const proSetup = require(path.resolve(__dirname, '..', '..', 'packages', 'installer', 'src', 'wizard', 'pro-setup.js'));

let root;
let target;
let modules;
let cache;

async function write(filename, value) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, value);
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'aexos-pro-transaction-'));
  target = path.join(root, 'project & literal');
  modules = path.join(target, 'node_modules');
  cache = path.join(target, '.aexos', 'license.cache');
  await write(path.join(modules, '@aexos', 'pro', 'version.txt'), 'v1');
  await write(path.join(modules, 'unrelated', 'sentinel'), 'user dependency');
  await write(path.join(target, 'package.json'), '{"private":true}');
  await write(path.join(target, 'package-lock.json'), '{"lockfileVersion":3}');
  await write(cache, 'old cache');
});

afterEach(async () => {
  jest.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

async function mutateRuntime() {
  await write(path.join(modules, '@aexos', 'pro', 'version.txt'), 'v2');
  await fs.rm(path.join(modules, 'unrelated'), { recursive: true });
  await write(path.join(modules, 'new-dependency', 'index.js'), 'module.exports = 2;');
  await write(path.join(target, 'package.json'), 'npm partial write');
}

async function assertOriginal() {
  expect(await fs.readFile(path.join(modules, '@aexos', 'pro', 'version.txt'), 'utf8')).toBe('v1');
  expect(await fs.readFile(path.join(modules, 'unrelated', 'sentinel'), 'utf8')).toBe('user dependency');
  await expect(fs.stat(path.join(modules, 'new-dependency'))).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await fs.readFile(path.join(target, 'package.json'), 'utf8')).toBe('{"private":true}');
  expect(await fs.readFile(path.join(target, 'package-lock.json'), 'utf8')).toBe('{"lockfileVersion":3}');
  expect(await fs.readFile(cache, 'utf8')).toBe('old cache');
}

test('restores complete dependency tree and narrow snapshots after a late partial cache failure', async () => {
  const transaction = await createProInstallTransaction(target);
  await transaction.installRuntime(mutateRuntime);
  await write(cache, 'partial new cache');
  await transaction.rollback();
  await transaction.rollback();
  await assertOriginal();
  expect(transaction.state).toBe('rolled-back');
});

test('restores partial npm writes before returning a failure for verified-source fallback', async () => {
  const transaction = await createProInstallTransaction(target);
  await expect(transaction.installRuntime(async () => {
    await mutateRuntime();
    throw new Error('npm failed');
  })).rejects.toThrow('npm failed');
  await assertOriginal();
  await write(cache, 'new content cache');
  await transaction.commit();
  expect(await fs.readFile(cache, 'utf8')).toBe('new content cache');
  expect(await fs.readFile(path.join(modules, '@aexos', 'pro', 'version.txt'), 'utf8')).toBe('v1');
});

test('commits actual new runtime and resolved dependencies without modifying target manifests', async () => {
  const transaction = await createProInstallTransaction(target);
  await transaction.installRuntime(mutateRuntime);
  await write(cache, 'new cache');
  expect(await transaction.commit()).toBeNull();
  await transaction.rollback();
  expect(await fs.readFile(path.join(modules, '@aexos', 'pro', 'version.txt'), 'utf8')).toBe('v2');
  expect(await fs.readFile(path.join(modules, 'new-dependency', 'index.js'), 'utf8')).toBe('module.exports = 2;');
  expect(await fs.readFile(path.join(target, 'package.json'), 'utf8')).toBe('{"private":true}');
  expect(await fs.readFile(cache, 'utf8')).toBe('new cache');
  expect((await fs.readdir(target)).filter((name) => name.startsWith('.aexos-pro-'))).toEqual([]);
});

test('removes only new dependencies and cache when no prior installation existed', async () => {
  await fs.rm(modules, { recursive: true });
  await fs.rm(cache);
  const transaction = await createProInstallTransaction(target);
  await transaction.installRuntime(() => write(path.join(modules, '@aexos', 'pro', 'version.txt'), 'v2'));
  await write(cache, 'partial');
  await transaction.rollback();
  await expect(fs.stat(modules)).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(fs.stat(cache)).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await fs.readFile(path.join(target, 'package.json'), 'utf8')).toBe('{"private":true}');
});

test('serializes installation ownership without deleting another installer lock', async () => {
  const first = await createProInstallTransaction(target);
  await expect(createProInstallTransaction(target)).rejects.toThrow('Cannot acquire');
  expect((await fs.stat(path.join(target, '.aexos-pro-install.lock'))).isDirectory()).toBe(true);
  await first.rollback();
});

test.each(['root', 'dependency'])('refuses an outside %s link before npm while retaining verified-source fallback', async (kind) => {
  const outside = path.join(root, 'outside');
  await write(path.join(outside, 'sentinel'), 'untouched');
  if (kind === 'root') await fs.rm(modules, { recursive: true });
  await fs.symlink(outside, kind === 'root' ? modules : path.join(modules, 'outside-link'), 'junction');
  const transaction = await createProInstallTransaction(target);
  const install = jest.fn();
  await expect(transaction.installRuntime(install)).rejects.toThrow(/link/i);
  expect(install).not.toHaveBeenCalled();
  await transaction.rollback();
  expect(await fs.readFile(path.join(outside, 'sentinel'), 'utf8')).toBe('untouched');
});

test('rejects a linked license destination before snapshots or writes', async () => {
  const outside = path.join(root, 'outside-cache');
  await write(path.join(outside, 'license.cache'), 'untouched');
  await fs.rm(path.dirname(cache), { recursive: true });
  await fs.symlink(outside, path.dirname(cache), 'junction');
  await expect(createProInstallTransaction(target)).rejects.toThrow('Linked Pro installation');
  expect(await fs.readFile(path.join(outside, 'license.cache'), 'utf8')).toBe('untouched');
});

test('refuses an unsupported cache write domain', async () => {
  const transaction = await createProInstallTransaction(target);
  for (const filename of [null, '', '.aexos/license.cache', path.join(root, 'elsewhere')]) {
    await expect(transaction.validateCachePath(filename)).rejects.toThrow('unsupported destination');
  }
  await transaction.validateCachePath(cache);
  await transaction.rollback();
});

test('does not invoke npm if the dependency backup fails', async () => {
  const transaction = await createProInstallTransaction(target);
  jest.spyOn(fs, 'cp').mockRejectedValueOnce(new Error('disk full'));
  const install = jest.fn();
  await expect(transaction.installRuntime(install)).rejects.toThrow('disk full');
  expect(install).not.toHaveBeenCalled();
  await transaction.rollback();
  await assertOriginal();
});

test('retains backup and surfaces restore failure; retry restores the previous runtime', async () => {
  const transaction = await createProInstallTransaction(target);
  await transaction.installRuntime(mutateRuntime);
  jest.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('locked destination'));
  await expect(transaction.rollback()).rejects.toThrow('backup retained');
  expect(transaction.state).toBe('rollback-failed');
  expect((await fs.readdir(target)).some((name) => name.startsWith('.aexos-pro-backup-'))).toBe(true);
  await expect(transaction.commit()).rejects.toThrow('rollback-failed');
  await transaction.rollback();
  await assertOriginal();
});

test('post-commit cleanup failure warns and never rolls back the successful update', async () => {
  const transaction = await createProInstallTransaction(target);
  await transaction.installRuntime(mutateRuntime);
  jest.spyOn(fs, 'rm').mockRejectedValueOnce(new Error('backup busy'));
  expect(await transaction.commit()).toMatch(/installed; backup cleanup incomplete/);
  await transaction.rollback();
  expect(transaction.state).toBe('committed');
  expect(await fs.readFile(path.join(modules, '@aexos', 'pro', 'version.txt'), 'utf8')).toBe('v2');
});

describe('real scaffold and wizard transaction coordination', () => {
  async function prepareAcquisition() {
    const source = path.join(root, 'verified-source');
    await write(path.join(source, 'package.json'), '{"name":"@aexos/pro","version":"2.0.0"}');
    await write(path.join(source, 'squads', 'example', 'squad.yaml'), 'name: example\nversion: 2.0.0\n');
    await write(path.join(source, 'pro-config.yaml'), 'pro:\n  enabled: true\n');
    await write(path.join(target, '.aexos-core', 'pro-config.yaml'), 'pro:\n  enabled: false\n');
    const transaction = await createProInstallTransaction(target);
    await transaction.installRuntime(mutateRuntime);
    jest.spyOn(proSetup._testing, 'acquireProArtifactSourceDir').mockResolvedValue({
      success: true, proSourceDir: source, transaction,
      installedProSourceDir: path.join(modules, '@aexos', 'pro'),
    });
    return { source, transaction };
  }

  test.each(['failure', 'throw', 'partial', 'success'])('coordinates %s from the final license cache write', async (outcome) => {
    const { transaction } = await prepareAcquisition();
    const getCachePath = jest.fn(() => cache);
    const writeLicenseCache = jest.fn(() => {
      if (outcome === 'throw') throw new Error('cache exception');
      if (outcome === 'partial' || outcome === 'success') {
        require('node:fs').writeFileSync(cache, outcome === 'success' ? 'new cache' : 'partial cache');
      }
      return { success: outcome === 'success', error: 'cache failure' };
    });
    jest.spyOn(proSetup._testing, 'loadLicenseCache').mockReturnValue({ getCachePath, writeLicenseCache });
    const result = await proSetup.stepInstallScaffold(target, {
      refreshArtifact: true, force: true, licenseResult: { key: 'fixture-only' },
    });
    expect(getCachePath).toHaveBeenCalledTimes(1);
    expect(writeLicenseCache).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(outcome === 'success');
    if (outcome === 'success') {
      expect(transaction.state).toBe('committed');
      expect(await fs.readFile(path.join(modules, '@aexos', 'pro', 'version.txt'), 'utf8')).toBe('v2');
      expect(JSON.parse(await fs.readFile(path.join(target, 'pro-version.json'), 'utf8')).proVersion).toBe('2.0.0');
      expect(await fs.readFile(cache, 'utf8')).toBe('new cache');
    } else {
      await assertOriginal();
      expect(await fs.readFile(path.join(target, '.aexos-core', 'pro-config.yaml'), 'utf8')).toBe('pro:\n  enabled: false\n');
      await expect(fs.stat(path.join(target, 'pro-version.json'))).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(fs.stat(path.join(target, 'squads', 'example', 'squad.yaml'))).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });

  test('rejects unknown cache writer paths before invocation and restores provisional runtime', async () => {
    await prepareAcquisition();
    const writeLicenseCache = jest.fn();
    jest.spyOn(proSetup._testing, 'loadLicenseCache').mockReturnValue({
      getCachePath: () => path.join(root, 'outside-cache'), writeLicenseCache,
    });
    const result = await proSetup.stepInstallScaffold(target, {
      refreshArtifact: true, licenseResult: { key: 'fixture-only' },
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unsupported destination/);
    expect(writeLicenseCache).not.toHaveBeenCalled();
    await assertOriginal();
  });

  test.each(['return', 'throw'])('redacts cache %s diagnostics from results and rendered output', async (mode) => {
    await prepareAcquisition();
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const error = 'Cache unavailable fixture-access-secret Bearer fixture-bearer https://user:pass@example.test/path?token=fixture-query\u001b[31m';
    jest.spyOn(proSetup._testing, 'loadLicenseCache').mockReturnValue({
      getCachePath: () => cache,
      writeLicenseCache: () => {
        if (mode === 'throw') throw new Error(error);
        return { success: false, error };
      },
    });
    const result = await proSetup.stepInstallScaffold(target, {
      refreshArtifact: true, licenseResult: { key: 'fixture-only', accessToken: 'fixture-access-secret' },
    });
    expect(result.success).toBe(false);
    const output = JSON.stringify({ result, stdout: log.mock.calls, stderr: stderr.mock.calls });
    for (const secret of ['fixture-access-secret', 'fixture-bearer', 'fixture-query', 'user:pass']) {
      expect(output).not.toContain(secret);
    }
    expect(result.error).toContain('Cache unavailable');
    expect(result.error).not.toContain('\u001b');
    await assertOriginal();
  });

  test('never treats an acquisition path alone as permission to delete an existing runtime', async () => {
    jest.spyOn(proSetup._testing, 'acquireProArtifactSourceDir').mockResolvedValue({
      success: true, proSourceDir: path.join(modules, '@aexos', 'pro'),
      installedProSourceDir: path.join(modules, '@aexos', 'pro'),
    });
    const result = await proSetup.stepInstallScaffold(target, {
      refreshArtifact: true, licenseResult: { key: 'existing', reactivation: true },
    });
    expect(result.success).toBe(false);
    await assertOriginal();
  });
});
