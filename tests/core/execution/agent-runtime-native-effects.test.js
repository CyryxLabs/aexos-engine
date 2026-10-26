'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { AgentRuntime } = require(path.resolve(__dirname, '../../../.aexos-core/core/execution/agent-runtime'));
const { createCapabilityBroker } = require(path.resolve(__dirname, '../../../.aexos-core/core/permissions/capability-broker'));
const { createDispatchGovernance } = require(path.resolve(__dirname, '../../../.aexos-core/core/permissions/dispatch-governance'));
const { createWorkflowControlStore } = require(path.resolve(__dirname, '../../../.aexos-core/core/execution/workflow-control-store'));
const { inspectNativeCandidateIdentity, authorizeNativeCandidateValidation } = require(path.resolve(__dirname,
  '../../../.aexos-core/core/permissions/native-publication-support'));

const nativeDescribe = process.platform === 'win32' && os.release() === '10.0.26300' ? describe : describe.skip;
nativeDescribe('native publication effects survive failed phase finalization', () => {
  let base;
  let root;
  let control;
  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-effects-'));
    root = path.join(base, 'consumer'); const controlRoot = path.join(base, 'control');
    fs.mkdirSync(root); fs.mkdirSync(controlRoot); fs.mkdirSync(path.join(root, '.aexos'));
    fs.writeFileSync(path.join(root, '.aexos/config.yaml'), 'permissions:\n  mode: auto\n');
    fs.writeFileSync(path.join(root, 'mission.md'), '# Story EFFECTS-1\n\n## Status\n\nReady\n');
    control = createWorkflowControlStore(controlRoot, root);
  });
  afterEach(() => {
    if (path.dirname(base) === fs.realpathSync(os.tmpdir()) && path.basename(base).startsWith('aexos-effects-')) fs.rmSync(base, { recursive: true, force: true });
  });

  test.each([
    ['provider exception', 'FILESYSTEM_PROVIDER_FAILED'],
    ['invalid produced artifact', 'FILESYSTEM_PHASE_FINALIZATION_FAILED'],
  ])('%s cannot erase a genuine completed native publication', async (variant, errorCode) => {
    const operation = { operation: 'guarded-create', target: 'result.txt', contentBase64: Buffer.from('durably observed bytes').toString('base64') };
    const broker = createCapabilityBroker({ policy: () => true });
    const governance = createDispatchGovernance();
    const settle = jest.spyOn(governance, 'settle');
    const requirement = { capability: 'filesystem', action: 'guarded-create', resource: path.join(root, operation.target), scope: root };
    const lease = broker.grant({ ...requirement, agentId: 'dev', task: 'publication-evidence', actions: [requirement.action] });
    const nativeValidationAuthorization = authorizeNativeCandidateValidation({ projectRoot: root,
      purpose: 'candidate-validation', expectedIdentity: inspectNativeCandidateIdentity() });
    const instance = new AgentRuntime({ projectRoot: root, capabilityBroker: broker, governanceController: governance,
      nativeValidationAuthorization, trustedReceiptSink: control.retainPreparedReceipt,
      trustedReceiptResolver: control.resolvePreparedReceipt, trustedPublicationAccounting: control.trustedPublicationAccounting,
      provider: { name: 'native-effects-fixture', execute: async (_prompt, options) => {
        const actual = await options.dispatchFilesystem(operation);
        if (actual.success !== true) throw new Error(`Native precondition failed: ${actual.code}`);
        if (variant === 'provider exception') throw new Error('Private provider failure');
        return { success: true, produced: ['not-declared.txt'] };
      } },
    });
    const result = await instance.execute({ agentId: 'dev', task: 'publication-evidence', prompt: 'Publish the approved bounded result.',
      story: 'mission.md', requiresStory: true, budgetScope: `native-effects-${variant}`, budgetCeilingUsd: 1,
      estimatedCostUsd: 0, approvedFilesystemOperations: [operation], requiredCapabilities: [{ ...requirement, token: lease.token }],
      contract: { contractVersion: 1, inputs: [], produces: [{ name: 'result', kind: 'file', path: operation.target }],
        verify: [{ type: 'file-exists', target: operation.target }] },
    });
    expect(result).toMatchObject({ success: false, status: 'failed', error: { code: errorCode },
      filesystemResults: [expect.objectContaining({ success: true, transactionId: expect.any(String), receipt: expect.any(Object) })] });
    expect(fs.readFileSync(path.join(root, operation.target), 'utf8')).toBe('durably observed bytes');
    expect(JSON.stringify(result)).not.toContain('Private provider failure');
    expect(settle).toHaveBeenCalledTimes(1);
  }, 60000);

  test.each(['permission before verification', 'permission during verification', 'authorization during verification'])(
    '%s blocks acceptance while preserving real publication effects', async (variant) => {
      const operation = { operation: 'guarded-create', target: 'result.txt', contentBase64: Buffer.from('observed effect').toString('base64') };
      const broker = createCapabilityBroker({ policy: () => true });
      const governance = createDispatchGovernance();
      const requirement = { capability: 'filesystem', action: 'guarded-create', resource: path.join(root, operation.target), scope: root };
      const lease = broker.grant({ ...requirement, agentId: 'dev', task: 'publication-evidence', actions: [requirement.action] });
      const expires = variant === 'authorization during verification';
      const ttlMs = expires ? 10000 : 60000;
      const nativeValidationAuthorization = authorizeNativeCandidateValidation({ projectRoot: root,
        purpose: 'candidate-validation', expectedIdentity: inspectNativeCandidateIdentity(), ttlMs });
      const authorizationDeadline = Date.now() + ttlMs;
      const revokePermission = () => fs.writeFileSync(path.join(root, '.aexos/config.yaml'), 'permissions:\n  mode: explore\n');
      const verifier = jest.fn(async () => {
        if (variant === 'permission during verification') revokePermission();
        if (expires) await new Promise((resolve) => setTimeout(resolve, Math.max(0, authorizationDeadline - Date.now()) + 100));
        return true;
      });
      const instance = new AgentRuntime({ projectRoot: root, capabilityBroker: broker, governanceController: governance,
        nativeValidationAuthorization, trustedReceiptSink: control.retainPreparedReceipt,
        trustedReceiptResolver: control.resolvePreparedReceipt, trustedPublicationAccounting: control.trustedPublicationAccounting,
        provider: { name: 'native-effects-fixture', execute: async (_prompt, options) => {
          const actual = await options.dispatchFilesystem(operation);
          if (actual.success !== true) throw new Error(`Native precondition failed: ${actual.code}`);
          if (variant === 'permission before verification') revokePermission();
          return { success: true, produced: ['result.txt'] };
        } }, outcomeVerifiers: { checklist: verifier },
      });
      const result = await instance.execute({ agentId: 'dev', task: 'publication-evidence', prompt: 'Publish the approved bounded result.',
        story: 'mission.md', requiresStory: true, requireAcceptance: true,
        budgetScope: `native-authority-${variant}`, budgetCeilingUsd: 1, estimatedCostUsd: 0,
        approvedFilesystemOperations: [operation], requiredCapabilities: [{ ...requirement, token: lease.token }],
        contract: { contractVersion: 1, inputs: [], produces: [{ name: 'result', kind: 'file', path: operation.target }],
          verify: [{ type: 'file-exists', target: operation.target }, { type: 'checklist', ref: 'authority-lifetime' }] },
      });
      const code = expires ? 'VALIDATION_AUTHORIZATION_EXPIRED' : 'PERMISSION_REQUIRED';
      expect(result).toMatchObject({ success: false, status: 'failed', error: { code }, acceptance: { accepted: false, code },
        filesystemResults: [expect.objectContaining({ success: true, transactionId: expect.any(String), receipt: expect.any(Object) })] });
      expect(fs.readFileSync(path.join(root, operation.target), 'utf8')).toBe('observed effect');
      expect(verifier).toHaveBeenCalledTimes(variant === 'permission before verification' ? 0 : 1);
    }, 60000);
});
