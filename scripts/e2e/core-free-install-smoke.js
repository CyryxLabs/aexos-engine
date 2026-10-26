#!/usr/bin/env node

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const manifest = require('../../.aexos-core/data/core-package-boundary.json');
const packageName = require('../../package.json').name;
const packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-core-free-pack-'));
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-core-free-install-'));
const projectRoot = path.join(tempRoot, 'project');

function fail(message, result) {
  const details = result
    ? `\nERROR:\n${result.error?.message || ''}\nSTDOUT:\n${result.stdout || ''}\nSTDERR:\n${result.stderr || ''}`
    : '';
  throw new Error(`${message}${details}`);
}

function runNpm(args, options = {}) {
  if (process.env.npm_execpath) {
    return run(process.execPath, [process.env.npm_execpath, ...args], options);
  }
  return run('npm', args, options);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    encoding: 'utf8',
    timeout: options.timeout || 300000,
    maxBuffer: 30 * 1024 * 1024,
    env: { ...process.env, ...(options.env || {}) },
  });
  if (result.error || result.status !== 0) {
    fail(`Command failed: ${command} ${args.join(' ')}`, result);
  }
  return result.stdout;
}

function directories(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function main() {
  try {
    fs.mkdirSync(projectRoot, { recursive: true });
    runNpm(['pack', '--pack-destination', packDir], { timeout: 300000 });
    const tarballs = fs.readdirSync(packDir).filter((file) => file.endsWith('.tgz'));
    if (tarballs.length !== 1) fail(`Expected one tarball, found ${tarballs.length}.`);
    runNpm(['init', '-y'], { cwd: projectRoot });
    runNpm([
      'install', path.join(packDir, tarballs[0]), '--ignore-scripts', '--no-audit',
      '--fund=false', '--package-lock=false',
    ], { cwd: projectRoot, timeout: 420000 });

    const installed = path.join(projectRoot, 'node_modules', ...packageName.split('/'));
    const installedAgents = fs.readdirSync(path.join(installed, '.aexos-core', 'development', 'agents'))
      .filter((file) => file.endsWith('.md'))
      .map((file) => path.basename(file, '.md'))
      .sort();
    if (JSON.stringify(installedAgents) !== JSON.stringify([...manifest.canonicalAgents].sort())) {
      fail('Installed canonical agent set differs from Core Free manifest.');
    }
    const installedSquads = directories(path.join(installed, 'squads'));
    if (JSON.stringify(installedSquads) !== JSON.stringify(manifest.bundledSquads)) {
      fail(`Installed squads differ from Core Free manifest: ${installedSquads.join(', ')}`);
    }
    for (const projection of [
      path.join(installed, '.claude', 'commands', 'AEXOS', 'squads'),
      path.join(installed, '.claude', 'skills', 'AEXOS', 'squads'),
    ]) {
      if (JSON.stringify(directories(projection)) !== JSON.stringify(manifest.bundledSquads)) {
        fail(`Installed projection contains non-Core squads: ${projection}`);
      }
    }

    const help = run(process.execPath, [path.join(installed, 'bin', 'aexos.js'), '--help'], {
      cwd: projectRoot,
    });
    if (!help.includes('AEXOS')) fail('Installed CLI help did not execute.');

    const scaffoldTarget = path.join(tempRoot, 'scaffolded');
    fs.mkdirSync(scaffoldTarget, { recursive: true });
    const { scaffoldCoreSquads } = require(
      path.join(installed, 'packages', 'installer', 'src', 'installer', 'squad-scaffolder.js'),
    );
    const result = await scaffoldCoreSquads(scaffoldTarget, {
      sourceDir: path.join(installed, 'squads'),
    });
    if (!result.success || JSON.stringify(result.copied) !== JSON.stringify(['security'])) {
      fail(`Installed scaffolder did not copy exactly Security: ${JSON.stringify(result)}`);
    }
    if (JSON.stringify(directories(path.join(scaffoldTarget, 'squads'))) !== JSON.stringify(['security'])) {
      fail('Scaffold target contains a non-Core squad.');
    }

    console.log('CORE FREE CLEAN INSTALL: PASS');
    console.log(`Canonical agents: ${installedAgents.length}`);
    console.log(`Bundled squads: ${installedSquads.join(', ')}`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.rmSync(packDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
