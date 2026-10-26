'use strict';

const { digest } = require('../../execution/durable-evidence');
const { compileWorkflowMap } = require('../workflow-map');
const { normalizeSopContract } = require('./contract');
const { assertVerifiedSnapshot } = require('./lifecycle');

const PREVIEW_EPOCH = Date.parse('2000-01-01T00:00:00.000Z');
const MAPPER_VERSION = 'aexos.sop-workflow-map/v1';

function mapInput(contract) {
  return {
    workflowId: `sop-${contract.sopId}-v${contract.version}`,
    name: contract.title, objective: contract.purpose,
    trigger: contract.preconditions.map((item) => item.description).join('; ') || 'Explicit operator invocation',
    outcome: contract.outputs.map((item) => item.description).join('; '),
    actors: contract.actors, systems: contract.systems,
    steps: contract.steps.map((step) => ({ id: step.id, name: step.name, owner: step.owner, kind: step.kind,
      dependsOn: step.dependsOn, systems: step.systems, capabilities: step.capabilities, inputs: step.inputs,
      outputs: step.outputs, verify: step.verify, sideEffects: step.sideEffects, approvalRequired: step.approvalRequired })),
  };
}

function compile(input, options, mode) {
  if (mode === 'approved') assertVerifiedSnapshot(input, ['Approved', 'Effective'], 'SOP_COMPILATION_AUTHORITY_REQUIRED');
  const normalized = normalizeSopContract(input.contract || input);
  const contract = normalized.contract;
  const generatedAt = mode === 'preview' ? PREVIEW_EPOCH : Date.parse(input.lifecycle.approvedAt);
  const workflowMap = compileWorkflowMap(mapInput(contract), { projectRoot: options.projectRoot, now: generatedAt });
  const unresolved = [];
  if (contract.branches.length) unresolved.push('route-adapter-required');
  if (contract.exceptions.length) unresolved.push('exception-adapter-required');
  if (contract.steps.some((step) => step.kind === 'manual')) unresolved.push('manual-evidence-required');
  if (contract.steps.some((step) => step.approvalRequired)) unresolved.push('approval-adapter-required');
  for (const decision of workflowMap.automationDecisions) {
    if (decision.classification !== 'eligible') unresolved.push(...decision.reasons);
  }
  // This adapter creates structural contracts only. No SOP execution adapter is
  // registered in AgentRuntime, including for deterministic eligible steps.
  unresolved.push('runtime-adapter-required');
  const executable = false;
  const controlFlow = { branches: contract.branches, exceptions: contract.exceptions };
  return { protocol: 'aexos.sop-compilation/v1', compilationMode: mode, executable,
    diagnostics: [...new Set(unresolved)], semanticHash: normalized.semanticHash,
    mapper: { protocol: MAPPER_VERSION, provenanceHash: digest({ mapper: MAPPER_VERSION, mapInput: mapInput(contract) }) },
    compiledMapHash: digest(workflowMap), workflowMap, controlFlow,
    compilerCheck: { kind: 'static-validation', verdict: workflowMap.qa.verdict, qa: workflowMap.qa },
    limitations: ['Compilation is not execution, conformance, accepted delivery, or authority.'] };
}

function previewSop(contract, options = {}) { return compile(contract, options, 'preview'); }
function compileSop(snapshot, options = {}) { return compile(snapshot, options, 'approved'); }
module.exports = { MAPPER_VERSION, compileSop, previewSop };
