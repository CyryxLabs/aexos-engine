'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const os = require('os');
const { spawnSync } = require('child_process');
const tar = require('tar');
const semver = require('semver');
const { validatePackedFiles } = require('../validate-core-package');

const REPOSITORY = 'CyryxLabs/aexos-engine';
const REPOSITORY_ID = 1315531746;
const WORKFLOW = '.github/workflows/npm-publish.yml';
const SHA = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const INTEGRITY = /^sha512-[A-Za-z0-9+/]{86}==$/;
const PRESEAL_CHECKS = Object.freeze(['lint', 'typecheck', 'tests', 'build', 'publish-safety', 'manifest', 'package-boundary']);
const PACKAGES = Object.freeze({
  core: { name: '@aexos/core', sourcePath: '.', checks: ['exports-node-20', 'exports-node-22', 'exports-node-24', 'cli-help', 'core-init-doctor'] },
  installer: { name: '@aexos/installer', sourcePath: 'packages/installer', checks: ['exports-node-20', 'exports-node-22', 'exports-node-24', 'cli-help'] },
  'aexos-pro-cli': { name: '@aexos/pro-cli', sourcePath: 'packages/aexos-pro-cli', checks: ['exports-node-20', 'exports-node-22', 'exports-node-24', 'cli-help'] },
  'aexos-install': { name: '@aexos/install', sourcePath: 'packages/aexos-install', checks: ['exports-node-20', 'exports-node-22', 'exports-node-24', 'cli-help'] },
  'aexos-core': { name: 'aexos-core', sourcePath: 'compat/aexos-core', checks: ['exports-node-20', 'exports-node-22', 'exports-node-24', 'cli-help', 'core-dependency'] },
});
const LIMITS = Object.freeze({ compressed: 128 * 1024 * 1024, expanded: 512 * 1024 * 1024, entry: 64 * 1024 * 1024, count: 40000, manifest: 8 * 1024 * 1024 });

function ensure(condition, message) {
  if (!condition) throw new Error(`SEALED_RELEASE_INVALID: ${message}`);
}
function record(value, fields, label) {
  ensure(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  ensure(Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field)), `${label} fields differ from policy`);
}
function positive(value) { return Number.isSafeInteger(value) && value > 0; }
function boundedText(value, max = 4000) { return typeof value === 'string' && value.length > 0 && value.length <= max && !value.includes('\0'); }
function digest(bytes, algorithm = 'sha256', encoding = 'hex') { return crypto.createHash(algorithm).update(bytes).digest(encoding); }
function sameSet(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length && new Set(actual).size === actual.length && expected.every(item => actual.includes(item));
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function basename(value) { return typeof value === 'string' && /^[a-z0-9][a-z0-9._-]*\.tgz$/.test(value) && !value.includes('..'); }
function safeArchivePath(value, directory = false) {
  ensure(typeof value === 'string' && value.length <= 1024 && !/[\\:]/.test(value) &&
    ![...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127), 'unsafe archive path');
  const normalized = directory && value.endsWith('/') ? value.slice(0, -1) : value;
  const segments = normalized.split('/');
  ensure(segments[0] === 'package' && (directory || segments.length > 1) && segments.every(segment => segment && segment !== '.' && segment !== '..'), 'archive path must be canonical beneath package/');
  ensure(segments.every(segment => !/[. ]$/.test(segment) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment)), 'archive path is not portable');
  return normalized;
}
function validateVersion(version, channel) {
  ensure(typeof version === 'string' && semver.valid(version) === version, 'invalid package version');
  const pre = semver.prerelease(version);
  ensure(channel === 'latest' ? !pre : channel === 'beta' ? pre?.[0] === 'beta' : channel === 'preview' && Boolean(pre), 'version/channel conflict');
}
function validateProducer(producer) {
  record(producer, ['workflowPath', 'runId', 'runAttempt', 'controllerSha'], 'producer');
  ensure(producer.workflowPath === WORKFLOW && positive(producer.runId) && positive(producer.runAttempt) && COMMIT.test(producer.controllerSha), 'invalid producer identity');
}

function validateLocator(locator) {
  record(locator, ['sourceSha', 'producerRunId', 'producerRunAttempt', 'artifactId', 'artifactDigest', 'manifestSha256'], 'locator');
  ensure(COMMIT.test(locator.sourceSha) && positive(locator.producerRunId) && positive(locator.producerRunAttempt) && positive(locator.artifactId), 'invalid locator identity');
  ensure(/^sha256:[a-f0-9]{64}$/.test(locator.artifactDigest) && SHA.test(locator.manifestSha256), 'invalid locator digest');
  return locator;
}

function validateManifest(manifest) {
  record(manifest, ['schemaVersion', 'repository', 'repositoryId', 'sourceSha', 'producer', 'channel', 'release', 'packages', 'dependencies', 'verification'], 'manifest');
  ensure(manifest.schemaVersion === 1 && manifest.repository === REPOSITORY && manifest.repositoryId === REPOSITORY_ID && COMMIT.test(manifest.sourceSha), 'invalid manifest source');
  validateProducer(manifest.producer);
  ensure(['latest', 'beta', 'preview'].includes(manifest.channel), 'explicit channel required');
  ensure(Array.isArray(manifest.packages) && manifest.packages.length > 0 && manifest.packages.length <= Object.keys(PACKAGES).length, 'explicit package selection required');
  const keys = new Set();
  const files = new Set();
  for (const pkg of manifest.packages) {
    record(pkg, ['key', 'name', 'version', 'sourcePath', 'tgzPath', 'size', 'sha256', 'integrity', 'inventory', 'requiredChecks'], 'package');
    const policy = Object.hasOwn(PACKAGES, pkg.key) && PACKAGES[pkg.key];
    ensure(policy && pkg.name === policy.name && pkg.sourcePath === policy.sourcePath && !keys.has(pkg.key), 'unknown/duplicate package or source');
    keys.add(pkg.key);
    validateVersion(pkg.version, manifest.channel);
    ensure(basename(pkg.tgzPath) && !files.has(pkg.tgzPath.toLowerCase()), 'invalid/duplicate TGZ path');
    files.add(pkg.tgzPath.toLowerCase());
    ensure(positive(pkg.size) && pkg.size <= LIMITS.compressed && SHA.test(pkg.sha256) && INTEGRITY.test(pkg.integrity), 'invalid TGZ seal');
    ensure(sameSet(pkg.requiredChecks, policy.checks), 'required checks differ from fixed policy');
    ensure(Array.isArray(pkg.inventory) && pkg.inventory.length > 0 && pkg.inventory.length <= LIMITS.count, 'invalid archive inventory');
    const seen = new Set();
    let size = 0;
    for (const item of pkg.inventory) {
      record(item, ['path', 'type', 'size', 'sha256'], 'inventory entry');
      const itemPath = safeArchivePath(item.path);
      ensure(item.type === 'file' && Number.isSafeInteger(item.size) && item.size >= 0 && item.size <= LIMITS.entry && SHA.test(item.sha256), 'invalid inventory entry');
      ensure(!seen.has(itemPath.toLowerCase()), 'duplicate/case-colliding inventory entry');
      seen.add(itemPath.toLowerCase());
      size += item.size;
    }
    ensure(size <= LIMITS.expanded && seen.has('package/package.json'), 'incomplete/oversized inventory');
  }
  const ordered = Object.keys(PACKAGES).filter(key => keys.has(key));
  ensure(manifest.packages.every((pkg, index) => pkg.key === ordered[index]), 'packages must use fixed dependency order');
  const primary = manifest.packages[0];
  record(manifest.release, ['tag', 'title', 'notes', 'prerelease'], 'release');
  const expectedTag = primary.key === 'core' ? `v${primary.version}` : `${primary.key}-v${primary.version}`;
  ensure(manifest.release.tag === expectedTag && manifest.release.prerelease === (manifest.channel !== 'latest') && boundedText(manifest.release.title, 160) && boundedText(manifest.release.notes, 20000), 'release identity/channel mismatch');
  record(manifest.verification, ['policyVersion', 'preSealReports'], 'verification');
  ensure(manifest.verification.policyVersion === 1 && Array.isArray(manifest.verification.preSealReports), 'unknown verification policy');
  ensure(sameSet(manifest.verification.preSealReports.map(report => report.id), PRESEAL_CHECKS), 'missing mandatory pre-seal evidence');
  for (const report of manifest.verification.preSealReports) {
    record(report, ['id', 'sha256'], 'pre-seal report');
    ensure(SHA.test(report.sha256), 'invalid pre-seal report digest');
  }
  ensure(Array.isArray(manifest.dependencies) && manifest.dependencies.length <= 2, 'invalid companion dependencies');
  const deps = new Set();
  for (const dep of manifest.dependencies) {
    record(dep, ['name', 'version', 'integrity', 'sourceReceiptId'], 'companion dependency');
    ensure(['@aexos/core', '@aexos/installer'].includes(dep.name) && !deps.has(dep.name) && semver.valid(dep.version) === dep.version && INTEGRITY.test(dep.integrity) &&
      /^(?:selected:(?:core|installer)|gha:[1-9][0-9]*:[a-f0-9]{64}:[a-f0-9]{64})$/.test(dep.sourceReceiptId), 'invalid companion dependency binding');
    deps.add(dep.name);
  }
  return manifest;
}

function rejectPrivatePaths(inventory) {
  for (const item of inventory) {
    const name = item.path.slice('package/'.length);
    ensure(!/(^|\/)\.env(?:$|\.(?!example$))|\.(?:pem|key|dpapi)$|^pro\/|(^|\/)__pycache__\/|\.py[co]$/i.test(name), 'private/runtime material in public archive');
  }
}

function validateTarFraming(bytes) {
  ensure(bytes.length % 512 === 0, 'unaligned tar framing');
  let offset = 0;
  let headers = 0;
  while (offset + 512 <= bytes.length) {
    const block = bytes.subarray(offset, offset + 512);
    if (block.every(byte => byte === 0)) {
      ensure(offset + 1024 <= bytes.length && bytes.subarray(offset).every(byte => byte === 0), 'missing terminator or hidden trailing archive data');
      return;
    }
    const header = new tar.Header(bytes, offset);
    ensure(header.cksumValid && Number.isSafeInteger(header.size) && header.size >= 0 && header.size <= LIMITS.entry, 'invalid physical tar header');
    ensure(['File', 'OldFile', 'Directory', 'ExtendedHeader'].includes(header.type), 'physical archive links/special files prohibited');
    if (header.type === 'ExtendedHeader') safeArchivePath(`package/${header.path}`);
    else safeArchivePath(header.path, header.type === 'Directory');
    headers += 1;
    ensure(headers <= LIMITS.count * 2, 'too many physical tar headers');
    const dataEnd = offset + 512 + header.size;
    const next = offset + 512 + Math.ceil(header.size / 512) * 512;
    ensure(next <= bytes.length && bytes.subarray(dataEnd, next).every(byte => byte === 0), 'truncated entry or hidden padding data');
    offset = next;
  }
  ensure(false, 'tar terminator missing');
}

/** Inspect the exact immutable byte buffer: no extraction, scripts or registry access. */
async function inspectTgz(file, { key } = {}) {
  ensure(Object.hasOwn(PACKAGES, key), 'unknown archive package policy');
  const stat = fs.lstatSync(file);
  ensure(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= LIMITS.compressed, 'invalid archive file');
  const bytes = fs.readFileSync(file);
  let expanded;
  try { expanded = zlib.gunzipSync(bytes, { maxOutputLength: LIMITS.expanded }); }
  catch { throw new Error('SEALED_RELEASE_INVALID: malformed or oversized gzip stream'); }
  validateTarFraming(expanded);
  const inventory = [];
  const names = new Set();
  let total = 0;
  let metadata;
  await new Promise((resolve, reject) => {
    const parser = new tar.Parser({ strict: true, onReadEntry(entry) {
      try {
        const directory = entry.type === 'Directory';
        ensure(directory || ['File', 'OldFile'].includes(entry.type), 'archive links/special files prohibited');
        const name = safeArchivePath(entry.path, directory);
        ensure(!names.has(name.toLowerCase()), 'duplicate/case-colliding archive entry');
        names.add(name.toLowerCase());
        ensure(names.size <= LIMITS.count && Number.isSafeInteger(entry.size) && entry.size >= 0 && entry.size <= LIMITS.entry, 'archive entry limit exceeded');
        if (directory) {
          ensure(entry.size === 0, 'directory carries unexpected data');
          entry.resume();
          return;
        }
        total += entry.size;
        ensure(total <= LIMITS.expanded, 'archive expansion limit exceeded');
        const itemHash = crypto.createHash('sha256');
        const chunks = [];
        let count = 0;
        entry.on('data', chunk => {
          count += chunk.length;
          itemHash.update(chunk);
          if (name === 'package/package.json') chunks.push(chunk);
        });
        entry.on('end', () => {
          try {
            ensure(count === entry.size, 'truncated archive entry');
            inventory.push({ path: name, type: 'file', size: count, sha256: itemHash.digest('hex') });
            if (name === 'package/package.json') {
              ensure(count <= LIMITS.manifest, 'package metadata limit exceeded');
              metadata = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            }
          } catch (error) { parser.abort(error); }
        });
      } catch (error) { parser.abort(error); }
    } });
    parser.on('error', reject);
    parser.on('end', resolve);
    parser.end(expanded);
  }).catch(error => {
    if (error.message?.startsWith('SEALED_RELEASE_INVALID:')) throw error;
    throw new Error('SEALED_RELEASE_INVALID: malformed archive content');
  });
  inventory.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  ensure(metadata && metadata.name === PACKAGES[key].name && semver.valid(metadata.version) === metadata.version && metadata.private !== true, 'archive package identity/private status invalid');
  if (metadata.publishConfig) {
    ensure(metadata.publishConfig.registry === undefined || ['https://registry.npmjs.org/', 'https://registry.npmjs.org'].includes(metadata.publishConfig.registry), 'archive registry override prohibited');
    ensure(metadata.publishConfig.access === undefined || metadata.publishConfig.access === 'public', 'archive restricted access prohibited');
    ensure(Object.keys(metadata.publishConfig).every(field => ['registry', 'access'].includes(field)), 'archive publishing override prohibited');
  }
  rejectPrivatePaths(inventory);
  if (key === 'core') {
    const boundary = validatePackedFiles(inventory.map(item => item.path));
    ensure(boundary.valid, boundary.errors.join('; '));
  }
  const fileSet = new Set(inventory.map(item => item.path));
  const requiredPath = value => {
    ensure(typeof value === 'string', 'invalid declared entrypoint');
    const normalized = value.startsWith('./') ? value.slice(2) : value;
    ensure(fileSet.has(safeArchivePath(`package/${normalized}`)), 'declared entrypoint missing from archive');
  };
  if (typeof metadata.bin === 'string') requiredPath(metadata.bin);
  else if (metadata.bin) Object.values(metadata.bin).forEach(requiredPath);
  if (metadata.main) requiredPath(metadata.main);
  return { size: bytes.length, sha256: digest(bytes), integrity: `sha512-${digest(bytes, 'sha512', 'base64')}`, inventory, metadata };
}

function validateCompanions(candidate) {
  const expected = new Set();
  for (const pkg of candidate.packages) {
    const name = pkg.key === 'aexos-core' ? '@aexos/core' : pkg.key === 'aexos-pro-cli' ? '@aexos/installer' : null;
    if (!name) continue;
    expected.add(name);
    const range = pkg.metadata.dependencies?.[name];
    ensure(typeof range === 'string' && semver.validRange(range), 'companion dependency declaration missing');
    if (pkg.key === 'aexos-core') ensure(semver.valid(range) === range, 'legacy wrapper requires exact Core version');
    const binding = candidate.manifest.dependencies.find(dep => dep.name === name);
    ensure(binding && semver.satisfies(binding.version, range, { includePrerelease: true }), 'companion resolution missing/incompatible');
    const selected = candidate.packages.find(item => item.name === name);
    if (selected) ensure(selected.version === binding.version && selected.integrity === binding.integrity && binding.sourceReceiptId === `selected:${selected.key}`, 'selected companion bytes differ');
    else ensure(binding.sourceReceiptId.startsWith('gha:'), 'unselected companion requires provider receipt');
  }
  ensure(candidate.manifest.dependencies.every(dep => expected.has(dep.name)), 'unexpected companion dependency');
}

async function loadCandidate(directory, locator) {
  validateLocator(locator);
  const root = fs.realpathSync(directory);
  const manifestFile = path.join(root, 'candidate.json');
  const stat = fs.lstatSync(manifestFile);
  ensure(stat.isFile() && !stat.isSymbolicLink() && stat.size <= LIMITS.manifest, 'invalid candidate manifest file');
  const bytes = fs.readFileSync(manifestFile);
  ensure(digest(bytes) === locator.manifestSha256, 'manifest bytes changed');
  const manifest = validateManifest(JSON.parse(bytes.toString('utf8')));
  ensure(manifest.sourceSha === locator.sourceSha && manifest.producer.runId === locator.producerRunId && manifest.producer.runAttempt === locator.producerRunAttempt, 'candidate producer locator mismatch');
  ensure(sameSet(fs.readdirSync(root), ['candidate.json', ...manifest.packages.map(pkg => pkg.tgzPath)]), 'unexpected/missing candidate files');
  const packages = [];
  for (const pkg of manifest.packages) {
    const absoluteTgzPath = path.join(root, pkg.tgzPath);
    const actual = await inspectTgz(absoluteTgzPath, { key: pkg.key });
    ensure(actual.size === pkg.size && actual.sha256 === pkg.sha256 && actual.integrity === pkg.integrity && actual.metadata.version === pkg.version, 'sealed archive mismatch');
    ensure(canonical(actual.inventory) === canonical(pkg.inventory), 'sealed inventory mismatch');
    packages.push({ ...pkg, absoluteTgzPath, metadata: actual.metadata });
  }
  const candidate = { manifest, manifestSha256: locator.manifestSha256, directory: root, locator, packages,
    transactionId: digest(canonical({ repository: REPOSITORY, sourceSha: manifest.sourceSha, manifestSha256: locator.manifestSha256, artifactId: locator.artifactId, artifactDigest: locator.artifactDigest })) };
  validateCompanions(candidate);
  return candidate;
}

const OBSERVATIONS = ['absent', 'matching', 'conflict', 'unauthorized', 'forbidden', 'retryable-read', 'unknown'];
const STATES = ['prepared', 'published-but-unverified', 'verified', 'conflict', 'blocked'];

function isolatedEnvironment(directory, nodePath, npmPath) {
  const env = {};
  for (const key of ['SystemRoot', 'SYSTEMROOT', 'WINDIR', 'ComSpec', 'COMSPEC', 'PATHEXT', 'PATH', 'Path', 'TMP', 'TEMP', 'TMPDIR']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  delete env.Path;
  env.PATH = `${path.dirname(nodePath)}${path.delimiter}${process.env.PATH || process.env.Path || ''}`;
  return { ...env, HOME: path.join(directory, 'home'), USERPROFILE: path.join(directory, 'home'),
    APPDATA: path.join(directory, 'home', 'appdata'), LOCALAPPDATA: path.join(directory, 'home', 'local'),
    CI: 'true', HUSKY: '0', NO_COLOR: '1', AEXOS_TELEMETRY_DISABLED: '1',
    npm_execpath: npmPath, npm_node_execpath: nodePath,
    NPM_CONFIG_USERCONFIG: path.join(directory, 'user.npmrc'), NPM_CONFIG_GLOBALCONFIG: path.join(directory, 'global.npmrc'),
    NPM_CONFIG_CACHE: path.join(directory, 'cache'), NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org/' };
}

function runChecked(executable, args, options = {}) {
  const result = (options.spawnSyncImpl || spawnSync)(executable, args, { cwd: options.cwd, env: options.env,
    encoding: 'utf8', timeout: options.timeout || 420000, maxBuffer: 32 * 1024 * 1024, windowsHide: true, shell: false });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  ensure(!result.error && result.status === 0, `required subprocess failed (${result.status ?? 'unavailable'}, output sha256 ${digest(output)})`);
  return { stdout: result.stdout || '', outputSha256: digest(output), exitCode: result.status };
}

function exportSpecifiers(pkg) {
  const specifiers = new Set();
  const { metadata, inventory } = pkg;
  const fileNames = inventory.map(item => `./${item.path.slice('package/'.length)}`);
  const add = (key, target) => {
    if (target === null) return;
    if (typeof target === 'object') {
      for (const value of Object.values(target)) add(key, value);
      return;
    }
    ensure(typeof target === 'string' && target.startsWith('./'), 'invalid export target');
    if (key.includes('*')) {
      ensure(target.split('*').length === 2 && key.split('*').length === 2, 'unsupported export pattern');
      const [prefix, suffix] = target.split('*');
      const matches = fileNames.filter(file => file.startsWith(prefix) && file.endsWith(suffix));
      ensure(matches.length > 0, 'export pattern matches no archive file');
      for (const file of matches) add(key.replace('*', file.slice(prefix.length, suffix ? -suffix.length : undefined)), file);
    } else {
      ensure(fileNames.includes(target), 'export target missing from archive');
      specifiers.add(key === '.' ? pkg.name : `${pkg.name}/${key.slice(2)}`);
    }
  };
  if (metadata.exports) {
    if (typeof metadata.exports === 'string' || Array.isArray(metadata.exports)) add('.', metadata.exports);
    else if (Object.keys(metadata.exports).some(key => key.startsWith('.'))) {
      for (const [key, target] of Object.entries(metadata.exports)) {
        ensure(key === '.' || key.startsWith('./'), 'mixed export conditions and subpaths');
        add(key, target);
      }
    } else add('.', metadata.exports);
  } else if (metadata.main) specifiers.add(pkg.name);
  if (pkg.key === 'core') specifiers.add('@aexos/core/bin/aexos.js');
  return [...specifiers];
}

/** Installs sealed bytes outside the checkout; never repacks or uses a global CLI. */
async function verifyInstalled(candidate, options = {}) {
  const { runtimes, npmPath } = options;
  ensure(path.isAbsolute(npmPath || '') && fs.statSync(npmPath).isFile(), 'absolute npm CLI required');
  for (const major of [20, 22, 24]) ensure(path.isAbsolute(runtimes?.[major] || '') && fs.statSync(runtimes[major]).isFile(), `Node ${major} runtime required`);
  const temporaryParent = fs.realpathSync(options.workDir || os.tmpdir());
  // A dirty ancestor dependency tree must never satisfy package resolution.
  for (let parent = temporaryParent; ; parent = path.dirname(parent)) {
    ensure(!fs.existsSync(path.join(parent, 'node_modules')), 'verification location has ancestor node_modules');
    if (parent === path.dirname(parent)) break;
  }
  const directory = fs.mkdtempSync(path.join(temporaryParent, 'aexos-sealed-install-'));
  const install = path.join(directory, 'install');
  const env = isolatedEnvironment(directory, runtimes[24], npmPath);
  fs.mkdirSync(install);
  fs.mkdirSync(env.HOME, { recursive: true });
  fs.writeFileSync(env.NPM_CONFIG_USERCONFIG, 'registry=https://registry.npmjs.org/\n');
  fs.writeFileSync(env.NPM_CONFIG_GLOBALCONFIG, '');
  const run = (node, args, cwd = install, extra = {}) => runChecked(node, args, { cwd, env, ...extra, spawnSyncImpl: options.spawnSyncImpl });
  try {
    for (const major of [20, 22, 24]) {
      const result = run(runtimes[major], ['-p', 'process.versions.node']);
      ensure(Number(result.stdout.trim().split('.')[0]) === major, `wrong Node ${major} runtime`);
    }
    const installSet = [...candidate.packages];
    // A post-publication single-package check still installs its exact sealed
    // selected companion, rather than silently asking npm for a newer version.
    for (const dep of candidate.manifest.dependencies) {
      const selected = candidate.manifest.packages.find(pkg => pkg.name === dep.name);
      if (selected && !installSet.some(pkg => pkg.name === selected.name)) {
        const file = path.join(candidate.directory, selected.tgzPath);
        const actual = await inspectTgz(file, { key: selected.key });
        installSet.push({ ...selected, absoluteTgzPath: file, metadata: actual.metadata });
      }
    }
    for (const pkg of installSet) {
      const actual = await inspectTgz(pkg.absoluteTgzPath, { key: pkg.key });
      ensure(actual.sha256 === pkg.sha256 && actual.integrity === pkg.integrity && canonical(actual.inventory) === canonical(pkg.inventory), 'installation input differs from seal');
      pkg.metadata = actual.metadata;
    }
    const dependencies = Object.fromEntries(installSet.map(pkg => [pkg.name, `file:${pkg.absoluteTgzPath.replace(/\\/g, '/')}`]));
    for (const dep of candidate.manifest.dependencies) if (!dependencies[dep.name]) {
      const observed = candidate.resolvedDependencies?.find(item => item.name === dep.name);
      if (observed) {
        const key = dep.name === '@aexos/core' ? 'core' : 'installer';
        const actual = await inspectTgz(observed.tarballPath, { key });
        ensure(actual.integrity === dep.integrity && actual.metadata.version === dep.version, 'observed companion bytes differ');
        dependencies[dep.name] = `file:${observed.tarballPath.replace(/\\/g, '/')}`;
      } else dependencies[dep.name] = dep.version;
    }
    fs.writeFileSync(path.join(install, 'package.json'), JSON.stringify({ name: 'aexos-sealed-verification', version: '1.0.0', private: true, dependencies }));
    run(runtimes[24], [npmPath, 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org/']);
    const lock = JSON.parse(fs.readFileSync(path.join(install, 'package-lock.json'), 'utf8'));
    for (const dep of candidate.manifest.dependencies) {
      const resolved = lock.packages?.[`node_modules/${dep.name}`];
      ensure(resolved?.version === dep.version && resolved.integrity === dep.integrity, 'installed companion resolution differs from sealed binding');
    }
    const checks = [];
    let doctor;
    for (const pkg of candidate.packages) {
      const installed = path.join(install, 'node_modules', ...pkg.name.split('/'));
      ensure(fs.lstatSync(installed).isDirectory() && !fs.lstatSync(installed).isSymbolicLink(), 'installed package is a link');
      const actualMetadata = JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8'));
      ensure(actualMetadata.name === pkg.name && actualMetadata.version === pkg.version, 'wrong installed package identity');
      for (const dep of candidate.manifest.dependencies.filter(dep => pkg.metadata.dependencies?.[dep.name])) {
        run(runtimes[24], ['-e', `const fs=require('fs');const{createRequire}=require('module');const r=createRequire(${JSON.stringify(path.join(installed, 'package.json'))});const resolved=fs.realpathSync(r.resolve(${JSON.stringify(`${dep.name}/package.json`)}));if(resolved!==fs.realpathSync(${JSON.stringify(path.join(install, 'node_modules', ...dep.name.split('/'), 'package.json'))}))throw Error('nested alternate companion');`]);
      }
      for (const item of pkg.inventory) {
        const file = path.join(installed, item.path.slice('package/'.length));
        const stat = fs.lstatSync(file);
        ensure(stat.isFile() && !stat.isSymbolicLink() && stat.size === item.size && digest(fs.readFileSync(file)) === item.sha256, 'installed content differs from archive');
      }
      const add = (id, nodeMajor, result) => checks.push({ id, package: pkg.name, version: pkg.version, nodeMajor,
        exitCode: result.exitCode, outputSha256: result.outputSha256 });
      const bins = typeof pkg.metadata.bin === 'string' ? [pkg.metadata.bin] : Object.values(pkg.metadata.bin || {});
      ensure(bins.length > 0, 'selected CLI has no declared bin');
      const specifiers = exportSpecifiers(pkg);
      // Resolution runs from the isolated consumer, checking actual declared
      // exports plus all bin files without executing arbitrary CLI subcommands.
      const script = `const fs=require('fs'),path=require('path');const root=fs.realpathSync(${JSON.stringify(installed)});for(const s of ${JSON.stringify(specifiers)}){const p=fs.realpathSync(require.resolve(s));if(!p.startsWith(root+path.sep))throw Error('foreign export');}for(const b of ${JSON.stringify(bins)}){const p=fs.realpathSync(require.resolve(path.join(root,b)));if(!p.startsWith(root+path.sep))throw Error('foreign bin');}console.log('exports verified');`;
      for (const major of [20, 22, 24]) add(`exports-node-${major}`, major, run(runtimes[major], ['-e', script]));
      const cli = path.join(installed, bins[0]);
      const help = run(runtimes[24], [cli, '--help']);
      ensure(help.stdout.trim().length > 0, 'CLI help produced no content');
      add('cli-help', 24, help);
      if (pkg.key === 'aexos-core') {
        const result = run(runtimes[24], ['-e', `const path=require('path');const{createRequire}=require('module');const r=createRequire(${JSON.stringify(path.join(installed, 'package.json'))});const m=r('@aexos/core/package.json');if(m.version!==${JSON.stringify(pkg.metadata.dependencies['@aexos/core'])})throw Error('wrong Core dependency');console.log(r.resolve('@aexos/core/bin/aexos.js'));`]);
        add('core-dependency', 24, result);
      }
      if (pkg.key === 'core') {
        const scaffold = path.join(directory, 'scaffold');
        fs.mkdirSync(scaffold);
        const init = run(runtimes[24], [path.join(installed, 'bin/aexos.js'), 'init', 'project', '--ci'], scaffold);
        const diagnostic = run(runtimes[24], [path.join(installed, 'bin/aexos.js'), 'doctor', '--json'], path.join(scaffold, 'project'));
        const data = JSON.parse(diagnostic.stdout.trim());
        ensure(Array.isArray(data.checks) && data.checks.length > 0, 'Doctor returned no checks');
        ensure(data.checks.every(check => check && typeof check === 'object' && !Array.isArray(check) &&
          boundedText(check.check, 160) && ['PASS', 'WARN', 'FAIL', 'INFO'].includes(check.status)), 'Doctor returned an invalid check status');
        doctor = { pass: data.checks.filter(check => check.status === 'PASS').length,
          warn: data.checks.filter(check => check.status === 'WARN').length, fail: data.checks.filter(check => check.status === 'FAIL').length };
        ensure(positive(doctor.pass) && doctor.fail === 0 && ['pass', 'warn', 'fail'].every(key => data.summary?.[key] === doctor[key]) &&
          data.summary?.info === data.checks.filter(check => check.status === 'INFO').length, 'Doctor failed or summary differs');
        add('core-init-doctor', 24, { exitCode: 0, outputSha256: digest(`${init.outputSha256}:${diagnostic.outputSha256}`) });
      }
    }
    return validateVerification({ ok: true, checks, ...(doctor ? { doctor } : {}) }, candidate.packages);
  } finally {
    // Only this directly allocated, owned temporary tree is removed.
    ensure(path.dirname(directory) === temporaryParent, 'temporary cleanup root changed');
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function prepareCandidate(options) {
  const { context, sourceSha, packageKeys, channel, release, dependencies, runtimes, npmPath } = options;
  validateContext(context);
  ensure(context.operation === 'prepare' && COMMIT.test(sourceSha), 'preparation requires exact source identity');
  ensure(Array.isArray(packageKeys) && packageKeys.length > 0 && new Set(packageKeys).size === packageKeys.length &&
    packageKeys.every(key => Object.hasOwn(PACKAGES, key)), 'explicit allowlisted package selection required');
  ensure(Array.isArray(dependencies) && dependencies.length <= 2, 'explicit companion bindings required');
  for (const dep of dependencies) {
    const fields = ['name', 'version', 'sourceReceiptId', ...(Object.hasOwn(dep, 'integrity') ? ['integrity'] : [])];
    record(dep, fields, 'preparation companion');
    ensure(['@aexos/core', '@aexos/installer'].includes(dep.name) && semver.valid(dep.version) === dep.version &&
      /^(selected:(core|installer)|gha:[1-9][0-9]*:[a-f0-9]{64}:[a-f0-9]{64})$/.test(dep.sourceReceiptId) &&
      (dep.integrity === undefined ? dep.sourceReceiptId.startsWith('selected:') : INTEGRITY.test(dep.integrity)), 'invalid preparation companion');
  }
  ensure(path.isAbsolute(options.sourceDir || '') && path.isAbsolute(options.outputDir || '') && path.isAbsolute(npmPath || ''), 'absolute preparation paths required');
  const source = fs.realpathSync(options.sourceDir);
  const output = path.resolve(options.outputDir);
  ensure(!output.startsWith(`${source}${path.sep}`) && output !== source, 'candidate output must be outside payload source');
  ensure(!fs.existsSync(output), 'candidate output must not already exist');
  const temporaryParent = fs.realpathSync(options.workDir || os.tmpdir());
  const temporary = fs.mkdtempSync(path.join(temporaryParent, 'aexos-sealed-prepare-'));
  const env = isolatedEnvironment(temporary, runtimes?.[24] || '', npmPath);
  fs.mkdirSync(env.HOME, { recursive: true });
  fs.writeFileSync(env.NPM_CONFIG_USERCONFIG, 'registry=https://registry.npmjs.org/\n');
  fs.writeFileSync(env.NPM_CONFIG_GLOBALCONFIG, '');
  const run = (exe, args, cwd = source, timeout) => runChecked(exe, args, { cwd, env, timeout, spawnSyncImpl: options.spawnSyncImpl });
  const npm = args => run(runtimes[24], [npmPath, ...args], source, 3600000);
  const sourceFingerprint = () => {
    const changed = run('git', ['diff', '--name-only', 'HEAD']).stdout.trim().split(/\r?\n/).filter(Boolean);
    const untracked = run('git', ['ls-files', '--others', '--exclude-standard', '-z']).stdout.split('\0').filter(Boolean);
    ensure([...changed, ...untracked].every(file => file === '.aexos-core/install-manifest.yaml'), 'preparation changed unapproved source files');
    const files = run('git', ['ls-files', '-z']).stdout.split('\0').filter(Boolean);
    if (fs.existsSync(path.join(source, '.aexos-core/install-manifest.yaml')) && !files.includes('.aexos-core/install-manifest.yaml')) files.push('.aexos-core/install-manifest.yaml');
    return digest(canonical(files.sort().map(file => {
      const target = path.join(source, file);
      const stat = fs.lstatSync(target);
      return { file, sha256: digest(stat.isSymbolicLink() ? fs.readlinkSync(target) : fs.readFileSync(target)) };
    })));
  };
  try {
    for (const major of [20, 22, 24]) {
      ensure(path.isAbsolute(runtimes?.[major] || ''), `absolute Node ${major} runtime required`);
      ensure(Number(run(runtimes[major], ['-p', 'process.versions.node']).stdout.trim().split('.')[0]) === major, `wrong Node ${major} runtime`);
    }
    ensure(run('git', ['rev-parse', 'HEAD']).stdout.trim() === sourceSha, 'payload checkout differs from approved source');
    ensure(run('git', ['status', '--porcelain', '--untracked-files=all']).stdout.trim() === '', 'payload source is not clean before preparation');
    const keys = Object.keys(PACKAGES).filter(key => packageKeys.includes(key));
    const versions = new Map();
    for (const key of keys) {
      const packageSource = fs.realpathSync(path.join(source, PACKAGES[key].sourcePath));
      ensure(packageSource === source || packageSource.startsWith(`${source}${path.sep}`), 'package source escapes payload');
      const metadata = JSON.parse(fs.readFileSync(path.join(source, PACKAGES[key].sourcePath, 'package.json'), 'utf8'));
      ensure(metadata.name === PACKAGES[key].name, 'source package identity differs');
      ensure(!metadata.scripts?.postpack, 'postpack requires reviewed pre-seal preparation support');
      validateVersion(metadata.version, channel);
      versions.set(key, metadata.version);
    }
    record(release, ['tag', 'title', 'notes', 'prerelease'], 'preparation release');
    ensure(release.tag === (keys[0] === 'core' ? `v${versions.get(keys[0])}` : `${keys[0]}-v${versions.get(keys[0])}`) &&
      release.prerelease === (channel !== 'latest') && boundedText(release.title, 160) && boundedText(release.notes, 20000), 'preparation release mismatch');
    // All source/lifecycle work completes before the final archive inventory.
    npm(['ci', '--no-audit', '--no-fund']);
    for (const key of keys) {
      const cwd = path.join(source, PACKAGES[key].sourcePath);
      run(runtimes[24], [npmPath, 'run', 'prepack', '--if-present'], cwd);
      run(runtimes[24], [npmPath, 'run', 'prepare', '--if-present'], cwd);
    }
    npm(['run', 'generate:manifest']);
    sourceFingerprint();
    const preSealReports = [];
    const gates = {
      lint: [['run', 'lint']], typecheck: [['run', 'typecheck']], tests: [['test', '--', '--runInBand']],
      build: [['run', 'build']], 'publish-safety': [['run', 'validate:publish'], ['run', 'validate:aexos-core-namespace'], ['run', 'validate:package-completeness']],
      manifest: [['run', 'validate:manifest']], 'package-boundary': [['run', 'validate:core-package']],
    };
    for (const id of PRESEAL_CHECKS) preSealReports.push({ id, sha256: digest(gates[id].map(args => npm(args).outputSha256).join(':')) });
    const acceptedSource = sourceFingerprint();
    fs.mkdirSync(output);
    const packages = [];
    for (const key of keys) {
      const sourcePath = PACKAGES[key].sourcePath;
      const result = run(runtimes[24], [npmPath, 'pack', '--json', '--ignore-scripts', '--pack-destination', output], path.join(source, sourcePath));
      const packed = JSON.parse(result.stdout);
      ensure(Array.isArray(packed) && packed.length === 1 && basename(packed[0].filename), 'npm pack did not produce one canonical TGZ');
      const tgzPath = packed[0].filename;
      const actual = await inspectTgz(path.join(output, tgzPath), { key });
      ensure(actual.metadata.version === versions.get(key), 'lifecycle changed approved package version');
      packages.push({ key, name: PACKAGES[key].name, version: versions.get(key), sourcePath, tgzPath,
        size: actual.size, sha256: actual.sha256, integrity: actual.integrity, inventory: actual.inventory,
        requiredChecks: [...PACKAGES[key].checks], absoluteTgzPath: path.join(output, tgzPath), metadata: actual.metadata });
    }
    const manifest = { schemaVersion: 1, repository: REPOSITORY, repositoryId: REPOSITORY_ID, sourceSha,
      producer: { workflowPath: WORKFLOW, runId: context.runId, runAttempt: context.runAttempt, controllerSha: context.controllerSha },
      channel, release, packages: packages.map(({ absoluteTgzPath: _absoluteTgzPath, metadata: _metadata, ...entry }) => entry),
      dependencies: dependencies.map(dep => {
        if (!dep.sourceReceiptId?.startsWith('selected:')) return dep;
        const selected = packages.find(pkg => pkg.name === dep.name);
        ensure(selected && selected.version === dep.version && dep.sourceReceiptId === `selected:${selected.key}`, 'selected dependency preparation identity differs');
        ensure(dep.integrity === undefined || dep.integrity === selected.integrity, 'explicit selected dependency integrity differs');
        return { ...dep, integrity: selected.integrity };
      }),
      verification: { policyVersion: 1, preSealReports } };
    // Selected companion integrity is a build output. An explicit input digest,
    // if present, must match; it cannot replace the hash of the actual pack.
    validateManifest(manifest);
    const candidate = { manifest, packages, directory: output };
    validateCompanions(candidate);
    await verifyInstalled(candidate, options);
    for (const pkg of packages) {
      const actual = await inspectTgz(pkg.absoluteTgzPath, { key: pkg.key });
      ensure(actual.sha256 === pkg.sha256 && actual.integrity === pkg.integrity, 'archive changed during verification');
    }
    ensure(run('git', ['rev-parse', 'HEAD']).stdout.trim() === sourceSha, 'source identity changed during preparation');
    ensure(sourceFingerprint() === acceptedSource, 'source bytes changed after gates');
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    fs.writeFileSync(path.join(output, 'candidate.json'), manifestBytes, { flag: 'wx' });
    ensure(sameSet(fs.readdirSync(output), ['candidate.json', ...packages.map(pkg => pkg.tgzPath)]), 'unexpected preparation output');
    return { directory: output, manifest, manifestSha256: digest(manifestBytes), sourceSha,
      producerRunId: context.runId, producerRunAttempt: context.runAttempt };
  } finally {
    ensure(path.dirname(temporary) === temporaryParent, 'preparation cleanup root changed');
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function validateContext(context) {
  record(context, ['repository', 'repositoryId', 'workflowPath', 'controllerSha', 'runId', 'runAttempt', 'operation'], 'context');
  ensure(context.repository === REPOSITORY && context.repositoryId === REPOSITORY_ID && context.workflowPath === WORKFLOW &&
    COMMIT.test(context.controllerSha) && positive(context.runId) && positive(context.runAttempt) && ['prepare', 'publish'].includes(context.operation), 'invalid execution context');
  return context;
}

function effectPlan(candidate) {
  const { manifest, transactionId, directory } = candidate;
  const tag = manifest.release.tag;
  const assets = [{ name: 'candidate.json', path: path.join(directory, 'candidate.json'),
    size: fs.statSync(path.join(directory, 'candidate.json')).size, sha256: candidate.manifestSha256 },
  ...candidate.packages.map(pkg => ({ name: pkg.tgzPath, path: pkg.absoluteTgzPath, size: pkg.size, sha256: pkg.sha256 }))];
  return [
    ...candidate.packages.map(pkg => ({ key: `npm:${pkg.name}@${pkg.version}`, type: 'package', pkg: { ...pkg, tgzPath: pkg.absoluteTgzPath, sourceSha: manifest.sourceSha } })),
    { key: `tag:${tag}`, type: 'tag', tag },
    { key: `release-create:${tag}`, type: 'release', manifest, transactionId },
    ...assets.map(asset => ({ key: `asset:${tag}:${asset.name}`, type: 'asset', asset })),
    { key: `release-publish:${tag}`, type: 'release-finalization', manifest, transactionId },
  ];
}

function buildIntent(candidate, context) {
  validateContext(context);
  ensure(context.operation === 'publish', 'intent requires publication operation');
  validateManifest(candidate.manifest);
  validateLocator(candidate.locator);
  return { schemaVersion: 1, locator: candidate.locator, manifestSha256: candidate.manifestSha256,
    transactionId: candidate.transactionId, context, effectKeys: effectPlan(candidate).map(effect => effect.key).sort() };
}

function validateIntent(intent, candidate) {
  record(intent, ['schemaVersion', 'locator', 'manifestSha256', 'transactionId', 'context', 'effectKeys'], 'intent');
  validateLocator(intent.locator);
  validateContext(intent.context);
  ensure(intent.schemaVersion === 1 && intent.context.operation === 'publish' && SHA.test(intent.transactionId) &&
    intent.manifestSha256 === intent.locator.manifestSha256, 'invalid intent identity');
  ensure(Array.isArray(intent.effectKeys) && intent.effectKeys.length >= 6 && intent.effectKeys.length <= 14 &&
    sameSet(intent.effectKeys, [...intent.effectKeys].sort()) && canonical(intent.effectKeys) === canonical([...intent.effectKeys].sort()) &&
    intent.effectKeys.every(key => boundedText(key, 240) && /^(npm:|tag:|release-create:|asset:|release-publish:)/.test(key)), 'invalid intent effects');
  if (candidate) ensure(canonical(intent) === canonical(buildIntent(candidate, intent.context)), 'intent differs from candidate plan');
  return intent;
}

function validateChecks(checks) {
  ensure(Array.isArray(checks), 'missing check results');
  for (const check of checks) {
    record(check, ['id', 'package', 'version', 'nodeMajor', 'exitCode', 'outputSha256'], 'check');
    ensure(boundedText(check.id, 64) && Object.values(PACKAGES).some(pkg => pkg.name === check.package) &&
      semver.valid(check.version) === check.version && [20, 22, 24].includes(check.nodeMajor) &&
      Number.isInteger(check.exitCode) && SHA.test(check.outputSha256), 'invalid check evidence');
  }
}

function validateVerification(result, packages) {
  ensure(result && result.ok === true, 'installed verification failed');
  validateChecks(result.checks);
  for (const pkg of packages) {
    const checks = result.checks.filter(check => check.package === pkg.name && check.version === pkg.version);
    ensure(sameSet(checks.map(check => check.id), PACKAGES[pkg.key].checks) && checks.every(check => check.exitCode === 0 &&
      (!check.id.startsWith('exports-node-') || check.id === `exports-node-${check.nodeMajor}`)), 'missing, failed or duplicate mandatory verification');
    if (pkg.key === 'core') ensure(result.doctor && positive(result.doctor.pass) &&
      Number.isSafeInteger(result.doctor.warn) && result.doctor.warn >= 0 && result.doctor.fail === 0, 'fresh Core Doctor did not pass');
  }
  ensure(result.checks.length === packages.reduce((count, pkg) => count + PACKAGES[pkg.key].checks.length, 0), 'unexpected verification results');
  return result;
}

function validateReceipt(receipt, intent) {
  validateIntent(intent);
  record(receipt, ['schemaVersion', 'locator', 'manifestSha256', 'transactionId', 'context', 'intentSha256', 'sealed', 'state', 'observedAt', 'effects'], 'receipt');
  ensure(receipt.schemaVersion === 1 && receipt.sealed === true && STATES.includes(receipt.state) && receipt.state !== 'prepared' &&
    SHA.test(receipt.intentSha256) && typeof receipt.observedAt === 'string' && new Date(receipt.observedAt).toISOString() === receipt.observedAt, 'invalid terminal receipt');
  for (const field of ['locator', 'manifestSha256', 'transactionId', 'context']) ensure(canonical(receipt[field]) === canonical(intent[field]), 'receipt intent identity mismatch');
  ensure(Array.isArray(receipt.effects) && sameSet(receipt.effects.map(effect => effect.key), intent.effectKeys), 'incomplete terminal effect ledger');
  for (const effect of receipt.effects) {
    record(effect, ['key', 'type', 'state', 'writeAttempted', 'writeOutcome', 'publishedObserved', 'checks', 'doctor', 'before', 'after', 'requestId'], 'effect');
    const types = { npm: 'package', tag: 'tag', 'release-create': 'release', asset: 'asset', 'release-publish': 'release-finalization' };
    ensure(effect.type === types[effect.key.split(':')[0]] && STATES.includes(effect.state) &&
      typeof effect.writeAttempted === 'boolean' && typeof effect.publishedObserved === 'boolean' &&
      (effect.writeAttempted ? ['accepted', 'rejected', 'unknown'].includes(effect.writeOutcome) : effect.writeOutcome === null), 'invalid effect state');
    ensure([null, ...OBSERVATIONS].includes(effect.before) && [null, ...OBSERVATIONS].includes(effect.after) &&
      (effect.requestId === null || boundedText(effect.requestId, 200)), 'invalid effect observation');
    validateChecks(effect.checks);
    if (effect.doctor !== null) {
      record(effect.doctor, ['pass', 'warn', 'fail'], 'Doctor counts');
      ensure(effect.key.startsWith('npm:@aexos/core@') && positive(effect.doctor.pass) &&
        Number.isSafeInteger(effect.doctor.warn) && effect.doctor.warn >= 0 && effect.doctor.fail === 0, 'invalid Doctor evidence');
    }
    if (effect.state === 'verified') {
      ensure(effect.publishedObserved && effect.after === 'matching', 'unobserved verified effect');
      if (effect.type === 'package') {
        const key = Object.keys(PACKAGES).find(key => effect.key.startsWith(`npm:${PACKAGES[key].name}@`));
        ensure(key, 'unknown verified package');
        const version = effect.key.slice(`npm:${PACKAGES[key].name}@`.length);
        if (key === 'core') ensure(effect.doctor !== null, 'verified Core lacks Doctor counts');
        ensure(sameSet(effect.checks.map(check => check.id), PACKAGES[key].checks) && effect.checks.every(check =>
          check.package === PACKAGES[key].name && check.version === version && check.exitCode === 0 &&
          (!check.id.startsWith('exports-node-') || check.id === `exports-node-${check.nodeMajor}`)), 'unverified package checks');
      }
    }
  }
  ensure(receipt.state !== 'verified' || receipt.effects.every(effect => effect.state === 'verified'), 'false complete receipt');
  return receipt;
}

function uncertainEffects(priorAttempts, intent) {
  const uncertain = new Set(priorAttempts?.complete === true ? [] : intent.effectKeys);
  if (!Array.isArray(priorAttempts?.attempts)) return new Set(intent.effectKeys);
  for (const attempt of priorAttempts.attempts) {
    // Malformed history cannot prove even its own declared overlap is exhaustive.
    try {
      validateIntent(attempt.intent);
      ensure(SHA.test(attempt.intentSha256) && attempt.identity?.runId === attempt.intent.context.runId &&
        attempt.identity?.runAttempt === attempt.intent.context.runAttempt && positive(attempt.identity.artifactId) &&
        /^sha256:[a-f0-9]{64}$/.test(attempt.identity.digest), 'prior intent origin mismatch');
    } catch { intent.effectKeys.forEach(key => uncertain.add(key)); continue; }
    const overlap = intent.effectKeys.filter(key => attempt.intent.effectKeys.includes(key));
    try {
      validateReceipt(attempt.outcome, attempt.intent);
      ensure(attempt.outcome.intentSha256 === attempt.intentSha256 &&
        attempt.outcomeIdentity?.runId === attempt.intent.context.runId && positive(attempt.outcomeIdentity?.artifactId) &&
        /^sha256:[a-f0-9]{64}$/.test(attempt.outcomeIdentity?.digest), 'prior outcome origin mismatch');
      for (const key of overlap) {
        const effect = attempt.outcome.effects.find(effect => effect.key === key);
        if (effect.writeAttempted || effect.publishedObserved) uncertain.add(key);
      }
    } catch { overlap.forEach(key => uncertain.add(key)); }
  }
  return uncertain;
}

async function freshCandidate(candidate) {
  const fresh = await loadCandidate(candidate.directory, candidate.locator);
  ensure(fresh.transactionId === candidate.transactionId && canonical(fresh.manifest) === canonical(candidate.manifest), 'candidate changed in memory');
  return fresh;
}

async function observeEffect(effect, candidate, providers) {
  if (effect.type === 'package') return providers.observePackage(effect.pkg, candidate.manifest.channel);
  if (effect.type === 'tag') return providers.observeTag(effect.tag, candidate.manifest.sourceSha);
  const release = await providers.observeRelease(candidate.manifest, candidate.transactionId);
  if (effect.type === 'release') return release;
  if (release.kind !== 'matching') return release;
  if (effect.type === 'asset') return providers.observeAsset(release.value, effect.asset);
  return release.value.draft ? { kind: 'absent', value: release.value } : release;
}

function remember(effect, observation, initial = false) {
  ensure(observation && OBSERVATIONS.includes(observation.kind), 'untyped provider observation');
  if (initial) effect.before = observation.kind;
  effect.after = observation.kind;
  effect.requestId = boundedText(observation.requestId, 200) ? observation.requestId : null;
  if (observation.kind === 'matching') {
    effect.publishedObserved = true;
    effect.state = 'published-but-unverified';
  } else if (observation.kind === 'conflict') effect.state = 'conflict';
}

function requireObservable(observation, key, uncertain) {
  ensure(['matching', 'absent'].includes(observation.kind), `provider ${key} is ${observation.kind}`);
  ensure(observation.kind !== 'absent' || !uncertain.has(key), 'prior effect outcome remains uncertain');
}

async function preflightCandidate({ candidate, context, providers, verifyInstalled, priorAttempts }, ledger) {
  candidate = await freshCandidate(candidate);
  validateContext(context);
  ensure(context.operation === 'publish', 'publish context required');
  await providers.verifyContext();
  const producer = await providers.verifyProducer(candidate.locator);
  ensure(producer.controllerSha === candidate.manifest.producer.controllerSha, 'producer controller mismatch');
  const intent = buildIntent(candidate, context);
  const uncertain = uncertainEffects(priorAttempts, intent);
  const plan = effectPlan(candidate);
  const observations = [];
  // Observe every target before rejecting; retain already published facts even
  // when another target or an installed check blocks this attempt.
  for (const effect of plan) {
    let observation;
    try { observation = await observeEffect(effect, candidate, providers); }
    catch { observation = { kind: 'unknown' }; }
    observations.push(observation);
    if (ledger) remember(ledger.find(entry => entry.key === effect.key), observation, true);
  }
  for (let i = 0; i < plan.length; i++) requireObservable(observations[i], plan[i].key, uncertain);
  const resolvedDependencies = [];
  for (const dep of candidate.manifest.dependencies) {
    if (!dep.sourceReceiptId.startsWith('selected:')) {
      const result = await providers.observeDependency(dep);
      ensure(result.kind === 'matching' && path.isAbsolute(result.value?.tarballPath || ''), 'unselected companion is not verified');
      resolvedDependencies.push({ name: dep.name, tarballPath: result.value.tarballPath });
    }
  }
  candidate = { ...candidate, resolvedDependencies };
  const verification = validateVerification(await verifyInstalled(candidate), candidate.packages);
  await freshCandidate(candidate);
  return { candidate, plan, observations, verification, uncertain };
}

async function runTransaction({ candidate, context, providers, intent, intentEvidence, priorAttempts, verifyInstalled, onReceipt,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), clock = Date.now }) {
  candidate = await freshCandidate(candidate);
  validateIntent(intent, candidate);
  ensure(canonical(context) === canonical(intent.context), 'executor context differs from intent');
  await providers.verifyContext();
  const persisted = await providers.verifyIntent({ ...intentEvidence, expectedIntent: intent });
  ensure(SHA.test(persisted.sha256), 'persisted intent digest unavailable');
  const plan = effectPlan(candidate);
  const effects = plan.map(effect => ({ key: effect.key, type: effect.type, state: 'prepared', writeAttempted: false,
    writeOutcome: null, publishedObserved: false, checks: [], doctor: null, before: null, after: null, requestId: null }));
  let state = 'blocked';
  let active;
  try {
    const preflight = await preflightCandidate({ candidate, context, providers, priorAttempts, verifyInstalled }, effects);
    candidate = preflight.candidate;
    for (let index = 0; index < plan.length; index++) {
      const operation = plan[index];
      active = effects[index];
      await freshCandidate(candidate);
      let observed = await observeEffect(operation, candidate, providers);
      remember(active, observed);
      requireObservable(observed, operation.key, preflight.uncertain);
      if (observed.kind === 'absent') {
        // Finalization must recheck all previously verified targets, including
        // registry channel mappings, before making the draft public.
        if (operation.type === 'release-finalization') {
          for (let earlier = 0; earlier < index; earlier++) {
            const current = await observeEffect(plan[earlier], candidate, providers);
            remember(effects[earlier], current);
            ensure(current.kind === 'matching', 'verified effect drifted before finalization');
            effects[earlier].state = 'verified';
          }
        }
        active.writeAttempted = true;
        active.writeOutcome = 'unknown';
        let written;
        try {
          if (operation.type === 'package') written = await providers.publishPackage(operation.pkg, candidate.manifest.channel);
          else if (operation.type === 'tag') written = await providers.createTag(operation.tag, candidate.manifest.sourceSha);
          else if (operation.type === 'release') written = await providers.createRelease(candidate.manifest, candidate.transactionId);
          else {
            const release = await providers.observeRelease(candidate.manifest, candidate.transactionId);
            ensure(release.kind === 'matching', 'release changed before asset/finalization');
            written = operation.type === 'asset' ? await providers.uploadAsset(release.value, operation.asset) : await providers.finalizeRelease(release.value);
          }
        } catch { written = { kind: 'unknown' }; }
        if (['accepted', 'rejected', 'unknown'].includes(written?.kind)) active.writeOutcome = written.kind;
        if (active.writeOutcome === 'accepted') active.state = 'published-but-unverified';
        // Exactly one write, including on exceptions or auth failures. Only
        // independent reads can reconcile an uncertain response.
        const deadline = clock() + 10000;
        for (let read = 0; read < 5; read++) {
          try { observed = await observeEffect(operation, candidate, providers); }
          catch { observed = { kind: 'unknown' }; }
          if (!['absent', 'unknown', 'retryable-read'].includes(observed.kind) || read === 4 || clock() >= deadline) break;
          await sleep(Math.min(250 * 2 ** read, Math.max(0, deadline - clock())));
        }
        remember(active, observed);
        ensure(observed.kind === 'matching', 'write outcome is not verified');
      }
      if (operation.type === 'package') {
        ensure(path.isAbsolute(observed.value?.tarballPath || ''), 'registry verification requires downloaded bytes');
        const actual = await inspectTgz(observed.value.tarballPath, { key: operation.pkg.key });
        ensure(actual.sha256 === operation.pkg.sha256 && actual.integrity === operation.pkg.integrity, 'registry bytes changed before installation');
        const pkg = { ...candidate.packages.find(pkg => pkg.key === operation.pkg.key), absoluteTgzPath: observed.value.tarballPath };
        const verified = validateVerification(await verifyInstalled({ ...candidate, packages: [pkg] }), [pkg]);
        active.checks = verified.checks;
        active.doctor = verified.doctor || null;
      }
      active.state = 'verified';
    }
    // Fully matching retries also run a final read pass (and make zero writes).
    for (let index = 0; index < plan.length; index++) {
      active = effects[index];
      const observed = await observeEffect(plan[index], candidate, providers);
      remember(active, observed);
      ensure(observed.kind === 'matching', 'final provider verification failed');
      active.state = 'verified';
    }
    state = 'verified';
  } catch {
    if (active && !['conflict', 'published-but-unverified'].includes(active.state)) active.state = 'blocked';
    state = effects.some(effect => effect.state === 'conflict') ? 'conflict' : 'blocked';
  } finally {
    // No effect call is permitted after this point, even if persistence fails.
    providers.seal();
  }
  const receipt = { schemaVersion: 1, locator: candidate.locator, manifestSha256: candidate.manifestSha256,
    transactionId: candidate.transactionId, context, intentSha256: persisted.sha256, sealed: true,
    state, observedAt: new Date().toISOString(), effects };
  validateReceipt(receipt, intent);
  if (onReceipt) await onReceipt(receipt);
  return receipt;
}

module.exports = { REPOSITORY, REPOSITORY_ID, WORKFLOW, PACKAGES, PRESEAL_CHECKS, LIMITS,
  validateManifest, validateLocator, inspectTgz, loadCandidate, validateCompanions,
  buildIntent, validateIntent, validateReceipt, preflightCandidate, runTransaction, verifyInstalled, prepareCandidate,
  canonical, digest, ensure };
