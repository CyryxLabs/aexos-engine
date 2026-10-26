'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AgentRuntime } = require(path.resolve(__dirname, '../../../.aexos-core/core/execution/agent-runtime'));
const { CapabilityBroker } = require(path.resolve(__dirname, '../../../.aexos-core/core/permissions/capability-broker'));
const { createDispatchGovernance } = require(path.resolve(__dirname, '../../../.aexos-core/core/permissions/dispatch-governance'));

describe('governed provider filesystem phases', () => {
  let root;
  let broker;
  let governance;
  let request;
  const operation = { operation: 'read', target: 'data.txt' };
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-phase-'));
    fs.writeFileSync(path.join(root, 'data.txt'), 'bounded');
    broker = new CapabilityBroker({ policy: () => true });
    governance = createDispatchGovernance({ policy: () => ({ budgetCeilingUsd: 1,
      story: null, scan: { safe: true, threats: [] } }) });
    const identity = { agentId: 'dev', task: 'phase', capability: 'filesystem',
      resource: path.join(root, 'data.txt'), scope: root };
    const lease = broker.grant({ ...identity, actions: ['read'] });
    request = { agentId: 'dev', task: 'phase', prompt: 'approved read', budgetCeilingUsd: 1,
      approvedFilesystemOperations: [operation], requiredCapabilities: [{ ...identity, action: 'read', token: lease.token }] };
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  const runtime = (provider, root, broker, governance) => new AgentRuntime({ provider,
    projectRoot: root, capabilityBroker: broker, governanceController: governance });

  test('real guard read preserves structured result and settles phase once', async () => {
    const settle = jest.spyOn(governance, 'settle');
    const instance = runtime({ execute: async (_prompt, options) => {
      expect(await options.dispatchFilesystem(operation)).toMatchObject({ success: true, data: 'bounded' });
      return { success: true, metadata: { costUsd: 0 } };
    } }, root, broker, governance);
    const result = await instance.execute(request);
    expect(result.filesystemResults).toEqual([expect.objectContaining({ success: true, data: 'bounded' })]);
    expect(settle).toHaveBeenCalledTimes(1);
  });
  test('changed payload is blocked even when provider catches denial', async () => {
    const instance = runtime({ execute: async (_prompt, options) => {
      await expect(options.dispatchFilesystem({ ...operation, contentBase64: 'YQ==' }))
        .rejects.toMatchObject({ code: 'FILESYSTEM_INTENT_MISMATCH' });
      return { success: true };
    } }, root, broker, governance);
    expect(await instance.execute(request)).toMatchObject({ success: false });
  });

  test('provider exception after filesystem activity retains results and settles once', async () => {
    const settle = jest.spyOn(governance, 'settle');
    const instance = runtime({ execute: async (_prompt, options) => {
      await options.dispatchFilesystem(operation);
      throw new Error('Private provider detail must not become evidence');
    } }, root, broker, governance);
    const result = await instance.execute(request);
    expect(result).toMatchObject({ success: false, status: 'failed', error: { code: 'FILESYSTEM_PROVIDER_FAILED' },
      filesystemResults: [expect.objectContaining({ success: true, data: 'bounded' })] });
    expect(JSON.stringify(result)).not.toContain('Private provider detail');
    expect(settle).toHaveBeenCalledTimes(1);
  });

  test('malformed provider result after filesystem activity retains the actual operation', async () => {
    const instance = runtime({ execute: async (_prompt, options) => {
      await options.dispatchFilesystem(operation);
      return { success: true, produced: 'invalid' };
    } }, root, broker, governance);
    expect(await instance.execute(request)).toMatchObject({ success: false,
      error: { code: 'FILESYSTEM_PHASE_FINALIZATION_FAILED' }, filesystemResults: [expect.objectContaining({ success: true })] });
  });

  test('settlement failure cannot erase already observed filesystem results', async () => {
    jest.spyOn(governance, 'settle').mockImplementation(() => { throw new Error('settlement failed'); });
    const instance = runtime({ execute: async (_prompt, options) => {
      await options.dispatchFilesystem(operation);
      return { success: true };
    } }, root, broker, governance);
    expect(await instance.execute(request)).toMatchObject({ success: false,
      error: { code: 'FILESYSTEM_PHASE_SETTLEMENT_FAILED' }, filesystemResults: [expect.objectContaining({ success: true })] });
  });
  test('revoked capability stops guard after provider starts', async () => {
    const instance = runtime({ execute: async (_prompt, options) => {
      broker.revoke(request.requiredCapabilities[0].token);
      await expect(options.dispatchFilesystem(operation)).rejects.toBeDefined();
      return { success: true };
    } }, root, broker, governance);
    expect(await instance.execute(request)).toMatchObject({ success: false });
  });
  test('closure closes after phase and rejects duplicate use', async () => {
    let escaped;
    const instance = runtime({ execute: async (_prompt, options) => {
      escaped = options.dispatchFilesystem;
      await escaped(operation);
      await expect(escaped(operation)).rejects.toMatchObject({ code: 'FILESYSTEM_INTENT_MISMATCH' });
      return { success: true };
    } }, root, broker, governance);
    expect(await instance.execute(request)).toMatchObject({ success: false });
    await expect(escaped(operation)).rejects.toMatchObject({ code: 'FILESYSTEM_PHASE_CLOSED' });
  });
  test('missing exact operation lease cannot reach guard', async () => {
    request.requiredCapabilities = [];
    const instance = runtime({ execute: async (_prompt, options) => {
      await options.dispatchFilesystem(operation);
      return { success: true };
    } }, root, broker, governance);
    const guard = jest.spyOn(instance.operationGuard, 'dispatchFilesystem');
    await expect(instance.execute(request)).rejects.toMatchObject({ code: 'FILESYSTEM_CAPABILITY_REQUIRED' });
    expect(guard).not.toHaveBeenCalled();
  });
  test('capability revoked inside verifier blocks acceptance and preserves structured filesystem results', async () => {
    const instance = new AgentRuntime({ projectRoot: root, capabilityBroker: broker, governanceController: governance,
      provider: { execute: async (_prompt, options) => {
        await options.dispatchFilesystem(operation);
        return { success: true, produced: ['data.txt'] };
      } },
      outcomeVerifiers: { checklist: async () => { broker.revoke(request.requiredCapabilities[0].token); return true; } },
    });
    const result = await instance.execute({ ...request, requireAcceptance: true,
      contract: { contractVersion: 1, inputs: [], produces: [{ name: 'data', kind: 'file', path: 'data.txt' }],
        verify: [{ type: 'checklist', ref: 'trusted-check' }] } });
    expect(result.success).toBe(false);
    expect(result.acceptance).not.toMatchObject({ verdict: 'ACCEPTED' });
    expect(result.filesystemResults).toEqual([expect.objectContaining({ success: true, data: 'bounded' })]);
  });
  test('failed trusted verifier retains operation results for post-effect review', async () => {
    const instance = new AgentRuntime({ projectRoot: root, capabilityBroker: broker, governanceController: governance,
      provider: { execute: async (_prompt, options) => {
        await options.dispatchFilesystem(operation);
        return { success: true, produced: ['data.txt'] };
      } }, outcomeVerifiers: { checklist: async () => false },
    });
    const result = await instance.execute({ ...request, requireAcceptance: true,
      contract: { contractVersion: 1, inputs: [], produces: [{ name: 'data', kind: 'file', path: 'data.txt' }],
        verify: [{ type: 'checklist', ref: 'trusted-check' }] } });
    expect(result).toMatchObject({ success: false, acceptance: { verdict: 'REJECTED' },
      filesystemResults: [expect.objectContaining({ success: true })] });
  });
});
