'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  AgentRuntime,
  AgentRuntimeError,
  assertRuntime,
  createLegacyRuntime,
  hashIntent,
} = require('../../../.aexos-core/core/execution/agent-runtime');
const {
  createDispatchGovernance,
} = require('../../../.aexos-core/core/permissions/dispatch-governance');

describe('AgentRuntime', () => {
  let projectRoot;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-agent-runtime-'));
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('requires an executable provider and runtime interface', () => {
    expect(() => new AgentRuntime()).toThrow(expect.objectContaining({
      code: 'AGENT_RUNTIME_PROVIDER_REQUIRED',
    }));
    expect(() => assertRuntime(null)).toThrow(expect.objectContaining({
      code: 'AGENT_RUNTIME_REQUIRED',
    }));
    expect(assertRuntime({ execute: async () => ({}) })).toBeTruthy();
  });

  it('runs governance before the provider and records prompt-free evidence', async () => {
    const order = [];
    const evidence = [];
    const provider = {
      name: 'test-provider',
      execute: jest.fn(async () => {
        order.push('provider');
        return { success: true, output: 'done', metadata: { tokens: 12, model: 'fixture' } };
      }),
    };
    const runtime = new AgentRuntime({
      provider,
      projectRoot,
      clock: () => new Date('2026-09-04T12:00:00.000Z'),
      governance: (request) => {
        order.push('governance');
        expect(request.intent).toBe('safe private prompt');
        return { budgetCeilingUsd: 2, story: null, scan: { safe: true, threats: [] } };
      },
      evidenceSink: (record) => evidence.push(record),
    });

    const result = await runtime.execute({
      agentId: 'analyst',
      task: 'analyze',
      prompt: 'safe private prompt',
      budgetCeilingUsd: 2,
    });

    expect(order).toEqual(['governance', 'provider']);
    expect(result).toMatchObject({
      success: true,
      status: 'success',
      output: 'done',
      usage: { tokens: 12, model: 'fixture' },
      evidence: { provider: 'test-provider' },
    });
    expect(evidence[0]).toMatchObject({
      type: 'governance_approved',
      issuedAt: '2026-09-04T12:00:00.000Z',
    });
    expect(JSON.stringify(evidence)).not.toContain('safe private prompt');
  });

  it('records a rejection and never invokes the provider', async () => {
    const evidence = [];
    const provider = { execute: jest.fn() };
    const rejection = new AgentRuntimeError('BLOCKED', 'blocked');
    const runtime = new AgentRuntime({
      provider,
      projectRoot,
      governance: () => { throw rejection; },
      evidenceSink: (record) => evidence.push(record),
    });

    await expect(runtime.execute({
      agentId: 'dev',
      task: 'implement',
      prompt: 'unsafe',
      budgetCeilingUsd: 2,
    })).rejects.toBe(rejection);
    expect(provider.execute).not.toHaveBeenCalled();
    expect(evidence[0]).toMatchObject({ type: 'governance_rejected', code: 'BLOCKED' });
  });

  it('validates produced paths before returning success', async () => {
    const provider = {
      execute: async () => ({ success: true, produced: ['docs/result.md'] }),
    };
    const runtime = new AgentRuntime({
      provider,
      projectRoot,
      governance: () => ({ budgetCeilingUsd: 1, story: null, scan: { safe: true } }),
    });
    const contract = {
      contractVersion: 1,
      inputs: [],
      produces: [{ name: 'report', kind: 'report', path: 'docs/{name}.md' }],
      verify: [{ type: 'file-exists', target: 'docs/{name}.md' }],
    };

    await expect(runtime.execute({
      agentId: 'qa',
      task: 'review',
      prompt: 'review',
      budgetCeilingUsd: 1,
      contract,
    })).resolves.toMatchObject({ produced: ['docs/result.md'] });

    provider.execute = async () => ({ success: true, produced: ['secrets.txt'] });
    await expect(runtime.execute({
      agentId: 'qa',
      task: 'review',
      prompt: 'review',
      budgetCeilingUsd: 1,
      contract,
    })).rejects.toMatchObject({ code: 'TASK_OUTPUT_UNDECLARED' });
  });

  it('rejects malformed requests and provider results', async () => {
    const runtime = new AgentRuntime({
      provider: { execute: async () => ({ output: 'missing success' }) },
      governance: () => ({ budgetCeilingUsd: 1, story: null, scan: { safe: true } }),
    });

    await expect(runtime.execute({ task: 'analyze', prompt: 'x' }))
      .rejects.toMatchObject({ code: 'AGENT_RUNTIME_REQUEST_INVALID' });
    await expect(runtime.execute({ agentId: 'analyst', task: 'analyze', prompt: 'x' }))
      .rejects.toMatchObject({ code: 'AGENT_RUNTIME_RESULT_INVALID' });
  });

  it('hashes the complete dispatch identity deterministically', () => {
    const base = { agentId: 'dev', task: 'implement', prompt: 'x', story: 'AEX-1.2' };
    expect(hashIntent(base)).toBe(hashIntent({ ...base }));
    expect(hashIntent(base)).not.toBe(hashIntent({ ...base, prompt: 'y' }));
  });

  it('adapts a legacy policy function without bypassing token verification', () => {
    const runtime = new AgentRuntime({
      provider: { execute: async () => ({ success: true }) },
      governance: () => ({ budgetCeilingUsd: 1, story: null, scan: { safe: true } }),
      governanceTokenSecret: 'l'.repeat(32),
    });

    expect(runtime.capabilities()).toMatchObject({
      governed: true,
      signedDispatchTokens: true,
      legacyPolicyAdapter: true,
    });
  });

  it('keeps the deprecated dispatch callback behind the governed runtime', async () => {
    const dispatchSubagent = jest.fn(async () => ({ status: 'success' }));
    const runtime = createLegacyRuntime(dispatchSubagent, {
      projectRoot,
      governanceTokenSecret: 'd'.repeat(32),
    });
    const request = {
      agentId: 'analyst',
      task: 'analyze',
      prompt: 'Analyze the approved material',
      projectRoot,
    };

    await expect(runtime.execute(request))
      .rejects.toMatchObject({ code: 'DISPATCH_BUDGET_REQUIRED' });
    expect(dispatchSubagent).not.toHaveBeenCalled();

    await expect(runtime.execute({ ...request, budgetCeilingUsd: 1 }))
      .resolves.toMatchObject({ success: true, status: 'success' });
    expect(dispatchSubagent).toHaveBeenCalledTimes(1);
    expect(runtime.capabilities()).toMatchObject({
      governed: true,
      signedDispatchTokens: true,
      legacyDispatchAdapter: true,
    });
  });

  it('blocks a request changed between evaluation and verification', async () => {
    const provider = { execute: jest.fn() };
    const delegate = createDispatchGovernance({
      tokenSecret: 'm'.repeat(32),
      policy: () => ({ budgetCeilingUsd: 1, story: null, scan: { safe: true } }),
    });
    const governanceController = {
      evaluate: (request) => {
        const decision = delegate.evaluate(request);
        request.intent = 'mutated after approval';
        return decision;
      },
      verify: (...args) => delegate.verify(...args),
      settle: (...args) => delegate.settle(...args),
      capabilities: () => delegate.capabilities(),
    };
    const evidence = [];
    const runtime = new AgentRuntime({
      provider,
      governanceController,
      evidenceSink: (record) => evidence.push(record),
      projectRoot,
    });

    await expect(runtime.execute({
      agentId: 'analyst',
      task: 'analyze',
      prompt: 'approved prompt',
      budgetCeilingUsd: 1,
    })).rejects.toMatchObject({ code: 'DISPATCH_TOKEN_INTENT_MISMATCH' });
    expect(provider.execute).not.toHaveBeenCalled();
    expect(evidence).toEqual([
      expect.objectContaining({
        type: 'governance_rejected',
        code: 'DISPATCH_TOKEN_INTENT_MISMATCH',
      }),
    ]);
  });

  it('settles provider cost and blocks the next call after the scope reaches 100%', async () => {
    const governanceController = createDispatchGovernance({
      tokenSecret: 'c'.repeat(32),
      policy: (request) => ({
        budgetCeilingUsd: Number(request.budgetCeilingUsd),
        story: null,
        scan: { safe: true, threats: [] },
      }),
    });
    const provider = {
      execute: jest.fn(async (_prompt, options) => ({
        success: true,
        metadata: { costUsd: options.jsonOutput === 'second' ? 0.4 : 0.6 },
      })),
    };
    const runtime = new AgentRuntime({ provider, governanceController, projectRoot });
    const base = {
      agentId: 'analyst',
      task: 'analyze',
      prompt: 'budgeted work',
      budgetCeilingUsd: 1,
      budgetScope: 'runtime-budget',
    };

    await runtime.execute({ ...base, estimatedCostUsd: 0.6, jsonOutput: 'first' });
    await runtime.execute({ ...base, estimatedCostUsd: 0.4, jsonOutput: 'second' });
    await expect(runtime.execute({ ...base, estimatedCostUsd: 0 }))
      .rejects.toMatchObject({ code: 'DISPATCH_BUDGET_EXHAUSTED' });
    expect(provider.execute).toHaveBeenCalledTimes(2);
    expect(governanceController.getBudgetState('runtime-budget')).toMatchObject({
      spentUsd: 1,
      reservedUsd: 0,
      pressure: 1,
    });
  });

  it('does not call the provider or retain budget when approval evidence cannot be recorded', async () => {
    const governanceController = createDispatchGovernance({
      tokenSecret: 'r'.repeat(32),
      policy: (request) => ({
        budgetCeilingUsd: Number(request.budgetCeilingUsd),
        story: null,
        scan: { safe: true, threats: [] },
      }),
    });
    const provider = { execute: jest.fn() };
    const runtime = new AgentRuntime({
      provider,
      governanceController,
      projectRoot,
      evidenceSink: () => { throw new Error('evidence store unavailable'); },
    });

    await expect(runtime.execute({
      agentId: 'analyst',
      task: 'analyze',
      prompt: 'budgeted work',
      budgetCeilingUsd: 1,
      budgetScope: 'runtime-evidence-failure',
      estimatedCostUsd: 0.4,
    })).rejects.toThrow('evidence store unavailable');
    expect(provider.execute).not.toHaveBeenCalled();
    expect(governanceController.getBudgetState('runtime-evidence-failure')).toMatchObject({
      spentUsd: 0,
      reservedUsd: 0,
    });
  });
});
