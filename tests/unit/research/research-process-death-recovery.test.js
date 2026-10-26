'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { fork } = require('child_process');
const {
  DEFAULT_LIMITS,
  cancelResearchAsync,
  createArtifact,
  createResearchStore,
  loadResearch,
  recoverResearch,
  runResearch,
  validatePlan,
} = require('../../../.aexos-core/core/research');

const CHILD = path.resolve(__dirname, '../../fixtures/research/recovery-child.js');
const describeWindows = process.platform === 'win32' ? describe : describe.skip;

function setup(runId, budget = 10) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-research-death-'));
  const stateDir = path.join(root, 'state');
  const inputRoot = path.join(root, 'input');
  fs.mkdirSync(stateDir);
  fs.mkdirSync(inputRoot);
  fs.writeFileSync(path.join(inputRoot, 'one.json'), JSON.stringify({ observations: [{
    locator: 'https://example.test/death',
    accessClass: 'public',
    availability: 'available',
    retrievedAt: '2026-10-11T12:00:00Z',
    content: 'Bounded process-death evidence.',
  }] }));
  const plan = {
    schemaVersion: 'aexos.research-plan/v1', runId, query: 'process death', profile: 'fixture-local',
    sourcePolicy: { allowedAccessClasses: ['public'], privateHandling: 'exclude',
      secretHandling: 'reject', normalizationVersion: 'utf8-crlf-v1' },
    provider: { adapterId: 'fixture-local', version: '1.0.0', kind: 'fixture',
      identityStatus: 'exposed', reportedEngine: null, verification: 'unverified' },
    operations: [{ operationId: 'one', fixture: 'one.json' }],
    claims: [], comparisons: [], uncertainty: [], openQuestions: [],
    limits: { ...DEFAULT_LIMITS, maxCheckpointCount: 60,
      budget: { unit: 'collection-attempt', maximum: budget } },
  };
  return { root, stateDir, inputRoot, plan };
}

function writeRequest(env, request, name = `request-${Date.now()}-${Math.random()}.json`) {
  const file = path.join(env.root, name);
  fs.writeFileSync(file, JSON.stringify(request));
  return file;
}

function waitForMessage(child, accepted, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Child IPC readiness timed out.')), timeoutMs);
    child.on('message', (message) => {
      if (!accepted(message)) return;
      clearTimeout(timeout);
      resolve(message);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Child exited before readiness (${code}).`));
    });
  });
}

async function pausedChild(env, pauseAt) {
  const request = writeRequest(env, {
    pauseAt,
    options: { mode: 'start', plan: env.plan, stateDir: env.stateDir, inputRoot: env.inputRoot },
  });
  const child = fork(CHILD, [request], { cwd: path.resolve(__dirname, '../../..'),
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  const ready = await waitForMessage(child, (message) => message.type === 'ready');
  return { child, ready };
}

async function terminateOwned(child) {
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  expect(child.kill('SIGKILL')).toBe(true);
  const result = await exited;
  expect(result.code === null || result.code !== 0).toBe(true);
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => child.once('exit', resolve));
}

function lockPath(env) {
  return path.join(env.stateDir, `${env.plan.runId}.lock`);
}

function stateSnapshot(stateDir) {
  return Object.fromEntries(fs.readdirSync(stateDir).sort().map((name) => [
    name,
    fs.readFileSync(path.join(stateDir, name)).toString('hex'),
  ]));
}

describeWindows('Windows process-death research recovery', () => {
  it('retains a killed reservation debit and blocks a budget-one resume without collection', async () => {
    const env = setup('death-budget', 1);
    const { child } = await pausedChild(env, 'after-reservation');
    await terminateOwned(child);
    expect(fs.existsSync(lockPath(env))).toBe(true);
    let calls = 0;
    const result = await runResearch({ mode: 'resume', plan: env.plan,
      stateDir: env.stateDir, inputRoot: env.inputRoot,
      adapterFactory: () => ({ collect: async () => { calls += 1; return { observations: [], cursor: null }; } }) });
    expect(result).toMatchObject({ status: 'blocked', reasonCode: 'BUDGET_LIMIT' });
    expect(result.metrics).toMatchObject({ attemptedCollections: 1, consumedLogicalUnits: 1 });
    expect(result.events.filter((event) => event.type === 'attempt-interrupted')).toHaveLength(1);
    expect(calls).toBe(0);
  });

  it('charges attempt two after reservation death and skips a committed operation after death', async () => {
    const reserved = setup('death-resume');
    const first = await pausedChild(reserved, 'after-reservation');
    await terminateOwned(first.child);
    const resumed = await runResearch({ mode: 'resume', plan: reserved.plan,
      stateDir: reserved.stateDir, inputRoot: reserved.inputRoot });
    expect(resumed).toMatchObject({ status: 'completed' });
    expect(resumed.metrics).toMatchObject({ attemptedCollections: 2, committedCollections: 1 });

    const committed = setup('death-committed');
    const second = await pausedChild(committed, 'after-collection-commit');
    await terminateOwned(second.child);
    let calls = 0;
    const completed = await runResearch({ mode: 'resume', plan: committed.plan,
      stateDir: committed.stateDir, inputRoot: committed.inputRoot,
      adapterFactory: () => ({ collect: async () => { calls += 1; return { observations: [], cursor: null }; } }) });
    expect(completed.status).toBe('completed');
    expect(completed.metrics).toMatchObject({ attemptedCollections: 1, committedCollections: 1 });
    expect(completed.events.filter((event) => event.type === 'collection-committed')).toHaveLength(1);
    expect(calls).toBe(0);
  });

  it('does not seize a live writer and ignores serialized PID as authority after exact death', async () => {
    const env = setup('live-writer');
    const { child } = await pausedChild(env, 'after-reservation');
    const file = lockPath(env);
    const metadata = JSON.parse(fs.readFileSync(file, 'utf8'));
    metadata.pid = process.pid;
    fs.writeFileSync(file, `${JSON.stringify(metadata)}\n`);
    await expect(recoverResearch({ runId: env.plan.runId, stateDir: env.stateDir }))
      .rejects.toMatchObject({ code: 'RESEARCH_BUSY' });
    await expect(runResearch({ mode: 'resume', plan: env.plan,
      stateDir: env.stateDir, inputRoot: env.inputRoot }))
      .rejects.toMatchObject({ code: 'RESEARCH_BUSY' });
    await expect(cancelResearchAsync({ runId: env.plan.runId, stateDir: env.stateDir }))
      .rejects.toMatchObject({ code: 'RESEARCH_BUSY' });
    expect(fs.existsSync(file)).toBe(true);
    await terminateOwned(child);
    await expect(recoverResearch({ runId: env.plan.runId, stateDir: env.stateDir }))
      .resolves.toMatchObject({ runId: env.plan.runId, status: 'recovered' });
    expect(fs.existsSync(file)).toBe(false);
  });

  it('serializes two recovery children without duplicate ownership', async () => {
    const env = setup('concurrent-recovery');
    const { child } = await pausedChild(env, 'after-reservation');
    await terminateOwned(child);
    const children = [0, 1].map((index) => {
      const request = writeRequest(env, { action: 'recover', options: {
        runId: env.plan.runId, stateDir: env.stateDir,
      } }, `recover-${index}.json`);
      return fork(CHILD, [request], { cwd: path.resolve(__dirname, '../../..'),
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    });
    const outcomes = await Promise.all(children.map((candidate) =>
      waitForMessage(candidate, (message) => ['result', 'error'].includes(message.type))));
    await Promise.all(children.map((candidate) => waitForExit(candidate)));
    const recovered = outcomes.filter((outcome) => outcome.result?.status === 'recovered');
    expect(recovered).toHaveLength(1);
    expect(outcomes.every((outcome) => outcome.result?.status === 'recovered'
      || outcome.result?.status === 'not-needed' || outcome.code === 'RESEARCH_BUSY')).toBe(true);
    const artifact = loadResearch({ runId: env.plan.runId, stateDir: env.stateDir });
    expect(artifact.metrics).toMatchObject({ attemptedCollections: 1, committedCollections: 0 });
  });

  it.each([
    ['legacy', `${JSON.stringify({ protocol: 'aexos.research-lock/v1', runId: 'bad-lock',
      pid: 1, token: 'a'.repeat(64), createdAt: '2026-10-11T12:00:00.000Z' })}\n`,
    'RESEARCH_RECOVERY_UNAVAILABLE'],
    ['truncated', '{"protocol":"aexos.research-lock/v2"', 'RESEARCH_LOCK_CHANGED'],
    ['unknown', `${JSON.stringify({ protocol: 'aexos.research-lock/v99' })}\n`, 'RESEARCH_LOCK_CHANGED'],
    ['oversized', 'x'.repeat(4097), 'RESEARCH_LOCK_CHANGED'],
  ])('preserves %s coordination bytes on refusal', async (_name, bytes, code) => {
    const env = setup('bad-lock');
    fs.writeFileSync(lockPath(env), bytes);
    await expect(recoverResearch({ runId: env.plan.runId, stateDir: env.stateDir }))
      .rejects.toMatchObject({ code });
    expect(fs.readFileSync(lockPath(env))).toEqual(Buffer.from(bytes));
    expect(fs.readdirSync(env.stateDir).filter((name) => name.endsWith('.json'))).toHaveLength(0);
  });

  it('refuses hardlinked and symlinked coordination without changing the target', async () => {
    const hard = setup('hard-lock');
    const hardTarget = path.join(hard.stateDir, 'retained-hard-target');
    fs.writeFileSync(hardTarget, 'retained-hardlink-bytes');
    fs.linkSync(hardTarget, lockPath(hard));
    await expect(recoverResearch({ runId: hard.plan.runId, stateDir: hard.stateDir }))
      .rejects.toMatchObject({ code: 'RESEARCH_LOCK_CHANGED' });
    expect(fs.readFileSync(hardTarget, 'utf8')).toBe('retained-hardlink-bytes');

    const symbolic = setup('symbolic-lock');
    const symbolicTarget = path.join(symbolic.stateDir, 'retained-symbolic-target');
    fs.writeFileSync(symbolicTarget, 'retained-symbolic-bytes');
    try {
      fs.symlinkSync(symbolicTarget, lockPath(symbolic), 'file');
    } catch (error) {
      expect(['EPERM', 'EACCES']).toContain(error.code);
      return;
    }
    await expect(recoverResearch({ runId: symbolic.plan.runId, stateDir: symbolic.stateDir }))
      .rejects.toMatchObject({ code: 'RESEARCH_LOCK_CHANGED' });
    expect(fs.readFileSync(symbolicTarget, 'utf8')).toBe('retained-symbolic-bytes');
  });

  it('rejects root replacement and in-memory lock forgery or released-object reuse', async () => {
    const replaced = setup('root-replaced');
    const storeBeforeReplacement = createResearchStore(replaced.stateDir);
    fs.renameSync(replaced.stateDir, `${replaced.stateDir}-retained`);
    fs.mkdirSync(replaced.stateDir);
    await expect(storeBeforeReplacement.acquireRecoverable(replaced.plan.runId))
      .rejects.toMatchObject({ code: 'RESEARCH_STORE_CHANGED' });

    const forged = setup('forged-lock');
    const store = createResearchStore(forged.stateDir);
    const artifact = createArtifact(validatePlan(forged.plan), () => new Date('2026-10-11T12:00:00.000Z'));
    expect(() => store.commit(artifact, { protocol: 'aexos.research-lock/v2',
      runId: forged.plan.runId, pid: process.pid,
      token: 'a'.repeat(64), lockPath: lockPath(forged) }))
      .toThrow(expect.objectContaining({ code: 'RESEARCH_LOCK_REQUIRED' }));
    const legacy = store.acquire(forged.plan.runId);
    expect(() => store.commit(artifact, { ...legacy }))
      .toThrow(expect.objectContaining({ code: 'RESEARCH_LOCK_REQUIRED' }));
    store.release(legacy);
    const lock = await store.acquireRecoverable(forged.plan.runId);
    const downgraded = { ...lock, protocol: 'aexos.research-lock/v1' };
    expect(() => store.commit(artifact, downgraded))
      .toThrow(expect.objectContaining({ code: 'RESEARCH_LOCK_REQUIRED' }));
    expect(() => store.release(downgraded))
      .toThrow(expect.objectContaining({ code: 'RESEARCH_LOCK_REQUIRED' }));
    await store.release(lock);
    expect(() => store.commit(artifact, lock))
      .toThrow(expect.objectContaining({ code: 'RESEARCH_LOCK_REQUIRED' }));
  });

  it.each(['v1', 'v2'])(
    'binds every %s checkpoint commit to its store-issued run identity',
    async (protocol) => {
      const env = setup(`scope-${protocol}-a`);
      const runA = `scope-${protocol}-a`;
      const runB = `scope-${protocol}-b`;
      const request = writeRequest(env, {
        action: 'hold-lock', protocol, runId: runB, stateDir: env.stateDir,
      }, `hold-${protocol}.json`);
      const child = fork(CHILD, [request], { cwd: path.resolve(__dirname, '../../..'),
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
      await waitForMessage(child, (message) => message.type === 'ready');
      const store = createResearchStore(env.stateDir);
      const lockA = protocol === 'v1'
        ? store.acquire(runA)
        : await store.acquireRecoverable(runA);
      try {
        const artifactA = createArtifact(validatePlan({ ...env.plan, runId: runA }),
          () => new Date('2026-10-11T12:00:00.000Z'));
        const artifactB = createArtifact(validatePlan({ ...env.plan, runId: runB }),
          () => new Date('2026-10-11T12:00:00.000Z'));
        expect(() => store.commit(artifactA, lockA)).not.toThrow();
        const beforeForeignCommit = stateSnapshot(env.stateDir);
        expect(() => store.commit(artifactB, lockA))
          .toThrow(expect.objectContaining({ code: 'RESEARCH_LOCK_REQUIRED' }));
        expect(stateSnapshot(env.stateDir)).toEqual(beforeForeignCommit);
        expect(fs.readdirSync(env.stateDir)
          .filter((name) => name.startsWith(`${runB}.`) && name.endsWith('.json')))
          .toHaveLength(0);
      } finally {
        await store.release(lockA);
        const released = waitForMessage(child, (message) => message.type === 'released');
        child.send('release');
        await released;
        await waitForExit(child);
      }
    },
  );
});

describe('Portable research execution', () => {
  it('preserves normal v1 execution while explicit recovery is unavailable off Windows', async () => {
    const env = setup('portable-execution');
    const descriptor = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { ...descriptor, value: 'linux' });
    try {
      const completed = await runResearch({ mode: 'start', plan: env.plan,
        stateDir: env.stateDir, inputRoot: env.inputRoot });
      expect(completed.status).toBe('completed');
      expect(fs.existsSync(lockPath(env))).toBe(false);
      await expect(recoverResearch({ runId: env.plan.runId, stateDir: env.stateDir }))
        .rejects.toMatchObject({ code: 'RESEARCH_RECOVERY_UNAVAILABLE' });
      expect(loadResearch({ runId: env.plan.runId, stateDir: env.stateDir }).status)
        .toBe('completed');
    } finally {
      Object.defineProperty(process, 'platform', descriptor);
    }
  });
});
