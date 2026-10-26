'use strict';

const fs = require('fs');
const {
  recoverResearch,
  runResearch,
} = require('../../../.aexos-core/core/research');

async function main() {
  const request = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  if (request.action === 'hold-lock') {
    const store = require('../../../.aexos-core/core/research')
      .createResearchStore(request.stateDir);
    const lock = request.protocol === 'v1'
      ? store.acquire(request.runId)
      : await store.acquireRecoverable(request.runId);
    process.send?.({ type: 'ready', protocol: request.protocol, runId: request.runId });
    await new Promise((resolve) => process.once('message', resolve));
    await store.release(lock);
    process.send?.({ type: 'released', runId: request.runId });
    return;
  }
  if (request.action === 'recover') {
    try {
      const result = await recoverResearch(request.options);
      process.send?.({ type: 'result', result });
    } catch (error) {
      process.send?.({ type: 'error', code: error.code });
    }
    return;
  }
  await runResearch({
    ...request.options,
    interruptionHook: async (point, artifact) => {
      if (point !== request.pauseAt) return;
      process.send?.({ type: 'ready', point, artifact });
      await new Promise(() => {});
    },
  });
}

main().catch((error) => {
  process.send?.({ type: 'error', code: error.code || 'COLLECTION_FAILED' });
  process.exitCode = 1;
});
