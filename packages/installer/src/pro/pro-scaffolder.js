/**
 * Pro Content Scaffolder
 *
 * Copies premium content (squads, configs, feature registry) from
 * node_modules/@aexos/pro/ into the user's project after
 * license activation.
 *
 * @module packages/installer/src/pro/pro-scaffolder
 * @story INS-3.1 — Implement Pro Content Scaffolder
 */

'use strict';

const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');
const { hashFileAsync } = require('../installer/file-hasher');
const { ensureProjectNodeModulesLink } = require('../installer/aexos-core-installer');

/**
 * Directories excluded from scaffolding (private/internal squads).
 */
const SCAFFOLD_EXCLUDES = ['mmos-squad'];

/**
 * Items to scaffold from pro package into user project.
 * Each entry defines source (relative to proSourceDir) and dest (relative to targetDir).
 */
const SCAFFOLD_ITEMS = [
  {
    type: 'directory',
    source: 'squads',
    dest: 'squads',
    description: 'Pro squads',
    required: true,
  },
  {
    type: 'file',
    source: 'pro-config.yaml',
    dest: path.join('.aexos-core', 'pro-config.yaml'),
    description: 'Pro configuration',
    required: true,
  },
  {
    type: 'file',
    source: 'feature-registry.yaml',
    dest: path.join('.aexos-core', 'feature-registry.yaml'),
    description: 'Feature registry',
    required: false,
  },
];

/**
 * Scaffold pro content into user project.
 *
 * @param {string} targetDir - Project root directory
 * @param {string} proSourceDir - Path to pro package content (node_modules/@aexos/pro, with legacy scopes supported by the resolver)
 * @param {Object} [options={}] - Scaffold options
 * @param {Function} [options.onProgress] - Progress callback ({item, status, message})
 * @param {boolean} [options.force=false] - Force overwrite even if content exists
 * @param {Function} [options.beforeCommit] - Internal callback while rollback remains available
 * @returns {Promise<Object>} Scaffold result with copiedFiles, warnings, manifest
 */
async function scaffoldProContent(targetDir, proSourceDir, options = {}) {
  const { onProgress = null, force = false } = options;

  const result = {
    success: false,
    copiedFiles: [],
    skippedFiles: [],
    warnings: [],
    errors: [],
    manifest: null,
    versionInfo: null,
    dependencyResolution: null,
  };

  // Track files for rollback on partial failure
  const rollbackFiles = [];
  const rollbackJournal = new Map();

  // Validate pro source exists
  if (!(await fs.pathExists(proSourceDir))) {
    result.errors.push(
      `Pro package not found at ${proSourceDir}. Run "npx @aexos/core pro setup" or "aexos pro setup" first.`,
    );
    return result;
  }

  try {
    for (const item of SCAFFOLD_ITEMS) {
      const sourcePath = path.join(proSourceDir, item.source);
      const destPath = path.join(targetDir, item.dest);

      // Check source exists
      if (!(await fs.pathExists(sourcePath))) {
        if (item.required) {
          throw new Error(`Required pro content not found: ${item.source}`);
        }
        const warning = `${item.description} (${item.source}) not found in pro package — skipping`;
        result.warnings.push(warning);
        if (onProgress) {
          onProgress({ item: item.source, status: 'warning', message: warning });
        }
        continue;
      }

      if (item.type === 'directory') {
        const copied = await scaffoldDirectory(sourcePath, destPath, {
          force,
          rollbackFiles,
          rollbackJournal,
          baseDir: targetDir,
        });
        result.copiedFiles.push(...copied.copiedFiles);
        result.skippedFiles.push(...copied.skippedFiles);
      } else {
        const copied = await scaffoldFile(sourcePath, destPath, {
          force,
          rollbackFiles,
          rollbackJournal,
          baseDir: targetDir,
        });
        if (copied.skipped) {
          result.skippedFiles.push(copied.relativePath);
        } else {
          result.copiedFiles.push(copied.relativePath);
        }
      }

      if (onProgress) {
        onProgress({
          item: item.source,
          status: 'done',
          message: `${item.description} scaffolded`,
        });
      }
    }

    // Merge pro-config into core-config
    const journalOptions = { rollbackFiles, rollbackJournal, baseDir: targetDir };
    const merged = await mergeProConfig(targetDir, journalOptions);
    if (merged && onProgress) {
      onProgress({
        item: 'pro-config',
        status: 'done',
        message: 'Pro config merged into core-config.yaml',
      });
    }

    // Install squad agent commands to IDEs
    const commandsResult = await installSquadCommands(targetDir, { force, rollbackFiles, rollbackJournal });
    result.skippedFiles.push(...commandsResult.skippedFiles);
    if (commandsResult.installed > 0) {
      result.copiedFiles.push(...commandsResult.files);
      if (onProgress) {
        onProgress({
          item: 'squad-commands',
          status: 'done',
          message: `${commandsResult.installed} squad agent commands installed`,
        });
      }
    }

    const dependencyResolution = await ensureProjectNodeModulesLink({ targetDir });
    result.dependencyResolution = dependencyResolution;
    if (dependencyResolution.linked) {
      rollbackFiles.push(dependencyResolution.path);
      rollbackJournal.set(dependencyResolution.path, null);
    }
    if (dependencyResolution.linked && onProgress) {
      onProgress({
        item: 'squad-dependencies',
        status: 'done',
        message: 'Squad dependency resolution linked',
      });
    } else if (!dependencyResolution.success) {
      result.warnings.push(
        `Squad dependency resolution not linked: ${dependencyResolution.reason}` +
          (dependencyResolution.error ? ` (${dependencyResolution.error})` : ''),
      );
    }

    // Generate pro-version.json (AC4)
    const versionInfo = await generateProVersionJson(targetDir, proSourceDir, result.copiedFiles, journalOptions);
    result.versionInfo = versionInfo;
    result.copiedFiles.push('pro-version.json');

    // Generate pro-installed-manifest.yaml (AC8)
    const manifest = await generateInstalledManifest(targetDir, result.copiedFiles, journalOptions);
    result.manifest = manifest;
    result.copiedFiles.push('pro-installed-manifest.yaml');

    if (options.beforeCommit) await options.beforeCommit();
    result.success = true;
  } catch (error) {
    result.errors.push(error.message);

    // Rollback partially copied files (AC6)
    const rollbackResult = await restoreScaffoldJournal(rollbackJournal);
    if (rollbackResult.errors.length > 0) {
      result.errors.push(`Rollback errors: ${rollbackResult.errors.join(', ')}`);
    }
    result.warnings.push(
      `Scaffolding failed: ${error.message}. ${rollbackResult.removed} files cleaned up; ${rollbackResult.restored} restored.`,
    );
  }

  return result;
}

/**
 * Scaffold a directory recursively with idempotency checks.
 *
 * @param {string} sourceDir - Source directory
 * @param {string} destDir - Destination directory
 * @param {Object} options - Options
 * @returns {Promise<Object>} Result with copiedFiles and skippedFiles
 */
async function scaffoldDirectory(sourceDir, destDir, options = {}) {
  const { force = false, rollbackFiles = [], rollbackJournal, baseDir } = options;
  const copiedFiles = [];
  const skippedFiles = [];

  await assertSafeDestination(destDir, baseDir || destDir);
  const destinationStats = await destinationStat(destDir);
  if (destinationStats && (!destinationStats.isDirectory() || destinationStats.isSymbolicLink())) {
    throw new Error(`Cannot scaffold into linked or non-directory destination: ${destDir}`);
  }
  const sourceStats = await fs.lstat(sourceDir);
  if (!sourceStats.isDirectory() || sourceStats.isSymbolicLink()) {
    throw new Error(`Cannot scaffold a non-regular source directory: ${sourceDir}`);
  }
  await fs.ensureDir(destDir);

  const items = await fs.readdir(sourceDir, { withFileTypes: true });

  for (const item of items) {
    // Skip excluded directories (e.g. private squads)
    if (SCAFFOLD_EXCLUDES.includes(item.name)) {
      continue;
    }

    const sourcePath = path.join(sourceDir, item.name);
    const destPath = path.join(destDir, item.name);

    if (item.isDirectory()) {
      const sub = await scaffoldDirectory(sourcePath, destPath, options);
      copiedFiles.push(...sub.copiedFiles);
      skippedFiles.push(...sub.skippedFiles);
    } else {
      const result = await scaffoldFile(sourcePath, destPath, { force, rollbackFiles, rollbackJournal, baseDir });
      if (result.skipped) {
        skippedFiles.push(result.relativePath);
      } else {
        copiedFiles.push(result.relativePath);
      }
    }
  }

  return { copiedFiles, skippedFiles };
}

/**
 * Scaffold a single file with idempotency (AC5).
 * Preserve every existing destination unless overwrite is explicitly requested.
 *
 * @param {string} sourcePath - Source file path
 * @param {string} destPath - Destination file path
 * @param {Object} options - Options
 * @returns {Promise<Object>} Result with relativePath and skipped flag
 */
async function scaffoldFile(sourcePath, destPath, options = {}) {
  const { force = false, rollbackFiles = [], rollbackJournal, baseDir } = options;
  const base = baseDir || path.resolve(destPath, '..', '..');
  const relativePath = path.relative(base, destPath).replace(/\\/g, '/');

  await assertSafeDestination(destPath, base);
  const existing = await destinationStat(destPath);
  if (!force && existing) {
    return { relativePath, skipped: true };
  }
  if (existing && !existing.isFile()) {
    throw new Error(`Cannot overwrite non-regular scaffold destination: ${relativePath}`);
  }
  const sourceStats = await fs.lstat(sourcePath);
  if (!sourceStats.isFile() || sourceStats.isSymbolicLink()) {
    throw new Error(`Cannot scaffold a non-regular source file: ${sourcePath}`);
  }

  await fs.ensureDir(path.dirname(destPath));
  await recordRollbackFile(destPath, rollbackJournal);
  await fs.copyFile(sourcePath, destPath, existing ? 0 : fs.constants.COPYFILE_EXCL);
  if (!existing) recordCreatedFile(destPath, rollbackFiles, rollbackJournal);

  return { relativePath, skipped: false };
}

/**
 * Generate pro-version.json with SHA256 hashes for version tracking (AC4).
 *
 * @param {string} targetDir - Project root
 * @param {string} proSourceDir - Pro package directory
 * @param {string[]} copiedFiles - List of copied file relative paths
 * @returns {Promise<Object>} Version info object
 */
async function generateProVersionJson(targetDir, proSourceDir, copiedFiles, options = {}) {
  // Read pro package version
  let proVersion = 'unknown';
  const proPkgPath = path.join(proSourceDir, 'package.json');
  if (await fs.pathExists(proPkgPath)) {
    try {
      const proPkg = await fs.readJson(proPkgPath);
      proVersion = proPkg.version || 'unknown';
    } catch {
      // Keep 'unknown'
    }
  }

  // Generate hashes for all copied files
  const fileHashes = {};
  for (const relativePath of copiedFiles) {
    const absolutePath = path.join(targetDir, relativePath);
    try {
      if (await fs.pathExists(absolutePath)) {
        const stats = await fs.stat(absolutePath);
        if (stats.isFile()) {
          fileHashes[relativePath] = `sha256:${await hashFileAsync(absolutePath)}`;
        }
      }
    } catch {
      // Skip unhashable files
    }
  }

  const versionInfo = {
    proVersion,
    installedAt: new Date().toISOString(),
    fileCount: copiedFiles.length,
    fileHashes,
  };

  const versionPath = path.join(targetDir, 'pro-version.json');
  await writeScaffoldData(versionPath, `${JSON.stringify(versionInfo, null, 2)}\n`, { ...options, baseDir: targetDir });

  return versionInfo;
}

/**
 * Generate pro-installed-manifest.yaml listing all scaffolded files (AC8).
 *
 * @param {string} targetDir - Project root
 * @param {string[]} copiedFiles - List of copied file relative paths
 * @returns {Promise<Object>} Manifest object
 */
async function generateInstalledManifest(targetDir, copiedFiles, options = {}) {
  const files = [];
  for (const relativePath of copiedFiles) {
    const absolutePath = path.join(targetDir, relativePath);
    let timestamp = new Date().toISOString();
    try {
      if (await fs.pathExists(absolutePath)) {
        const stats = await fs.stat(absolutePath);
        timestamp = stats.mtime.toISOString();
      }
    } catch {
      // Use current time
    }
    files.push({ path: relativePath, timestamp });
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    totalFiles: files.length,
    files,
  };

  const manifestPath = path.join(targetDir, 'pro-installed-manifest.yaml');
  await writeScaffoldData(manifestPath, yaml.dump(manifest), { ...options, baseDir: targetDir });

  return manifest;
}

/**
 * Capture the original bytes before a bounded write. Snapshots stay in memory.
 * Unreadable existing files fail before mutation rather than granting overwrite.
 * @param {string} filePath - Exact destination being written
 * @param {Array} rollbackFiles - Journal shared by the current scaffold operation
 */
async function recordRollbackFile(filePath, rollbackJournal) {
  if (rollbackJournal?.has(filePath)) return;
  const existing = await destinationStat(filePath);
  if (existing && !existing.isFile()) {
    throw new Error(`Cannot overwrite non-regular scaffold destination: ${filePath}`);
  }
  if (rollbackJournal && existing) {
    const snapshot = { content: await fs.readFile(filePath), mode: existing.mode };
    rollbackJournal.set(filePath, snapshot);
  }
}

function recordCreatedFile(filePath, rollbackFiles, rollbackJournal) {
  rollbackFiles.push(filePath);
  if (rollbackJournal) rollbackJournal.set(filePath, null);
}

async function assertSafeDestination(filePath, baseDir) {
  const base = path.resolve(baseDir);
  const destination = path.resolve(filePath);
  const relative = path.relative(base, destination);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Scaffold destination is outside the project: ${filePath}`);
  }
  let current = destination === base ? base : path.dirname(destination);
  while (true) {
    const stats = await destinationStat(current);
    if (stats && (!stats.isDirectory() || stats.isSymbolicLink())) {
      throw new Error(`Scaffold destination has a non-directory or linked ancestor: ${current}`);
    }
    if (current === base) break;
    current = path.dirname(current);
  }
}

async function writeScaffoldData(filePath, content, options) {
  const { rollbackFiles = [], rollbackJournal, baseDir } = options;
  await assertSafeDestination(filePath, baseDir);
  const existing = await destinationStat(filePath);
  await recordRollbackFile(filePath, rollbackJournal);
  if (existing) {
    await fs.writeFile(filePath, content, 'utf8');
  } else {
    const descriptor = await fs.open(filePath, 'wx');
    recordCreatedFile(filePath, rollbackFiles, rollbackJournal);
    try {
      await fs.writeFile(descriptor, content, 'utf8');
    } finally {
      await fs.close(descriptor);
    }
  }
}

async function destinationStat(filePath) {
  try {
    return await fs.lstat(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function restoreScaffoldJournal(journal) {
  const result = { removed: 0, restored: 0, errors: [] };
  for (const [filePath, snapshot] of [...journal].reverse()) {
    try {
      const current = await destinationStat(filePath);
      if (snapshot) {
        if (current?.isSymbolicLink()) await fs.unlink(filePath);
        await fs.writeFile(filePath, snapshot.content);
        await fs.chmod(filePath, snapshot.mode);
        result.restored++;
      } else if (current) {
        // unlink removes new files or junctions, never their targets recursively.
        await fs.unlink(filePath);
        result.removed++;
      }
    } catch (error) {
      result.errors.push(`Failed to restore ${filePath}: ${error.message}`);
    }
  }
  return result;
}

/**
 * Rollback partially scaffolded files on error (AC6).
 *
 * @param {string[]} rollbackFiles - Absolute paths to remove (legacy API)
 * @returns {Promise<Object>} Rollback result with removed count and errors
 */
async function rollbackScaffold(rollbackFiles) {
  let removed = 0;
  const errors = [];

  for (const filePath of rollbackFiles) {
    try {
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
        removed++;
      }
    } catch (error) {
      errors.push(`Failed to remove ${filePath}: ${error.message}`);
    }
  }

  return { removed, errors };
}

/**
 * Merge pro-config.yaml sections into core-config.yaml.
 * Deep merges top-level keys (pro, memory, metrics, integrations, squads).
 *
 * @param {string} targetDir - Project root directory
 * @returns {Promise<boolean>} True if merge was performed
 */
async function mergeProConfig(targetDir, options = {}) {
  const coreConfigPath = path.join(targetDir, '.aexos-core', 'core-config.yaml');
  const proConfigPath = path.join(targetDir, '.aexos-core', 'pro-config.yaml');

  if (!(await fs.pathExists(proConfigPath)) || !(await fs.pathExists(coreConfigPath))) {
    return false;
  }

  const coreConfig = yaml.load(await fs.readFile(coreConfigPath, 'utf8')) || {};
  const proConfig = yaml.load(await fs.readFile(proConfigPath, 'utf8')) || {};

  for (const [key, value] of Object.entries(proConfig)) {
    if (
      coreConfig[key] &&
      typeof coreConfig[key] === 'object' &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      coreConfig[key] = { ...coreConfig[key], ...value };
    } else {
      coreConfig[key] = value;
    }
  }

  await writeScaffoldData(coreConfigPath, yaml.dump(coreConfig, { lineWidth: -1 }), { ...options, baseDir: targetDir });
  return true;
}

/**
 * Install squad agent commands into active IDE directories.
 * Detects which IDEs are configured and copies agent .md files accordingly.
 *
 * @param {string} targetDir - Project root directory
 * @param {Object} [options={}] - Explicit force and shared rollback tracking
 * @returns {Promise<Object>} Result with installed count and file list
 */
async function installSquadCommands(targetDir, options = {}) {
  const { force = false, rollbackFiles = [], rollbackJournal } = options;
  const squadsDir = path.join(targetDir, 'squads');
  if (!(await fs.pathExists(squadsDir))) return { installed: 0, files: [], skippedFiles: [] };

  const ideTargets = [
    {
      check: path.join('.claude', 'commands'),
      dest: (squad) => path.join('.claude', 'commands', squad),
    },
    { check: path.join('.codex', 'agents'), dest: () => path.join('.codex', 'agents') },
    { check: path.join('.gemini', 'rules'), dest: (squad) => path.join('.gemini', 'rules', squad) },
    { check: path.join('.cursor', 'rules'), dest: () => path.join('.cursor', 'rules') },
  ];

  const activeIDEs = [];
  for (const ide of ideTargets) {
    if (await fs.pathExists(path.join(targetDir, ide.check))) {
      activeIDEs.push(ide);
    }
  }
  if (activeIDEs.length === 0) return { installed: 0, files: [], skippedFiles: [] };

  const files = [];
  const skippedFiles = [];
  const items = await fs.readdir(squadsDir, { withFileTypes: true });

  for (const item of items) {
    if (!item.isDirectory()) continue;
    const agentsDir = path.join(squadsDir, item.name, 'agents');
    if (!(await fs.pathExists(agentsDir))) continue;

    const agentFiles = (await fs.readdir(agentsDir)).filter(
      (f) => f.endsWith('.md') && !f.startsWith('test-'),
    );

    for (const ide of activeIDEs) {
      const destDir = path.join(targetDir, ide.dest(item.name));
      await assertSafeDestination(destDir, targetDir);
      const destStats = await destinationStat(destDir);
      if (destStats && (!destStats.isDirectory() || destStats.isSymbolicLink())) {
        throw new Error(`Cannot scaffold commands into linked or non-directory destination: ${destDir}`);
      }
      await fs.ensureDir(destDir);
      for (const agentFile of agentFiles) {
        const copied = await scaffoldFile(path.join(agentsDir, agentFile), path.join(destDir, agentFile), {
          force, rollbackFiles, rollbackJournal, baseDir: targetDir,
        });
        if (copied.skipped) skippedFiles.push(copied.relativePath);
        else files.push(copied.relativePath);
      }
    }
  }

  return { installed: files.length, files, skippedFiles };
}

module.exports = {
  scaffoldProContent,
  scaffoldDirectory,
  scaffoldFile,
  generateProVersionJson,
  generateInstalledManifest,
  rollbackScaffold,
  mergeProConfig,
  installSquadCommands,
  SCAFFOLD_ITEMS,
  SCAFFOLD_EXCLUDES,
};
