'use strict';

const fs = require('fs-extra');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const tar = require('tar');
const {
  CYRYXUpdater,
  formatUpdateResult,
  resolveNpmInvocation,
} = require('../../packages/installer/src/updater');

function sha256(content) {
  return `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
}

function createUpdater(projectRoot, options = {}) {
  return new CYRYXUpdater(projectRoot, {
    reconcileDependencies: false,
    ...options,
  });
}

async function writeFixture(root) {
  await fs.outputFile(path.join(root, '.aexos-core', 'runtime', 'engine.js'), 'old-runtime');
  await fs.outputFile(path.join(root, '.aexos-core', 'core-config.yaml'), 'owner: customized');
  await fs.outputFile(path.join(root, '.aexos-core', 'owner-notes.md'), 'keep-me');
  await fs.writeJson(path.join(root, 'package.json'), {
    dependencies: { '@aexos/core': '1.0.0', other: '1.0.0' },
  });
  await fs.writeJson(path.join(root, 'package-lock.json'), {
    lockfileVersion: 3,
    packages: { '': { dependencies: { '@aexos/core': '1.0.0' } } },
  });
  await fs.outputFile(
    path.join(root, 'node_modules', '@aexos', 'core', 'package.json'),
    JSON.stringify({ name: '@aexos/core', version: '1.0.0' }),
  );
  await fs.outputFile(
    path.join(root, 'node_modules', '@aexos', 'core', 'runtime.js'),
    'old-package-runtime',
  );
  await fs.outputFile(path.join(root, 'node_modules', 'other', 'index.js'), 'old-other');
}

describe('updater recovery parity', () => {
  let projectRoot;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aexos-updater-recovery-'));
    await writeFixture(projectRoot);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.remove(projectRoot);
  });

  test('retains the durable recovery state when its atomic replacement fails', async () => {
    const updater = createUpdater(projectRoot);
    await updater.createBackup();
    const statePath = path.join(updater.backupDir, 'backup-state.json');
    const before = await fs.readFile(statePath);
    jest.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('state replacement denied'));
    await expect(updater.updateBackupState({ phase: 'installing-package' })).rejects.toThrow('state replacement denied');
    expect((await fs.readFile(statePath)).equals(before)).toBe(true);
    expect((await fs.readdir(updater.backupDir)).some(name => name.includes('.tmp-'))).toBe(false);
  });

  test('rejects a package that npm leaves at a version different from the requested update', async () => {
    const updater = createUpdater(projectRoot);
    jest.spyOn(updater, 'runNpm').mockImplementation(() => {});
    const result = await updater.applyUpdate('2.0.0', [], { packageSpecifier: 'fixture.tgz' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('identity/version does not match');
    expect(await fs.readFile(path.join(projectRoot, '.aexos-core/runtime/engine.js'), 'utf8')).toBe('old-runtime');
  });

  test('restores changed framework, customization, manifests, and installed core package', async () => {
    const updater = createUpdater(projectRoot);
    await updater.createBackup();

    await fs.writeFile(path.join(projectRoot, '.aexos-core', 'runtime', 'engine.js'), 'new-runtime');
    await fs.writeFile(path.join(projectRoot, '.aexos-core', 'core-config.yaml'), 'owner: overwritten');
    await fs.outputFile(path.join(projectRoot, '.aexos-core', 'created-after-backup.md'), 'user-file');
    await fs.writeJson(path.join(projectRoot, 'package.json'), {
      dependencies: { '@aexos/core': '2.0.0', other: '2.0.0' },
    });
    await fs.writeJson(path.join(projectRoot, 'package-lock.json'), { lockfileVersion: 3, changed: true });
    await fs.writeJson(path.join(projectRoot, 'node_modules', '@aexos', 'core', 'package.json'), {
      name: '@aexos/core', version: '2.0.0',
    });
    await fs.outputFile(
      path.join(projectRoot, 'node_modules', '@aexos', 'core', 'new-only.js'),
      'remove-with-new-package',
    );
    await fs.writeFile(path.join(projectRoot, 'node_modules', 'other', 'index.js'), 'changed-other');
    await fs.outputFile(path.join(projectRoot, 'user-project-file.txt'), 'untouched');

    const recovery = await updater.rollback();

    await expect(fs.readFile(path.join(projectRoot, '.aexos-core', 'runtime', 'engine.js'), 'utf8'))
      .resolves.toBe('old-runtime');
    await expect(fs.readFile(path.join(projectRoot, '.aexos-core', 'core-config.yaml'), 'utf8'))
      .resolves.toBe('owner: customized');
    await expect(fs.readFile(path.join(projectRoot, '.aexos-core', 'owner-notes.md'), 'utf8'))
      .resolves.toBe('keep-me');
    await expect(fs.readFile(path.join(projectRoot, '.aexos-core', 'created-after-backup.md'), 'utf8'))
      .resolves.toBe('user-file');
    await expect(fs.readFile(path.join(projectRoot, 'user-project-file.txt'), 'utf8'))
      .resolves.toBe('untouched');
    await expect(fs.readJson(path.join(projectRoot, 'package.json')))
      .resolves.toMatchObject({ dependencies: { '@aexos/core': '1.0.0', other: '1.0.0' } });
    await expect(fs.readJson(path.join(projectRoot, 'package-lock.json')))
      .resolves.not.toHaveProperty('changed');
    await expect(fs.readJson(path.join(projectRoot, 'node_modules', '@aexos', 'core', 'package.json')))
      .resolves.toMatchObject({ version: '1.0.0' });
    expect(await fs.pathExists(path.join(projectRoot, 'node_modules', '@aexos', 'core', 'new-only.js')))
      .toBe(false);
    await expect(fs.readFile(path.join(projectRoot, 'node_modules', 'other', 'index.js'), 'utf8'))
      .resolves.toBe('changed-other');
    expect(recovery).toEqual(expect.objectContaining({
      frameworkRestored: true,
      projectManifestsRestored: true,
      corePackagesRestored: true,
      dependenciesRestored: false,
      dependencyReinstallRequired: true,
    }));
  });

  test('removes only updater-owned manifests and core package names absent before update', async () => {
    await fs.remove(path.join(projectRoot, 'package-lock.json'));
    const updater = createUpdater(projectRoot);
    await updater.createBackup();

    await fs.writeJson(path.join(projectRoot, 'package-lock.json'), { createdByUpdate: true });
    await fs.outputFile(
      path.join(projectRoot, 'node_modules', 'aexos-core', 'package.json'),
      JSON.stringify({ name: 'aexos-core', version: '2.0.0' }),
    );
    await fs.outputFile(path.join(projectRoot, 'unrelated.txt'), 'preserved');

    await updater.rollback();

    expect(await fs.pathExists(path.join(projectRoot, 'package-lock.json'))).toBe(false);
    expect(await fs.pathExists(path.join(projectRoot, 'node_modules', 'aexos-core'))).toBe(false);
    await expect(fs.readFile(path.join(projectRoot, 'unrelated.txt'), 'utf8'))
      .resolves.toBe('preserved');
  });

  test('removes only unchanged journaled framework additions and installed manifest', async () => {
    const updater = createUpdater(projectRoot);
    await updater.createBackup();
    const newRuntime = path.join(projectRoot, '.aexos-core', 'runtime', 'new-module.js');
    const changedRuntime = path.join(projectRoot, '.aexos-core', 'runtime', 'changed-by-user.js');
    const installedManifest = path.join(projectRoot, '.aexos-core', '.installed-manifest.yaml');
    await fs.writeFile(newRuntime, 'failed-update-module');
    await fs.writeFile(changedRuntime, 'failed-update-content');
    await fs.writeFile(installedManifest, 'failed installed manifest');
    await updater.journalFrameworkAdditions([
      { path: 'runtime/new-module.js', hash: sha256('failed-update-module') },
      { path: 'runtime/changed-by-user.js', hash: sha256('failed-update-content') },
      { path: '.installed-manifest.yaml', hash: sha256('failed installed manifest') },
    ]);
    await fs.writeFile(changedRuntime, 'user-changed-after-update');
    await fs.outputFile(path.join(projectRoot, '.aexos-core', 'user-created.md'), 'user-owned');

    const recovery = await updater.rollback();

    expect(await fs.pathExists(newRuntime)).toBe(false);
    expect(await fs.pathExists(installedManifest)).toBe(false);
    await expect(fs.readFile(changedRuntime, 'utf8')).resolves.toBe('user-changed-after-update');
    await expect(fs.readFile(path.join(projectRoot, '.aexos-core', 'user-created.md'), 'utf8'))
      .resolves.toBe('user-owned');
    expect(recovery).toMatchObject({
      frameworkRestored: false,
      frameworkAdditionsRemoved: 2,
      frameworkAdditionsPreserved: 1,
    });
  });

  test('handles an absent pre-update framework without deleting later user files', async () => {
    await fs.remove(path.join(projectRoot, '.aexos-core'));
    const updater = createUpdater(projectRoot);
    await updater.createBackup();
    const updateFile = path.join(projectRoot, '.aexos-core', 'runtime', 'new-module.js');
    await fs.outputFile(updateFile, 'failed-update-module');
    await updater.journalFrameworkAdditions([
      { path: 'runtime/new-module.js', hash: sha256('failed-update-module') },
    ]);
    await fs.outputFile(path.join(projectRoot, '.aexos-core', 'user-created.md'), 'user-owned');

    const recovery = await updater.rollback();

    expect(await fs.pathExists(updateFile)).toBe(false);
    await expect(fs.readFile(path.join(projectRoot, '.aexos-core', 'user-created.md'), 'utf8'))
      .resolves.toBe('user-owned');
    expect(recovery).toMatchObject({
      frameworkRestored: true,
      frameworkPreviouslyExisted: false,
      frameworkAdditionsRemoved: 1,
    });
  });

  test('rejects a backup outside the fixed project backup root', async () => {
    const updater = createUpdater(projectRoot);
    updater.backupDir = path.join(projectRoot, 'attacker-controlled-backup');
    await fs.ensureDir(updater.backupDir);

    await expect(updater.rollback()).rejects.toThrow('outside the updater backup root');
  });

  test('rejects symlinks in a backup before changing project files', async () => {
    const updater = createUpdater(projectRoot);
    await updater.createBackup();
    const runtimeSnapshot = path.join(updater.backupDir, 'framework', 'runtime');
    const external = path.join(projectRoot, 'external-runtime');
    await fs.remove(runtimeSnapshot);
    await fs.outputFile(path.join(external, 'engine.js'), 'attacker-runtime');
    await fs.symlink(external, runtimeSnapshot, 'junction');
    await fs.writeFile(path.join(projectRoot, '.aexos-core', 'runtime', 'engine.js'), 'changed');

    await expect(updater.rollback()).rejects.toThrow('symbolic link');
    await expect(fs.readFile(path.join(projectRoot, '.aexos-core', 'runtime', 'engine.js'), 'utf8'))
      .resolves.toBe('changed');
  });

  test('rejects dangling destination symlinks before restoring any file', async () => {
    const updater = createUpdater(projectRoot);
    await updater.createBackup();
    const runtimePath = path.join(projectRoot, '.aexos-core', 'runtime', 'engine.js');
    await fs.remove(runtimePath);
    await fs.symlink(path.join(projectRoot, 'missing-external.js'), runtimePath, 'file');
    await fs.writeJson(path.join(projectRoot, 'package.json'), { changed: true });

    await expect(updater.rollback()).rejects.toThrow('symbolic link');
    await expect(fs.readJson(path.join(projectRoot, 'package.json')))
      .resolves.toEqual({ changed: true });
  });

  test('uses node plus npm-cli.js on Windows without a command shell', () => {
    const npmCli = path.win32.join('C:\\', 'Program Files', 'nodejs', 'node_modules', 'npm', 'bin', 'npm-cli.js');
    const invocation = resolveNpmInvocation({
      platform: 'win32',
      execPath: path.win32.join('C:\\', 'runtime', 'node.exe'),
      env: { PATH: path.win32.join('C:\\', 'Program Files', 'nodejs') },
      fileExists: (candidate) => candidate === npmCli,
    });

    expect(invocation).toEqual({
      command: path.win32.join('C:\\', 'runtime', 'node.exe'),
      prefixArgs: [npmCli],
    });
    expect(invocation).not.toHaveProperty('execOptions.shell');
  });

  test('a new process discovers an interrupted update and reconciles the restored lockfile', async () => {
    const interrupted = createUpdater(projectRoot);
    await interrupted.createBackup();
    await interrupted.updateBackupState({ phase: 'installing-package', targetVersion: '2.0.0' });
    await fs.writeFile(path.join(projectRoot, '.aexos-core', 'runtime', 'engine.js'), 'new-runtime');
    await fs.writeFile(path.join(projectRoot, 'node_modules', 'other', 'index.js'), 'new-other');

    const npmExec = jest.fn((_command, args) => {
      expect(args).toEqual(expect.arrayContaining(['ci', '--no-audit', '--no-fund']));
      fs.outputFileSync(path.join(projectRoot, 'node_modules', 'other', 'index.js'), 'old-other');
    });
    const restarted = createUpdater(projectRoot, {
      reconcileDependencies: true,
      execFileSync: npmExec,
      npmInvocation: { command: process.execPath, prefixArgs: ['npm-cli.js'] },
    });

    const recovery = await restarted.recoverInterruptedUpdate();

    expect(recovery).toMatchObject({
      recovered: true,
      complete: true,
      frameworkRestored: true,
      dependenciesRestored: true,
      dependencyCommand: 'ci',
    });
    expect(npmExec).toHaveBeenCalledTimes(1);
    await expect(fs.readFile(path.join(projectRoot, '.aexos-core', 'runtime', 'engine.js'), 'utf8'))
      .resolves.toBe('old-runtime');
    await expect(fs.readFile(path.join(projectRoot, 'node_modules', 'other', 'index.js'), 'utf8'))
      .resolves.toBe('old-other');
    expect(await fs.pathExists(interrupted.backupDir)).toBe(false);
  });

  test('real offline npm ci restores dependencies before restoring customized core-package bytes', async () => {
    const fixtureDir = path.join(projectRoot, 'local-package');
    await fs.outputJson(path.join(fixtureDir, 'package', 'package.json'), {
      name: '@aexos/core', version: '1.0.0',
    });
    await fs.outputFile(path.join(fixtureDir, 'package', 'runtime.js'), 'published-runtime');
    const archive = path.join(fixtureDir, 'core.tgz');
    await tar.c({ cwd: fixtureDir, file: archive, gzip: true }, ['package']);
    await fs.writeJson(path.join(projectRoot, 'package.json'), {
      private: true, dependencies: { '@aexos/core': 'file:./local-package/core.tgz' },
    });
    await fs.remove(path.join(projectRoot, 'package-lock.json'));
    await fs.remove(path.join(projectRoot, 'node_modules'));
    const npmConfig = path.join(projectRoot, 'fixture.npmrc');
    await fs.writeFile(npmConfig, '');
    const invocation = resolveNpmInvocation();
    invocation.prefixArgs = [...invocation.prefixArgs, '--offline', '--ignore-scripts',
      '--userconfig', npmConfig, '--cache', path.join(projectRoot, 'npm-cache')];
    execFileSync(invocation.command, [...invocation.prefixArgs, 'install', '--no-audit', '--no-fund'], {
      cwd: projectRoot, stdio: 'pipe', timeout: 30000,
    });
    const coreRoot = path.join(projectRoot, 'node_modules/@aexos/core');
    await fs.writeFile(path.join(coreRoot, 'runtime.js'), 'owner-customized-runtime');
    await fs.outputFile(path.join(coreRoot, 'extensions/owner.js'), 'owner-extension');
    const lockBefore = await fs.readFile(path.join(projectRoot, 'package-lock.json'));
    const updater = createUpdater(projectRoot, { reconcileDependencies: true, npmInvocation: invocation });
    await updater.createBackup();
    await fs.writeFile(path.join(coreRoot, 'runtime.js'), 'failed-update-runtime');
    await fs.remove(path.join(coreRoot, 'extensions'));

    const recovery = await updater.rollback();

    expect(recovery).toMatchObject({ complete: true, corePackagesRestored: true, dependencyCommand: 'ci' });
    expect(await fs.readFile(path.join(coreRoot, 'runtime.js'), 'utf8')).toBe('owner-customized-runtime');
    expect(await fs.readFile(path.join(coreRoot, 'extensions/owner.js'), 'utf8')).toBe('owner-extension');
    expect((await fs.readFile(path.join(projectRoot, 'package-lock.json'))).equals(lockBefore)).toBe(true);
  }, 60000);

  test('dry-run of an interrupted update preserves the entire tree and never invokes npm', async () => {
    const updater = createUpdater(projectRoot);
    await updater.createBackup();
    await updater.updateBackupState({ phase: 'applying-framework' });
    await fs.writeFile(path.join(projectRoot, '.aexos-core/runtime/engine.js'), 'interrupted-runtime');
    const inventory = async (directory) => {
      const entries = {};
      for (const name of (await fs.readdir(directory)).sort()) {
        const file = path.join(directory, name);
        entries[name] = (await fs.lstat(file)).isDirectory()
          ? await inventory(file) : sha256(await fs.readFile(file));
      }
      return entries;
    };
    const before = await inventory(projectRoot);
    const npm = jest.fn(() => { throw new Error('Dry run invoked npm'); });
    const restarted = createUpdater(projectRoot, { execFileSync: npm });

    const result = await restarted.update({ dryRun: true });

    expect(result).toMatchObject({ success: true, dryRun: true, recoveryRequired: true,
      preview: { action: 'recover-interrupted-update', phase: 'applying-framework' } });
    expect(npm).not.toHaveBeenCalled();
    expect(await inventory(projectRoot)).toEqual(before);
  });

  test('process exit during snapshot copying leaves diagnostic staging without blocking the next backup', async () => {
    const child = spawnSync(process.execPath, ['-e', `
      const fs = require(${JSON.stringify(require.resolve('fs-extra'))});
      const copy = fs.copyFile.bind(fs);
      fs.copyFile = async (...args) => { await copy(...args); process.exit(73); };
      const { CYRYXUpdater } = require(${JSON.stringify(require.resolve('../../packages/installer/src/updater'))});
      new CYRYXUpdater(process.argv[1]).createBackup().catch(error => { console.error(error); process.exit(1); });
    `, projectRoot], { encoding: 'utf8', timeout: 30000 });
    expect(child.status).toBe(73);
    const updater = createUpdater(projectRoot);
    const backupRoot = path.join(updater.cyryxConfigDir, 'backup');
    const staged = (await fs.readdir(backupRoot)).filter(name => name.startsWith('.incomplete-pre-update-'));
    expect(staged).toHaveLength(1);
    expect(await fs.readdir(path.join(backupRoot, staged[0], 'framework'))).not.toHaveLength(0);
    expect(await updater.findInterruptedUpdate()).toBeNull();
    await updater.createBackup();
    expect(await updater.findInterruptedUpdate()).toMatchObject({ backupDir: updater.backupDir,
      state: { phase: 'prepared' } });
    expect(await fs.pathExists(path.join(backupRoot, staged[0]))).toBe(true);
    expect(await fs.readFile(path.join(projectRoot, '.aexos-core/runtime/engine.js'), 'utf8')).toBe('old-runtime');
  });

  test('reports dependency reconciliation failure without claiming complete recovery', async () => {
    const updater = createUpdater(projectRoot, {
      reconcileDependencies: true,
      execFileSync: () => {
        throw new Error('offline cache miss');
      },
      npmInvocation: { command: process.execPath, prefixArgs: ['npm-cli.js'] },
    });
    await updater.createBackup();

    const recovery = await updater.rollback();

    expect(recovery).toMatchObject({
      complete: false,
      frameworkRestored: true,
      dependenciesRestored: false,
      dependencyReinstallRequired: true,
      dependencyError: 'offline cache miss',
    });
  });

  test('accepts only exact expected customization issues during post-update validation', async () => {
    const sourceRoot = path.join(projectRoot, 'current-package');
    const sourceCore = path.join(sourceRoot, '.aexos-core');
    const expectedContent = 'new-runtime';
    await fs.outputFile(
      path.join(sourceCore, 'runtime', 'engine.js'),
      expectedContent,
    );
    await fs.outputFile(
      path.join(sourceCore, 'install-manifest.yaml'),
      [
        'version: 2.0.0',
        'files:',
        '  - path: runtime/engine.js',
        `    hash: ${sha256(expectedContent)}`,
        `    size: ${Buffer.byteLength(expectedContent)}`,
        '    type: core',
        '',
      ].join('\n'),
    );
    const updater = createUpdater(projectRoot);
    const preserved = { path: 'runtime/engine.js', sha256: sha256('old-runtime').slice(7),
      size: Buffer.byteLength('old-runtime') };

    const expected = await updater.validateAfterUpdate({
      sourceDir: sourceRoot,
      expectedPreservedFiles: [preserved],
    });
    const unexpected = await updater.validateAfterUpdate({ sourceDir: sourceRoot });

    expect(expected).toMatchObject({ success: true, issues: [] });
    expect(expected.preservedIssues).toEqual([
      expect.objectContaining({
        type: 'CORRUPTED_FILE',
        relativePath: 'runtime/engine.js',
      }),
    ]);
    expect(unexpected).toMatchObject({
      success: false,
      preservedIssues: [],
      issues: [expect.objectContaining({ type: 'CORRUPTED_FILE' })],
    });
    // Same-size corruption, truncation, and replacement with upstream bytes all
    // violate preservation, even if the upstream validator itself is satisfied.
    for (const damaged of ['bad-runtime', '', expectedContent]) {
      await fs.writeFile(path.join(projectRoot, '.aexos-core/runtime/engine.js'), damaged);
      const result = await updater.validateAfterUpdate({ sourceDir: sourceRoot,
        expectedPreservedFiles: [preserved] });
      expect(result.success).toBe(false);
      expect(result.preservedIssues).toEqual([]);
      expect(result.issues).toContainEqual(expect.objectContaining({ type: 'PRESERVATION_MISMATCH' }));
    }
    const pathOnly = await updater.validateAfterUpdate({ sourceDir: sourceRoot,
      expectedPreservedFiles: ['runtime/engine.js'] });
    expect(pathOnly.success).toBe(false);
    expect(pathOnly.error).toContain('pre-update SHA256 and size');
  });

  test('keeps the update failure and rollback failure visible together', async () => {
    const updater = createUpdater(projectRoot);
    jest.spyOn(updater, 'checkForUpdates').mockResolvedValue({
      hasUpdate: true,
      installed: '1.0.0',
      latest: '2.0.0',
    });
    jest.spyOn(updater, 'createBackup').mockResolvedValue();
    jest.spyOn(updater, 'detectCustomizations').mockResolvedValue({ customized: [] });
    jest.spyOn(updater, 'applyUpdate').mockResolvedValue({
      success: false,
      error: 'package install failed',
    });
    jest.spyOn(updater, 'rollback').mockRejectedValue(new Error('snapshot rejected'));

    const result = await updater.update();

    expect(result.error).toBe('package install failed (rollback failed: snapshot rejected)');
    expect(result.rollback).toBeNull();
  });

  test('persists the version journal before creating previously absent metadata', async () => {
    await fs.remove(path.join(projectRoot, '.aexos-core', 'version.json'));
    const updater = createUpdater(projectRoot);
    await updater.createBackup();
    jest.spyOn(updater, 'journalFrameworkAdditions').mockRejectedValue(new Error('journal full'));

    await expect(updater.updateVersionInfo('2.0.0')).rejects.toThrow('journal full');
    expect(await fs.pathExists(path.join(projectRoot, '.aexos-core', 'version.json'))).toBe(false);
  });

  test('persists the installed-manifest journal before creating metadata', async () => {
    const updater = createUpdater(projectRoot);
    await updater.createBackup();
    jest.spyOn(updater, 'journalFrameworkAdditions').mockRejectedValue(new Error('journal full'));

    await expect(updater.writeInstalledManifest({ version: '2.0.0', files: [] }, '2.0.0'))
      .rejects.toThrow('journal full');
    expect(
      await fs.pathExists(path.join(projectRoot, '.aexos-core', '.installed-manifest.yaml')),
    ).toBe(false);
  });

  test('marks recovery incomplete when a metadata write fails after partial bytes', async () => {
    const updater = createUpdater(projectRoot);
    await updater.createBackup();
    const destination = path.join(projectRoot, '.aexos-core', '.installed-manifest.yaml');
    const outputSpy = jest.spyOn(fs, 'outputFile').mockImplementationOnce(async (file) => {
      await fs.writeFile(file, 'partial metadata', 'utf8');
      throw new Error('disk full');
    });

    await expect(updater.writeInstalledManifest({ version: '2.0.0', files: [] }, '2.0.0'))
      .rejects.toThrow('disk full');
    outputSpy.mockRestore();
    const recovery = await updater.rollback();

    await expect(fs.readFile(destination, 'utf8')).resolves.toBe('partial metadata');
    expect(recovery).toMatchObject({
      frameworkRestored: false,
      frameworkAdditionsPreserved: 1,
    });
  });

  test('formats incomplete framework recovery separately from dependency reconciliation', () => {
    const output = formatUpdateResult({
      success: false,
      error: 'update failed',
      rollbackAvailable: true,
      rollback: {
        frameworkRestored: false,
        frameworkAdditionsPreserved: 2,
        dependencyReinstallRequired: true,
      },
    }, { colors: false });

    expect(output).toContain('Rollback incomplete: 2 changed update-created framework file(s)');
    expect(output).toContain('Dependencies were not restored; run npm install');
    expect(output).not.toContain('Framework, manifests, and core package restored');
  });

  test('does not claim successful rollback when changed update additions remain', async () => {
    const updater = createUpdater(projectRoot);
    jest.spyOn(updater, 'checkForUpdates').mockResolvedValue({
      hasUpdate: true,
      installed: '1.0.0',
      latest: '2.0.0',
    });
    jest.spyOn(updater, 'createBackup').mockResolvedValue();
    jest.spyOn(updater, 'detectCustomizations').mockRejectedValue(new Error('detection failed'));
    jest.spyOn(updater, 'rollback').mockResolvedValue({
      frameworkRestored: false,
      frameworkAdditionsPreserved: 1,
      dependencyReinstallRequired: true,
    });

    const result = await updater.update();

    expect(result.error).toContain('rollback incomplete: 1 changed update-created framework file');
    expect(result.error).not.toContain('core package rolled back');
  });
});
