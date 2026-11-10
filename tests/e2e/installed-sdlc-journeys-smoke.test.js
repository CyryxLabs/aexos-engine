'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const harness = require(path.resolve(
  __dirname,
  '../../scripts/e2e/installed-sdlc-journeys-smoke',
));
const { createLocalPlanFixture, sha256 } = require(path.resolve(
  __dirname,
  '../helpers/local-plan-fixture',
));

describe('installed SDLC journey harness', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-installed-harness-test-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('admits the exact current native candidate without declaring production support', () => {
    expect(harness.nativeCandidateEligibility({ platform: 'win32', architecture: 'x64', release: '10.0.26300' }))
      .toBe('experimental-windows-native-candidate');
    const permissions = path.resolve(__dirname, '../../.aexos-core/core/permissions');
    const adapter = fs.readFileSync(path.join(permissions, 'windows-publication-adapter.js'), 'utf8');
    const launcher = fs.readFileSync(path.join(permissions, 'windows-publication-launcher.ps1'), 'utf8');
    expect(adapter).toContain("os.release() !== '10.0.26300'");
    expect(launcher).toContain('10.0.26300.0');
    for (const name of ['windows-publication-finite-relay.cs', 'windows-publication-protected-relay.cs',
      'windows-publication-protected-relay-base.cs']) {
      const relay = fs.readFileSync(path.join(permissions, name), 'utf8');
      const releases = [...relay.matchAll(/"release"\)\s*==\s*"([^"]+)"/g)].map((match) => match[1]);
      expect(releases).toEqual(['10.0.26300']);
    }
    expect(require(path.join(permissions, 'native-publication-support')).PRODUCTION_SUPPORT_ALLOWLIST).toEqual([]);
  });

  test.each([
    ['win32', 'x64', '10.0.26200'], ['win32', 'arm64', '10.0.26300'],
    ['win32', 'ia32', '10.0.26300'], ['linux', 'x64', '10.0.26300'],
    ['darwin', 'x64', '10.0.26300'], ['win32', 'x64', '10.0.26301'],
  ])('rejects an unqualified candidate %s/%s/%s', (platform, architecture, release) => {
    expect(harness.nativeCandidateEligibility({ platform, architecture, release }))
      .toBe('ineligible-native-environment');
  });

  test('loads the distributed qualification harness without the repository test corpus', () => {
    const staging = path.join(root, 'installed');
    const scripts = path.join(staging, 'scripts', 'e2e');
    fs.mkdirSync(scripts, { recursive: true });
    const original = path.resolve(__dirname, '../../scripts/e2e/installed-sdlc-journeys-smoke.js');
    const copied = path.join(scripts, 'installed-sdlc-journeys-smoke.js');
    fs.copyFileSync(original, copied);
    const helpers = path.resolve(path.dirname(original), 'helpers');
    if (fs.existsSync(helpers)) fs.cpSync(helpers, path.join(scripts, 'helpers'), { recursive: true });
    fs.writeFileSync(path.join(staging, 'package.json'), JSON.stringify({ name: '@aexos/core' }));
    const probe = spawnSync(process.execPath, ['-e', 'const h=require(process.argv[1]);process.stdout.write(JSON.stringify(h.DEFAULT_CASES));', copied],
      { cwd: staging, env: { ...process.env, NODE_PATH: '' }, encoding: 'utf8', timeout: 10000, windowsHide: true });
    expect({ error: probe.error?.code, status: probe.status, stderr: probe.stderr })
      .toEqual({ error: undefined, status: 0, stderr: '' });
    expect(JSON.parse(probe.stdout)).toContain('brownfield');
    expect(fs.existsSync(path.join(staging, 'tests'))).toBe(false);
  });

  test('fixture publishes meaningful story and implementation plan artifacts', () => {
    const fixture = createLocalPlanFixture(root);
    const create = fixture.run.phases.find((phase) => phase.id === 'create-story');
    const validate = fixture.run.phases.find((phase) => phase.id === 'validate-story');
    const plan = fixture.run.phases.find((phase) => phase.id === 'plan-implementation');
    const story = Buffer.from(create.operations[0].contentBase64, 'base64').toString('utf8');
    const planValue = JSON.parse(Buffer.from(plan.operations[0].contentBase64, 'base64').toString('utf8'));

    expect(story).toMatch(/^# Story FIXTURE-1-IMPLEMENTATION/m);
    expect(story).toMatch(/^## Status\r?\n+Ready/m);
    expect(story).toMatch(/^## Acceptance Criteria\r?\n[\s\S]*^- \[ \]/m);
    expect(planValue).toEqual({
      planVersion: 1,
      source: fixture.source,
      afterSha256: sha256(fixture.after),
      testFile: fixture.testFile,
    });
    expect(validate.checks).toContainEqual(expect.objectContaining({
      type: 'utf8-sha256',
      stage: 'after',
      target: create.inputs.output,
      sha256: sha256(story),
    }));
    expect(fixture.policy.grants).toContainEqual(expect.objectContaining({
      agentId: 'po',
      task: 'validate-next-story',
      capability: 'filesystem',
      action: 'read',
      resource: path.resolve(root, create.inputs.output),
    }));
  });

  test('fixture binds replacement to actual prior bytes and rejects accidental greenfield fallback', () => {
    const prior = 'module.exports = (a, b) => a + b;\n';
    fs.writeFileSync(path.join(root, 'app.cjs'), prior);
    const fixture = createLocalPlanFixture(root, { journey: 'brownfield', beforeIdentity: '1:2:3' });
    const implementation = fixture.run.phases.find((phase) => phase.id === 'implement-story');
    const replacement = implementation.operations.find((operation) => operation.target === 'app.cjs');

    expect(replacement).toMatchObject({
      operation: 'guarded-recoverable-replace',
      expectedBefore: { identity: '1:2:3', sha256: sha256(prior) },
      isolatedWorkspace: true,
      allowAbsentName: true,
    });
  });

  test('parses bounded case selection and rejects unknown cases', () => {
    const evidenceDir = path.join(root, 'evidence');
    expect(harness.parseArguments(['--evidence-dir', evidenceDir, '--cases', 'greenfield,budget-exhaustion'])).toEqual({
      evidenceDir: path.resolve(evidenceDir),
      cases: ['greenfield', 'budget-exhaustion'],
    });
    expect(() => harness.parseArguments(['--evidence-dir', evidenceDir, '--cases', 'invented']))
      .toThrow('Unknown installed journey case');
  });

  test.each(['', ' , ', 'greenfield,greenfield'])('rejects empty or repeated qualification cases: %s', (cases) => {
    expect(() => harness.parseArguments(['--evidence-dir', path.join(root, 'evidence'), '--cases', cases]))
      .toThrow(/nonempty|Duplicate/);
  });

  test('refuses to replace a retained candidate before invoking npm', () => {
    fs.mkdirSync(path.join(root, 'candidate'));
    const retained = path.join(root, 'candidate', 'previous.tgz');
    fs.writeFileSync(retained, 'retained package evidence');
    expect(() => harness.packCandidate(root)).toThrow(expect.objectContaining({ code: 'EEXIST' }));
    expect(fs.readFileSync(retained, 'utf8')).toBe('retained package evidence');
  });

  test.each([
    ['greenfield', { kind: 'receipt', receipt: { status: 'ACCEPTED' } }],
    ['unavailable-executor', { kind: 'error', error: { code: 'WORKFLOW_EXECUTOR_UNAVAILABLE' } }],
    ['budget-exhaustion', { kind: 'receipt', receipt: { status: 'BLOCKED', errorCode: null,
      runtimeEvents: [{ code: 'DISPATCH_BUDGET_EXHAUSTED' }] } }],
    ['no-op', { kind: 'error', error: { code: 'WORKFLOW_CHANGE_REQUIRED' } }],
  ])('accepts only the expected evidence boundary for %s', (caseName, result) => {
    expect(harness.expectedCase(caseName, result)).toBe(true);
  });

  const failedQaResult = ({ phaseId = 'run-tests', causeCode = 'LOCAL_CHECK_TEST_FAILED',
    includeCheck = true, includeEffect = true, includeReview = false } = {}) => {
    const observations = [];
    if (includeEffect) observations.push({ phaseId: 'run-tests', operation: 'guarded-create', success: true,
      state: 'VERIFIED', effects: { destination: true }, transactionId: 'transaction-id', receipt: {} });
    if (includeCheck) observations.push({ phaseId: 'run-tests', stage: 'after', type: 'node-test',
      tests: 2, failed: 2, exitCode: 1, passed: false, skipped: 0, cancelled: 0 });
    return { kind: 'receipt', receipt: {
      status: 'BLOCKED', errorCode: 'WORKFLOW_PHASE_EXECUTION_FAILED', observations,
      workflowOutcome: { status: 'blocked', failedPhases: [5] },
      completed: [
        ['create-story', 'create-next-story'],
        ['validate-story', 'validate-next-story'],
        ['plan-implementation', 'plan-create-implementation'],
        ['implement-story', 'dev-develop-story'],
      ].map(([completedPhaseId, task]) => ({ phaseId: completedPhaseId, task,
        acceptance: { verdict: 'ACCEPTED' } }))
        .concat(includeReview ? [{ phaseId: 'review-story', acceptance: { verdict: 'ACCEPTED' } }] : []),
      failure: {
        phase: { number: 5, phaseId, task: 'qa-run-tests', owner: 'qa' },
        outerCode: 'WORKFLOW_PHASE_EXECUTION_FAILED', success: false, status: 'failed', causeCode,
        acceptance: { verdict: 'REJECTED', code: causeCode },
        diagnosticRefs: { collection: 'observations',
          phaseObservationIndexes: observations.map((_entry, index) => index),
          effectObservationIndexes: includeEffect ? [0] : [] },
      },
    } };
  };

  test('accepts failed QA only with the exact nested cause and real retained failure evidence', () => {
    expect(harness.expectedCase('failed-qa', failedQaResult())).toBe(true);
  });

  const alterCompleted = (change) => {
    const result = failedQaResult();
    change(result.receipt.completed);
    return result;
  };

  test.each([
    ['generic wrapper only', { kind: 'receipt', receipt: { status: 'BLOCKED',
      errorCode: 'WORKFLOW_PHASE_EXECUTION_FAILED', observations: [], completed: [] } }],
    ['wrong phase', failedQaResult({ phaseId: 'review-story' })],
    ['fabricated cause without check', failedQaResult({ includeCheck: false })],
    ['missing native effect', failedQaResult({ includeEffect: false })],
    ['downstream acceptance', failedQaResult({ includeReview: true })],
    ['wrong nested cause', failedQaResult({ causeCode: 'FILESYSTEM_PHASE_FAILED' })],
    ['duplicate prior phases', alterCompleted((completed) => {
      completed.splice(0, completed.length, ...completed.map(() => structuredClone(completed[0])));
    })],
    ['missing prior phase', alterCompleted((completed) => { completed.pop(); })],
    ['substituted prior phase', alterCompleted((completed) => { completed[3].phaseId = 'unrelated-phase'; })],
    ['wrong prior task', alterCompleted((completed) => { completed[3].task = 'unrelated-task'; })],
    ['reversed prior phases', alterCompleted((completed) => { completed.reverse(); })],
  ])('rejects failed-QA false positive: %s', (_name, result) => {
    expect(harness.expectedCase('failed-qa', result)).toBe(false);
  });

  test('does not load the workflow runner from the source checkout', () => {
    const source = fs.readFileSync(path.resolve(
      __dirname,
      '../../scripts/e2e/installed-sdlc-journeys-smoke.js',
    ), 'utf8');
    expect(source).not.toMatch(/require\([^\n]*workflow-runner/);
    expect(source).toContain("runnerPath: path.join(frameworkRoot, '.aexos-core/core/execution/workflow-runner.js')");
    expect(source).toContain("'--offline', '--ignore-scripts'");
    expect(source).toContain("NODE_PATH: ''");
  });
});
