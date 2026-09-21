'use strict';

const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '../..');
const installer = path.join(ROOT, 'packages/aexos-install/src/installer.js');
const cli = path.join(ROOT, 'packages/aexos-install/bin/aexos-install.js');

describe('auxiliary installer actual runtime', () => {
  let home;
  beforeEach(async () => { home = await fs.mkdtemp(path.join(os.tmpdir(), 'aexos-aux-runtime-')); });
  afterEach(async () => { await fs.remove(home); });
  const run = args => spawnSync(process.execPath, args, { cwd: home, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, HOME: home, USERPROFILE: home } });

  test('dry run names the scoped package and preserves the isolated profile', async () => {
    const result = run([cli, '--dry-run', '--profile', 'advanced', '--skip-deps']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('npm install @aexos/core --save-dev');
    expect(await fs.readdir(home)).toEqual([]);
  });

  test('uses installed execa v5 to execute a real Node dependency check', () => {
    const checker = require('../../packages/aexos-install/src/dep-checker');
    const dependency = { name: 'Node probe', command: process.execPath, versionFlag: '--version',
      minVersion: '18.0.0', required: true, versionParser: output => output.trim().replace(/^v/, '') };
    const result = checker.checkDependency(dependency, { platform: process.platform });
    expect(result.installed).toBe(true);
    expect(result.version).toContain(process.version.slice(1));
  });

  test('CI without a profile preserves existing settings byte-for-byte', async () => {
    const config = path.join(home, '.aexos/user-config.yaml');
    const original = '# Owner configuration\nuser_profile: advanced\neducational_mode: false\nprivate_setting: owner-value\n';
    await fs.outputFile(config, original);
    const result = run([cli, '--ci', '--dry-run', '--skip-deps']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Selected profile: advanced');
    expect(result.stdout).toContain('Existing user profile preserved');
    expect(await fs.readFile(config, 'utf8')).toBe(original);
  });

  test.each(['unpacked', 'legacy-package'])('%s brownfield resolves scoped CLI before migration', async layout => {
    await fs.outputFile(path.join(home, '.aexos-core/core-config.yaml'), 'project: existing\n');
    if (layout === 'legacy-package') await fs.outputFile(path.join(home, 'node_modules/aexos-core/bin/aexos.js'), '// legacy\n');
    const result = run([cli, '--ci', '--yes', '--dry-run', '--skip-deps']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Existing AEXOS installation detected');
    const installation = result.stdout.indexOf('npm install @aexos/core --save-dev');
    const migration = result.stdout.indexOf('npx @aexos/core config migrate');
    expect(installation).toBeGreaterThanOrEqual(0);
    expect(migration).toBeGreaterThan(installation);
  });

  test('malformed user config is preserved instead of reset', async () => {
    const config = path.join(home, '.aexos/user-config.yaml');
    await fs.outputFile(config, 'private_setting: [invalid');
    const code = 'require(process.argv[1]).createUserConfigDirect("advanced",{success(){},action(){}},false).catch(e=>{console.error(e.message);process.exitCode=1})';
    const result = run(['-e', code, installer]);
    expect(result.status).toBe(1);
    expect(await fs.readFile(config, 'utf8')).toBe('private_setting: [invalid');
  });

  test('atomic profile update preserves existing settings and original bytes on rename failure', async () => {
    const config = path.join(home, '.aexos/user-config.yaml');
    const original = 'private_setting: owner-value\n';
    await fs.outputFile(config, original);
    const code = 'const localRequire=require("module").createRequire(process.argv[1]);const fs=localRequire("fs-extra");fs.rename=async()=>{throw Error("rename failed")};require(process.argv[1]).createUserConfigDirect("advanced",{success(){},action(){}},false).catch(e=>{console.error(e.message);process.exitCode=1})';
    const result = run(['-e', code, installer]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('rename failed');
    expect(await fs.readFile(config, 'utf8')).toBe(original);
    expect(await fs.readdir(path.dirname(config))).toEqual(['user-config.yaml']);
  });
});
