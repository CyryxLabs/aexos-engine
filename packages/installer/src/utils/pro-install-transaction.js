'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

async function statOptional(filename) {
  try { return await fs.lstat(filename); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function assertSafePath(filename) {
  const absolute = path.resolve(filename);
  let current = path.parse(absolute).root;
  for (const segment of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const stats = await statOptional(current);
    if (stats?.isSymbolicLink()) throw new Error(`Linked Pro installation destination: ${current}`);
    if (current !== absolute && stats && !stats.isDirectory()) {
      throw new Error(`Non-directory Pro installation ancestor: ${current}`);
    }
  }
}

async function assertContainedLinks(directory, root = directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      const resolved = await fs.realpath(filename);
      const relative = path.relative(root, resolved);
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error(`Dependency link leaves the target dependency tree: ${filename}`);
      }
    } else if (entry.isDirectory()) {
      await assertContainedLinks(filename, root);
    } else if (!entry.isFile()) {
      throw new Error(`Unsupported dependency entry: ${filename}`);
    }
  }
}

/** Owns only this install's backups; never infers ownership from a Pro path. */
async function createProInstallTransaction(targetDir) {
  const target = path.resolve(targetDir);
  await assertSafePath(target);
  await fs.mkdir(target, { recursive: true });
  const canonicalTarget = await fs.realpath(target);
  const lock = path.join(canonicalTarget, '.aexos-pro-install.lock');
  try { await fs.mkdir(lock); } catch (error) {
    throw new Error(`Cannot acquire Pro installation ownership at ${lock}: ${error.code}`);
  }
  let backup;
  const snapshots = [];
  const modules = path.join(canonicalTarget, 'node_modules');
  let modulesExisted = false;
  let modulesPrepared = false;
  let modulesAttempted = false;
  let modulesRestored = false;
  let state = 'prepared';
  let runtimeWarning = null;

  async function snapshot(filename) {
    await assertSafePath(filename);
    const stats = await statOptional(filename);
    if (stats && !stats.isFile()) throw new Error(`Non-file Pro installation destination: ${filename}`);
    const saved = path.join(backup, `file-${snapshots.length}`);
    if (stats) await fs.copyFile(filename, saved);
    snapshots.push({ filename, saved, existed: Boolean(stats), mode: stats?.mode });
  }

  async function restoreFiles() {
    for (const item of snapshots) {
      await assertSafePath(item.filename);
      if (item.existed) {
        await fs.mkdir(path.dirname(item.filename), { recursive: true });
        await fs.copyFile(item.saved, item.filename);
        await fs.chmod(item.filename, item.mode);
      } else {
        await fs.rm(item.filename, { force: true });
      }
    }
  }

  async function restoreDependencies() {
    if (!modulesAttempted || modulesRestored) return;
    await assertSafePath(modules);
    await fs.rm(modules, { recursive: true, force: true });
    if (modulesExisted) await fs.rename(path.join(backup, 'node_modules'), modules);
    modulesRestored = true;
  }

  async function cleanup() {
    await fs.rm(backup, { recursive: true, force: true });
    await fs.rmdir(lock);
  }

  try {
    backup = await fs.mkdtemp(path.join(canonicalTarget, '.aexos-pro-backup-'));
    await snapshot(path.join(canonicalTarget, 'package.json'));
    await snapshot(path.join(canonicalTarget, 'package-lock.json'));
    await snapshot(path.join(canonicalTarget, '.aexos', 'license.cache'));
    try {
      await assertSafePath(modules);
      const stats = await statOptional(modules);
      if (stats && !stats.isDirectory()) throw new Error('Target node_modules is not a directory.');
      modulesExisted = Boolean(stats);
      if (modulesExisted) await assertContainedLinks(modules);
      modulesPrepared = true;
    } catch (error) {
      runtimeWarning = error.message;
    }
  } catch (error) {
    if (backup) await fs.rm(backup, { recursive: true, force: true });
    await fs.rmdir(lock);
    throw new Error(`Cannot prepare Pro installation rollback: ${error.message}`);
  }

  return {
    targetDir: canonicalTarget,
    cachePath: path.join(canonicalTarget, '.aexos', 'license.cache'),
    runtimeWarning,
    get state() { return state; },
    async installRuntime(install) {
      if (state !== 'prepared') throw new Error(`Cannot cache Pro runtime in transaction state ${state}.`);
      if (!modulesPrepared) throw new Error(runtimeWarning);
      // Complete snapshot must succeed before npm can modify any dependency.
      if (modulesExisted) {
        await fs.cp(modules, path.join(backup, 'node_modules'), {
          recursive: true, dereference: false, verbatimSymlinks: true, preserveTimestamps: true,
        });
      }
      modulesAttempted = true;
      state = 'cache-attempted';
      try {
        const installed = await install();
        await restoreFiles();
        return installed;
      } catch (error) {
        try {
          await restoreDependencies();
          await restoreFiles();
        } catch (restoreError) {
          state = 'rollback-failed';
          throw new Error(`Pro runtime rollback failed; backup retained at ${backup}: ${restoreError.message}`);
        }
        throw error;
      }
    },
    async validateCachePath(filename) {
      if (typeof filename !== 'string' || !path.isAbsolute(filename) || path.resolve(filename) !== this.cachePath) {
        throw new Error('License cache writer has an unsupported destination.');
      }
      await assertSafePath(this.cachePath);
      const stats = await statOptional(this.cachePath);
      if (stats && !stats.isFile()) throw new Error('License cache destination is not a regular file.');
    },
    async rollback() {
      if (state === 'committed' || state === 'rolled-back') return;
      try {
        await restoreDependencies();
        await restoreFiles();
        state = 'rolled-back';
        await cleanup();
      } catch (error) {
        state = 'rollback-failed';
        throw new Error(`Pro installation rollback failed; backup retained at ${backup}: ${error.message}`);
      }
    },
    async commit() {
      if (state === 'committed') return null;
      if (state === 'rolled-back' || state === 'rollback-failed') {
        throw new Error(`Cannot commit Pro installation in transaction state ${state}.`);
      }
      state = 'committed';
      try { await cleanup(); return null; } catch (error) {
        return `Pro installed; backup cleanup incomplete at ${backup}: ${error.message}`;
      }
    },
  };
}

module.exports = { createProInstallTransaction };
