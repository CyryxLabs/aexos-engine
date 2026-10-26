'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const sop = require('../../../.aexos-core/core/workflow-engineering/sop');
const { AgentRuntime } = require('../../../.aexos-core/core/execution/agent-runtime');
const { bindContract, createExecutionBinding, operationHash, selectedTask, sha256 } = require('../../../.aexos-core/core/execution/execution-binding');
const { createWorkflowControlStore } = require('../../../.aexos-core/core/execution/workflow-control-store');
const { requirementsFor, runGovernedWorkflow } = require('../../../.aexos-core/core/execution/workflow-runner');
const { createCapabilityBroker } = require('../../../.aexos-core/core/permissions/capability-broker');
const { createLocalPlanFixture } = require('../../helpers/local-plan-fixture');
const { testHost } = require('./sop-test-host');

const frameworkRoot = path.resolve(__dirname, '../../..');
const supportedNative = process.platform === 'win32' && os.release() === '10.0.26300';

function mappedOutput(output) { return { ...output, kind: output.kind === 'story' ? 'file' : output.kind }; }
function evidenceArtifact(output) { return { id: output.name, kind: output.kind === 'story' ? 'file' : output.kind, path: output.path }; }

function selectedContract(root, fixture, projectId) {
  const evidenceObligations = [];
  const steps = sop.PHASES.map((selected, phaseIndex) => {
    const phase = fixture.run.phases[phaseIndex];
    const task = selectedTask(selected.taskId, frameworkRoot, root);
    const contract = bindContract(task.contract, phase.inputs, root);
    const obligationIds = contract.produces.map((output, outputIndex) => {
      const id = `${selected.phaseId}-output-${outputIndex}`;
      const targeted = contract.verify.filter((check) => check.target === output.path);
      const general = outputIndex === 0 ? contract.verify.filter((check) => !check.target
        || !contract.produces.some((item) => item.path === check.target)) : [];
      const requiredChecks = [...targeted, ...general];
      evidenceObligations.push({ id, description: `Observed ${output.name} with its actual checks.`, required: true,
        stepId: selected.phaseId, artifact: evidenceArtifact(output), requiredChecks,
        requiredOrigin: 'runtime', maxAgeMs: 86400000 });
      return id;
    });
    return { id: selected.phaseId, name: selected.phaseId, instructions: `Execute ${selected.taskId}.`,
      owner: selected.owner, kind: 'deterministic', dependsOn: [...selected.dependsOn],
      systems: ['aexos-governed-runtime'],
      capabilities: phase.operations.map((operation) => `approved-operation:${operationHash(operation)}`),
      inputs: contract.inputs, outputs: contract.produces.map(mappedOutput), verify: contract.verify,
      evidenceObligationIds: obligationIds, sideEffects: true, approvalRequired: false };
  });
  return { protocol: 'aexos.sop/v1', sopId: 'selected-sdlc-fixture', version: 1, lifecycleState: 'Draft',
    title: 'Selected SDLC fixture', purpose: 'Bind the six existing selected SDLC phases to actual runtime evidence.',
    ownerRole: 'operator', authors: ['author'], scope: { included: ['Selected SDLC fixture'], excluded: ['Production host admission'], projectId },
    actors: ['author', 'operator', 'reviewer', 'approver', 'activator', 'sm', 'po', 'architect', 'dev', 'qa']
      .map((id) => ({ id, name: id, type: 'role' })),
    systems: [{ id: 'aexos-governed-runtime', name: 'AEXOS governed runtime', type: 'application' }],
    inputs: [], outputs: [{ id: 'selected-sdlc-result', description: 'Accepted selected SDLC artifacts', required: true }],
    preconditions: [], steps, branches: [], exceptions: [],
    approvals: [
      { id: 'review', stage: 'review', roleId: 'reviewer', independent: true, prohibitedRoleIds: ['author', 'operator'] },
      { id: 'approve', stage: 'approve', roleId: 'approver', independent: true, prohibitedRoleIds: ['author', 'operator'] },
      { id: 'activate', stage: 'activate', roleId: 'activator', independent: true, prohibitedRoleIds: ['author', 'operator'] },
      { id: 'deprecate', stage: 'deprecate', roleId: 'activator', independent: true, prohibitedRoleIds: ['author', 'operator'] },
    ], evidenceObligations,
    conformance: { maxReceiptAgeMs: 31536000000, allowSkips: false, allowedSkipApprovalIds: [],
      requireRealOrigin: true, requiredEnvironment: 'fixture-win' },
    lifecyclePolicy: { maxReviewAgeMs: 86400000 } };
}

describe('selected SOP runtime association', () => {
  let base; let root; let controlRoot; let lifecycleRoot; let fixture; let lifecycleHost;
  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-sop-runtime-'));
    root = path.join(base, 'consumer'); controlRoot = path.join(base, 'control'); lifecycleRoot = path.join(base, 'lifecycle');
    fs.mkdirSync(root); fs.mkdirSync(controlRoot); fs.mkdirSync(lifecycleRoot);
    fixture = createLocalPlanFixture(root);
  });
  afterEach(() => {
    lifecycleHost?.cleanup(); lifecycleHost = null;
    if (base && path.dirname(base) === fs.realpathSync(os.tmpdir()) && path.basename(base).startsWith('aexos-sop-runtime-')) {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  async function effective(contract = selectedContract(root, fixture, `project-${sha256(fs.realpathSync(root)).slice(0, 32)}`)) {
    const projectId = contract.scope.projectId;
    lifecycleHost = testHost({ root: lifecycleRoot, projectId,
      resolveOwner: () => ({ subjectId: 'owner-subject', roleId: 'operator', projectId }) });
    return lifecycleHost.advance(contract);
  }

  async function controller(contract) {
    const snapshot = await effective(contract);
    const controlStore = createWorkflowControlStore(controlRoot, root);
    return { snapshot, controlStore, association: sop.createSelectedSopRuntimeAssociation({ snapshot,
      projectRoot: root, controlStore, hostInstanceId: 'fixture-host', policyRevision: 'fixture-policy-v1',
      environmentId: 'fixture-win', producerSubjectId: 'host-agent:fixture:runtime' }) };
  }

  function nativeAuthorization() {
    const { inspectNativeCandidateIdentity, authorizeNativeCandidateValidation } = require(
      '../../../.aexos-core/core/permissions/native-publication-support');
    return authorizeNativeCandidateValidation({ projectRoot: root, purpose: 'candidate-validation',
      expectedIdentity: inspectNativeCandidateIdentity() });
  }

  function manualBindings() {
    const phaseMap = new Map(fixture.run.phases.map((phase) => [phase.id, phase]));
    const broker = createCapabilityBroker({ policy: () => true });
    const bindings = sop.PHASES.map((phase) => {
      const plan = phaseMap.get(phase.phaseId); const task = selectedTask(phase.taskId, frameworkRoot, root);
      const requiredCapabilities = requirementsFor(plan, root, phaseMap);
      const leases = requiredCapabilities.map((requirement) => broker.grant({ ...requirement,
        agentId: phase.owner, task: phase.taskId, actions: [requirement.action], ttlMs: 300000 }));
      return createExecutionBinding({ bindingVersion: 1, phaseId: phase.phaseId, task: phase.taskId,
        agentId: phase.owner, projectRoot: root, story: fixture.run.story, taskContractHash: task.taskContractHash,
        inputs: plan.inputs, requiredCapabilities, budgetScope: 'association-fixture', budgetCeilingUsd: 1,
        estimatedCostUsd: 0, requireAcceptance: true }, { projectRoot: root, frameworkRoot,
        capabilityBroker: broker, leases, approvedFilesystemOperations: plan.operations });
    });
    return { phaseMap, broker, bindings };
  }

  async function preparedManual(association, runId = 'manual-run') {
    const built = manualBindings();
    const plan = await sop.prepareSelectedSopRun(association, { runId, projectId: 'runner-project',
      runHash: 'a'.repeat(64), policyHash: 'b'.repeat(64), storyHash: 'c'.repeat(64),
      workflowHash: 'd'.repeat(64), startedAt: new Date().toISOString() }, built.bindings);
    return { ...built, plan };
  }

  async function executeFirst({ controlStore, prepared, settle = () => {}, checklist = async () => true,
    skip = () => false }) {
    const { phaseMap, broker, bindings, plan } = prepared;
    const first = bindings[0]; const firstPlan = phaseMap.get(first.phaseId);
    const governance = { evaluate: () => ({ token: 'token', story: { storyId: 'FIXTURE-1' } }),
      verify: () => ({}), revalidate: () => ({}), settle };
    const runtime = new AgentRuntime({ projectRoot: root, capabilityBroker: broker, governanceController: governance,
      nativeValidationAuthorization: nativeAuthorization(), sopRuntimeHooks: sop.createSopRuntimeHooks(plan),
      trustedReceiptSink: controlStore.retainPreparedReceipt,
      trustedReceiptResolver: controlStore.resolvePreparedReceipt,
      trustedPublicationAccounting: controlStore.trustedPublicationAccounting,
      provider: { name: 'actual-fixture-provider', execute: async (_prompt, options) => {
        const produced = [];
        for (const operation of firstPlan.operations) {
          if (skip(operation)) continue;
          const result = await options.dispatchFilesystem(operation);
          if (result.success && operation.operation !== 'read') produced.push(operation.target);
        }
        return { success: true, produced, metadata: { costUsd: 0, model: null } };
      } }, outcomeVerifiers: { checklist } });
    const result = await runtime.execute({ phaseId: first.phaseId, story: first.story, contract: first.contract,
      agentId: first.agentId, task: first.task, projectRoot: root, requiredCapabilities: first.requiredCapabilities,
      approvedFilesystemOperations: first.approvedFilesystemOperations, budgetScope: first.budgetScope,
      budgetCeilingUsd: first.budgetCeilingUsd, estimatedCostUsd: 0, requireAcceptance: true,
      requiresStory: true, prompt: 'Execute retained association fixture.' });
    return { result, first, firstPlan };
  }

  function run(association, extra = {}) {
    return runGovernedWorkflow({ ...fixture, projectRoot: root, controlRoot, frameworkRoot,
      executor: 'local-plan', sopRuntimeAssociation: association,
      ...(supportedNative ? { nativeValidationAuthorization: nativeAuthorization() } : {}), ...extra });
  }

  const nativeTest = supportedNative ? test : test.skip;
  nativeTest('retains pending dispatches before effects and actual terminal artifacts after accepted settlement', async () => {
    const { snapshot, controlStore, association } = await controller();
    const receipt = await run(association);
    expect(receipt.status).toBe('ACCEPTED');
    const retained = await sop.inspectSelectedSopRun(association, receipt.correlation.runId);
    expect(retained.dispatches).toHaveLength(6); expect(retained.outcomes).toHaveLength(6);
    expect(retained.ineligibleOutcomeHashes).toEqual([]);
    for (const [index, dispatch] of retained.dispatches.entries()) {
      const outcome = retained.outcomes.find((item) => item.associationId === dispatch.associationId);
      expect(Date.parse(dispatch.admittedAt)).toBeLessThanOrEqual(Date.parse(outcome.terminalAt));
      expect(dispatch.stepId).toBe(sop.PHASES[index].phaseId);
      expect(dispatch.taskId).toBe(sop.PHASES[index].taskId);
      expect(outcome.status).toBe('completed');
      for (const artifact of outcome.artifacts) {
        expect(artifact.hash).toBe(sha256(fs.readFileSync(path.join(root, artifact.path))));
      }
    }
    const runRef = receipt.sopAssociation.run;
    const result = await sop.auditConformance(snapshot, runRef,
      (query) => sop.resolveSelectedSopRun(association, query), { projectRoot: root });
    expect(result).toMatchObject({ status: 'fixture-conformance', scope: { oneRun: true, environmentId: 'fixture-win' } });
    expect(result.steps).toHaveLength(6);
    await expect(controlStore.retainSopOutcome(retained.outcomes[0]))
      .rejects.toMatchObject({ code: 'SOP_ASSOCIATION_ISSUER_REQUIRED' });
  }, 120000);

  nativeTest('preserves observed effects and blocks conformance when terminal retention fails', async () => {
    const { controlStore, association } = await controller();
    const retain = controlStore.retainSopOutcome;
    controlStore.retainSopOutcome = async () => { throw Object.assign(new Error('fixture retention fault'), { code: 'FIXTURE_RETENTION_FAILED' }); };
    const receipt = await run(association);
    expect(receipt.status).toBe('BLOCKED');
    expect(receipt.errorCode).toBe('WORKFLOW_PHASE_EXECUTION_FAILED');
    expect(fs.existsSync(path.join(root, 'create-story.json'))).toBe(true);
    const retained = await sop.inspectSelectedSopRun(association, receipt.correlation.runId);
    expect(retained.dispatches).toHaveLength(1); expect(retained.outcomes).toHaveLength(0);
    controlStore.retainSopOutcome = retain;
  }, 120000);

  nativeTest('rejects provider effects when the lifecycle head changes after pending admission', async () => {
    const contract = selectedContract(root, fixture, `project-${sha256(fs.realpathSync(root)).slice(0, 32)}`);
    const { controlStore, association } = await controller(contract);
    const retain = controlStore.retainSopDispatch;
    controlStore.retainSopDispatch = async (record, issuer) => {
      const result = await retain(record, issuer);
      await lifecycleHost.act('deprecate', contract, {}, {
        subjectId: 'deprecator-subject', dispatchId: 'deprecate-distinct-dispatch',
      });
      return result;
    };
    const receipt = await run(association);
    expect(receipt.status).toBe('BLOCKED');
    expect(fixture.run.phases[0].operations.some((operation) => operation.operation !== 'read'
      && fs.existsSync(path.join(root, operation.target)))).toBe(false);
    await expect(sop.inspectSelectedSopRun(association, receipt.correlation.runId))
      .rejects.toMatchObject({ code: 'SOP_SNAPSHOT_STALE' });
  }, 120000);

  nativeTest('settlement failure is terminal, retains real effects, and cannot conform', async () => {
    const contract = selectedContract(root, fixture, `project-${sha256(fs.realpathSync(root)).slice(0, 32)}`);
    const { snapshot, controlStore, association } = await controller(contract);
    const phaseMap = new Map(fixture.run.phases.map((phase) => [phase.id, phase]));
    const broker = createCapabilityBroker({ policy: () => true });
    const bindings = sop.PHASES.map((phase) => {
      const plan = phaseMap.get(phase.phaseId); const task = selectedTask(phase.taskId, frameworkRoot, root);
      const requiredCapabilities = requirementsFor(plan, root, phaseMap);
      const leases = requiredCapabilities.map((requirement) => broker.grant({ ...requirement,
        agentId: phase.owner, task: phase.taskId, actions: [requirement.action], ttlMs: 300000 }));
      return createExecutionBinding({ bindingVersion: 1, phaseId: phase.phaseId, task: phase.taskId,
        agentId: phase.owner, projectRoot: root, story: fixture.run.story, taskContractHash: task.taskContractHash,
        inputs: plan.inputs, requiredCapabilities, budgetScope: 'settlement-fixture', budgetCeilingUsd: 1,
        estimatedCostUsd: 0, requireAcceptance: true }, { projectRoot: root, frameworkRoot,
        capabilityBroker: broker, leases, approvedFilesystemOperations: plan.operations });
    });
    const startedAt = new Date().toISOString();
    const plan = await sop.prepareSelectedSopRun(association, { runId: 'settlement-run', projectId: 'runner-project',
      runHash: 'a'.repeat(64), policyHash: 'b'.repeat(64), storyHash: 'c'.repeat(64),
      workflowHash: 'd'.repeat(64), startedAt }, bindings);
    const first = bindings[0]; const firstPlan = phaseMap.get(first.phaseId);
    const governance = { evaluate: () => ({ token: 'token', story: { storyId: 'FIXTURE-1' } }),
      verify: () => ({}), revalidate: () => ({}), settle: () => { throw Object.assign(new Error('settlement failed'), { code: 'SETTLEMENT_FAILED' }); } };
    const runtime = new AgentRuntime({ projectRoot: root, capabilityBroker: broker, governanceController: governance,
      nativeValidationAuthorization: nativeAuthorization(), sopRuntimeHooks: sop.createSopRuntimeHooks(plan),
      trustedReceiptSink: controlStore.retainPreparedReceipt,
      trustedReceiptResolver: controlStore.resolvePreparedReceipt,
      trustedPublicationAccounting: controlStore.trustedPublicationAccounting,
      provider: { name: 'actual-fixture-provider', execute: async (_prompt, options) => {
        const produced = [];
        for (const operation of firstPlan.operations) {
          const result = await options.dispatchFilesystem(operation);
          if (result.success && operation.operation !== 'read') produced.push(operation.target);
        }
        return { success: true, produced, metadata: { costUsd: 0, model: null } };
      } }, outcomeVerifiers: { checklist: async () => true } });
    const result = await runtime.execute({ phaseId: first.phaseId, story: first.story, contract: first.contract,
      agentId: first.agentId, task: first.task, projectRoot: root, requiredCapabilities: first.requiredCapabilities,
      approvedFilesystemOperations: first.approvedFilesystemOperations, budgetScope: first.budgetScope,
      budgetCeilingUsd: first.budgetCeilingUsd, estimatedCostUsd: 0, requireAcceptance: true,
      requiresStory: true, prompt: 'Execute retained settlement fixture.' });
    expect(result).toMatchObject({ success: false, error: { code: 'SOP_ASSOCIATION_SETTLEMENT_FAILED' } });
    expect(first.contract.produces.some((output) => fs.existsSync(path.join(root, output.path)))).toBe(true);
    const retained = await sop.inspectSelectedSopRun(association, 'settlement-run');
    expect(retained.outcomes[0]).toMatchObject({ status: 'failed', code: 'SOP_ASSOCIATION_SETTLEMENT_FAILED', effectsObserved: true });
    const conformance = await sop.auditConformance(snapshot, plan.run,
      (query) => sop.resolveSelectedSopRun(association, query), { projectRoot: root });
    expect(conformance.status).toBe('nonconformant');
  }, 120000);

  test('requires live branded execution bindings at preparation', async () => {
    const { association } = await controller();
    const bindings = sop.PHASES.map((phase, index) => {
      const selected = selectedTask(phase.taskId, frameworkRoot, root);
      const contract = bindContract(selected.contract, fixture.run.phases[index].inputs, root);
      return { phaseId: phase.phaseId, task: phase.taskId, agentId: phase.owner,
        taskContractHash: selected.taskContractHash, resolvedContractHash: sha256(JSON.stringify(contract)),
        approvedOperationHashes: fixture.run.phases[index].operations.map(operationHash), contract };
    });
    await expect(sop.prepareSelectedSopRun(association, { runId: 'unbranded-run', projectId: 'runner-project',
      runHash: 'a'.repeat(64), policyHash: 'b'.repeat(64), storyHash: 'c'.repeat(64),
      workflowHash: 'd'.repeat(64), startedAt: new Date().toISOString() }, bindings))
      .rejects.toMatchObject({ code: 'BINDING_UNTRUSTED' });
  });

  test('revalidates Effective authority after run retention await', async () => {
    const contract = selectedContract(root, fixture, `project-${sha256(fs.realpathSync(root)).slice(0, 32)}`);
    const { controlStore, association } = await controller(contract);
    const retain = controlStore.retainSopRun;
    controlStore.retainSopRun = async (record, issuer) => {
      const retained = await retain(record, issuer);
      await lifecycleHost.act('deprecate', contract, {}, { subjectId: 'run-retention-revoker', dispatchId: 'run-retention-revoke' });
      return retained;
    };
    const { bindings } = manualBindings();
    await expect(sop.prepareSelectedSopRun(association, { runId: 'revoked-run', projectId: 'runner-project',
      runHash: 'a'.repeat(64), policyHash: 'b'.repeat(64), storyHash: 'c'.repeat(64),
      workflowHash: 'd'.repeat(64), startedAt: new Date().toISOString() }, bindings))
      .rejects.toMatchObject({ code: 'SOP_SNAPSHOT_STALE' });
  });

  test('revalidates execution-binding leases after run retention await', async () => {
    const { controlStore, association } = await controller();
    const built = manualBindings();
    const retain = controlStore.retainSopRun;
    controlStore.retainSopRun = async (record, issuer) => {
      const retained = await retain(record, issuer);
      built.broker.revoke(built.bindings[0].requiredCapabilities[0].token, 'preparation retention revocation');
      return retained;
    };
    await expect(sop.prepareSelectedSopRun(association, { runId: 'preparation-lease-revocation-run', projectId: 'runner-project',
      runHash: 'a'.repeat(64), policyHash: 'b'.repeat(64), storyHash: 'c'.repeat(64),
      workflowHash: 'd'.repeat(64), startedAt: new Date().toISOString() }, built.bindings))
      .rejects.toMatchObject({ code: 'CAPABILITY_REVOKED' });
  });

  nativeTest('rejects settlement-time byte mutation instead of rebinding passed checks', async () => {
    const { snapshot, controlStore, association } = await controller();
    const prepared = await preparedManual(association, 'mutation-run');
    const output = prepared.bindings[0].contract.produces[0].path;
    const { result } = await executeFirst({ controlStore, prepared,
      settle: () => fs.writeFileSync(path.join(root, output), 'TAMPERED AFTER ACCEPTANCE') });
    expect(result).toMatchObject({ success: false, error: { code: 'SOP_ASSOCIATION_OUTCOME_REJECTED' } });
    const retained = await sop.inspectSelectedSopRun(association, 'mutation-run');
    expect(retained.outcomes[0]).toMatchObject({ status: 'failed', effectsObserved: true });
    const conformance = await sop.auditConformance(snapshot, prepared.plan.run,
      (query) => sop.resolveSelectedSopRun(association, query), { projectRoot: root });
    expect(conformance.status).toBe('nonconformant');
  }, 120000);

  nativeTest('requires every approved operation instance to finalize for selected SOP success', async () => {
    fixture.run.phases[0].operations.push({ operation: 'read', target: 'mission.md' });
    const { snapshot, controlStore, association } = await controller();
    const prepared = await preparedManual(association, 'incomplete-operation-run');
    const { result } = await executeFirst({ controlStore, prepared, skip: (operation) => operation.operation === 'read' });
    expect(result).toMatchObject({ success: false, error: { code: 'SOP_ASSOCIATION_OPERATIONS_INCOMPLETE' } });
    const retained = await sop.inspectSelectedSopRun(association, 'incomplete-operation-run');
    expect(retained.outcomes[0]).toMatchObject({ status: 'failed', effectsObserved: true });
    const conformance = await sop.auditConformance(snapshot, prepared.plan.run,
      (query) => sop.resolveSelectedSopRun(association, query), { projectRoot: root });
    expect(conformance.status).toBe('nonconformant');
  }, 120000);

  nativeTest('revalidates lifecycle authority after an awaited verifier', async () => {
    const contract = selectedContract(root, fixture, `project-${sha256(fs.realpathSync(root)).slice(0, 32)}`);
    const { controlStore, association } = await controller(contract);
    const prepared = await preparedManual(association, 'verifier-revocation-run');
    let revoked = false;
    const { result } = await executeFirst({ controlStore, prepared, checklist: async () => {
      if (!revoked) {
        revoked = true;
        await lifecycleHost.act('deprecate', contract, {}, { subjectId: 'verifier-revoker', dispatchId: 'verifier-revoke' });
      }
      return true;
    } });
    expect(result.success).toBe(false);
    expect(result.error.code).toMatch(/SOP_|FILESYSTEM_/);
  }, 120000);

  nativeTest('cannot return terminal success when authority changes during outcome retention', async () => {
    const contract = selectedContract(root, fixture, `project-${sha256(fs.realpathSync(root)).slice(0, 32)}`);
    const { controlStore, association } = await controller(contract);
    const prepared = await preparedManual(association, 'terminal-retention-revocation-run');
    const retain = controlStore.retainSopOutcome;
    controlStore.retainSopOutcome = async (record, issuer) => {
      const retained = await retain(record, issuer);
      await lifecycleHost.act('deprecate', contract, {}, { subjectId: 'terminal-revoker', dispatchId: 'terminal-revoke' });
      return retained;
    };
    const { result, first } = await executeFirst({ controlStore, prepared });
    expect(result).toMatchObject({ success: false, error: { code: 'SOP_SNAPSHOT_STALE' } });
    expect(fs.existsSync(path.join(root, first.contract.produces[0].path))).toBe(true);
    const inspected = await sop.inspectSelectedSopRun(association, 'terminal-retention-revocation-run')
      .catch((error) => ({ staleCode: error.code }));
    expect(inspected).toMatchObject({ staleCode: 'SOP_SNAPSHOT_STALE' });
  }, 120000);

  nativeTest('quarantines a completed first-phase outcome when artifact bytes change during retention', async () => {
    const { snapshot, controlStore, association } = await controller();
    const prepared = await preparedManual(association, 'first-terminal-byte-mutation-run');
    const output = prepared.bindings[0].contract.produces[0].path;
    const retain = controlStore.retainSopOutcome;
    controlStore.retainSopOutcome = async (record, issuer) => {
      const retained = await retain(record, issuer);
      fs.writeFileSync(path.join(root, output), 'MUTATED DURING OUTCOME RETENTION');
      return retained;
    };
    const { result } = await executeFirst({ controlStore, prepared });
    expect(result).toMatchObject({ success: false, error: { code: 'SOP_ASSOCIATION_ARTIFACT_CHANGED' } });
    const inspected = await sop.inspectSelectedSopRun(association, 'first-terminal-byte-mutation-run');
    expect(inspected.outcomes[0].status).toBe('completed');
    expect(inspected.ineligibleOutcomeHashes).toEqual([inspected.outcomes[0].recordHash]);
    const resolved = await sop.resolveSelectedSopRun(association, prepared.plan.run);
    expect(resolved.receipts).toHaveLength(0);
    const conformance = await sop.auditConformance(snapshot, prepared.plan.run,
      (query) => sop.resolveSelectedSopRun(association, query), { projectRoot: root });
    expect(conformance.status).toBe('not-observed');
  }, 120000);

  nativeTest('quarantines a completed outcome when a live binding lease is revoked during retention', async () => {
    const { controlStore, association } = await controller();
    const prepared = await preparedManual(association, 'terminal-lease-revocation-run');
    const retain = controlStore.retainSopOutcome;
    controlStore.retainSopOutcome = async (record, issuer) => {
      const retained = await retain(record, issuer);
      prepared.broker.revoke(prepared.bindings[0].requiredCapabilities[0].token, 'terminal retention revocation');
      return retained;
    };
    const { result } = await executeFirst({ controlStore, prepared });
    expect(result).toMatchObject({ success: false, error: { code: 'CAPABILITY_REVOKED' } });
    const inspected = await sop.inspectSelectedSopRun(association, 'terminal-lease-revocation-run');
    expect(inspected.ineligibleOutcomeHashes).toEqual([inspected.outcomes[0].recordHash]);
    const resolved = await sop.resolveSelectedSopRun(association, prepared.plan.run);
    expect(resolved.receipts).toHaveLength(0);
  }, 120000);

  nativeTest('keeps a retained completed outcome ineligible when retention returns an error after writing', async () => {
    const { controlStore, association } = await controller();
    const prepared = await preparedManual(association, 'post-write-retention-error-run');
    const retain = controlStore.retainSopOutcome;
    controlStore.retainSopOutcome = async (record, issuer) => {
      await retain(record, issuer);
      throw Object.assign(new Error('retention acknowledgement failed'), { code: 'RETENTION_ACK_FAILED' });
    };
    const { result } = await executeFirst({ controlStore, prepared });
    expect(result).toMatchObject({ success: false, error: { code: 'SOP_ASSOCIATION_RETENTION_FAILED' } });
    const inspected = await sop.inspectSelectedSopRun(association, 'post-write-retention-error-run');
    expect(inspected.outcomes[0].status).toBe('completed');
    expect(inspected.ineligibleOutcomeHashes).toEqual([inspected.outcomes[0].recordHash]);
    const resolved = await sop.resolveSelectedSopRun(association, prepared.plan.run);
    expect(resolved.receipts).toHaveLength(0);
  }, 120000);

  nativeTest('quarantines final sixth-phase conformance when its artifact changes during retention', async () => {
    const { snapshot, controlStore, association } = await controller();
    const retain = controlStore.retainSopOutcome;
    let retainedCount = 0;
    controlStore.retainSopOutcome = async (record, issuer) => {
      const retained = await retain(record, issuer);
      retainedCount += 1;
      if (retainedCount === sop.PHASES.length) {
        fs.writeFileSync(path.join(root, record.artifacts[0].path), 'MUTATED FINAL ARTIFACT DURING RETENTION');
      }
      return retained;
    };
    const receipt = await run(association);
    expect(receipt.status).toBe('BLOCKED');
    const inspected = await sop.inspectSelectedSopRun(association, receipt.correlation.runId);
    expect(inspected.outcomes).toHaveLength(6);
    expect(inspected.ineligibleOutcomeHashes).toEqual([inspected.outcomes[5].recordHash]);
    const conformance = await sop.auditConformance(snapshot, inspected.header.run,
      (query) => sop.resolveSelectedSopRun(association, query), { projectRoot: root });
    expect(conformance.status).toBe('not-observed');
  }, 120000);

  nativeTest('revalidates lifecycle authority after resolver awaits', async () => {
    const contract = selectedContract(root, fixture, `project-${sha256(fs.realpathSync(root)).slice(0, 32)}`);
    const { controlStore, association } = await controller(contract);
    const receipt = await run(association);
    expect(receipt.status).toBe('ACCEPTED');
    const resolve = controlStore.resolveSopRun;
    controlStore.resolveSopRun = async (runId, issuer) => {
      const retained = await resolve(runId, issuer);
      await lifecycleHost.act('deprecate', contract, {}, { subjectId: 'resolver-revoker', dispatchId: 'resolver-revoke' });
      return retained;
    };
    await expect(sop.resolveSelectedSopRun(association, receipt.sopAssociation.run))
      .rejects.toMatchObject({ code: 'SOP_SNAPSHOT_STALE' });
  }, 120000);

  nativeTest('copied records cannot become authenticated in another store or controller', async () => {
    const { snapshot, association } = await controller();
    const receipt = await run(association);
    expect(receipt.status).toBe('ACCEPTED');
    const retained = await sop.inspectSelectedSopRun(association, receipt.correlation.runId);
    const importedRoot = path.join(base, 'imported-control'); fs.mkdirSync(importedRoot);
    const imported = createWorkflowControlStore(importedRoot, root);
    await expect(imported.retainSopRun(structuredClone(retained.header)))
      .rejects.toMatchObject({ code: 'SOP_ASSOCIATION_ISSUER_REQUIRED' });
    for (const file of fs.readdirSync(controlRoot).filter((name) => name.startsWith('sop-'))) {
      fs.copyFileSync(path.join(controlRoot, file), path.join(importedRoot, file));
    }
    const other = sop.createSelectedSopRuntimeAssociation({ snapshot, projectRoot: root, frameworkRoot,
      controlStore: imported, hostInstanceId: 'other-host', policyRevision: 'other-policy',
      environmentId: 'fixture-win', producerSubjectId: 'other-subject' });
    await expect(sop.inspectSelectedSopRun(other, receipt.correlation.runId))
      .rejects.toMatchObject({ code: 'SOP_ASSOCIATION_RUN_UNAUTHENTICATED' });
  }, 120000);

  test.each([
    ['reordered steps', (contract) => { [contract.steps[0], contract.steps[1]] = [contract.steps[1], contract.steps[0]]; }, 'SOP_ASSOCIATION_PHASE_SET_INVALID'],
    ['missing step', (contract) => { const removed = contract.steps.pop(); contract.evidenceObligations = contract.evidenceObligations.filter((item) => item.stepId !== removed.id); }, 'SOP_ASSOCIATION_PHASE_SET_INVALID'],
    ['extra step', (contract) => { contract.steps.push({ id: 'archive-story', name: 'archive-story', instructions: 'Archive fixture evidence.', owner: 'qa', kind: 'deterministic',
      dependsOn: ['review-story'], systems: ['aexos-governed-runtime'], capabilities: ['approved-operation:archive'],
      inputs: [{ name: 'story', type: 'path', required: true }], outputs: [{ name: 'archive', kind: 'report', path: 'archive.json' }],
      verify: [{ type: 'file-exists', target: 'archive.json' }], evidenceObligationIds: ['archive-output'], sideEffects: true, approvalRequired: false });
    contract.evidenceObligations.push({ id: 'archive-output', description: 'Archive fixture output.', required: true, stepId: 'archive-story',
      artifact: { id: 'archive', kind: 'report', path: 'archive.json' }, requiredChecks: [{ type: 'file-exists', target: 'archive.json' }], requiredOrigin: 'runtime', maxAgeMs: 86400000 }); }, 'SOP_ASSOCIATION_PHASE_SET_INVALID'],
    ['changed contract', (contract) => { contract.steps[0].capabilities[0] = `approved-operation:${'0'.repeat(64)}`; }, 'SOP_ASSOCIATION_CONTRACT_MISMATCH'],
    ['changed output', (contract) => { contract.steps[0].outputs[0].path = 'other-story.md'; contract.evidenceObligations[0].artifact.path = 'other-story.md'; }, 'SOP_ASSOCIATION_CONTRACT_MISMATCH'],
    ['changed check', (contract) => { contract.steps[0].verify[0].target = 'other-story.md'; contract.evidenceObligations[0].requiredChecks[0].target = 'other-story.md'; }, 'SOP_ASSOCIATION_CONTRACT_MISMATCH'],
    ['changed owner', (contract) => { contract.steps[0].owner = 'qa'; }, 'SOP_ASSOCIATION_PHASE_SET_INVALID'],
    ['unsupported precondition', (contract) => { contract.preconditions.push({ id: 'manual-ready', description: 'Manual readiness', required: true, stepId: null }); }, 'SOP_ASSOCIATION_CONTROL_UNSUPPORTED'],
    ['unsupported branch', (contract) => { contract.branches.push({ id: 'route', fromStepId: 'create-story', joinStepId: 'implement-story', cases: [
      { id: 'valid', condition: 'valid', targetStepId: 'validate-story', otherwise: false },
      { id: 'other', condition: 'otherwise', targetStepId: 'plan-implementation', otherwise: true }] }); }, 'SOP_ASSOCIATION_CONTROL_UNSUPPORTED'],
    ['unsupported exception', (contract) => { contract.exceptions.push({ id: 'retry-create', fromStepId: 'create-story', condition: 'creation failed', targetStepId: 'validate-story', approvalId: 'review' }); }, 'SOP_ASSOCIATION_CONTROL_UNSUPPORTED'],
    ['unsupported global obligation', (contract) => { contract.evidenceObligations.push({ id: 'global-proof', description: 'Whole-run proof', required: true, stepId: null,
      artifact: { id: 'global', kind: 'file', path: 'global.txt' }, requiredChecks: [{ type: 'file-exists', target: 'global.txt' }], requiredOrigin: 'runtime', maxAgeMs: 86400000 }); }, 'SOP_ASSOCIATION_GLOBAL_OBLIGATION_UNSUPPORTED'],
  ])('denies %s before provider effects', async (_name, mutate, code) => {
    const contract = selectedContract(root, fixture, `project-${sha256(fs.realpathSync(root)).slice(0, 32)}`); mutate(contract);
    const { association } = await controller(contract);
    await expect(run(association)).rejects.toMatchObject({ code });
    expect(fs.existsSync(path.join(root, 'create-story.json'))).toBe(false);
  });

  test('rejects unbranded constructor hooks and request JSON cannot install hooks', async () => {
    const governance = { evaluate: () => ({ token: 'token', story: {} }), verify: () => ({}), settle: () => {} };
    expect(() => new AgentRuntime({ provider: { execute: async () => ({ success: true }) }, governanceController: governance,
      sopRuntimeHooks: { admitPhase: async () => {}, finishPhase: async () => {} } }))
      .toThrow(expect.objectContaining({ code: 'SOP_ASSOCIATION_HOOKS_UNTRUSTED' }));
    const provider = { execute: jest.fn(async () => ({ success: true })) };
    const runtime = new AgentRuntime({ provider, governanceController: governance });
    await expect(runtime.execute({ agentId: 'dev', task: 'legacy', prompt: 'legacy',
      sopRuntimeHooks: { admitPhase: 'forged' } })).resolves.toMatchObject({ success: true });
    expect(provider.execute).toHaveBeenCalledTimes(1);
  });
});
