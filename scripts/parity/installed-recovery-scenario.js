#!/usr/bin/env node
'use strict';

// Controlled failure injection against a real installed artifact. This checks
// backup/restore, not a registry upgrade or transitive dependency recovery.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

async function main() {
  const project = path.resolve(process.argv[2]);
  const installedRoot = path.join(project, 'node_modules/@aexos/core');
  const { CYRYXUpdater } = require(path.join(installedRoot, 'packages/installer/src/updater'));
  const updater = new CYRYXUpdater(project);
  const files = [
    path.join(project, '.aexos-core/core/synapse/runtime/hook-runtime.js'),
    path.join(project, '.aexos-core/core-config.yaml'),
    path.join(project, 'package.json'),
    path.join(project, 'package-lock.json'),
    path.join(installedRoot, '.aexos-core/core/synapse/runtime/hook-runtime.js'),
  ];
  const before = files.map(file => fs.readFileSync(file));
  await updater.createBackup();
  for (const file of files) fs.writeFileSync(file, 'PARITY-INJECTED-FAILED-UPDATE\n');
  const unrelated = path.join(project, 'user-created-during-update.txt');
  fs.writeFileSync(unrelated, 'PRESERVE-USER-DATA\n');
  const result = await updater.rollback();
  files.forEach((file, index) => assert(fs.readFileSync(file).equals(before[index]), `Restore failed: ${file}`));
  assert.equal(fs.readFileSync(unrelated, 'utf8'), 'PRESERVE-USER-DATA\n');
  assert.equal(result.frameworkRestored, true);
  assert.equal(result.dependenciesRestored, false);
  assert.equal(result.dependencyReinstallRequired, true);
  await updater.cleanupBackup();
  console.log(JSON.stringify({ assertions: files.length + 4, recovery: result,
    boundary: 'Injected file corruption only; no registry update or dependency-tree rollback claimed' }));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
