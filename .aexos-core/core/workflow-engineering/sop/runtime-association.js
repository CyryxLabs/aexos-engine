'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { clone, digest } = require('../../execution/durable-evidence');
const { assertExecutionBinding, operationHash, sha256 } = require('../../execution/execution-binding');
const { resolveArtifact } = require('../../execution/outcome-verifier');
const { assertWorkflowControlStore, createSopAssociationRecordIssuer } = require('../../execution/workflow-control-store');
const { fail } = require('./contract');
const { assertVerifiedSnapshot } = require('./lifecycle');
const { compileSop } = require('./compile');

const PROTOCOL = 'aexos.sop-runtime-association/v1';
const SOURCE_RUNTIME = 'aexos-governed-runtime';
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/;
const PHASES = Object.freeze([
  Object.freeze({ phaseId: 'create-story', taskId: 'create-next-story', owner: 'sm', dependsOn: [] }),
  Object.freeze({ phaseId: 'validate-story', taskId: 'validate-next-story', owner: 'po', dependsOn: ['create-story'] }),
  Object.freeze({ phaseId: 'plan-implementation', taskId: 'plan-create-implementation', owner: 'architect', dependsOn: ['validate-story'] }),
  Object.freeze({ phaseId: 'implement-story', taskId: 'dev-develop-story', owner: 'dev', dependsOn: ['plan-implementation'] }),
  Object.freeze({ phaseId: 'run-tests', taskId: 'qa-run-tests', owner: 'qa', dependsOn: ['implement-story'] }),
  Object.freeze({ phaseId: 'review-story', taskId: 'qa-review-story', owner: 'qa', dependsOn: ['run-tests'] }),
]);
const controllers = new WeakMap();
const plans = new WeakMap();
const hookProofs = new WeakSet();
const associationProofs = new WeakMap();

function exact(value, expected) { return digest(value) === digest(expected); }
function instant(value) {
  const number = Date.parse(value);
  return typeof value === 'string' && Number.isFinite(number) && new Date(number).toISOString() === value ? number : NaN;
}
function validHostId(value) { return typeof value === 'string' && ID.test(value); }
function outputArtifact(root, expected) {
  try {
    const artifact = resolveArtifact(root, expected.path);
    if (!artifact.stat.isFile()) return { ...expected, hash: null };
    return { ...expected, hash: sha256(fs.readFileSync(artifact.absolute)), bytes: artifact.stat.size,
      identity: { dev: String(artifact.stat.dev), ino: String(artifact.stat.ino) } };
  } catch (_error) {
    return { ...expected, hash: null };
  }
}

function assertPhaseAuthority(planState, index) {
  assertVerifiedSnapshot(planState.snapshot, ['Effective'], 'SOP_EFFECTIVE_SNAPSHOT_REQUIRED');
  planState.host.controlStore.assertIdentity();
  const expected = planState.bindingViews[index]; const binding = planState.selectedBindings[index];
  assertExecutionBinding(binding, { phase: { id: expected.phaseId, task: expected.taskId, agent: expected.owner },
    projectRoot: planState.host.projectRoot, frameworkRoot: planState.host.frameworkRoot });
  return expected;
}

function sopOutput(output) {
  // Task contracts use `story` as a file specialization while SOP v1 models
  // runtime evidence by storage kind. The task-contract hash remains retained,
  // so this single canonical projection cannot hide a task kind change.
  const kind = output.kind === 'story' ? 'file' : output.kind;
  if (!['file', 'report', 'json'].includes(kind)) {
    fail('SOP_ASSOCIATION_OUTPUT_UNSUPPORTED', 'Selected task output has no canonical SOP v1 storage kind.');
  }
  return { ...clone(output), kind };
}

function bindingView(binding) {
  return {
    phaseId: binding.phaseId,
    taskId: binding.task,
    owner: binding.agentId,
    taskContractHash: binding.taskContractHash,
    resolvedContractHash: binding.resolvedContractHash,
    approvedOperationHashes: [...binding.approvedOperationHashes],
    inputs: clone(binding.contract.inputs),
    outputs: binding.contract.produces.map(sopOutput),
    taskOutputs: clone(binding.contract.produces),
    checks: clone(binding.contract.verify),
  };
}

function phaseObligations(contract, step, binding) {
  const obligations = contract.evidenceObligations.filter((item) => item.stepId === step.id);
  if (!obligations.length || obligations.some((item) => !item.required || item.requiredOrigin !== 'runtime')) {
    fail('SOP_ASSOCIATION_OBLIGATION_INVALID', 'Every selected phase requires runtime evidence obligations.');
  }
  const outputs = binding.contract.produces.map(sopOutput);
  if (outputs.some((output) => !obligations.some((item) => item.artifact.id === output.name
    && item.artifact.kind === output.kind && item.artifact.path === output.path))) {
    fail('SOP_ASSOCIATION_OUTPUT_MISMATCH', 'SOP obligations must cover every resolved task output.');
  }
  if (obligations.some((item) => !outputs.some((output) => item.artifact.id === output.name
    && item.artifact.kind === output.kind && item.artifact.path === output.path))) {
    fail('SOP_ASSOCIATION_OUTPUT_MISMATCH', 'SOP obligations may not add outputs to a selected task.');
  }
  const declaredChecks = new Set(obligations.flatMap((item) => item.requiredChecks.map(digest)));
  if (declaredChecks.size !== binding.contract.verify.length
    || binding.contract.verify.some((check) => !declaredChecks.has(digest(check)))) {
    fail('SOP_ASSOCIATION_CHECK_MISMATCH', 'SOP obligations must bind every exact resolved task check without extras.');
  }
  return obligations;
}

function validateSelectedMap(snapshot, selectedBindings, host) {
  const contract = snapshot.contract;
  if (contract.branches.length || contract.exceptions.length || contract.preconditions.length) {
    fail('SOP_ASSOCIATION_CONTROL_UNSUPPORTED', 'Branches, exceptions and preconditions have no selected-runtime adapter.');
  }
  if (contract.evidenceObligations.some((item) => item.stepId === null)) {
    fail('SOP_ASSOCIATION_GLOBAL_OBLIGATION_UNSUPPORTED', 'Global obligations require a separately authenticated whole-run collector.');
  }
  if (!Array.isArray(selectedBindings) || selectedBindings.length !== PHASES.length
    || contract.steps.length !== PHASES.length) {
    fail('SOP_ASSOCIATION_PHASE_SET_INVALID', 'The selected SOP requires exactly six canonical phases.');
  }
  const views = [];
  for (const [index, expected] of PHASES.entries()) {
    const step = contract.steps[index]; const binding = selectedBindings[index];
    if (binding) assertExecutionBinding(binding, { phase: { id: expected.phaseId, task: expected.taskId, agent: expected.owner },
      projectRoot: host.projectRoot, frameworkRoot: host.frameworkRoot });
    if (!step || !binding || step.id !== expected.phaseId || binding.phaseId !== expected.phaseId
      || step.owner !== expected.owner || binding.task !== expected.taskId || binding.agentId !== expected.owner
      || !exact(step.dependsOn, expected.dependsOn)) {
      fail('SOP_ASSOCIATION_PHASE_SET_INVALID', 'SOP steps, selected phases, tasks, owners and dependency order must match exactly.');
    }
    if (step.kind !== 'deterministic' || step.approvalRequired || step.systems.length !== 1
      || step.systems[0] !== SOURCE_RUNTIME || !step.sideEffects
      || !exact(step.inputs, binding.contract.inputs)
      || !exact(step.outputs, binding.contract.produces.map(sopOutput))
      || !exact(step.verify, binding.contract.verify)
      || !exact(step.capabilities, binding.approvedOperationHashes.map((hash) => `approved-operation:${hash}`))) {
      fail('SOP_ASSOCIATION_CONTRACT_MISMATCH', 'SOP step contract, operations, checks or runtime system differs from the selected binding.');
    }
    const obligations = phaseObligations(contract, step, binding);
    if (!exact(step.evidenceObligationIds, obligations.map((item) => item.id))) {
      fail('SOP_ASSOCIATION_OBLIGATION_INVALID', 'SOP step obligation order must match the canonical evidence mapping.');
    }
    views.push({ ...bindingView(binding), stepId: step.id, dependsOn: [...expected.dependsOn], obligations: clone(obligations) });
  }
  return views;
}

function createSelectedSopRuntimeAssociation(options = {}) {
  const snapshot = assertVerifiedSnapshot(options.snapshot, ['Effective'], 'SOP_EFFECTIVE_SNAPSHOT_REQUIRED');
  const projectRoot = fs.realpathSync(path.resolve(options.projectRoot || ''));
  const frameworkRoot = fs.realpathSync(path.resolve(options.frameworkRoot || path.resolve(__dirname, '../../../..')));
  const controlStore = assertWorkflowControlStore(options.controlStore, projectRoot);
  for (const [name, value] of [['hostInstanceId', options.hostInstanceId], ['policyRevision', options.policyRevision],
    ['environmentId', options.environmentId], ['producerSubjectId', options.producerSubjectId]]) {
    if (!validHostId(value)) fail('SOP_ASSOCIATION_HOST_INVALID', `Trusted host ${name} is invalid.`);
  }
  if (snapshot.contract.conformance.requiredEnvironment !== options.environmentId) {
    fail('SOP_ASSOCIATION_ENVIRONMENT_MISMATCH', 'Trusted host environment differs from the Effective SOP.');
  }
  const controller = Object.freeze({ protocol: PROTOCOL, assurance: snapshot.lifecycle.assurance,
    availability: snapshot.lifecycle.assurance === 'fixture' ? 'fixture-only' : 'host-composed' });
  const issuer = createSopAssociationRecordIssuer(controlStore, { hostInstanceId: options.hostInstanceId,
    policyRevision: options.policyRevision, lifecycleProjectId: snapshot.lifecycle.projectId,
    projectRootHash: sha256(projectRoot) });
  controllers.set(controller, { snapshot, projectRoot, frameworkRoot, controlStore, issuer,
    hostInstanceId: options.hostInstanceId, policyRevision: options.policyRevision,
    environmentId: options.environmentId, producerSubjectId: options.producerSubjectId,
    clock: options.clock || (() => new Date()), preparedRunIds: new Set() });
  return controller;
}

async function prepareSelectedSopRun(controller, hostRunContext, selectedBindings) {
  const host = controllers.get(controller);
  if (!host) fail('SOP_ASSOCIATION_HOST_UNTRUSTED', 'Selected SOP association requires a live trusted host composition.');
  const snapshot = assertVerifiedSnapshot(host.snapshot, ['Effective'], 'SOP_EFFECTIVE_SNAPSHOT_REQUIRED');
  const required = ['runId', 'projectId', 'runHash', 'policyHash', 'storyHash', 'workflowHash', 'startedAt'];
  if (!hostRunContext || required.some((key) => typeof hostRunContext[key] !== 'string' || !hostRunContext[key])
    || !validHostId(hostRunContext.runId) || !Number.isFinite(instant(hostRunContext.startedAt))
    || [hostRunContext.runHash, hostRunContext.policyHash, hostRunContext.storyHash, hostRunContext.workflowHash].some((hash) => !HASH.test(hash))) {
    fail('SOP_ASSOCIATION_RUN_INVALID', 'Trusted run context must bind exact project, inputs, policy, story and workflow bytes.');
  }
  if (host.preparedRunIds.has(hostRunContext.runId)) fail('SOP_ASSOCIATION_RUN_REPLAY', 'SOP run identity was already prepared by this host.');
  const bindingViews = validateSelectedMap(snapshot, selectedBindings, host);
  const compilation = compileSop(snapshot, { projectRoot: host.projectRoot });
  const inputDigest = digest({ runHash: hostRunContext.runHash, policyHash: hostRunContext.policyHash,
    storyHash: hostRunContext.storyHash, workflowHash: hostRunContext.workflowHash,
    runnerProjectId: hostRunContext.projectId,
    bindings: bindingViews.map(({ obligations: _obligations, ...value }) => value) });
  const run = Object.freeze({ projectId: snapshot.lifecycle.projectId, sopId: snapshot.contract.sopId,
    version: snapshot.contract.version, semanticHash: snapshot.semanticHash,
    compiledMapHash: compilation.compiledMapHash, runId: hostRunContext.runId,
    environmentId: host.environmentId, inputDigest, startedAt: hostRunContext.startedAt });
  const lifecycleHeadHash = digest(snapshot.lifecycle.events);
  const associationDigest = digest({ run, hostInstanceId: host.hostInstanceId,
    policyRevision: host.policyRevision, lifecycleHeadHash, bindings: bindingViews });
  const header = host.issuer.issueRun({ protocol: PROTOCOL, recordType: 'run', runId: run.runId, run: clone(run),
    hostInstanceId: host.hostInstanceId, policyRevision: host.policyRevision,
    lifecycleHeadHash, runHash: hostRunContext.runHash, policyHash: hostRunContext.policyHash,
    storyHash: hostRunContext.storyHash, workflowHash: hostRunContext.workflowHash,
    runnerProjectId: hostRunContext.projectId,
    projectRootHash: sha256(host.projectRoot), associationDigest,
    phases: bindingViews.map((item) => ({ phaseId: item.phaseId, stepId: item.stepId, taskId: item.taskId, attempt: 1 })) });
  await host.issuer.retainRun(header);
  assertVerifiedSnapshot(snapshot, ['Effective'], 'SOP_EFFECTIVE_SNAPSHOT_REQUIRED');
  host.controlStore.assertIdentity();
  validateSelectedMap(snapshot, selectedBindings, host);
  host.preparedRunIds.add(run.runId);
  const plan = Object.freeze({ protocol: PROTOCOL, run: clone(run), associationDigest });
  plans.set(plan, { host, snapshot, header, bindingViews, selectedBindings: [...selectedBindings],
    nextPhase: 0, admitted: new Map(), finished: new Set() });
  return plan;
}

function assertRequest(planState, request) {
  const index = planState.nextPhase;
  const expected = planState.bindingViews[index]; const binding = planState.selectedBindings[index];
  if (binding) assertExecutionBinding(binding, { phase: { id: expected.phaseId, task: expected.taskId, agent: expected.owner },
    projectRoot: planState.host.projectRoot, frameworkRoot: planState.host.frameworkRoot });
  if (!expected || !binding || request.phaseId !== expected.phaseId || request.task !== expected.taskId
    || request.agentId !== expected.owner || request.projectRoot !== planState.host.projectRoot
    || sha256(JSON.stringify(request.contract)) !== binding.resolvedContractHash
    || !exact((request.approvedFilesystemOperations || []).map(operationHash), expected.approvedOperationHashes)) {
    fail('SOP_ASSOCIATION_DISPATCH_MISMATCH', 'Live runtime request differs from the next retained selected binding.');
  }
  return { index, expected, binding };
}

function createSopRuntimeHooks(plan) {
  const planState = plans.get(plan);
  if (!planState) fail('SOP_ASSOCIATION_PLAN_UNTRUSTED', 'Runtime hooks require a live selected SOP plan.');
  const hooks = Object.freeze({
    async admitPhase(context) {
      assertVerifiedSnapshot(planState.snapshot, ['Effective'], 'SOP_EFFECTIVE_SNAPSHOT_REQUIRED');
      planState.host.controlStore.assertIdentity();
      const { index, expected } = assertRequest(planState, context?.request || {});
      const dispatchId = randomUUID(); const associationId = randomUUID();
      const producer = { subjectId: planState.host.producerSubjectId, dispatchId };
      const record = planState.host.issuer.issueDispatch({ protocol: PROTOCOL, recordType: 'dispatch', runId: planState.header.runId,
        phaseId: expected.phaseId, stepId: expected.stepId, taskId: expected.taskId, attempt: 1,
        headerRecordHash: planState.header.recordHash,
        associationId, associationDigest: planState.header.associationDigest,
        hostInstanceId: planState.host.hostInstanceId, policyRevision: planState.host.policyRevision,
        lifecycleHeadHash: planState.header.lifecycleHeadHash,
        admittedAt: planState.host.clock().toISOString(), intentHash: context.governanceEvidence.intentHash,
        producer, sourceRuntime: SOURCE_RUNTIME, taskContractHash: expected.taskContractHash,
        resolvedContractHash: expected.resolvedContractHash,
        approvedOperationHashes: expected.approvedOperationHashes,
        obligations: expected.obligations.map((item) => ({ obligationId: item.id, stepId: item.stepId,
          taskId: expected.taskId, artifact: { ...item.artifact, hash: null }, requiredChecks: item.requiredChecks })) });
      await planState.host.issuer.retainDispatch(record);
      assertVerifiedSnapshot(planState.snapshot, ['Effective'], 'SOP_EFFECTIVE_SNAPSHOT_REQUIRED');
      planState.host.controlStore.assertIdentity();
      const association = Object.freeze({ protocol: PROTOCOL, associationId, runId: record.runId,
        phaseId: record.phaseId, taskId: record.taskId, dispatchId });
      associationProofs.set(association, { planState, record, index });
      planState.admitted.set(expected.phaseId, association);
      planState.nextPhase += 1;
      return association;
    },
    revalidatePhase(association) {
      const proof = associationProofs.get(association);
      if (!proof || proof.planState !== planState || planState.finished.has(association)) {
        fail('SOP_ASSOCIATION_REPLAY', 'SOP phase association is unknown or already terminal.');
      }
      assertPhaseAuthority(planState, proof.index);
      return true;
    },
    async finishPhase(association, context) {
      const proof = associationProofs.get(association);
      if (!proof || proof.planState !== planState || planState.finished.has(association)) {
        fail('SOP_ASSOCIATION_REPLAY', 'SOP terminal association is unknown or already retained.');
      }
      let authorityError = null;
      try { assertPhaseAuthority(planState, proof.index); }
      catch (error) { authorityError = error; }
      const result = context?.result || null; const settlement = context?.settlement || { status: 'failed' };
      const expected = planState.bindingViews[proof.index];
      const artifacts = expected.obligations.map((item) => outputArtifact(planState.host.projectRoot, item.artifact));
      const acceptedArtifacts = Array.isArray(result?.acceptance?.artifacts) ? result.acceptance.artifacts : [];
      const operationEvidence = Array.isArray(result?.filesystemOperationEvidence) ? result.filesystemOperationEvidence : [];
      const operationsComplete = operationEvidence.length === expected.approvedOperationHashes.length
        && expected.approvedOperationHashes.every((hash, index) => operationEvidence[index]?.index === index
          && operationEvidence[index]?.operationHash === hash && operationEvidence[index]?.success === true
          && operationEvidence[index]?.finalized === true);
      const accepted = !authorityError && settlement.status === 'settled' && result?.success === true
        && result?.status === 'success' && result?.acceptance?.verdict === 'ACCEPTED'
        && result.acceptance.contractHash === expected.resolvedContractHash
        && exact(acceptedArtifacts.map(({ bytes: _bytes, sha256: _sha256, identity: _identity, ...artifact }) => artifact), expected.taskOutputs)
        && artifacts.every((artifact) => {
          const checked = acceptedArtifacts.find((item) => item.name === artifact.id && item.kind === expected.taskOutputs.find((output) => output.name === artifact.id)?.kind
            && item.path === artifact.path);
          return checked && checked.sha256 === artifact.hash && checked.bytes === artifact.bytes
            && exact(checked.identity, artifact.identity);
        })
        && Array.isArray(result.acceptance.checks) && result.acceptance.checks.length === expected.checks.length
        && result.acceptance.checks.every((check, index) => check.index === index && check.passed === true
          && check.type === expected.checks[index].type)
        && artifacts.every((artifact) => HASH.test(artifact.hash || '')) && operationsComplete;
      const code = accepted ? null : authorityError ? authorityError.code || 'SOP_ASSOCIATION_AUTHORITY_CHANGED'
        : settlement.status !== 'settled' ? 'SOP_ASSOCIATION_SETTLEMENT_FAILED'
          : !operationsComplete ? 'SOP_ASSOCIATION_OPERATIONS_INCOMPLETE'
            : context?.error?.code || result?.error?.code || 'SOP_ASSOCIATION_OUTCOME_REJECTED';
      const observedAt = planState.host.clock().toISOString();
      const receipts = expected.obligations.map((obligation) => {
        const artifact = artifacts.find((item) => item.id === obligation.artifact.id
          && item.kind === obligation.artifact.kind && item.path === obligation.artifact.path)
          || { ...obligation.artifact, hash: null };
        const checks = accepted ? obligation.requiredChecks.map((definition) => {
          const checkIndex = expected.checks.findIndex((item) => digest(item) === digest(definition));
          return { definition, passed: result.acceptance.checks[checkIndex]?.passed === true, artifactHash: artifact.hash };
        }) : [];
        const payload = { ...planState.header.run, receiptId: `${association.associationId}:${obligation.id}`,
          trusted: true, origin: 'runtime',
          status: accepted ? 'completed' : 'failed', stepId: expected.stepId, taskId: expected.taskId,
          obligationId: obligation.id, producer: proof.record.producer, sourceRuntime: SOURCE_RUNTIME,
          artifact, observedAt, acceptance: { result: accepted ? 'passed' : 'failed', checks, ...(code ? { code } : {}) } };
        return { ...payload, receiptHash: digest(payload) };
      });
      const outcome = planState.host.issuer.issueOutcome({ protocol: PROTOCOL, recordType: 'outcome', runId: proof.record.runId,
        phaseId: proof.record.phaseId, stepId: proof.record.stepId, taskId: proof.record.taskId,
        attempt: proof.record.attempt, associationId: proof.record.associationId,
        dispatchRecordHash: proof.record.recordHash, terminalAt: observedAt,
        status: accepted ? 'completed' : 'failed', code, effectsObserved: artifacts.some((item) => item.hash),
        artifacts, receipts });
      await planState.host.issuer.retainOutcome(outcome);
      let terminalError = null;
      try {
        assertPhaseAuthority(planState, proof.index);
        const retainedArtifacts = expected.obligations.map((item) => outputArtifact(planState.host.projectRoot, item.artifact));
        if (!exact(retainedArtifacts, artifacts)) {
          fail('SOP_ASSOCIATION_ARTIFACT_CHANGED', 'Verified artifact bytes or file identity changed during terminal retention.');
        }
      } catch (error) { terminalError = error; }
      if (accepted && !terminalError) planState.host.issuer.markOutcomeEligible(outcome);
      planState.finished.add(association);
      return Object.freeze({ accepted: accepted && !terminalError,
        code: terminalError?.code || code,
        outcomeHash: outcome.recordHash, effectsObserved: outcome.effectsObserved });
    },
  });
  hookProofs.add(hooks);
  return hooks;
}

function assertSopRuntimeHooks(hooks) {
  if (!hookProofs.has(hooks)) fail('SOP_ASSOCIATION_HOOKS_UNTRUSTED', 'AgentRuntime requires constructor-owned SOP association hooks.');
  return hooks;
}

async function resolveSelectedSopRun(controller, runRef) {
  const host = controllers.get(controller);
  if (!host || !runRef || !validHostId(runRef.runId)) return null;
  assertVerifiedSnapshot(host.snapshot, ['Effective'], 'SOP_EFFECTIVE_SNAPSHOT_REQUIRED');
  host.controlStore.assertIdentity();
  const retained = await host.issuer.resolveRun(runRef.runId);
  assertVerifiedSnapshot(host.snapshot, ['Effective'], 'SOP_EFFECTIVE_SNAPSHOT_REQUIRED');
  host.controlStore.assertIdentity();
  if (!retained || !exact(retained.header.run, runRef)) return null;
  const outcomes = new Map(retained.outcomes.map((item) => [item.associationId, item]));
  const bindings = []; const receipts = [];
  for (const dispatch of retained.dispatches) {
    const outcome = outcomes.get(dispatch.associationId);
    for (const obligation of dispatch.obligations) {
      const artifact = outcome?.artifacts.find((item) => item.id === obligation.artifact.id
        && item.kind === obligation.artifact.kind && item.path === obligation.artifact.path) || obligation.artifact;
      bindings.push({ obligationId: obligation.obligationId, stepId: dispatch.stepId, taskId: dispatch.taskId,
        producer: dispatch.producer, sourceRuntime: dispatch.sourceRuntime, artifact,
        requiredChecks: obligation.requiredChecks, dispatchRecordHash: dispatch.recordHash });
    }
    if (outcome) receipts.push(...outcome.receipts);
  }
  return { run: clone(retained.header.run), bindings, receipts };
}

async function inspectSelectedSopRun(controller, runId) {
  const host = controllers.get(controller);
  if (!host || !validHostId(runId)) fail('SOP_ASSOCIATION_HOST_UNTRUSTED', 'Inspection requires the live association controller.');
  assertVerifiedSnapshot(host.snapshot, ['Effective'], 'SOP_EFFECTIVE_SNAPSHOT_REQUIRED');
  const retained = await host.issuer.inspectRun(runId);
  assertVerifiedSnapshot(host.snapshot, ['Effective'], 'SOP_EFFECTIVE_SNAPSHOT_REQUIRED');
  host.controlStore.assertIdentity();
  return retained ? clone(retained) : null;
}

module.exports = {
  PHASES,
  assertSopRuntimeHooks,
  createSelectedSopRuntimeAssociation,
  createSopRuntimeHooks,
  inspectSelectedSopRun,
  prepareSelectedSopRun,
  resolveSelectedSopRun,
};
