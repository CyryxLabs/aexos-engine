#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const engine = require('./ci/sealed-release');
const { createReleaseProviders, validateContext, REPOSITORY, REPOSITORY_ID, WORKFLOW } = require('./ci/release-providers');

function parseJson(text, name) {
  if (typeof text !== 'string' || text.length > 64000) throw new Error(`Explicit bounded ${name} JSON required`);
  try { return JSON.parse(text); } catch { throw new Error(`Invalid ${name} JSON`); }
}

function contextFromEnvironment(env, phase) {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.GITHUB_REPOSITORY !== REPOSITORY ||
      Number(env.GITHUB_REPOSITORY_ID) !== REPOSITORY_ID ||
      !env.GITHUB_WORKFLOW_REF?.startsWith(`${REPOSITORY}/${WORKFLOW}@`) ||
      env.AEXOS_RELEASE_OPERATION !== (phase === 'prepare' ? 'prepare' : 'publish')) throw new Error('Only the supported manual Actions release operation may invoke this runner');
  return validateContext({ repository: REPOSITORY, repositoryId: REPOSITORY_ID, workflowPath: WORKFLOW,
    controllerSha: env.GITHUB_WORKFLOW_SHA, runId: Number(env.GITHUB_RUN_ID), runAttempt: Number(env.GITHUB_RUN_ATTEMPT), operation: env.AEXOS_RELEASE_OPERATION });
}

function runtimeOptions(env) {
  const runtimes = {};
  for (const major of [20, 22, 24]) {
    const executable = env[`AEXOS_NODE_${major}`];
    if (!executable || !path.isAbsolute(executable)) throw new Error(`Pinned Node ${major} runtime missing`);
    runtimes[major] = executable;
  }
  if (!env.AEXOS_NPM_PATH || !path.isAbsolute(env.AEXOS_NPM_PATH)) throw new Error('Pinned npm runtime missing');
  return { runtimes, npmPath: env.AEXOS_NPM_PATH };
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}

function emitOutput(env, key, value) {
  if (!/^[a-z_][a-z0-9_]*$/.test(key) || /[\r\n]/.test(String(value))) throw new Error('Invalid workflow output');
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

async function main(argv = process.argv.slice(2), injected = {}) {
  const env = injected.env || process.env;
  const api = injected.engine || engine;
  const providerFactory = injected.createProviders || createReleaseProviders;
  let providers;
  let context;
  let receiptWritten = false;
  const outputDir = path.resolve(env.AEXOS_RELEASE_EVIDENCE_DIR || path.join(os.tmpdir(), `aexos-release-${Date.now()}`));
  try {
    if (argv.length !== 1 || !['prepare', 'preflight', 'publish'].includes(argv[0])) throw new Error('Internal phase must be prepare, preflight or publish');
    const phase = argv[0];
    context = contextFromEnvironment(env, phase);
    const runtime = runtimeOptions(env);
    const controller = (injected.spawnSync || spawnSync)('git', ['rev-parse', 'HEAD'], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', windowsHide: true });
    if (controller.status !== 0 || controller.stdout.trim() !== context.controllerSha) throw new Error('Controller checkout is not the exact workflow SHA');
    providers = providerFactory({ context, githubToken: env.GITHUB_TOKEN, authMode: env.AEXOS_RELEASE_AUTH || 'oidc', npmToken: env.NODE_AUTH_TOKEN,
      pythonPath: env.AEXOS_PYTHON_PATH, npmPath: runtime.npmPath, env });
    await providers.verifyContext();
    if (phase === 'prepare') {
      const spec = parseJson(env.AEXOS_CANDIDATE_SPEC, 'candidate specification');
      const fields = ['packageKeys', 'channel', 'release', 'dependencies'];
      if (!spec || Object.keys(spec).length !== fields.length || !fields.every(key => Object.hasOwn(spec, key))) throw new Error('Candidate specification fields differ from policy');
      const sourceSha = env.AEXOS_SOURCE_SHA;
      if (!/^[a-f0-9]{40}$/.test(sourceSha || '')) throw new Error('Full source SHA required');
      const output = await api.prepareCandidate({ sourceDir: env.AEXOS_SOURCE_DIR, outputDir: env.AEXOS_CANDIDATE_DIR, context, sourceSha, ...spec, ...runtime });
      for (const key of ['manifestSha256', 'sourceSha', 'producerRunId', 'producerRunAttempt']) emitOutput(env, key.replace(/[A-Z]/g, char => `_${char.toLowerCase()}`), output[key]);
      return 0;
    }
    const locator = api.validateLocator(parseJson(env.AEXOS_CANDIDATE_LOCATOR, 'candidate locator'));
    const producer = await providers.verifyProducer(locator);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-sealed-candidate-'));
    await providers.downloadArtifact({ artifactId: locator.artifactId, digest: locator.artifactDigest, destination: directory });
    const candidate = await api.loadCandidate(directory, locator);
    if (candidate.manifest.producer.controllerSha !== producer.controllerSha) throw new Error('Candidate controller differs from successful producer');
    const intent = api.buildIntent(candidate, context);
    if (phase === 'preflight') {
      const priorAttempts = await providers.discoverAttempts({ effectKeys: intent.effectKeys });
      // Real sealed package checks and all provider/history observations precede
      // durable intent. The writer repeats these reads before release effects.
      await api.preflightCandidate({ candidate, context, providers, priorAttempts, verifyInstalled: value => api.verifyInstalled(value, runtime) });
      writeJson(path.join(outputDir, 'intent.json'), intent);
      emitOutput(env, 'transaction_id', candidate.transactionId);
      return 0;
    }
    const intentDigest = env.AEXOS_INTENT_ARTIFACT_DIGEST || '';
    const intentEvidence = { artifactId: Number(env.AEXOS_INTENT_ARTIFACT_ID), digest: intentDigest.startsWith('sha256:') ? intentDigest : `sha256:${intentDigest}` };
    const priorAttempts = await providers.discoverAttempts({ effectKeys: intent.effectKeys });
    const receipt = await api.runTransaction({ candidate, context, providers, intent, intentEvidence, priorAttempts,
      verifyInstalled: value => api.verifyInstalled(value, runtime),
      onReceipt: value => { writeJson(path.join(outputDir, 'receipt.json'), value); receiptWritten = true; },
    });
    if (!receiptWritten) { writeJson(path.join(outputDir, 'receipt.json'), receipt); receiptWritten = true; }
    if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `Sealed transaction \`${candidate.transactionId}\`: **${receipt.state}**. See immutable outcome evidence for selected package facts.\n`);
    return receipt.state === 'verified' && receipt.sealed === true ? 0 : 1;
  } catch {
    providers?.seal();
    // Diagnostics deliberately exclude arbitrary provider/input text. A failure
    // before an exhaustive terminal ledger cannot authorize a later retry.
    if (!receiptWritten) {
      writeJson(path.join(outputDir, 'failure.json'), { state: 'blocked', context: context || null, reason: 'Release validation or execution failed; inspect bounded step evidence. No terminal outcome is inferred.' });
    }
    if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, 'Sealed release blocked. No publication acceptance was recorded.\n');
    return 1;
  } finally { providers?.seal(); }
}

if (require.main === module) main().then(code => { process.exitCode = code; }).catch(() => { process.exitCode = 1; });
module.exports = { main, contextFromEnvironment, runtimeOptions, parseJson };
