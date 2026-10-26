'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { AgentRuntime } = require('../../../.aexos-core/core/execution/agent-runtime');
const { createDispatchGovernance } = require('../../../.aexos-core/core/permissions/dispatch-governance');
const { createCapabilityBroker } = require('../../../.aexos-core/core/permissions/capability-broker');

describe('single-operation terminal authority preserves observed effect evidence', () => {
  let root;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-terminal-effects-'));
    fs.writeFileSync(path.join(root, 'story.md'), '# Story AEX-4.28\n\n## Status\n\nReady\n');
  });
  afterEach(() => {
    if (path.dirname(root) === fs.realpathSync(os.tmpdir()) && path.basename(root).startsWith('aexos-terminal-effects-')) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test.each(['valid', 'expired', 'revoked'].flatMap((authority) => [false, true].map((success) => [authority, success])))(
    'authority=%s and native success=%s preserve exact dispatch diagnostics and settle once',
    async (authority, nativeSuccess) => {
      let now = Date.now();
      const governance = createDispatchGovernance({ clock: () => new Date(now) });
      const settle = jest.spyOn(governance, 'settle');
      const broker = createCapabilityBroker({ policy: () => true });
      const requirement = { capability: 'filesystem', action: 'guarded-create',
        resource: path.join(root, 'target.bin'), scope: root };
      const lease = broker.grant({ ...requirement, agentId: 'dev', task: 'native', actions: ['guarded-create'] });
      const runtime = new AgentRuntime({ projectRoot: root, governanceController: governance,
        capabilityBroker: broker, provider: { execute: jest.fn() } });
      // Synthetic dispatch only; actual native timeout/create are tested separately.
      const nativeResult = { success: nativeSuccess, code: nativeSuccess ? 'OK' : 'NATIVE_INTERRUPTED',
        phase: nativeSuccess ? 'VERIFIED' : 'RECOVERY_REQUIRED', transactionId: 'unit-transaction',
        effects: { transactionArtifactsMayExist: true, destinationMayExist: true },
        receipt: { preparedReceipt: { transactionId: 'unit-transaction' } }, productionEnabled: false };
      const dispatch = jest.spyOn(runtime.operationGuard, 'dispatchFilesystem').mockImplementation(async () => {
        if (authority === 'expired') now += 30_001;
        if (authority === 'revoked') broker.revoke(lease.token);
        return structuredClone(nativeResult);
      });
      const result = await runtime.execute({ agentId: 'dev', task: 'native', prompt: 'Observe terminal effect evidence.',
        story: 'story.md', requiresStory: true, budgetCeilingUsd: 1, estimatedCostUsd: 0,
        filesystemOperation: { operation: 'guarded-create', target: 'target.bin', contentBase64: 'eA==' },
        requiredCapabilities: [{ ...requirement, token: lease.token }] });
      expect(result.success).toBe(authority === 'valid' && nativeSuccess);
      expect(result.filesystemResult).toEqual(nativeResult);
      if (authority === 'expired') expect(result.error.code).toBe('DISPATCH_TOKEN_EXPIRED');
      else if (authority === 'revoked') expect(result.error.code).toBe('CAPABILITY_REVOKED');
      else if (!nativeSuccess) expect(result.error.code).toBe('NATIVE_INTERRUPTED');
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(runtime.provider.execute).not.toHaveBeenCalled();
      expect(settle).toHaveBeenCalledTimes(1);
      expect(settle.mock.results[0].value.reservedUsd).toBe(0);
      expect(settle.mock.calls[0][1]).toBe(0);
    });
});
