#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { createHash } = require('crypto');
const { spawnSync } = require('child_process');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function main() {
  const [coreTarball, sourceRoot, workRoot] = process.argv.slice(2).map(value => path.resolve(value));
  const npmCli = process.env.AEXOS_PARITY_NPM_CLI;
  assert(npmCli && fs.existsSync(npmCli));
  const scenarioRoot = fs.mkdtempSync(path.join(workRoot, 'standalone-'));
  const artifactsDir = path.join(scenarioRoot, 'artifacts');
  const consumer = path.join(scenarioRoot, 'consumer');
  fs.mkdirSync(artifactsDir);
  fs.mkdirSync(consumer);
  fs.writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ name: 'standalone-fixture', version: '1.0.0', private: true }));
  const commands = [];
  const checks = [];
  function run(label, args, cwd = consumer, expected = 0) {
    console.log(`[standalone] ${label}`);
    const result = spawnSync(process.execPath, args, {
      cwd, env: process.env, encoding: 'utf8', timeout: 600000, maxBuffer: 16 * 1024 * 1024, windowsHide: true,
    });
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    const log = path.join(scenarioRoot, `${commands.length + 1}-${label}.log`);
    fs.writeFileSync(log, output);
    commands.push({ label, command: [process.execPath, ...args], cwd, exit_code: result.status,
      expected_exit_code: expected, log_path: log, log_sha256: digest(output) });
    assert(!result.error, `${label}: ${result.error?.message}`);
    assert.equal(result.status, expected, `${label}: ${output.slice(-2400)}`);
    checks.push(`command:${label}`);
    return result.stdout;
  }
  const definitions = [
    ['packages/aexos-install', '@aexos/install'],
    ['packages/installer', '@aexos/installer'],
    ['packages/aexos-pro-cli', '@aexos/pro-cli'],
    ['compat/aexos-core', 'aexos-core'],
  ];
  const artifacts = definitions.map(([directory, name], index) => {
    const packed = JSON.parse(run(`pack-${index}`, [npmCli, 'pack', '--json', '--pack-destination', artifactsDir], path.join(sourceRoot, directory)));
    assert.equal(packed.length, 1);
    assert.equal(packed[0].name, name);
    for (const required of ['LICENSE', 'LICENSE.upstream-aiox']) {
      assert(packed[0].files.some(file => file.path === required), `${name} omitted ${required}`);
    }
    const artifact = path.join(artifactsDir, packed[0].filename);
    checks.push(`packaged-license-notices:${name}`);
    return { name, path: artifact, sha256: digest(fs.readFileSync(artifact)), npm_integrity: packed[0].integrity };
  });
  run('install-all-local-artifacts', [npmCli, 'install', coreTarball, ...artifacts.map(item => item.path), '--prefer-offline', '--no-audit', '--no-fund']);
  const coreRoot = path.join(consumer, 'node_modules/@aexos/core');
  const license = fs.readFileSync(path.join(sourceRoot, 'LICENSE'));
  const upstreamLicense = fs.readFileSync(path.join(sourceRoot, 'docs/legal/upstream-aiox-license.txt'));
  for (const [, name] of definitions) {
    const packageRoot = path.join(consumer, 'node_modules', name);
    assert(!fs.lstatSync(packageRoot).isSymbolicLink(), `${name} must be extracted, not linked`);
    assert(fs.readFileSync(path.join(packageRoot, 'LICENSE')).equals(license));
    assert(fs.readFileSync(path.join(packageRoot, 'LICENSE.upstream-aiox')).equals(upstreamLicense));
    checks.push(`extracted-license-notices-and-no-link:${name}`);
  }
  assert(!fs.lstatSync(coreRoot).isSymbolicLink());
  const corePkg = JSON.parse(fs.readFileSync(path.join(coreRoot, 'package.json'), 'utf8'));
  const installerRoot = path.join(consumer, 'node_modules/@aexos/installer');
  const publicCheck = `const assert=require('assert/strict');const path=require('path');
    const installer=require('@aexos/installer');assert.equal(typeof installer.runWizard,'function');
    const root=process.argv[1];
    const paths=require(path.join(root,'src/utils/package-paths.js'));
    assert.equal(paths.getCyryxCorePackageRoot(),process.argv[2]);
    const config=require(path.join(root,'src/licensing/commercial-license-gate.js')).loadCommercialConfig();
    const manifest=require(path.join(process.argv[2],'package.json'));
    assert.equal(config.installMode,manifest.aexosCommercial?.installMode||'legacy');
    require('@aexos/installer/aexos-core-installer'); require('@aexos/installer/pro-setup');require('@aexos/installer/pro-scaffolder');
    require(path.join(process.cwd(),'node_modules/@aexos/pro-cli/src/error-bridge.js'));
    console.log(JSON.stringify({mode:config.installMode,root:paths.getCyryxCorePackageRoot()}));`;
  run('standalone-public-exports-and-commercial-policy', ['-e', publicCheck, installerRoot, coreRoot]);
  const versionBins = ['aexos-install', 'edmcp', 'aexos-installer', 'aexos-pro'];
  for (const bin of versionBins) assert(/\d+\.\d+\.\d+/.test(run(`npm-exec-${bin}`, [npmCli, 'exec', '--offline', '--', bin, '--version'])));

  // Invoke each distinct compatibility bin directly. npm shims pass the target
  // filename as argv[1], so aliases cannot be recovered from a shared filename.
  const compatRoot = path.join(consumer, 'node_modules/aexos-core');
  const compatManifest = JSON.parse(fs.readFileSync(path.join(compatRoot, 'package.json'), 'utf8'));
  for (const [name, marker] of [['aexos-graph', 'aexos-graph'], ['aexos-delegate', 'AEXOS External Executor Delegation'], ['aexos-minimal', 'DEPRECATION WARNING']]) {
    assert(run(`compat-${name}`, [path.join(compatRoot, compatManifest.bin[name]), '--help']).includes(marker));
  }
  assert(run('compat-version', [path.join(compatRoot, compatManifest.bin.aexos), '--version']).includes(corePkg.version));
  // This reads local absence of entitlement under the harness's isolated HOME.
  // No activation, validation request or provider call is made.
  const proCli = path.join(consumer, 'node_modules/@aexos/pro-cli/bin/aexos-pro.js');
  assert(!fs.existsSync(path.join(consumer, 'node_modules/@aexos/pro')));
  run('pro-delegates-to-actual-core', [proCli, 'status'], consumer, 1);
  const proStatus = fs.readFileSync(commands.at(-1).log_path, 'utf8');
  assert(proStatus.includes('AEXOS Pro license module not available.'), proStatus);
  assert(!proStatus.includes('AEXOS Core CLI not found'), proStatus);
  checks.push('pro-actual-local-entitlement-absence');
  run('standalone-installer-real-wizard', ['-e', 'require(\'@aexos/installer\').runWizard({quiet:true,ci:true,interactive:false,ide:\'codex\'}).catch(error=>{console.error(error);process.exitCode=1;});']);
  assert(fs.existsSync(path.join(consumer, '.aexos-core/core-config.yaml')));
  assert(fs.existsSync(path.join(consumer, '.codex/skills/aexos-dev/SKILL.md')));
  checks.push('standalone-wizard-project-and-codex-files');
  const doctor = JSON.parse(run('standalone-installer-doctor', [path.join(coreRoot, 'bin/aexos.js'), 'doctor', '--json']));
  assert.equal(doctor.summary.fail, 0);
  checks.push('standalone-doctor-zero-failures');
  console.log(JSON.stringify({ status: 'passed', assertions: checks.length, checks, isolated_consumer: consumer,
    package_root: coreRoot, artifacts, commands,
    boundary: 'Four separate local tarballs installed together with the exact core artifact; public exports, policy source, bins, license bytes, real wizard and Doctor. No publication, entitlement activation or live provider call.' }));
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.stack); process.exitCode = 1; }
}

module.exports = { main };
