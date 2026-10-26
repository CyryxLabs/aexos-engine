/** Detached capability manifests bound to actual npm archive and installed bytes. */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const tar = require('tar');
const { builtinModules } = require('module');
const { digest, stableStringify } = require('./durable-evidence');
const boundary = require('../../data/core-package-boundary.json');
const catalog = require('../../data/installed-capability-catalog.json');
const Ajv = require('ajv');
const validateManifest = new Ajv({ allErrors: false }).compile(require('../../schemas/installed-capabilities-v1.schema.json'));
const POLICY_PATHS = ['package.json', '.aexos-core/data/installed-capability-catalog.json', '.aexos-core/data/core-package-boundary.json'];

const LIMITS = Object.freeze({ archive: 96 * 1024 * 1024, payload: 256 * 1024 * 1024, file: 32 * 1024 * 1024, files: 12000 });
const HOST_PATHS = Object.freeze({ codex: 'AGENTS.md', 'claude-code': '.claude/CLAUDE.md', gemini: '.gemini/rules.md', grok: '.grok/rules/aexos-core.md' });
const GROK_BEHAVIORS = Object.freeze(['push-authority', 'compaction-digest', 'compaction-wrapper', 'synapse-engine', 'synapse-wrapper']);
function fail(code) { throw Object.assign(new Error(code), { code }); }
function hash(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function inside(parent, target) { const relative = path.relative(parent, target); return !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative); }
function ordinaryPath(target, directory = false) {
  const absolute = path.resolve(target);
  let current = path.parse(absolute).root;
  for (const component of absolute.slice(current.length).split(path.sep)) {
    current = path.join(current, component); const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) fail('CAPABILITY_PATH_ALIAS');
  }
  const stat = fs.lstatSync(absolute);
  if (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1) fail('CAPABILITY_PATH_KIND');
  if (fs.realpathSync(absolute) !== absolute) fail('CAPABILITY_PATH_ALIAS');
  return { path: absolute, stat };
}
function safeRelative(value) {
  // Restrict archive paths to ordinary portable npm payload names.
  // eslint-disable-next-line no-control-regex
  if (typeof value !== 'string' || !value || value.length > 512 || /[\x00-\x1f<>:"|?*\\%]/.test(value)
    || value.startsWith('/') || value.split('/').some((part) => !part || part === '.' || part === '..'
      || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))) fail('CAPABILITY_PAYLOAD_PATH');
  return value;
}
function readBytes(file, maximum) {
  const selected = ordinaryPath(file); if (selected.stat.size > maximum) fail('CAPABILITY_BYTE_LIMIT');
  const descriptor = fs.openSync(selected.path, 'r'); const chunks = []; let length = 0;
  try {
    const before = fs.fstatSync(descriptor);
    if (before.dev !== selected.stat.dev || before.ino !== selected.stat.ino || before.nlink !== 1) fail('CAPABILITY_PAYLOAD_CHANGED');
    while (length <= maximum) {
      const chunk = Buffer.alloc(Math.min(65536, maximum + 1 - length)); const count = fs.readSync(descriptor, chunk, 0, chunk.length, null);
      if (!count) break; chunks.push(chunk.subarray(0, count)); length += count;
    }
    const after = fs.fstatSync(descriptor);
    if (length > maximum) fail('CAPABILITY_BYTE_LIMIT');
    if (length !== selected.stat.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) fail('CAPABILITY_PAYLOAD_CHANGED');
    return Buffer.concat(chunks, length);
  } finally { fs.closeSync(descriptor); }
}
function registerArchivePath(tree, relative, kind) {
  const parts = relative.split('/');
  for (let index = 0; index < parts.length; index += 1) {
    const spelling = parts.slice(0, index + 1).join('/'), key = spelling.toLowerCase();
    const last = index === parts.length - 1, type = last ? kind : 'Directory';
    const previous = tree.get(key);
    if (previous && (previous.spelling !== spelling || previous.type !== type
      || (last && (type === 'File' || previous.explicit)))) fail('CAPABILITY_PAYLOAD_DUPLICATE');
    if (previous) { if (last) previous.explicit = true; }
    else tree.set(key, { spelling, type, explicit: last });
    if (tree.size > LIMITS.files) fail('CAPABILITY_BYTE_LIMIT');
  }
}
async function inspectArchive(file) {
  const compressed = readBytes(file, LIMITS.archive);
  let payload; try { payload = zlib.gunzipSync(compressed, { maxOutputLength: LIMITS.payload }); }
  catch { fail('CAPABILITY_ARCHIVE_INVALID'); }
  const files = [], entryTree = new Map(), policy = {}; let total = 0, entryCount = 0, rootSeen = false;
  await new Promise((resolve, reject) => {
    const parser = new tar.Parser({ strict: true });
    parser.on('error', () => reject(Object.assign(new Error('CAPABILITY_ARCHIVE_INVALID'), { code: 'CAPABILITY_ARCHIVE_INVALID' })));
    parser.on('end', resolve);
    parser.on('entry', (entry) => {
      try {
        entryCount += 1; if (entryCount > LIMITS.files) fail('CAPABILITY_BYTE_LIMIT');
        if (!entry.path.startsWith('package/')) fail('CAPABILITY_PAYLOAD_PATH');
        const relative = entry.path.slice(8).replace(/\/$/, '');
        if (entry.type === 'Directory') {
          if (relative) { safeRelative(relative); registerArchivePath(entryTree, relative, 'Directory'); }
          else { if (rootSeen) fail('CAPABILITY_PAYLOAD_DUPLICATE'); rootSeen = true; }
          entry.resume(); return;
        }
        if (entry.type !== 'File') fail('CAPABILITY_PAYLOAD_KIND');
        safeRelative(relative);
        registerArchivePath(entryTree, relative, 'File');
        if (!Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > LIMITS.file
          || total + entry.size > LIMITS.payload || (POLICY_PATHS.includes(relative) && entry.size > 1024 * 1024)) fail('CAPABILITY_BYTE_LIMIT');
        total += entry.size;
        const state = crypto.createHash('sha256'), chunks = []; let count = 0;
        entry.on('data', (bytes) => {
          count += bytes.length; state.update(bytes);
          if (POLICY_PATHS.includes(relative)) chunks.push(bytes);
        });
        entry.on('end', () => {
          if (count !== entry.size) { parser.abort(new Error('CAPABILITY_ARCHIVE_INVALID')); return; }
          files.push({ path: relative, bytes: count, sha256: state.digest('hex') });
          if (POLICY_PATHS.includes(relative)) {
            try { policy[relative] = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
            catch { parser.abort(new Error('CAPABILITY_PACKAGE_INVALID')); }
          }
        });
      } catch (error) { parser.abort(error); }
    });
    parser.end(payload);
  });
  files.sort((a, b) => a.path.localeCompare(b.path));
  const packageJson = policy['package.json'];
  if (!packageJson || packageJson.name !== '@aexos/core' || typeof packageJson.version !== 'string'
    || packageJson.version.length > 128 || !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/.test(packageJson.version)) fail('CAPABILITY_PACKAGE_INVALID');
  const dependencies = packageJson.dependencies || {};
  if (typeof dependencies !== 'object' || Array.isArray(dependencies) || Object.keys(dependencies).length > 256
    || Object.entries(dependencies).some(([name, version]) => !/^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]{0,127}$/.test(name)
      || builtinModules.includes(name) || typeof version !== 'string' || !version || version.length > 256)) fail('CAPABILITY_PACKAGE_INVALID');
  if (stableStringify(policy[POLICY_PATHS[1]]) !== stableStringify(catalog)
    || stableStringify(policy[POLICY_PATHS[2]]) !== stableStringify(boundary)) fail('CAPABILITY_CATALOG_MISMATCH');
  return { archive: { sha256: hash(compressed), bytes: compressed.length }, files, packageJson };
}
function verifyBoundary(files) {
  const names = files.map((file) => file.path);
  const owned = boundary.packageFiles.filter((pattern) => !pattern.startsWith('!'));
  for (const required of [...boundary.requiredPaths, ...boundary.canonicalAgents.map((agent) => `.aexos-core/development/agents/${agent}.md`)]) {
    if (!names.some((name) => required.endsWith('/') ? name.startsWith(required) : name === required)) fail('CAPABILITY_REQUIRED_PATH_MISSING');
  }
  for (const name of names) {
    const declared = ['package.json', 'LICENSE', 'README.md'].includes(name) || owned.some((pattern) => {
      if (pattern.endsWith('/')) return name.startsWith(pattern);
      if (pattern === 'docs/*.md') return /^docs\/[^/]+\.md$/.test(name);
      return name === pattern;
    });
    if (!declared || /(^|\/)__pycache__\/|\.py[co]$/i.test(name)) fail('CAPABILITY_UNOWNED_PAYLOAD');
    if (boundary.forbiddenPrefixes.some((prefix) => name.startsWith(prefix)) || name.split('/').includes('node_modules')) fail('CAPABILITY_DISTRIBUTION_DENIED');
    for (const root of boundary.protectedSquadRoots) {
      if (name.startsWith(root) && !boundary.bundledSquads.includes(name.slice(root.length).split('/')[0])) fail('CAPABILITY_DISTRIBUTION_DENIED');
    }
  }
}
function capabilitiesFor(archive) {
  const license = archive.files.find((file) => file.path === catalog.license.path);
  if (!license?.bytes) fail('CAPABILITY_LICENSE_MISSING');
  const ids = new Set();
  return catalog.capabilities.map((capability) => {
    if (ids.has(capability.id) || !capability.owner || !capability.provenance) fail('CAPABILITY_CATALOG_INVALID');
    ids.add(capability.id);
    const provenance = archive.files.find((file) => file.path === capability.provenance);
    if (!provenance?.bytes) fail('CAPABILITY_PROVENANCE_MISSING');
    const selected = archive.files.filter((file) => capability.paths.some((required) => required.endsWith('/') ? file.path.startsWith(required) : file.path === required));
    if (capability.paths.some((required) => !selected.some((file) => required.endsWith('/') ? file.path.startsWith(required) : file.path === required))) fail('CAPABILITY_REQUIRED_PATH_MISSING');
    return { id: capability.id, version: archive.packageJson.version, owner: capability.owner, packagedPaths: selected,
      license: { ...catalog.license, sha256: license.sha256 }, provenance: { path: provenance.path, sha256: provenance.sha256 },
      support: capability.support, activation: 'free-no-entitlement', evidenceLevel: 'artifact-inspected',
      dependencies: capability.dependencies.map((name) => ({ name, declaredRuntime: Object.hasOwn(archive.packageJson.dependencies || {}, name), runtime: 'NOT_ASSESSED' })),
      configuration: capability.configuration, hosts: Object.keys(HOST_PATHS).map((host) => ({ host, nativeExecution: 'NOT_ASSESSED' })) };
  });
}
async function generateCapabilityManifest(archiveFile) {
  const archive = await inspectArchive(archiveFile); verifyBoundary(archive.files);
  const manifest = { protocol: 'aexos.installed-capabilities/v1', distribution: 'core-free',
    package: { name: archive.packageJson.name, version: archive.packageJson.version, ...archive.archive },
    payload: { digest: digest(archive.files), files: archive.files }, catalogHash: digest(catalog),
    capabilities: capabilitiesFor(archive), installation: { status: 'NOT_ASSESSED', dependencies: 'NOT_ASSESSED' },
    paid: { state: 'absent', acquisition: 'NOT_ASSESSED', activation: 'NOT_ASSESSED' },
    exclusions: ['Source catalog is not installed content', 'Archive inspection is not installed runtime acceptance',
      'No paid acquisition, entitlement or provider activation is established', 'No native host or release certification',
      'License/provenance references are inventory evidence, not a legal audit'] };
  if (!validateManifest(manifest)) fail('CAPABILITY_MANIFEST_INVALID');
  return manifest;
}
async function verifyCapabilityManifest(manifest, archiveFile) {
  if (!validateManifest(manifest)) fail('CAPABILITY_MANIFEST_INVALID');
  const expected = await generateCapabilityManifest(archiveFile);
  if (stableStringify(manifest) !== stableStringify(expected)) fail('CAPABILITY_MANIFEST_MISMATCH');
  return expected;
}
function readCapabilityManifest(file) {
  try { return JSON.parse(readBytes(file, 16 * 1024 * 1024).toString('utf8')); }
  catch (error) { fail(error.code?.startsWith('CAPABILITY_') ? error.code : 'CAPABILITY_MANIFEST_INVALID'); }
}
function inventoryInstalled(root, dependencyDirectories) {
  const files = []; let total = 0, entryCount = 0;
  function walk(directory, prefix = '', depth = 0) {
    if (depth > 64) fail('CAPABILITY_BYTE_LIMIT');
    for (const name of fs.readdirSync(directory).sort()) {
      entryCount += 1; if (entryCount > LIMITS.files) fail('CAPABILITY_BYTE_LIMIT');
      const relative = safeRelative(prefix ? `${prefix}/${name}` : name), file = path.join(directory, name);
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) fail('CAPABILITY_PATH_ALIAS');
      if (dependencyDirectories.has(relative)) { ordinaryPath(file, true); continue; }
      if (stat.isDirectory()) walk(file, relative, depth + 1);
      else {
        const bytes = readBytes(file, LIMITS.file); total += bytes.length;
        if (total > LIMITS.payload || files.length >= LIMITS.files) fail('CAPABILITY_BYTE_LIMIT');
        files.push({ path: relative, bytes: bytes.length, sha256: hash(bytes) });
      }
    }
  }
  walk(root); return files.sort((a, b) => a.path.localeCompare(b.path));
}
function installedRuntimePackages(selected, expected) {
  const packages = [];
  for (const packagePath of ['package.json', '.aexos-core/package.json']) {
    const entry = expected.payload.files.find((file) => file.path === packagePath);
    if (!entry) continue;
    const bytes = readBytes(path.join(selected, packagePath), 1024 * 1024);
    if (hash(bytes) !== entry.sha256) fail('CAPABILITY_INSTALLED_PAYLOAD_MISMATCH');
    let metadata;
    try { metadata = JSON.parse(bytes.toString('utf8')); } catch { fail('CAPABILITY_PACKAGE_INVALID'); }
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)
      || (packagePath !== 'package.json' && (metadata.name !== '@aexos/core-internal' || metadata.private !== true))) {
      fail('CAPABILITY_PACKAGE_INVALID');
    }
    const dependencies = metadata.dependencies || {};
    if (typeof dependencies !== 'object' || Array.isArray(dependencies) || Object.keys(dependencies).length > 256
      || Object.entries(dependencies).some(([name, version]) => !/^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]{0,127}$/.test(name)
        || builtinModules.includes(name) || typeof version !== 'string' || !version || version.length > 256)) {
      fail('CAPABILITY_PACKAGE_INVALID');
    }
    packages.push({ packagePath, root: path.dirname(path.join(selected, packagePath)), dependencies });
  }
  return packages;
}
async function verifyInstalledCapabilities(manifest, archiveFile, installedRoot) {
  const expected = await verifyCapabilityManifest(manifest, archiveFile);
  const selected = ordinaryPath(installedRoot, true).path;
  if (path.basename(selected) !== 'core' || path.basename(path.dirname(selected)) !== '@aexos'
    || path.basename(path.dirname(path.dirname(selected))) !== 'node_modules') fail('CAPABILITY_INSTALL_LAYOUT_REQUIRED');
  const consumer = path.dirname(path.dirname(path.dirname(selected)));
  const runtimePackages = installedRuntimePackages(selected, expected);
  // Only the two archive-bound runtime package roots own dependency directories.
  const dependencyDirectories = new Set(runtimePackages.map((item) => path.posix.join(path.posix.dirname(item.packagePath), 'node_modules')));
  const files = inventoryInstalled(selected, dependencyDirectories);
  if (stableStringify(files) !== stableStringify(expected.payload.files)) fail('CAPABILITY_INSTALLED_PAYLOAD_MISMATCH');
  const dependencyGroups = runtimePackages.map((item) => ({ packagePath: item.packagePath,
    dependencies: Object.keys(item.dependencies).sort().map((name) => {
      let resolved;
      try { resolved = require.resolve(name, { paths: [item.root] }); } catch { return { name, status: 'unavailable' }; }
      try {
        const actual = ordinaryPath(resolved).path;
        if (!inside(path.join(consumer, 'node_modules'), actual)) return { name, status: 'outside-consumer-denied' };
        return { name, status: 'discovered-not-executed', entryHash: hash(readBytes(actual, LIMITS.file)) };
      } catch (error) {
        if (error?.code === 'ENOENT') return { name, status: 'unavailable' };
        throw error;
      }
    }),
  }));
  const dependencies = dependencyGroups.find((item) => item.packagePath === 'package.json').dependencies;
  return { protocol: 'aexos.installed-capability-verification/v1', packageHash: expected.package.sha256,
    payloadDigest: expected.payload.digest, status: 'installed-payload-verified',
    dependencies, dependencyGroups,
    dependencyStatus: dependencyGroups.every((group) => group.dependencies.every((item) => item.status === 'discovered-not-executed')) ? 'discovered-not-executed' : 'unavailable',
    runtimeAcceptance: 'NOT_ASSESSED', paidActivation: 'NOT_ASSESSED', manifest: expected };
}
function isOrdinaryConfiguration(projectRoot, relative) {
  try {
    const root = ordinaryPath(projectRoot, true).path;
    const target = path.resolve(root, relative);
    if (!inside(root, target)) return false;
    ordinaryPath(target); return true;
  } catch { return false; }
}
function inspectHostEvidence(projectRoot) {
  const root = ordinaryPath(projectRoot, true).path;
  return Object.entries(HOST_PATHS).map(([host, relative]) => {
    const configured = isOrdinaryConfiguration(root, relative);
    return { host, configured: configured ? 'present' : 'unavailable', evidenceLevel: configured ? 'configured-projection' : 'NOT_ASSESSED',
      staticParity: 'NOT_ASSESSED', installedClient: 'NOT_ASSESSED', nativeExecution: 'NOT_ASSESSED', endToEndAcceptance: 'NOT_ASSESSED',
      ...(host === 'grok' ? { behaviors: GROK_BEHAVIORS.map((behavior) => ({ behavior, status: 'NOT_ASSESSED' })) } : {}) };
  });
}

module.exports = { LIMITS, inspectArchive, generateCapabilityManifest, readCapabilityManifest, verifyCapabilityManifest, verifyInstalledCapabilities, inspectHostEvidence, isOrdinaryConfiguration };
