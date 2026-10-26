'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  DEFAULT_LIMITS,
  createFixtureCollector,
  loadResearch,
  runResearch,
} = require('../../../.aexos-core/core/research');

function setup(runId, operations = [{ operationId: 'one', fixture: 'one.json' }]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-bounds-'));
  const stateDir = path.join(root, 'state');
  const inputRoot = path.join(root, 'input');
  fs.mkdirSync(stateDir);
  fs.mkdirSync(inputRoot);
  const plan = {
    schemaVersion: 'aexos.research-plan/v1', runId, query: 'bounded run', profile: 'fixture-local',
    sourcePolicy: { allowedAccessClasses: ['public'], privateHandling: 'exclude',
      secretHandling: 'reject', normalizationVersion: 'utf8-crlf-v1' },
    provider: { adapterId: 'fixture-local', version: '1.0.0', kind: 'fixture',
      identityStatus: 'exposed', reportedEngine: null, verification: 'unverified' },
    operations, claims: [], comparisons: [], uncertainty: [], openQuestions: [],
    limits: { ...DEFAULT_LIMITS, maxCheckpointCount: 40,
      budget: { unit: 'collection-attempt', maximum: 10 } },
  };
  return { root, stateDir, inputRoot, plan };
}

function fixture(root, name, observations) {
  fs.writeFileSync(path.join(root, name), JSON.stringify({ observations }));
}

function publicObservation(locator, content, minute = 0) {
  return { locator, accessClass: 'public', availability: 'available',
    retrievedAt: `2026-10-10T12:${String(minute).padStart(2, '0')}:00.000Z`, content };
}

describe('research limits and storage boundaries', () => {
  it('allows duplicate content at the exact unique-source threshold', async () => {
    const env = setup('exact-threshold');
    env.plan.limits.maxSources = 1;
    fixture(env.inputRoot, 'one.json', [
      publicObservation('https://example.test/a', 'same', 0),
      publicObservation('https://example.test/b', 'same', 1),
    ]);
    const result = await runResearch({ mode: 'start', ...env });
    expect(result.status).toBe('completed');
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].observations).toHaveLength(2);
  });

  it('filters private observations before source limits and rejects true unique overflow atomically', async () => {
    const filtered = setup('private-filtered');
    filtered.plan.limits.maxSources = 1;
    fixture(filtered.inputRoot, 'one.json', [
      { locator: 'https://example.test/private', accessClass: 'private', availability: 'unavailable',
        retrievedAt: '2026-10-10T12:00:00Z' },
      publicObservation('https://example.test/public', 'public'),
    ]);
    const completed = await runResearch({ mode: 'start', ...filtered });
    expect(completed.status).toBe('completed');
    expect(completed.sources).toHaveLength(1);

    const overflow = setup('unique-overflow');
    overflow.plan.limits.maxSources = 1;
    fixture(overflow.inputRoot, 'one.json', [
      publicObservation('https://example.test/a', 'one'),
      publicObservation('https://example.test/b', 'two'),
    ]);
    const blocked = await runResearch({ mode: 'start', ...overflow });
    expect(blocked).toMatchObject({ status: 'blocked', reasonCode: 'SOURCE_LIMIT' });
    expect(blocked.sources).toHaveLength(0);
    expect(blocked.metrics.committedCollections).toBe(0);
  });

  it('charges retries, succeeds within the bound, and blocks at exhaustion', async () => {
    const success = setup('retry-success');
    let calls = 0;
    const transientThenSuccess = () => ({
      collect: async () => {
        calls += 1;
        if (calls < 3) throw Object.assign(new Error('temporary'), {
          code: 'FIXTURE_TRANSIENT', transient: true,
        });
        return { observations: [], cursor: null };
      },
    });
    const completed = await runResearch({ mode: 'start', ...success,
      adapterFactory: transientThenSuccess });
    expect(completed.status).toBe('completed');
    expect(completed.metrics).toMatchObject({ attemptedCollections: 3, retries: 2,
      consumedLogicalUnits: 3 });

    const exhausted = setup('retry-exhausted');
    exhausted.plan.limits.maxAttemptsPerOperation = 2;
    const blocked = await runResearch({ mode: 'start', ...exhausted,
      adapterFactory: () => ({ collect: async () => {
        throw Object.assign(new Error('temporary'), { code: 'FIXTURE_TRANSIENT', transient: true });
      } }) });
    expect(blocked).toMatchObject({ status: 'blocked', reasonCode: 'RETRY_LIMIT' });
    expect(blocked.metrics.attemptedCollections).toBe(2);
  });

  it('charges an interrupted pending reservation and blocks when its budget is exhausted', async () => {
    const env = setup('pending-budget');
    env.plan.limits.budget.maximum = 1;
    const stop = async (point) => {
      if (point === 'after-reservation') throw Object.assign(new Error('stop'), {
        code: 'RESEARCH_CONTROLLED_INTERRUPTION',
      });
    };
    await expect(runResearch({ mode: 'start', ...env, interruptionHook: stop }))
      .rejects.toMatchObject({ code: 'RESEARCH_CONTROLLED_INTERRUPTION' });
    const blocked = await runResearch({ mode: 'resume', ...env });
    expect(blocked).toMatchObject({ status: 'blocked', reasonCode: 'BUDGET_LIMIT' });
    expect(blocked.metrics).toMatchObject({ attemptedCollections: 1, consumedLogicalUnits: 1 });
  });

  it('retains the original deadline across interruption and resume downtime', async () => {
    const env = setup('resume-deadline');
    env.plan.limits.maxElapsedMs = 10;
    let current = new Date('2026-10-10T12:00:00.000Z');
    const clock = () => new Date(current);
    const stop = async (point) => {
      if (point === 'before-reservation') throw Object.assign(new Error('stop'), {
        code: 'RESEARCH_CONTROLLED_INTERRUPTION',
      });
    };
    await expect(runResearch({ mode: 'start', ...env, clock, interruptionHook: stop }))
      .rejects.toMatchObject({ code: 'RESEARCH_CONTROLLED_INTERRUPTION' });
    current = new Date('2026-10-10T12:00:01.000Z');
    const result = await runResearch({ mode: 'resume', ...env, clock });
    expect(result).toMatchObject({ status: 'blocked', reasonCode: 'TIME_LIMIT' });
    expect(result.metrics.elapsedMs).toBe(1000);
  });

  it('durably cancels during await and discards a late collector result', async () => {
    const env = setup('cancel-await');
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);
    const result = await runResearch({ mode: 'start', ...env, signal: controller.signal,
      adapterFactory: () => ({ collect: () => new Promise((resolve) => setTimeout(() => resolve({
        observations: [], cursor: null,
      }), 100)) }) });
    expect(result).toMatchObject({ status: 'cancelled', reasonCode: 'CANCELLED' });
    expect(result.metrics.committedCollections).toBe(0);
    expect(result.events.filter((event) => event.type === 'cancelled')).toHaveLength(1);
  });

  it('reserves terminal capacity when the checkpoint limit is exhausted', async () => {
    const env = setup('checkpoint-bound');
    env.plan.limits.maxCheckpointCount = 4;
    fixture(env.inputRoot, 'one.json', []);
    const result = await runResearch({ mode: 'start', ...env });
    expect(result).toMatchObject({ status: 'blocked', reasonCode: 'CHECKPOINT_LIMIT' });
    expect(result.recovery.revision).toBe(4);
    expect(result.events.filter((event) => event.type === 'blocked')).toHaveLength(1);
  });

  it('does not publish collection effects when interrupted immediately before publication', async () => {
    const env = setup('before-publication');
    fixture(env.inputRoot, 'one.json', [publicObservation('https://example.test/one', 'one')]);
    const stop = async (point) => {
      if (point === 'before-collection-publication') throw Object.assign(new Error('stop'), {
        code: 'RESEARCH_CONTROLLED_INTERRUPTION',
      });
    };
    await expect(runResearch({ mode: 'start', ...env, interruptionHook: stop }))
      .rejects.toMatchObject({ code: 'RESEARCH_CONTROLLED_INTERRUPTION' });
    const retained = loadResearch({ runId: env.plan.runId, stateDir: env.stateDir });
    expect(retained.sources).toHaveLength(0);
    expect(retained.metrics.committedCollections).toBe(0);
    expect(fs.readdirSync(env.stateDir).some((name) => name.endsWith('.tmp'))).toBe(false);
    const resumed = await runResearch({ mode: 'resume', ...env });
    expect(resumed.status).toBe('completed');
    expect(resumed.sources).toHaveLength(1);
  });

  it('never persists a secret-bearing locator from a rejected fixture', async () => {
    const env = setup('secret-locator');
    const secret = 'do-not-retain-this-value';
    fixture(env.inputRoot, 'one.json', [
      publicObservation(`https://example.test/one?token=${secret}`, 'content'),
    ]);
    const result = await runResearch({ mode: 'start', ...env });
    expect(result.status).toBe('failed');
    const retained = fs.readdirSync(env.stateDir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => fs.readFileSync(path.join(env.stateDir, name), 'utf8')).join('');
    expect(retained).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain(secret);

    const redacted = setup('redacted-locator');
    redacted.plan.sourcePolicy.secretHandling = 'redact';
    fixture(redacted.inputRoot, 'one.json', [
      publicObservation(`https://example.test/one?token=${secret}`, 'content'),
    ]);
    const accepted = await runResearch({ mode: 'start', ...redacted });
    expect(accepted.status).toBe('completed');
    expect(JSON.stringify(accepted)).not.toContain(secret);
    expect(accepted.sources[0].observations[0].originalLocator).toContain('redacted-');
  });

  it('fails plan drift and keeps committed operations skipped after interruption', async () => {
    const env = setup('committed-skip', [
      { operationId: 'one', fixture: 'one.json' },
      { operationId: 'two', fixture: 'two.json' },
    ]);
    fixture(env.inputRoot, 'one.json', []);
    fixture(env.inputRoot, 'two.json', []);
    let stopped = false;
    const stop = async (point, artifact) => {
      if (!stopped && point === 'after-collection-commit'
        && artifact.recovery.committedOperationIds.includes('one')) {
        stopped = true;
        throw Object.assign(new Error('stop'), { code: 'RESEARCH_CONTROLLED_INTERRUPTION' });
      }
    };
    await expect(runResearch({ mode: 'start', ...env, interruptionHook: stop }))
      .rejects.toMatchObject({ code: 'RESEARCH_CONTROLLED_INTERRUPTION' });
    const calls = [];
    const resumed = await runResearch({ mode: 'resume', ...env,
      adapterFactory: (context) => {
        const collector = createFixtureCollector(context);
        return { collect: async (request) => {
          calls.push(request.operationId);
          return collector.collect(request);
        } };
      } });
    expect(resumed.status).toBe('completed');
    expect(calls).toEqual(['two']);
    const drifted = JSON.parse(JSON.stringify(env.plan));
    drifted.query = 'changed';
    await expect(runResearch({ mode: 'resume', ...env, plan: drifted }))
      .rejects.toMatchObject({ code: 'RESEARCH_PLAN_DRIFT' });
  });
});
