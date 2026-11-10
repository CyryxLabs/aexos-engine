#!/usr/bin/env node

'use strict';

const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const { createLocalPlanFixture } = require(path.resolve(
  __dirname,
  'helpers/local-plan-fixture',
));
const packageName = require(path.resolve(repoRoot, 'package.json')).name;
const packageParts = packageName.split('/');
const npmCli = path.resolve(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const npmCommand = fs.existsSync(npmCli) ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
const npmPrefix = fs.existsSync(npmCli) ? [npmCli] : [];
const RECEIPT_MARKER = '@@AEXOS_INSTALLED_RECEIPT@@';
const DEFAULT_CASES = [
  'greenfield', 'brownfield', 'defect', 'unavailable-executor', 'capability-denial',
  'budget-exhaustion', 'missing-artifact', 'failed-qa', 'zero-phase', 'malformed-phase',
  'malicious-input', 'no-op',
];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function nativeCandidateEligibility({ platform, architecture, release }) {
  // Match the reviewed experimental adapter; this is not production admission.
  return platform === 'win32' && architecture === 'x64' && release === '10.0.26300'
    ? 'experimental-windows-native-candidate' : 'ineligible-native-environment';
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: { ...process.env, NODE_PATH: '', ...(options.env || {}) },
    encoding: 'utf8',
    timeout: options.timeout || 420000,
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    const detail = [result.error?.message, result.stdout, result.stderr].filter(Boolean).join('\n');
    const error = new Error(`Command failed: ${command} ${args.join(' ')}\n${detail}`);
    error.code = result.error?.code === 'ETIMEDOUT' ? 'INSTALLED_COMMAND_TIMEOUT' : 'INSTALLED_COMMAND_FAILED';
    throw error;
  }
  return result.stdout;
}

function parseArguments(argv) {
  const options = { evidenceDir: process.env.AEXOS_INSTALLED_EVIDENCE_DIR || '', cases: DEFAULT_CASES };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--evidence-dir') options.evidenceDir = path.resolve(argv[++index]);
    else if (argv[index] === '--cases') options.cases = argv[++index].split(',').map((item) => item.trim()).filter(Boolean);
    else if (argv[index] === '--keep-workspaces') options.keepWorkspaces = true;
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!options.evidenceDir) throw new Error('--evidence-dir is required.');
  if (options.cases.length === 0) throw new Error('A nonempty installed journey case selection is required.');
  if (new Set(options.cases).size !== options.cases.length) throw new Error('Duplicate installed journey cases are not allowed.');
  const unknown = options.cases.find((item) => !DEFAULT_CASES.includes(item));
  if (unknown) throw new Error(`Unknown installed journey case: ${unknown}`);
  return options;
}

function packCandidate(evidenceDir) {
  const candidateDir = path.join(evidenceDir, 'candidate');
  // An existing candidate is retained evidence, never scratch output to replace.
  fs.mkdirSync(candidateDir);
  const output = run(npmCommand, [...npmPrefix,
    'pack', '--json', '--ignore-scripts', '--pack-destination', candidateDir,
  ], { cwd: repoRoot, timeout: 240000 });
  const packed = JSON.parse(output);
  if (!Array.isArray(packed) || packed.length !== 1) throw new Error('npm pack did not return one candidate.');
  const tgzPath = path.join(candidateDir, packed[0].filename);
  const bytes = fs.readFileSync(tgzPath);
  return { tgzPath, tgzSha256: sha256(bytes), bytes: bytes.length, npm: packed[0] };
}

function installCandidate(caseRoot, tgzPath) {
  const installRoot = path.join(caseRoot, 'installed-host');
  fs.mkdirSync(installRoot, { recursive: true });
  fs.writeFileSync(path.join(installRoot, 'package.json'), JSON.stringify({ private: true }, null, 2));
  const flags = ['--offline', '--ignore-scripts', '--no-audit', '--fund=false', '--package-lock=false', '--workspaces=false'];
  try {
    run(npmCommand, [...npmPrefix, 'install', tgzPath, ...flags], { cwd: installRoot });
  } catch (error) {
    error.code = 'INSTALLED_OFFLINE_DEPENDENCY_UNAVAILABLE';
    throw error;
  }
  const frameworkRoot = path.join(installRoot, 'node_modules', ...packageParts);
  const internalRoot = path.join(frameworkRoot, '.aexos-core');
  try {
    run(npmCommand, [...npmPrefix, 'install', '--omit=dev', ...flags], { cwd: internalRoot });
  } catch (error) {
    error.code = 'INSTALLED_OFFLINE_INTERNAL_DEPENDENCY_UNAVAILABLE';
    throw error;
  }
  return { installRoot, frameworkRoot };
}

function installedPayloadHashes(frameworkRoot) {
  const relatives = [
    '.aexos-core/core/execution/workflow-runner.js',
    '.aexos-core/core/execution/local-plan-checker.js',
    '.aexos-core/core/execution/execution-binding.js',
    '.aexos-core/core/orchestration/workflow-orchestrator.js',
    '.aexos-core/development/workflows/story-development-cycle.yaml',
  ];
  return Object.fromEntries(relatives.map((relative) => {
    const file = path.join(frameworkRoot, relative);
    if (!fs.existsSync(file)) throw new Error(`Installed payload is missing ${relative}.`);
    return [relative.replace(/\\/g, '/'), sha256(fs.readFileSync(file))];
  }));
}

function writeDriver(caseRoot) {
  const driver = path.join(caseRoot, 'installed-driver.cjs');
  fs.writeFileSync(driver, [
    "'use strict';",
    "const fs = require('fs');",
    "const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));",
    'const { runGovernedWorkflow } = require(input.runnerPath);',
    "const { inspectNativeCandidateIdentity, authorizeNativeCandidateValidation } = require(require('path').resolve(input.options.frameworkRoot, '.aexos-core/core/permissions/native-publication-support.js'));",
    '(async () => {',
    '  try {',
    "    input.options.nativeValidationAuthorization = authorizeNativeCandidateValidation({ projectRoot: input.options.projectRoot, purpose: 'candidate-validation', expectedIdentity: inspectNativeCandidateIdentity() });",
    '    const receipt = await runGovernedWorkflow(input.options);',
    `    console.log('${RECEIPT_MARKER}' + JSON.stringify({ kind: 'receipt', receipt }));`,
    '  } catch (error) {',
    `    console.log('${RECEIPT_MARKER}' + JSON.stringify({ kind: 'error', error: { code: error.code || 'ERROR', message: error.message } }));`,
    '  }',
    '})().catch((error) => { console.error(error); process.exit(1); });',
    '',
  ].join('\n'));
  return driver;
}

function executeInstalled(caseRoot, frameworkRoot, options) {
  const inputFile = path.join(caseRoot, `driver-input-${crypto.randomUUID()}.json`);
  const driver = writeDriver(caseRoot);
  fs.writeFileSync(inputFile, JSON.stringify({
    runnerPath: path.join(frameworkRoot, '.aexos-core/core/execution/workflow-runner.js'),
    options,
  }));
  const stdout = run(process.execPath, [driver, inputFile], { cwd: caseRoot, timeout: 180000 });
  const marked = stdout.split(/\r?\n/).find((line) => line.startsWith(RECEIPT_MARKER));
  if (!marked) throw new Error(`Installed runner did not emit a receipt marker.\n${stdout}`);
  return { result: JSON.parse(marked.slice(RECEIPT_MARKER.length)), stdout };
}

function findCreatedIdentity(controlRoot, target) {
  for (const name of fs.readdirSync(controlRoot).filter((item) => item.endsWith('.prepared.json'))) {
    const receipt = JSON.parse(fs.readFileSync(path.join(controlRoot, name), 'utf8'));
    if (receipt.prepared?.target === target && receipt.prepared?.stageIdentity) {
      return receipt.prepared.stageIdentity;
    }
  }
  throw new Error(`No retained guarded-create identity found for ${target}.`);
}

function seedExistingSource(caseRoot, frameworkRoot, journey) {
  const consumer = path.join(caseRoot, 'consumer');
  const controlRoot = path.join(caseRoot, 'seed-control');
  fs.mkdirSync(consumer, { recursive: true });
  fs.mkdirSync(controlRoot);
  const isDefect = journey === 'defect';
  const prior = isDefect
    ? 'module.exports = function add(a, b) { return Number(a) - Number(b); };\n'
    : 'module.exports = function add(a, b) { return +a + +b; };\n';
  const seedTest = isDefect ? [
    "const test = require('node:test');", "const assert = require('node:assert/strict');", "const add = require('./app.cjs');",
    "test('legacy subtraction interface', () => { assert.equal(add(5, 3), 2); });",
    "test('legacy numeric text interface', () => { assert.equal(add('5', '3'), 2); });", '',
  ].join('\n') : undefined;
  const seed = createLocalPlanFixture(consumer, {
    journey: 'greenfield', after: prior, outputPrefix: 'seed-', testFile: isDefect ? 'seed-acceptance.test.cjs' : 'acceptance.test.cjs',
    ...(seedTest ? { testSource: seedTest, testNames: ['legacy subtraction interface', 'legacy numeric text interface'] } : {}),
  });
  const executed = executeInstalled(caseRoot, frameworkRoot, {
    ...seed, projectRoot: consumer, controlRoot, frameworkRoot, executor: 'local-plan',
  });
  if (executed.result.receipt?.status !== 'ACCEPTED') throw new Error(`Seed publication failed: ${JSON.stringify(executed.result)}`);
  return { consumer, prior, identity: findCreatedIdentity(controlRoot, seed.source), seedReceipt: executed.result.receipt };
}

function configureCase(caseName, caseRoot, frameworkRoot) {
  let consumer;
  let beforeIdentity = null;
  let seedReceipt = null;
  if (['brownfield', 'defect', 'no-op'].includes(caseName)) {
    const seeded = seedExistingSource(caseRoot, frameworkRoot, caseName === 'defect' ? 'defect' : 'brownfield');
    ({ consumer, identity: beforeIdentity, seedReceipt } = seeded);
  } else {
    consumer = path.join(caseRoot, 'consumer');
    fs.mkdirSync(consumer, { recursive: true });
  }
  // Retain the same external authority/inventory across the seed and change.
  const controlRoot = path.join(caseRoot, seedReceipt ? 'seed-control' : 'control');
  if (!fs.existsSync(controlRoot)) fs.mkdirSync(controlRoot);
  const journey = caseName === 'defect' ? 'defect'
    : ['brownfield', 'no-op'].includes(caseName) ? 'brownfield' : 'greenfield';
  const fixture = createLocalPlanFixture(consumer, {
    journey,
    beforeIdentity,
    ...(caseName === 'no-op' ? { after: fs.readFileSync(path.join(consumer, 'app.cjs'), 'utf8') } : {}),
  });
  let executor = 'local-plan';
  if (caseName === 'unavailable-executor') executor = 'not-installed';
  if (caseName === 'capability-denial') {
    fixture.policy.grants = fixture.policy.grants.filter((grant) => grant.agentId !== 'sm');
    fixture.persist();
  }
  if (caseName === 'budget-exhaustion') {
    fixture.run.phases[0].estimatedCostUsd = 2;
    fixture.persist();
  }
  if (caseName === 'missing-artifact') fs.rmSync(path.join(consumer, fixture.testFile));
  if (caseName === 'failed-qa') {
    const failing = [
      "const test = require('node:test');", "const assert = require('node:assert/strict');", "const add = require('./app.cjs');",
      "test('numeric interface remains stable', () => { assert.equal(add(2, 3), 6); });",
      "test('numeric text is supported', () => { assert.equal(add('2', '3'), 6); });", '',
    ].join('\n');
    fs.writeFileSync(path.join(consumer, fixture.testFile), failing);
    for (const phase of fixture.run.phases) {
      for (const check of phase.checks.filter((item) => item.type === 'node-test')) check.sha256 = sha256(failing);
    }
    fixture.persist();
  }
  if (caseName === 'zero-phase') {
    fixture.run.phases = [];
    fixture.persist();
  }
  if (caseName === 'malformed-phase') {
    fixture.run.phases[1].id = fixture.run.phases[0].id;
    fixture.persist();
  }
  if (caseName === 'malicious-input') {
    fixture.run.phases[0].operations[0].target = '../outside.md';
    fixture.persist();
  }
  return { consumer, controlRoot, fixture, executor, seedReceipt };
}

function expectedCase(caseName, result) {
  if (['greenfield', 'brownfield', 'defect'].includes(caseName)) {
    return result.kind === 'receipt' && result.receipt.status === 'ACCEPTED';
  }
  const codes = {
    'unavailable-executor': ['WORKFLOW_EXECUTOR_UNAVAILABLE'],
    'capability-denial': ['CAPABILITY_DENIED'],
    'budget-exhaustion': ['DISPATCH_BUDGET_EXHAUSTED'],
    'missing-artifact': ['BINDING_PATH_INVALID', 'LOCAL_CHECK_READ_DENIED', 'WORKFLOW_PHASE_EXECUTION_FAILED'],
    'failed-qa': ['LOCAL_CHECK_TEST_FAILED'],
    'zero-phase': ['WORKFLOW_RUN_INVALID'],
    'malformed-phase': ['WORKFLOW_PHASE_SET_INVALID'],
    'malicious-input': ['BINDING_PATH_INVALID'],
    'no-op': ['WORKFLOW_CHANGE_REQUIRED'],
  };
  const observed = result.kind === 'error' ? result.error.code : result.receipt.errorCode;
  if (caseName === 'failed-qa') {
    if (result.kind !== 'receipt') return false;
    const { receipt } = result;
    const failure = receipt.failure;
    const observations = Array.isArray(receipt.observations) ? receipt.observations : [];
    const completed = Array.isArray(receipt.completed) ? receipt.completed : null;
    const requiredCompleted = [
      ['create-story', 'create-next-story'],
      ['validate-story', 'validate-next-story'],
      ['plan-implementation', 'plan-create-implementation'],
      ['implement-story', 'dev-develop-story'],
    ];
    const phaseIndexes = failure?.diagnosticRefs?.phaseObservationIndexes;
    const effectIndexes = failure?.diagnosticRefs?.effectObservationIndexes;
    const actualFailureIndex = observations.findIndex((entry) => entry?.phaseId === 'run-tests'
      && entry.stage === 'after' && entry.type === 'node-test' && entry.passed === false
      && Number.isInteger(entry.tests) && entry.tests > 0 && Number.isInteger(entry.failed) && entry.failed > 0
      && Number.isInteger(entry.exitCode) && entry.exitCode !== 0 && entry.skipped === 0 && entry.cancelled === 0);
    const effectIndex = observations.findIndex((entry) => entry?.phaseId === 'run-tests'
      && entry.operation === 'guarded-create' && entry.success === true && entry.state === 'VERIFIED'
      && entry.effects?.destination === true && typeof entry.transactionId === 'string'
      && entry.transactionId.length > 0 && entry.receipt && typeof entry.receipt === 'object');
    return receipt.status === 'BLOCKED' && receipt.errorCode === 'WORKFLOW_PHASE_EXECUTION_FAILED'
      && receipt.workflowOutcome?.status === 'blocked'
      && Array.isArray(receipt.workflowOutcome.failedPhases)
      && receipt.workflowOutcome.failedPhases.length === 1 && receipt.workflowOutcome.failedPhases[0] === 5
      && failure?.phase?.number === 5 && failure.phase.phaseId === 'run-tests'
      && failure.phase.task === 'qa-run-tests'
      && failure.phase.owner === 'qa' && failure.success === false && failure.status === 'failed'
      && failure.outerCode === 'WORKFLOW_PHASE_EXECUTION_FAILED'
      && failure.causeCode === 'LOCAL_CHECK_TEST_FAILED'
      && failure.acceptance?.verdict === 'REJECTED'
      && failure.acceptance.code === 'LOCAL_CHECK_TEST_FAILED'
      && failure.diagnosticRefs?.collection === 'observations'
      && actualFailureIndex >= 0 && effectIndex >= 0
      && Array.isArray(phaseIndexes) && phaseIndexes.includes(actualFailureIndex)
      && phaseIndexes.includes(effectIndex) && Array.isArray(effectIndexes) && effectIndexes.includes(effectIndex)
      && completed?.length === requiredCompleted.length
      && completed.every((phase, index) => phase.phaseId === requiredCompleted[index][0]
        && phase.task === requiredCompleted[index][1]
        && phase.acceptance?.verdict === 'ACCEPTED');
  }
  return result.kind === 'error'
    ? codes[caseName].includes(observed)
    : result.receipt.status === 'BLOCKED' && (codes[caseName].includes(observed)
      || result.receipt.runtimeEvents?.some((event) => codes[caseName].includes(event.code)));
}

function retainControlFiles(controlRoot, evidenceCaseRoot) {
  const destination = path.join(evidenceCaseRoot, 'control-receipts');
  fs.mkdirSync(destination, { recursive: true });
  if (!fs.existsSync(controlRoot)) return [];
  return fs.readdirSync(controlRoot).filter((name) => name.endsWith('.json')).map((name) => {
    const source = path.join(controlRoot, name);
    fs.copyFileSync(source, path.join(destination, name));
    return { name, sha256: sha256(fs.readFileSync(source)) };
  });
}

function executeCase(caseName, workspaceRoot, evidenceRoot, candidate) {
  const caseRoot = path.join(workspaceRoot, caseName);
  const evidenceCaseRoot = path.join(evidenceRoot, 'cases', caseName);
  fs.mkdirSync(caseRoot, { recursive: true });
  fs.mkdirSync(evidenceCaseRoot, { recursive: true });
  const installed = installCandidate(caseRoot, candidate.tgzPath);
  const payloadHashes = installedPayloadHashes(installed.frameworkRoot);
  const configured = configureCase(caseName, caseRoot, installed.frameworkRoot);
  const beforeDirty = fs.readFileSync(path.join(configured.consumer, 'unrelated-dirty.txt'));
  const execution = executeInstalled(caseRoot, installed.frameworkRoot, {
    ...configured.fixture,
    projectRoot: configured.consumer,
    controlRoot: configured.controlRoot,
    frameworkRoot: installed.frameworkRoot,
    executor: configured.executor,
  });
  const afterDirty = fs.readFileSync(path.join(configured.consumer, 'unrelated-dirty.txt'));
  const result = {
    case: caseName,
    passed: expectedCase(caseName, execution.result),
    installedRoot: installed.frameworkRoot,
    packageSha256: candidate.tgzSha256,
    payloadHashes,
    unrelatedBytesPreserved: beforeDirty.equals(afterDirty),
    seedReceipt: configured.seedReceipt,
    outcome: execution.result,
    controlReceipts: retainControlFiles(configured.controlRoot, evidenceCaseRoot),
  };
  fs.writeFileSync(path.join(evidenceCaseRoot, 'receipt.json'), `${JSON.stringify(result, null, 2)}\n`);
  fs.writeFileSync(path.join(evidenceCaseRoot, 'stdout.log'), execution.stdout);
  if (!result.passed || !result.unrelatedBytesPreserved) {
    throw Object.assign(new Error(`Installed case failed: ${caseName}`), { caseResult: result });
  }
  return result;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  fs.mkdirSync(options.evidenceDir, { recursive: true });
  const evidenceRoot = fs.mkdtempSync(path.join(options.evidenceDir, 'run-'));
  const candidate = packCandidate(evidenceRoot);
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-installed-sdlc-'));
  const summary = {
    generatedAt: new Date().toISOString(),
    evidenceRoot,
    candidate: { path: candidate.tgzPath, sha256: candidate.tgzSha256, bytes: candidate.bytes },
    environment: { platform: process.platform, architecture: process.arch, release: os.release(), node: process.version },
    eligibility: nativeCandidateEligibility({ platform: process.platform, architecture: process.arch, release: os.release() }),
    limitations: [
      'Deterministic local plan fixture; no AI generation or provider proof.',
      'Experimental newly-created protected-file candidate only; ordinary inherited-ACL coverage is not claimed.',
      'No package support, release, security-review, or independent QA acceptance claim.',
    ],
    cases: [],
  };
  try {
    if (summary.eligibility !== 'experimental-windows-native-candidate') {
      throw Object.assign(new Error('Native installed journey is not eligible on this OS build.'), { code: 'INSTALLED_NATIVE_INELIGIBLE' });
    }
    for (const caseName of options.cases) {
      summary.cases.push(executeCase(caseName, workspaceRoot, evidenceRoot, candidate));
    }
    summary.status = summary.cases.every((item) => item.passed) ? 'FOCUSED_PROOF_PASSED' : 'BLOCKED';
  } catch (error) {
    summary.status = 'BLOCKED';
    summary.blocker = { code: error.code || 'INSTALLED_HARNESS_FAILED', message: error.message };
    if (error.caseResult) summary.cases.push(error.caseResult);
  } finally {
    fs.writeFileSync(path.join(evidenceRoot, 'installed-journeys-receipt.json'), `${JSON.stringify(summary, null, 2)}\n`);
    if (!options.keepWorkspaces) fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (summary.status !== 'FOCUSED_PROOF_PASSED') process.exitCode = 1;
  return summary;
}

if (require.main === module) main();

module.exports = {
  DEFAULT_CASES,
  executeInstalled,
  expectedCase,
  installCandidate,
  installedPayloadHashes,
  main,
  nativeCandidateEligibility,
  packCandidate,
  parseArguments,
};
