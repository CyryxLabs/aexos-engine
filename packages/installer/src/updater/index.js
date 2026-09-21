/**
 * AEXOS Updater
 * Intelligent update system for AEXOS Core installations
 *
 * @module packages/installer/src/updater
 * @story Epic 7 - CLI Update Command
 * @version 1.0.0
 *
 * Features:
 * - Detects installed version vs latest available
 * - Preserves user customizations during updates
 * - Supports dry-run and check-only modes
 * - Automatic rollback on failure
 * - Changelog integration from GitHub releases
 */

'use strict';

const fs = require('fs-extra');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');
const { randomUUID, createHash } = require('crypto');
const installerDir = path.join(__dirname, '..', 'installer');
const { hashFile, hashString, hashesMatch } = require(path.join(installerDir, 'file-hasher'));
const { PostInstallValidator, formatReport: formatValidationReport } = require(
  path.join(installerDir, 'post-install-validator'),
);
const {
  loadSourceManifest,
  loadInstalledManifest,
  generateUpgradeReport,
  applyUpgrade,
  prepareInstalledManifest,
} = require(path.join(installerDir, 'brownfield-upgrader'));

// The updater's whole job is meeting projects installed under an older name, so
// the legacy list is load-bearing here rather than defensive. Current name
// first: an install carrying both resolves to the one it should upgrade toward.
//
// Sourced from package-paths rather than restated. This file used to keep its
// own copy, and the scope consolidation onto `@aexos/` rewrote that copy while
// leaving the real one alone — exactly the "a rename leaves half the code
// behind" failure the package-paths comment warns about.
const {
  CORE_PACKAGE_NAME,
  LEGACY_CORE_PACKAGE_NAMES,
} = require('../utils/package-paths');

const CORE_PACKAGE_CANDIDATES = [CORE_PACKAGE_NAME, ...LEGACY_CORE_PACKAGE_NAMES];
const BACKUP_SCHEMA_VERSION = 1;
const BACKUP_STATE_FILENAME = 'backup-state.json';
const PROJECT_MANIFESTS = ['package.json', 'package-lock.json', 'npm-shrinkwrap.json'];

function isContainedPath(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function lstatOrNull(candidate) {
  try {
    return await fs.lstat(candidate);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function assertNoSymlinkPath(root, candidate) {
  if (!isContainedPath(root, candidate)) {
    throw new Error(`Unsafe backup path outside project: ${candidate}`);
  }

  const resolvedRoot = path.resolve(root);
  const rootStat = await lstatOrNull(resolvedRoot);
  if (rootStat?.isSymbolicLink()) {
    throw new Error(`Refusing updater path rooted at a symbolic link: ${resolvedRoot}`);
  }
  const relative = path.relative(resolvedRoot, path.resolve(candidate));
  let current = resolvedRoot;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const stat = await lstatOrNull(current);
    if (!stat) break;
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing updater backup path containing a symbolic link: ${current}`);
    }
  }
}

async function validateDestinationTree(root, candidate) {
  await assertNoSymlinkPath(root, candidate);
  const stat = await lstatOrNull(candidate);
  if (!stat) return;
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing symbolic link in updater restore destination: ${candidate}`);
  }
  if (stat.isDirectory()) {
    for (const entry of await fs.readdir(candidate)) {
      await validateDestinationTree(root, path.join(candidate, entry));
    }
  } else if (!stat.isFile()) {
    throw new Error(`Refusing unsupported updater restore destination: ${candidate}`);
  }
}

function resolveFrameworkPath(frameworkRoot, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || path.isAbsolute(relativePath)) {
    throw new Error(`Unsafe framework journal path: ${relativePath}`);
  }
  const destination = path.resolve(frameworkRoot, relativePath);
  if (!isContainedPath(frameworkRoot, destination) || destination === path.resolve(frameworkRoot)) {
    throw new Error(`Unsafe framework journal path: ${relativePath}`);
  }
  return destination;
}

async function writeJsonAtomic(destination, value) {
  const temporary = `${destination}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await fs.writeJson(temporary, value, { spaces: 2, flag: 'wx' });
    await fs.rename(temporary, destination);
  } catch (error) {
    await fs.unlink(temporary).catch(() => {});
    throw error;
  }
}

async function removeEmptyParents(start, boundary) {
  let current = path.dirname(start);
  const resolvedBoundary = path.resolve(boundary);
  while (isContainedPath(resolvedBoundary, current) && path.resolve(current) !== resolvedBoundary) {
    const stat = await lstatOrNull(current);
    if (!stat?.isDirectory() || (await fs.readdir(current)).length > 0) break;
    await fs.remove(current);
    current = path.dirname(current);
  }
}

async function copySnapshot(source, destination, projectRoot) {
  await assertNoSymlinkPath(projectRoot, source);
  await assertNoSymlinkPath(projectRoot, destination);
  const stat = await fs.lstat(source);
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing to copy symbolic link into updater backup: ${source}`);
  }
  if (stat.isDirectory()) {
    await fs.ensureDir(destination);
    const entries = (await fs.readdir(source)).sort();
    for (const entry of entries) {
      await copySnapshot(path.join(source, entry), path.join(destination, entry), projectRoot);
    }
    return;
  }
  if (!stat.isFile()) {
    throw new Error(`Refusing unsupported updater backup entry: ${source}`);
  }
  await fs.ensureDir(path.dirname(destination));
  await fs.copyFile(source, destination);
}

async function validateSnapshot(source, projectRoot) {
  await assertNoSymlinkPath(projectRoot, source);
  const stat = await fs.lstat(source);
  if (stat.isSymbolicLink()) {
    throw new Error(`Refusing symbolic link in updater backup: ${source}`);
  }
  if (stat.isDirectory()) {
    for (const entry of await fs.readdir(source)) {
      await validateSnapshot(path.join(source, entry), projectRoot);
    }
  } else if (!stat.isFile()) {
    throw new Error(`Refusing unsupported updater backup entry: ${source}`);
  }
}

async function verifySnapshotCopy(source, destination, projectRoot) {
  await assertNoSymlinkPath(projectRoot, destination);
  const original = await fs.lstat(source);
  const restored = await lstatOrNull(destination);
  if (!restored || restored.isSymbolicLink() || original.isDirectory() !== restored.isDirectory()) {
    throw new Error(`Restored package differs from its backup: ${destination}`);
  }
  if (original.isDirectory()) {
    const entries = (await fs.readdir(source)).sort();
    if (JSON.stringify(entries) !== JSON.stringify((await fs.readdir(destination)).sort())) {
      throw new Error(`Restored package entries differ from its backup: ${destination}`);
    }
    for (const entry of entries) {
      await verifySnapshotCopy(path.join(source, entry), path.join(destination, entry), projectRoot);
    }
  } else if (!restored.isFile() || !(await fs.readFile(source)).equals(await fs.readFile(destination))) {
    throw new Error(`Restored package bytes differ from its backup: ${destination}`);
  }
}

async function fileIdentity(file) {
  const bytes = await fs.readFile(file);
  return { sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length };
}

function resolveNpmCliPath(options = {}) {
  const env = options.env || process.env;
  const execPath = options.execPath || process.execPath;
  const pathApi = (options.platform || process.platform) === 'win32' ? path.win32 : path.posix;
  const fileExists = options.fileExists || fs.existsSync;
  const candidates = [];
  const npmExecPath = String(env.npm_execpath || '').trim().replace(/^"(.*)"$/, '$1');
  if (npmExecPath) {
    candidates.push(npmExecPath);
    if (/npx-cli\.js$/i.test(npmExecPath)) {
      candidates.push(pathApi.join(pathApi.dirname(npmExecPath), 'npm-cli.js'));
    }
  }
  candidates.push(pathApi.join(pathApi.dirname(execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'));
  if ((options.platform || process.platform) === 'win32') {
    const programFiles = env.ProgramFiles || env.PROGRAMFILES || 'C:\\Program Files';
    candidates.push(pathApi.join(programFiles, 'nodejs', 'node_modules', 'npm', 'bin', 'npm-cli.js'));
  }
  for (const pathEntry of String(env.PATH || env.Path || '').split(pathApi.delimiter).filter(Boolean)) {
    candidates.push(pathApi.join(pathEntry.replace(/^"(.*)"$/, '$1'), 'node_modules', 'npm', 'bin', 'npm-cli.js'));
  }
  return candidates.find((candidate) => /npm-cli\.js$/i.test(candidate) && fileExists(candidate)) || null;
}

function resolveNpmInvocation(options = {}) {
  const platform = options.platform || process.platform;
  const execPath = options.execPath || process.execPath;
  const npmCliPath = resolveNpmCliPath(options);
  if (npmCliPath) return { command: execPath, prefixArgs: [npmCliPath] };
  if (platform === 'win32') {
    throw new Error('Unable to locate npm-cli.js for a shell-free Windows update');
  }
  return { command: 'npm', prefixArgs: [] };
}

function getPackageRoot(projectRoot, packageName) {
  return path.join(projectRoot, 'node_modules', ...packageName.split('/'));
}

function findInstalledCorePackageRoot(projectRoot) {
  return findInstalledCorePackage(projectRoot)?.packageRoot || null;
}

function findInstalledCorePackage(projectRoot) {
  return CORE_PACKAGE_CANDIDATES.map((packageName) => ({
    packageName,
    packageRoot: getPackageRoot(projectRoot, packageName),
  })).find(({ packageRoot }) => fs.existsSync(path.join(packageRoot, 'package.json')));
}

function manifestToInstalledManifest(manifest) {
  if (!manifest || !Array.isArray(manifest.files)) {
    return null;
  }

  return {
    installed_version: manifest.version || 'unknown',
    files: manifest.files
      .filter((entry) => entry && entry.path && entry.hash)
      .map((entry) => ({
        path: entry.path,
        hash: entry.hash,
        type: entry.type,
        modified_by_user: false,
      })),
  };
}

function extractManifestFileHashes(manifest) {
  if (!manifest || !Array.isArray(manifest.files)) {
    return {};
  }

  const fileHashes = {};
  for (const entry of manifest.files) {
    if (entry && entry.path && entry.hash) {
      fileHashes[entry.path] = entry.hash;
    }
  }

  return fileHashes;
}

function selectInstalledManifest(projectManifest, packageManifest) {
  if (!projectManifest) {
    return packageManifest;
  }

  if (!packageManifest) {
    return projectManifest;
  }

  const projectFiles = Array.isArray(projectManifest.files) ? projectManifest.files : [];
  const packageFiles = Array.isArray(packageManifest.files) ? packageManifest.files : [];

  if (packageFiles.length === 0) {
    return projectManifest;
  }

  if (projectFiles.length === 0) {
    return packageManifest;
  }

  const mergedFiles = new Map();

  for (const entry of packageFiles) {
    if (entry && entry.path) {
      mergedFiles.set(entry.path, entry);
    }
  }

  for (const entry of projectFiles) {
    if (entry && entry.path && !mergedFiles.has(entry.path)) {
      mergedFiles.set(entry.path, entry);
    }
  }

  return {
    ...projectManifest,
    installed_version:
      packageManifest.installed_version ||
      packageManifest.version ||
      projectManifest.installed_version ||
      projectManifest.version,
    files: Array.from(mergedFiles.values()),
  };
}

/**
 * Update status types
 * @enum {string}
 */
const UpdateStatus = {
  UP_TO_DATE: 'up_to_date',
  UPDATE_AVAILABLE: 'update_available',
  UPDATE_REQUIRED: 'update_required', // Breaking changes
  CHECK_FAILED: 'check_failed',
};

/**
 * File update actions
 * @enum {string}
 */
const FileAction = {
  NEW: 'new',
  UPDATED: 'updated',
  PRESERVED: 'preserved', // User customization
  DELETED: 'deleted',
  UNCHANGED: 'unchanged',
};

/**
 * CYRYX Updater Class
 * Handles intelligent updates while preserving user customizations
 */
class CYRYXUpdater {
  /**
   * Create a new CYRYXUpdater instance
   *
   * @param {string} projectRoot - Project root directory
   * @param {Object} [options] - Update options
   * @param {boolean} [options.verbose=false] - Enable verbose logging
   * @param {boolean} [options.force=false] - Force update even if up-to-date
   * @param {boolean} [options.preserveAll=true] - Preserve all customizations
   * @param {number} [options.timeout=30000] - HTTP request timeout
   * @param {number} [options.npmTimeout=600000] - npm install/reconciliation timeout
   * @param {boolean} [options.reconcileDependencies=false] - Reconcile dependencies on manual rollback
   */
  constructor(projectRoot, options = {}) {
    this.projectRoot = path.resolve(projectRoot);
    this.cyryxCoreDir = path.join(this.projectRoot, '.aexos-core');
    this.cyryxConfigDir = path.join(this.projectRoot, '.aexos');

    this.options = {
      verbose: options.verbose === true,
      force: options.force === true,
      preserveAll: options.preserveAll !== false,
      timeout: options.timeout || 30000,
      npmTimeout: options.npmTimeout || 600000,
      reconcileDependencies: options.reconcileDependencies === true,
    };

    this.execFileSync = options.execFileSync || execFileSync;
    this.npmInvocation = options.npmInvocation || null;
    this.npmInvocationOptions = options.npmInvocationOptions || {};

    this.installedVersion = null;
    this.latestVersion = null;
    this.versionInfo = null;
    this.changelog = null;
    this.backupDir = null;
    this.lastSourcePackageRoot = null;
    this.lastSourceManifest = null;
  }

  runNpm(args, options = {}) {
    const invocation = this.npmInvocation || resolveNpmInvocation(this.npmInvocationOptions);
    return this.execFileSync(
      invocation.command,
      [...invocation.prefixArgs, ...args],
      {
        cwd: this.projectRoot,
        stdio: this.options.verbose ? 'inherit' : 'pipe',
        timeout: options.timeout || 120000,
      },
    );
  }

  /**
   * Check for available updates
   * Compares installed version with latest from npm registry
   *
   * @returns {Promise<Object>} Update check result
   */
  async checkForUpdates() {
    const result = {
      status: UpdateStatus.CHECK_FAILED,
      installed: null,
      latest: null,
      installedAt: null,
      hasUpdate: false,
      isBreaking: false,
      error: null,
    };

    try {
      // Get installed version
      this.installedVersion = await this.getInstalledVersion();
      result.installed = this.installedVersion?.version || null;
      result.installedAt = this.installedVersion?.installedAt || null;

      if (!result.installed) {
        result.error = 'AEXOS not installed or version info not found';
        return result;
      }

      // Get latest version from npm
      this.latestVersion = await this.getLatestVersion();
      result.latest = this.latestVersion;

      if (!result.latest) {
        // Check if we're offline or package doesn't exist
        const isOnline = await this.checkConnectivity();
        if (!isOnline) {
          result.error = 'You appear to be offline. Please check your internet connection.';
        } else {
          result.error = `Package ${CORE_PACKAGE_NAME} not found on npm registry. This may be a local development installation.`;
        }
        return result;
      }

      // Compare versions
      const comparison = this.compareVersions(result.installed, result.latest);

      if (comparison >= 0 && !this.options.force) {
        result.status = UpdateStatus.UP_TO_DATE;
        result.hasUpdate = false;
      } else {
        result.hasUpdate = true;
        result.isBreaking = this.isBreakingUpdate(result.installed, result.latest);
        result.status = result.isBreaking
          ? UpdateStatus.UPDATE_REQUIRED
          : UpdateStatus.UPDATE_AVAILABLE;
      }

      this.log(`Installed: v${result.installed}, Latest: v${result.latest}`);
      return result;
    } catch (error) {
      result.error = error.message;
      this.log(`Check failed: ${error.message}`);
      return result;
    }
  }

  /**
   * Get installed version from version.json or package.json
   *
   * @returns {Promise<Object|null>} Version info or null
   */
  async getInstalledVersion() {
    // Try version.json first (new format)
    const versionJsonPath = path.join(this.cyryxCoreDir, 'version.json');
    if (fs.existsSync(versionJsonPath)) {
      try {
        const versionInfo = await fs.readJson(versionJsonPath);
        this.versionInfo = versionInfo;
        return versionInfo;
      } catch (error) {
        this.log(`Could not read version.json: ${error.message}`);
      }
    }

    // Fallback to package.json
    const packageRoot = findInstalledCorePackageRoot(this.projectRoot);
    if (packageRoot) {
      const packageJsonPath = path.join(packageRoot, 'package.json');
      try {
        const pkg = await fs.readJson(packageJsonPath);
        return { version: pkg.version, installedAt: null, mode: 'unknown' };
      } catch (error) {
        this.log(`Could not read package.json: ${error.message}`);
      }
    }

    // Try local package.json for framework-development mode
    const localPackageJsonPath = path.join(this.projectRoot, 'package.json');
    if (fs.existsSync(localPackageJsonPath)) {
      try {
        const pkg = await fs.readJson(localPackageJsonPath);
        if (CORE_PACKAGE_CANDIDATES.includes(pkg.name)) {
          return { version: pkg.version, installedAt: null, mode: 'framework-development' };
        }
      } catch (error) {
        this.log(`Could not read local package.json: ${error.message}`);
      }
    }

    return null;
  }

  /**
   * Get latest version from npm registry
   *
   * @returns {Promise<string|null>} Latest version or null
   */
  async getLatestVersion() {
    return new Promise((resolve) => {
      const request = https.get(
        `https://registry.npmjs.org/${encodeURIComponent(CORE_PACKAGE_NAME)}/latest`,
        { timeout: this.options.timeout },
        (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              resolve(json.version || null);
            } catch {
              resolve(null);
            }
          });
        },
      );

      request.on('error', (error) => {
        this.log(`npm registry error: ${error.message}`);
        resolve(null);
      });

      request.on('timeout', () => {
        request.destroy();
        this.log('npm registry timeout');
        resolve(null);
      });
    });
  }

  /**
   * Check internet connectivity
   *
   * @returns {Promise<boolean>} True if online
   */
  async checkConnectivity() {
    return new Promise((resolve) => {
      const request = https.get('https://registry.npmjs.org/', { timeout: 5000 }, (res) => {
        resolve(res.statusCode === 200);
      });

      request.on('error', () => resolve(false));
      request.on('timeout', () => {
        request.destroy();
        resolve(false);
      });
    });
  }

  /**
   * Compare two semantic versions
   *
   * @param {string} v1 - First version
   * @param {string} v2 - Second version
   * @returns {number} -1 if v1 < v2, 0 if equal, 1 if v1 > v2
   */
  compareVersions(v1, v2) {
    const parts1 = v1.replace(/^v/, '').split('.').map(Number);
    const parts2 = v2.replace(/^v/, '').split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;

      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }

    return 0;
  }

  /**
   * Check if update is a breaking (major) version change
   *
   * @param {string} installed - Installed version
   * @param {string} latest - Latest version
   * @returns {boolean} True if breaking change
   */
  isBreakingUpdate(installed, latest) {
    const installedMajor = parseInt(installed.replace(/^v/, '').split('.')[0], 10);
    const latestMajor = parseInt(latest.replace(/^v/, '').split('.')[0], 10);
    return latestMajor > installedMajor;
  }

  /**
   * Detect user customizations by comparing file hashes
   *
   * @returns {Promise<Object>} Customization detection result
   */
  async detectCustomizations() {
    const result = {
      customized: [],
      unchanged: [],
      missing: [],
      error: null,
    };

    // Need version.json with fileHashes
    if (!this.versionInfo?.fileHashes) {
      // Try to load it
      const versionJsonPath = path.join(this.cyryxCoreDir, 'version.json');
      if (fs.existsSync(versionJsonPath)) {
        try {
          this.versionInfo = await fs.readJson(versionJsonPath);
        } catch (error) {
          result.error = `Could not read version.json: ${error.message}`;
          return result;
        }
      } else {
        result.error = 'version.json not found - cannot detect customizations';
        return result;
      }
    }

    if (!this.versionInfo.fileHashes) {
      result.error = 'No file hashes in version.json - cannot detect customizations';
      return result;
    }

    // Compare each file
    for (const [relativePath, originalHash] of Object.entries(this.versionInfo.fileHashes)) {
      const absolutePath = path.join(this.cyryxCoreDir, relativePath);

      if (!fs.existsSync(absolutePath)) {
        result.missing.push(relativePath);
        continue;
      }

      try {
        const currentHash = `sha256:${hashFile(absolutePath)}`;
        if (hashesMatch(currentHash, originalHash)) {
          result.unchanged.push(relativePath);
        } else {
          result.customized.push(relativePath);
        }
      } catch (error) {
        this.log(`Could not hash ${relativePath}: ${error.message}`);
        result.missing.push(relativePath);
      }
    }

    return result;
  }

  /**
   * Preview what would be updated (dry-run)
   *
   * @returns {Promise<Object>} Preview result
   */
  async previewUpdate() {
    const checkResult = await this.checkForUpdates();

    if (!checkResult.hasUpdate && !this.options.force) {
      return {
        willUpdate: false,
        reason: 'Already up to date',
        ...checkResult,
      };
    }

    const customizations = await this.detectCustomizations();
    const filesToUpdate = await this.getFilesToUpdate();

    return {
      willUpdate: true,
      currentVersion: checkResult.installed,
      targetVersion: checkResult.latest,
      isBreaking: checkResult.isBreaking,
      files: {
        new: filesToUpdate.filter((f) => f.action === FileAction.NEW),
        updated: filesToUpdate.filter((f) => f.action === FileAction.UPDATED),
        preserved: filesToUpdate.filter((f) => f.action === FileAction.PRESERVED),
        deleted: filesToUpdate.filter((f) => f.action === FileAction.DELETED),
      },
      customizations: customizations.customized,
      preserveCustomizations: this.options.preserveAll,
    };
  }

  /**
   * Get list of files that would be updated
   *
   * @returns {Promise<Array>} List of files with actions
   */
  async getFilesToUpdate() {
    // For now, return empty - will be implemented when we have manifest comparison
    // This would compare local manifest with latest manifest
    return [];
  }

  /**
   * Perform the update
   *
   * @param {Object} [options] - Update options
   * @param {boolean} [options.dryRun=false] - Only preview, don't update
   * @param {Function} [options.onProgress] - Progress callback
   * @returns {Promise<Object>} Update result
   */
  async update(options = {}) {
    const dryRun = options.dryRun === true;
    const onProgress = options.onProgress || (() => {});

    const result = {
      success: false,
      dryRun,
      previousVersion: null,
      newVersion: null,
      filesUpdated: 0,
      filesPreserved: 0,
      error: null,
      rollbackAvailable: false,
      rollback: null,
    };

    try {
      const interrupted = await this.findInterruptedUpdate();
      if (interrupted) {
        if (dryRun) {
          return { ...result, success: true, recoveryRequired: true,
            preview: { action: 'recover-interrupted-update', backupDir: interrupted.backupDir,
              phase: interrupted.state.phase } };
        }
        onProgress('recovering', 'Recovering an interrupted update...');
        this.backupDir = interrupted.backupDir;
        result.rollbackAvailable = true;
        result.rollback = await this.rollback({ reconcileDependencies: true });
        result.recoveredInterruptedUpdate = true;
        if (result.rollback.complete) {
          await this.cleanupBackup();
          result.rollbackAvailable = false;
          result.error = 'Recovered interrupted update; rerun the update command';
        } else {
          result.error = this.formatRecoveryFailure(result.rollback);
        }
        return result;
      }

      // Check for updates
      onProgress('checking', 'Checking for updates...');
      let checkResult;
      if (options.targetVersion && options.packageSpecifier) {
        const installed = await this.getInstalledVersion();
        checkResult = {
          status: UpdateStatus.UPDATE_AVAILABLE,
          installed: installed?.version || null,
          latest: options.targetVersion,
          installedAt: installed?.installedAt || null,
          hasUpdate: Boolean(installed?.version) &&
            (this.compareVersions(installed.version, options.targetVersion) < 0 || this.options.force),
          isBreaking: installed?.version
            ? this.isBreakingUpdate(installed.version, options.targetVersion)
            : false,
          error: installed?.version ? null : 'AEXOS not installed or version info not found',
        };
      } else {
        checkResult = await this.checkForUpdates();
      }

      if (!checkResult.hasUpdate && !this.options.force) {
        result.success = true;
        result.previousVersion = checkResult.installed;
        result.newVersion = checkResult.installed;
        result.error = 'Already up to date';
        return result;
      }

      result.previousVersion = checkResult.installed;
      result.newVersion = checkResult.latest;

      if (dryRun) {
        const preview = await this.previewUpdate();
        return {
          ...result,
          success: true,
          dryRun: true,
          preview,
        };
      }

      // Create backup for rollback
      onProgress('backup', 'Creating backup...');
      await this.createBackup();
      result.rollbackAvailable = true;

      // Detect customizations to preserve
      onProgress('detecting', 'Detecting customizations...');
      const customizations = await this.detectCustomizations();

      // Download and apply update
      onProgress('downloading', 'Downloading update...');
      const updateApplied = await this.applyUpdate(
        checkResult.latest,
        customizations.customized,
        { packageSpecifier: options.packageSpecifier },
      );

      if (!updateApplied.success) {
        // Rollback on failure
        onProgress('rollback', 'Update failed, rolling back...');
        result.error = updateApplied.error;
        try {
          result.rollback = await this.rollback({ reconcileDependencies: true });
          if (!result.rollback.complete) {
            result.error += ` (${this.formatRecoveryFailure(result.rollback)})`;
          }
        } catch (rollbackError) {
          result.error += ` (rollback failed: ${rollbackError.message})`;
        }
        return result;
      }

      result.filesUpdated = updateApplied.filesUpdated;
      result.filesPreserved =
        updateApplied.filesSkipped?.length ?? customizations.customized.length;
      this.lastSourcePackageRoot = updateApplied.sourcePackageRoot || this.lastSourcePackageRoot;
      this.lastSourceManifest = updateApplied.sourceManifest || this.lastSourceManifest;

      // Update version.json
      onProgress('finalizing', 'Updating version info...');
      await this.updateVersionInfo(checkResult.latest, {
        fileHashes: extractManifestFileHashes(this.lastSourceManifest),
      });

      // Validate installation after update
      onProgress('validating', 'Validating installation...');
      const expectedPreservedFiles = await Promise.all((updateApplied.filesSkipped || [])
        .filter((entry) => /^(User modified|Merge failed)/.test(entry.reason || ''))
        .map(async (entry) => {
          const snapshot = resolveFrameworkPath(path.join(this.backupDir, 'framework'), entry.path);
          await assertNoSymlinkPath(this.projectRoot, snapshot);
          return { path: entry.path, ...await fileIdentity(snapshot) };
        }));
      const validationResult = await this.validateAfterUpdate({
        sourceDir: this.lastSourcePackageRoot,
        expectedPreservedFiles,
      });
      result.validationPassed = validationResult.success;
      result.integrityScore = validationResult.integrityScore;
      result.validationIssues = validationResult.issues;
      result.preservedValidationIssues = validationResult.preservedIssues;

      if (!validationResult.success) {
        onProgress('rollback', 'Validation failed, rolling back...');
        result.error = `Validation failed (${validationResult.issues.length} unexpected issue(s), integrity: ${validationResult.integrityScore}%)`;
        try {
          result.rollback = await this.rollback({ reconcileDependencies: true });
          if (!result.rollback.complete) {
            result.error += ` (${this.formatRecoveryFailure(result.rollback)})`;
          }
        } catch (rollbackError) {
          result.error += ` (rollback failed: ${rollbackError.message})`;
        }
        return result;
      }

      // Cleanup backup
      await this.updateBackupState({ phase: 'complete', targetVersion: checkResult.latest });
      await this.cleanupBackup();
      result.rollbackAvailable = false;

      result.success = true;
      onProgress('complete', 'Update complete!');

      return result;
    } catch (error) {
      result.error = error.message;

      // Attempt rollback
      if (result.rollbackAvailable) {
        try {
          result.rollback = await this.rollback({ reconcileDependencies: true });
          if (result.rollback.complete) {
            result.error += ' (framework, manifests, and dependencies rolled back)';
          } else {
            result.error += ` (${this.formatRecoveryFailure(result.rollback)})`;
          }
        } catch (rollbackError) {
          result.error += ` (rollback failed: ${rollbackError.message})`;
        }
      }

      return result;
    }
  }

  formatRecoveryFailure(recovery) {
    const reasons = [];
    if (!recovery.frameworkRestored) {
      reasons.push(
        `${recovery.frameworkAdditionsPreserved} changed update-created framework file(s) preserved`,
      );
    }
    if (!recovery.dependenciesRestored) {
      reasons.push(`dependency reconciliation failed: ${recovery.dependencyError || 'not run'}`);
    }
    return `rollback incomplete: ${reasons.join('; ')}`;
  }

  async findInterruptedUpdate() {
    const backupRoot = path.join(this.cyryxConfigDir, 'backup');
    const backupRootStat = await lstatOrNull(backupRoot);
    if (!backupRootStat) return null;
    if (!backupRootStat.isDirectory() || backupRootStat.isSymbolicLink()) {
      throw new Error(`Refusing unsafe updater backup root: ${backupRoot}`);
    }

    const candidates = (await fs.readdir(backupRoot))
      .filter((entry) => /^pre-update-\d+(?:-[a-f0-9-]+)?$/.test(entry))
      .sort()
      .reverse();
    for (const entry of candidates) {
      const backupDir = path.join(backupRoot, entry);
      await assertNoSymlinkPath(this.projectRoot, backupDir);
      const statePath = path.join(backupDir, BACKUP_STATE_FILENAME);
      if (!(await lstatOrNull(statePath))) {
        throw new Error(`Interrupted updater backup is missing ${BACKUP_STATE_FILENAME}: ${backupDir}`);
      }
      const state = await fs.readJson(statePath);
      if (state.schemaVersion !== BACKUP_SCHEMA_VERSION) {
        throw new Error(`Unsupported updater backup schema: ${state.schemaVersion}`);
      }
      if (!['complete', 'rolled-back'].includes(state.phase)) {
        return { backupDir, state };
      }
    }
    return null;
  }

  async updateBackupState(patch) {
    if (!this.backupDir) throw new Error('No backup available for lifecycle state');
    const statePath = path.join(this.backupDir, BACKUP_STATE_FILENAME);
    await assertNoSymlinkPath(this.projectRoot, statePath);
    const state = await fs.readJson(statePath);
    if (state.schemaVersion !== BACKUP_SCHEMA_VERSION) {
      throw new Error(`Unsupported updater backup schema: ${state.schemaVersion}`);
    }
    const next = { ...state, ...patch, updatedAt: new Date().toISOString() };
    await writeJsonAtomic(statePath, next);
    return next;
  }

  async recoverInterruptedUpdate(options = {}) {
    const interrupted = await this.findInterruptedUpdate();
    if (!interrupted) return { recovered: false, complete: true };
    this.backupDir = interrupted.backupDir;
    const recovery = await this.rollback({
      reconcileDependencies: options.reconcileDependencies !== false,
    });
    if (recovery.complete && options.keepBackup !== true) {
      await this.cleanupBackup();
    }
    return { recovered: true, ...recovery };
  }

  /**
   * Create backup before update
   *
   * @returns {Promise<void>}
   */
  async createBackup() {
    const backupRoot = path.join(this.cyryxConfigDir, 'backup');
    await assertNoSymlinkPath(this.projectRoot, backupRoot);
    await fs.ensureDir(backupRoot);
    const backupName = `pre-update-${Date.now()}-${randomUUID()}`;
    const stagingDir = path.join(backupRoot, `.incomplete-${backupName}`);
    const publishedDir = path.join(backupRoot, backupName);
    await fs.mkdir(stagingDir);

    const frameworkStat = await lstatOrNull(this.cyryxCoreDir);
    if (frameworkStat?.isSymbolicLink()) {
      throw new Error(`Refusing symbolic framework root: ${this.cyryxCoreDir}`);
    }
    const state = {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      phase: 'prepared',
      createdAt: new Date().toISOString(),
      frameworkExisted: Boolean(frameworkStat),
      projectManifests: {},
      corePackages: [],
      frameworkAdditions: [],
      dependenciesRestoredByRollback: false,
    };

    try {
      if (state.frameworkExisted) {
        await copySnapshot(
          this.cyryxCoreDir,
          path.join(stagingDir, 'framework'),
          this.projectRoot,
        );
      }

      for (const filename of PROJECT_MANIFESTS) {
        const source = path.join(this.projectRoot, filename);
        const sourceStat = await lstatOrNull(source);
        if (sourceStat?.isSymbolicLink()) {
          throw new Error(`Refusing symbolic project manifest: ${source}`);
        }
        const existed = Boolean(sourceStat);
        state.projectManifests[filename] = { existed };
        if (existed) {
          await copySnapshot(
            source,
            path.join(stagingDir, 'project-manifests', filename),
            this.projectRoot,
          );
        }
      }

      for (const [index, packageName] of CORE_PACKAGE_CANDIDATES.entries()) {
        const packageRoot = getPackageRoot(this.projectRoot, packageName);
        const packageStat = await lstatOrNull(packageRoot);
        if (packageStat?.isSymbolicLink()) {
          throw new Error(`Refusing symbolic core package root: ${packageRoot}`);
        }
        const existed = Boolean(packageStat);
        state.corePackages.push({ packageName, existed, snapshot: `core-packages/${index}` });
        if (existed) {
          await copySnapshot(
            packageRoot,
            path.join(stagingDir, 'core-packages', String(index)),
            this.projectRoot,
          );
        }
      }

      await writeJsonAtomic(path.join(stagingDir, BACKUP_STATE_FILENAME), state);
      // Only a complete, prepared snapshot is discoverable after a restart.
      // An interrupted copy remains under .incomplete-* for diagnosis.
      await fs.rename(stagingDir, publishedDir);
      this.backupDir = publishedDir;
    } catch (error) {
      await fs.remove(stagingDir);
      throw error;
    }

    this.log(`Backup created at ${this.backupDir}`);
  }

  async journalFrameworkAdditions(entries) {
    if (!this.backupDir) throw new Error('No backup available for update journal');
    const statePath = path.join(this.backupDir, BACKUP_STATE_FILENAME);
    await assertNoSymlinkPath(this.projectRoot, statePath);
    const state = await fs.readJson(statePath);
    if (state.schemaVersion !== BACKUP_SCHEMA_VERSION) {
      throw new Error(`Unsupported updater backup schema: ${state.schemaVersion}`);
    }

    const additions = new Map(
      (state.frameworkAdditions || []).map((entry) => [entry.path, entry]),
    );
    for (const entry of entries) {
      const destination = resolveFrameworkPath(this.cyryxCoreDir, entry.path);
      await assertNoSymlinkPath(this.projectRoot, destination);
      const snapshot = resolveFrameworkPath(path.join(this.backupDir, 'framework'), entry.path);
      const snapshotStat = await lstatOrNull(snapshot);
      if (snapshotStat?.isSymbolicLink()) {
        throw new Error(`Refusing symbolic link in updater backup: ${snapshot}`);
      }
      if (snapshotStat) continue;
      if (!/^sha256:[a-f0-9]{64}$/i.test(entry.hash || '')) {
        throw new Error(`Invalid framework journal hash for ${entry.path}`);
      }
      additions.set(entry.path, { path: entry.path, hash: entry.hash.toLowerCase() });
    }
    state.frameworkAdditions = Array.from(additions.values()).sort((a, b) =>
      a.path.localeCompare(b.path),
    );
    await writeJsonAtomic(statePath, state);
  }

  async journalCurrentFrameworkAddition(relativePath) {
    const destination = resolveFrameworkPath(this.cyryxCoreDir, relativePath);
    await assertNoSymlinkPath(this.projectRoot, destination);
    const stat = await lstatOrNull(destination);
    if (!stat?.isFile()) return;
    await this.journalFrameworkAdditions([{
      path: relativePath,
      hash: `sha256:${hashFile(destination)}`,
    }]);
  }

  async writeInstalledManifest(sourceManifest, targetVersion) {
    const destination = path.join(this.cyryxCoreDir, '.installed-manifest.yaml');
    const prepared = prepareInstalledManifest(
      sourceManifest,
      `${CORE_PACKAGE_NAME}@${targetVersion}`,
    );
    await this.journalFrameworkAdditions([{
      path: '.installed-manifest.yaml',
      hash: `sha256:${hashString(prepared.content)}`,
    }]);
    await fs.outputFile(destination, prepared.content, 'utf8');
    return destination;
  }

  /**
   * Rollback to previous state
   *
   * @returns {Promise<Object>} Restored scope and remaining dependency obligation
   */
  async rollback(options = {}) {
    if (!this.backupDir || !(await lstatOrNull(this.backupDir))) {
      throw new Error('No backup available for rollback');
    }

    const backupRoot = path.join(this.cyryxConfigDir, 'backup');
    if (path.dirname(path.resolve(this.backupDir)) !== path.resolve(backupRoot)) {
      throw new Error('Backup directory is outside the updater backup root');
    }
    await assertNoSymlinkPath(this.projectRoot, this.backupDir);

    const statePath = path.join(this.backupDir, BACKUP_STATE_FILENAME);
    await assertNoSymlinkPath(this.projectRoot, statePath);
    const state = await fs.readJson(statePath);
    if (state.schemaVersion !== BACKUP_SCHEMA_VERSION) {
      throw new Error(`Unsupported updater backup schema: ${state.schemaVersion}`);
    }
    await this.updateBackupState({ phase: 'rolling-back' });

    const frameworkSnapshot = path.join(this.backupDir, 'framework');
    const packageStates = new Map(
      (state.corePackages || []).map((entry) => [entry.packageName, entry]),
    );
    const frameworkAdditions = [];

    // Validate every source and destination before changing the project. Backup
    // metadata selects only fixed targets; it never supplies a destination path.
    await validateDestinationTree(this.projectRoot, this.cyryxCoreDir);
    if (state.frameworkExisted) {
      if (!(await lstatOrNull(frameworkSnapshot))) {
        throw new Error('Updater backup is missing the framework snapshot');
      }
      await validateSnapshot(frameworkSnapshot, this.projectRoot);
    }

    for (const entry of state.frameworkAdditions || []) {
      if (!entry || !/^sha256:[a-f0-9]{64}$/i.test(entry.hash || '')) {
        throw new Error('Updater backup contains an invalid framework addition journal');
      }
      const destination = resolveFrameworkPath(this.cyryxCoreDir, entry.path);
      await assertNoSymlinkPath(this.projectRoot, destination);
      frameworkAdditions.push({ ...entry, destination });
    }

    for (const filename of PROJECT_MANIFESTS) {
      const manifestState = state.projectManifests?.[filename];
      if (!manifestState || typeof manifestState.existed !== 'boolean') {
        throw new Error(`Updater backup is missing manifest state for ${filename}`);
      }
      const destination = path.join(this.projectRoot, filename);
      await assertNoSymlinkPath(this.projectRoot, destination);
      if (manifestState.existed) {
        const snapshot = path.join(this.backupDir, 'project-manifests', filename);
        if (!(await lstatOrNull(snapshot))) {
          throw new Error(`Updater backup is missing ${filename}`);
        }
        await validateSnapshot(snapshot, this.projectRoot);
      }
    }

    for (const [index, packageName] of CORE_PACKAGE_CANDIDATES.entries()) {
      const packageState = packageStates.get(packageName);
      if (!packageState || typeof packageState.existed !== 'boolean') {
        throw new Error(`Updater backup is missing package state for ${packageName}`);
      }
      const destination = getPackageRoot(this.projectRoot, packageName);
      await validateDestinationTree(this.projectRoot, destination);
      if (packageState.existed) {
        const snapshot = path.join(this.backupDir, 'core-packages', String(index));
        if (!(await lstatOrNull(snapshot))) {
          throw new Error(`Updater backup is missing package snapshot for ${packageName}`);
        }
        await validateSnapshot(snapshot, this.projectRoot);
      }
    }

    let frameworkAdditionsRemoved = 0;
    let frameworkAdditionsPreserved = 0;
    for (const entry of frameworkAdditions) {
      const stat = await lstatOrNull(entry.destination);
      if (!stat) continue;
      if (!stat.isFile()) {
        frameworkAdditionsPreserved += 1;
        continue;
      }
      const currentHash = `sha256:${hashFile(entry.destination)}`;
      if (currentHash.toLowerCase() !== entry.hash.toLowerCase()) {
        frameworkAdditionsPreserved += 1;
        continue;
      }
      await fs.remove(entry.destination);
      await removeEmptyParents(entry.destination, this.cyryxCoreDir);
      frameworkAdditionsRemoved += 1;
    }

    const restoreProjectManifests = async () => {
      for (const filename of PROJECT_MANIFESTS) {
        const destination = path.join(this.projectRoot, filename);
        await assertNoSymlinkPath(this.projectRoot, destination);
        if (state.projectManifests[filename].existed) {
          await copySnapshot(
            path.join(this.backupDir, 'project-manifests', filename),
            destination,
            this.projectRoot,
          );
        } else if (await lstatOrNull(destination)) {
          await fs.remove(destination);
        }
      }
    };
    await restoreProjectManifests();

    let dependenciesRestored = false;
    let dependencyReinstallRequired = true;
    let dependencyError = null;
    let dependencyCommand = null;
    if (options.reconcileDependencies ?? this.options.reconcileDependencies) {
      try {
        const dependencyRecovery = await this.reconcileDependencies();
        dependenciesRestored = dependencyRecovery.restored;
        dependencyReinstallRequired = !dependencyRecovery.restored;
        dependencyCommand = dependencyRecovery.command;
      } catch (error) {
        dependencyError = error.message;
      }
      // npm can replace node_modules and modify manifests, even on failure.
      // Restore owned snapshots only after it has finished, then read them back.
      await restoreProjectManifests();
    }
    await validateDestinationTree(this.projectRoot, this.cyryxCoreDir);
    if (state.frameworkExisted) {
      await copySnapshot(frameworkSnapshot, this.cyryxCoreDir, this.projectRoot);
    }
    for (const [index, packageName] of CORE_PACKAGE_CANDIDATES.entries()) {
      const packageState = packageStates.get(packageName);
      const destination = getPackageRoot(this.projectRoot, packageName);
      await validateDestinationTree(this.projectRoot, destination);
      if (await lstatOrNull(destination)) await fs.remove(destination);
      if (packageState.existed) {
        const snapshot = path.join(this.backupDir, 'core-packages', String(index));
        await copySnapshot(
          snapshot,
          destination,
          this.projectRoot,
        );
        await verifySnapshotCopy(snapshot, destination, this.projectRoot);
      }
    }
    if (!state.frameworkExisted) {
      const coreStat = await lstatOrNull(this.cyryxCoreDir);
      if (coreStat?.isDirectory() && (await fs.readdir(this.cyryxCoreDir)).length === 0) {
        await fs.remove(this.cyryxCoreDir);
      }
    }

    const recovery = {
      frameworkRestored: frameworkAdditionsPreserved === 0,
      frameworkPreviouslyExisted: state.frameworkExisted,
      frameworkAdditionsRemoved,
      frameworkAdditionsPreserved,
      projectManifestsRestored: true,
      corePackagesRestored: true,
      dependenciesRestored,
      dependencyReinstallRequired,
      dependencyError,
      dependencyCommand,
    };
    recovery.complete = recovery.frameworkRestored && recovery.dependenciesRestored;
    await this.updateBackupState({
      phase: recovery.complete ? 'rolled-back' : 'recovery-incomplete',
      recovery: {
        complete: recovery.complete,
        frameworkRestored: recovery.frameworkRestored,
        dependenciesRestored: recovery.dependenciesRestored,
        dependencyError: recovery.dependencyError,
      },
    });
    this.log(recovery.complete ? 'Rollback completed' : 'Rollback incomplete');
    return recovery;
  }

  async reconcileDependencies() {
    const shrinkwrapPath = path.join(this.projectRoot, 'npm-shrinkwrap.json');
    const packageLockPath = path.join(this.projectRoot, 'package-lock.json');
    const hasLock = Boolean(await lstatOrNull(shrinkwrapPath)) ||
      Boolean(await lstatOrNull(packageLockPath));
    const command = hasLock ? 'ci' : 'install';
    this.log(`Running: npm ${command} --prefer-offline --no-audit --no-fund`);
    this.runNpm(
      [command, '--prefer-offline', '--no-audit', '--no-fund'],
      { timeout: this.options.npmTimeout },
    );
    return { restored: true, command, lockfileBound: hasLock };
  }

  /**
   * Cleanup backup after successful update
   *
   * @returns {Promise<void>}
   */
  async cleanupBackup() {
    if (this.backupDir && fs.existsSync(this.backupDir)) {
      await fs.remove(this.backupDir);
      this.backupDir = null;
    }
  }

  /**
   * Apply the update
   *
   * @param {string} targetVersion - Target version
   * @param {Array<string>} customizedFiles - Files to preserve
   * @returns {Promise<Object>} Apply result
   */
  async applyUpdate(targetVersion, _customizedFiles = [], options = {}) {
    const result = {
      success: false,
      filesUpdated: 0,
      error: null,
    };

    try {
      const previousCorePackage = findInstalledCorePackage(this.projectRoot);
      const previousPackageRoot = previousCorePackage?.packageRoot || null;
      const previousSourceManifest = previousPackageRoot
        ? loadSourceManifest(path.join(previousPackageRoot, '.aexos-core'))
        : null;

      if (this.backupDir) {
        await this.updateBackupState({ phase: 'installing-package', targetVersion });
      }

      if (previousCorePackage && previousCorePackage.packageName !== CORE_PACKAGE_NAME) {
        this.log(`Running: npm uninstall ${previousCorePackage.packageName}`);
        this.runNpm(['uninstall', previousCorePackage.packageName]);
      }

      const packageSpecifier = options.packageSpecifier || `${CORE_PACKAGE_NAME}@${targetVersion}`;
      this.log(`Running: npm install ${packageSpecifier} --save-exact`);
      this.runNpm(
        ['install', packageSpecifier, '--save-exact', '--prefer-offline', '--no-audit', '--no-fund'],
        { timeout: this.options.npmTimeout },
      );

      if (this.backupDir) {
        await this.updateBackupState({ phase: 'applying-framework', targetVersion });
      }

      const sourcePackageRoot = getPackageRoot(this.projectRoot, CORE_PACKAGE_NAME);
      const installedPackage = await fs.readJson(path.join(sourcePackageRoot, 'package.json'));
      if (installedPackage.name !== CORE_PACKAGE_NAME || installedPackage.version !== targetVersion) {
        throw new Error(`Installed package identity/version does not match requested ${CORE_PACKAGE_NAME}@${targetVersion}`);
      }
      const sourceCyryxCore = path.join(sourcePackageRoot, '.aexos-core');
      const sourceManifest = loadSourceManifest(sourceCyryxCore);

      if (!sourceManifest) {
        result.error = 'Updated package does not contain install-manifest.yaml';
        return result;
      }
      await validateSnapshot(sourceCyryxCore, this.projectRoot);
      await validateDestinationTree(this.projectRoot, this.cyryxCoreDir);

      const installedManifest = selectInstalledManifest(
        loadInstalledManifest(this.projectRoot),
        manifestToInstalledManifest(previousSourceManifest),
      );
      const report = generateUpgradeReport(sourceManifest, installedManifest, this.projectRoot);
      const newFileJournal = [];
      for (const file of report.newFiles) {
        const sourcePath = resolveFrameworkPath(sourceCyryxCore, file.path);
        await assertNoSymlinkPath(this.projectRoot, sourcePath);
        const sourceStat = await lstatOrNull(sourcePath);
        if (!sourceStat?.isFile()) {
          throw new Error(`New framework source is not a regular file: ${file.path}`);
        }
        newFileJournal.push({ path: file.path, hash: `sha256:${hashFile(sourcePath)}` });
      }
      await this.journalFrameworkAdditions(newFileJournal);

      const applyResult = await applyUpgrade(report, sourceCyryxCore, this.projectRoot, {
        includeModified: true,
      });
      for (const installed of applyResult.filesInstalled) {
        if (installed.backupPath) {
          const relativeBackup = path.relative(this.cyryxCoreDir, installed.backupPath);
          await this.journalCurrentFrameworkAddition(relativeBackup);
        }
      }

      if (!applyResult.success) {
        result.error = applyResult.errors
          .map((entry) => `${entry.path}: ${entry.error}`)
          .join('; ');
        return result;
      }

      const sourceManifestPath = path.join(sourceCyryxCore, 'install-manifest.yaml');
      await this.journalFrameworkAdditions([{
        path: 'install-manifest.yaml',
        hash: `sha256:${hashFile(sourceManifestPath)}`,
      }]);
      await fs.copy(
        sourceManifestPath,
        path.join(this.cyryxCoreDir, 'install-manifest.yaml'),
        { overwrite: true },
      );

      const sourceSignaturePath = path.join(sourceCyryxCore, 'install-manifest.yaml.minisig');
      const targetSignaturePath = path.join(this.cyryxCoreDir, 'install-manifest.yaml.minisig');
      if (await lstatOrNull(sourceSignaturePath)) {
        await this.journalFrameworkAdditions([{
          path: 'install-manifest.yaml.minisig',
          hash: `sha256:${hashFile(sourceSignaturePath)}`,
        }]);
        await fs.copy(sourceSignaturePath, targetSignaturePath, { overwrite: true });
      } else if (await lstatOrNull(targetSignaturePath)) {
        await fs.remove(targetSignaturePath);
      }

      await this.writeInstalledManifest(sourceManifest, targetVersion);

      result.success = true;
      result.filesUpdated = applyResult.filesInstalled.length;
      result.filesSkipped = applyResult.filesSkipped;
      result.sourceManifest = sourceManifest;
      result.sourcePackageRoot = sourcePackageRoot;

      return result;
    } catch (error) {
      result.error = error.message;
      return result;
    }
  }

  /**
   * Update version.json after successful update
   *
   * @param {string} newVersion - New version
   * @returns {Promise<void>}
   */
  async updateVersionInfo(newVersion, options = {}) {
    const versionJsonPath = path.join(this.cyryxCoreDir, 'version.json');

    const versionInfo = {
      version: newVersion,
      installedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      mode: this.versionInfo?.mode || 'project-development',
      fileHashes: options.fileHashes || {},
    };
    const versionContent = `${JSON.stringify(versionInfo, null, 2)}\n`;

    if (this.backupDir) {
      await this.journalFrameworkAdditions([{
        path: 'version.json',
        hash: `sha256:${hashString(versionContent)}`,
      }]);
    }
    await fs.outputFile(versionJsonPath, versionContent, 'utf8');
    this.log(`Updated version.json to v${newVersion}`);
  }

  /**
   * Validate installation after update using PostInstallValidator
   *
   * @param {Object} [options] - Validation options
   * @param {boolean} [options.verbose=false] - Show detailed output
   * @returns {Promise<Object>} Validation result
   */
  async validateAfterUpdate(options = {}) {
    const result = {
      success: false,
      integrityScore: 0,
      issues: [],
      preservedIssues: [],
      error: null,
    };

    try {
      const validator = new PostInstallValidator(this.projectRoot, options.sourceDir || null, {
        verifyHashes: true,
        detectExtras: false,
        verbose: options.verbose || this.options.verbose,
        requireSignature: false, // Signature may not be available after npm update
      });

      const report = await validator.validate();
      const expectedPreservedFiles = new Set();
      const preservationIssues = [];
      for (const entry of options.expectedPreservedFiles || []) {
        // A path-only allowance cannot establish that customized bytes survived.
        if (!entry || typeof entry !== 'object' || !/^[a-f0-9]{64}$/i.test(entry.sha256 || '') ||
            !Number.isSafeInteger(entry.size) || entry.size < 0) {
          throw new Error('Expected preserved files require a pre-update SHA256 and size');
        }
        const destination = resolveFrameworkPath(this.cyryxCoreDir, entry.path);
        await assertNoSymlinkPath(this.projectRoot, destination);
        const stat = await lstatOrNull(destination);
        const actual = stat?.isFile() ? await fileIdentity(destination) : null;
        const relativePath = entry.path.replace(/\\/g, '/');
        if (actual && actual.sha256 === entry.sha256.toLowerCase() && actual.size === entry.size) {
          expectedPreservedFiles.add(relativePath);
        } else {
          preservationIssues.push({ type: 'PRESERVATION_MISMATCH', relativePath,
            message: 'Customized file differs from its pre-update bytes' });
        }
      }
      const preservableTypes = new Set(['CORRUPTED_FILE', 'SIZE_MISMATCH']);
      result.preservedIssues = (report.issues || []).filter((issue) =>
        preservableTypes.has(issue.type) &&
        expectedPreservedFiles.has(String(issue.relativePath || '').replace(/\\/g, '/')),
      );
      const preservedIssueSet = new Set(result.preservedIssues);
      result.issues = [...(report.issues || []).filter((issue) => !preservedIssueSet.has(issue)),
        ...preservationIssues];
      result.success = result.issues.length === 0;
      result.integrityScore = report.integrityScore;
      result.report = report;

      if (options.verbose) {
        console.log(formatValidationReport(report, { colors: true }));
      }

      return result;
    } catch (error) {
      result.error = error.message;
      this.log(`Validation failed: ${error.message}`);
      return result;
    }
  }

  /**
   * Log if verbose
   *
   * @param {string} message - Message
   */
  log(message) {
    if (this.options.verbose) {
      console.log(`[CYRYXUpdater] ${message}`);
    }
  }
}

/**
 * Format update check result for console
 *
 * @param {Object} result - Check result
 * @param {Object} [options] - Format options
 * @returns {string} Formatted output
 */
function formatCheckResult(result, options = {}) {
  const useColors = options.colors !== false;

  const c = {
    reset: useColors ? '\x1b[0m' : '',
    bold: useColors ? '\x1b[1m' : '',
    green: useColors ? '\x1b[32m' : '',
    yellow: useColors ? '\x1b[33m' : '',
    red: useColors ? '\x1b[31m' : '',
    cyan: useColors ? '\x1b[36m' : '',
    dim: useColors ? '\x1b[2m' : '',
  };

  const lines = [];

  lines.push('');
  lines.push(`${c.bold}🔍 AEXOS Update Check${c.reset}`);
  lines.push('');

  if (result.installed) {
    lines.push(
      `📦 Current: ${c.cyan}v${result.installed}${c.reset}${result.installedAt ? ` ${c.dim}(installed ${result.installedAt})${c.reset}` : ''}`,
    );
  } else {
    lines.push(`📦 Current: ${c.red}Not installed${c.reset}`);
  }

  if (result.latest) {
    lines.push(`📦 Latest:  ${c.cyan}v${result.latest}${c.reset}`);
  }

  lines.push('');

  switch (result.status) {
    case UpdateStatus.UP_TO_DATE:
      lines.push(`${c.green}✓ You're up to date!${c.reset}`);
      break;
    case UpdateStatus.UPDATE_AVAILABLE:
      lines.push(`${c.yellow}⬆ Update available!${c.reset}`);
      lines.push(`  Run ${c.cyan}npx aexos-core update${c.reset} to update.`);
      break;
    case UpdateStatus.UPDATE_REQUIRED:
      lines.push(`${c.red}⚠ Breaking update available!${c.reset}`);
      lines.push('  Review changelog before updating.');
      break;
    case UpdateStatus.CHECK_FAILED:
      lines.push(`${c.red}✗ Check failed: ${result.error}${c.reset}`);
      break;
  }

  lines.push('');

  return lines.join('\n');
}

/**
 * Format update result for console
 *
 * @param {Object} result - Update result
 * @param {Object} [options] - Format options
 * @returns {string} Formatted output
 */
function formatUpdateResult(result, options = {}) {
  const useColors = options.colors !== false;

  const c = {
    reset: useColors ? '\x1b[0m' : '',
    bold: useColors ? '\x1b[1m' : '',
    green: useColors ? '\x1b[32m' : '',
    yellow: useColors ? '\x1b[33m' : '',
    red: useColors ? '\x1b[31m' : '',
    cyan: useColors ? '\x1b[36m' : '',
    dim: useColors ? '\x1b[2m' : '',
  };

  const lines = [];

  lines.push('');

  if (result.success) {
    if (result.dryRun) {
      lines.push(`${c.bold}📋 Update Preview (dry-run)${c.reset}`);
    } else {
      lines.push(`${c.green}${c.bold}✅ Updated to v${result.newVersion}${c.reset}`);
    }

    lines.push('');
    lines.push(`  ${c.dim}Previous:${c.reset} v${result.previousVersion}`);
    lines.push(`  ${c.dim}New:${c.reset}      v${result.newVersion}`);

    if (result.filesUpdated > 0) {
      lines.push(`  ${c.dim}Files:${c.reset}    ${result.filesUpdated} updated`);
    }
    if (result.filesPreserved > 0) {
      lines.push(`  ${c.yellow}Preserved:${c.reset} ${result.filesPreserved} customizations`);
    }

    lines.push('');
    lines.push(`Run ${c.cyan}npx aexos-core validate${c.reset} to verify installation.`);
  } else {
    lines.push(`${c.red}${c.bold}✗ Update failed${c.reset}`);
    lines.push('');
    lines.push(`  ${c.red}Error: ${result.error}${c.reset}`);

    if (result.rollbackAvailable) {
      if (result.rollback && !result.rollback.frameworkRestored) {
        lines.push(
          `  ${c.red}Rollback incomplete: ${result.rollback.frameworkAdditionsPreserved} changed update-created framework file(s) were preserved.${c.reset}`,
        );
      } else if (result.rollback?.complete) {
        lines.push(`${c.yellow}Framework, manifests, and dependencies restored.${c.reset}`);
      } else if (result.rollback) {
        lines.push(`${c.yellow}Framework, manifests, and core package restored.${c.reset}`);
      } else {
        lines.push(`  ${c.yellow}Rollback remains available.${c.reset}`);
      }
      if (result.rollback?.dependencyReinstallRequired) {
        lines.push(
          `  ${c.yellow}Dependencies were not restored${result.rollback.dependencyError ? `: ${result.rollback.dependencyError}` : '; run npm install to reconcile them'}.${c.reset}`,
        );
      }
    }
  }

  lines.push('');

  return lines.join('\n');
}

module.exports = {
  CYRYXUpdater,
  UpdateStatus,
  FileAction,
  formatCheckResult,
  formatUpdateResult,
  resolveNpmInvocation,
  selectInstalledManifest,
};
