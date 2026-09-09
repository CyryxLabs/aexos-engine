'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('js-yaml');
const { spawnSync } = require('child_process');
const semantic = require('../../../scripts/run-semantic-release');
const runner = require('../../../scripts/run-sealed-release');
const ROOT = path.resolve(__dirname, '../../..');
const workflow = name => yaml.load(fs.readFileSync(path.join(ROOT, '.github/workflows', name), 'utf8'));
const steps = job => job.steps || [];
const shell = job => steps(job).map(step => step.run || '').join('\n');
const contextEnv = () => ({
  GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: 'CyryxLabs/aexos-engine', GITHUB_REPOSITORY_ID: '1315531746',
  GITHUB_WORKFLOW_REF: 'CyryxLabs/aexos-engine/.github/workflows/npm-publish.yml@refs/heads/main', GITHUB_WORKFLOW_SHA: 'a'.repeat(40), GITHUB_RUN_ID: '12', GITHUB_RUN_ATTEMPT: '1',
  AEXOS_RELEASE_OPERATION: 'publish', AEXOS_NODE_20: process.execPath, AEXOS_NODE_22: process.execPath, AEXOS_NODE_24: process.execPath, AEXOS_NPM_PATH: path.join(ROOT, 'node_modules/npm/bin/npm-cli.js'),
});

describe('owned entrypoint topology and executable refusal', () => {
  test('sole public workflow uses a literal global lock and explicit prepare default', () => {
    const value = workflow('npm-publish.yml');
    expect(value.concurrency).toEqual({ group: 'aexos-public-release', 'cancel-in-progress': false });
    expect(value.on.workflow_dispatch.inputs.operation.default).toBe('prepare');
    expect(value.on.workflow_dispatch.inputs.operation.options).toEqual(['prepare', 'publish']);
    expect(Object.values(value.jobs).filter(job => job.permissions?.contents === 'write')).toHaveLength(1);
    expect(value.jobs.publish.strategy).toBeUndefined();
    expect(value.jobs.publish.permissions).toEqual({ contents: 'write', actions: 'read', 'id-token': 'write' });
    expect(value.permissions).toEqual({ contents: 'read', actions: 'read' });
  });
  test('all payload/controller checkouts use explicit source/workflow identity without persisted auth', () => {
    for (const file of ['npm-publish.yml', 'semantic-release.yml']) {
      for (const job of Object.values(workflow(file).jobs)) for (const step of steps(job).filter(value => value.uses?.startsWith('actions/checkout@'))) {
        expect(['${{ github.workflow_sha }}', '${{ inputs.source_sha }}']).toContain(step.with.ref);
        expect(step.with['persist-credentials']).toBe(false);
      }
    }
  });
  test('legacy tag/release routes refuse before checkout or credentials', () => {
    const legacy = workflow('release.yml');
    expect(legacy.permissions).toEqual({});
    const npm = workflow('npm-publish.yml');
    expect(npm.jobs.retired.permissions).toEqual({});
    for (const job of [legacy.jobs.retired, npm.jobs.retired]) {
      expect(steps(job).some(step => step.uses || step.env)).toBe(false);
      const refusal = shell(job);
      // Actual shell execution under Bash when available (Git for Windows is
      // the existing CLI runtime on Windows); missing shell is a failed check.
      const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
      const result = spawnSync(bash, ['-c', refusal], { encoding: 'utf8', windowsHide: true });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('retired');
    }
  });
  test('intent upload gates the only executor and outcome upload cannot mask failure', () => {
    const publish = workflow('npm-publish.yml').jobs.publish;
    const list = steps(publish);
    const preflight = list.findIndex(step => step.run === 'node scripts/run-sealed-release.js preflight');
    const intent = list.findIndex(step => step.id === 'intent');
    const execute = list.findIndex(step => step.run === 'node scripts/run-sealed-release.js publish');
    const outcome = list.findIndex(step => step.if === 'always()');
    expect(preflight).toBeLessThan(intent);
    expect(intent).toBeLessThan(execute);
    expect(execute).toBeLessThan(outcome);
    expect(list[intent].with).toMatchObject({ overwrite: false, 'if-no-files-found': 'error' });
    expect(list[outcome].with.path).toContain('/receipt.json');
    expect(list[outcome]['continue-on-error']).toBeUndefined();
    expect(list[execute].env.AEXOS_INTENT_ARTIFACT_ID).toContain('steps.intent.outputs.artifact-id');
    expect(list[execute].env.AEXOS_INTENT_ARTIFACT_DIGEST).toContain('steps.intent.outputs.artifact-digest');
    for (const step of list) expect(step['continue-on-error']).toBeUndefined();
  });
  test('candidate and published checks retain all three pinned Node runtimes', () => {
    const jobs = workflow('npm-publish.yml').jobs;
    for (const job of [jobs.prepare, jobs.publish]) {
      const versions = steps(job).filter(step => step.uses?.startsWith('actions/setup-node@')).map(step => step.with['node-version']);
      expect(versions).toEqual(['20.20.2', '22.23.2', '24.15.0']);
      for (const major of [20, 22, 24]) expect(shell(job)).toContain(`AEXOS_NODE_${major}`);
    }
  });
  test('supported scripts and both semantic configs have no alternate writer', () => {
    for (const relative of ['.releaserc.json', 'packages/aexos-install/.releaserc.json']) {
      const config = JSON.parse(fs.readFileSync(path.join(ROOT, relative)));
      expect(config.dryRun).toBe(true);
      expect(config.plugins.map(plugin => plugin[0])).toEqual(semantic.SAFE_PLUGINS);
    }
    const nested = require('../../../packages/aexos-install/package.json');
    expect(nested.scripts.postversion).toBeUndefined();
    expect(nested.scripts.release).toBe('node ../../scripts/run-semantic-release.js');
    const all = ['npm-publish.yml', 'release.yml', 'semantic-release.yml'].map(file => fs.readFileSync(path.join(ROOT, '.github/workflows', file), 'utf8')).join('\n');
    expect(all).not.toMatch(/gh workflow run|npm publish|--clobber|npm@latest|git push/);
    expect(workflow('semantic-release.yml').permissions).toEqual({ contents: 'read' });
  });
});

describe('actual semantic guard and result propagation', () => {
  test.each(['--no-dry-run', '--dry-run=false', '--dry-run', '--plugins=evil', '--extends=evil', '--config=evil', '--allow-failure'])('rejects override %s when unsupported or false-valued', arg => {
    const args = arg === '--dry-run' ? [arg, 'false'] : [arg];
    const spawn = jest.fn();
    expect(semantic.main(args, { cwd: ROOT, spawnSync: spawn, console: { error: jest.fn() } })).toBe(1);
    expect(spawn).not.toHaveBeenCalled();
  });
  test.each([0, 1, 7, null])('no-release/success or actual analysis exit %s propagates', status => {
    const spawn = jest.fn(() => ({ status }));
    expect(semantic.main(['--dry-run'], { cwd: ROOT, spawnSync: spawn, env: { PATH: 'tools', GITHUB_TOKEN: 'secret', NODE_AUTH_TOKEN: 'x' }, nodeVersion: '24.15.0' })).toBe(status ?? 1);
    expect(spawn.mock.calls[0][1].slice(-2)).toEqual(['--dry-run', '--no-ci']);
    expect(spawn.mock.calls[0][2].env).toEqual({ PATH: 'tools' });
  });
  test('payload analysis refuses a different Git SHA', () => {
    const spawn = jest.fn(() => ({ status: 0, stdout: 'b'.repeat(40) }));
    expect(semantic.main([], { cwd: ROOT, env: { GITHUB_ACTIONS: 'true', AEXOS_PROPOSAL_CWD: ROOT, AEXOS_PROPOSAL_SHA: 'a'.repeat(40) }, spawnSync: spawn, console: { error: jest.fn() } })).toBe(1);
    expect(spawn).toHaveBeenCalledTimes(1);
  });
});

describe('internal runner fails closed and propagates actual engine outcome', () => {
  let temporary;
  beforeEach(() => { temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sealed-runner-test-')); });
  afterEach(() => { fs.rmSync(temporary, { recursive: true, force: true }); });
  test.each([{ GITHUB_ACTIONS: 'false' }, { GITHUB_EVENT_NAME: 'release' }, { GITHUB_REPOSITORY_ID: '9' }, { GITHUB_WORKFLOW_SHA: 'main' }, { AEXOS_RELEASE_OPERATION: 'prepare' }])('refuses unsupported execution context %j', async change => {
    const createProviders = jest.fn();
    expect(await runner.main(['publish'], { env: { ...contextEnv(), ...change, AEXOS_RELEASE_EVIDENCE_DIR: temporary }, createProviders })).toBe(1);
    expect(createProviders).not.toHaveBeenCalled();
  });
  test.each(['blocked', 'published-but-unverified', 'verified'])('state %s produces honest exit/evidence with sealed provider', async state => {
    const env = { ...contextEnv(), AEXOS_RELEASE_EVIDENCE_DIR: temporary, AEXOS_CANDIDATE_LOCATOR: '{}', AEXOS_INTENT_ARTIFACT_ID: '9', AEXOS_INTENT_ARTIFACT_DIGEST: 'b'.repeat(64) };
    const candidate = { manifest: { producer: { controllerSha: env.GITHUB_WORKFLOW_SHA } }, transactionId: 'c'.repeat(64) };
    const providers = { verifyContext: jest.fn(), verifyProducer: jest.fn(async () => ({ controllerSha: env.GITHUB_WORKFLOW_SHA })), downloadArtifact: jest.fn(), discoverAttempts: jest.fn(async () => ({ complete: true, attempts: [] })), seal: jest.fn() };
    const receipt = { state, sealed: true };
    const engine = { validateLocator: value => value, loadCandidate: async () => candidate, buildIntent: () => ({ effectKeys: [] }), runTransaction: jest.fn(async options => { options.onReceipt(receipt); return receipt; }) };
    const code = await runner.main(['publish'], { env, engine, createProviders: () => providers, spawnSync: () => ({ status: 0, stdout: env.GITHUB_WORKFLOW_SHA }) });
    expect(code).toBe(state === 'verified' ? 0 : 1);
    expect(JSON.parse(fs.readFileSync(path.join(temporary, 'receipt.json')))).toEqual(receipt);
    expect(engine.runTransaction.mock.calls[0][0].intentEvidence).toEqual({ artifactId: 9, digest: `sha256:${'b'.repeat(64)}` });
    expect(providers.seal).toHaveBeenCalledTimes(1);
  });
  test('runtime validation does not silently skip a missing Node version', () => {
    const env = contextEnv(); delete env.AEXOS_NODE_22;
    expect(() => runner.runtimeOptions(env)).toThrow('Node 22');
  });
});
