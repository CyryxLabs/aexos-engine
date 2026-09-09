'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const yaml = require('js-yaml');

const root = path.resolve(__dirname, '../../..');
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const readWorkflow = (name) => yaml.load(fs.readFileSync(path.join(root, '.github/workflows', name), 'utf8'));
const publicWorkflow = readWorkflow('pro-integration.yml');
const ci = readWorkflow('ci.yml');
const provider = readWorkflow('paid-provider-certification.yml');
const scripts = (job) => job.steps.filter((step) => step.run).map((step) => step.run).join('\n');
const runShell = (code, env = {}) => spawnSync(bash, ['-e', '-c', code], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, ...env },
});
const selectedSuites = [
  'tests/pro/pro-detector.test.js',
  'tests/pro/pro-updater.test.js',
  'tests/unit/licensing/paid-squad-artifact.test.js',
  'tests/installer/pro-setup-signed-artifact.test.js',
  'tests/installer/pro-setup-target-install.test.js',
  'tests/installer/pro-scaffolder.test.js',
  'tests/cli/core-package-boundary.test.js',
];

describe('ACL.12 Pro distribution workflow contracts', () => {
  test('every main PR/push calls credential-free contracts without a path or secret gate', () => {
    expect(ci.on.push.branches).toContain('main');
    expect(ci.on.pull_request.branches).toContain('main');
    expect(ci.on.push.paths).toBeUndefined();
    expect(ci.on.pull_request.paths).toBeUndefined();
    expect(ci.jobs['core-distribution-contract']).toEqual({
      uses: './.github/workflows/pro-integration.yml',
      permissions: { contents: 'read' },
    });
    expect(Object.keys(publicWorkflow.on).sort()).toEqual(['workflow_call', 'workflow_dispatch']);
    expect(publicWorkflow.permissions).toEqual({ contents: 'read' });
    const job = publicWorkflow.jobs['pro-tests'];
    expect(job.if).toBeUndefined();
    for (const step of job.steps) {
      expect(step.if).toBeUndefined();
      expect(step['continue-on-error']).toBeUndefined();
    }
    expect(job.steps.find((step) => step.uses?.startsWith('actions/checkout')).with)
      .toEqual({ submodules: false, 'persist-credentials': false });
    expect(JSON.stringify(job)).not.toMatch(/secrets\.|PRO_SUBMODULE_TOKEN|--passWithNoTests|continue-on-error|\|\|/);
    expect(scripts(job)).toContain('npm ci');
    expect(scripts(job)).toContain('npm run validate:core-package');
    const suiteStep = job.steps.find((step) => step.name === 'Run public distribution contract suites');
    expect(suiteStep.run.match(/tests\/[^\s]+\.test\.js/g)).toEqual(selectedSuites);
    expect(scripts(job)).toContain('node scripts/ci/assert-contract-results.js contract-results.json 7');
  });

  test('machine binding executes public fixtures on three platforms and disclaims private stability', () => {
    const job = ci.jobs['pro-machine-id-stability'];
    expect(job.if).toBeUndefined();
    expect(job.needs).toBeUndefined();
    expect(job.strategy.matrix.os).toEqual(['ubuntu-latest', 'macos-latest', 'windows-latest']);
    expect(scripts(job)).toContain('tests/unit/licensing/paid-squad-artifact.test.js');
    expect(scripts(job)).toContain('machine-binding-results.json 1');
    expect(scripts(job)).toContain('Private runtime native machine-ID stability is unverified');
    expect(JSON.stringify(job)).not.toMatch(/steps\.pro|secrets\.|pro\/license|continue-on-error/);
  });

  test.each(['failure', 'skipped', 'cancelled', ''])('aggregate refuses mandatory job result %s', (result) => {
    const summary = ci.jobs['validation-summary'];
    expect(summary.if).toBe('always()');
    expect(summary.needs).toEqual(expect.arrayContaining(['core-distribution-contract', 'pro-machine-id-stability']));
    const guard = summary.steps.find((step) => step.name === 'Require mandatory distribution jobs to succeed');
    for (const env of [
      { CONTRACT_RESULT: result, MACHINE_BINDING_RESULT: 'success' },
      { CONTRACT_RESULT: 'success', MACHINE_BINDING_RESULT: result },
    ]) {
      const attempt = runShell(guard.run, env);
      expect(attempt.error).toBeUndefined();
      expect(attempt.status).toBe(1);
    }
  });

  test('aggregate accepts both executed successful mandatory jobs', () => {
    const guard = ci.jobs['validation-summary'].steps[0];
    expect(runShell(guard.run, { CONTRACT_RESULT: 'success', MACHINE_BINDING_RESULT: 'success' }).status).toBe(0);
  });

  test.each(['publish-pro.yml', 'sync-pro-submodule.yml'])('%s is manual, non-mutating and fails explicitly', (file) => {
    const workflow = readWorkflow(file);
    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);
    expect(workflow.permissions).toEqual({});
    expect(Object.values(workflow.jobs)).toHaveLength(1);
    const job = Object.values(workflow.jobs)[0];
    expect(job.steps).toHaveLength(1);
    expect(JSON.stringify(workflow)).not.toMatch(/secrets\.|npm publish|npm version|git clone|git push|gh pr|createRelease|GITHUB_OUTPUT|uses/);
    const attempt = runShell(scripts(job));
    expect(attempt.status).toBe(1);
    expect(attempt.stdout).toContain('ADR-AEX-011');
  });

  test('provider entry point cannot consume credentials or caller-declared approvals', () => {
    expect(Object.keys(provider.on)).toEqual(['workflow_dispatch']);
    expect(provider.permissions).toEqual({});
    expect(provider.jobs.prerequisites.environment).toBe('aexos-paid-certification');
    expect(JSON.stringify(provider)).not.toMatch(/secrets\.|checkout|inputs\.|pull_request/);
    expect(runShell(provider.jobs.prerequisites.steps[0].run, { REF: 'refs/heads/untrusted' }).status).toBe(1);
    expect(runShell(provider.jobs.prerequisites.steps[0].run, { REF: 'refs/heads/main' }).status).toBe(0);
  });

  test.each([
    ['missing credentials', { PRO_SUBMODULE_TOKEN: '', STRIPE_RESTRICTED_KEY: '' }],
    ['missing artifact', { APPROVED_ARTIFACT: '' }],
    ['fabricated review approval', { APPROVED_ARTIFACT: 'review.tgz', APPROVED: 'true', STRIPE_RESTRICTED_KEY: 'secret-sentinel' }],
  ])('provider guard fails for %s without leaking values', (_reason, env) => {
    const attempt = runShell(provider.jobs.prerequisites.steps[1].run, env);
    expect(attempt.status).toBe(1);
    expect(attempt.stdout).toContain('no actual ACL.5/ACL.6 runner');
    expect(attempt.stdout).not.toContain('secret-sentinel');
  });
});

describe('mandatory Jest execution evidence', () => {
  let temp;
  const valid = {
    success: true, numTotalTestSuites: 7, numPassedTestSuites: 7,
    numFailedTestSuites: 0, numPendingTestSuites: 0, numTotalTests: 12,
    numPassedTests: 12, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
  };

  beforeEach(() => { temp = fs.mkdtempSync(path.join(os.tmpdir(), 'acl12-results-')); });
  afterEach(() => { fs.rmSync(temp, { recursive: true, force: true }); });

  function check(report) {
    const file = path.join(temp, 'report.json');
    if (report) fs.writeFileSync(file, JSON.stringify(report));
    return spawnSync(process.execPath, [path.join(root, 'scripts/ci/assert-contract-results.js'), file, '7'], { encoding: 'utf8' });
  }

  test('accepts successful complete report', () => { expect(check(valid).status).toBe(0); });
  test.each([
    ['missing report', null],
    ['failed test', { ...valid, success: false, numFailedTests: 1 }],
    ['skipped test', { ...valid, numPendingTests: 1 }],
    ['skipped suite', { ...valid, numPendingTestSuites: 1 }],
    ['missing suite', { ...valid, numTotalTestSuites: 6 }],
    ['empty selection', { ...valid, numTotalTests: 0, numPassedTests: 0 }],
    ['missing counts', { ...valid, numTotalTests: undefined, numPassedTests: undefined }],
    ['todo', { ...valid, numTodoTests: 1 }],
  ])('rejects %s with a nonzero process exit', (_reason, report) => { expect(check(report).status).toBe(1); });

  test.each([
    ['passing', 'test("fixture", () => expect(1).toBe(1));', 0, 0],
    ['failing', 'test("fixture", () => expect(1).toBe(2));', 1, 1],
    ['skipped', 'test.skip("fixture", () => expect(1).toBe(1));', 0, 1],
  ])('propagates actual %s Jest execution', (_name, source, jestExit, gateExit) => {
    const fixture = path.join(temp, 'fixture.test.js');
    const report = path.join(temp, 'actual-report.json');
    fs.writeFileSync(fixture, source);
    const execution = spawnSync(process.execPath, [
      path.join(root, 'node_modules/jest/bin/jest.js'), '--runInBand',
      '--config', JSON.stringify({ rootDir: temp, testEnvironment: 'node' }),
      '--runTestsByPath', fixture, '--json', `--outputFile=${report}`,
    ], { encoding: 'utf8', timeout: 20000 });
    expect(execution.status).toBe(jestExit);
    const gate = spawnSync(process.execPath, [
      path.join(root, 'scripts/ci/assert-contract-results.js'), report, '1',
    ], { encoding: 'utf8' });
    expect(gate.status).toBe(gateExit);
  }, 25000);

  test('private contracts stay explicit and fail when their runtime is absent', () => {
    const privateConfig = require('../../../jest.private-artifact.config');
    const publicConfig = require('../../../jest.config');
    const suites = [
      'tests/unit/licensing/paid-squad-artifact-service.test.js',
      'tests/integration/paid-squad-artifact-http.test.js',
    ];
    expect(privateConfig.testMatch).toEqual(suites.map((file) => `<rootDir>/${file}`));
    expect(privateConfig.testPathIgnorePatterns).toEqual(['/node_modules/']);
    for (const file of suites) {
      const excluded = publicConfig.testPathIgnorePatterns.some((pattern) =>
        new RegExp(pattern.replace('<rootDir>', '/public-core')).test(`/public-core/${file}`));
      expect(excluded).toBe(true);
      const destination = path.join(temp, file);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(root, file), destination);
    }
    // Preserve the real config/setup while overriding only the fixture root.
    fs.copyFileSync(path.join(root, 'tests/setup.js'), path.join(temp, 'tests/setup.js'));
    const execution = spawnSync(process.execPath, [
      path.join(root, 'node_modules/jest/bin/jest.js'), '--runInBand',
      '--config', path.join(root, 'jest.private-artifact.config.js'), '--rootDir', temp,
    ], { encoding: 'utf8', timeout: 20000 });
    expect(execution.status).toBe(1);
    expect(execution.stderr).toMatch(/Cannot find module.*pro\/artifact-service/);
    expect(execution.stderr).toContain('2 failed, 2 total');
  }, 25000);
});
