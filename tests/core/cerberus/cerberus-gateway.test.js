'use strict';

const { CapabilityBroker } = require('../../../.aexos-core/core/permissions/capability-broker');
const {
  CerberusGateway,
  CerberusGatewayError,
} = require('../../../.aexos-core/core/cerberus/cerberus-gateway');
const { PROTOCOL } = require('../../../.aexos-core/core/cerberus/cerberus-contract');

const identity = { agentId: 'cerberus-agent', task: 'ingest-doc', resource: 'worker://fixture' };

function request(operation = 'ingest') {
  return {
    protocol: PROTOCOL, requestId: 'req-gateway', idempotencyKey: 'idem-gateway',
    operation, projectId: 'project-one',
    payload: operation === 'ingest' ? {
      source: { id: 'doc', type: 'txt', sha256: 'b'.repeat(64) },
      document: { encoding: 'utf8', data: 'PRIVATE FIXTURE CONTENT' },
    } : { text: 'query', limit: 3 },
  };
}

function success(input) {
  return {
    protocol: PROTOCOL, requestId: input.requestId, operation: input.operation,
    status: 'success', data: { accepted: true },
    provenance: { workerVersion: '1.0.0', sourceHash: 'c'.repeat(64), processedAt: '2026-09-04T00:00:00Z' },
  };
}

function setup(operation = 'ingest') {
  const broker = new CapabilityBroker({ policy: () => true, signingSecret: 'x'.repeat(32) });
  const lease = broker.grant({
    ...identity, capability: 'cerberus.knowledge', actions: [operation],
    scope: 'project-one',
  });
  return { broker, lease };
}

describe('CerberusGateway', () => {
  it('verifies capability before transport and emits a sanitized provenance receipt', async () => {
    const { broker, lease } = setup();
    const transport = jest.fn(async (input) => success(input));
    const records = [];
    const result = await new CerberusGateway({
      capabilityBroker: broker, transport, auditSink: (record) => records.push(record),
    }).execute({ request: request(), identity, capabilityToken: lease.token });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(result.receipt).toMatchObject({ attemptCount: 1, status: 'success' });
    expect(JSON.stringify({ result, records })).not.toContain('PRIVATE FIXTURE CONTENT');
    expect(JSON.stringify({ result, records })).not.toContain(lease.token);
  });

  it('fails capability mismatch before transport starts', async () => {
    const { broker, lease } = setup();
    const transport = jest.fn();
    await expect(new CerberusGateway({ capabilityBroker: broker, transport }).execute({
      request: request(), identity: { ...identity, resource: 'worker://other' }, capabilityToken: lease.token,
    })).rejects.toMatchObject({ code: 'CAPABILITY_IDENTITY_MISMATCH' });
    expect(transport).not.toHaveBeenCalled();
  });

  it('retries only transient failures with the same request identity', async () => {
    const { broker, lease } = setup();
    const seen = [];
    const transport = jest.fn(async (input) => {
      seen.push([input.requestId, input.idempotencyKey]);
      if (seen.length === 1) {
        throw new CerberusGatewayError('CERBERUS_UNAVAILABLE', 'unavailable');
      }
      return success(input);
    });
    const result = await new CerberusGateway({
      capabilityBroker: broker, transport, maxRetries: 1,
    }).execute({ request: request(), identity, capabilityToken: lease.token });
    expect(result.receipt.attemptCount).toBe(2);
    expect(new Set(seen.map(JSON.stringify))).toHaveProperty('size', 1);
  });

  it('does not retry non-transient protocol failures', async () => {
    const { broker, lease } = setup();
    const transport = jest.fn(async () => ({ bad: true }));
    await expect(new CerberusGateway({
      capabilityBroker: broker, transport, maxRetries: 3,
    }).execute({ request: request(), identity, capabilityToken: lease.token }))
      .rejects.toMatchObject({ code: 'CERBERUS_CORRELATION_MISMATCH' });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('bounds response output for every transport implementation', async () => {
    const { broker, lease } = setup();
    const transport = async (input) => ({
      ...success(input),
      data: { value: 'x'.repeat(2048) },
    });
    await expect(new CerberusGateway({
      capabilityBroker: broker, transport, maxResponseBytes: 512,
    }).execute({ request: request(), identity, capabilityToken: lease.token }))
      .rejects.toMatchObject({ code: 'CERBERUS_OUTPUT_LIMIT' });
  });

  it('enforces timeout and external cancellation', async () => {
    const timeoutSetup = setup();
    const never = (_input, context) => new Promise((resolve, reject) => {
      context.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
    await expect(new CerberusGateway({
      capabilityBroker: timeoutSetup.broker, transport: never, timeoutMs: 10, maxRetries: 0,
    }).execute({ request: request(), identity, capabilityToken: timeoutSetup.lease.token }))
      .rejects.toMatchObject({ code: 'CERBERUS_TIMEOUT' });

    const cancelSetup = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(new CerberusGateway({
      capabilityBroker: cancelSetup.broker, transport: never,
    }).execute({
      request: request(), identity, capabilityToken: cancelSetup.lease.token, signal: controller.signal,
    })).rejects.toMatchObject({ code: 'CERBERUS_CANCELLED' });
  });

  it('fails closed when receipt persistence fails', async () => {
    const { broker, lease } = setup();
    await expect(new CerberusGateway({
      capabilityBroker: broker,
      transport: async (input) => success(input),
      auditSink: () => { throw new Error('disk detail'); },
    }).execute({ request: request(), identity, capabilityToken: lease.token }))
      .rejects.toMatchObject({ code: 'CERBERUS_AUDIT_FAILED' });
  });
});
