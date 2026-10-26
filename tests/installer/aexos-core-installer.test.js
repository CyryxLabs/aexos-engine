/**
 * AEXOS Core Installer Tests
 *
 * @story Story 7.2: Version Tracking
 */

const path = require('path');
const fs = require('fs-extra');
const os = require('os');

const {
  installCyryxCore,
  ensureProjectNodeModulesLink,
  copyDirectoryWithRootReplacement,
  generateFileHashes,
  generateVersionJson,
  _testing,
} = require('../../packages/installer/src/installer/aexos-core-installer');

describe('AEXOS Core Installer - Version Tracking', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aexos-installer-test-'));
    await fs.ensureDir(path.join(tempDir, '.aexos-core'));
  });

  afterEach(async () => {
    if (tempDir && fs.existsSync(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  describe('core dependency installation', () => {
    it('anchors npm to .aexos-core with argv-safe production-only flags', async () => {
      const targetCyryxCore = path.join(tempDir, 'project with spaces & literals', '.aexos-core');
      const execute = jest.fn().mockResolvedValue({ stdout: '', stderr: '' });
      const resolveInvocation = jest.fn().mockReturnValue({
        command: process.execPath,
        prefixArgs: ['C:\\npm path\\npm-cli.js'],
        execOptions: {},
      });

      await _testing.installCoreDependencies(targetCyryxCore, {
        resolveNpmInvocation: resolveInvocation,
        execFileAsync: execute,
      });

      expect(resolveInvocation).toHaveBeenCalledTimes(1);
      expect(execute).toHaveBeenCalledWith(
        process.execPath,
        [
          'C:\\npm path\\npm-cli.js',
          'install',
          '--prefix',
          targetCyryxCore,
          '--omit=dev',
          '--ignore-scripts',
          '--workspaces=false',
          '--include-workspace-root=false',
          '--no-audit',
          '--no-fund',
        ],
        expect.objectContaining({
          cwd: targetCyryxCore,
          timeout: 60000,
          windowsHide: true,
        }),
      );
    });

    it('propagates npm failure so the installer retains a false dependency outcome', async () => {
      const failure = new Error('bounded npm failure');
      await expect(_testing.installCoreDependencies('C:\\target\\.aexos-core', {
        resolveNpmInvocation: () => ({ command: 'node', prefixArgs: ['npm-cli.js'], execOptions: {} }),
        execFileAsync: jest.fn().mockRejectedValue(failure),
      })).rejects.toBe(failure);
    });
  });

  describe('generateFileHashes', () => {
    it('should generate hashes for installed files', async () => {
      const cyryxCoreDir = path.join(tempDir, '.aexos-core');

      // Create test files
      await fs.writeFile(path.join(cyryxCoreDir, 'test1.md'), '# Test File 1');
      await fs.writeFile(path.join(cyryxCoreDir, 'test2.md'), '# Test File 2');
      await fs.ensureDir(path.join(cyryxCoreDir, 'agents'));
      await fs.writeFile(path.join(cyryxCoreDir, 'agents', 'dev.md'), '# Dev Agent');

      const installedFiles = ['test1.md', 'test2.md', 'agents/dev.md'];
      const hashes = await generateFileHashes(cyryxCoreDir, installedFiles);

      expect(Object.keys(hashes)).toHaveLength(3);
      expect(hashes['test1.md']).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(hashes['test2.md']).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(hashes['agents/dev.md']).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it('should skip non-existent files', async () => {
      const cyryxCoreDir = path.join(tempDir, '.aexos-core');

      // Create only one file
      await fs.writeFile(path.join(cyryxCoreDir, 'exists.md'), '# Exists');

      const installedFiles = ['exists.md', 'does-not-exist.md'];
      const hashes = await generateFileHashes(cyryxCoreDir, installedFiles);

      expect(Object.keys(hashes)).toHaveLength(1);
      expect(hashes['exists.md']).toBeDefined();
      expect(hashes['does-not-exist.md']).toBeUndefined();
    });

    it('should skip directories', async () => {
      const cyryxCoreDir = path.join(tempDir, '.aexos-core');

      await fs.ensureDir(path.join(cyryxCoreDir, 'agents'));
      await fs.writeFile(path.join(cyryxCoreDir, 'file.md'), '# File');

      const installedFiles = ['file.md', 'agents'];
      const hashes = await generateFileHashes(cyryxCoreDir, installedFiles);

      expect(Object.keys(hashes)).toHaveLength(1);
      expect(hashes['file.md']).toBeDefined();
      expect(hashes['agents']).toBeUndefined();
    });

    it('should generate consistent hashes for same content', async () => {
      const cyryxCoreDir = path.join(tempDir, '.aexos-core');

      await fs.writeFile(path.join(cyryxCoreDir, 'file1.md'), 'Same content');
      await fs.writeFile(path.join(cyryxCoreDir, 'file2.md'), 'Same content');

      const installedFiles = ['file1.md', 'file2.md'];
      const hashes = await generateFileHashes(cyryxCoreDir, installedFiles);

      expect(hashes['file1.md']).toBe(hashes['file2.md']);
    });

    it('should generate different hashes for different content', async () => {
      const cyryxCoreDir = path.join(tempDir, '.aexos-core');

      await fs.writeFile(path.join(cyryxCoreDir, 'file1.md'), 'Content A');
      await fs.writeFile(path.join(cyryxCoreDir, 'file2.md'), 'Content B');

      const installedFiles = ['file1.md', 'file2.md'];
      const hashes = await generateFileHashes(cyryxCoreDir, installedFiles);

      expect(hashes['file1.md']).not.toBe(hashes['file2.md']);
    });
  });

  describe('generateVersionJson', () => {
    it('should create version.json with correct structure', async () => {
      const cyryxCoreDir = path.join(tempDir, '.aexos-core');

      // Create test files
      await fs.writeFile(path.join(cyryxCoreDir, 'test.md'), '# Test');

      const result = await generateVersionJson({
        targetCyryxCore: cyryxCoreDir,
        version: '1.2.0',
        installedFiles: ['test.md'],
        mode: 'project-development',
      });

      expect(result.version).toBe('1.2.0');
      expect(result.mode).toBe('project-development');
      expect(result.installedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(result.fileHashes).toBeDefined();
      expect(result.fileHashes['test.md']).toMatch(/^sha256:/);
      expect(result.customized).toEqual([]);
    });

    it('should write version.json to disk', async () => {
      const cyryxCoreDir = path.join(tempDir, '.aexos-core');

      await fs.writeFile(path.join(cyryxCoreDir, 'agent.md'), '# Agent');

      await generateVersionJson({
        targetCyryxCore: cyryxCoreDir,
        version: '2.0.0',
        installedFiles: ['agent.md'],
        mode: 'framework-development',
      });

      const versionJsonPath = path.join(cyryxCoreDir, 'version.json');
      expect(fs.existsSync(versionJsonPath)).toBe(true);

      const versionJson = await fs.readJson(versionJsonPath);
      expect(versionJson.version).toBe('2.0.0');
      expect(versionJson.mode).toBe('framework-development');
    });

    it('should use default mode when not specified', async () => {
      const cyryxCoreDir = path.join(tempDir, '.aexos-core');

      const result = await generateVersionJson({
        targetCyryxCore: cyryxCoreDir,
        version: '1.0.0',
        installedFiles: [],
      });

      expect(result.mode).toBe('project-development');
    });

    it('should include file hashes in version.json', async () => {
      const cyryxCoreDir = path.join(tempDir, '.aexos-core');

      await fs.ensureDir(path.join(cyryxCoreDir, 'agents'));
      await fs.writeFile(path.join(cyryxCoreDir, 'agents', 'dev.md'), '# Dev');
      await fs.writeFile(path.join(cyryxCoreDir, 'config.yaml'), 'key: value');

      const result = await generateVersionJson({
        targetCyryxCore: cyryxCoreDir,
        version: '1.0.0',
        installedFiles: ['agents/dev.md', 'config.yaml'],
      });

      expect(Object.keys(result.fileHashes)).toHaveLength(2);
      expect(result.fileHashes['agents/dev.md']).toBeDefined();
      expect(result.fileHashes['config.yaml']).toBeDefined();
    });
  });

  describe('brownfield preservation', () => {
    it('should keep nested relative paths when copying directories', async () => {
      const sourceDir = path.join(tempDir, 'source', 'development');
      const destDir = path.join(tempDir, 'target', '.aexos-core', 'development');

      await fs.ensureDir(path.join(sourceDir, 'agents'));
      await fs.writeFile(path.join(sourceDir, 'agents', 'dev.md'), '# Dev');

      const copied = await copyDirectoryWithRootReplacement(sourceDir, destDir, null, {
        baseDir: destDir,
      });

      expect(copied).toContain('agents/dev.md');
    });

    it('should preserve agent MEMORY.md during brownfield install', async () => {
      const sourceDir = path.join(tempDir, 'package-source');
      const targetDir = path.join(tempDir, 'project');
      const existingMemoryPath = path.join(
        targetDir,
        '.aexos-core',
        'development',
        'agents',
        'dev',
        'MEMORY.md',
      );

      await fs.ensureDir(path.join(sourceDir, 'development', 'agents', 'dev'));
      await fs.writeFile(
        path.join(sourceDir, 'development', 'agents', 'dev', 'MEMORY.md'),
        'framework memory',
        'utf8',
      );

      await fs.ensureDir(path.dirname(existingMemoryPath));
      await fs.writeFile(existingMemoryPath, 'custom project memory', 'utf8');

      const result = await installCyryxCore({
        targetDir,
        sourceDir,
        projectType: 'brownfield',
        packageVersion: '9.9.9',
      });

      expect(result.success).toBe(true);
      expect(await fs.readFile(existingMemoryPath, 'utf8')).toBe('custom project memory');
    });

    it('should install the complete project-local Virtual Office scene footprint', async () => {
      const sourceDir = path.join(tempDir, 'package-source');
      const targetDir = path.join(tempDir, 'project');
      const officeSource = path.join(sourceDir, 'core', 'virtual-office', 'public');
      await fs.ensureDir(path.join(officeSource, 'assets'));
      await fs.writeFile(path.join(officeSource, 'index.html'), '<main>Office</main>', 'utf8');
      await fs.writeFile(path.join(officeSource, 'scene-manifest.js'), 'window.SCENE = {};', 'utf8');
      await fs.writeFile(path.join(officeSource, 'app.js'), 'window.APP = {};', 'utf8');
      await fs.writeFile(
        path.join(officeSource, 'assets', 'cyryx-agent-identity-a-v5.png'),
        Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      );
      await fs.writeFile(
        path.join(officeSource, 'assets', 'cyryx-campus-command-hall-v1.png'),
        Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      );
      await fs.writeFile(
        path.join(officeSource, 'assets', 'cyryx-labs-official-lockup-v1.png'),
        Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      );
      await fs.writeFile(
        path.join(officeSource, 'assets', 'paulo-petruff-ceo-standing-v1.png'),
        Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      );
      await fs.writeFile(
        path.join(officeSource, 'assets', 'paulo-petruff-ceo-workstation-v1.png'),
        Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      );

      const result = await installCyryxCore({
        targetDir,
        sourceDir,
        projectType: 'greenfield',
        packageVersion: '9.9.9',
      });

      const installedOffice = path.join(
        targetDir,
        '.aexos-core',
        'core',
        'virtual-office',
        'public',
      );
      expect(result.success).toBe(true);
      expect(await fs.pathExists(path.join(installedOffice, 'index.html'))).toBe(true);
      expect(await fs.pathExists(path.join(installedOffice, 'scene-manifest.js'))).toBe(true);
      expect(await fs.pathExists(path.join(installedOffice, 'app.js'))).toBe(true);
      expect(await fs.pathExists(
        path.join(installedOffice, 'assets', 'cyryx-agent-identity-a-v5.png'),
      )).toBe(true);
      expect(await fs.pathExists(
        path.join(installedOffice, 'assets', 'cyryx-campus-command-hall-v1.png'),
      )).toBe(true);
      expect(await fs.pathExists(
        path.join(installedOffice, 'assets', 'cyryx-labs-official-lockup-v1.png'),
      )).toBe(true);
      expect(await fs.pathExists(
        path.join(installedOffice, 'assets', 'paulo-petruff-ceo-standing-v1.png'),
      )).toBe(true);
      expect(await fs.pathExists(
        path.join(installedOffice, 'assets', 'paulo-petruff-ceo-workstation-v1.png'),
      )).toBe(true);
    });
  });

  describe('ensureProjectNodeModulesLink', () => {
    it('should link project node_modules to .aexos-core dependencies when absent', async () => {
      const frameworkNodeModules = path.join(tempDir, '.aexos-core', 'node_modules');
      await fs.ensureDir(path.join(frameworkNodeModules, 'js-yaml'));
      await fs.writeFile(
        path.join(frameworkNodeModules, 'js-yaml', 'index.js'),
        'module.exports = { ok: true };\n',
      );

      const result = await ensureProjectNodeModulesLink({ targetDir: tempDir });

      expect(result.success).toBe(true);
      expect(result.linked).toBe(true);
      expect(await fs.pathExists(path.join(tempDir, 'node_modules'))).toBe(true);
      expect(await fs.realpath(path.join(tempDir, 'node_modules'))).toBe(
        await fs.realpath(frameworkNodeModules),
      );

      const resolved = require.resolve('js-yaml', {
        paths: [path.join(tempDir, 'squads', 'example', 'scripts')],
      });
      expect(resolved).toContain(path.join('js-yaml', 'index.js'));
    });

    it('should not overwrite an existing project node_modules directory', async () => {
      await fs.ensureDir(path.join(tempDir, 'node_modules', 'existing-package'));
      await fs.ensureDir(path.join(tempDir, '.aexos-core', 'node_modules', 'js-yaml'));

      const result = await ensureProjectNodeModulesLink({ targetDir: tempDir });

      expect(result.success).toBe(true);
      expect(result.linked).toBe(false);
      expect(result.reason).toBe('project-node-modules-exists');
      expect(await fs.pathExists(path.join(tempDir, 'node_modules', 'existing-package'))).toBe(true);
    });

    it('should report missing .aexos-core dependencies without throwing', async () => {
      const result = await ensureProjectNodeModulesLink({ targetDir: tempDir });

      expect(result.success).toBe(false);
      expect(result.linked).toBe(false);
      expect(result.reason).toBe('framework-node-modules-missing');
    });
  });
});
