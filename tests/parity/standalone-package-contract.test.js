'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const PRO_CLI = path.join(ROOT, 'packages', 'aexos-pro-cli', 'bin', 'aexos-pro.js');
const PRO_ERROR_BRIDGE = path.join(ROOT, 'packages', 'aexos-pro-cli', 'src', 'error-bridge.js');
const ROOT_MANIFEST = require(path.join(ROOT, 'package.json'));
const INSTALLER_MANIFEST = require(path.join(ROOT, 'packages', 'installer', 'package.json'));
const PRO_MANIFEST = require(path.join(ROOT, 'packages', 'aexos-pro-cli', 'package.json'));

function makeRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function installFakeCore(consumerRoot, binSource = 'process.exit(0);') {
  const coreRoot = path.join(consumerRoot, 'node_modules', '@aexos', 'core');
  writeJson(path.join(coreRoot, 'package.json'), {
    name: '@aexos/core',
    version: ROOT_MANIFEST.version,
    bin: { aexos: 'bin/aexos.js' },
  });
  fs.mkdirSync(path.join(coreRoot, '.aexos-core'), { recursive: true });
  fs.mkdirSync(path.join(coreRoot, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(coreRoot, 'bin', 'aexos.js'), binSource);
  return coreRoot;
}

function installProFixture(consumerRoot) {
  const proRoot = path.join(consumerRoot, 'node_modules', '@aexos', 'pro-cli');
  fs.mkdirSync(path.join(proRoot, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(proRoot, 'src'), { recursive: true });
  fs.copyFileSync(PRO_CLI, path.join(proRoot, 'bin', 'aexos-pro.js'));
  fs.copyFileSync(PRO_ERROR_BRIDGE, path.join(proRoot, 'src', 'error-bridge.js'));
  fs.copyFileSync(
    path.join(ROOT, 'packages', 'aexos-pro-cli', 'src', 'recover.js'),
    path.join(proRoot, 'src', 'recover.js'),
  );
  writeJson(path.join(proRoot, 'package.json'), PRO_MANIFEST);
  return proRoot;
}

function installInstallerFixture(consumerRoot) {
  const installerRoot = path.join(consumerRoot, 'node_modules', '@aexos', 'installer');
  const sourceRoot = path.join(ROOT, 'packages', 'installer', 'src');
  for (const relative of [
    path.join('installer', 'install-footprint.js'),
    path.join('utils', 'package-paths.js'),
  ]) {
    const destination = path.join(installerRoot, 'src', relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(sourceRoot, relative), destination);
  }
  writeJson(path.join(installerRoot, 'package.json'), INSTALLER_MANIFEST);
  return installerRoot;
}

describe('standalone package contracts', () => {
  const roots = [];
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  test('installer reads commercial policy from the installed core package', () => {
    const root = makeRoot('aexos-commercial-core-'); roots.push(root);
    writeJson(path.join(root, 'package.json'), {
      name: '@aexos/core',
      aexosCommercial: {
        installMode: 'enforce',
        purchaseUrl: 'https://example.test/purchase',
        supportUrl: 'https://example.test/support',
      },
    });
    fs.mkdirSync(path.join(root, '.aexos-core'));

    const previous = process.env.AEXOS_CORE_PACKAGE_ROOT;
    process.env.AEXOS_CORE_PACKAGE_ROOT = root;
    try {
      jest.resetModules();
      const { loadCommercialConfig } = require(
        '../../packages/installer/src/licensing/commercial-license-gate',
      );
      expect(loadCommercialConfig()).toEqual({
        installMode: 'enforce',
        purchaseUrl: 'https://example.test/purchase',
        supportUrl: 'https://example.test/support',
      });
    } finally {
      if (previous === undefined) delete process.env.AEXOS_CORE_PACKAGE_ROOT;
      else process.env.AEXOS_CORE_PACKAGE_ROOT = previous;
      jest.resetModules();
    }
  });

  test('installed footprint helper resolves atomic writes from installed core', () => {
    const root = makeRoot('aexos-installer-footprint-'); roots.push(root);
    const coreRoot = installFakeCore(root);
    const marker = path.join(root, 'atomic-module-loaded');
    const atomicModule = path.join(
      coreRoot, '.aexos-core', 'core', 'synapse', 'utils', 'atomic-write.js',
    );
    fs.mkdirSync(path.dirname(atomicModule), { recursive: true });
    fs.writeFileSync(atomicModule, `
      require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'loaded');
      module.exports = { atomicWriteSync() {} };
    `);
    const installerRoot = installInstallerFixture(root);
    const probe = `
      const footprint = require(${JSON.stringify(path.join(installerRoot, 'src', 'installer', 'install-footprint.js'))});
      process.stdout.write(String(Array.isArray(footprint.AEXOS_FOOTPRINT)));
    `;

    const result = spawnSync(process.execPath, ['-e', probe], { cwd: root, encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('true');
    expect(fs.readFileSync(marker, 'utf8')).toBe('loaded');
  });

  test('standalone manifests declare the core relationship they load at runtime', () => {
    expect(INSTALLER_MANIFEST.peerDependencies).toMatchObject({
      '@aexos/core': `^${ROOT_MANIFEST.version}`,
    });
    expect(INSTALLER_MANIFEST.dependencies).toMatchObject({
      ajv: '^8.17.1',
      'fast-glob': '^3.3.3',
      tar: '^7.5.22',
    });
    expect(PRO_MANIFEST.dependencies).toMatchObject({
      '@aexos/core': `^${ROOT_MANIFEST.version}`,
    });
  });

  test('Pro CLI delegates through the installed core JavaScript entrypoint', () => {
    const root = makeRoot('aexos-pro-cli-'); roots.push(root);
    const output = path.join(root, 'delegated.json');
    installFakeCore(root, `require('node:fs').writeFileSync(${JSON.stringify(output)}, JSON.stringify(process.argv.slice(2)));`);
    const proRoot = installProFixture(root);

    const result = spawnSync(process.execPath, [path.join(proRoot, 'bin', 'aexos-pro.js'), 'status', '--json'], {
      cwd: root,
      encoding: 'utf8',
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(JSON.parse(fs.readFileSync(output, 'utf8'))).toEqual(['pro', 'status', '--json']);
  });

  test('Pro CLI never reports success when the delegated process has no exit status', () => {
    const root = makeRoot('aexos-pro-cli-signal-'); roots.push(root);
    installFakeCore(root, "process.kill(process.pid, 'SIGTERM');");
    const proRoot = installProFixture(root);

    const result = spawnSync(process.execPath, [path.join(proRoot, 'bin', 'aexos-pro.js'), 'status'], {
      cwd: root,
      encoding: 'utf8',
    });

    expect(result.status).not.toBe(0);
  });

  test('Pro error bridge resolves its registry from installed core', () => {
    const root = makeRoot('aexos-pro-errors-'); roots.push(root);
    const coreRoot = installFakeCore(root);
    const proRoot = installProFixture(root);
    const errorsRoot = path.join(coreRoot, '.aexos-core', 'core', 'errors');
    fs.mkdirSync(errorsRoot, { recursive: true });
    fs.writeFileSync(path.join(errorsRoot, 'index.js'), `
      class CYRYXError extends Error { constructor(message, options) { super(message); Object.assign(this, options); } }
      const definition = { userMessage: 'Fallback', category: 'license', severity: 'error', retryable: false, recovery: [], exitCode: 1 };
      const defaultErrorRegistry = { has: () => true, lookup: () => definition };
      module.exports = { CYRYXError, defaultErrorRegistry };
    `);
    fs.writeFileSync(path.join(errorsRoot, 'pro-error-registry.js'), `
      module.exports = { proErrorRegistry: { has: () => false, lookup: () => null } };
    `);
    const probe = `
      const bridge = require(${JSON.stringify(path.join(proRoot, 'src', 'error-bridge.js'))});
      const error = bridge.parseEnvelopeToCYRYXError({ error: { code: 'TEST', message: 'server' } });
      process.stdout.write(JSON.stringify({ name: error.constructor.name, message: error.message, code: error.code }));
    `;

    const result = spawnSync(process.execPath, ['-e', probe], { cwd: root, encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ name: 'CYRYXError', message: 'Fallback', code: 'TEST' });
  });

  test('source Pro modules prefer the verified enclosing core over a stale installed package', () => {
    const root = makeRoot('aexos-pro-stale-core-'); roots.push(root);
    const marker = path.join(root, 'stale-core-used');
    const staleRoot = installFakeCore(root, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'used');`);
    const errorsRoot = path.join(staleRoot, '.aexos-core', 'core', 'errors');
    fs.mkdirSync(errorsRoot, { recursive: true });
    fs.writeFileSync(path.join(errorsRoot, 'index.js'), `
      class StaleCoreError extends Error {}
      const definition = { userMessage: 'stale', category: 'stale', severity: 'error', retryable: false, recovery: [], exitCode: 1 };
      module.exports = { CYRYXError: StaleCoreError, defaultErrorRegistry: { has: () => true, lookup: () => definition } };
    `);
    fs.writeFileSync(path.join(errorsRoot, 'pro-error-registry.js'), `
      module.exports = { proErrorRegistry: { has: () => false, lookup: () => null } };
    `);

    const cli = spawnSync(process.execPath, [PRO_CLI, 'status', '--help'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(cli.status).toBe(0);
    expect(fs.existsSync(marker)).toBe(false);

    const probe = `
      const bridge = require(${JSON.stringify(PRO_ERROR_BRIDGE)});
      const error = bridge.parseEnvelopeToCYRYXError({ error: { code: 'AEXOS_UNKNOWN_ERROR', message: 'current' } });
      process.stdout.write(error.constructor.name);
    `;
    const bridged = spawnSync(process.execPath, ['-e', probe], { cwd: root, encoding: 'utf8' });
    expect(bridged.status).toBe(0);
    expect(bridged.stdout).not.toBe('StaleCoreError');
  });
});
