'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { createReleaseProviders, classifyStatus, validateContext, cleanEnvironment, REPOSITORY, REPOSITORY_ID, WORKFLOW } = require('../../../scripts/ci/release-providers');

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sri = bytes => `sha512-${crypto.createHash('sha512').update(bytes).digest('base64')}`;
const context = { repository: REPOSITORY, repositoryId: REPOSITORY_ID, workflowPath: WORKFLOW, controllerSha: 'a'.repeat(40), runId: 12, runAttempt: 1, operation: 'publish' };
const python = process.env.AEXOS_TEST_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const response = (value, status = 200, headers = {}) => new global.Response(Buffer.isBuffer(value) ? value : JSON.stringify(value), { status, headers });
let temporary;
let historyFixture;
let historyFixtureRoot;

beforeAll(async () => {
  const engine = require('../../../scripts/ci/sealed-release');
  historyFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-history-candidate-'));
  fs.writeFileSync(path.join(historyFixtureRoot, 'package.json'), JSON.stringify({ name: '@aexos/installer', version: '1.2.3', main: 'index.js', bin: { fixture: 'cli.js' }, files: ['index.js', 'cli.js'] }));
  fs.writeFileSync(path.join(historyFixtureRoot, 'index.js'), 'module.exports={};');
  fs.writeFileSync(path.join(historyFixtureRoot, 'cli.js'), 'console.log("help");');
  const npm = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const packed = spawnSync(process.execPath, [npm, 'pack', '--json', '--ignore-scripts'], { cwd: historyFixtureRoot, encoding: 'utf8', windowsHide: true });
  expect(packed.status).toBe(0);
  const tgzPath = path.join(historyFixtureRoot, JSON.parse(packed.stdout)[0].filename);
  const inspected = await engine.inspectTgz(tgzPath, { key: 'installer' });
  const manifest = { schemaVersion: 1, repository: REPOSITORY, repositoryId: REPOSITORY_ID, sourceSha: context.controllerSha,
    producer: { workflowPath: WORKFLOW, runId: 7, runAttempt: 1, controllerSha: context.controllerSha }, channel: 'latest',
    release: { tag: 'installer-v1.2.3', title: 'History fixture', notes: 'Fixture only', prerelease: false },
    packages: [{ key: 'installer', name: '@aexos/installer', version: '1.2.3', sourcePath: 'packages/installer', tgzPath: 'installer.tgz',
      size: inspected.size, sha256: inspected.sha256, integrity: inspected.integrity, inventory: inspected.inventory, requiredChecks: engine.PACKAGES.installer.checks }],
    dependencies: [], verification: { policyVersion: 1, preSealReports: engine.PRESEAL_CHECKS.map(id => ({ id, sha256: 'b'.repeat(64) })) } };
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const zip = bundle([{ name: 'candidate.json', text: manifestBytes.toString() }, { name: 'installer.tgz', base64: fs.readFileSync(tgzPath).toString('base64') }], 'candidate.zip', historyFixtureRoot);
  const locator = { sourceSha: context.controllerSha, producerRunId: 7, producerRunAttempt: 1, artifactId: 43, artifactDigest: `sha256:${sha(zip)}`, manifestSha256: sha(manifestBytes) };
  const directory = path.join(historyFixtureRoot, 'candidate');
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, 'candidate.json'), manifestBytes);
  fs.copyFileSync(tgzPath, path.join(directory, 'installer.tgz'));
  historyFixture = { candidate: await engine.loadCandidate(directory, locator), zip, artifact: metadata(43, zip, 'aexos-release-candidate-7-1', 7) };
});
afterAll(() => { fs.rmSync(historyFixtureRoot, { recursive: true, force: true }); });

beforeEach(() => { temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-provider-test-')); });
afterEach(() => { fs.rmSync(temporary, { recursive: true, force: true }); });

function bundle(entries, name = 'fixture.zip', directory = temporary) {
  const file = path.join(directory, name);
  const script = 'import json,sys,zipfile,base64; z=zipfile.ZipFile(sys.argv[1],"w"); entries=json.loads(sys.argv[2]); [(lambda i,e:(setattr(i,"external_attr",e.get("attr",0)),z.writestr(i,base64.b64decode(e["base64"]) if "base64" in e else e["text"])))(zipfile.ZipInfo(e["name"]),e) for e in entries]; z.close()';
  const result = spawnSync(python, ['-c', script, file, JSON.stringify(entries)], { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error('Actual Python ZIP fixture creation failed');
  return fs.readFileSync(file);
}

function provider(fetchImpl, overrides = {}) {
  return createReleaseProviders({ context, fetchImpl, workDir: temporary, pythonPath: python, sleep: async () => {}, clock: () => 1, ...overrides });
}

function packageFixture() {
  const bytes = Buffer.from('actual sealed provider byte fixture');
  const tgzPath = path.join(temporary, 'fixture.tgz');
  fs.writeFileSync(tgzPath, bytes);
  return { bytes, pkg: { name: '@aexos/core', version: '1.0.0', size: bytes.length, sha256: sha(bytes), integrity: sri(bytes), tgzPath, sourceSha: 'a'.repeat(40) } };
}

function metadata(id, bytes, name, runId = 12) {
  return { id, name, digest: `sha256:${sha(bytes)}`, expired: false, expires_at: '2099-01-01T00:00:00Z', workflow_run: { id: runId, repository_id: REPOSITORY_ID, head_repository_id: REPOSITORY_ID, head_sha: context.controllerSha } };
}

function run(id = 12, attempt = 1, completed = false) {
  return { id, run_attempt: attempt, repository: { id: REPOSITORY_ID, full_name: REPOSITORY }, head_repository: { id: REPOSITORY_ID }, head_sha: context.controllerSha, path: WORKFLOW, event: 'workflow_dispatch', status: completed ? 'completed' : 'in_progress', conclusion: completed ? 'success' : null };
}

async function writable(overrides = {}) {
  const intent = { effectKeys: ['npm:@aexos/core@1.0.0'], context };
  const zip = bundle([{ name: 'intent.json', text: JSON.stringify(intent) }]);
  const artifact = metadata(8, zip, 'aexos-release-intent-12-1');
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    if (init.method !== 'GET') return overrides.effectResponse ? overrides.effectResponse() : response({ id: 4, draft: true }, init.method === 'PATCH' ? 200 : 201);
    if (url.endsWith('/actions/artifacts/8/zip')) return response(zip);
    if (url.endsWith('/actions/artifacts/8')) return response(artifact);
    if (url.includes('/jobs?')) return response({ total_count: 1, jobs: [{ name: 'Publish sealed transaction', status: 'in_progress' }] });
    if (url.endsWith('/actions/runs/12/attempts/1')) return response(run());
    if (url.endsWith(`/repos/${REPOSITORY}`)) return response({ id: REPOSITORY_ID, full_name: REPOSITORY });
    throw new Error('Unexpected endpoint');
  };
  const instance = provider(fetchImpl, { npmPath: path.join(temporary, 'npm-cli.js'), ...overrides });
  await instance.verifyContext();
  await instance.verifyIntent({ artifactId: 8, digest: artifact.digest, expectedIntent: intent });
  return { instance, requests, intent, artifact };
}

describe('actual typed registry adapter', () => {
  test.each([401, 403, 404, 429, 500])('HTTP %s never becomes authoritative absence', async status => {
    const fetchImpl = jest.fn(async () => response({ error: 'not found' }, status));
    const { pkg } = packageFixture();
    const result = await provider(fetchImpl).observePackage(pkg, 'latest');
    expect(result.kind).toBe(classifyStatus(status));
    expect(result.kind).not.toBe('absent');
    expect(fetchImpl).toHaveBeenCalledTimes([429, 500].includes(status) ? 5 : 1);
  });
  test('transport uncertainty has bounded reads and no publication', async () => {
    const fetchImpl = jest.fn(async () => { throw new Error('secret sentinel'); });
    const result = await provider(fetchImpl).observePackage(packageFixture().pkg, 'latest');
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(JSON.stringify(result)).not.toContain('secret sentinel');
    expect(result.kind).toBe('unknown');
  });
  test.each([null, [], {}, { name: '@aexos/core', versions: [] }, { name: 'wrong', versions: {}, 'dist-tags': {} }])('malformed packument is unknown: %j', async value => {
    expect((await provider(async () => response(value)).observePackage(packageFixture().pkg, 'latest')).kind).toBe('unknown');
  });
  test('a structured public packument missing the exact version proves absence', async () => {
    expect((await provider(async () => response({ name: '@aexos/core', versions: {}, 'dist-tags': {} })).observePackage(packageFixture().pkg, 'latest')).kind).toBe('absent');
  });
  test('matching requires exact fetched bytes and channel; records path for real installed verification', async () => {
    const { pkg, bytes } = packageFixture();
    const fetchImpl = jest.fn(async url => url.includes('/-/') ? response(bytes) : response({ name: pkg.name, versions: { [pkg.version]: { name: pkg.name, version: pkg.version, dist: { integrity: pkg.integrity, tarball: 'https://registry.npmjs.org/@aexos/core/-/core-1.0.0.tgz' } } }, 'dist-tags': { latest: pkg.version } }));
    const result = await provider(fetchImpl).observePackage(pkg, 'latest');
    expect(result.kind).toBe('matching');
    expect(fs.readFileSync(result.value.tarballPath)).toEqual(bytes);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  test.each(['integrity', 'gitHead', 'channel', 'bytes'])('conflicting %s is not a skip', async conflict => {
    const { pkg, bytes } = packageFixture();
    const entry = { name: pkg.name, version: pkg.version, gitHead: conflict === 'gitHead' ? 'b'.repeat(40) : pkg.sourceSha, dist: { integrity: conflict === 'integrity' ? 'wrong' : pkg.integrity, tarball: 'https://registry.npmjs.org/core.tgz' } };
    const fetchImpl = async url => url.endsWith('.tgz') ? response(conflict === 'bytes' ? Buffer.from('different') : bytes) : response({ name: pkg.name, versions: { [pkg.version]: entry }, 'dist-tags': { latest: conflict === 'channel' ? '2.0.0' : pkg.version } });
    expect((await provider(fetchImpl).observePackage(pkg, 'latest')).kind).toBe('conflict');
  });
  test.each(['http://registry.npmjs.org/core.tgz', 'https://evil.invalid/core.tgz', 'https://token@registry.npmjs.org/core.tgz'])('rejects hostile archive location %s before fetching', async location => {
    const { pkg } = packageFixture();
    const fetchImpl = jest.fn(async () => response({ name: pkg.name, versions: { [pkg.version]: { name: pkg.name, version: pkg.version, dist: { integrity: pkg.integrity, tarball: location } } }, 'dist-tags': { latest: pkg.version } }));
    expect((await provider(fetchImpl).observePackage(pkg, 'latest')).kind).toBe('unknown');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('actual immutable Actions transport and production context', () => {
  test.each([{ repositoryId: 2 }, { repository: 'CyryxLabs/AEXOS' }, { controllerSha: 'main' }, { runAttempt: '1' }, { operation: 'test' }])('rejects foreign/malformed context %j', change => {
    expect(() => validateContext({ ...context, ...change })).toThrow();
  });
  test('missing supported context or intent forbids writes', async () => {
    const fetchImpl = jest.fn();
    await expect(provider(fetchImpl).publishPackage(packageFixture().pkg, 'latest')).rejects.toThrow('persisted intent');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  test('actual ZIP extraction validates exact downloaded digest and file set', async () => {
    const zip = bundle([{ name: 'candidate.json', text: '{}' }, { name: 'core.tgz', text: 'tgz' }]);
    const artifact = metadata(4, zip, 'candidate');
    const api = provider(async url => response(url.endsWith('/zip') ? zip : artifact));
    const destination = fs.mkdtempSync(path.join(temporary, 'out-'));
    const result = await api.downloadArtifact({ artifactId: 4, digest: artifact.digest, destination });
    expect(result.files).toEqual(['candidate.json', 'core.tgz']);
  });
  test.each([
    [{ name: '../escape', text: 'bad' }],
    [{ name: 'C:escape', text: 'bad' }],
    [{ name: 'candidate.json', text: '{}' }, { name: 'candidate.json', text: 'duplicate' }],
    [{ name: 'candidate.json', text: '{}' }, { name: 'CANDIDATE.JSON', text: 'collision' }],
    [{ name: 'candidate.json', text: '{}', attr: 0o120777 * 65536 }],
    [{ name: 'candidate.json', text: '{}', attr: 0o010644 * 65536 }],
    [{ name: 'candidate.json', text: '{}' }, { name: 'extra.txt', text: 'bad' }],
    [{ name: 'core.tgz', text: 'missing manifest' }],
    [{ name: 'candidate.json', text: '{}' }, { name: 'nul.tgz', text: 'reserved' }],
    [{ name: 'candidate.json', text: '{}' }, ...Array.from({ length: 32 }, (_, i) => ({ name: `entry-${i}.tgz`, text: 'too many' }))],
  ].map(entries => [entries]))('real ZIP extractor rejects adversarial entries %#', async entries => {
    const zip = bundle(entries);
    const artifact = metadata(4, zip, 'candidate');
    const destination = fs.mkdtempSync(path.join(temporary, 'out-'));
    await expect(provider(async url => response(url.endsWith('/zip') ? zip : artifact)).downloadArtifact({ artifactId: 4, digest: artifact.digest, destination })).rejects.toThrow();
    expect(fs.readdirSync(destination)).toEqual([]);
  });
  test('wrong outer digest rejects before extractor execution', async () => {
    const zip = bundle([{ name: 'candidate.json', text: '{}' }]);
    const artifact = metadata(4, Buffer.from('wrong'), 'candidate');
    const spawn = jest.fn();
    await expect(provider(async url => response(url.endsWith('/zip') ? zip : artifact), { spawnSyncImpl: spawn }).downloadArtifact({ artifactId: 4, digest: artifact.digest, destination: temporary })).rejects.toThrow('digest mismatch');
    expect(spawn).not.toHaveBeenCalled();
  });
  test('expired artifact blocks without download', async () => {
    const fetchImpl = jest.fn(async () => response({ ...metadata(4, Buffer.from('x'), 'candidate'), expired: true }));
    await expect(provider(fetchImpl).downloadArtifact({ artifactId: 4, digest: `sha256:${sha(Buffer.from('x'))}`, destination: temporary })).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  test('producer must match successful exact attempt, repository and actual required job', async () => {
    const zip = Buffer.from('artifact');
    const locator = { producerRunId: 9, producerRunAttempt: 2, artifactId: 4, artifactDigest: `sha256:${sha(zip)}` };
    for (const outcome of ['failure', 'skipped', 'cancelled', null]) {
      const api = provider(async url => url.includes('/jobs?') ? response({ total_count: 1, jobs: [{ name: 'Prepare sealed candidate', status: 'completed', conclusion: outcome }] }) : url.endsWith('/actions/artifacts/4') ? response(metadata(4, zip, 'aexos-release-candidate-9-2', 9)) : response(run(9, 2, true)));
      await expect(api.verifyProducer(locator)).rejects.toThrow('producer job');
    }
  });
});

describe('single-attempt effect adapters and terminal guard', () => {
  test.each([401, 403, 422, 500])('GitHub write HTTP %s is uncertain and never blindly retried', async status => {
    const { instance, requests } = await writable({ effectResponse: () => response({ message: 'sentinel secret response' }, status) });
    const result = await instance.createTag('v1.0.0', context.controllerSha);
    expect(result.kind).toBe('unknown');
    expect(requests.filter(item => item.init.method !== 'GET')).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('sentinel');
  });
  test.each([0, 1, null])('npm exit %s is recorded without auth fallback or a second subprocess', async status => {
    const spawn = jest.fn((command, args, opts) => args[0]?.endsWith('extract-release-artifact.py') ? spawnSync(command, args, opts) : { status });
    const { instance } = await writable({ spawnSyncImpl: spawn, authMode: 'token', npmToken: 'SENTINEL-TOKEN' });
    const { pkg } = packageFixture();
    const result = await instance.publishPackage(pkg, 'latest');
    expect(result.kind).toBe(status === 0 ? 'accepted' : 'unknown');
    const writes = spawn.mock.calls.filter(call => call[1].includes('publish'));
    expect(writes).toHaveLength(1);
    expect(writes[0][1]).toEqual([path.join(temporary, 'npm-cli.js'), 'publish', pkg.tgzPath, '--registry=https://registry.npmjs.org/', '--access=public', '--tag=latest', '--ignore-scripts']);
    expect(writes[0][2].cwd).not.toBe(process.cwd());
    expect(JSON.stringify(result)).not.toContain('SENTINEL');
    expect(fs.existsSync(writes[0][2].env.NPM_CONFIG_USERCONFIG)).toBe(false);
  });
  test('terminal seal prevents every later package/tag/release/asset effect', async () => {
    const { instance, requests } = await writable();
    instance.seal();
    const before = requests.length;
    await expect(instance.createTag('v1.0.0', context.controllerSha)).rejects.toThrow('sealed');
    await expect(instance.publishPackage(packageFixture().pkg, 'latest')).rejects.toThrow('sealed');
    await expect(instance.finalizeRelease({ id: 4 })).rejects.toThrow('sealed');
    expect(() => instance.uploadAsset({ id: 4 }, {})).toThrow('sealed');
    expect(requests).toHaveLength(before);
  });
  test('annotated tags are peeled, retargeted tags conflict', async () => {
    const fetchImpl = async url => response(url.includes('/git/tags/') ? { object: { type: 'commit', sha: context.controllerSha } } : { object: { type: 'tag', sha: 'b'.repeat(40) } });
    expect((await provider(fetchImpl).observeTag('v1.0.0', context.controllerSha)).kind).toBe('matching');
    expect((await provider(fetchImpl).observeTag('v1.0.0', 'c'.repeat(40))).kind).toBe('conflict');
  });
  test('matching assets require downloaded bytes; conflicts are never clobbered', async () => {
    const bytes = Buffer.from('asset');
    const asset = { name: 'candidate.json', size: bytes.length, sha256: sha(bytes) };
    const fetchImpl = jest.fn(async url => url.includes('/releases/assets/') ? response(bytes) : response([{ id: 2, name: asset.name, size: asset.size }]));
    expect((await provider(fetchImpl).observeAsset({ id: 1 }, asset)).kind).toBe('matching');
    expect((await provider(fetchImpl).observeAsset({ id: 1 }, { ...asset, sha256: 'b'.repeat(64) })).kind).toBe('conflict');
    expect(fetchImpl.mock.calls.every(([, init]) => init.method === 'GET')).toBe(true);
  });
  test('a foreign dependency receipt is not integrity-only approval', async () => {
    const fetchImpl = jest.fn();
    expect((await provider(fetchImpl).observeDependency({ name: '@aexos/core', version: '1.0.0', integrity: 'known', sourceReceiptId: 'someone said verified' })).kind).toBe('unknown');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  test('credential sanitization strips short secret values by name', () => {
    expect(cleanEnvironment({ PATH: 'tools', SERVICE_ROLE_KEY: 'x', GH_TOKEN: 'y', npm_config_userconfig: 'private', NPM_TOKEN: 'z' })).toEqual({ PATH: 'tools' });
  });
});

describe('actual durable intent discovery through paginated GitHub transport', () => {
  function history({ missingIntent = false, missingOutcome = false, expired = false, overlap = true, executorConclusion, jobName = 'Publish sealed transaction', foreignController = false, malformedEffects } = {}) {
    const intent = require('../../../scripts/ci/sealed-release').buildIntent(historyFixture.candidate, { ...context, runId: 9 });
    // The selected test transaction can be disjoint; its real prior plan still
    // derives from the immutable packed candidate rather than invented keys.
    if (!overlap) expect(intent.effectKeys).not.toContain('npm:@aexos/core@1.0.0');
    if (malformedEffects !== undefined) intent.effectKeys = malformedEffects;
    const outcome = { sealed: true, state: 'blocked', context: intent.context, effects: [] };
    const intentZip = bundle([{ name: 'intent.json', text: JSON.stringify(intent) }], 'prior-intent.zip');
    const outcomeZip = bundle([{ name: 'receipt.json', text: JSON.stringify(outcome) }], 'prior-outcome.zip');
    const intentArtifact = { ...metadata(41, intentZip, 'aexos-release-intent-9-1', 9), expired };
    const outcomeArtifact = metadata(42, outcomeZip, 'aexos-release-outcome-9-1', 9);
    const fetchImpl = jest.fn(async url => {
      if (url.includes('/actions/workflows/')) return response({ total_count: 1, workflow_runs: [run(9, 1, true)] });
      if (url.includes('/runs/9/artifacts?')) {
        const artifacts = [...(missingIntent ? [] : [intentArtifact]), ...(missingOutcome ? [] : [outcomeArtifact])];
        return response({ total_count: artifacts.length, artifacts });
      }
      if (url.includes('/runs/7/attempts/1/jobs?')) return response({ total_count: 1, jobs: [{ name: 'Prepare sealed candidate', status: 'completed', conclusion: 'success' }] });
      if (url.endsWith('/runs/7/attempts/1')) return response(run(7, 1, true));
      if (url.endsWith('/43/zip')) return response(historyFixture.zip);
      if (url.endsWith('/artifacts/43')) return response(historyFixture.artifact);
      if (url.includes('/jobs?')) return response({ total_count: 1, jobs: [{ name: jobName, started_at: '2026-01-01', conclusion: 'failure',
        steps: executorConclusion ? [{ name: 'Reconcile, publish sealed bytes and verify all selected effects', status: 'completed', conclusion: executorConclusion }] : [] }] });
      if (url.endsWith('/attempts/1')) return response({ ...run(9, 1, true), ...(foreignController ? { head_sha: 'b'.repeat(40) } : {}) });
      if (url.endsWith('/41/zip')) return response(intentZip);
      if (url.endsWith('/42/zip')) return response(outcomeZip);
      if (url.endsWith('/artifacts/41')) return response(intentArtifact);
      if (url.endsWith('/artifacts/42')) return response(outcomeArtifact);
      throw new Error('Unexpected history route');
    });
    return { instance: provider(fetchImpl), fetchImpl, intent, outcome };
  }
  test('overlap across a different transaction retains exact prior intent and terminal evidence', async () => {
    const { instance, intent, outcome } = history();
    const result = await instance.discoverAttempts({ effectKeys: ['npm:@aexos/installer@1.2.3'] });
    expect(result.complete).toBe(true);
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]).toMatchObject({ intent, outcome, identity: { runId: 9, runAttempt: 1, artifactId: 41 } });
  });
  test('death after persisted intent retains missing outcome as uncertainty', async () => {
    const { instance } = history({ missingOutcome: true });
    const result = await instance.discoverAttempts({ effectKeys: ['npm:@aexos/core@1.0.0'] });
    expect(result.complete).toBe(true);
    expect(result.attempts[0].outcome).toBeNull();
  });
  test.each([{ missingIntent: true }, { expired: true }])('unavailable historical writer evidence blocks absence assumptions %j', async config => {
    const { instance, fetchImpl } = history(config);
    expect((await instance.discoverAttempts({ effectKeys: ['npm:@aexos/core@1.0.0'] })).complete).toBe(false);
    expect(fetchImpl.mock.calls.every(([, init]) => init.method === 'GET')).toBe(true);
  });
  test('disjoint prior intent reaches the strict engine rather than raw overlap filtering', async () => {
    const { instance, fetchImpl } = history({ overlap: false });
    expect((await instance.discoverAttempts({ effectKeys: ['npm:@aexos/core@1.0.0'] })).attempts).toHaveLength(1);
    expect(fetchImpl.mock.calls.some(([url]) => url.endsWith('/41/zip'))).toBe(true);
  });
  test.each([[], ['bogus'], 'not-an-array', ['asset:a', 'asset:b', 'npm:c', 'release-create:d', 'release-publish:e', 'tag:f']].map(value => [value]))('malformed/nonexhaustive effect set %j cannot disappear as non-overlap', async malformedEffects => {
    const { instance } = history({ malformedEffects });
    const result = await instance.discoverAttempts({ effectKeys: ['npm:@aexos/core@1.0.0'] });
    expect(result.complete).toBe(false);
  });
  test('proven preflight/upload failure before current executor is safe without an intent', async () => {
    const { instance } = history({ missingIntent: true, executorConclusion: 'skipped' });
    expect(await instance.discoverAttempts({ effectKeys: ['npm:@aexos/core@1.0.0'] })).toEqual({ complete: true, attempts: [] });
  });
  test.each([
    { executorConclusion: 'cancelled' }, { executorConclusion: 'failure' },
    { executorConclusion: 'skipped', foreignController: true },
    { executorConclusion: 'skipped', jobName: 'publish_legacy_cyryx_core' },
  ])('unproven or legacy writer %j remains uncertain without durable evidence', async config => {
    expect((await history({ missingIntent: true, ...config }).instance.discoverAttempts({ effectKeys: ['npm:@aexos/core@1.0.0'] })).complete).toBe(false);
  });
  test('run discovery paginates beyond the first hundred with exact totals', async () => {
    const fetchImpl = jest.fn(async url => {
      if (url.includes('/actions/workflows/')) {
        const page = Number(new URL(url).searchParams.get('page'));
        return response({ total_count: 101, workflow_runs: Array.from({ length: page === 1 ? 100 : 1 }, (_, i) => run(1000 + (page - 1) * 100 + i, 1, true)) });
      }
      if (url.includes('/artifacts?')) return response({ total_count: 0, artifacts: [] });
      if (url.includes('/jobs?')) return response({ total_count: 0, jobs: [] });
      throw new Error('Unexpected pagination route');
    });
    expect(await provider(fetchImpl).discoverAttempts({ effectKeys: ['npm:@aexos/core@1.0.0'] })).toEqual({ complete: true, attempts: [] });
    expect(fetchImpl.mock.calls.some(([url]) => url.includes('/actions/workflows/') && url.includes('page=2'))).toBe(true);
  });
});

describe('verified unselected companion receipt and archive dependency', () => {
  test.each(['matching', 'wrong-receipt-digest', 'unsealed', 'missing-intent'])('actual candidate/receipt/module chain %s', async variation => {
    const core = require('../../../scripts/ci/sealed-release');
    const source = path.join(temporary, 'dependency-source');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'package.json'), JSON.stringify({ name: '@aexos/installer', version: '1.2.3', main: 'index.js', bin: { fixture: 'cli.js' }, files: ['index.js', 'cli.js'] }));
    fs.writeFileSync(path.join(source, 'index.js'), 'module.exports = {};');
    fs.writeFileSync(path.join(source, 'cli.js'), 'console.log("fixture help");');
    const npm = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
    const packed = spawnSync(process.execPath, [npm, 'pack', '--json', '--ignore-scripts'], { cwd: source, encoding: 'utf8', windowsHide: true });
    expect(packed.status).toBe(0);
    const tgzPath = path.join(source, JSON.parse(packed.stdout)[0].filename);
    const actual = await core.inspectTgz(tgzPath, { key: 'installer' });
    const manifest = { schemaVersion: 1, repository: REPOSITORY, repositoryId: REPOSITORY_ID, sourceSha: context.controllerSha,
      producer: { workflowPath: WORKFLOW, runId: 10, runAttempt: 1, controllerSha: context.controllerSha }, channel: 'latest',
      release: { tag: 'installer-v1.2.3', title: 'Fixture dependency', notes: 'Fixture only', prerelease: false },
      packages: [{ key: 'installer', name: '@aexos/installer', version: '1.2.3', sourcePath: 'packages/installer', tgzPath: 'installer.tgz',
        size: actual.size, sha256: actual.sha256, integrity: actual.integrity, inventory: actual.inventory, requiredChecks: core.PACKAGES.installer.checks }],
      dependencies: [], verification: { policyVersion: 1, preSealReports: core.PRESEAL_CHECKS.map(id => ({ id, sha256: 'b'.repeat(64) })) } };
    const manifestBytes = Buffer.from(JSON.stringify(manifest));
    const tgzBytes = fs.readFileSync(tgzPath);
    const candidateZip = bundle([{ name: 'candidate.json', text: manifestBytes.toString() }, { name: 'installer.tgz', base64: tgzBytes.toString('base64') }], 'dependency-candidate.zip');
    const locator = { sourceSha: context.controllerSha, producerRunId: 10, producerRunAttempt: 1, artifactId: 101, artifactDigest: `sha256:${sha(candidateZip)}`, manifestSha256: sha(manifestBytes) };
    const directory = path.join(temporary, 'candidate');
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory, 'candidate.json'), manifestBytes);
    fs.copyFileSync(tgzPath, path.join(directory, 'installer.tgz'));
    const candidate = await core.loadCandidate(directory, locator);
    const priorContext = { ...context, runId: 11 };
    const intent = core.buildIntent(candidate, priorContext);
    const intentText = JSON.stringify(intent);
    const effects = intent.effectKeys.map(key => {
      const type = { npm: 'package', tag: 'tag', 'release-create': 'release', asset: 'asset', 'release-publish': 'release-finalization' }[key.split(':')[0]];
      return { key, type, state: 'verified', writeAttempted: true, writeOutcome: 'accepted', publishedObserved: true, doctor: null,
        checks: type === 'package' ? core.PACKAGES.installer.checks.map(id => ({ id, package: '@aexos/installer', version: '1.2.3', nodeMajor: id.startsWith('exports-node-') ? Number(id.slice(-2)) : 24, exitCode: 0, outputSha256: 'b'.repeat(64) })) : [], before: 'absent', after: 'matching', requestId: null };
    });
    const receipt = { schemaVersion: 1, locator, manifestSha256: candidate.manifestSha256, transactionId: candidate.transactionId, context: priorContext,
      intentSha256: sha(Buffer.from(intentText)), sealed: variation !== 'unsealed', state: 'verified', observedAt: '2026-01-01T00:00:00.000Z', effects };
    const receiptText = JSON.stringify(receipt);
    const outcomeZip = bundle([{ name: 'receipt.json', text: receiptText }], 'dependency-outcome.zip');
    const intentZip = bundle([{ name: 'intent.json', text: intentText }], 'dependency-intent.zip');
    const artifacts = {
      101: metadata(101, candidateZip, 'aexos-release-candidate-10-1', 10),
      102: metadata(102, outcomeZip, 'aexos-release-outcome-11-1', 11),
      103: metadata(103, intentZip, 'aexos-release-intent-11-1', 11),
    };
    const archives = { 101: candidateZip, 102: outcomeZip, 103: intentZip };
    const fetchImpl = jest.fn(async url => {
      if (url.startsWith('https://registry.npmjs.org/')) return url.endsWith('.tgz') ? response(tgzBytes) : response({ name: '@aexos/installer', versions: { '1.2.3': { name: '@aexos/installer', version: '1.2.3', dist: { integrity: actual.integrity, tarball: 'https://registry.npmjs.org/installer.tgz' } } }, 'dist-tags': { latest: '1.2.3' } });
      const match = /\/actions\/artifacts\/(\d+)(\/zip)?$/.exec(url);
      if (match) return response(match[2] ? archives[match[1]] : artifacts[match[1]]);
      if (url.includes('/runs/11/artifacts?')) return response({ total_count: variation === 'missing-intent' ? 0 : 1, artifacts: variation === 'missing-intent' ? [] : [artifacts[103]] });
      if (url.includes('/jobs?')) return response({ total_count: 1, jobs: [{ name: url.includes('/runs/10/') ? 'Prepare sealed candidate' : 'Publish sealed transaction', status: 'completed', conclusion: 'success' }] });
      if (url.includes('/runs/10/attempts/1')) return response(run(10, 1, true));
      if (url.includes('/runs/11/attempts/1')) return response(run(11, 1, true));
      throw new Error('Unexpected dependency evidence URL');
    });
    const dependency = { name: '@aexos/installer', version: '1.2.3', integrity: actual.integrity, sourceReceiptId: `gha:102:${sha(outcomeZip)}:${variation === 'wrong-receipt-digest' ? 'b'.repeat(64) : sha(Buffer.from(receiptText))}` };
    const result = await provider(fetchImpl).observeDependency(dependency);
    expect(result.kind).toBe(variation === 'matching' ? 'matching' : 'unknown');
    expect(fetchImpl.mock.calls.every(([, init]) => init.method === 'GET')).toBe(true);
  });
});
