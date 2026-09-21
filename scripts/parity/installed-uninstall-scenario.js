#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function snapshotTree(root) {
  const result = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(directory, entry.name);
      const relative = path.relative(root, full).split(path.sep).join('/');
      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) result.push([relative, 'link', fs.readlinkSync(full)]);
      else if (entry.isDirectory()) { result.push([relative, 'dir']); visit(full); }
      else result.push([relative, 'file', fs.readFileSync(full).toString('base64')]);
    }
  }
  visit(root);
  return result;
}

function runCli(cli, cwd, args) {
  return spawnSync(process.execPath, [cli, 'uninstall', '--force', '--quiet', ...args], {
    cwd, encoding: 'utf8', env: { ...process.env, HOME: cwd, USERPROFILE: cwd },
  });
}

async function run() {
  const installedRoot = path.resolve(process.argv[2] || '');
  const consumerRoot = path.resolve(process.argv[3] || '');
  assert(process.argv[2], 'installedRoot argv is required');
  assert(process.argv[3], 'consumerRoot argv is required');
  assert(fs.statSync(installedRoot).isDirectory(), 'installedRoot must be a directory');
  fs.mkdirSync(consumerRoot, { recursive: true });
  const scenarioRoot = fs.mkdtempSync(path.join(consumerRoot, 'installed-uninstall-'));
  const assertions = [];
  const checks = {};

  try {
    fs.cpSync(path.join(installedRoot, '.aexos-core'), path.join(scenarioRoot, '.aexos-core'), { recursive: true });
    fs.mkdirSync(path.join(scenarioRoot, '.aexos'), { recursive: true });
    fs.writeFileSync(path.join(scenarioRoot, '.aexos', 'retained.json'), '{"retained":true}\n');
    fs.mkdirSync(path.join(scenarioRoot, '.grok', 'rules'), { recursive: true });
    fs.writeFileSync(path.join(scenarioRoot, '.grok', 'rules', 'aexos-core.md'), '# Consumer rule\n');
    fs.writeFileSync(path.join(scenarioRoot, '.grok', 'config.toml'), 'consumer_setting = true\n');

    const { syncGrok } = require(path.join(installedRoot, '.aexos-core/infrastructure/scripts/grok-skills-sync/index.js'));
    const sync = syncGrok({ projectRoot: scenarioRoot, grokRoot: path.join(scenarioRoot, '.grok'), quiet: true });
    assert(sync.files > 0, 'installed Grok generator wrote no files');
    const manifestPath = path.join(scenarioRoot, '.grok', 'aexos-managed.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const customized = manifest.files.find((entry) => entry.mode === 'full');
    assert(customized, 'Grok manifest has no full-file entry');
    fs.appendFileSync(path.join(scenarioRoot, '.grok', ...customized.path.split('/')), '\nconsumer customization\n');
    fs.writeFileSync(path.join(scenarioRoot, '.grok', 'consumer-only.txt'), 'preserve');

    const templateSource = path.join(installedRoot, '.claude', 'templates', 'agent-template.yaml');
    assert(fs.existsSync(templateSource), 'installed Claude template ownership source is missing');
    const templateRoot = path.join(scenarioRoot, '.claude', 'templates');
    fs.mkdirSync(templateRoot, { recursive: true });
    fs.copyFileSync(templateSource, path.join(templateRoot, 'agent-template.yaml'));
    fs.copyFileSync(path.join(installedRoot, '.claude', 'templates', 'story-tmpl.yaml'), path.join(templateRoot, 'story-tmpl.yaml'));
    fs.appendFileSync(path.join(templateRoot, 'story-tmpl.yaml'), '\n# consumer customization\n');
    fs.writeFileSync(path.join(templateRoot, 'consumer.md'), 'preserve');
    const commandRoot = path.join(scenarioRoot, '.claude', 'commands', 'AEXOS', 'scripts');
    const commandSource = path.join(installedRoot, '.claude', 'commands', 'AEXOS', 'scripts');
    fs.mkdirSync(commandRoot, { recursive: true });
    fs.copyFileSync(path.join(commandSource, 'agent-config-loader.js'), path.join(commandRoot, 'agent-config-loader.js'));
    fs.appendFileSync(path.join(commandRoot, 'agent-config-loader.js'), '\n// consumer customization\n');
    fs.copyFileSync(path.join(commandSource, 'generate-greeting.js'), path.join(commandRoot, 'generate-greeting.js'));

    const cli = path.join(installedRoot, 'bin', 'aexos.js');
    const beforeDryRun = snapshotTree(scenarioRoot);
    const dryRun = runCli(cli, scenarioRoot, ['--keep-data', '--dry-run']);
    assert.equal(dryRun.status, 0, dryRun.stderr || dryRun.stdout);
    assert.deepEqual(snapshotTree(scenarioRoot), beforeDryRun, 'dry-run changed consumer files');
    assertions.push('installed CLI dry-run was byte-for-byte read only');

    const uninstall = runCli(cli, scenarioRoot, ['--keep-data']);
    assert.equal(uninstall.status, 0, uninstall.stderr || uninstall.stdout);
    assert.equal(fs.existsSync(path.join(scenarioRoot, '.aexos-core')), false);
    assert.equal(fs.readFileSync(path.join(scenarioRoot, '.aexos', 'retained.json'), 'utf8'), '{"retained":true}\n');
    assert.match(fs.readFileSync(path.join(scenarioRoot, '.grok', ...customized.path.split('/')), 'utf8'), /consumer customization/);
    assert.equal(fs.readFileSync(path.join(scenarioRoot, '.grok', 'consumer-only.txt'), 'utf8'), 'preserve');
    assert.equal(fs.readFileSync(path.join(scenarioRoot, '.grok', 'rules', 'aexos-core.md'), 'utf8').trim(), '# Consumer rule');
    assert.equal(fs.readFileSync(path.join(scenarioRoot, '.grok', 'config.toml'), 'utf8').trim(), 'consumer_setting = true');
    assert.equal(fs.existsSync(path.join(templateRoot, 'agent-template.yaml')), false);
    assert.match(fs.readFileSync(path.join(templateRoot, 'story-tmpl.yaml'), 'utf8'), /consumer customization/);
    assert.equal(fs.readFileSync(path.join(templateRoot, 'consumer.md'), 'utf8'), 'preserve');
    assert.match(fs.readFileSync(path.join(commandRoot, 'agent-config-loader.js'), 'utf8'), /consumer customization/);
    assert.equal(fs.existsSync(path.join(commandRoot, 'generate-greeting.js')), false);
    assertions.push('installed CLI removed intact managed artifacts and retained project data plus customized Grok/template content');
    checks.installedManagedUninstall = {
      status: 'passed',
      generatedGrokFiles: sync.files,
      customizedGrokPath: customized.path,
      boundary: 'Temporary consumer only; no global profile or checkout uninstall.',
    };
    return { success: true, assertions, checks, isolated_consumer: scenarioRoot };
  } finally {
    if (process.env.AEXOS_PARITY_KEEP_WORK !== '1') {
      fs.rmSync(scenarioRoot, { recursive: true, force: true });
    }
  }
}

run().then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
  process.stdout.write(`${JSON.stringify({ success: false, assertions: [], checks: {}, error: error.message })}\n`);
  process.exitCode = 1;
});
