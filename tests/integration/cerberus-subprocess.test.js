'use strict';

const path = require('path');
const {
  createSubprocessTransport,
  minimalProcessEnv,
} = require('../../.aexos-core/core/cerberus/subprocess-transport');
const { PROTOCOL } = require('../../.aexos-core/core/cerberus/cerberus-contract');

const workerPath = path.resolve(__dirname, '..', 'fixtures', 'cerberus-worker.js');
const request = {
  protocol: PROTOCOL, requestId: 'req-subprocess', idempotencyKey: 'idem-subprocess',
  operation: 'ingest', projectId: 'project-one',
  payload: {
    source: { id: 'doc', type: 'txt', sha256: 'd'.repeat(64) },
    document: { encoding: 'utf8', data: 'fixture' },
  },
};

function transport(mode, options = {}) {
  return createSubprocessTransport({
    workerPath,
    env: { ...minimalProcessEnv(), CERBERUS_FIXTURE_MODE: mode },
    ...options,
  });
}

describe('Cerberus subprocess transport', () => {
  it('exchanges one JSON envelope without a shell', async () => {
    await expect(transport('success')(request)).resolves.toMatchObject({
      protocol: PROTOCOL, requestId: request.requestId, status: 'success',
    });
  });

  it.each([
    ['invalid', 'CERBERUS_PROTOCOL_INVALID'],
    ['exit', 'CERBERUS_UNAVAILABLE'],
    ['overflow', 'CERBERUS_OUTPUT_LIMIT'],
  ])('maps %s worker failure to %s', async (mode, code) => {
    await expect(transport(mode, { maxOutputBytes: 512 })(request)).rejects.toMatchObject({ code });
  });

  it('kills the child when cancelled', async () => {
    const controller = new AbortController();
    const pending = transport('hang')(request, { signal: controller.signal });
    setTimeout(() => controller.abort(), 20);
    await expect(pending).rejects.toMatchObject({ code: 'CERBERUS_CANCELLED' });
  });

  it('does not inherit arbitrary provider secrets by default', () => {
    const env = minimalProcessEnv({ PATH: 'safe', OPENAI_API_KEY: 'secret', HOME: 'hidden' });
    expect(env).toEqual({ PATH: 'safe' });
  });

  it('requires an explicit absolute worker path', () => {
    expect(() => createSubprocessTransport({ workerPath: 'relative-worker.js' }))
      .toThrow(expect.objectContaining({ code: 'CERBERUS_WORKER_NOT_FOUND' }));
  });
});
