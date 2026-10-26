'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const tar = require('tar');
const zlib = require('zlib');
const { spawnSync } = require('child_process');
const { generateCapabilityManifest, verifyCapabilityManifest, verifyInstalledCapabilities, inspectHostEvidence } = require('../../../.aexos-core/core/execution/installed-capabilities');
const boundary = require('../../../.aexos-core/data/core-package-boundary.json');
const catalog = require('../../../.aexos-core/data/installed-capability-catalog.json');

describe('actual archive and installed payload capability evidence', () => {
  let root, packageRoot, archive, installed;
  const write = (relative, content = 'independently authored inert fixture\n') => {
    const file = path.join(packageRoot, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content);
  };
  const pack = () => tar.c({ cwd: root, file: archive, gzip: true }, ['package']);
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-capability-payload-'));
    packageRoot = path.join(root, 'package'); archive = path.join(root, 'core.tgz');
    installed = path.join(root, 'consumer/node_modules/@aexos/core'); fs.mkdirSync(packageRoot);
    const required = [...boundary.requiredPaths, ...boundary.canonicalAgents.map((agent) => `.aexos-core/development/agents/${agent}.md`),
      'LICENSE', ...catalog.capabilities.flatMap((item) => [...item.paths, item.provenance])];
    for (const relative of new Set(required)) write(relative.endsWith('/') ? `${relative}fixture.md` : relative);
    write('.aexos-core/data/installed-capability-catalog.json', JSON.stringify(catalog));
    write('.aexos-core/data/core-package-boundary.json', JSON.stringify(boundary));
    write('package.json', JSON.stringify({ name: '@aexos/core', version: '6.0.0-alpha.1', dependencies: {} }));
    await pack(); fs.mkdirSync(path.dirname(installed), { recursive: true }); fs.cpSync(packageRoot, installed, { recursive: true });
  });
  afterEach(() => { if (path.dirname(root) === fs.realpathSync(os.tmpdir()) && path.basename(root).startsWith('aexos-capability-payload-')) fs.rmSync(root, { recursive: true, force: true }); });
  test('hashes real compressed/payload bytes and verifies separate fresh installed files without runtime claims', async () => {
    const manifest = await generateCapabilityManifest(archive);
    expect(manifest.package.sha256).toMatch(/^[a-f0-9]{64}$/); expect(manifest.payload.files.length).toBeGreaterThan(20);
    expect(manifest.paid).toMatchObject({ state: 'absent', activation: 'NOT_ASSESSED' });
    const verified = await verifyInstalledCapabilities(manifest, archive, installed);
    expect(verified.status).toBe('installed-payload-verified'); expect(verified.runtimeAcceptance).toBe('NOT_ASSESSED');
    expect(manifest.capabilities.find((item) => item.id === 'brownfield-evidence').dependencies)
      .toContainEqual({ name: 'typescript', declaredRuntime: false, runtime: 'NOT_ASSESSED' });
  });
  test.each(['manifest', 'payload', 'extra', 'source', 'activation'])(
    'rejects %s mismatch without executing package code', async (variant) => {
      const manifest = await generateCapabilityManifest(archive);
      if (variant === 'manifest') manifest.capabilities[0].license.sha256 = 'b'.repeat(64);
      if (variant === 'activation') manifest.paid.activation = 'activated';
      if (variant === 'payload') fs.appendFileSync(path.join(installed, 'bin/aexos.js'), 'tampered');
      if (variant === 'extra') fs.writeFileSync(path.join(installed, 'unexpected.txt'), 'extra');
      await expect(verifyInstalledCapabilities(manifest, archive, variant === 'source' ? packageRoot : installed)).rejects.toThrow();
    });
  test.each(['license', 'provenance', 'paid', 'unowned'])(
    'rejects archive with missing or disallowed %s', async (variant) => {
      if (variant === 'license') fs.unlinkSync(path.join(packageRoot, 'LICENSE'));
      if (variant === 'provenance') fs.unlinkSync(path.join(packageRoot, catalog.capabilities[0].provenance));
      if (variant === 'paid') write('squads/private/agent.md');
      if (variant === 'unowned') write('unowned.txt');
      await pack(); await expect(generateCapabilityManifest(archive)).rejects.toThrow();
    });
  test('rejects stale archive binding and case collisions', async () => {
    const manifest = await generateCapabilityManifest(archive); write('bin/aexos.js', 'different'); await pack();
    await expect(verifyCapabilityManifest(manifest, archive)).rejects.toMatchObject({ code: 'CAPABILITY_MANIFEST_MISMATCH' });
    // Two archive entry names alias on Windows even when their source is the same file.
    await tar.c({ cwd: root, file: archive, gzip: true }, ['package', 'package/bin/aexos.js']);
    await expect(generateCapabilityManifest(archive)).rejects.toMatchObject({ code: 'CAPABILITY_ARCHIVE_INVALID' });
  });
  test.each(['.aexos-core/data/installed-capability-catalog.json', '.aexos-core/data/core-package-boundary.json'])(
    'rejects embedded policy drift in %s rather than silently describing a different artifact', async (relative) => {
      write(relative, '{}'); await pack();
      await expect(generateCapabilityManifest(archive)).rejects.toMatchObject({ code: 'CAPABILITY_CATALOG_MISMATCH' });
    });
  test.each(['prefix-case', 'file-parent', 'parent-file', 'duplicate-directory', 'directory-case'])(
    'rejects archive entry tree collision: %s', async (variant) => {
      const manifest = await generateCapabilityManifest(archive);
      const extra = {
        'prefix-case': [['.aexos-core/Case/a.js', 'File'], ['.aexos-core/case/b.js', 'File']],
        'file-parent': [['.aexos-core/collision', 'File'], ['.aexos-core/collision/nested.js', 'File']],
        'parent-file': [['.aexos-core/collision/nested.js', 'File'], ['.aexos-core/collision', 'File']],
        'duplicate-directory': [['bin/', 'Directory'], ['bin/', 'Directory']],
        'directory-case': [['Bin/', 'Directory']],
      }[variant];
      const chunks = [];
      const append = (relative, bytes, type) => {
        const block = Buffer.alloc(512);
        new tar.Header({ path: `package/${relative}`, type, size: bytes.length, mode: 0o644 }).encode(block);
        chunks.push(block, bytes, Buffer.alloc((512 - bytes.length % 512) % 512));
      };
      for (const file of manifest.payload.files) append(file.path, fs.readFileSync(path.join(packageRoot, file.path)), 'File');
      for (const [relative, type] of extra) append(relative, type === 'File' ? Buffer.from('inert') : Buffer.alloc(0), type);
      chunks.push(Buffer.alloc(1024)); fs.writeFileSync(archive, zlib.gzipSync(Buffer.concat(chunks)));
      await expect(generateCapabilityManifest(archive)).rejects.toMatchObject({ code: 'CAPABILITY_ARCHIVE_INVALID' });
    });
  test('rejects schema extensions and structural field abuse before accepting manifest evidence', async () => {
    const manifest = await generateCapabilityManifest(archive); manifest.extra = { activated: true };
    await expect(verifyCapabilityManifest(manifest, archive)).rejects.toMatchObject({ code: 'CAPABILITY_MANIFEST_INVALID' });
  });
  test('owns the existing translated npm README metadata explicitly in the distribution boundary', async () => {
    for (const relative of ['README.es.md', 'README.pt-BR.md']) {
      expect(boundary.packageFiles).toContain(relative); write(relative, '# Translated package metadata');
    }
    await pack(); const manifest = await generateCapabilityManifest(archive);
    expect(manifest.payload.files.filter((file) => /^README\.(es|pt-BR)\.md$/.test(file.path))).toHaveLength(2);
  });
  test('marks configured hosts and every Grok behavior without inventing native execution', () => {
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Local projection');
    const hosts = inspectHostEvidence(root);
    expect(hosts.find((host) => host.host === 'codex')).toMatchObject({ configured: 'present', nativeExecution: 'NOT_ASSESSED', installedClient: 'NOT_ASSESSED' });
    expect(hosts.find((host) => host.host === 'grok').behaviors).toHaveLength(5);
    expect(hosts.every((host) => host.endToEndAcceptance === 'NOT_ASSESSED')).toBe(true);
  });
  test('denies resolving a declared dependency from outside the isolated consumer', async () => {
    const dependency = 'aexos-global-leak-fixture';
    const outside = path.join(root, 'node_modules', dependency); fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(outside, 'package.json'), JSON.stringify({ name: dependency, version: '1.0.0', main: 'index.js' }));
    fs.writeFileSync(path.join(outside, 'index.js'), 'throw new Error("must not execute");');
    write('package.json', JSON.stringify({ name: '@aexos/core', version: '6.0.0-alpha.1', dependencies: { [dependency]: '1.0.0' } }));
    await pack(); fs.copyFileSync(path.join(packageRoot, 'package.json'), path.join(installed, 'package.json'));
    const result = await verifyInstalledCapabilities(await generateCapabilityManifest(archive), archive, installed);
    expect(result.dependencies).toEqual([{ name: dependency, status: 'outside-consumer-denied' }]);
    expect(result.dependencyStatus).toBe('unavailable');
  });
  test('reports a same-process dependency removal as unavailable after prior discovery', async () => {
    const dependency = 'aexos-stale-resolution-fixture';
    write('package.json', JSON.stringify({ name: '@aexos/core', version: '6.0.0-alpha.1',
      dependencies: { [dependency]: '1.0.0' } }));
    await pack();
    fs.copyFileSync(path.join(packageRoot, 'package.json'), path.join(installed, 'package.json'));
    const runtime = path.join(root, 'consumer/node_modules', dependency);
    fs.mkdirSync(runtime, { recursive: true });
    fs.writeFileSync(path.join(runtime, 'package.json'),
      JSON.stringify({ name: dependency, version: '1.0.0', main: 'index.js' }));
    fs.writeFileSync(path.join(runtime, 'index.js'), 'module.exports = true;');
    const manifest = await generateCapabilityManifest(archive);
    const discovered = await verifyInstalledCapabilities(manifest, archive, installed);
    expect(discovered.dependencies).toEqual([
      { name: dependency, status: 'discovered-not-executed', entryHash: expect.any(String) },
    ]);
    fs.rmSync(runtime, { recursive: true });
    const unavailable = await verifyInstalledCapabilities(manifest, archive, installed);
    expect(unavailable.dependencies).toEqual([{ name: dependency, status: 'unavailable' }]);
    expect(unavailable.dependencyStatus).toBe('unavailable');
  });
  test('does not translate a stale dependency path-kind violation to unavailable', async () => {
    const dependency = 'aexos-stale-path-kind-fixture';
    write('package.json', JSON.stringify({ name: '@aexos/core', version: '6.0.0-alpha.1',
      dependencies: { [dependency]: '1.0.0' } }));
    await pack();
    fs.copyFileSync(path.join(packageRoot, 'package.json'), path.join(installed, 'package.json'));
    const runtime = path.join(root, 'consumer/node_modules', dependency);
    const entry = path.join(runtime, 'index.js');
    fs.mkdirSync(runtime, { recursive: true });
    fs.writeFileSync(path.join(runtime, 'package.json'),
      JSON.stringify({ name: dependency, version: '1.0.0', main: 'index.js' }));
    fs.writeFileSync(entry, 'module.exports = true;');
    const manifest = await generateCapabilityManifest(archive);
    await expect(verifyInstalledCapabilities(manifest, archive, installed)).resolves
      .toMatchObject({ dependencyStatus: 'discovered-not-executed' });
    fs.unlinkSync(entry);
    fs.mkdirSync(entry);
    await expect(verifyInstalledCapabilities(manifest, archive, installed))
      .rejects.toMatchObject({ code: 'CAPABILITY_PATH_KIND' });
  });
  test('reports a dependency that disappears during resolved-entry read as unavailable', async () => {
    const dependency = 'aexos-read-disappearance-fixture';
    write('package.json', JSON.stringify({ name: '@aexos/core', version: '6.0.0-alpha.1',
      dependencies: { [dependency]: '1.0.0' } }));
    await pack();
    fs.copyFileSync(path.join(packageRoot, 'package.json'), path.join(installed, 'package.json'));
    const runtime = path.join(root, 'consumer/node_modules', dependency);
    const entry = path.join(runtime, 'index.js');
    fs.mkdirSync(runtime, { recursive: true });
    fs.writeFileSync(path.join(runtime, 'package.json'),
      JSON.stringify({ name: dependency, version: '1.0.0', main: 'index.js' }));
    fs.writeFileSync(entry, 'module.exports = true;');
    const manifest = await generateCapabilityManifest(archive);
    await expect(verifyInstalledCapabilities(manifest, archive, installed)).resolves
      .toMatchObject({ dependencyStatus: 'discovered-not-executed' });
    const originalOpen = fs.openSync;
    const open = jest.spyOn(fs, 'openSync').mockImplementation((file, ...args) => {
      if (path.resolve(file) === entry) {
        fs.unlinkSync(entry);
        return originalOpen.call(fs, file, ...args);
      }
      return originalOpen.call(fs, file, ...args);
    });
    try {
      await expect(verifyInstalledCapabilities(manifest, archive, installed)).resolves
        .toMatchObject({ dependencyStatus: 'unavailable',
          dependencies: [{ name: dependency, status: 'unavailable' }] });
    } finally { open.mockRestore(); }
  });
  test('does not translate a resolved-entry read permission failure to unavailable', async () => {
    const dependency = 'aexos-read-permission-fixture';
    write('package.json', JSON.stringify({ name: '@aexos/core', version: '6.0.0-alpha.1',
      dependencies: { [dependency]: '1.0.0' } }));
    await pack();
    fs.copyFileSync(path.join(packageRoot, 'package.json'), path.join(installed, 'package.json'));
    const runtime = path.join(root, 'consumer/node_modules', dependency);
    const entry = path.join(runtime, 'index.js');
    fs.mkdirSync(runtime, { recursive: true });
    fs.writeFileSync(path.join(runtime, 'package.json'),
      JSON.stringify({ name: dependency, version: '1.0.0', main: 'index.js' }));
    fs.writeFileSync(entry, 'module.exports = true;');
    const manifest = await generateCapabilityManifest(archive);
    const originalOpen = fs.openSync;
    const open = jest.spyOn(fs, 'openSync').mockImplementation((file, ...args) => {
      if (path.resolve(file) === entry) {
        const error = new Error('task-owned permission control');
        error.code = 'EACCES';
        throw error;
      }
      return originalOpen.call(fs, file, ...args);
    });
    try {
      await expect(verifyInstalledCapabilities(manifest, archive, installed))
        .rejects.toMatchObject({ code: 'EACCES' });
    } finally { open.mockRestore(); }
  });
  test('separates declared internal package dependencies from immutable installed payload', async () => {
    const dependency = 'aexos-internal-runtime-fixture';
    write('.aexos-core/package.json', JSON.stringify({ name: '@aexos/core-internal', private: true,
      dependencies: { [dependency]: '1.0.0' } }));
    await pack();
    fs.mkdirSync(path.join(installed, '.aexos-core'), { recursive: true });
    fs.copyFileSync(path.join(packageRoot, '.aexos-core/package.json'), path.join(installed, '.aexos-core/package.json'));
    const runtime = path.join(installed, '.aexos-core/node_modules', dependency);
    fs.mkdirSync(runtime, { recursive: true });
    fs.writeFileSync(path.join(runtime, 'package.json'), JSON.stringify({ name: dependency, version: '1.0.0', main: 'index.js' }));
    fs.writeFileSync(path.join(runtime, 'index.js'), 'throw new Error("dependency discovery must not execute code");');
    const manifest = await generateCapabilityManifest(archive);
    const result = await verifyInstalledCapabilities(manifest, archive, installed);
    expect(result.status).toBe('installed-payload-verified');
    expect(result.dependencyStatus).toBe('discovered-not-executed');
    expect(result.dependencyGroups).toContainEqual({ packagePath: '.aexos-core/package.json',
      dependencies: [{ name: dependency, status: 'discovered-not-executed', entryHash: expect.any(String) }] });
    fs.appendFileSync(path.join(installed, '.aexos-core/package.json'), ' ');
    await expect(verifyInstalledCapabilities(manifest, archive, installed))
      .rejects.toMatchObject({ code: 'CAPABILITY_INSTALLED_PAYLOAD_MISMATCH' });
  });
  test.each(['.aexos-core/node_modules', '.aexos-core/core/node_modules'])(
    'does not exempt undeclared dependency location %s from payload verification', async (relative) => {
      const directory = path.join(installed, relative); fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, 'unowned.js'), 'unowned');
      await expect(verifyInstalledCapabilities(await generateCapabilityManifest(archive), archive, installed))
        .rejects.toMatchObject({ code: 'CAPABILITY_INSTALLED_PAYLOAD_MISMATCH' });
    });
  test('validates archived internal dependency identifiers before resolution', async () => {
    write('.aexos-core/package.json', JSON.stringify({ name: '@aexos/core-internal', private: true,
      dependencies: { '../outside': '1.0.0' } }));
    await pack(); fs.mkdirSync(path.join(installed, '.aexos-core'), { recursive: true });
    fs.copyFileSync(path.join(packageRoot, '.aexos-core/package.json'), path.join(installed, '.aexos-core/package.json'));
    await expect(verifyInstalledCapabilities(await generateCapabilityManifest(archive), archive, installed))
      .rejects.toMatchObject({ code: 'CAPABILITY_PACKAGE_INVALID' });
  });
  test('reports an internal dependency resolved outside the consumer as unavailable', async () => {
    const dependency = 'aexos-internal-outside-fixture';
    write('.aexos-core/package.json', JSON.stringify({ name: '@aexos/core-internal', private: true,
      dependencies: { [dependency]: '1.0.0' } }));
    await pack(); fs.mkdirSync(path.join(installed, '.aexos-core'), { recursive: true });
    fs.copyFileSync(path.join(packageRoot, '.aexos-core/package.json'), path.join(installed, '.aexos-core/package.json'));
    const outside = path.join(root, 'node_modules', dependency); fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(outside, 'package.json'), JSON.stringify({ name: dependency, version: '1.0.0', main: 'index.js' }));
    fs.writeFileSync(path.join(outside, 'index.js'), 'throw new Error("must not execute");');
    const result = await verifyInstalledCapabilities(await generateCapabilityManifest(archive), archive, installed);
    expect(result.dependencyStatus).toBe('unavailable');
    expect(result.dependencyGroups).toContainEqual({ packagePath: '.aexos-core/package.json',
      dependencies: [{ name: dependency, status: 'outside-consumer-denied' }] });
  });
  test('rejects an ordinary file masquerading as the dependency directory', async () => {
    fs.writeFileSync(path.join(installed, 'node_modules'), 'not a directory');
    await expect(verifyInstalledCapabilities(await generateCapabilityManifest(archive), archive, installed))
      .rejects.toMatchObject({ code: 'CAPABILITY_PATH_KIND' });
  });
  test('existing capabilities CLI inspects the actual archive and denies activation controls', () => {
    const cli = path.resolve(__dirname, '../../../bin/aexos.js');
    const result = spawnSync(process.execPath, [cli, 'capabilities', 'installed', `--archive=${archive}`], { encoding: 'utf8', timeout: 10000 });
    expect(result.status).toBe(0); expect(JSON.parse(result.stdout).result.protocol).toBe('aexos.installed-capabilities/v1');
    const denied = spawnSync(process.execPath, [cli, 'capabilities', 'installed', `--archive=${archive}`, '--activate=true'], { encoding: 'utf8', timeout: 10000 });
    expect(denied.status).not.toBe(0);
  });
});
