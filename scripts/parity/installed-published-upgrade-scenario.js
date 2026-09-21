#!/usr/bin/env node
'use strict';

const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const yaml = require('js-yaml');

const PUBLISHED_VERSION = '5.3.0';
const PUBLISHED_SHA256 = '7943bc9ecfcbd6ccb2ff9cd0550f5d4ed172c6defdb3ce9c5a024c589b647b26';
const SYNAPSE_PROBE = 'core/synapse/runtime/hook-runtime.js';

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runNode(args, cwd, timeout = 600000) {
  return execFileSync(process.execPath, args, {
    cwd,
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout,
  });
}

function runNpm(npmCli, args, cwd) {
  return runNode([npmCli, ...args], cwd);
}

function installedPackageRoot(project) {
  return path.join(project, 'node_modules', '@aexos', 'core');
}

function installedVersion(project) {
  return readJson(path.join(installedPackageRoot(project), 'package.json')).version;
}

function parseDoctor(output) {
  const trimmed = String(output || '').trim();
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`Doctor did not return JSON: ${error.message}; output=${trimmed.slice(0, 500)}`);
  }
}

function installBlocker(error) {
  const stderr = String(error.stderr || '').trim();
  const stdout = String(error.stdout || '').trim();
  const details = [stderr, stdout, error.message].filter(Boolean).join('\n').slice(0, 2000);
  const accessBoundary = /licen[cs]e|entitlement|activat|payment|purchase|unauthori[sz]ed|\b40[13]\b/i
    .test(details);
  return {
    status: 'blocked',
    phase: 'published-install-cli',
    accessBoundary,
    reason: details,
    bypassAttempted: false,
  };
}

async function main() {
  const currentTarball = path.resolve(process.argv[2] || '');
  const publishedTarball = path.resolve(process.argv[3] || '');
  assert(fs.existsSync(currentTarball), 'Pass the candidate .tgz as the first argument');
  assert(fs.existsSync(publishedTarball), 'Pass the published .tgz as the second argument');
  assert.equal(
    sha256File(publishedTarball),
    PUBLISHED_SHA256,
    'Published artifact does not match the registry-verified SHA-256',
  );

  const npmCli = process.env.AEXOS_PARITY_NPM_CLI || process.env.npm_execpath;
  assert(npmCli && fs.existsSync(npmCli), 'Set AEXOS_PARITY_NPM_CLI to npm/bin/npm-cli.js');
  const packageRoot = path.resolve(__dirname, '..', '..');
  const currentPackage = readJson(path.join(packageRoot, 'package.json'));
  const updaterLoadedFromInstalledArtifact = packageRoot.toLowerCase().includes(
    `${path.sep}node_modules${path.sep}@aexos${path.sep}core`.toLowerCase(),
  );
  assert.equal(currentPackage.name, '@aexos/core');
  assert.match(currentPackage.version, /^\d+\.\d+\.\d+$/, 'Candidate must declare its release version');
  assert.equal(
    updaterLoadedFromInstalledArtifact,
    true,
    'Run this scenario from the installed candidate package, not the source checkout',
  );

  const base = process.argv[4] ? path.resolve(process.argv[4]) : os.tmpdir();
  fs.mkdirSync(base, { recursive: true });
  const workRoot = fs.mkdtempSync(path.join(base, 'aexos-published-upgrade-'));
  const consumer = path.join(workRoot, 'consumer');
  fs.mkdirSync(consumer);

  try {
    fs.writeFileSync(
      path.join(consumer, 'package.json'),
      `${JSON.stringify({
        name: 'aexos-published-upgrade-consumer',
        version: '1.0.0',
        private: true,
      }, null, 2)}\n`,
    );
    runNpm(
      npmCli,
      ['install', publishedTarball, '--save-exact', '--prefer-offline', '--no-audit', '--no-fund'],
      consumer,
    );
    assert.equal(installedVersion(consumer), PUBLISHED_VERSION);

    const publishedRoot = installedPackageRoot(consumer);
    const publishedCli = path.join(publishedRoot, 'bin', 'aexos.js');
    let publishedInstallOutput;
    try {
      publishedInstallOutput = runNode(
        [publishedCli, 'install', '--ci', '--yes', '--ide', 'claude-code'],
        consumer,
      );
    } catch (error) {
      console.log(JSON.stringify(installBlocker(error)));
      process.exitCode = 2;
      return;
    }

    const versionPath = path.join(consumer, '.aexos-core', 'version.json');
    const installedManifestPath = path.join(
      consumer,
      '.aexos-core',
      '.installed-manifest.yaml',
    );
    const configPath = path.join(consumer, '.aexos-core', 'core-config.yaml');
    const claudeSettingsPath = path.join(consumer, '.claude', 'settings.json');
    const synapseProjectPath = path.join(consumer, '.aexos-core', ...SYNAPSE_PROBE.split('/'));
    const publishedSynapsePackagePath = path.join(
      publishedRoot,
      '.aexos-core',
      ...SYNAPSE_PROBE.split('/'),
    );
    for (const required of [
      versionPath,
      installedManifestPath,
      configPath,
      claudeSettingsPath,
      synapseProjectPath,
      publishedSynapsePackagePath,
    ]) {
      assert(fs.existsSync(required), `Published install did not materialize ${required}`);
    }

    const baselineVersion = readJson(versionPath);
    assert.equal(baselineVersion.version, PUBLISHED_VERSION);
    const baselineManifest = yaml.load(fs.readFileSync(installedManifestPath, 'utf8'));
    assert.equal(baselineManifest.installed_version, PUBLISHED_VERSION);
    assert(Number(baselineManifest.file_count) > 0, 'Published installed manifest is empty');
    const publishedSynapseHash = sha256File(publishedSynapsePackagePath);
    assert.equal(sha256File(synapseProjectPath), publishedSynapseHash);

    const baselineConfig = yaml.load(fs.readFileSync(configPath, 'utf8'));
    baselineConfig.publishedLifecycleProbe = {
      preserve: true,
      source: 'registry-verified-5.3.0',
    };
    fs.writeFileSync(configPath, yaml.dump(baselineConfig, { noRefs: true, lineWidth: 120 }));
    const customFile = path.join(consumer, '.aexos-core', 'company-custom.md');
    fs.writeFileSync(customFile, '# COMPANY-CUSTOM-PRESERVE\n');

    const lockBefore = sha256File(path.join(consumer, 'package-lock.json'));
    const publishedPackageHash = sha256File(publishedTarball);
    const candidatePackageHash = sha256File(currentTarball);
    assert.notEqual(
      candidatePackageHash,
      publishedPackageHash,
      'Candidate artifact is byte-identical to the published artifact; no repair delta exists',
    );

    const { CYRYXUpdater } = require(path.join(packageRoot, 'packages/installer/src/updater'));
    const updater = new CYRYXUpdater(consumer, {
      force: true,
      npmInvocation: { command: process.execPath, prefixArgs: [npmCli] },
      npmTimeout: 600000,
    });
    const update = await updater.update({
      targetVersion: currentPackage.version,
      packageSpecifier: currentTarball,
    });
    assert.equal(update.success, true, update.error || 'Explicit legacy-to-candidate transition failed');
    assert.equal(update.previousVersion, PUBLISHED_VERSION);
    assert.equal(update.newVersion, currentPackage.version);
    assert.equal(update.validationPassed, true);
    assert.deepEqual(update.validationIssues, []);

    const currentRoot = installedPackageRoot(consumer);
    const candidateSynapsePackagePath = path.join(
      currentRoot,
      '.aexos-core',
      ...SYNAPSE_PROBE.split('/'),
    );
    const candidateSynapseHash = sha256File(candidateSynapsePackagePath);
    assert.notEqual(
      candidateSynapseHash,
      publishedSynapseHash,
      `Candidate does not contain a measured SYNAPSE delta at ${SYNAPSE_PROBE}`,
    );
    assert.equal(sha256File(synapseProjectPath), candidateSynapseHash);

    const configAfter = yaml.load(fs.readFileSync(configPath, 'utf8'));
    assert.deepEqual(configAfter.publishedLifecycleProbe, baselineConfig.publishedLifecycleProbe);
    assert.equal(fs.readFileSync(customFile, 'utf8'), '# COMPANY-CUSTOM-PRESERVE\n');
    assert.equal(installedVersion(consumer), currentPackage.version);
    assert.equal(readJson(versionPath).version, currentPackage.version);
    const lockAfter = sha256File(path.join(consumer, 'package-lock.json'));
    assert.notEqual(lockAfter, lockBefore, 'Explicit transition did not update the consumer lock');
    const lockText = fs.readFileSync(path.join(consumer, 'package-lock.json'), 'utf8');
    assert(lockText.includes(path.basename(currentTarball)), 'Consumer lock does not bind the candidate tarball');

    const doctor = parseDoctor(
      runNode([path.join(currentRoot, 'bin', 'aexos.js'), 'doctor', '--json'], consumer),
    );
    assert.equal(doctor.summary.fail, 0, 'Doctor reported failures after the explicit version transition');

    console.log(JSON.stringify({
      status: 'passed',
      assertions: 33,
      isolated_consumer: consumer,
      published: {
        version: PUBLISHED_VERSION,
        sha256: publishedPackageHash,
        installedCliExecuted: true,
        installedCliOutputObserved: publishedInstallOutput.trim().length > 0,
        installedManifestFiles: Number(baselineManifest.file_count),
      },
      candidate: {
        version: installedVersion(consumer),
        sha256: candidatePackageHash,
        updaterLoadedFrom: packageRoot,
        updaterLoadedFromInstalledArtifact,
      },
      update: {
        forced: true,
        previousVersion: PUBLISHED_VERSION,
        targetVersion: currentPackage.version,
        sameVersion: currentPackage.version === PUBLISHED_VERSION,
        filesUpdated: update.filesUpdated,
        filesPreserved: update.filesPreserved,
        validationPassed: update.validationPassed,
        validationIssues: update.validationIssues,
      },
      readback: {
        lockBefore,
        lockAfter,
        customConfigPreserved: true,
        customFilePreserved: true,
      },
      synapseDelta: {
        path: SYNAPSE_PROBE,
        publishedSha256: publishedSynapseHash,
        candidateSha256: candidateSynapseHash,
        projectMatchesCandidate: true,
      },
      doctor: doctor.summary,
      boundary: `Registry-verified public ${PUBLISHED_VERSION} to candidate ${currentPackage.version} through an explicit local-artifact forced transition. Version-line restart is intentional; this does not prove automatic registry update discovery or npm publication.`,
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
