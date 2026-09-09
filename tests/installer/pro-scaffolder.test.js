/**
 * Pro Content Scaffolder Tests
 *
 * @story INS-3.1 — Implement Pro Content Scaffolder
 */

'use strict';

const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const yaml = require('js-yaml');

const {
  scaffoldProContent,
  scaffoldFile,
  installSquadCommands,
  rollbackScaffold,
  generateProVersionJson,
  generateInstalledManifest,
  SCAFFOLD_ITEMS,
} = require('../../packages/installer/src/pro/pro-scaffolder');

// Create isolated temp dirs for each test
let tmpDir;
let targetDir;
let proSourceDir;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pro-scaffolder-'));
  targetDir = path.join(tmpDir, 'project');
  proSourceDir = path.join(tmpDir, 'pro-package');

  // Create target project structure
  await fs.ensureDir(path.join(targetDir, '.aexos-core'));

  // Create mock pro source package
  await fs.ensureDir(path.join(proSourceDir, 'squads', 'devops-squad'));
  await fs.writeFile(
    path.join(proSourceDir, 'squads', 'devops-squad', 'squad.yaml'),
    yaml.dump({ name: 'devops-squad', version: '1.0.0' }),
  );
  await fs.writeFile(
    path.join(proSourceDir, 'pro-config.yaml'),
    yaml.dump({ pro: { enabled: true, tier: 'standard' } }),
  );
  await fs.writeFile(
    path.join(proSourceDir, 'feature-registry.yaml'),
    yaml.dump({ features: [{ id: 'squads-pro', enabled: true }] }),
  );
  await fs.writeJson(
    path.join(proSourceDir, 'package.json'),
    { name: '@aexos/pro', version: '2.0.0' },
  );
});

afterEach(async () => {
  jest.restoreAllMocks();
  await fs.remove(tmpDir);
});

describe('scaffoldProContent', () => {
  it('keeps its rollback journal until the final cache callback succeeds', async () => {
    const config = path.join(targetDir, '.aexos-core', 'pro-config.yaml');
    await fs.writeFile(config, 'original user config');
    const beforeCommit = jest.fn(async () => {
      expect(await fs.pathExists(path.join(targetDir, 'pro-version.json'))).toBe(true);
      throw new Error('late cache failure');
    });
    const result = await scaffoldProContent(targetDir, proSourceDir, { force: true, beforeCommit });
    expect(beforeCommit).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.errors).toContain('late cache failure');
    expect(await fs.readFile(config, 'utf8')).toBe('original user config');
    expect(await fs.pathExists(path.join(targetDir, 'pro-version.json'))).toBe(false);
    expect(await fs.pathExists(path.join(targetDir, 'pro-installed-manifest.yaml'))).toBe(false);
  });

  // AC1, AC2, AC3: Copies squads, pro-config.yaml, feature-registry.yaml
  it('should copy all pro content to project (AC1, AC2, AC3)', async () => {
    const result = await scaffoldProContent(targetDir, proSourceDir);

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);

    // AC1: squads exist
    expect(await fs.pathExists(
      path.join(targetDir, 'squads', 'devops-squad', 'squad.yaml'),
    )).toBe(true);

    // AC2: pro-config.yaml exists in .aexos-core/
    expect(await fs.pathExists(
      path.join(targetDir, '.aexos-core', 'pro-config.yaml'),
    )).toBe(true);

    // AC3: feature-registry.yaml exists in .aexos-core/
    expect(await fs.pathExists(
      path.join(targetDir, '.aexos-core', 'feature-registry.yaml'),
    )).toBe(true);
  });

  // AC4: pro-version.json with SHA256 hashes
  it('should generate pro-version.json with SHA256 hashes (AC4)', async () => {
    const result = await scaffoldProContent(targetDir, proSourceDir);

    expect(result.success).toBe(true);

    const versionPath = path.join(targetDir, 'pro-version.json');
    expect(await fs.pathExists(versionPath)).toBe(true);

    const versionInfo = await fs.readJson(versionPath);
    expect(versionInfo.proVersion).toBe('2.0.0');
    expect(versionInfo.installedAt).toBeDefined();
    expect(versionInfo.fileHashes).toBeDefined();

    // Verify at least one hash is sha256 format
    const hashes = Object.values(versionInfo.fileHashes);
    expect(hashes.length).toBeGreaterThan(0);
    for (const hash of hashes) {
      expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
  });

  // AC5: Idempotency - running 2x does not duplicate
  it('should be idempotent: 2nd run skips identical files (AC5)', async () => {
    // First run
    const result1 = await scaffoldProContent(targetDir, proSourceDir);
    expect(result1.success).toBe(true);
    const copiedCount1 = result1.copiedFiles.length;

    // Second run
    const result2 = await scaffoldProContent(targetDir, proSourceDir);
    expect(result2.success).toBe(true);

    // On second run, content files should be skipped (identical hashes)
    expect(result2.skippedFiles.length).toBeGreaterThan(0);

    // Verify file content is still correct (not corrupted)
    const configContent = yaml.load(
      await fs.readFile(path.join(targetDir, '.aexos-core', 'pro-config.yaml'), 'utf8'),
    );
    expect(configContent.pro.enabled).toBe(true);
  });

  it('preserves user-modified content on repeated scaffolding unless force is explicit', async () => {
    const relativePath = 'squads/devops-squad/README.md';
    await fs.writeFile(path.join(proSourceDir, relativePath), 'Publisher content\n');
    expect((await scaffoldProContent(targetDir, proSourceDir)).success).toBe(true);
    await fs.writeFile(path.join(targetDir, relativePath), 'User-owned notes\n');

    const repeated = await scaffoldProContent(targetDir, proSourceDir);
    expect(repeated.success).toBe(true);
    expect(repeated.skippedFiles).toContain(relativePath);
    expect(await fs.readFile(path.join(targetDir, relativePath), 'utf8')).toBe('User-owned notes\n');

    const forced = await scaffoldProContent(targetDir, proSourceDir, { force: true });
    expect(forced.success).toBe(true);
    expect(await fs.readFile(path.join(targetDir, relativePath), 'utf8')).toBe('Publisher content\n');
  });

  // AC6: Cleanup on partial failure
  it('should rollback partially copied files on error (AC6)', async () => {
    // Remove pro-config.yaml from source — squads (processed first) will copy
    // successfully, then pro-config.yaml (required) will fail, triggering rollback
    await fs.remove(path.join(proSourceDir, 'pro-config.yaml'));

    const result = await scaffoldProContent(targetDir, proSourceDir);

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.warnings.some(w => w.includes('Scaffolding failed'))).toBe(true);

    // Verify rollback: squads copied before failure should be cleaned up
    expect(await fs.pathExists(
      path.join(targetDir, 'squads', 'devops-squad', 'squad.yaml'),
    )).toBe(false);

    // pro-version.json and pro-installed-manifest.yaml should not exist
    expect(await fs.pathExists(path.join(targetDir, 'pro-version.json'))).toBe(false);
    expect(await fs.pathExists(path.join(targetDir, 'pro-installed-manifest.yaml'))).toBe(false);
  });

  // AC7: Offline fallback - no network calls
  it('should work without network connectivity (AC7)', async () => {
    // scaffoldProContent makes NO network calls - it only uses local filesystem
    // This test verifies the function succeeds without any mocked APIs
    const result = await scaffoldProContent(targetDir, proSourceDir);

    expect(result.success).toBe(true);
    // The function signature takes no API client, no network options
    // This confirms offline-by-design
  });

  // AC8: pro-installed-manifest.yaml
  it('should generate pro-installed-manifest.yaml with timestamps (AC8)', async () => {
    const result = await scaffoldProContent(targetDir, proSourceDir);

    expect(result.success).toBe(true);

    const manifestPath = path.join(targetDir, 'pro-installed-manifest.yaml');
    expect(await fs.pathExists(manifestPath)).toBe(true);

    const manifest = yaml.load(await fs.readFile(manifestPath, 'utf8'));
    expect(manifest.generatedAt).toBeDefined();
    expect(manifest.totalFiles).toBeGreaterThan(0);
    expect(manifest.files).toBeInstanceOf(Array);
    expect(manifest.files.length).toBe(manifest.totalFiles);

    for (const file of manifest.files) {
      expect(file.path).toBeDefined();
      expect(file.timestamp).toBeDefined();
    }
  });

  // AC3: Warning when feature-registry.yaml absent
  it('should emit warning when feature-registry.yaml is absent in source (AC3)', async () => {
    // Remove feature-registry.yaml from source
    await fs.remove(path.join(proSourceDir, 'feature-registry.yaml'));

    const result = await scaffoldProContent(targetDir, proSourceDir);

    // Should still succeed (feature-registry is not required)
    expect(result.success).toBe(true);
    expect(result.warnings.some(w => w.includes('Feature registry'))).toBe(true);
  });

  it('should return error when pro source directory does not exist', async () => {
    const fakePath = path.join(tmpDir, 'nonexistent-pro-dir');
    const result = await scaffoldProContent(targetDir, fakePath);

    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('Pro package not found');
  });

  it('should call onProgress callback for each scaffold item', async () => {
    const progress = [];
    await scaffoldProContent(targetDir, proSourceDir, {
      onProgress: (p) => progress.push(p),
    });

    expect(progress.length).toBeGreaterThan(0);
    expect(progress.some(p => p.status === 'done')).toBe(true);
  });

  it('should link framework dependencies so copied squad scripts resolve js-yaml', async () => {
    await fs.ensureDir(path.join(targetDir, '.aexos-core', 'node_modules', 'js-yaml'));
    await fs.writeFile(
      path.join(targetDir, '.aexos-core', 'node_modules', 'js-yaml', 'index.js'),
      'module.exports = { ok: true };\n',
    );
    await fs.ensureDir(path.join(proSourceDir, 'squads', 'devops-squad', 'scripts'));
    await fs.writeFile(
      path.join(proSourceDir, 'squads', 'devops-squad', 'scripts', 'uses-yaml.js'),
      "require('js-yaml');\n",
    );

    const result = await scaffoldProContent(targetDir, proSourceDir);

    expect(result.success).toBe(true);
    expect(result.dependencyResolution.linked).toBe(true);
    expect(await fs.realpath(path.join(targetDir, 'node_modules'))).toBe(
      await fs.realpath(path.join(targetDir, '.aexos-core', 'node_modules')),
    );

    const resolved = require.resolve('js-yaml', {
      paths: [path.join(targetDir, 'squads', 'devops-squad', 'scripts')],
    });
    expect(resolved).toContain(path.join('js-yaml', 'index.js'));
  });
});

describe('preservation and projection ownership', () => {
  it('restores user content, host projection, config and both receipts after a late forced failure', async () => {
    const sourceAgent = path.join(proSourceDir, 'squads', 'devops-squad', 'agents', 'lead.md');
    await fs.outputFile(sourceAgent, 'Publisher agent\n');
    await fs.outputFile(path.join(proSourceDir, 'squads', 'devops-squad', 'agents', 'new-agent.md'), 'New agent\n');
    const originals = new Map([
      ['squads/devops-squad/agents/lead.md', 'User squad agent\n'],
      ['.codex/agents/lead.md', 'User host agent\n'],
      ['.aexos-core/core-config.yaml', '# Keep my comments\nproject: mine\n'],
      ['pro-version.json', '{"previous":"version"}\n'],
      ['pro-installed-manifest.yaml', '# Previous receipt\nfiles: []\n'],
    ]);
    for (const [relative, content] of originals) await fs.outputFile(path.join(targetDir, relative), content);
    const underlyingDependency = path.join(targetDir, '.aexos-core', 'node_modules', 'js-yaml', 'index.js');
    await fs.outputFile(underlyingDependency, 'module.exports = {};\n');
    const originalMode = (await fs.stat(path.join(targetDir, '.codex/agents/lead.md'))).mode;
    const manifestPath = path.join(targetDir, 'pro-installed-manifest.yaml');
    const write = fs.writeFile.bind(fs);
    let failed = false;
    jest.spyOn(fs, 'writeFile').mockImplementation(async (filename, ...args) => {
      const result = await write(filename, ...args);
      if (filename === manifestPath && !failed) {
        failed = true;
        throw new Error('Injected late receipt failure');
      }
      return result;
    });

    const result = await scaffoldProContent(targetDir, proSourceDir, { force: true });
    expect(result.success).toBe(false);
    expect(result.errors).toContain('Injected late receipt failure');
    for (const [relative, content] of originals) {
      expect(await fs.readFile(path.join(targetDir, relative), 'utf8')).toBe(content);
    }
    expect((await fs.stat(path.join(targetDir, '.codex/agents/lead.md'))).mode).toBe(originalMode);
    expect(await fs.pathExists(path.join(targetDir, '.codex/agents/new-agent.md'))).toBe(false);
    expect(await fs.pathExists(path.join(targetDir, 'node_modules'))).toBe(false);
    expect(await fs.readFile(underlyingDependency, 'utf8')).toBe('module.exports = {};\n');
  });

  it('does not delete another writer file when exclusive creation loses a race', async () => {
    const contested = path.join(targetDir, 'squads', 'devops-squad', 'squad.yaml');
    const originalCopy = fs.copyFile.bind(fs);
    jest.spyOn(fs, 'copyFile').mockImplementation(async (source, destination, ...args) => {
      if (destination === contested) {
        await fs.writeFile(contested, 'Other writer owns this\n');
      }
      return originalCopy(source, destination, ...args);
    });
    const result = await scaffoldProContent(targetDir, proSourceDir);
    expect(result.success).toBe(false);
    expect(await fs.readFile(contested, 'utf8')).toBe('Other writer owns this\n');
  });

  it('removes new receipts after a late write failure while preserving unrelated files', async () => {
    const sentinel = path.join(targetDir, 'user-notes.txt');
    await fs.writeFile(sentinel, 'Keep unrelated notes\n');
    const write = fs.writeFile.bind(fs);
    jest.spyOn(fs, 'writeFile').mockImplementation(async (filename, content, ...args) => {
      const result = await write(filename, content, ...args);
      if (typeof filename === 'number' && String(content).includes('totalFiles:')) {
        throw new Error('New manifest failed after writing');
      }
      return result;
    });
    const result = await scaffoldProContent(targetDir, proSourceDir);
    expect(result.success).toBe(false);
    expect(result.errors).toContain('New manifest failed after writing');
    expect(await fs.pathExists(path.join(targetDir, 'pro-version.json'))).toBe(false);
    expect(await fs.pathExists(path.join(targetDir, 'pro-installed-manifest.yaml'))).toBe(false);
    expect(await fs.readFile(sentinel, 'utf8')).toBe('Keep unrelated notes\n');
  });

  it('aborts a forced write when the original snapshot cannot be read', async () => {
    const destination = path.join(targetDir, 'squads', 'devops-squad', 'squad.yaml');
    await fs.outputFile(destination, 'Original unreadable fixture\n');
    const read = fs.readFile.bind(fs);
    const spy = jest.spyOn(fs, 'readFile').mockImplementation((filename, ...args) => {
      if (filename === destination) return Promise.reject(new Error('Snapshot unavailable'));
      return read(filename, ...args);
    });
    const result = await scaffoldProContent(targetDir, proSourceDir, { force: true });
    expect(result.success).toBe(false);
    expect(result.errors).toContain('Snapshot unavailable');
    spy.mockRestore();
    expect(await fs.readFile(destination, 'utf8')).toBe('Original unreadable fixture\n');
  });

  it('rejects a linked destination ancestor without writing outside the project', async () => {
    const outside = path.join(tmpDir, 'outside');
    await fs.ensureDir(outside);
    await fs.symlink(outside, path.join(targetDir, 'squads'), 'junction');
    const result = await scaffoldProContent(targetDir, proSourceDir, { force: true });
    expect(result.success).toBe(false);
    expect(await fs.readdir(outside)).toEqual([]);
  });

  it('preserves non-regular destinations by default and rejects forced overwrite', async () => {
    const destination = path.join(targetDir, 'directory-config');
    await fs.ensureDir(destination);
    const source = path.join(proSourceDir, 'pro-config.yaml');
    expect((await scaffoldFile(source, destination, { baseDir: targetDir })).skipped).toBe(true);
    await expect(scaffoldFile(source, destination, { baseDir: targetDir, force: true })).rejects.toThrow('non-regular');
    expect((await fs.lstat(destination)).isDirectory()).toBe(true);
  });

  it('preserves a dangling destination link and rejects forced replacement', async () => {
    const destination = path.join(targetDir, 'dangling-link');
    await fs.symlink(path.join(tmpDir, 'missing-link-target'), destination, 'junction');
    const source = path.join(proSourceDir, 'pro-config.yaml');
    expect((await scaffoldFile(source, destination, { baseDir: targetDir })).skipped).toBe(true);
    await expect(scaffoldFile(source, destination, { baseDir: targetDir, force: true })).rejects.toThrow('non-regular');
    expect((await fs.lstat(destination)).isSymbolicLink()).toBe(true);
  });

  it('rejects linked source content without copying it', async () => {
    const outside = path.join(tmpDir, 'external-source');
    await fs.outputFile(path.join(outside, 'private.txt'), 'Not nominated content\n');
    await fs.symlink(outside, path.join(proSourceDir, 'squads', 'linked-squad'), 'junction');
    const result = await scaffoldProContent(targetDir, proSourceDir);
    expect(result.success).toBe(false);
    expect(await fs.pathExists(path.join(targetDir, 'squads', 'linked-squad', 'private.txt'))).toBe(false);
    expect(await fs.readFile(path.join(outside, 'private.txt'), 'utf8')).toBe('Not nominated content\n');
  });

  it('preserves existing content without requiring a readable hash', async () => {
    const source = path.join(proSourceDir, 'pro-config.yaml');
    const destination = path.join(targetDir, 'user-config.yaml');
    await fs.writeFile(destination, 'User-owned configuration\n');
    const read = jest.spyOn(fs, 'readFile').mockRejectedValue(new Error('Unreadable for hashing'));
    const rollbackFiles = [];
    const result = await scaffoldFile(source, destination, { rollbackFiles, baseDir: targetDir });
    expect(result.skipped).toBe(true);
    expect(read).not.toHaveBeenCalled();
    expect(rollbackFiles).toEqual([]);
    read.mockRestore();
    expect(await fs.readFile(destination, 'utf8')).toBe('User-owned configuration\n');
  });

  it('does not assign deletion rollback ownership to force-overwritten user files', async () => {
    const source = path.join(proSourceDir, 'pro-config.yaml');
    const destination = path.join(targetDir, 'user-config.yaml');
    await fs.writeFile(destination, 'User-owned configuration\n');
    const rollbackFiles = [];
    await scaffoldFile(source, destination, { force: true, rollbackFiles, baseDir: targetDir });
    expect(rollbackFiles).toEqual([]);
    await rollbackScaffold(rollbackFiles);
    expect(await fs.pathExists(destination)).toBe(true);
  });

  it.each([
    ['.claude/commands/devops-squad', '.claude/commands'],
    ['.codex/agents', '.codex/agents'],
    ['.gemini/rules/devops-squad', '.gemini/rules'],
    ['.cursor/rules', '.cursor/rules'],
  ])('preserves user agents in %s and tracks only newly created projections', async (destinationDir, activeDir) => {
    const agentsDir = path.join(targetDir, 'squads', 'devops-squad', 'agents');
    await fs.ensureDir(agentsDir);
    await fs.ensureDir(path.join(targetDir, activeDir));
    await fs.ensureDir(path.join(targetDir, destinationDir));
    await fs.writeFile(path.join(agentsDir, 'lead.md'), 'Publisher agent\n');
    await fs.writeFile(path.join(agentsDir, 'new-agent.md'), 'New agent\n');
    const userAgent = path.join(targetDir, destinationDir, 'lead.md');
    await fs.writeFile(userAgent, 'User-owned agent\n');
    const rollbackFiles = [];

    const result = await installSquadCommands(targetDir, { rollbackFiles });
    expect(result.installed).toBe(1);
    expect(result.skippedFiles).toContain(`${destinationDir}/lead.md`);
    expect(await fs.readFile(userAgent, 'utf8')).toBe('User-owned agent\n');
    expect(rollbackFiles).toEqual([path.join(targetDir, destinationDir, 'new-agent.md')]);
    await rollbackScaffold(rollbackFiles);
    expect(await fs.pathExists(rollbackFiles[0])).toBe(false);
    expect(await fs.readFile(userAgent, 'utf8')).toBe('User-owned agent\n');

    const forced = await installSquadCommands(targetDir, { force: true });
    expect(forced.installed).toBe(2);
    expect(await fs.readFile(userAgent, 'utf8')).toBe('Publisher agent\n');
  });
});

describe('rollbackScaffold', () => {
  it('should remove all tracked files', async () => {
    const file1 = path.join(tmpDir, 'rollback-test-1.txt');
    const file2 = path.join(tmpDir, 'rollback-test-2.txt');
    await fs.writeFile(file1, 'test1');
    await fs.writeFile(file2, 'test2');

    const result = await rollbackScaffold([file1, file2]);

    expect(result.removed).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(await fs.pathExists(file1)).toBe(false);
    expect(await fs.pathExists(file2)).toBe(false);
  });

  it('should handle already-deleted files gracefully', async () => {
    const result = await rollbackScaffold(['/nonexistent/file.txt']);

    expect(result.removed).toBe(0);
    expect(result.errors).toHaveLength(0);
  });
});

describe('generateProVersionJson', () => {
  it('should generate correct version info with hashes', async () => {
    const testFile = path.join(targetDir, 'test.yaml');
    await fs.writeFile(testFile, 'test: true');

    const versionInfo = await generateProVersionJson(
      targetDir,
      proSourceDir,
      ['test.yaml'],
    );

    expect(versionInfo.proVersion).toBe('2.0.0');
    expect(versionInfo.fileCount).toBe(1);
    expect(versionInfo.fileHashes['test.yaml']).toMatch(/^sha256:/);
  });
});

describe('generateInstalledManifest', () => {
  it('should list all files with timestamps', async () => {
    const testFile = path.join(targetDir, 'manifest-test.yaml');
    await fs.writeFile(testFile, 'content');

    const manifest = await generateInstalledManifest(
      targetDir,
      ['manifest-test.yaml'],
    );

    expect(manifest.totalFiles).toBe(1);
    expect(manifest.files[0].path).toBe('manifest-test.yaml');
    expect(manifest.files[0].timestamp).toBeDefined();
  });
});
