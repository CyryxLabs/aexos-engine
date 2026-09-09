'use strict';

// AEX-4.16. Provider effects are deliberately not retried. Every ambiguous
// response returns to the transaction state machine for read-only reconciliation.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const REPOSITORY = 'CyryxLabs/aexos-engine';
const REPOSITORY_ID = 1315531746;
const WORKFLOW = '.github/workflows/npm-publish.yml';
const REGISTRY = 'https://registry.npmjs.org/';
const MAX_BYTES = 256 * 1024 * 1024;
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const integrity = bytes => `sha512-${crypto.createHash('sha512').update(bytes).digest('base64')}`;
const positive = value => Number.isSafeInteger(value) && value > 0;
const fullSha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const digest = value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value);

function classifyStatus(status) {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 429 || status >= 500) return 'retryable-read';
  return 'unknown';
}

function validateContext(context) {
  if (!object(context) || context.repository !== REPOSITORY || context.repositoryId !== REPOSITORY_ID ||
      context.workflowPath !== WORKFLOW || !fullSha(context.controllerSha) ||
      !positive(context.runId) || !positive(context.runAttempt) || !['prepare', 'publish'].includes(context.operation)) {
    throw new Error('Invalid supported release context');
  }
  return context;
}

function cleanEnvironment(env) {
  return Object.fromEntries(Object.entries(env).filter(([key]) =>
    !/(TOKEN|SECRET|PASSWORD|AUTH|CREDENTIAL|PRIVATE_KEY|SERVICE_ROLE_KEY)/i.test(key) &&
    !/^npm_config_/i.test(key) && !/^NPM_/i.test(key)));
}

function createReleaseProviders(options = {}) {
  const context = validateContext(options.context);
  const fetchImpl = options.fetchImpl || global.fetch;
  const spawn = options.spawnSyncImpl || spawnSync;
  const clock = options.clock || Date.now;
  const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const workDir = options.workDir || fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-release-provider-'));
  fs.mkdirSync(workDir, { recursive: true });
  const githubToken = options.githubToken;
  const npmToken = options.npmToken;
  const authMode = options.authMode || 'oidc';
  const pythonPath = options.pythonPath || 'python3';
  const env = options.env || process.env;
  const base = `https://api.github.com/repos/${REPOSITORY}`;
  let sealed = false;
  let contextVerified = false;
  let intentVerified = false;
  const priorCandidates = new Map();

  async function body(response, limit = MAX_BYTES) {
    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > limit) throw new Error('Response size exceeds policy');
    const chunks = [];
    let count = 0;
    if (!response.body) return Buffer.alloc(0);
    for await (const part of response.body) {
      count += part.length;
      if (count > limit) throw new Error('Response stream exceeds policy');
      chunks.push(Buffer.from(part));
    }
    return Buffer.concat(chunks);
  }

  async function request(url, { method = 'GET', data, binary, accept, authenticated = false, redirects = false, timeoutMs = 30000 } = {}) {
    const headers = { Accept: accept || 'application/vnd.github+json', 'User-Agent': 'aexos-sealed-release', 'X-GitHub-Api-Version': '2022-11-28' };
    if (authenticated && githubToken) headers.Authorization = `Bearer ${githubToken}`;
    if (data !== undefined) headers['Content-Type'] = 'application/json';
    if (binary) headers['Content-Type'] = 'application/octet-stream';
    try {
      const response = await fetchImpl(url, {
        method, headers, redirect: 'manual', signal: global.AbortSignal.timeout(timeoutMs),
        ...(data === undefined && !binary ? {} : { body: binary || JSON.stringify(data) }),
      });
      const requestId = response.headers.get('x-github-request-id') || undefined;
      if (redirects && [301, 302, 303, 307, 308].includes(response.status)) {
        return { status: response.status, location: response.headers.get('location'), requestId };
      }
      const bytes = await body(response, binary || accept === 'application/octet-stream' ? MAX_BYTES : 16 * 1024 * 1024);
      let value;
      try { value = JSON.parse(bytes.toString('utf8')); } catch { /* Typed malformed data below. */ }
      const retryAfterSeconds = Number(response.headers.get('retry-after'));
      return { status: response.status, value, bytes, requestId, retryAfterMs: Number.isFinite(retryAfterSeconds) ? Math.max(0, Math.min(10000, retryAfterSeconds * 1000)) : 0 };
    } catch {
      // Provider errors can include credentials, request URLs and signed links.
      return { status: 0, reason: 'transport unavailable' };
    }
  }

  async function read(url, options = {}) {
    const start = clock();
    let result;
    for (let attempt = 0; attempt < 5; attempt++) {
      result = await request(url, { ...options, timeoutMs: Math.max(1, Math.min(30000, 45000 - (clock() - start))) });
      if (result.status !== 0 && classifyStatus(result.status) !== 'retryable-read') return result;
      if (attempt === 4 || clock() - start >= 45000) break;
      await sleep(Math.min(Math.max(Math.min(250 * 2 ** attempt, 2000), result.retryAfterMs || 0), Math.max(0, 45000 - (clock() - start))));
    }
    return result;
  }

  async function github(route) {
    const result = await read(`${base}${route}`, { authenticated: true });
    if (result.status !== 200 || result.value === undefined) throw new Error(`GitHub evidence unavailable (${result.status || 'transport'})`);
    return result.value;
  }

  async function paginate(route, key) {
    const items = [];
    let expected;
    // REST maximum practical pagination is finite; exceeding it blocks instead
    // of accepting a recent slice as complete history.
    for (let page = 1; page <= 1000; page++) {
      const result = await github(`${route}${route.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      const batch = key ? result[key] : result;
      if (!Array.isArray(batch)) throw new Error('Malformed paginated evidence');
      if (key) {
        if (!Number.isSafeInteger(result.total_count) || result.total_count < 0) throw new Error('Missing evidence total');
        if (expected !== undefined && expected !== result.total_count) throw new Error('Evidence changed during pagination');
        expected = result.total_count;
      }
      items.push(...batch);
      if (batch.length < 100) {
        if (expected !== undefined && expected !== items.length) throw new Error('Incomplete evidence pagination');
        return items;
      }
    }
    throw new Error('Evidence pagination limit reached');
  }

  function checkRun(run, id, attempt, { finished = false } = {}) {
    if (!object(run) || run.id !== id || run.run_attempt !== attempt || run.path !== WORKFLOW ||
        run.repository?.id !== REPOSITORY_ID || run.repository?.full_name !== REPOSITORY ||
        run.head_repository?.id !== REPOSITORY_ID || run.event !== 'workflow_dispatch' ||
        !fullSha(run.head_sha) || (finished && (run.status !== 'completed' || run.conclusion !== 'success'))) {
      throw new Error('Run identity or conclusion mismatch');
    }
  }

  async function verifyContext() {
    const repository = await github('');
    if (repository.id !== REPOSITORY_ID || repository.full_name !== REPOSITORY) throw new Error('Repository identity mismatch');
    const run = await github(`/actions/runs/${context.runId}/attempts/${context.runAttempt}`);
    checkRun(run, context.runId, context.runAttempt);
    if (run.head_sha !== context.controllerSha || run.status !== 'in_progress') throw new Error('Controller run is not active at pinned SHA');
    const jobs = await paginate(`/actions/runs/${context.runId}/attempts/${context.runAttempt}/jobs`, 'jobs');
    const expected = context.operation === 'publish' ? 'Publish sealed transaction' : 'Prepare sealed candidate';
    if (!jobs.some(job => job.name === expected && job.status === 'in_progress')) throw new Error('Supported operation job is not active');
    contextVerified = true;
    return { runId: run.id, runAttempt: run.run_attempt, controllerSha: run.head_sha };
  }

  async function verifyProducer(locator) {
    const run = await github(`/actions/runs/${locator.producerRunId}/attempts/${locator.producerRunAttempt}`);
    checkRun(run, locator.producerRunId, locator.producerRunAttempt, { finished: true });
    const artifact = await github(`/actions/artifacts/${locator.artifactId}`);
    checkArtifact(artifact, locator.artifactId, locator.artifactDigest, run.id);
    if (artifact.workflow_run.head_sha !== run.head_sha) throw new Error('Artifact controller source mismatch');
    if (artifact.name !== `aexos-release-candidate-${run.id}-${run.run_attempt}`) throw new Error('Candidate attempt name mismatch');
    const jobs = await paginate(`/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`, 'jobs');
    for (const name of ['Prepare sealed candidate']) {
      const matches = jobs.filter(job => job.name === name);
      if (matches.length !== 1 || matches[0].status !== 'completed' || matches[0].conclusion !== 'success') throw new Error('Required producer job did not pass');
    }
    return { run, artifact, jobs, controllerSha: run.head_sha };
  }

  function checkArtifact(value, id, expectedDigest, runId) {
    if (!object(value) || !positive(id) || value.id !== id || value.expired !== false ||
        !digest(expectedDigest) || value.digest !== expectedDigest ||
        value.workflow_run?.repository_id !== REPOSITORY_ID || value.workflow_run?.head_repository_id !== REPOSITORY_ID ||
        !positive(value.workflow_run?.id) || (runId && value.workflow_run.id !== runId) ||
        !Number.isFinite(Date.parse(value.expires_at)) || Date.parse(value.expires_at) <= clock()) {
      throw new Error('Artifact identity, digest or retention mismatch');
    }
  }

  async function downloadBytes(url, { authenticated = false, family = 'github' } = {}) {
    let current = new URL(url);
    for (let redirects = 0; redirects <= 4; redirects++) {
      const host = current.hostname;
      const allowed = family === 'npm' ? host === 'registry.npmjs.org' :
        ['api.github.com', 'release-assets.githubusercontent.com', 'results-receiver.actions.githubusercontent.com'].includes(host) ||
        host.endsWith('.blob.core.windows.net') || host.endsWith('.actions.githubusercontent.com');
      if (current.protocol !== 'https:' || current.username || current.password || current.port || !allowed) throw new Error('Untrusted provider download URL');
      const response = await read(current.href, { authenticated: authenticated && host === 'api.github.com', accept: 'application/octet-stream', redirects: true });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (!response.location) throw new Error('Missing download location');
        current = new URL(response.location, current);
        continue;
      }
      if (response.status !== 200 || !Buffer.isBuffer(response.bytes)) throw new Error('Provider download unavailable');
      return response.bytes;
    }
    throw new Error('Provider redirect limit');
  }

  async function downloadArtifact({ artifactId, digest: expectedDigest, destination, expectedFiles = null }) {
    const metadata = await github(`/actions/artifacts/${artifactId}`);
    checkArtifact(metadata, artifactId, expectedDigest);
    const bytes = await downloadBytes(`${base}/actions/artifacts/${artifactId}/zip`, { authenticated: true });
    if (`sha256:${sha256(bytes)}` !== expectedDigest) throw new Error('Downloaded artifact digest mismatch');
    const archive = path.join(workDir, `${artifactId}-${crypto.randomUUID()}.zip`);
    fs.writeFileSync(archive, bytes, { flag: 'wx' });
    const result = spawn(pythonPath, [path.join(__dirname, 'extract-release-artifact.py'), archive, destination, JSON.stringify(expectedFiles)], {
      encoding: 'utf8', timeout: 120000, windowsHide: true, env: cleanEnvironment(env), maxBuffer: 1024 * 1024,
    });
    if (result.error || result.status !== 0) throw new Error('Verified artifact extraction failed');
    if (sha256(fs.readFileSync(archive)) !== sha256(bytes)) throw new Error('Artifact archive changed');
    return { directory: destination, metadata, files: JSON.parse(result.stdout).files };
  }

  async function artifactJson(artifact, filename) {
    const directory = fs.mkdtempSync(path.join(workDir, 'evidence-'));
    await downloadArtifact({ artifactId: artifact.id, digest: artifact.digest, destination: directory, expectedFiles: [filename] });
    const bytes = fs.readFileSync(path.join(directory, filename));
    if (bytes.length > 4 * 1024 * 1024) throw new Error('Evidence document too large');
    return { value: JSON.parse(bytes), sha256: sha256(bytes), identity: { artifactId: artifact.id, digest: artifact.digest, runId: artifact.workflow_run.id } };
  }

  async function verifyIntent({ artifactId, digest: expectedDigest, expectedIntent }) {
    const artifact = await github(`/actions/artifacts/${artifactId}`);
    checkArtifact(artifact, artifactId, expectedDigest, context.runId);
    if (artifact.name !== `aexos-release-intent-${context.runId}-${context.runAttempt}`) throw new Error('Intent attempt mismatch');
    if (artifact.workflow_run.head_sha !== context.controllerSha) throw new Error('Intent controller mismatch');
    const record = await artifactJson(artifact, 'intent.json');
    // The engine owns strict schema; byte-equivalent canonical intent ensures
    // this concrete persisted document matches the approved local plan.
    if (JSON.stringify(record.value) !== JSON.stringify(expectedIntent)) throw new Error('Persisted intent differs from transaction');
    intentVerified = true;
    return record;
  }

  async function discoverAttemptsUnsafe({ currentRunId = context.runId, currentRunAttempt = context.runAttempt }) {
    const runs = await paginate('/actions/workflows/npm-publish.yml/runs', 'workflow_runs');
    const attempts = [];
    for (const run of runs) {
      if (!positive(run.id) || !positive(run.run_attempt)) throw new Error('Malformed prior run');
      const artifacts = await paginate(`/actions/runs/${run.id}/artifacts`, 'artifacts');
      for (let attempt = 1; attempt <= run.run_attempt; attempt++) {
        if (run.id === currentRunId && attempt === currentRunAttempt) continue;
        const jobs = await paginate(`/actions/runs/${run.id}/attempts/${attempt}/jobs`, 'jobs');
        const writers = jobs.filter(job => ['Publish sealed transaction', 'publish', 'publish_workspace_packages', 'publish_legacy_cyryx_core'].some(name => job.name === name || job.name?.startsWith(`${name} (`)));
        if (!writers.some(job => job.started_at && job.conclusion !== 'skipped')) continue;
        const priorRun = await github(`/actions/runs/${run.id}/attempts/${attempt}`);
        // Under this exact controlled workflow revision, a completed skipped
        // executor step proves preflight/upload failed before the writer began.
        // A started/cancelled/missing step or any historical controller is not
        // such proof, and retains conservative durable-intent requirements.
        const noWrite = priorRun.head_sha === context.controllerSha && writers.every(job => {
          if (job.name !== 'Publish sealed transaction') return false;
          const executors = (job.steps || []).filter(step => step.name === 'Reconcile, publish sealed bytes and verify all selected effects');
          return executors.length === 1 && executors[0].status === 'completed' && executors[0].conclusion === 'skipped';
        });
        if (noWrite) { checkRun(priorRun, run.id, attempt); continue; }
        const intents = artifacts.filter(a => a.name === `aexos-release-intent-${run.id}-${attempt}`);
        if (intents.length !== 1) throw new Error('Prior writer has no unique durable intent; reconciliation required');
        checkRun(priorRun, run.id, attempt);
        if (priorRun.status !== 'completed') throw new Error('Prior writer is still active');
        checkArtifact(intents[0], intents[0].id, intents[0].digest, run.id);
        if (intents[0].workflow_run.head_sha !== priorRun.head_sha) throw new Error('Prior intent controller mismatch');
        const intent = await artifactJson(intents[0], 'intent.json');
        const { validateIntent, loadCandidate, canonical } = require('./sealed-release');
        validateIntent(intent.value);
        if (intent.value.context.runId !== run.id || intent.value.context.runAttempt !== attempt || intent.value.context.controllerSha !== priorRun.head_sha) throw new Error('Prior intent run identity mismatch');
        const candidateKey = canonical(intent.value.locator);
        let priorCandidate = priorCandidates.get(candidateKey);
        if (!priorCandidate) {
          const producer = await verifyProducer(intent.value.locator);
          const directory = fs.mkdtempSync(path.join(workDir, 'prior-candidate-'));
          await downloadArtifact({ artifactId: intent.value.locator.artifactId, digest: intent.value.locator.artifactDigest, destination: directory });
          priorCandidate = await loadCandidate(directory, intent.value.locator);
          if (priorCandidate.manifest.producer.controllerSha !== producer.controllerSha) throw new Error('Prior candidate controller mismatch');
          priorCandidates.set(candidateKey, priorCandidate);
        }
        validateIntent(intent.value, priorCandidate);
        // Even disjoint valid history is returned for strict terminal-ledger
        // handling; missing candidate/intent data never proves non-overlap.
        const outcomes = artifacts.filter(a => a.name === `aexos-release-outcome-${run.id}-${attempt}`);
        if (outcomes.length > 1) throw new Error('Ambiguous prior outcome');
        if (outcomes.length) checkArtifact(outcomes[0], outcomes[0].id, outcomes[0].digest, run.id);
        const outcome = outcomes.length ? await artifactJson(outcomes[0], 'receipt.json') : null;
        attempts.push({ intent: intent.value, intentSha256: intent.sha256, identity: { ...intent.identity, runAttempt: attempt }, outcome: outcome?.value || null, outcomeIdentity: outcome?.identity || null });
      }
    }
    return { complete: true, attempts };
  }

  async function discoverAttempts(input) {
    try { return await discoverAttemptsUnsafe(input); } catch {
      return { complete: false, attempts: [], reason: 'Prior writer evidence is unavailable; absent effects require reconciliation' };
    }
  }

  async function observeDependency(dependency) {
    const match = /^gha:([1-9][0-9]*):([a-f0-9]{64}):([a-f0-9]{64})$/.exec(dependency.sourceReceiptId || '');
    if (!match || !positive(Number(match[1]))) return { kind: 'unknown', reason: 'Approved dependency receipt identity required' };
    try {
      const artifact = await github(`/actions/artifacts/${match[1]}`);
      checkArtifact(artifact, Number(match[1]), `sha256:${match[2]}`);
      const record = await artifactJson(artifact, 'receipt.json');
      if (record.sha256 !== match[3]) throw new Error('Dependency receipt digest mismatch');
      const receipt = record.value;
      if (!receipt.sealed || receipt.state !== 'verified' || !object(receipt.context) ||
          artifact.name !== `aexos-release-outcome-${receipt.context.runId}-${receipt.context.runAttempt}` ||
          artifact.workflow_run.id !== receipt.context.runId) throw new Error('Unverified dependency outcome');
      validateContext(receipt.context);
      const run = await github(`/actions/runs/${receipt.context.runId}/attempts/${receipt.context.runAttempt}`);
      checkRun(run, receipt.context.runId, receipt.context.runAttempt, { finished: true });
      const jobs = await paginate(`/actions/runs/${receipt.context.runId}/attempts/${receipt.context.runAttempt}/jobs`, 'jobs');
      const writers = jobs.filter(job => job.name === 'Publish sealed transaction');
      if (writers.length !== 1 || writers[0].status !== 'completed' || writers[0].conclusion !== 'success') throw new Error('Dependency writer job did not pass');
      if (run.head_sha !== receipt.context.controllerSha || !Array.isArray(receipt.effects) ||
          !receipt.effects.some(effect => effect.key === `npm:${dependency.name}@${dependency.version}` && effect.type === 'package' && effect.state === 'verified')) throw new Error('Dependency package result missing');
      const producer = await verifyProducer(receipt.locator);
      const directory = fs.mkdtempSync(path.join(workDir, 'dependency-'));
      await downloadArtifact({ artifactId: receipt.locator.artifactId, digest: receipt.locator.artifactDigest, destination: directory });
      const { loadCandidate, buildIntent, validateReceipt, validateIntent } = require('./sealed-release');
      const candidate = await loadCandidate(directory, receipt.locator);
      if (candidate.transactionId !== receipt.transactionId || candidate.manifestSha256 !== receipt.manifestSha256) throw new Error('Dependency candidate differs from accepted receipt');
      if (candidate.manifest.producer.controllerSha !== producer.controllerSha) throw new Error('Dependency producer controller mismatch');
      const artifacts = await paginate(`/actions/runs/${receipt.context.runId}/artifacts`, 'artifacts');
      const intents = artifacts.filter(entry => entry.name === `aexos-release-intent-${receipt.context.runId}-${receipt.context.runAttempt}`);
      if (intents.length !== 1) throw new Error('Dependency intent is unavailable');
      checkArtifact(intents[0], intents[0].id, intents[0].digest, receipt.context.runId);
      const originalIntent = await artifactJson(intents[0], 'intent.json');
      if (originalIntent.sha256 !== receipt.intentSha256) throw new Error('Dependency outcome intent digest mismatch');
      validateIntent(originalIntent.value, candidate);
      validateReceipt(receipt, buildIntent(candidate, receipt.context));
      const pkg = candidate.packages.find(entry => entry.name === dependency.name && entry.version === dependency.version && entry.integrity === dependency.integrity);
      if (!pkg) throw new Error('Dependency not bound to accepted package');
      return await observePackage({ ...pkg, sourceSha: candidate.manifest.sourceSha }, candidate.manifest.channel);
    } catch { return { kind: 'unknown', reason: 'Approved dependency receipt or archive unavailable' }; }
  }

  async function observePackage(pkg, channel) {
    const response = await read(`${REGISTRY}${encodeURIComponent(pkg.name)}`, { accept: 'application/json' });
    const result = { requestId: response.requestId };
    if (response.status !== 200) return { ...result, kind: classifyStatus(response.status), reason: `Registry read ${response.status || 'unavailable'}` };
    const packument = response.value;
    if (!object(packument) || packument.name !== pkg.name || !object(packument.versions) || !object(packument['dist-tags'])) return { ...result, kind: 'unknown', reason: 'Malformed registry metadata' };
    if (!Object.hasOwn(packument.versions, pkg.version)) return { ...result, kind: 'absent' };
    const entry = packument.versions[pkg.version];
    if (!object(entry) || entry.name !== pkg.name || entry.version !== pkg.version || !object(entry.dist) || typeof entry.dist.tarball !== 'string' || typeof entry.dist.integrity !== 'string') return { ...result, kind: 'unknown', reason: 'Malformed exact version' };
    if (entry.dist.integrity !== pkg.integrity || (pkg.sourceSha && entry.gitHead && entry.gitHead !== pkg.sourceSha) || packument['dist-tags'][channel] !== pkg.version) return { ...result, kind: 'conflict', reason: 'Registry integrity/source/channel mismatch' };
    let bytes;
    try { bytes = await downloadBytes(entry.dist.tarball, { family: 'npm' }); } catch { return { ...result, kind: 'unknown', reason: 'Exact registry archive unavailable or untrusted' }; }
    if (bytes.length !== pkg.size || sha256(bytes) !== pkg.sha256 || integrity(bytes) !== pkg.integrity) return { ...result, kind: 'conflict', reason: 'Registry archive differs from sealed bytes' };
    const tarballPath = path.join(workDir, `registry-${pkg.sha256}.tgz`);
    if (!fs.existsSync(tarballPath)) fs.writeFileSync(tarballPath, bytes, { flag: 'wx' });
    else if (sha256(fs.readFileSync(tarballPath)) !== pkg.sha256) return { ...result, kind: 'conflict', reason: 'Registry download changed locally' };
    return { ...result, kind: 'matching', value: { tarballPath, name: entry.name, version: entry.version, integrity: entry.dist.integrity, ...(entry.gitHead ? { gitHead: entry.gitHead } : {}) } };
  }

  function assertWritable() {
    if (sealed) throw new Error('Terminal ledger sealed; release effects are forbidden');
    if (context.operation !== 'publish' || !contextVerified || !intentVerified) throw new Error('Verified active publish context and persisted intent required');
  }

  async function publishPackage(pkg, channel) {
    assertWritable();
    if (!path.isAbsolute(pkg.tgzPath) || !['latest', 'beta', 'preview'].includes(channel)) throw new Error('Invalid sealed publish arguments');
    const bytes = fs.readFileSync(pkg.tgzPath);
    if (bytes.length !== pkg.size || sha256(bytes) !== pkg.sha256 || integrity(bytes) !== pkg.integrity) throw new Error('TGZ changed immediately before publish');
    if (!['oidc', 'token'].includes(authMode) || (authMode === 'token' && !npmToken)) throw new Error('Explicit publication authentication unavailable');
    const directory = fs.mkdtempSync(path.join(workDir, 'npm-auth-'));
    const config = path.join(directory, 'user.npmrc');
    fs.writeFileSync(config, `registry=${REGISTRY}\n${authMode === 'token' ? '//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}\n' : ''}`, { flag: 'wx', mode: 0o600 });
    const publishEnv = { ...cleanEnvironment(env), NPM_CONFIG_USERCONFIG: config, NPM_CONFIG_GLOBALCONFIG: path.join(directory, 'global.npmrc'), NPM_CONFIG_CACHE: path.join(directory, 'cache') };
    if (authMode === 'token') publishEnv.NODE_AUTH_TOKEN = npmToken;
    else {
      for (const key of ['ACTIONS_ID_TOKEN_REQUEST_URL', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_AUDIENCE']) {
        if (env[key]) publishEnv[key] = env[key];
      }
    }
    const npmPath = options.npmPath || env.npm_execpath;
    if (!npmPath || !path.isAbsolute(npmPath)) throw new Error('Pinned absolute npm CLI path is required');
    let result;
    try {
      result = spawn(process.execPath, [npmPath, 'publish', pkg.tgzPath, `--registry=${REGISTRY}`, '--access=public', `--tag=${channel}`, '--ignore-scripts'], {
        cwd: directory, env: publishEnv, encoding: 'utf8', timeout: 120000, windowsHide: true, maxBuffer: 1024 * 1024,
      });
    } finally {
      fs.unlinkSync(config);
    }
    // Nonzero CLI exit is not proof of rejection; npm may have committed bytes.
    return result && !result.error && result.status === 0 ? { kind: 'accepted' } : { kind: 'unknown', reason: 'npm publish outcome requires registry reconciliation' };
  }

  async function observeTag(tag, sourceSha) {
    const result = await read(`${base}/git/ref/tags/${encodeURIComponent(tag)}`, { authenticated: true });
    if (result.status === 404) return { kind: 'absent' };
    if (result.status !== 200 || !object(result.value?.object)) return { kind: classifyStatus(result.status), reason: 'Tag unavailable' };
    let target = result.value.object;
    const seen = new Set();
    for (let depth = 0; target.type === 'tag' && depth < 16; depth++) {
      if (!fullSha(target.sha) || seen.has(target.sha)) return { kind: 'conflict', reason: 'Invalid annotated tag chain' };
      seen.add(target.sha);
      const nested = await read(`${base}/git/tags/${target.sha}`, { authenticated: true });
      if (nested.status !== 200 || !object(nested.value?.object)) return { kind: 'unknown', reason: 'Annotated tag unavailable' };
      target = nested.value.object;
    }
    return target.type === 'commit' && target.sha === sourceSha ? { kind: 'matching', value: { sha: target.sha } } : { kind: 'conflict', reason: 'Tag target differs from source' };
  }

  function marker(transactionId) { return `<!-- aexos-sealed-release:${transactionId} -->`; }

  async function observeRelease(manifest, transactionId) {
    const response = await read(`${base}/releases/tags/${encodeURIComponent(manifest.release.tag)}`, { authenticated: true });
    if (response.status === 404) return { kind: 'absent' };
    if (response.status !== 200 || !object(response.value) || !positive(response.value.id)) return { kind: classifyStatus(response.status), reason: 'Release unavailable' };
    const value = response.value;
    if (value.tag_name !== manifest.release.tag || value.target_commitish !== manifest.sourceSha || value.prerelease !== manifest.release.prerelease ||
        value.name !== manifest.release.title || value.body !== `${manifest.release.notes}\n\n${marker(transactionId)}` || typeof value.draft !== 'boolean') return { kind: 'conflict', reason: 'Release identity or marker mismatch' };
    return { kind: 'matching', value };
  }

  async function observeAsset(release, asset) {
    let assets;
    try { assets = await paginate(`/releases/${release.id}/assets`); } catch { return { kind: 'unknown', reason: 'Asset listing unavailable' }; }
    const matches = assets.filter(entry => entry.name === asset.name);
    if (matches.length === 0) return { kind: 'absent' };
    if (matches.length !== 1 || matches[0].size !== asset.size || !positive(matches[0].id)) return { kind: 'conflict', reason: 'Asset metadata mismatch' };
    const remote = matches[0];
    if (remote.digest && remote.digest !== `sha256:${asset.sha256}`) return { kind: 'conflict', reason: 'Asset digest mismatch' };
    let bytes;
    try { bytes = await downloadBytes(`${base}/releases/assets/${remote.id}`, { authenticated: true }); } catch { return { kind: 'unknown', reason: 'Asset content unavailable' }; }
    return bytes.length === asset.size && sha256(bytes) === asset.sha256 ? { kind: 'matching', value: remote } : { kind: 'conflict', reason: 'Asset bytes differ' };
  }

  async function write(url, data, binary, acceptedStatuses) {
    assertWritable();
    const response = await request(url, { method: acceptedStatuses.includes(200) ? 'PATCH' : 'POST', data, binary, authenticated: true });
    if (acceptedStatuses.includes(response.status) && object(response.value)) return { kind: 'accepted', value: response.value, requestId: response.requestId };
    return { kind: 'unknown', reason: `GitHub write outcome ${response.status || 'unavailable'} requires reconciliation`, requestId: response.requestId };
  }

  return {
    verifyContext, verifyProducer, downloadArtifact, verifyIntent, discoverAttempts,
    observePackage, observeDependency, publishPackage, observeTag, observeRelease, observeAsset,
    createTag: (tag, sourceSha) => write(`${base}/git/refs`, { ref: `refs/tags/${tag}`, sha: sourceSha }, undefined, [201]),
    createRelease: (manifest, transactionId) => write(`${base}/releases`, { tag_name: manifest.release.tag, target_commitish: manifest.sourceSha, name: manifest.release.title, body: `${manifest.release.notes}\n\n${marker(transactionId)}`, draft: true, prerelease: manifest.release.prerelease }, undefined, [201]),
    uploadAsset: (release, asset) => {
      assertWritable();
      const bytes = fs.readFileSync(asset.path);
      if (bytes.length !== asset.size || sha256(bytes) !== asset.sha256) throw new Error('Asset changed before upload');
      return write(`https://uploads.github.com/repos/${REPOSITORY}/releases/${release.id}/assets?name=${encodeURIComponent(asset.name)}`, undefined, bytes, [201]);
    },
    finalizeRelease: release => write(`${base}/releases/${release.id}`, { draft: false }, undefined, [200]),
    seal: () => { sealed = true; },
  };
}

module.exports = { createReleaseProviders, validateContext, classifyStatus, cleanEnvironment, REPOSITORY, REPOSITORY_ID, WORKFLOW, REGISTRY };
