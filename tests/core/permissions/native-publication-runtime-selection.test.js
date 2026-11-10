'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const supportPath = path.resolve(__dirname, '../../../.aexos-core/core/permissions/native-publication-support.js');
const originalExists = fs.existsSync;

describe('fixed AEXOS native runtime selection', () => {
  let fixture, managed, cached, support;

  beforeEach(() => {
    fixture = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-runtime-selection-')));
    managed = path.join(fixture, '.aexos/runtimes/powershell/7.6.5/win-x64/pwsh.exe');
    cached = path.join(fixture, '.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe');
    for (const file of [managed, cached]) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, file === managed ? 'managed fixture' : 'cache fixture');
    }
    jest.resetModules();
    jest.spyOn(os, 'homedir').mockReturnValue(fixture);
    jest.spyOn(fs, 'existsSync').mockImplementation(file => file === 'C:\\Program Files\\PowerShell\\7\\pwsh.exe' ? false : originalExists(file));
    support = require(supportPath);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    const relative = path.relative(fs.realpathSync.native(os.tmpdir()), fixture);
    if (!relative.startsWith('aexos-runtime-selection-') || relative.includes(path.sep)) throw new Error('Fixture scope changed');
    fs.rmSync(fixture, { recursive: true, force: true });
  });

  test('prefers the fixed managed path over Program Files and Codex cache', () => {
    fs.existsSync.mockImplementation(file => file === 'C:\\Program Files\\PowerShell\\7\\pwsh.exe' || originalExists(file));
    expect(support.inspectNativeCandidateIdentity().executable).toBe(managed);
    expect(support.PRODUCTION_SUPPORT_ALLOWLIST).toEqual([]);
  });

  test('preserves cache fallback when the managed executable is absent', () => {
    fs.unlinkSync(managed);
    expect(support.inspectNativeCandidateIdentity().executable).toBe(cached);
  });

  test('rejects an invalid present managed executable without cache fallback', () => {
    fs.unlinkSync(managed);
    fs.mkdirSync(managed);
    expect(() => support.inspectNativeCandidateIdentity()).toThrow('UNTRUSTED_HELPER');
  });

  test('rejects a hardlinked managed executable', () => {
    fs.linkSync(managed, path.join(fixture, 'linked.exe'));
    expect(() => support.inspectNativeCandidateIdentity()).toThrow('UNTRUSTED_HELPER');
  });

  test('rejects a symbolic managed executable even when existence probing reports absence', () => {
    const lstat = fs.lstatSync;
    jest.spyOn(fs, 'lstatSync').mockImplementation((file, options) => file === managed
      ? { isFile: () => false, isSymbolicLink: () => true, nlink: 1 } : lstat(file, options));
    fs.existsSync.mockImplementation(file => file === managed ? false : originalExists(file));
    expect(() => support.inspectNativeCandidateIdentity()).toThrow('UNTRUSTED_HELPER');
  });

  test('rejects a junction or symlink ancestor without cache fallback', () => {
    const directory = path.dirname(managed);
    const actual = path.join(fixture, 'aliased-runtime');
    fs.renameSync(directory, actual);
    fs.symlinkSync(actual, directory, process.platform === 'win32' ? 'junction' : 'dir');
    expect(() => support.inspectNativeCandidateIdentity()).toThrow('UNTRUSTED_HELPER');
  });

  test('rejects a noncanonical managed executable path', () => {
    const realpath = fs.realpathSync.native;
    jest.spyOn(fs.realpathSync, 'native').mockImplementation(file => file === managed ? path.join(fixture, 'alias.exe') : realpath(file));
    expect(() => support.inspectNativeCandidateIdentity()).toThrow('UNTRUSTED_HELPER');
  });

  test('a changed selected executable hash invalidates the prior authorization identity', () => {
    const root = path.join(fixture, 'workspace');
    fs.mkdirSync(root);
    const identity = support.inspectNativeCandidateIdentity();
    const token = support.authorizeNativeCandidateValidation({ projectRoot: root,
      purpose: 'candidate-validation', expectedIdentity: identity });
    expect(support.verifyNativeCandidateAuthorization(token, root, identity)).toBeNull();
    fs.writeFileSync(managed, 'changed managed runtime');
    const changed = support.inspectNativeCandidateIdentity();
    expect(changed.hashes.executableSha256).not.toBe(identity.hashes.executableSha256);
    expect(support.verifyNativeCandidateAuthorization(token, root, changed)).toBe('VALIDATION_IDENTITY_MISMATCH');
  });

  test('environment and request fields cannot select another executable', () => {
    const keys = ['AEXOS_POWERSHELL_PATH', 'AEXOS_NATIVE_EXECUTABLE', 'POWERSHELL_EXE', 'PATH'];
    const previous = keys.map(key => process.env[key]);
    try {
      for (const key of keys) process.env[key] = cached;
      expect(support.inspectNativeCandidateIdentity({ executable: cached, runtimePath: cached }).executable).toBe(managed);
    } finally {
      keys.forEach((key, index) => {
        if (previous[index] === undefined) delete process.env[key];
        else process.env[key] = previous[index];
      });
    }
  });
});
