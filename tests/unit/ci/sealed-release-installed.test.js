'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { inspectTgz, verifyInstalled, prepareCandidate, REPOSITORY, REPOSITORY_ID, WORKFLOW } = require('../../../scripts/ci/sealed-release');

jest.setTimeout(60000);
let directory;
let pkg;
let npmPath;
let verificationParent;

beforeAll(async () => {
  for (const parent of [os.tmpdir(), path.resolve(__dirname, '../../../..')]) {
    let contaminated = false;
    for (let ancestor = parent; ; ancestor = path.dirname(ancestor)) {
      if (fs.existsSync(path.join(ancestor, 'node_modules'))) contaminated = true;
      if (ancestor === path.dirname(ancestor)) break;
    }
    if (contaminated) continue;
    try {
      const probe = fs.mkdtempSync(path.join(parent, 'aex416-write-probe-'));
      fs.rmdirSync(probe);
      verificationParent = parent;
      break;
    } catch { /* Try the other explicit isolated parent, never skip verification. */ }
  }
  if (!verificationParent) throw Error('No writable isolated verification directory');
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aex416-installed-tests-'));
  const source = path.join(directory, 'source');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'package.json'), JSON.stringify({ name: '@aexos/install', version: '1.2.3',
    main: 'index.js', bin: { 'aexos-install': 'cli.js' }, exports: { '.': './index.js' } }));
  fs.writeFileSync(path.join(source, 'index.js'), 'module.exports = { fixture: true };');
  fs.writeFileSync(path.join(source, 'cli.js'), 'console.log("Fixture help");');
  npmPath = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const packed = spawnSync(process.execPath, [npmPath, 'pack', '--json', '--ignore-scripts'], { cwd: source, encoding: 'utf8' });
  expect(packed.status).toBe(0);
  const file = path.join(source, JSON.parse(packed.stdout)[0].filename);
  const inspected = await inspectTgz(file, { key: 'aexos-install' });
  pkg = { ...inspected, key: 'aexos-install', name: inspected.metadata.name, version: inspected.metadata.version, absoluteTgzPath: file };
});

afterAll(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

test('a missing runtime is a failure, never an omitted export check', async () => {
  await expect(verifyInstalled({}, { npmPath, runtimes: {} })).rejects.toThrow('Node 20 runtime required');
});

test('a different executable major is refused before installation', async () => {
  const major = Number(process.versions.node.split('.')[0]);
  const runtimes = { 20: process.execPath, 22: process.execPath, 24: process.execPath };
  // No runtime probe is faked in this negative test.
  await expect(verifyInstalled({}, { npmPath, runtimes, workDir: verificationParent })).rejects.toThrow(`wrong Node ${major === 20 ? 22 : 20} runtime`);
});

test('real npm install and export resolution run without inherited credentials; only major probes are injected', async () => {
  // This exercises the installed verifier on the current real runtime. Separate
  // qualification executes actual pinned 20/22/24 binaries; no such claim here.
  let probe = 0;
  let installs = 0;
  const calls = [];
  const execute = (exe, args, options) => {
    calls.push(args);
    expect(options.env.NODE_AUTH_TOKEN).toBeUndefined();
    expect(options.env.GITHUB_TOKEN).toBeUndefined();
    expect(options.env.NODE_PATH).toBeUndefined();
    expect(options.env.NODE_OPTIONS).toBeUndefined();
    expect(options.shell).toBe(false);
    if (args[0] === '-p') return { status: 0, stdout: `${[20, 22, 24][probe++]}.0.0`, stderr: '' };
    if (args[1] === 'install') installs++;
    return spawnSync(exe, args, options);
  };
  const candidate = { packages: [pkg], manifest: { packages: [], dependencies: [] }, directory };
  const result = await verifyInstalled(candidate, { npmPath, runtimes: { 20: process.execPath, 22: process.execPath, 24: process.execPath }, workDir: verificationParent, spawnSyncImpl: execute });
  expect(result.ok).toBe(true);
  expect(result.checks).toHaveLength(4);
  expect(installs).toBe(1);
  expect(calls.some(args => args.includes('pack'))).toBe(false);
  expect(calls.filter(args => args[0] === '-e')).toHaveLength(3);
});

test.each(['success', 'failed-test', 'prepack-mutation'])('actual fixture preparation verifies %s', async mode => {
  const root = fs.mkdtempSync(path.join(directory, 'prepare-source-'));
  const cli = path.join(root, 'packages/aexos-install');
  fs.mkdirSync(cli, { recursive: true });
  fs.writeFileSync(path.join(cli, 'package.json'), JSON.stringify({ name: '@aexos/install', version: '1.2.3', main: 'index.js', bin: { install: 'cli.js' },
    ...(mode === 'prepack-mutation' ? { scripts: { prepack: 'node mutate.js' } } : {}) }));
  if (mode === 'prepack-mutation') fs.writeFileSync(path.join(cli, 'mutate.js'), 'require("fs").writeFileSync("cli.js", "process.exitCode = 2;");');
  fs.writeFileSync(path.join(cli, 'index.js'), 'module.exports = {};');
  fs.writeFileSync(path.join(cli, 'cli.js'), 'console.log("fixture help");');
  const scripts = Object.fromEntries(['generate:manifest', 'lint', 'typecheck', 'test', 'build', 'validate:publish',
    'validate:aexos-core-namespace', 'validate:package-completeness', 'validate:manifest', 'validate:core-package']
    .map(name => [name, `node check.js ${name}`]));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'aex416-prepare-fixture', version: '1.0.0', private: true, scripts }));
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n');
  fs.writeFileSync(path.join(root, 'check.js'), `console.log('fixture gate', process.argv[2]);if(${mode === 'failed-test'} && process.argv[2]==='test')process.exitCode=1;`);
  const locked = spawnSync(process.execPath, [npmPath, 'install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: root, encoding: 'utf8' });
  expect(locked.status).toBe(0);
  for (const args of [['init'], ['add', '.'], ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'test fixture']]) {
    expect(spawnSync('git', args, { cwd: root, encoding: 'utf8' }).status).toBe(0);
  }
  const sourceSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
  let probe = 0;
  const calls = [];
  const execute = (exe, args, options) => {
    calls.push(args);
    if (args[0] === '-p') return { status: 0, stdout: `${[20, 22, 24][probe++ % 3]}.0.0`, stderr: '' };
    return spawnSync(exe, args, options);
  };
  const outputDir = path.join(directory, `prepared-${mode}`);
  const result = prepareCandidate({ sourceDir: root, outputDir, sourceSha, packageKeys: ['aexos-install'],
    channel: 'latest', release: { tag: 'aexos-install-v1.2.3', title: 'Fixture', notes: 'Test only', prerelease: false }, dependencies: [],
    context: { repository: REPOSITORY, repositoryId: REPOSITORY_ID, workflowPath: WORKFLOW, controllerSha: sourceSha, runId: 10, runAttempt: 1, operation: 'prepare' },
    runtimes: { 20: process.execPath, 22: process.execPath, 24: process.execPath }, npmPath, workDir: verificationParent, spawnSyncImpl: execute });
  if (mode !== 'success') {
    await expect(result).rejects.toThrow(mode === 'prepack-mutation' ? 'preparation changed unapproved source files' : 'required subprocess failed');
    expect(fs.existsSync(outputDir)).toBe(false);
    expect(calls.some(args => args[1] === 'pack')).toBe(false);
  } else {
    const prepared = await result;
    expect(prepared.manifest.packages[0].name).toBe('@aexos/install');
    expect(prepared.manifest.verification.preSealReports).toHaveLength(7);
    expect(calls.filter(args => args[1] === 'pack')).toHaveLength(1);
    expect(calls.find(args => args[1] === 'pack')).toContain('--ignore-scripts');
    expect(fs.readdirSync(outputDir).sort()).toEqual(['aexos-install-1.2.3.tgz', 'candidate.json']);
  }
});

async function packedCore(cliSource, exports) {
  const source = fs.mkdtempSync(path.join(directory, 'core-missing-export-'));
  const boundary = require('../../../.aexos-core/data/core-package-boundary.json');
  const files = [...boundary.requiredPaths.map(file => file.endsWith('/') ? `${file}fixture.md` : file),
    ...boundary.canonicalAgents.map(agent => `.aexos-core/development/agents/${agent}.md`)];
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(source, file)), { recursive: true });
    fs.writeFileSync(path.join(source, file), 'fixture');
  }
  fs.writeFileSync(path.join(source, 'bin/aexos.js'), cliSource);
  fs.writeFileSync(path.join(source, 'package.json'), JSON.stringify({ name: '@aexos/core', version: '1.2.3',
    bin: { aexos: 'bin/aexos.js' }, exports, files: ['bin/', '.aexos-core/', '.claude/', 'squads/'] }));
  const packed = spawnSync(process.execPath, [npmPath, 'pack', '--json', '--ignore-scripts'], { cwd: source, encoding: 'utf8' });
  expect(packed.status).toBe(0);
  const file = path.join(source, JSON.parse(packed.stdout)[0].filename);
  const inspected = await inspectTgz(file, { key: 'core' });
  const core = { ...inspected, key: 'core', name: '@aexos/core', version: '1.2.3', absoluteTgzPath: file };
  return { core, source };
}

test('a real Core TGZ hiding the external CLI export cannot pass absolute-bin checks', async () => {
  const { core, source } = await packedCore('console.log("fixture help");', { './package.json': './package.json' });
  let probe = 0;
  let rejectedExport = false;
  const execute = (exe, args, options) => {
    if (args[0] === '-p') return { status: 0, stdout: `${[20, 22, 24][probe++]}.0.0`, stderr: '' };
    const result = spawnSync(exe, args, options);
    if (result.stderr?.includes('ERR_PACKAGE_PATH_NOT_EXPORTED')) rejectedExport = true;
    return result;
  };
  await expect(verifyInstalled({ packages: [core], manifest: { packages: [], dependencies: [] }, directory: source },
    { npmPath, runtimes: { 20: process.execPath, 22: process.execPath, 24: process.execPath }, workDir: verificationParent, spawnSyncImpl: execute }))
    .rejects.toThrow('required subprocess failed');
  expect(rejectedExport).toBe(true);
});

test.each(['ERROR', null, 'WARN', 'INFO'])('installed Doctor output with %s cannot hide an unknown outcome', async status => {
  const doctor = { checks: [{ check: 'first', status: 'PASS' }, { check: 'second', status }],
    summary: { pass: 1, warn: status === 'WARN' ? 1 : 0, fail: 0, info: status === 'INFO' ? 1 : 0 } };
  const cli = `if(process.argv[2]==='init'){require('fs').mkdirSync(process.argv[3]);}else if(process.argv[2]==='doctor'){console.log(${JSON.stringify(JSON.stringify(doctor))});}else console.log('fixture help');`;
  const { core, source } = await packedCore(cli, { './bin/*': './bin/*' });
  let probe = 0;
  const execute = (exe, args, options) => args[0] === '-p'
    ? { status: 0, stdout: `${[20, 22, 24][probe++]}.0.0`, stderr: '' } : spawnSync(exe, args, options);
  const result = verifyInstalled({ packages: [core], manifest: { packages: [], dependencies: [] }, directory: source },
    { npmPath, runtimes: { 20: process.execPath, 22: process.execPath, 24: process.execPath }, workDir: verificationParent, spawnSyncImpl: execute });
  if (status === 'ERROR' || status === null) await expect(result).rejects.toThrow('Doctor returned an invalid check status');
  else expect((await result).doctor).toEqual({ pass: 1, warn: status === 'WARN' ? 1 : 0, fail: 0 });
});
