'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  DurableMissionRunner,
  MissionStore,
  MISSION_PROTOCOL,
  digest,
  validateMissionPlan,
} = require('../../../.aexos-core/core/execution/durable-mission');
const { PROTOCOL } = require('../../../.aexos-core/core/cerberus/cerberus-contract');

function request(id, operation = 'ingest') {
  return {
    protocol: PROTOCOL,
    requestId: `request-${id}`,
    idempotencyKey: `idempotency-${id}`,
    operation,
    projectId: 'project-one',
    payload: operation === 'ingest' ? {
      source: { id, type: 'txt', sha256: 'a'.repeat(64) },
      document: { encoding: 'utf8', data: `private-material-${id}` },
    } : { text: `query-${id}`, limit: 5 },
  };
}

function plan(steps = [request('one')]) {
  return {
    protocol: MISSION_PROTOCOL,
    missionId: 'mission-one',
    projectId: 'project-one',
    story: { storyId: 'AEX-2.10', path: 'docs/story.md' },
    steps: steps.map((item, index) => ({ stepId: `step-${index + 1}`, request: item })),
  };
}

function receipt(item) {
  return {
    protocol: item.protocol,
    requestId: item.requestId,
    idempotencyHash: digest(item.idempotencyKey),
    operation: item.operation,
    projectIdHash: digest(item.projectId),
    payloadHash: digest(item.payload),
    attemptCount: 1,
    status: 'success',
    provenance: {
      workerVersion: 'fixture-1.0.0',
      sourceHash: 'f'.repeat(64),
      processedAt: '2026-09-04T20:00:00.000Z',
    },
  };
}

describe('Durable AEXOS missions', () => {
  let projectRoot;
  let stateRoot;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-mission-'));
    stateRoot = path.join(projectRoot, '.aexos', 'missions');
    fs.mkdirSync(path.join(projectRoot, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'docs', 'story.md'), '# STORY-AEX-2.10\nStatus: InProgress\n');
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  function runner(executor, store = new MissionStore({ root: stateRoot })) {
    return new DurableMissionRunner({ store, executor, projectRoot });
  }

  it('validates strict mission, story, project and unique request identity', () => {
    expect(validateMissionPlan(plan(), { projectRoot })).toMatchObject({
      protocol: MISSION_PROTOCOL,
      missionId: 'mission-one',
    });
    const duplicate = plan([request('one'), request('one')]);
    expect(() => validateMissionPlan(duplicate, { projectRoot }))
      .toThrow(expect.objectContaining({ code: 'MISSION_REQUEST_IDENTITY_DUPLICATE' }));
    const mismatch = plan();
    mismatch.steps[0].request.projectId = 'other-project';
    expect(() => validateMissionPlan(mismatch, { projectRoot }))
      .toThrow(expect.objectContaining({ code: 'MISSION_PROJECT_MISMATCH' }));
    const escape = plan();
    escape.story.path = '../story.md';
    expect(() => validateMissionPlan(escape, { projectRoot }))
      .toThrow(expect.objectContaining({ code: 'MISSION_STORY_PATH_INVALID' }));
  });

  it('checkpoints success and never dispatches completed steps again', async () => {
    const calls = [];
    const execute = async (item) => {
      calls.push(item.requestId);
      return { receipt: receipt(item) };
    };
    const first = await runner(execute).run(plan([request('one'), request('two')]));
    expect(first.status).toBe('completed');
    expect(first.steps).toHaveLength(2);
    const second = await runner(execute).resume(plan([request('one'), request('two')]));
    expect(second.status).toBe('completed');
    expect(calls).toEqual(['request-one', 'request-two']);
  });

  it('resumes a failed step with the same identity', async () => {
    let fail = true;
    const identities = [];
    const execute = async (item) => {
      identities.push(item.idempotencyKey);
      if (fail) {
        fail = false;
        throw Object.assign(new Error('private failure'), { code: 'CERBERUS_UNAVAILABLE' });
      }
      return { receipt: receipt(item) };
    };
    await expect(runner(execute).run(plan())).resolves.toMatchObject({ status: 'failed' });
    const resumed = await runner(execute).resume(plan());
    expect(resumed).toMatchObject({ status: 'completed', steps: [{ attempts: 2 }] });
    expect(identities).toEqual(['idempotency-one', 'idempotency-one']);
  });

  it('survives crash after side effect without duplicating the effect', async () => {
    const seen = new Set();
    let sideEffects = 0;
    let dispatches = 0;
    const execute = async (item) => {
      dispatches += 1;
      if (!seen.has(item.idempotencyKey)) {
        seen.add(item.idempotencyKey);
        sideEffects += 1;
      }
      return { receipt: receipt(item) };
    };
    const crashingStore = new MissionStore({ root: stateRoot });
    const save = crashingStore.save.bind(crashingStore);
    let crash = true;
    crashingStore.save = (state) => {
      if (crash && state.steps[0].status === 'completed') {
        crash = false;
        throw new Error('simulated process loss before success checkpoint');
      }
      return save(state);
    };
    await expect(runner(execute, crashingStore).run(plan())).rejects.toThrow('simulated process loss');
    expect(new MissionStore({ root: stateRoot }).load('mission-one').steps[0].status).toBe('running');

    const resumed = await runner(execute).resume(plan());
    expect(resumed.status).toBe('completed');
    expect(resumed.steps[0].attempts).toBe(2);
    expect(dispatches).toBe(2);
    expect(sideEffects).toBe(1);
  });

  it('restarts in a fresh process, reclaims the lock and deduplicates replay', () => {
    const fixture = path.resolve(__dirname, '..', '..', 'fixtures', 'durable-mission-process.js');
    const crashed = spawnSync(process.execPath, [fixture, 'crash', projectRoot, stateRoot], {
      encoding: 'utf8',
    });
    expect(crashed.status).toBe(86);
    expect(new MissionStore({ root: stateRoot }).load('restart-mission'))
      .toMatchObject({ status: 'running', steps: [{ status: 'running', attempts: 1 }] });

    const resumed = spawnSync(process.execPath, [fixture, 'resume', projectRoot, stateRoot], {
      encoding: 'utf8',
    });
    if (resumed.status !== 0) throw new Error(resumed.stderr);
    const result = JSON.parse(resumed.stdout);
    expect(result).toMatchObject({
      status: 'completed',
      steps: [{ status: 'completed', attempts: 2 }],
    });
    const state = new MissionStore({ root: stateRoot }).load('restart-mission');
    expect(state.evidence.map((event) => event.type)).toEqual(expect.arrayContaining([
      'lock_reclaimed', 'mission_resumed', 'step_recovered', 'step_completed',
    ]));
    expect(fs.readFileSync(path.join(projectRoot, 'side-effect.marker'), 'utf8').trim())
      .toBe(digest('idempotency-process-restart'));
    expect(fs.readFileSync(path.join(projectRoot, 'dispatch.log'), 'utf8').trim().split(/\r?\n/))
      .toHaveLength(2);
  });

  it('rejects plan drift and tampered latest state', async () => {
    await runner(async (item) => ({ receipt: receipt(item) })).run(plan());
    const drifted = plan();
    drifted.steps[0].request.payload.document.data = 'changed';
    await expect(runner(async () => {}).resume(drifted))
      .rejects.toMatchObject({ code: 'MISSION_PLAN_DRIFT' });

    const checkpointDir = path.join(stateRoot, 'mission-one', 'checkpoints');
    const latest = fs.readdirSync(checkpointDir).sort().at(-1);
    const latestPath = path.join(checkpointDir, latest);
    const state = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
    state.status = 'failed';
    fs.writeFileSync(latestPath, JSON.stringify(state));
    expect(() => new MissionStore({ root: stateRoot }).load('mission-one'))
      .toThrow(expect.objectContaining({ code: 'MISSION_STATE_TAMPERED' }));
  });

  it('fails closed on malformed or oversized durable state', async () => {
    const malformedRoot = path.join(projectRoot, 'malformed');
    const checkpointDir = path.join(malformedRoot, 'mission-one', 'checkpoints');
    fs.mkdirSync(checkpointDir, { recursive: true });
    fs.writeFileSync(
      path.join(checkpointDir, `00000001-${'a'.repeat(64)}.json`),
      '{broken',
    );
    expect(() => new MissionStore({ root: malformedRoot }).load('mission-one'))
      .toThrow(expect.objectContaining({ code: 'MISSION_STATE_INVALID' }));

    const bounded = new MissionStore({ root: path.join(projectRoot, 'bounded'), maxStateBytes: 128 });
    await expect(runner(async (item) => ({ receipt: receipt(item) }), bounded).run(plan()))
      .rejects.toMatchObject({ code: 'MISSION_STATE_TOO_LARGE' });
  });

  it('prevents concurrent owners and reclaims a dead-process lock with evidence', async () => {
    const store = new MissionStore({ root: stateRoot });
    const handle = store.acquireLock('mission-one');
    expect(() => new MissionStore({ root: stateRoot }).acquireLock('mission-one'))
      .toThrow(expect.objectContaining({ code: 'MISSION_LOCKED' }));
    store.releaseLock(handle);

    const dead = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], {
      encoding: 'utf8',
    });
    const missionRoot = path.join(stateRoot, 'mission-one');
    fs.mkdirSync(missionRoot, { recursive: true });
    fs.writeFileSync(path.join(missionRoot, 'mission.lock'), JSON.stringify({
      protocol: MISSION_PROTOCOL,
      missionId: 'mission-one',
      pid: Number(dead.stdout),
      token: 'dead-token',
      acquiredAt: '2026-09-04T20:00:00.000Z',
    }));
    const recoveredStore = new MissionStore({ root: stateRoot });
    const reclaimed = recoveredStore.acquireLock('mission-one');
    expect(reclaimed.reclaimed).toBe(true);
    recoveredStore.releaseLock(reclaimed);
  });

  it('persists only sanitized hashes, receipts and chained evidence', async () => {
    const result = await runner(async (item) => ({ receipt: receipt(item) })).run(plan());
    const checkpointDir = path.join(stateRoot, 'mission-one', 'checkpoints');
    const latest = fs.readFileSync(
      path.join(checkpointDir, fs.readdirSync(checkpointDir).sort().at(-1)),
      'utf8',
    );
    expect(latest).not.toContain('private-material-one');
    expect(latest).not.toContain('idempotency-one');
    expect(latest).not.toContain('private failure');
    expect(result.evidenceHead).toMatch(/^[a-f0-9]{64}$/);
  });
});
