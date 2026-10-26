'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  DEFAULT_LIMITS,
  citationIdentity,
  loadResearch,
  runResearch,
} = require('../../../.aexos-core/core/research');

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-lineage-'));
  const stateDir = path.join(root, 'state');
  const inputRoot = path.join(root, 'input');
  fs.mkdirSync(stateDir);
  fs.mkdirSync(inputRoot);
  return { root, stateDir, inputRoot };
}

function writeFixture(root, name, observations) {
  fs.writeFileSync(path.join(root, name), JSON.stringify({ observations }));
}

function minimalPlan(runId, operations, claims = []) {
  return {
    schemaVersion: 'aexos.research-plan/v1', runId, query: 'lineage', profile: 'fixture-local',
    sourcePolicy: { allowedAccessClasses: ['public'], privateHandling: 'exclude',
      secretHandling: 'reject', normalizationVersion: 'utf8-crlf-v1' },
    provider: { adapterId: 'fixture-local', version: '1.0.0', kind: 'fixture',
      identityStatus: 'exposed', reportedEngine: null, verification: 'unverified' },
    operations, claims, comparisons: [], uncertainty: [], openQuestions: [],
    limits: { ...DEFAULT_LIMITS, maxCheckpointCount: 60,
      budget: { unit: 'collection-attempt', maximum: 20 } },
  };
}

describe('research identity and recovery', () => {
  it('preserves same-content dedupe and A to B to A locator lineage', async () => {
    const env = setup();
    const at = (minute) => `2026-10-10T12:0${minute}:00.000Z`;
    writeFixture(env.inputRoot, 'one.json', [
      { locator: 'https://example.test/item#first', accessClass: 'public', availability: 'available',
        retrievedAt: at(0), content: 'A' },
      { locator: 'https://mirror.test/item', accessClass: 'public', availability: 'available',
        retrievedAt: at(1), content: 'A' },
    ]);
    writeFixture(env.inputRoot, 'two.json', [
      { locator: 'https://example.test/item#second', accessClass: 'public', availability: 'available',
        retrievedAt: at(2), content: 'B' },
    ]);
    writeFixture(env.inputRoot, 'three.json', [
      { locator: 'https://example.test/item#third', accessClass: 'public', availability: 'available',
        retrievedAt: at(3), content: 'A' },
    ]);
    const result = await runResearch({ mode: 'start', ...env,
      plan: minimalPlan('lineage-run', [
        { operationId: 'one', fixture: 'one.json' },
        { operationId: 'two', fixture: 'two.json' },
        { operationId: 'three', fixture: 'three.json' },
      ]) });
    expect(result.status).toBe('completed');
    expect(result.metrics.uniqueVersions).toBe(2);
    const a = result.sources.find((source) => source.contentHash === citationIdentity('A').contentHash);
    const b = result.sources.find((source) => source.contentHash === citationIdentity('B').contentHash);
    expect(a.observations).toHaveLength(3);
    expect(b.observations[0].previousCitationId).toBe(a.citationId);
    expect(a.observations.at(-1).previousCitationId).toBe(b.citationId);
  });

  it('resumes after a durable reservation and after a committed operation without duplicate calls', async () => {
    const env = setup();
    writeFixture(env.inputRoot, 'one.json', [{
      locator: 'https://example.test/recovery', accessClass: 'public', availability: 'available',
      retrievedAt: '2026-10-10T12:00:00Z', content: 'Recovery evidence',
    }]);
    const p = minimalPlan('recovery-run', [{ operationId: 'one', fixture: 'one.json' }]);
    const interrupt = async (point) => {
      if (point === 'after-reservation') throw Object.assign(new Error('stop'), {
        code: 'RESEARCH_CONTROLLED_INTERRUPTION',
      });
    };
    await expect(runResearch({ mode: 'start', plan: p, ...env, interruptionHook: interrupt }))
      .rejects.toMatchObject({ code: 'RESEARCH_CONTROLLED_INTERRUPTION' });
    const reserved = loadResearch({ runId: p.runId, stateDir: env.stateDir });
    expect(reserved.metrics.attemptedCollections).toBe(1);
    let calls = 0;
    const adapterFactory = (context) => {
      const { createFixtureCollector } = require('../../../.aexos-core/core/research');
      const fixture = createFixtureCollector(context);
      return { collect: async (request) => { calls += 1; return fixture.collect(request); } };
    };
    const completed = await runResearch({ mode: 'resume', plan: p, ...env, adapterFactory });
    expect(completed.status).toBe('completed');
    expect(completed.metrics.attemptedCollections).toBe(2);
    expect(calls).toBe(1);
    expect(completed.sources[0].observations).toHaveLength(1);
    const again = await runResearch({ mode: 'resume', plan: p, ...env, adapterFactory });
    expect(again.events).toEqual(completed.events);
    expect(calls).toBe(1);
  });

  it('blocks zero budget, unavailable provider, and late timeout resolution', async () => {
    const zero = setup();
    const zeroPlan = minimalPlan('zero-budget', [{ operationId: 'one', fixture: 'unused.json' }]);
    zeroPlan.limits.budget.maximum = 0;
    const budget = await runResearch({ mode: 'start', plan: zeroPlan, ...zero });
    expect(budget).toMatchObject({ status: 'blocked', reasonCode: 'BUDGET_LIMIT' });

    const unavailable = setup();
    const unavailablePlan = minimalPlan('unavailable-provider', [{ operationId: 'one', fixture: 'unused.json' }]);
    unavailablePlan.provider.kind = 'unavailable';
    const blocked = await runResearch({ mode: 'start', plan: unavailablePlan, ...unavailable });
    expect(blocked).toMatchObject({ status: 'blocked', reasonCode: 'PROVIDER_UNAVAILABLE' });

    const timed = setup();
    const timedPlan = minimalPlan('timeout-run', [{ operationId: 'one', fixture: 'unused.json' }]);
    timedPlan.limits.maxElapsedMs = 20;
    const timeout = await runResearch({ mode: 'start', plan: timedPlan, ...timed,
      adapterFactory: () => ({ collect: () => new Promise((resolve) => setTimeout(() => resolve({
        observations: [], cursor: null,
      }), 80)) }) });
    expect(timeout).toMatchObject({ status: 'blocked', reasonCode: 'TIME_LIMIT' });
    expect(timeout.metrics.committedCollections).toBe(0);
  });

  it('fails closed on a corrupt committed checkpoint', async () => {
    const env = setup();
    writeFixture(env.inputRoot, 'one.json', []);
    const p = minimalPlan('corrupt-run', [{ operationId: 'one', fixture: 'one.json' }]);
    await runResearch({ mode: 'start', plan: p, ...env });
    const files = fs.readdirSync(env.stateDir).filter((name) => name.endsWith('.json')).sort();
    fs.appendFileSync(path.join(env.stateDir, files.at(-1)), 'corrupt');
    expect(() => loadResearch({ runId: p.runId, stateDir: env.stateDir }))
      .toThrow(expect.objectContaining({ code: 'RESEARCH_CHECKPOINT_CORRUPT' }));
  });
});
