#!/usr/bin/env node
'use strict';

const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function sha256(content) {
  return `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
}

function writeJson(destination, value) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, `${JSON.stringify(value, null, 2)}\n`);
}

function runNpm(npmCli, args, cwd) {
  return execFileSync(process.execPath, [npmCli, ...args], {
    cwd,
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 600000,
  });
}

function packFixture(npmCli, fixtureRoot, artifactRoot) {
  const packed = JSON.parse(
    runNpm(npmCli, ['pack', '--json', '--ignore-scripts', '--pack-destination', artifactRoot], fixtureRoot),
  );
  assert.equal(packed.length, 1, `Expected one packed fixture from ${fixtureRoot}`);
  return path.join(artifactRoot, packed[0].filename);
}

function writeDependencyFixture(root, version, marker) {
  writeJson(path.join(root, 'package.json'), {
    name: 'aexos-lifecycle-dependency',
    version,
    main: 'index.js',
  });
  fs.writeFileSync(path.join(root, 'index.js'), `module.exports = ${JSON.stringify(marker)};\n`);
}

function writeOlderCoreFixture(root, version, frameworkPath, frameworkContent) {
  writeJson(path.join(root, 'package.json'), {
    name: '@aexos/core',
    version,
    files: ['.aexos-core/'],
  });
  const source = path.join(root, '.aexos-core', ...frameworkPath.split('/'));
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.writeFileSync(source, frameworkContent);
  const manifest = [
    `version: ${version}`,
    'files:',
    `  - path: ${frameworkPath}`,
    `    hash: ${sha256(frameworkContent)}`,
    '    type: core',
    `    size: ${Buffer.byteLength(frameworkContent)}`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(root, '.aexos-core', 'install-manifest.yaml'), manifest);
}

function seedOlderConsumer(npmCli, consumer, olderCoreTarball, dependencyTarball, fixture) {
  fs.mkdirSync(consumer, { recursive: true });
  writeJson(path.join(consumer, 'package.json'), {
    name: `aexos-lifecycle-${path.basename(consumer)}`,
    version: '1.0.0',
    private: true,
    dependencies: {
      '@aexos/core': `file:${olderCoreTarball}`,
      'aexos-lifecycle-dependency': `file:${dependencyTarball}`,
    },
  });
  runNpm(npmCli, ['install', '--no-audit', '--no-fund'], consumer);

  const target = path.join(consumer, '.aexos-core', ...fixture.frameworkPath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, fixture.frameworkContent);
  fs.copyFileSync(
    path.join(consumer, 'node_modules', '@aexos', 'core', '.aexos-core', 'install-manifest.yaml'),
    path.join(consumer, '.aexos-core', 'install-manifest.yaml'),
  );
  writeJson(path.join(consumer, '.aexos-core', 'version.json'), {
    version: fixture.olderVersion,
    installedAt: '2026-01-01T00:00:00.000Z',
    mode: 'project-development',
    fileHashes: { [fixture.frameworkPath]: sha256(fixture.frameworkContent) },
  });
  return target;
}

function installedVersion(project, packageName) {
  return JSON.parse(
    fs.readFileSync(path.join(project, 'node_modules', ...packageName.split('/'), 'package.json')),
  ).version;
}

async function main() {
  const currentArtifact = path.resolve(process.argv[2] || '');
  assert(fs.existsSync(currentArtifact), 'Pass the current AEXOS .tgz as the first argument');
  const npmCli = process.env.AEXOS_PARITY_NPM_CLI || process.env.npm_execpath;
  assert(npmCli && fs.existsSync(npmCli), 'Set AEXOS_PARITY_NPM_CLI to npm/bin/npm-cli.js');

  const packageRoot = path.resolve(__dirname, '..', '..');
  const currentVersion = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'))).version;
  const [major, minor, patch] = currentVersion.split('.').map(Number);
  const olderVersion = patch > 0
    ? `${major}.${minor}.${patch - 1}`
    : minor > 0
      ? `${major}.${minor - 1}.0`
      : `${Math.max(0, major - 1)}.0.0`;
  assert.notEqual(olderVersion, currentVersion, 'Could not derive an older fixture version');

  const base = process.argv[3] ? path.resolve(process.argv[3]) : os.tmpdir();
  fs.mkdirSync(base, { recursive: true });
  const workRoot = fs.mkdtempSync(path.join(base, 'aexos-installed-lifecycle-'));
  const artifactRoot = path.join(workRoot, 'artifacts');
  fs.mkdirSync(artifactRoot);

  try {
    const frameworkPath = 'core/synapse/runtime/hook-runtime.js';
    const frameworkContent = 'module.exports = "older-runtime";\n';
    const customizedContent = 'module.exports = "owner-customized-runtime";\n';
    const fixture = { frameworkPath, frameworkContent, customizedContent, olderVersion };

    const olderCoreRoot = path.join(workRoot, 'older-core');
    writeOlderCoreFixture(olderCoreRoot, olderVersion, frameworkPath, frameworkContent);
    const olderCoreTarball = packFixture(npmCli, olderCoreRoot, artifactRoot);

    const dependencyV1Root = path.join(workRoot, 'dependency-v1');
    const dependencyV2Root = path.join(workRoot, 'dependency-v2');
    writeDependencyFixture(dependencyV1Root, '1.0.0', 'dependency-v1');
    writeDependencyFixture(dependencyV2Root, '2.0.0', 'dependency-v2');
    const dependencyV1Tarball = packFixture(npmCli, dependencyV1Root, artifactRoot);
    const dependencyV2Tarball = packFixture(npmCli, dependencyV2Root, artifactRoot);

    const { CYRYXUpdater } = require(path.join(packageRoot, 'packages/installer/src/updater'));
    const npmInvocation = { command: process.execPath, prefixArgs: [npmCli] };

    const updateProject = path.join(workRoot, 'successful-update');
    const customizedPath = seedOlderConsumer(
      npmCli,
      updateProject,
      olderCoreTarball,
      dependencyV1Tarball,
      fixture,
    );
    fs.writeFileSync(customizedPath, customizedContent);
    const update = await new CYRYXUpdater(updateProject, { npmInvocation }).update({
      targetVersion: currentVersion,
      packageSpecifier: currentArtifact,
    });
    assert.equal(update.success, true, update.error || 'Older-version update failed');
    assert.equal(update.previousVersion, olderVersion);
    assert.equal(update.newVersion, currentVersion);
    assert.equal(installedVersion(updateProject, '@aexos/core'), currentVersion);
    assert.equal(installedVersion(updateProject, 'aexos-lifecycle-dependency'), '1.0.0');
    assert.equal(fs.readFileSync(customizedPath, 'utf8'), customizedContent);
    assert.equal(update.validationPassed, true);
    assert.deepEqual(update.validationIssues, []);
    assert.deepEqual(
      update.preservedValidationIssues.map((issue) => issue.relativePath),
      [frameworkPath],
    );
    assert.equal(fs.existsSync(path.join(updateProject, '.aexos', 'backup')), true);
    assert.equal(fs.readdirSync(path.join(updateProject, '.aexos', 'backup')).length, 0);

    const recoveryProject = path.join(workRoot, 'interrupted-update');
    const recoveryFrameworkPath = seedOlderConsumer(
      npmCli,
      recoveryProject,
      olderCoreTarball,
      dependencyV1Tarball,
      fixture,
    );
    fs.writeFileSync(recoveryFrameworkPath, customizedContent);
    const interrupted = new CYRYXUpdater(recoveryProject, { npmInvocation });
    await interrupted.createBackup();
    await interrupted.updateBackupState({ phase: 'installing-package', targetVersion: currentVersion });
    runNpm(
      npmCli,
      ['install', currentArtifact, '--save-exact', '--prefer-offline', '--no-audit', '--no-fund'],
      recoveryProject,
    );
    runNpm(
      npmCli,
      ['install', dependencyV2Tarball, '--save-exact', '--prefer-offline', '--no-audit', '--no-fund'],
      recoveryProject,
    );
    fs.writeFileSync(recoveryFrameworkPath, 'module.exports = "interrupted-runtime";\n');
    const userFile = path.join(recoveryProject, 'user-created-during-update.txt');
    fs.writeFileSync(userFile, 'PRESERVE-USER-DATA\n');

    const recovery = await new CYRYXUpdater(recoveryProject, { npmInvocation })
      .recoverInterruptedUpdate();
    assert.equal(recovery.recovered, true);
    assert.equal(recovery.complete, true, recovery.dependencyError || 'Recovery incomplete');
    assert.equal(recovery.dependenciesRestored, true);
    assert.equal(recovery.dependencyCommand, 'ci');
    assert.equal(installedVersion(recoveryProject, '@aexos/core'), olderVersion);
    assert.equal(installedVersion(recoveryProject, 'aexos-lifecycle-dependency'), '1.0.0');
    assert.equal(fs.readFileSync(recoveryFrameworkPath, 'utf8'), customizedContent);
    assert.equal(fs.readFileSync(userFile, 'utf8'), 'PRESERVE-USER-DATA\n');

    console.log(JSON.stringify({
      assertions: 19,
      isolated_consumer: updateProject,
      recovery_consumer: recoveryProject,
      artifact: currentArtifact,
      currentVersion,
      olderVersion,
      olderVersionProvenance: 'Synthetic local fixture derived from the current version; not a historical released artifact',
      successfulUpdate: {
        filesUpdated: update.filesUpdated,
        filesPreserved: update.filesPreserved,
        validationPassed: update.validationPassed,
        integrityScore: update.integrityScore,
      },
      interruptedRecovery: recovery,
      boundary: 'Real local tarballs with a synthetic older-version fixture, npm install, npm ci, restart recovery, dependency rollback, exact expected-customization validation, and framework customization preservation; no historical release, registry, or remote provider used',
    }));
  } finally {
    if (process.env.AEXOS_PARITY_KEEP_WORK !== '1') {
      fs.rmSync(workRoot, { recursive: true, force: true });
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
