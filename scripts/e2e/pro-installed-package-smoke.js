'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const http = require('node:http');
const cp = require('node:child_process');
const { createRequire } = require('node:module');
// Local synthetic acceptance only. Never use real credentials or paid content here.
const usage =
  'node scripts/e2e/pro-installed-package-smoke.js --core-tgz <file> --installer-tgz <file> --output-dir <new-directory> [--npm-cli <npm-cli.js>]';
const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  if (key === '--help') {
    console.log(usage);
    process.exit(0);
  }
  assert(
    ['--core-tgz', '--installer-tgz', '--output-dir', '--npm-cli'].includes(key),
    'Unknown option: ' + key,
  );
  assert(
    process.argv[i + 1] && !process.argv[i + 1].startsWith('--') && !args[key],
    'Missing or repeated option: ' + key,
  );
  args[key] = path.resolve(process.argv[i + 1]);
}
for (const key of ['--core-tgz', '--installer-tgz', '--output-dir']) assert(args[key], usage);
const npmCandidates = [
  args['--npm-cli'],
  process.env.npm_execpath,
  path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
  path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
];
const npm = npmCandidates.find(
  (p) => p && path.isAbsolute(p) && path.basename(p) === 'npm-cli.js' && fs.existsSync(p),
);
assert(npm, 'Cannot locate npm-cli.js; supply --npm-cli explicitly.');
for (const key of ['--core-tgz', '--installer-tgz'])
  assert(fs.statSync(args[key]).isFile(), key + ' must be a regular TGZ file');
const evidence = args['--output-dir'];
assert(
  !fs.existsSync(evidence),
  'Output directory must not already exist; prior evidence is preserved.',
);
fs.mkdirSync(evidence, { recursive: true });
const root = fs.mkdtempSync(path.join(evidence, 'consumers-'));
const packages = {
  packages: [
    { key: 'core', name: '@aexos/core', tgz: args['--core-tgz'] },
    { key: 'installer', name: '@aexos/installer', tgz: args['--installer-tgz'] },
  ],
};
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const readHash = (file) => hash(fs.readFileSync(file));
for (const p of packages.packages) {
  p.tgzSha256 = readHash(p.tgz);
  p.integrity =
    'sha512-' + crypto.createHash('sha512').update(fs.readFileSync(p.tgz)).digest('base64');
}
const receipt = {
  startedAt: new Date().toISOString(),
  root,
  boundary:
    'Actual supplied npm packages; ephemeral synthetic signed content/local HTTP authority only. No paid runtime or production provider acceptance.',
  packages: packages.packages.map((p) => ({
    key: p.key,
    tgz: p.tgz,
    sha256: p.tgzSha256,
    version: p.version,
  })),
  checks: [],
  commands: [],
};
const Module = require('node:module');
const originalCompile = Module.prototype._compile;
const compiled = new Map();
const fixtureCodeHashes = new Set();
Module.prototype._compile = function (content, filename) {
  compiled.set(filename, hash(content));
  return originalCompile.call(this, content, filename);
};
const save = () =>
  fs.writeFileSync(path.join(evidence, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([k]) =>
      !/token|secret|password|credential|api.?key|private.?key|service.?role.?key|access.?key|^AEXOS_|^SUPABASE|^STRIPE|npm_config_|node_options|node_path|^HOME$|^USERPROFILE$|^APPDATA$|^LOCALAPPDATA$/i.test(
        k,
      ),
  ),
);
for (const filename of ['user.npmrc', 'global.npmrc'])
  fs.writeFileSync(path.join(root, filename), '');
Object.assign(env, {
  npm_config_userconfig: path.join(root, 'user.npmrc'),
  npm_config_globalconfig: path.join(root, 'global.npmrc'),
  npm_config_cache: path.join(root, 'cache'),
  CI: 'true',
  FORCE_COLOR: '0',
  npm_execpath: npm,
});
const privateHome = path.join(root, 'home');
fs.mkdirSync(privateHome);
Object.assign(env, {
  HOME: privateHome,
  USERPROFILE: privateHome,
  APPDATA: privateHome,
  LOCALAPPDATA: privateHome,
});
for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, env);
function write(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
}
function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      receipt.checks.push({ name, result: 'PASS' });
      save();
    });
}
async function run(id, args, cwd) {
  const start = new Date().toISOString();
  const outPath = path.join(evidence, id + '.stdout.log');
  const errPath = path.join(evidence, id + '.stderr.log');
  const out = fs.openSync(outPath, 'wx'),
    err = fs.openSync(errPath, 'wx');
  let result;
  try {
    result = await new Promise((resolve) => {
      const child = cp.spawn(process.execPath, [npm, ...args], {
        cwd,
        env,
        windowsHide: true,
        shell: false,
        stdio: ['ignore', out, err],
      });
      const timer = setTimeout(() => child.kill(), 600000);
      child.on('error', (error) => {
        clearTimeout(timer);
        resolve({ code: null, error: error.message });
      });
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal });
      });
    });
  } finally {
    fs.closeSync(out);
    fs.closeSync(err);
  }
  receipt.commands.push({
    id,
    command: [process.execPath, npm, ...args],
    cwd,
    start,
    end: new Date().toISOString(),
    exitCode: result.code,
    signal: result.signal,
    error: result.error,
    stdoutSha256: readHash(outPath),
    stderrSha256: readHash(errPath),
  });
  save();
  assert.equal(result.code, 0, id + ' failed; inspect retained logs');
  return fs.readFileSync(outPath, 'utf8');
}
async function installConsumer(name, selected) {
  const consumer = path.join(root, name);
  write(
    path.join(consumer, 'package.json'),
    JSON.stringify({ name: 'aexos-package-smoke-' + name, version: '1.0.0', private: true }),
  );
  await run(
    name + '-install',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--workspaces=false',
      ...selected.map((p) => p.tgz),
    ],
    consumer,
  );
  const audit = JSON.parse(await run(name + '-audit', ['audit', '--json'], consumer));
  assert.equal(audit.metadata.vulnerabilities.total, 0);
  return { consumer, auditTotal: audit.metadata.vulnerabilities.total };
}
async function bindArchive(p, consumer, tar) {
  p.consumer = consumer;
  p.installedRoot = path.join(consumer, 'node_modules', ...p.name.split('/'));
  p.consumerLockSha256 = readHash(path.join(consumer, 'package-lock.json'));
  const lock = JSON.parse(fs.readFileSync(path.join(consumer, 'package-lock.json')));
  assert.equal(lock.packages['node_modules/' + p.name].integrity, p.integrity);
  const pending = [];
  const failures = [];
  p.files = [];
  await tar.t({
    file: p.tgz,
    onentry(entry) {
      try {
        assert(entry.path.startsWith('package/'), 'Unexpected archive prefix');
        assert(['File', 'Directory'].includes(entry.type), 'Unsupported supplied archive entry');
        const relative = entry.path.slice(8);
        assert(
          !relative.split('/').includes('..') && !relative.includes('\\'),
          'Unsafe supplied archive path',
        );
        if (entry.type === 'Directory') {
          entry.resume();
          return;
        }
        pending.push(
          new Promise((resolve) => {
            const digest = crypto.createHash('sha256');
            entry.on('data', (chunk) => digest.update(chunk));
            entry.on('error', (error) => {
              failures.push(error);
              resolve();
            });
            entry.on('end', () => {
              try {
                const sha256 = digest.digest('hex');
                assert.equal(readHash(path.join(p.installedRoot, relative)), sha256, relative);
                p.files.push({ file: relative, sha256 });
              } catch (error) {
                failures.push(error);
              }
              resolve();
            });
          }),
        );
      } catch (error) {
        failures.push(error);
        entry.resume();
      }
    },
  });
  await Promise.all(pending);
  assert.equal(failures.length, 0, failures.map((error) => error.message).join('; '));
  assert(p.files.length > 0);
  assert.equal(new Set(p.files.map((file) => file.file)).size, p.files.length);
  p.files.sort((a, b) => a.file.localeCompare(b.file));
  const meta = JSON.parse(fs.readFileSync(path.join(p.installedRoot, 'package.json')));
  assert.equal(meta.name, p.name);
  p.version = meta.version;
}
function archive(tar, version, malicious = false) {
  const cacheSource =
    "const fs=require('node:fs'),path=require('node:path');exports.getCachePath=t=>path.join(t,'.aexos','license.cache');exports.writeLicenseCache=async(d,t)=>{const p=exports.getCachePath(t);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,'synthetic cache '+" +
    JSON.stringify(version) +
    ");if(fs.existsSync(path.join(t,'.cache-fail')))throw new Error('Synthetic cache unavailable');return {success:true};};";
  fixtureCodeHashes.add(hash(cacheSource));
  const entries = {
    'package/package.json': JSON.stringify({
      name: '@aexos/pro',
      version,
      description: 'INERT SYNTHETIC QA ARTIFACT, NO LICENSED RUNTIME',
      aexosPro: { scaffold: false, implemented: true },
      scripts: { install: 'node -e "process.exit(91)"' },
    }),
    'package/squads/qa-fixture/agents/fixture.md': 'Synthetic content ' + version,
    'package/pro-config.yaml': 'fixture: true\n',
    'package/license/license-cache.js': cacheSource,
  };
  if (malicious) entries['package/../outside'] = 'must reject';
  const buffers = [];
  for (const [name, text] of Object.entries(entries)) {
    const bytes = Buffer.from(text),
      header = Buffer.alloc(512);
    new tar.Header({ path: name, type: 'File', size: bytes.length, mode: 0o644 }).encode(header);
    buffers.push(header, bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512));
  }
  return zlib.gzipSync(Buffer.concat([...buffers, Buffer.alloc(1024)]));
}
function verifyPackage(p) {
  assert.equal(readHash(p.tgz), p.tgzSha256);
  for (const f of p.files) assert.equal(readHash(path.join(p.installedRoot, f.file)), f.sha256);
  assert.equal(readHash(path.join(p.consumer, 'package-lock.json')), p.consumerLockSha256);
}
async function listen(server) {
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.setTimeout(15000, (socket) => socket.destroy());
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
}
async function close(server) {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
let authority, origin;
(async () => {
  const standalone = packages.packages.find((p) => p.key === 'installer');
  const core = packages.packages.find((p) => p.key === 'core');
  const standaloneInstall = await installConsumer('standalone', [standalone]);
  standalone.consumer = standaloneInstall.consumer;
  standalone.installedRoot = path.join(standalone.consumer, 'node_modules/@aexos/installer');
  const standaloneTar = createRequire(path.join(standalone.installedRoot, 'package.json'))('tar');
  await bindArchive(standalone, standalone.consumer, standaloneTar);
  const standaloneReq = createRequire(path.join(standalone.consumer, 'package.json'));
  let extractor, tar;
  await check('standalone-only installed public modules and local tar', () => {
    assert.throws(() => standaloneReq.resolve('@aexos/core/package.json'));
    standaloneReq('@aexos/installer/pro-setup');
    const moduleReq = createRequire(path.join(standalone.installedRoot, 'package.json'));
    extractor = moduleReq('./src/wizard/pro-artifact-extractor.js');
    tar = moduleReq('tar');
    assert.equal(moduleReq('tar/package.json').version, '7.5.22');
    assert(moduleReq.resolve('tar').startsWith(path.join(standalone.consumer, 'node_modules')));
    assert.equal(moduleReq('./src/licensing/artifact-trust-store.json').keys.length, 0);
  });
  await check('standalone valid extraction and hostile refusal preserve bytes', async () => {
    const dir = path.join(root, 'standalone extraction & literal!');
    fs.mkdirSync(dir);
    const p = path.join(dir, 'payload.tgz');
    write(p, archive(tar, '0.4.2'));
    const output = await extractor.extractProArtifactToTemp(p, dir, '0.4.2');
    assert.equal(JSON.parse(fs.readFileSync(path.join(output, 'package.json'))).version, '0.4.2');
    write(p, archive(tar, '0.4.2', true));
    await assert.rejects(extractor.extractProArtifactToTemp(p, dir, '0.4.2'));
  });
  const pairedInstall = await installConsumer('paired', packages.packages);
  const pair = pairedInstall.consumer;
  await bindArchive(core, pair, tar);
  const pairLockBefore = readHash(path.join(pair, 'package-lock.json'));
  const pairReq = createRequire(path.join(pair, 'package.json'));
  const pairInstaller = path.dirname(pairReq.resolve('@aexos/installer/package.json'));
  const pairCore = path.dirname(pairReq.resolve('@aexos/core/package.json'));
  const pairModuleReq = createRequire(path.join(pairInstaller, 'package.json'));
  const pairLock = JSON.parse(fs.readFileSync(path.join(pair, 'package-lock.json')));
  for (const p of packages.packages) {
    assert.equal(pairLock.packages['node_modules/' + p.name].integrity, p.integrity);
    for (const f of p.files)
      assert.equal(
        readHash(path.join(p.key === 'core' ? pairCore : pairInstaller, f.file)),
        f.sha256,
      );
  }
  receipt.paired = {
    consumer: pair,
    core: pairCore,
    installer: pairInstaller,
    lockSha256: pairLockBefore,
    auditTotal: pairedInstall.auditTotal,
    tar: pairModuleReq('tar/package.json').version,
    yaml: pairModuleReq('js-yaml/package.json').version,
  };
  const keys = crypto.generateKeyPairSync('ed25519');
  const requests = [];
  const bodies = new Map();
  for (const version of ['0.4.2', '0.4.3', '0.4.4']) bodies.set(version, archive(tar, version));
  origin = http.createServer((request, response) => {
    requests.push({
      origin: 'artifact',
      authorizationPresent: Boolean(request.headers.authorization),
      path: request.url,
    });
    const payload = bodies.get(request.url.slice(1));
    response.writeHead(payload ? 200 : 404);
    response.end(payload || 'missing');
  });
  await listen(origin);
  const artifactBase = 'http://127.0.0.1:' + origin.address().port;
  function canonical(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical(value[k]))
        .join(',') +
      '}'
    );
  }
  const subject = hash('qa-account');
  authority = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', (b) => chunks.push(b));
    request.on('end', () => {
      requests.push({
        origin: 'authority',
        authorizationMatches: request.headers.authorization === 'Bearer qa-ephemeral-access',
        path: request.url,
      });
      const query = JSON.parse(Buffer.concat(chunks));
      const payload = bodies.get(query.version),
        now = Date.now();
      if (!payload) {
        response.writeHead(400);
        response.end('Unknown synthetic version');
        return;
      }
      const unsigned = {
        schema: 'aexos.squad-artifact/v1',
        algorithm: 'Ed25519',
        keyId: 'qa-ephemeral',
        descriptorId: 'qa-' + query.version,
        product: 'aexos',
        plan: 'pro',
        subjectIdHash: subject,
        entitlementId: 'qa-entitlement',
        machineIdHash: hash(query.machineId),
        squadId: 'pro-library',
        package: '@aexos/pro',
        version: query.version,
        platform: process.platform,
        releaseChannel: 'stable',
        format: 'tgz',
        artifactUrl: artifactBase + '/' + query.version,
        sizeBytes: payload.length,
        sha256: hash(payload),
        issuedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 60000).toISOString(),
        entitlementExpiresAt: new Date(now + 3600000).toISOString(),
        revocationEpoch: 1,
      };
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          ...unsigned,
          signature: crypto
            .sign(null, Buffer.from(canonical(unsigned)), keys.privateKey)
            .toString('base64url'),
        }),
      );
    });
  });
  await listen(authority);
  // The standalone-only module loaded earlier has a distinct filesystem identity.
  process.env.AEXOS_LICENSE_API_URL = 'http://127.0.0.1:' + authority.address().port;
  process.env.AEXOS_CORE_PACKAGE_ROOT = pairCore;
  process.env.npm_execpath = npm;
  for (const [k, v] of Object.entries(env)) if (/^npm_config_/i.test(k)) process.env[k] = v;
  const setup = pairReq('@aexos/installer/pro-setup');
  assert.equal(pairModuleReq('./src/utils/package-paths.js').getCyryxCorePackageRoot(), pairCore);
  const trust = {
    schemaVersion: 1,
    product: 'aexos',
    algorithm: 'Ed25519',
    keys: [
      {
        keyId: 'qa-ephemeral',
        algorithm: 'Ed25519',
        status: 'active',
        notBefore: new Date(Date.now() - 60000).toISOString(),
        notAfter: new Date(Date.now() + 3600000).toISOString(),
        publicKeyPem: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      },
    ],
  };
  const licenseResult = {
    key: 'qa-inert-key',
    accessToken: 'qa-ephemeral-access',
    machineId: 'qa-machine-0123456789abcdef',
    cyryxCoreVersion: core.version,
    subjectIdHash: subject,
    entitlement: { entitlementId: 'qa-entitlement', plan: 'pro', revocationEpoch: 1 },
    activationResult: { key: 'qa-inert-key' },
  };
  const parent = path.join(root, 'workspace parent & literal!');
  const target = path.join(parent, 'targets', 'project & literal!');
  write(
    path.join(parent, 'package.json'),
    '{"name":"qa-parent","private":true,"workspaces":["targets/*"]}\n',
  );
  write(
    path.join(target, 'package.json'),
    '{"name":"qa-target","version":"1.0.0","private":true}\n',
  );
  write(path.join(target, '.aexos-core/core-config.yaml'), 'project: qa-fixture\n');
  write(path.join(target, '.claude/commands/qa-fixture/fixture.md'), 'user command');
  const parentHash = readHash(path.join(parent, 'package.json')),
    targetHash = readHash(path.join(target, 'package.json'));
  await check('empty production trust refuses before artifact-origin request', async () => {
    const count = requests.filter((r) => r.origin === 'artifact').length;
    const result = await setup._testing.acquireProArtifactSourceDir(target, licenseResult, {
      proArtifactVersion: '0.4.2',
    });
    assert.equal(result.success, false);
    assert.match(result.error, /not trusted/i);
    assert.equal(requests.filter((r) => r.origin === 'artifact').length, count);
  });
  async function install(version) {
    return setup.stepInstallScaffold(target, {
      refreshArtifact: true,
      force: true,
      licenseResult,
      artifactTrustStore: trust,
      proArtifactVersion: version,
    });
  }
  await check(
    'actual signed local acquisition plus target npm installs requested version',
    async () => {
      const result = await install('0.4.2');
      assert.equal(result.success, true, JSON.stringify(result));
      assert.equal(
        JSON.parse(fs.readFileSync(path.join(target, 'node_modules/@aexos/pro/package.json')))
          .version,
        '0.4.2',
      );
    },
  );
  await check('actual signed refresh commits later requested version', async () => {
    const result = await install('0.4.3');
    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(target, 'node_modules/@aexos/pro/package.json')))
        .version,
      '0.4.3',
    );
  });
  write(
    path.join(target, 'node_modules/user-owned-dependency/sentinel'),
    'preserve unrelated bytes',
  );
  write(path.join(target, 'squads/qa-fixture/agents/fixture.md'), 'user modified prior agent');
  write(path.join(target, '.claude/commands/qa-fixture/fixture.md'), 'user modified prior command');
  const preserve = [
    'package.json',
    '.aexos/license.cache',
    '.aexos-core/core-config.yaml',
    'node_modules/@aexos/pro/package.json',
    'node_modules/user-owned-dependency/sentinel',
    'squads/qa-fixture/agents/fixture.md',
    '.claude/commands/qa-fixture/fixture.md',
    'pro-version.json',
    'pro-installed-manifest.yaml',
  ];
  const before = Object.fromEntries(preserve.map((p) => [p, readHash(path.join(target, p))]));
  write(path.join(target, '.cache-fail'), 'synthetic failure trigger');
  await check(
    'real signed refresh and npm followed by cache failure restores prior runtime and user content',
    async () => {
      const result = await install('0.4.4');
      assert.equal(result.success, false);
      assert.match(result.error, /Synthetic cache unavailable/);
      for (const [p, h] of Object.entries(before))
        assert.equal(readHash(path.join(target, p)), h, p);
      assert(!fs.readdirSync(target).some((p) => p.startsWith('.aexos-pro-')));
    },
  );
  await check(
    'authority token isolated, parent/target manifests and supplied payloads preserved',
    () => {
      assert(requests.filter((r) => r.origin === 'authority').every((r) => r.authorizationMatches));
      assert(requests.filter((r) => r.origin === 'artifact').every((r) => !r.authorizationPresent));
      assert.equal(readHash(path.join(parent, 'package.json')), parentHash);
      assert.equal(readHash(path.join(target, 'package.json')), targetHash);
      assert.equal(readHash(path.join(pair, 'package-lock.json')), pairLockBefore);
      for (const p of packages.packages) {
        verifyPackage(p);
        for (const f of p.files)
          assert.equal(
            readHash(path.join(p.key === 'core' ? pairCore : pairInstaller, f.file)),
            f.sha256,
          );
      }
    },
  );
  const foreign = Object.keys(require.cache).filter(
    (p) =>
      p !== __filename &&
      !p.startsWith(path.join(standalone.consumer, 'node_modules')) &&
      !p.startsWith(path.join(pair, 'node_modules')),
  );
  receipt.syntheticLoadedModules = foreign.map((p) => ({
    path: p,
    compiledSha256: compiled.get(p),
  }));
  for (const p of foreign) {
    assert(p.startsWith(require('node:os').tmpdir() + path.sep));
    assert(
      /\/aexos-pro-artifact-[^/]+\/package-root-[^/]+\/node_modules\/@aexos\/pro\/license\/license-cache\.js$/.test(
        p.replaceAll('\\', '/'),
      ),
    );
    assert(fixtureCodeHashes.has(compiled.get(p)));
  }
  assert.equal(foreign.length, 3);
  receipt.loadedModules = Object.keys(require.cache).length - 1;
  receipt.requests = requests;
  receipt.target = target;
  receipt.result = 'PASS';
})()
  .catch((error) => {
    receipt.result = 'FAIL';
    receipt.error = { message: error.message, stack: error.stack };
    process.exitCode = 1;
  })
  .finally(async () => {
    Module.prototype._compile = originalCompile;
    await close(authority);
    await close(origin);
    receipt.packages = packages.packages;
    receipt.scriptSha256 = readHash(__filename);
    receipt.finishedAt = new Date().toISOString();
    save();
    console.log(
      JSON.stringify(
        { result: receipt.result, checks: receipt.checks, error: receipt.error, root },
        null,
        2,
      ),
    );
  });
