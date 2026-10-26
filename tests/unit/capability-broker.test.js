'use strict';

const {
  CapabilityBrokerError,
  createCapabilityBroker,
} = require('../../.aexos-core/core/permissions/capability-broker');

describe('CapabilityBroker', () => {
  let nowMs;
  let request;

  beforeEach(() => {
    nowMs = Date.parse('2026-09-04T21:00:00.000Z');
    request = {
      agentId: 'cerberus-gateway',
      task: 'knowledge-query',
      capability: 'cerberus.api',
      actions: ['query', 'secret:read'],
      resource: 'tenant/acme/index/main',
      scope: 'mission-AEX-2.9',
      ttlMs: 1_000,
    };
  });

  function broker(options = {}) {
    return createCapabilityBroker({
      signingSecret: 'k'.repeat(32),
      clock: () => nowMs,
      randomId: () => 'lease-001',
      policy: () => true,
      ...options,
    });
  }

  it('denies by default and issues no lease', () => {
    const deny = createCapabilityBroker({ signingSecret: 'd'.repeat(32) });
    expect(() => deny.grant(request)).toThrow(expect.objectContaining({
      code: 'CAPABILITY_DENIED',
    }));
    expect(deny.list()).toEqual([]);

    const privateDenial = broker({
      policy: () => ({ allowed: false, code: 'INTERNAL_POLICY_CODE', reason: 'private rule' }),
    });
    expect(() => privateDenial.grant(request)).toThrow(expect.objectContaining({
      code: 'CAPABILITY_DENIED',
      message: expect.not.stringContaining('private rule'),
    }));
  });

  it('issues a signed lease with normalized actions and no raw resource', () => {
    const lease = broker().grant({ ...request, actions: ['QUERY', 'query', 'secret:read'] });
    const claims = JSON.parse(Buffer.from(lease.token.split('.')[0], 'base64url').toString('utf8'));

    expect(lease.actions).toEqual(['query', 'secret:read']);
    expect(lease.token).toMatch(/^[^.]+\.[^.]+$/);
    expect(claims.resourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(claims)).not.toContain(request.resource);
    expect(JSON.stringify(claims)).not.toContain(request.scope);
    expect(JSON.stringify(claims)).not.toContain('k'.repeat(32));
  });

  it('uses the most restrictive valid TTL from caller and policy', () => {
    const instance = broker({ policy: () => ({ allowed: true, ttlMs: 250 }) });
    const lease = instance.grant({ ...request, ttlMs: 1_000 });
    expect(Date.parse(lease.expiresAt) - Date.parse(lease.issuedAt)).toBe(250);
  });

  it('verifies the exact identity and least-privilege action', () => {
    const instance = broker();
    const lease = instance.grant(request);
    const use = {
      agentId: request.agentId,
      task: request.task,
      capability: request.capability,
      action: 'query',
      resource: request.resource,
      scope: request.scope,
    };

    expect(instance.verify(lease.token, use)).toMatchObject({
      leaseId: 'lease-001',
      capability: 'cerberus.api',
      status: 'active',
    });
    expect(() => instance.verify(lease.token, { ...use, action: 'ingest' }))
      .toThrow(expect.objectContaining({ code: 'CAPABILITY_ACTION_DENIED' }));
    expect(() => instance.verify(lease.token, { ...use, resource: 'tenant/other' }))
      .toThrow(expect.objectContaining({ code: 'CAPABILITY_IDENTITY_MISMATCH' }));
    expect(() => instance.verify(lease.token, { ...use, agentId: 'other-agent' }))
      .toThrow(expect.objectContaining({ code: 'CAPABILITY_IDENTITY_MISMATCH' }));
  });

  it('rejects missing, malformed and tampered tokens', () => {
    const instance = broker();
    const lease = instance.grant(request);
    const use = { ...request, action: 'query' };
    const [payload, signature] = lease.token.split('.');

    expect(() => instance.verify(null, use))
      .toThrow(expect.objectContaining({ code: 'CAPABILITY_TOKEN_REQUIRED' }));
    expect(() => instance.verify('malformed', use))
      .toThrow(expect.objectContaining({ code: 'CAPABILITY_TOKEN_INVALID' }));
    expect(() => instance.verify(`${payload}.${signature.slice(0, -1)}x`, use))
      .toThrow(expect.objectContaining({ code: 'CAPABILITY_TOKEN_INVALID' }));
  });

  it('expires and immediately revokes active leases', () => {
    const instance = broker();
    const first = instance.grant(request);
    expect(instance.revoke(first.token, 'operator request')).toMatchObject({ status: 'revoked' });
    expect(() => instance.verify(first.token, { ...request, action: 'query' }))
      .toThrow(expect.objectContaining({ code: 'CAPABILITY_REVOKED' }));

    const secondInstance = broker({ randomId: () => 'lease-002' });
    const second = secondInstance.grant(request);
    nowMs += 1_001;
    expect(() => secondInstance.verify(second.token, { ...request, action: 'query' }))
      .toThrow(expect.objectContaining({ code: 'CAPABILITY_EXPIRED' }));
  });

  it('inspects and lists only sanitized lease metadata', () => {
    const instance = broker();
    const lease = instance.grant(request);
    const inspected = instance.inspect(lease.token);
    const listed = instance.list();

    expect(inspected).toEqual(listed[0]);
    expect(JSON.stringify({ inspected, listed })).not.toContain(lease.token);
    expect(JSON.stringify({ inspected, listed })).not.toContain(request.resource);
    expect(JSON.stringify({ inspected, listed })).not.toContain(request.scope);
  });

  it('fails closed and rolls back a grant when audit persistence fails', () => {
    const instance = broker({ auditSink: () => { throw new Error('audit offline'); } });
    expect(() => instance.grant(request)).toThrow(expect.objectContaining({
      code: 'CAPABILITY_AUDIT_FAILED',
    }));
    expect(instance.list()).toEqual([]);
  });

  it('resolves a secret only after verification and never emits its value', async () => {
    const records = [];
    const secretResolver = jest.fn(async () => 'super-secret-value');
    const instance = broker({
      auditSink: (record) => records.push(record),
      secretResolver,
    });
    const lease = instance.grant(request);
    const use = {
      agentId: request.agentId,
      task: request.task,
      capability: request.capability,
      resource: request.resource,
      scope: request.scope,
    };

    await expect(instance.useSecret(
      lease.token,
      use,
      'cerberus/api-key',
      async (secret) => `used:${secret.length}`,
    )).resolves.toBe('used:18');
    expect(secretResolver).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(records)).not.toContain('super-secret-value');
    expect(JSON.stringify(records)).not.toContain('cerberus/api-key');

    await expect(instance.useSecret(
      lease.token,
      use,
      'cerberus/api-key',
      async (secret) => secret,
    )).rejects.toMatchObject({ code: 'CAPABILITY_SECRET_EXFILTRATION' });
  });

  it('does not resolve a secret when secret:read is not granted', async () => {
    const secretResolver = jest.fn();
    const instance = broker({ secretResolver });
    const lease = instance.grant({ ...request, actions: ['query'] });

    await expect(instance.useSecret(
      lease.token,
      {
        agentId: request.agentId,
        task: request.task,
        capability: request.capability,
        resource: request.resource,
        scope: request.scope,
      },
      'cerberus/api-key',
      async () => 'never',
    )).rejects.toMatchObject({ code: 'CAPABILITY_ACTION_DENIED' });
    expect(secretResolver).not.toHaveBeenCalled();
  });

  it('normalizes resolver and secret-backed operation failures without leaking details', async () => {
    const resolverFailure = broker({
      secretResolver: async () => { throw new Error('provider leaked super-secret-value'); },
    });
    const resolverLease = resolverFailure.grant(request);
    const use = {
      agentId: request.agentId,
      task: request.task,
      capability: request.capability,
      resource: request.resource,
      scope: request.scope,
    };

    await expect(resolverFailure.useSecret(
      resolverLease.token,
      use,
      'cerberus/api-key',
      async () => 'never',
    )).rejects.toMatchObject({
      code: 'CAPABILITY_SECRET_RESOLUTION_FAILED',
      message: expect.not.stringContaining('super-secret-value'),
    });

    const operationFailure = broker({
      randomId: () => 'lease-operation-failure',
      secretResolver: async () => 'super-secret-value',
    });
    const operationLease = operationFailure.grant(request);
    await expect(operationFailure.useSecret(
      operationLease.token,
      use,
      'cerberus/api-key',
      async () => { throw new Error('operation leaked super-secret-value'); },
    )).rejects.toMatchObject({
      code: 'CAPABILITY_SECRET_OPERATION_FAILED',
      message: expect.not.stringContaining('super-secret-value'),
    });
  });

  it('validates broker construction and request fields with stable errors', () => {
    expect(() => createCapabilityBroker({ signingSecret: 'short' }))
      .toThrow(expect.objectContaining({ code: 'CAPABILITY_SIGNING_SECRET_INVALID' }));
    expect(() => broker().grant({ ...request, resource: '' }))
      .toThrow(expect.objectContaining({ code: 'CAPABILITY_REQUEST_INVALID' }));
    expect(new CapabilityBrokerError('X', 'x')).toBeInstanceOf(Error);
  });
});
