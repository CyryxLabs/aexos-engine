'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const tar = require('tar');
const zlib = require('zlib');
const {
  REPOSITORY, REPOSITORY_ID, WORKFLOW, PACKAGES, PRESEAL_CHECKS,
  validateManifest, validateLocator, inspectTgz, loadCandidate, digest,
  buildIntent, validateIntent, validateReceipt, preflightCandidate, runTransaction,
} = require('../../../scripts/ci/sealed-release');

jest.setTimeout(60000);
let fixture;
let tgz;
let inspected;
const sha = '1'.repeat(40);
const hex = '2'.repeat(64);
const manifest = () => ({
  schemaVersion: 1, repository: REPOSITORY, repositoryId: REPOSITORY_ID, sourceSha: sha,
  producer: { workflowPath: WORKFLOW, runId: 100, runAttempt: 1, controllerSha: sha },
  channel: 'latest', release: { tag: 'aexos-install-v1.2.3', title: 'Fixture release', notes: 'Fixture only', prerelease: false },
  packages: [{ key: 'aexos-install', name: '@aexos/install', version: '1.2.3', sourcePath: 'packages/aexos-install',
    tgzPath: 'install.tgz', size: inspected.size, sha256: inspected.sha256, integrity: inspected.integrity,
    inventory: inspected.inventory, requiredChecks: PACKAGES['aexos-install'].checks }],
  dependencies: [], verification: { policyVersion: 1, preSealReports: PRESEAL_CHECKS.map(id => ({ id, sha256: hex })) },
});
const locator = body => ({ sourceSha: sha, producerRunId: 100, producerRunAttempt: 1, artifactId: 201,
  artifactDigest: `sha256:${hex}`, manifestSha256: digest(body) });
const candidate = () => {
  const dir = fs.mkdtempSync(path.join(fixture, 'candidate-'));
  fs.copyFileSync(tgz, path.join(dir, 'install.tgz'));
  const body = Buffer.from(JSON.stringify(manifest()));
  fs.writeFileSync(path.join(dir, 'candidate.json'), body);
  return { dir, locator: locator(body) };
};

beforeAll(async () => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'aex-sealed-tests-'));
  const source = path.join(fixture, 'source');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'index.js'), 'module.exports = { fixture: true };\n');
  fs.writeFileSync(path.join(source, 'cli.js'), 'process.stdout.write("fixture help\\n");\n');
  fs.writeFileSync(path.join(source, 'package.json'), JSON.stringify({ name: '@aexos/install', version: '1.2.3',
    main: 'index.js', bin: { 'aexos-install': 'cli.js' }, files: ['index.js', 'cli.js'] }));
  const npm = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const result = spawnSync(process.execPath, [npm, 'pack', '--json', '--ignore-scripts'], {
    cwd: source, encoding: 'utf8', timeout: 30000,
  });
  expect(result.status).toBe(0);
  const packed = JSON.parse(result.stdout);
  tgz = path.join(source, packed[0].filename);
  inspected = await inspectTgz(tgz, { key: 'aexos-install' });
});
afterAll(() => { if (fixture) fs.rmSync(fixture, { recursive: true, force: true }); });

const execution = (runId = 300) => ({ repository: REPOSITORY, repositoryId: REPOSITORY_ID,
  workflowPath: WORKFLOW, controllerSha: sha, runId, runAttempt: 1, operation: 'publish' });
const verifiedInstall = async value => ({ ok: true, checks: value.packages.flatMap(pkg => PACKAGES[pkg.key].checks.map(id => ({
  id, package: pkg.name, version: pkg.version, nodeMajor: id.startsWith('exports-node-') ? Number(id.slice(-2)) : 24,
  exitCode: 0, outputSha256: hex,
}))) });

async function transactionFixture() {
  const source = candidate();
  const loaded = await loadCandidate(source.dir, source.locator);
  const context = execution();
  const intent = buildIntent(loaded, context);
  const remote = { package: false, tag: false, release: false, draft: true, assets: new Set() };
  const writes = [];
  let sealed = false;
  const write = (name, action) => jest.fn(async () => {
    if (sealed) throw new Error('write after seal');
    writes.push(name);
    action();
    return { kind: 'accepted' };
  });
  const providers = {
    verifyContext: jest.fn(async () => context),
    verifyProducer: jest.fn(async () => ({ controllerSha: sha })),
    verifyIntent: jest.fn(async () => ({ sha256: digest(JSON.stringify(intent)) })),
    observePackage: jest.fn(async () => remote.package ? { kind: 'matching', value: { tarballPath: loaded.packages[0].absoluteTgzPath } } : { kind: 'absent' }),
    observeTag: jest.fn(async () => ({ kind: remote.tag ? 'matching' : 'absent' })),
    observeRelease: jest.fn(async () => remote.release ? { kind: 'matching', value: { id: 1, draft: remote.draft } } : { kind: 'absent' }),
    observeAsset: jest.fn(async (release, asset) => ({ kind: remote.assets.has(asset.name) ? 'matching' : 'absent' })),
    publishPackage: write('npm', () => { remote.package = true; }),
    createTag: write('tag', () => { remote.tag = true; }),
    createRelease: write('release', () => { remote.release = true; }),
    uploadAsset: jest.fn(async (release, asset) => {
      if (sealed) throw new Error('write after seal');
      writes.push(`asset:${asset.name}`); remote.assets.add(asset.name); return { kind: 'accepted' };
    }),
    finalizeRelease: write('finalize', () => { remote.draft = false; }),
    seal: jest.fn(() => { sealed = true; }),
  };
  const options = { candidate: loaded, context, providers, intent, intentEvidence: { artifactId: 401, digest: `sha256:${hex}` },
    priorAttempts: { complete: true, attempts: [] }, verifyInstalled: jest.fn(verifiedInstall), sleep: async () => {} };
  return { options, providers, writes, remote, loaded, intent };
}

describe('durable release executor using actual npm-packed fixture bytes', () => {
  test('deterministic intent and verified transaction write each missing effect once; seal precedes receipt', async () => {
    const { options, providers, writes, loaded, intent } = await transactionFixture();
    expect(buildIntent(loaded, execution())).toEqual(intent);
    expect(validateIntent(intent, loaded)).toBe(intent);
    options.onReceipt = jest.fn(() => { expect(providers.seal).toHaveBeenCalledTimes(1); });
    const receipt = await runTransaction(options);
    expect(receipt.state).toBe('verified');
    expect(writes).toEqual(['npm', 'tag', 'release', 'asset:candidate.json', 'asset:install.tgz', 'finalize']);
    expect(options.verifyInstalled).toHaveBeenCalledTimes(2);
    expect(options.onReceipt).toHaveBeenCalledTimes(1);
    expect(validateReceipt(receipt, intent)).toBe(receipt);
  });

  test.each(['unknown', 'unauthorized', 'forbidden', 'retryable-read', 'conflict'])('preflight %s permits zero writes', async kind => {
    const { options, providers, writes } = await transactionFixture();
    providers.observeTag.mockResolvedValue({ kind });
    const receipt = await runTransaction(options);
    expect(receipt.state).toBe(kind === 'conflict' ? 'conflict' : 'blocked');
    expect(writes).toEqual([]);
  });

  test('existing conflicting asset prevents even the first npm write', async () => {
    const { options, providers, writes, remote } = await transactionFixture();
    remote.release = true;
    providers.observeAsset.mockResolvedValue({ kind: 'conflict' });
    expect((await runTransaction(options)).state).toBe('conflict');
    expect(writes).toEqual([]);
  });

  test('preflight is read-only and does not require an uploaded intent yet', async () => {
    const { options, providers, writes } = await transactionFixture();
    await preflightCandidate(options);
    expect(providers.verifyIntent).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  test.each(['missing', 'failed', 'duplicate', 'wrong-runtime'])('a %s required check prevents all writes', async mode => {
    const { options, writes } = await transactionFixture();
    options.verifyInstalled = async value => {
      const result = await verifiedInstall(value);
      if (mode === 'missing') result.checks.pop();
      if (mode === 'failed') result.checks[0].exitCode = 1;
      if (mode === 'duplicate') result.checks.push(result.checks[0]);
      if (mode === 'wrong-runtime') result.checks[0].nodeMajor = 24;
      return result;
    };
    expect((await runTransaction(options)).state).toBe('blocked');
    expect(writes).toEqual([]);
  });

  test('failed post-publication verification preserves the observed package and stops later effects', async () => {
    const { options, writes } = await transactionFixture();
    options.verifyInstalled.mockImplementationOnce(verifiedInstall).mockResolvedValueOnce({ ok: false });
    const receipt = await runTransaction(options);
    expect(receipt.state).toBe('blocked');
    expect(receipt.effects[0]).toMatchObject({ state: 'published-but-unverified', publishedObserved: true, writeAttempted: true, writeOutcome: 'accepted' });
    expect(writes).toEqual(['npm']);
  });

  test.each(['return', 'throw'])('unknown npm %s reconciles matching bytes without a second write', async mode => {
    const { options, providers, remote } = await transactionFixture();
    providers.publishPackage.mockImplementation(async () => {
      remote.package = true;
      if (mode === 'throw') throw new Error('connection closed after commit');
      return { kind: 'unknown' };
    });
    const receipt = await runTransaction(options);
    expect(receipt.state).toBe('verified');
    expect(receipt.effects[0].writeOutcome).toBe('unknown');
    expect(providers.publishPackage).toHaveBeenCalledTimes(1);
  });

  test('unknown write followed by absence is blocked, with no auth fallback or later effect', async () => {
    const { options, providers, writes } = await transactionFixture();
    providers.publishPackage.mockResolvedValue({ kind: 'unknown' });
    const receipt = await runTransaction(options);
    expect(receipt.state).toBe('blocked');
    expect(receipt.effects[0]).toMatchObject({ writeAttempted: true, writeOutcome: 'unknown', publishedObserved: false });
    expect(providers.publishPackage).toHaveBeenCalledTimes(1);
    expect(writes).toEqual([]);
  });

  test('accepted publication propagation gets bounded read-only reconciliation', async () => {
    const { options, providers, loaded, writes } = await transactionFixture();
    let readsAfterWrite = 0;
    providers.observePackage.mockImplementation(async () => {
      if (!writes.includes('npm')) return { kind: 'absent' };
      readsAfterWrite++;
      return readsAfterWrite < 3 ? { kind: 'absent' } : { kind: 'matching', value: { tarballPath: loaded.packages[0].absoluteTgzPath } };
    });
    options.sleep = jest.fn(async () => {});
    expect((await runTransaction(options)).state).toBe('verified');
    expect(options.sleep).toHaveBeenCalledTimes(2);
    expect(providers.publishPackage).toHaveBeenCalledTimes(1);
  });

  test('candidate mutation during local checks prevents all writes', async () => {
    const { options, loaded, writes } = await transactionFixture();
    options.verifyInstalled = async value => {
      fs.appendFileSync(loaded.packages[0].absoluteTgzPath, 'changed');
      return verifiedInstall(value);
    };
    expect((await runTransaction(options)).state).toBe('blocked');
    expect(writes).toEqual([]);
  });

  test('all matching effects can be verified with zero writes despite unavailable prior history', async () => {
    const { options, remote, writes } = await transactionFixture();
    remote.package = remote.tag = remote.release = true;
    remote.draft = false;
    remote.assets = new Set(['candidate.json', 'install.tgz']);
    options.priorAttempts = { complete: false, attempts: [] };
    expect((await runTransaction(options)).state).toBe('verified');
    expect(writes).toEqual([]);
  });

  test('missing terminal ledger makes even later unobserved effects uncertain', async () => {
    const { options, intent, writes } = await transactionFixture();
    const prior = { ...intent, context: execution(299) };
    options.priorAttempts.attempts.push({ intent: prior, intentSha256: hex,
      identity: { artifactId: 402, digest: `sha256:${hex}`, runId: 299, runAttempt: 1 }, outcome: null });
    expect((await runTransaction(options)).state).toBe('blocked');
    expect(writes).toEqual([]);
  });

  test('a complete sealed no-write outcome authorizes fresh absent effects on another attempt', async () => {
    const first = await transactionFixture();
    first.options.verifyInstalled.mockResolvedValue({ ok: false });
    const outcome = await runTransaction(first.options);
    const next = await transactionFixture();
    const prior = first.intent;
    next.options.priorAttempts.attempts.push({ intent: prior, intentSha256: outcome.intentSha256,
      identity: { artifactId: 402, digest: `sha256:${hex}`, runId: 300, runAttempt: 1 }, outcome,
      outcomeIdentity: { artifactId: 403, digest: `sha256:${hex}`, runId: 300 } });
    expect((await runTransaction(next.options)).state).toBe('verified');
    expect(next.writes).toHaveLength(6);
  });

  test.each(['partial', 'unsealed', 'wrong-digest', 'wrong-run', 'prior-unknown-write'])('%s prior outcome never proves no write', async mode => {
    const first = await transactionFixture();
    first.options.verifyInstalled.mockResolvedValue({ ok: false });
    const outcome = await runTransaction(first.options);
    const next = await transactionFixture();
    if (mode === 'partial') outcome.effects.pop();
    if (mode === 'unsealed') outcome.sealed = false;
    if (mode === 'wrong-digest') outcome.intentSha256 = '9'.repeat(64);
    if (mode === 'wrong-run') outcome.context = execution(999);
    if (mode === 'prior-unknown-write') Object.assign(outcome.effects[0], { writeAttempted: true, writeOutcome: 'unknown' });
    next.options.priorAttempts.attempts.push({ intent: first.intent, intentSha256: digest(JSON.stringify(first.intent)),
      identity: { artifactId: 402, digest: `sha256:${hex}`, runId: 300, runAttempt: 1 }, outcome,
      outcomeIdentity: { artifactId: 403, digest: `sha256:${hex}`, runId: 300 } });
    expect((await runTransaction(next.options)).state).toBe('blocked');
    expect(next.writes).toEqual([]);
  });

  test('terminal persistence failure cannot cause another release effect', async () => {
    const { options, providers, writes } = await transactionFixture();
    options.onReceipt = () => { throw new Error('disk full'); };
    await expect(runTransaction(options)).rejects.toThrow('disk full');
    expect(providers.seal).toHaveBeenCalledTimes(1);
    expect(writes).toHaveLength(6);
    await expect(providers.createTag()).rejects.toThrow('write after seal');
    expect(writes).toHaveLength(6);
  });
});

test('actual npm-packed bytes produce a content inventory and load a sealed candidate', async () => {
  expect(inspected.metadata.version).toBe('1.2.3');
  expect(inspected.inventory.map(item => item.path)).toContain('package/cli.js');
  expect(inspected.integrity).toMatch(/^sha512-/);
  const test = candidate();
  const loaded = await loadCandidate(test.dir, test.locator);
  expect(loaded.packages[0].sha256).toBe(digest(fs.readFileSync(tgz)));
  expect(loaded.transactionId).toMatch(/^[a-f0-9]{64}$/);
});

test.each([
  ['extra field', value => { value.ignored = true; }],
  ['foreign repository', value => { value.repository = 'someone/aexos-engine'; }],
  ['legacy redirect is not canonical authority', value => { value.repository = 'CyryxLabs/AEXOS'; }],
  ['wrong repository id', value => { value.repositoryId += 1; }],
  ['moving source ref', value => { value.sourceSha = 'main'; }],
  ['invalid producer attempt', value => { value.producer.runAttempt = 0; }],
  ['empty package selection', value => { value.packages = []; }],
  ['unknown package', value => { value.packages[0].key = 'all'; }],
  ['duplicate package', value => { value.packages.push(value.packages[0]); }],
  ['source escape', value => { value.packages[0].sourcePath = '../other'; }],
  ['archive escape', value => { value.packages[0].tgzPath = '../install.tgz'; }],
  ['channel implicit', value => { value.channel = ''; }],
  ['stable preview', value => { value.channel = 'preview'; }],
  ['prerelease latest', value => { value.packages[0].version = '1.2.3-beta.1'; }],
  ['release version differs', value => { value.release.tag = 'aexos-install-v1.2.4'; }],
  ['release state differs', value => { value.release.prerelease = true; }],
  ['mandatory checks omitted', value => { value.packages[0].requiredChecks = ['cli-help']; }],
  ['missing preseal evidence', value => { value.verification.preSealReports.pop(); }],
  ['caller passed flag', value => { value.verification.passed = true; }],
  ['duplicate inventory path', value => { value.packages[0].inventory = [...value.packages[0].inventory, value.packages[0].inventory[0]]; }],
])('strict manifest rejects %s', (_, mutate) => {
  const value = structuredClone(manifest());
  mutate(value);
  expect(() => validateManifest(value)).toThrow('SEALED_RELEASE_INVALID');
});

test.each(['beta', 'preview'])('explicit prerelease channel %s is allowed', channel => {
  const value = manifest();
  value.channel = channel;
  value.packages[0].version = '1.2.3-beta.1';
  value.release.tag = 'aexos-install-v1.2.3-beta.1';
  value.release.prerelease = true;
  expect(validateManifest(value)).toBe(value);
});

test('locator rejects fields that could silently replace pinned artifact identity', () => {
  const value = locator(Buffer.from('test'));
  value.ref = 'main';
  expect(() => validateLocator(value)).toThrow('locator fields');
});

test.each(['extra-file', 'missing-tgz', 'changed-tgz', 'changed-manifest', 'wrong-attempt'])('candidate refuses %s', async variation => {
  const test = candidate();
  if (variation === 'extra-file') fs.writeFileSync(path.join(test.dir, 'extra.txt'), 'unexpected');
  if (variation === 'missing-tgz') fs.unlinkSync(path.join(test.dir, 'install.tgz'));
  if (variation === 'changed-tgz') fs.appendFileSync(path.join(test.dir, 'install.tgz'), 'changed bytes');
  if (variation === 'changed-manifest') fs.appendFileSync(path.join(test.dir, 'candidate.json'), '\n');
  if (variation === 'wrong-attempt') test.locator.producerRunAttempt = 2;
  await expect(loadCandidate(test.dir, test.locator)).rejects.toThrow('SEALED_RELEASE_INVALID');
});

async function archive(entries, metadata = { name: '@aexos/install', version: '1.2.3' }) {
  const dir = fs.mkdtempSync(path.join(fixture, 'archive-'));
  fs.mkdirSync(path.join(dir, 'package'));
  fs.writeFileSync(path.join(dir, 'package/package.json'), JSON.stringify(metadata));
  for (const [file, value] of Object.entries(entries)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), value);
  }
  const file = path.join(dir, 'fixture.tgz');
  await tar.c({ gzip: true, cwd: dir, file }, ['package', ...Object.keys(entries).filter(name => !name.startsWith('package/'))]);
  return file;
}

test.each([
  ['foreign name', { name: '@other/install', version: '1.2.3' }],
  ['private flag', { name: '@aexos/install', version: '1.2.3', private: true }],
  ['missing bin', { name: '@aexos/install', version: '1.2.3', bin: 'absent.js' }],
  ['alternate registry', { name: '@aexos/install', version: '1.2.3', publishConfig: { registry: 'https://elsewhere.invalid/' } }],
  ['tag override', { name: '@aexos/install', version: '1.2.3', publishConfig: { tag: 'latest' } }],
])('real archive rejects %s', async (_, metadata) => {
  await expect(inspectTgz(await archive({}, metadata), { key: 'aexos-install' })).rejects.toThrow('SEALED_RELEASE_INVALID');
});

test.each(['package/.env', 'package/pro/private.js', 'package/private.key', 'outside.txt'])('real archive rejects forbidden file %s', async file => {
  await expect(inspectTgz(await archive({ [file]: 'forbidden' }), { key: 'aexos-install' })).rejects.toThrow('SEALED_RELEASE_INVALID');
});

test('archive bytes after the tar terminator cannot hide an unlisted payload', async () => {
  const file = path.join(fixture, 'trailing.tgz');
  const data = Buffer.concat([zlib.gunzipSync(fs.readFileSync(tgz)), Buffer.alloc(512, 65)]);
  fs.writeFileSync(file, zlib.gzipSync(data));
  await expect(inspectTgz(file, { key: 'aexos-install' })).rejects.toThrow('hidden trailing archive data');
});

test.each(['../outside.json', '/outside.json', 'package/../outside.json'])('PAX cannot hide an unsafe raw TAR path %s', async rawPath => {
  const metadata = Buffer.from(JSON.stringify({ name: '@aexos/install', version: '1.2.3' }));
  const header = Buffer.alloc(512);
  new tar.Header({ path: rawPath, type: 'File', size: metadata.length, mode: 0o644 }).encode(header);
  const pax = new tar.Pax({ path: 'package/package.json' }).encode();
  const file = path.join(fixture, `pax-${digest(rawPath)}.tgz`);
  fs.writeFileSync(file, zlib.gzipSync(Buffer.concat([pax, header, metadata, Buffer.alloc(512 - metadata.length), Buffer.alloc(1024)])));
  await expect(inspectTgz(file, { key: 'aexos-install' })).rejects.toThrow('SEALED_RELEASE_INVALID');
});

test('public Pro integration source is not mistaken for the private top-level Pro payload', async () => {
  const file = await archive({ 'package/src/pro/public-integration.js': 'module.exports = {};' });
  expect((await inspectTgz(file, { key: 'aexos-install' })).inventory.map(entry => entry.path)).toContain('package/src/pro/public-integration.js');
});

test('the canonical npm registry without a trailing slash is accepted', async () => {
  const file = await archive({}, { name: '@aexos/install', version: '1.2.3', publishConfig: { access: 'public', registry: 'https://registry.npmjs.org' } });
  expect((await inspectTgz(file, { key: 'aexos-install' })).metadata.name).toBe('@aexos/install');
});
