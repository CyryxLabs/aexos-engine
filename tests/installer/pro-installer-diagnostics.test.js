'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const childProcess = require('child_process');
const proSetup = require(path.resolve(__dirname, '..', '..', 'packages/installer/src/wizard/pro-setup'));

describe('ACL.13 shell-free npm and private diagnostics', () => {
  afterEach(() => jest.restoreAllMocks());

  test('discovers bundled npm beside Node with missing or invalid npm_execpath', () => {
    const execPath = 'C:\\Program Files\\node & tools\\node.exe';
    const expected = 'C:\\Program Files\\node & tools\\node_modules\\npm\\bin\\npm-cli.js';
    for (const npmExec of [undefined, 'npm-cli.js', 'C:\\invalid\\npm-cli.js\\', 'C:\\unsafe\\npm.cmd']) {
      const invocation = proSetup._testing.resolveNpmInvocation({ platform: 'win32', execPath, env: { npm_execpath: npmExec }, fileExists: (candidate) => candidate === expected });
      expect(invocation).toEqual({ command: execPath, prefixArgs: [expected], execOptions: {} });
    }
  });

  test('accepts an absolute Windows forward-slash npm path but rejects drive-relative paths', () => {
    const absolute = 'C:/custom npm/bin/npm-cli.js';
    expect(proSetup._testing.resolveNpmInvocation({ platform: 'win32', env: { npm_execpath: absolute }, fileExists: (candidate) => candidate === absolute }).prefixArgs).toEqual([absolute]);
    const relative = 'C:custom/npm/bin/npm-cli.js';
    expect(() => proSetup._testing.resolveNpmInvocation({ platform: 'win32', env: { npm_execpath: relative }, fileExists: (candidate) => candidate === relative })).toThrow('Cannot find npm-cli.js');
  });

  test('executes literal argv with spaces, metacharacters and trailing separators without a shell', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos npm & literal-'));
    const cli = path.join(root, 'npm-cli.js');
    const previous = process.env.npm_execpath;
    fs.writeFileSync(cli, 'process.stdout.write(JSON.stringify(process.argv.slice(2)));');
    process.env.npm_execpath = cli;
    try {
      const args = ['install', 'C:\\folder & echo NO\\artifact ;.tgz', '--prefix', 'C:\\space ! % ^ \\', '$(literal)', '`literal`'];
      const result = await proSetup._testing.runNpm(args, { cwd: root });
      expect(JSON.parse(result.stdout)).toEqual(args);
      expect(fs.readdirSync(root)).toEqual(['npm-cli.js']);
    } finally {
      if (previous === undefined) delete process.env.npm_execpath;
      else process.env.npm_execpath = previous;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('keeps actionable npm reasons while redacting tokens, credentials, signed queries and terminal controls', () => {
    const previous = process.env.AEXOS_PRO_PASSWORD;
    process.env.AEXOS_PRO_PASSWORD = 'configured-secret-value';
    try {
      const value = proSetup._testing.safeInstallerDiagnostic({ stderr: '\u001b[31mnpm ERR! EACCES\u001b[0m Bearer opaque-token configured-secret-value https://user:password@example.test/object?X-Amz-Signature=signed-secret&token=url-token\u0007' });
      expect(value).toContain('EACCES');
      for (const secret of ['opaque-token', 'configured-secret-value', 'password', 'signed-secret', 'url-token', '\u001b', '\u0007']) expect(value).not.toContain(secret);
      expect(proSetup._testing.safeInstallerDiagnostic({ stderr: 'x'.repeat(10000) })).toHaveLength(2000);
    } finally {
      if (previous === undefined) delete process.env.AEXOS_PRO_PASSWORD;
      else process.env.AEXOS_PRO_PASSWORD = previous;
    }
  });

  test('target npm failures retain error-level diagnostics and preserve an existing manifest', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos npm errors-'));
    const cli = path.join(root, 'npm-cli.js');
    const target = path.join(root, 'target & literal');
    fs.mkdirSync(target);
    const manifest = '{"name":"user-owned","private":true}\n';
    fs.writeFileSync(path.join(target, 'package.json'), manifest);
    fs.writeFileSync(cli, `require('fs').writeFileSync(${JSON.stringify(path.join(root, 'args.json'))}, JSON.stringify(process.argv.slice(2))); process.stderr.write('npm ERR! EACCES Bearer fixture-secret'); process.exitCode = 1;`);
    const previous = process.env.npm_execpath;
    process.env.npm_execpath = cli;
    try {
      await expect(proSetup._testing.installProArtifactIntoTarget(path.join(root, 'artifact.tgz'), target)).rejects.toThrow('EACCES Bearer [REDACTED]');
      const args = JSON.parse(fs.readFileSync(path.join(root, 'args.json'), 'utf8'));
      for (const flag of ['--ignore-scripts', '--package-lock=false', '--no-save', '--workspaces=false', '--loglevel=error']) expect(args).toContain(flag);
      expect(args).not.toContain('--silent');
      expect(fs.readFileSync(path.join(target, 'package.json'), 'utf8')).toBe(manifest);
    } finally {
      if (previous === undefined) delete process.env.npm_execpath;
      else process.env.npm_execpath = previous;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('redacts service-role, private signing, credential and short configured secrets', () => {
    const values = { SUPABASE_SERVICE_ROLE_KEY: 'service-role-fixture', AEXOS_ARTIFACT_PRIVATE_KEY: 'private-signing-fixture', NPM_CONFIG__AUTH: 'auth-fixture', AEXOS_CREDENTIAL: 'credential-fixture', AEXOS_PRO_KEY: 'xY' };
    const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
    Object.assign(process.env, values);
    try {
      const result = proSetup._testing.safeInstallerDiagnostic({ stderr: `npm ERR! EACCES ${Object.values(values).join(' ')}` });
      expect(result).toContain('EACCES');
      for (const value of Object.values(values)) expect(result).not.toContain(value);
      expect(result.match(/\[REDACTED\]/g)).toHaveLength(5);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  test('configured secret replacement cannot disable bearer or URL redaction', () => {
    const previous = process.env.AEXOS_PRO_KEY;
    process.env.AEXOS_PRO_KEY = 'Bearer';
    try {
      expect(proSetup._testing.safeInstallerDiagnostic({ stderr: 'Bearer opaque-value' })).not.toContain('opaque-value');
      process.env.AEXOS_PRO_KEY = 'https';
      const result = proSetup._testing.safeInstallerDiagnostic({ stderr: 'https://user:unconfigured-password@example.test/file?signature=signed-value' });
      expect(result).not.toContain('unconfigured-password');
      expect(result).not.toContain('signed-value');
    } finally {
      if (previous === undefined) delete process.env.AEXOS_PRO_KEY;
      else process.env.AEXOS_PRO_KEY = previous;
    }
  });

  test.each([false, true])('captures only the registry subprocess and restores execution after failure=%s', (failure) => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' });
    const native = require('node-machine-id');
    const exec = jest.spyOn(childProcess, 'execSync').mockImplementation(() => {
      if (failure) throw new Error('Registry denied');
      return Buffer.from('fixture');
    });
    jest.spyOn(native, 'machineIdSync').mockImplementation(() => {
      childProcess.execSync('%windir%\\System32\\REG.exe QUERY HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid');
      return 'stable-native-fixture';
    });
    try {
      const result = proSetup._testing.generateNativeMachineId();
      expect(result).toBe(failure ? null : crypto.createHash('sha256').update('aexos-pro-native-machine-id:v1:stable-native-fixture').digest('hex'));
      expect(exec).toHaveBeenCalledWith(expect.stringContaining('REG.exe'), { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      expect(childProcess.execSync).toBe(exec);
      expect(proSetup._testing.generateLegacyMachineId()).toMatch(/^[a-f0-9]{64}$/);
    } finally { Object.defineProperty(process, 'platform', originalPlatform); }
  });

  test('does not suppress unrelated subprocess diagnostics during the native probe', () => {
    const native = require('node-machine-id');
    const exec = jest.spyOn(childProcess, 'execSync').mockReturnValue(Buffer.from('fixture'));
    jest.spyOn(native, 'machineIdSync').mockImplementation(() => {
      childProcess.execSync('unrelated-command', { encoding: 'utf8' });
      return 'stable-native-fixture';
    });
    proSetup._testing.generateNativeMachineId();
    expect(exec).toHaveBeenCalledWith('unrelated-command', { encoding: 'utf8' });
    expect(childProcess.execSync).toBe(exec);
  });
});
