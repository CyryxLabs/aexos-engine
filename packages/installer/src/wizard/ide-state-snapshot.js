'use strict';

const fs = require('fs-extra');
const path = require('path');

// Snapshot only installation-owned surfaces. Rollback never removes a directory
// recursively: an unrelated file created during installation must survive.
const SURFACES = {
  'claude-code': ['.claude/CLAUDE.md', '.claude/settings.local.json', '.claude/commands/AEXOS', '.claude/agents', '.claude/rules', '.claude/hooks', '.claude/templates'],
  codex: ['AGENTS.md', '.codex/agents', '.codex/skills'],
  grok: ['.grok'],
  gemini: ['.gemini'],
  cursor: ['.cursor/rules'],
  'github-copilot': ['.github/copilot-instructions.md', '.github/agents'],
  antigravity: ['.antigravity', '.agent/workflows'],
};

async function captureIdeState(projectRoot, selectedIDEs) {
  const root = path.resolve(projectRoot);
  const files = new Map();
  const directories = new Set();
  const journalFiles = new Set();
  const journalDirectories = new Set();
  function contained(file) {
    const full = path.resolve(file);
    const relative = path.relative(root, full);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error('IDE recovery path escapes project root');
    }
    return full;
  }
  async function lstatOrNull(file) {
    try {
      return await fs.lstat(file);
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }
  const initialRootStat = await lstatOrNull(root);
  if (!initialRootStat) {
    throw new Error(`IDE project root does not exist: ${root}`);
  }
  if (initialRootStat.isSymbolicLink() || !initialRootStat.isDirectory()) {
    throw new Error(`IDE project root must be a real directory: ${root}`);
  }
  const rootIdentity = {
    dev: initialRootStat.dev,
    ino: initialRootStat.ino,
    birthtimeMs: initialRootStat.birthtimeMs,
  };
  async function validateRoot() {
    const stat = await lstatOrNull(root);
    if (!stat) throw new Error(`IDE project root no longer exists: ${root}`);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(`Unsafe IDE project root: ${root}`);
    }
    if (
      stat.dev !== rootIdentity.dev ||
      stat.ino !== rootIdentity.ino ||
      stat.birthtimeMs !== rootIdentity.birthtimeMs
    ) {
      throw new Error(`IDE project root identity changed: ${root}`);
    }
  }
  async function validateAncestors(file) {
    await validateRoot();
    const full = contained(file);
    const relative = path.relative(root, path.dirname(full));
    let current = root;
    for (const component of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, component);
      const stat = await lstatOrNull(current);
      if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) {
        throw new Error(`Unsafe IDE destination parent: ${current}`);
      }
    }
    return full;
  }
  async function ensureSafeParent(file) {
    await validateRoot();
    const full = contained(file);
    const relative = path.relative(root, path.dirname(full));
    let current = root;
    for (const component of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, component);
      const stat = await lstatOrNull(current);
      if (stat) {
        if (stat.isSymbolicLink() || !stat.isDirectory()) {
          throw new Error(`Unsafe IDE destination parent: ${current}`);
        }
      } else {
        await fs.mkdir(current);
        const created = await fs.lstat(current);
        if (created.isSymbolicLink() || !created.isDirectory()) {
          throw new Error(`Unsafe IDE recovery directory: ${current}`);
        }
      }
    }
  }
  async function inspect(file) {
    let stat;
    try { stat = await fs.lstat(file); } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error(`IDE destination must not be a link: ${file}`);
    if (stat.isDirectory()) {
      directories.add(file);
      for (const child of await fs.readdir(file)) await inspect(path.join(file, child));
    } else if (stat.isFile()) {
      files.set(file, { bytes: await fs.readFile(file), mode: stat.mode });
    } else throw new Error(`IDE destination must be a regular file: ${file}`);
  }
  for (const ide of selectedIDEs) {
    if (!SURFACES[ide]) throw new Error(`IDE configuration not found: ${ide}`);
    for (const surface of SURFACES[ide]) {
      const full = contained(path.join(root, surface));
      // Reject linked parents even when the target file is absent.
      for (let parent = path.dirname(full); parent !== root; parent = path.dirname(parent)) {
        try {
          const stat = await fs.lstat(parent);
          if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Unsafe IDE destination parent: ${parent}`);
          directories.add(parent);
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      await inspect(full);
    }
  }
  const journal = {
    async registerFile(file) {
      const full = await validateAncestors(file);
      const stat = await lstatOrNull(full);
      if (stat) {
        if (stat.isSymbolicLink() || !stat.isFile()) {
          throw new Error(`IDE destination must be a regular file: ${full}`);
        }
        if (!files.has(full) && !journalFiles.has(full)) {
          files.set(full, { bytes: await fs.readFile(full), mode: stat.mode });
        }
      } else {
        journalFiles.add(full);
      }
      return full;
    },
    async registerDirectory(folder) {
      await validateRoot();
      const full = contained(folder);
      const relative = path.relative(root, full);
      let current = root;
      for (const component of relative.split(path.sep).filter(Boolean)) {
        current = path.join(current, component);
        const stat = await lstatOrNull(current);
        if (stat) {
          if (stat.isSymbolicLink() || !stat.isDirectory()) {
            throw new Error(`Unsafe IDE destination directory: ${current}`);
          }
        } else {
          journalDirectories.add(current);
        }
      }
      return full;
    },
  };
  return {
    journal,
    async rollback(createdFiles = [], createdFolders = []) {
      const failures = [];
      const attempt = async (file, action) => {
        try { await action(); } catch (error) { failures.push({ path: file, error: error.message }); }
      };
      for (const [file, original] of files) await attempt(file, async () => {
        await validateAncestors(file);
        const current = await lstatOrNull(file);
        if (current?.isSymbolicLink() || (current && !current.isFile())) throw new Error('Recovery destination is not a regular file');
        if (!current || !(await fs.readFile(file)).equals(original.bytes)) {
          await ensureSafeParent(file);
          await fs.writeFile(file, original.bytes);
          await fs.chmod(file, original.mode);
        }
      });
      const removeDirs = new Set([
        ...createdFolders.map(contained),
        ...journalDirectories,
      ]);
      const removeFiles = new Set([...createdFiles.map(contained), ...journalFiles]);
      for (const candidate of [...removeFiles].reverse()) await attempt(candidate, async () => {
        const file = contained(candidate);
        if (files.has(file)) return;
        await validateAncestors(file);
        const stat = await lstatOrNull(file);
        if (!stat) return;
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Refusing to remove non-regular generated artifact');
        await fs.unlink(file);
        for (let parent = path.dirname(file); parent !== root && !directories.has(parent); parent = path.dirname(parent)) removeDirs.add(parent);
      });
      for (const folder of [...removeDirs].sort((a, b) => b.length - a.length)) {
        if (directories.has(folder)) continue;
        await attempt(folder, async () => {
          await validateAncestors(folder);
          const stat = await lstatOrNull(folder);
          if (!stat) return;
          if (stat.isSymbolicLink() || !stat.isDirectory()) {
            throw new Error('Refusing to remove non-directory generated artifact');
          }
          try { await fs.rmdir(folder); } catch (error) {
            // Preserve unrelated/new contents, and report that recovery is partial.
            if (error.code !== 'ENOENT') throw error;
          }
        });
      }
      return failures;
    },
  };
}

module.exports = { captureIdeState };
