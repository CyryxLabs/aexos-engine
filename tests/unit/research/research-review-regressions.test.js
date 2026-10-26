'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  DEFAULT_LIMITS,
  appendResearchEvent,
  citationIdentity,
  createArtifact,
  createResearchStore,
  exportJson,
  exportMarkdown,
  readPlan,
  runResearch,
  validateArtifact,
  validatePlan,
} = require('../../../.aexos-core/core/research');

function setup(runId) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-review-regression-'));
  const stateDir = path.join(root, 'state');
  const inputRoot = path.join(root, 'input');
  fs.mkdirSync(stateDir);
  fs.mkdirSync(inputRoot);
  const plan = {
    schemaVersion: 'aexos.research-plan/v1', runId, query: 'bounded review', profile: 'fixture-local',
    sourcePolicy: { allowedAccessClasses: ['public'], privateHandling: 'exclude',
      secretHandling: 'reject', normalizationVersion: 'utf8-crlf-v1' },
    provider: { adapterId: 'fixture-local', version: '1.0.0', kind: 'fixture',
      identityStatus: 'exposed', reportedEngine: null, verification: 'unverified' },
    operations: [{ operationId: 'one', fixture: 'one.json' }],
    claims: [], comparisons: [], uncertainty: [], openQuestions: [],
    limits: { ...DEFAULT_LIMITS, maxCheckpointCount: 40,
      budget: { unit: 'collection-attempt', maximum: 10 } },
  };
  fs.writeFileSync(path.join(inputRoot, 'one.json'), JSON.stringify({ observations: [] }));
  return { root, stateDir, inputRoot, plan };
}

function checkpointText(stateDir) {
  return fs.readdirSync(stateDir).filter((name) => name.endsWith('.json'))
    .map((name) => fs.readFileSync(path.join(stateDir, name), 'utf8')).join('');
}

describe('independent review regressions', () => {
  it.each([
    'password="synthetic-secret-value"',
    "api_key='synthetic-secret-value'",
    '"client_secret": "synthetic-secret-value"',
    '"authorization": "Bearer synthetic-secret-value"',
    'password="synthetic\\"secret-value"',
  ])('rejects quoted assignments and preserves idempotent redaction: %s', async (assignment) => {
    const env = setup('quoted-secret');
    env.plan.query = assignment;
    expect(() => validatePlan(env.plan)).toThrow(expect.objectContaining({ code: 'RESEARCH_SECRET_DETECTED' }));
    env.plan.sourcePolicy.secretHandling = 'redact';
    const normalized = validatePlan(env.plan).plan;
    expect(normalized.query).not.toContain('synthetic');
    expect(validatePlan(normalized).plan.query).toBe(normalized.query);
    fs.writeFileSync(path.join(env.inputRoot, 'one.json'), JSON.stringify({ observations: [{
      locator: 'https://example.test/quoted', accessClass: 'public', availability: 'available',
      retrievedAt: '2026-10-10T12:00:00Z', content: assignment,
    }] }));
    const artifact = await runResearch({ mode: 'start', ...env });
    expect(artifact.status).toBe('completed');
    expect(checkpointText(env.stateDir)).not.toContain('synthetic');
    expect(exportMarkdown(artifact)).not.toContain('synthetic');
  });

  it('rejects a debit-free commit reached through legal public store transitions', () => {
    const env = setup('debit-free');
    const artifact = createArtifact(validatePlan(env.plan), () => new Date('2026-10-10T12:00:00Z'));
    const store = createResearchStore(env.stateDir);
    const lock = store.acquire(env.plan.runId);
    try {
      store.commit(artifact, lock);
      artifact.status = 'collecting';
      appendResearchEvent(artifact, 'collecting', {}, () => new Date('2026-10-10T12:00:01Z'));
      store.commit(artifact, lock);
      artifact.recovery.operations[0].status = 'committed';
      artifact.recovery.committedOperationIds = ['one'];
      artifact.metrics.committedCollections = 1;
      appendResearchEvent(artifact, 'collection-committed', { operationId: 'one', attempt: 1, observationCount: 0 },
        () => new Date('2026-10-10T12:00:02Z'));
      expect(() => store.commit(artifact, lock)).toThrow(expect.objectContaining({ code: 'RESEARCH_ARTIFACT_INVALID' }));
      artifact.status = 'validating';
      appendResearchEvent(artifact, 'validating', {}, () => new Date('2026-10-10T12:00:03Z'));
      expect(() => validateArtifact(artifact)).toThrow(expect.objectContaining({ code: 'RESEARCH_ARTIFACT_INVALID' }));
    } finally { store.release(lock); }
  });

  it('rejects commitment without attempt evidence and attempts beyond the selected budget', async () => {
    const env = setup('attempt-evidence');
    const artifact = await runResearch({ mode: 'start', ...env });
    expect(validateArtifact(artifact)).toBe(artifact);
    const noReservation = JSON.parse(JSON.stringify(artifact));
    noReservation.recovery.operations[0].reservations = [];
    noReservation.recovery.operations[0].attempts = 0;
    noReservation.metrics.attemptedCollections = 0;
    noReservation.metrics.consumedLogicalUnits = 0;
    expect(() => validateArtifact(noReservation)).toThrow(expect.objectContaining({ code: 'RESEARCH_ARTIFACT_INVALID' }));
    artifact.limits.budget.maximum = 0;
    expect(() => validateArtifact(artifact)).toThrow(expect.objectContaining({ code: 'RESEARCH_ARTIFACT_INVALID' }));
  });

  it('rejects or redacts documented secret patterns across every persisted text source', async () => {
    const rejected = setup('secret-plan-reject');
    rejected.plan.query = 'api_key=sk-test-synthetic-secret-123456789';
    expect(() => validatePlan(rejected.plan)).toThrow(expect.objectContaining({
      code: 'RESEARCH_SECRET_DETECTED',
    }));

    const redacted = setup('secret-redact');
    redacted.plan.sourcePolicy.secretHandling = 'redact';
    redacted.plan.query = 'api_key=sk-test-synthetic-secret-123456789';
    redacted.plan.uncertainty = ['Authorization: Bearer synthetic-secret-123456789'];
    redacted.plan.claims = [{ id: 'open-secret', text: 'client_secret=synthetic-secret-123456789',
      material: true, support: 'open', citations: [],
      explanation: 'password=synthetic-secret-123456789', uncertainty: 'unknown' }];
    redacted.plan.comparisons = [{ id: 'nested-secret',
      declaredConfidence: 'access_token=synthetic-secret-123456789',
      rubric: { criteria: [{ id: 'fit', weight: 0.5 }],
        alternatives: [{ id: 'one', scores: { fit: { value: 50.5, sources: ['ref'] } } }],
        sources: [{ id: 'ref', sourceId: `s-${'a'.repeat(64)}`, contentHash: 'b'.repeat(64) }],
        weightOverrides: {} } }];
    const normalized = validatePlan(redacted.plan).plan;
    expect(JSON.stringify(normalized)).not.toContain('synthetic-secret');
    redacted.plan.comparisons = [];
    fs.writeFileSync(path.join(redacted.inputRoot, 'one.json'), JSON.stringify({ observations: [{
      locator: 'https://example.test/secret', accessClass: 'public', availability: 'available',
      retrievedAt: '2026-10-10T12:00:00Z',
      content: 'Authorization: Bearer synthetic-secret-123456789',
    }] }));
    const artifact = await runResearch({ mode: 'start', ...redacted });
    expect(artifact.status).toBe('completed');
    for (const output of [JSON.stringify(artifact), checkpointText(redacted.stateDir),
      exportJson(artifact), exportMarkdown(artifact)]) {
      expect(output).not.toContain('synthetic-secret');
      expect(output).toContain('REDACTED');
    }

    const error = setup('secret-error-code');
    const failed = await runResearch({ mode: 'start', ...error,
      adapterFactory: () => ({ collect: async () => {
        throw Object.assign(new Error('Bearer synthetic-secret-123456789'), {
          code: 'api_key=synthetic-secret-123456789',
        });
      } }) });
    expect(failed).toMatchObject({ status: 'failed', reasonCode: 'COLLECTION_FAILED' });
    expect(checkpointText(error.stateDir)).not.toContain('synthetic-secret');
  });

  it('checks cancellation and deadline immediately before terminal success', async () => {
    const timed = setup('terminal-deadline');
    timed.plan.limits.maxElapsedMs = 100;
    let instant = Date.parse('2026-10-10T12:00:00Z');
    const timeout = await runResearch({ mode: 'start', ...timed,
      clock: () => new Date(instant), interruptionHook: async (point) => {
        if (point === 'before-terminal') instant += 1000;
      } });
    expect(timeout).toMatchObject({ status: 'blocked', reasonCode: 'TIME_LIMIT' });

    const cancelled = setup('terminal-cancel');
    const controller = new AbortController();
    const cancellation = await runResearch({ mode: 'start', ...cancelled,
      signal: controller.signal, interruptionHook: async (point) => {
        if (point === 'before-terminal') controller.abort();
      } });
    expect(cancellation).toMatchObject({ status: 'cancelled', reasonCode: 'CANCELLED' });
  });

  it.each(['before-collection-publication', 'before-validation', 'after-validation'])(
    'checks the persisted deadline at the %s boundary',
    async (boundary) => {
      const env = setup(`deadline-${boundary}`);
      env.plan.limits.maxElapsedMs = 100;
      let instant = Date.parse('2026-10-10T12:00:00Z');
      const result = await runResearch({ mode: 'start', ...env,
        clock: () => new Date(instant), interruptionHook: async (point) => {
          if (point === boundary) instant += 1000;
        } });
      expect(result).toMatchObject({ status: 'blocked', reasonCode: 'TIME_LIMIT' });
      expect(result.metrics.committedCollections).toBe(boundary === 'before-collection-publication' ? 0 : 1);
    },
  );

  it('resumes validating idempotently and applies the persisted deadline after downtime', async () => {
    const env = setup('validating-resume');
    env.plan.limits.maxElapsedMs = 100;
    let instant = Date.parse('2026-10-10T12:00:00Z');
    let interruptions = 0;
    const stop = async (point) => {
      if (point === 'before-terminal' && interruptions < 2) {
        interruptions += 1;
        throw Object.assign(new Error('stop'), { code: 'RESEARCH_CONTROLLED_INTERRUPTION' });
      }
    };
    await expect(runResearch({ mode: 'start', ...env,
      clock: () => new Date(instant), interruptionHook: stop }))
      .rejects.toMatchObject({ code: 'RESEARCH_CONTROLLED_INTERRUPTION' });
    await expect(runResearch({ mode: 'resume', ...env,
      clock: () => new Date(instant), interruptionHook: stop }))
      .rejects.toMatchObject({ code: 'RESEARCH_CONTROLLED_INTERRUPTION' });
    const retained = require('../../../.aexos-core/core/research').loadResearch({
      runId: env.plan.runId, stateDir: env.stateDir,
    });
    expect(retained.events.filter((event) => event.type === 'validating')).toHaveLength(1);
    instant += 1000;
    const result = await runResearch({ mode: 'resume', ...env, clock: () => new Date(instant) });
    expect(result).toMatchObject({ status: 'blocked', reasonCode: 'TIME_LIMIT' });
    expect(result.events.filter((event) => event.type === 'validating')).toHaveLength(1);
  });

  it('rejects fabricated completion and nonmonotonic checkpoints through public APIs', () => {
    const env = setup('fabricated-completion');
    const identity = validatePlan(env.plan);
    const artifact = createArtifact(identity, () => new Date('2026-10-10T12:00:00Z'));
    artifact.status = 'completed';
    artifact.claims = [{ id: 'claim', text: 'Uncollected evidence', material: true,
      support: 'supported', uncertainty: '', citations: [{
        sourceId: `s-${'f'.repeat(64)}`, contentHash: 'e'.repeat(64),
      }] }];
    appendResearchEvent(artifact, 'completed', {}, () => new Date('2026-10-10T12:00:01Z'));
    expect(() => exportJson(artifact)).toThrow(expect.objectContaining({
      code: 'RESEARCH_ARTIFACT_INVALID',
    }));
    const store = createResearchStore(env.stateDir);
    const lock = store.acquire(env.plan.runId);
    expect(() => store.commit(artifact, lock)).toThrow(expect.objectContaining({
      code: 'RESEARCH_CHECKPOINT_INVALID',
    }));
    store.release(lock);

    const valid = createArtifact(identity, () => new Date('2026-10-10T12:00:00Z'));
    const secondLock = store.acquire(env.plan.runId);
    store.commit(valid, secondLock);
    valid.query = 'rewritten';
    valid.status = 'collecting';
    appendResearchEvent(valid, 'collecting', {}, () => new Date('2026-10-10T12:00:01Z'));
    expect(() => store.commit(valid, secondLock)).toThrow(expect.objectContaining({
      code: 'RESEARCH_CHECKPOINT_INVALID',
    }));
    store.release(secondLock);
  });

  it('enforces the selected whole-plan byte bound for object and file APIs', () => {
    const env = setup('plan-byte-bound');
    for (let index = 0; index < 10; index += 1) {
      env.plan.limits.maxInputBytes = Buffer.byteLength(JSON.stringify(env.plan), 'utf8');
    }
    const exact = env.plan.limits.maxInputBytes;
    expect(Buffer.byteLength(JSON.stringify(env.plan), 'utf8')).toBe(exact);
    expect(validatePlan(env.plan).plan.limits.maxInputBytes).toBe(exact);
    const planFile = path.join(env.root, 'plan.json');
    fs.writeFileSync(planFile, JSON.stringify(env.plan));
    expect(readPlan(planFile).plan.limits.maxInputBytes).toBe(exact);

    fs.writeFileSync(planFile, ` ${JSON.stringify(env.plan)} `);
    expect(() => readPlan(planFile)).toThrow(expect.objectContaining({ code: 'RESEARCH_PLAN_INVALID' }));
    env.plan.query = 'ação';
    for (let index = 0; index < 10; index += 1) {
      env.plan.limits.maxInputBytes = Buffer.byteLength(JSON.stringify(env.plan), 'utf8') + 4;
    }
    fs.writeFileSync(planFile, `\n ${JSON.stringify(env.plan)} \n`);
    expect(readPlan(planFile).plan.query).toBe('ação');
    fs.appendFileSync(planFile, ' ');
    expect(() => readPlan(planFile)).toThrow(expect.objectContaining({ code: 'RESEARCH_PLAN_INVALID' }));

    const over = JSON.parse(JSON.stringify(env.plan));
    over.limits.maxInputBytes = Buffer.byteLength(JSON.stringify(over), 'utf8') - 1;
    expect(() => validatePlan(over)).toThrow(expect.objectContaining({ code: 'RESEARCH_PLAN_INVALID' }));
    fs.writeFileSync(planFile, JSON.stringify(over));
    expect(() => readPlan(planFile)).toThrow(expect.objectContaining({ code: 'RESEARCH_PLAN_INVALID' }));
  });
});
