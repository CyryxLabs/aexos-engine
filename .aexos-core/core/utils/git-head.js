'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Read Git's ordinary files afresh instead of starting a Windows Git launcher
// for every decision context. Unusual layouts/configuration retain Git itself
// as the authority. There is deliberately no cache across sessions or roots.
function readGitHead(cwd = process.cwd()) {
  const hash = value => /^[a-f\d]{40}(?:[a-f\d]{24})?$/i.test(value);
  try {
    if (Object.keys(process.env).some(key => /^GIT_(?:DIR|WORK_TREE|COMMON_DIR|NAMESPACE|CEILING_DIRECTORIES|DISCOVERY_ACROSS_FILESYSTEM|CONFIG_PARAMETERS)$/.test(key))) {
      throw new Error('Explicit Git context requires Git resolution');
    }
    const configCount = Number(process.env.GIT_CONFIG_COUNT || 0);
    if (!Number.isInteger(configCount) || configCount < 0 || configCount > 100) throw new Error('Unsupported Git configuration');
    for (let index = 0; index < configCount; index++) {
      // safe.directory affects Git's configuration/command trust, not HEAD's
      // bytes. This read-only path never executes repository configuration.
      if (process.env[`GIT_CONFIG_KEY_${index}`] !== 'safe.directory') throw new Error('Explicit Git configuration');
    }
    let root = path.resolve(cwd);
    while (!fs.existsSync(path.join(root, '.git'))) {
      if (fs.existsSync(path.join(root, 'HEAD')) && fs.existsSync(path.join(root, 'objects')) &&
          fs.existsSync(path.join(root, 'config'))) throw new Error('Bare repository requires Git resolution');
      const parent = path.dirname(root);
      if (parent === root) throw new Error('No Git marker');
      root = parent;
    }
    const marker = path.join(root, '.git');
    const gitDir = fs.statSync(marker).isDirectory() ? marker : (() => {
      const match = /^gitdir: (.+)\s*$/m.exec(fs.readFileSync(marker, 'utf8'));
      if (!match) throw new Error('Unsupported Git marker');
      return path.resolve(root, match[1].trim());
    })();
    const commonPath = path.join(gitDir, 'commondir');
    const commonDir = fs.existsSync(commonPath)
      ? path.resolve(gitDir, fs.readFileSync(commonPath, 'utf8').trim()) : gitDir;
    let value = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    for (let depth = 0; depth < 5; depth++) {
      if (hash(value)) return value;
      const reference = /^ref: (refs\/[\w./-]+)$/.exec(value)?.[1];
      if (!reference || reference.split('/').some(segment => !segment || segment === '..' || segment === '.')) {
        throw new Error('Unsupported symbolic ref');
      }
      const loose = [gitDir, commonDir].map(directory => path.join(directory, reference)).find(file => fs.existsSync(file));
      if (loose) { value = fs.readFileSync(loose, 'utf8').trim(); continue; }
      const packed = fs.readFileSync(path.join(commonDir, 'packed-refs'), 'utf8');
      const row = packed.split(/\r?\n/).find(line => line.split(' ')[1] === reference);
      value = row?.split(' ')[0] || '';
    }
    throw new Error('Unresolved Git HEAD');
  } catch (_) {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  }
}

module.exports = { readGitHead };
