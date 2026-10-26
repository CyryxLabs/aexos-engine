'use strict';

const {
  AgentRuntime,
} = require('../../../.aexos-core/core/execution/agent-runtime');
const {
  createCapabilityBroker,
} = require('../../../.aexos-core/core/permissions/capability-broker');
const {
  createDispatchGovernance,
} = require('../../../.aexos-core/core/permissions/dispatch-governance');

describe('AgentRuntime capability boundary', () => {
  const root = process.cwd();
  const base = {
    agentId: 'cerberus-gateway',
    task: 'knowledge-query',
    prompt: 'Query the governed knowledge index',
    budgetCeilingUsd: 1,
    budgetScope: 'runtime-capability-test',
  };
  const identity = {
    agentId: base.agentId,
    task: base.task,
    capability: 'cerberus.api',
    resource: 'tenant/acme/index/main',
    scope: 'mission-AEX-2.9',
  };

  function governance() {
    return createDispatchGovernance({
      tokenSecret: 'g'.repeat(32),
      policy: (request) => ({
        budgetCeilingUsd: Number(request.budgetCeilingUsd),
        story: null,
        scan: { safe: true, threats: [] },
      }),
    });
  }

  function broker() {
    return createCapabilityBroker({
      signingSecret: 'c'.repeat(32),
      randomId: () => 'runtime-lease',
      policy: () => true,
    });
  }

  it('verifies capability after governance and before provider execution', async () => {
    const order = [];
    const evidence = [];
    const capabilityBroker = broker();
    const originalVerify = capabilityBroker.verify.bind(capabilityBroker);
    capabilityBroker.verify = (...args) => {
      order.push('capability');
      return originalVerify(...args);
    };
    const lease = capabilityBroker.grant({ ...identity, actions: ['query'] });
    const provider = {
      execute: jest.fn(async (_prompt, options) => {
        order.push('provider');
        expect(options.request.requiredCapabilities[0]).not.toHaveProperty('token');
        expect(options.request.requiredCapabilities[0]).not.toHaveProperty('resource');
        return { success: true, output: 'result' };
      }),
    };
    const governanceController = governance();
    const originalEvaluate = governanceController.evaluate.bind(governanceController);
    governanceController.evaluate = (...args) => {
      order.push('governance');
      return originalEvaluate(...args);
    };
    const runtime = new AgentRuntime({
      provider,
      projectRoot: root,
      governanceController,
      capabilityBroker,
      evidenceSink: (record) => evidence.push(record),
    });

    const result = await runtime.execute({
      ...base,
      requiredCapabilities: [{ ...identity, action: 'query', token: lease.token }],
    });

    expect(order).toEqual(['governance', 'capability', 'provider']);
    expect(result.evidence.capabilities[0]).toMatchObject({
      capability: 'cerberus.api',
      status: 'active',
    });
    expect(JSON.stringify({ result, evidence })).not.toContain(lease.token);
    expect(JSON.stringify({ result, evidence })).not.toContain(identity.resource);
    expect(runtime.capabilities()).toMatchObject({ capabilityLeases: true });
  });

  it('blocks provider execution when the broker is missing', async () => {
    const provider = { execute: jest.fn() };
    const runtime = new AgentRuntime({ provider, governanceController: governance() });

    await expect(runtime.execute({
      ...base,
      requiredCapabilities: [{ ...identity, action: 'query', token: 'unusable' }],
    })).rejects.toMatchObject({ code: 'AGENT_RUNTIME_CAPABILITY_BROKER_REQUIRED' });
    expect(provider.execute).not.toHaveBeenCalled();
  });

  it('blocks invalid action and releases the dispatch budget reservation', async () => {
    const provider = { execute: jest.fn() };
    const capabilityBroker = broker();
    const lease = capabilityBroker.grant({ ...identity, actions: ['query'] });
    const governanceController = governance();
    const runtime = new AgentRuntime({ provider, governanceController, capabilityBroker });

    await expect(runtime.execute({
      ...base,
      estimatedCostUsd: 0.4,
      requiredCapabilities: [{ ...identity, action: 'ingest', token: lease.token }],
    })).rejects.toMatchObject({ code: 'CAPABILITY_ACTION_DENIED' });
    expect(provider.execute).not.toHaveBeenCalled();
    expect(governanceController.getBudgetState(base.budgetScope)).toMatchObject({
      spentUsd: 0,
      reservedUsd: 0,
    });
  });

  it('binds the governance decision to the declared lease token', () => {
    const capabilityBroker = broker();
    const lease = capabilityBroker.grant({ ...identity, actions: ['query'] });
    const first = governance().evaluate({
      ...base,
      intent: base.prompt,
      requiredCapabilities: [{ ...identity, action: 'query', token: lease.token }],
    });
    const claims = JSON.parse(Buffer.from(first.token.split('.')[0], 'base64url').toString('utf8'));
    expect(JSON.stringify(claims)).not.toContain(lease.token);
  });
});

