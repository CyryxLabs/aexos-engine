'use strict';

const fs = require('fs');
const path = require('path');
const {
  DurableMissionRunner,
  MissionStore,
  MISSION_PROTOCOL,
  digest,
} = require('../../.aexos-core/core/execution/durable-mission');
const { PROTOCOL } = require('../../.aexos-core/core/cerberus/cerberus-contract');

const [mode, projectRoot, stateRoot] = process.argv.slice(2);
const marker = path.join(projectRoot, 'side-effect.marker');
const dispatchLog = path.join(projectRoot, 'dispatch.log');
const storyPath = path.join(projectRoot, 'story.md');
const request = {
  protocol: PROTOCOL,
  requestId: 'request-process-restart',
  idempotencyKey: 'idempotency-process-restart',
  operation: 'ingest',
  projectId: 'project-one',
  payload: {
    source: { id: 'restart', type: 'txt', sha256: 'b'.repeat(64) },
    document: { encoding: 'utf8', data: 'private restart material' },
  },
};
const plan = {
  protocol: MISSION_PROTOCOL,
  missionId: 'restart-mission',
  projectId: 'project-one',
  story: { storyId: 'AEX-2.10', path: 'story.md' },
  steps: [{ stepId: 'restart-step', request }],
};

if (!fs.existsSync(storyPath)) {
  fs.writeFileSync(storyPath, '# STORY-AEX-2.10\nStatus: InProgress\n');
}

const store = new MissionStore({ root: stateRoot });
if (mode === 'crash') {
  const save = store.save.bind(store);
  store.save = (state) => {
    if (state.steps[0].status === 'completed') process.exit(86);
    return save(state);
  };
}

const executor = async (item) => {
  fs.appendFileSync(dispatchLog, `${digest(item.idempotencyKey)}\n`, 'utf8');
  if (!fs.existsSync(marker)) {
    fs.writeFileSync(marker, `${digest(item.idempotencyKey)}\n`, { encoding: 'utf8', flag: 'wx' });
  }
  return {
    receipt: {
      protocol: item.protocol,
      requestId: item.requestId,
      idempotencyHash: digest(item.idempotencyKey),
      operation: item.operation,
      projectIdHash: digest(item.projectId),
      payloadHash: digest(item.payload),
      attemptCount: 1,
      status: 'success',
      provenance: {
        workerVersion: 'restart-fixture-1.0.0',
        sourceHash: 'f'.repeat(64),
        processedAt: '2026-09-04T20:00:00.000Z',
      },
    },
  };
};

const runner = new DurableMissionRunner({ store, executor, projectRoot });
Promise.resolve(mode === 'crash' ? runner.run(plan) : runner.resume(plan))
  .then((result) => process.stdout.write(JSON.stringify(result)))
  .catch((error) => {
    process.stderr.write(`[${error.code || 'ERROR'}] ${error.message}`);
    process.exitCode = 1;
  });
