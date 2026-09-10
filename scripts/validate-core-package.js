#!/usr/bin/env node

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, '.aexos-core', 'data', 'core-package-boundary.json');

function normalizePath(filePath) {
  return String(filePath).replace(/^package\//, '').replace(/\\/g, '/');
}

function sameStrings(left, right) {
  const a = [...left].sort();
  const b = [...right].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function loadBoundary() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  if (
    manifest.schemaVersion !== 1
    || manifest.product !== 'aexos'
    || manifest.artifact !== 'core-free'
    || !Array.isArray(manifest.canonicalAgents)
    || !Array.isArray(manifest.bundledSquads)
    || !Array.isArray(manifest.protectedSquadRoots)
    || !Array.isArray(manifest.requiredPaths)
    || !Array.isArray(manifest.packageFiles)
  ) {
    throw new Error('Core package boundary manifest is malformed.');
  }
  return manifest;
}

function validateRepositoryBoundary(manifest, options = {}) {
  const root = path.resolve(options.root || ROOT);
  const errors = [];
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (!sameStrings(packageJson.files || [], manifest.packageFiles)) {
    errors.push('package.json files[] differs from the Core Free manifest.');
  }
  const agentsDir = path.join(root, '.aexos-core', 'development', 'agents');
  const actualAgents = fs.readdirSync(agentsDir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => path.basename(name, '.md'));
  if (!sameStrings(actualAgents, manifest.canonicalAgents)) {
    errors.push('Canonical Core agent set differs from the Core Free manifest.');
  }
  if (!sameStrings(manifest.bundledSquads, ['security'])) {
    errors.push('Core Free must bundle exactly the security squad.');
  }
  return { valid: errors.length === 0, errors };
}

function pathPresent(files, required) {
  return required.endsWith('/')
    ? files.some((file) => file.startsWith(required))
    : files.includes(required);
}

function validatePackedFiles(inputFiles, manifest = loadBoundary()) {
  const files = inputFiles.map(normalizePath);
  const errors = [];
  for (const file of files) {
    if (/(^|\/)__pycache__\/|\.py[co]$/i.test(file)) {
      errors.push(`Local runtime cache leaked into Core package: ${file}`);
    }
  }
  for (const required of manifest.requiredPaths) {
    if (!pathPresent(files, required)) errors.push(`Missing required Core path: ${required}`);
  }
  for (const agent of manifest.canonicalAgents) {
    const source = `.aexos-core/development/agents/${agent}.md`;
    if (!files.includes(source)) errors.push(`Missing canonical Core agent: ${agent}`);
  }
  for (const forbidden of manifest.forbiddenPrefixes || []) {
    const leaked = files.find((file) => file.startsWith(forbidden));
    if (leaked) errors.push(`Forbidden Core package path: ${leaked}`);
  }
  for (const root of manifest.protectedSquadRoots) {
    for (const file of files.filter((candidate) => candidate.startsWith(root))) {
      const squad = file.slice(root.length).split('/')[0];
      if (!manifest.bundledSquads.includes(squad)) {
        errors.push(`Paid squad leaked under ${root}: ${squad}`);
      }
    }
  }
  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    fileCount: files.length,
    bundledSquads: [...manifest.bundledSquads],
  };
}

function getPackedFiles() {
  const output = execSync('npm pack --dry-run --json', {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 30 * 1024 * 1024,
    timeout: 300000,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const packed = JSON.parse(output);
  if (!Array.isArray(packed) || !Array.isArray(packed[0]?.files)) {
    throw new Error('npm pack did not return a file manifest.');
  }
  return packed[0].files.map((entry) => entry.path);
}

function main() {
  const manifest = loadBoundary();
  const repository = validateRepositoryBoundary(manifest);
  const packed = validatePackedFiles(getPackedFiles(), manifest);
  const errors = [...repository.errors, ...packed.errors];
  if (errors.length > 0) {
    for (const error of errors) console.error(`FAIL: ${error}`);
    console.error('CORE FREE PACKAGE GATE: FAIL');
    process.exit(1);
  }
  console.log(`PASS: Core Free package contains ${packed.fileCount} files`);
  console.log(`PASS: Bundled squads: ${packed.bundledSquads.join(', ')}`);
  console.log(`PASS: Canonical agents: ${manifest.canonicalAgents.length}`);
  console.log('CORE FREE PACKAGE GATE: PASS');
}

if (require.main === module) main();

module.exports = {
  getPackedFiles,
  loadBoundary,
  normalizePath,
  validatePackedFiles,
  validateRepositoryBoundary,
};
