#!/usr/bin/env node
'use strict';

// Supported semantic entrypoints are proposals only. The transaction runner is
// the sole public writer; semantic-release core must never reach tag creation.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const RELEASE_PACKAGES = ['semantic-release@25.0.9', 'conventional-changelog-conventionalcommits@9.1.0'];
const SAFE_PLUGINS = ['@semantic-release/commit-analyzer', '@semantic-release/release-notes-generator'];

function validatePreview(argv, cwd, allowPayload = false) {
  if (!Array.isArray(argv) || argv.some(arg => !['--dry-run', '--no-ci'].includes(arg))) throw new Error('Only --dry-run and --no-ci are supported. Publish through the sealed release workflow.');
  if (!allowPayload && ![ROOT, path.join(ROOT, 'packages', 'aexos-install')].includes(path.resolve(cwd))) throw new Error('Semantic preview requires a supported repository package directory');
  const config = JSON.parse(fs.readFileSync(path.join(cwd, '.releaserc.json'), 'utf8'));
  if (Object.keys(config).some(key => !['branches', 'tagFormat', 'plugins', 'dryRun', 'ci'].includes(key)) || config.dryRun !== true || config.ci !== false || !Array.isArray(config.plugins) || config.plugins.length !== 2 ||
      config.plugins.some((plugin, index) => !Array.isArray(plugin) || plugin[0] !== SAFE_PLUGINS[index])) throw new Error('Read-only semantic configuration is required');
  for (const name of ['.releaserc', '.releaserc.yaml', '.releaserc.yml', '.releaserc.js', '.releaserc.cjs', '.releaserc.mjs', 'release.config.js', 'release.config.cjs', 'release.config.mjs']) {
    if (fs.existsSync(path.join(cwd, name))) throw new Error('Competing semantic configuration refused');
  }
  if (JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')).release) throw new Error('Package semantic configuration override refused');
  return config;
}

function main(argv = process.argv.slice(2), options = {}) {
  const inputEnv = options.env || process.env;
  const cwd = options.cwd || inputEnv.AEXOS_PROPOSAL_CWD || process.cwd();
  const log = options.console || console;
  const spawn = options.spawnSync || spawnSync;
  const payload = Boolean(inputEnv.AEXOS_PROPOSAL_CWD);
  try {
    if (payload) {
      if (inputEnv.GITHUB_ACTIONS !== 'true' || !/^[a-f0-9]{40}$/.test(inputEnv.AEXOS_PROPOSAL_SHA || '')) throw new Error('Exact CI proposal source required');
      const head = spawn('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8', windowsHide: true });
      if (head.status !== 0 || head.stdout.trim() !== inputEnv.AEXOS_PROPOSAL_SHA) throw new Error('Proposal source differs from requested SHA');
    }
    validatePreview(argv, cwd, payload);
  } catch (error) { log.error(error.message); return 1; }
  const nodeVersion = options.nodeVersion || process.versions.node;
  const [major, minor] = nodeVersion.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 14)) { log.error('Semantic preview requires Node.js 22.14 or newer.'); return 1; }
  const env = Object.fromEntries(Object.entries(inputEnv).filter(([key]) => !/(TOKEN|SECRET|PASSWORD|AUTH|CREDENTIAL|PRIVATE_KEY|SERVICE_ROLE_KEY)/i.test(key) && !/^SEMANTIC_RELEASE/i.test(key)));
  const npmPath = options.npmPath || inputEnv.npm_execpath;
  const command = npmPath ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const args = [...(npmPath ? [npmPath] : []), 'exec', '--yes', ...RELEASE_PACKAGES.flatMap(pkg => ['--package', pkg]), '--', 'semantic-release', '--dry-run', '--no-ci'];
  const result = spawn(command, args, { cwd, env, stdio: 'inherit', windowsHide: true, timeout: 180000 });
  if (result.error) { log.error('Semantic proposal could not complete.'); return 1; }
  // A genuine no-release result exits zero; analysis failure remains nonzero.
  return Number.isInteger(result.status) ? result.status : 1;
}
if (require.main === module) process.exitCode = main();
module.exports = { main, validatePreview, RELEASE_PACKAGES, SAFE_PLUGINS };
