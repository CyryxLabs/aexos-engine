'use strict';

const path = require('path');
const Ajv = require('ajv');
const schema = require(path.resolve(__dirname, '../../../schemas/sop-v1.schema.json'));
const { clone, digest, stableStringify } = require('../../execution/durable-evidence');

const validateShape = new Ajv({ allErrors: true, strict: false }).compile(schema);
const STATES = Object.freeze(['Draft', 'Reviewed', 'Approved', 'Effective', 'Deprecated', 'Superseded']);

class SopError extends Error {
  constructor(code, message, details = {}) {
    super(message); this.name = 'SopError'; this.code = code; this.details = details;
  }
}

function fail(code, message, details) { throw new SopError(code, message, details); }
function unique(items, label) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.id)) fail('SOP_ID_DUPLICATE', `Duplicate ${label} id ${item.id}.`, { label, id: item.id });
    seen.add(item.id);
  }
  return seen;
}

function semanticContract(contract) {
  const value = clone(contract);
  delete value.lifecycleState;
  delete value.change;
  return value;
}
function semanticHash(contract) { return digest(semanticContract(contract)); }

function assertAcyclic(stepIds, edges) {
  const outgoing = new Map([...stepIds].map((id) => [id, []]));
  for (const [from, to, source] of edges) {
    if (!stepIds.has(from) || !stepIds.has(to)) fail('SOP_GRAPH_TARGET_UNKNOWN', `${source} references an unknown step.`, { from, to, source });
    outgoing.get(from).push(to);
  }
  const visiting = new Set(); const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) fail('SOP_GRAPH_CYCLE', `SOP graph contains a cycle at ${id}.`, { stepId: id });
    if (visited.has(id)) return;
    visiting.add(id); outgoing.get(id).forEach(visit); visiting.delete(id); visited.add(id);
  }
  [...stepIds].sort().forEach(visit);
}

function validateSopContract(input) {
  if (Buffer.byteLength(stableStringify(input) || '') > 1024 * 1024) fail('SOP_INPUT_LIMIT', 'Canonical SOP exceeds its byte limit.');
  if (!validateShape(input)) fail('SOP_SCHEMA_INVALID', 'SOP contract does not match the strict v1 schema.', { errors: clone(validateShape.errors) });
  const contract = clone(input);
  const actorIds = unique(contract.actors, 'actor');
  const systemIds = unique(contract.systems, 'system');
  const stepIds = unique(contract.steps, 'step');
  unique(contract.branches, 'branch');
  unique(contract.exceptions, 'exception');
  const approvalIds = unique(contract.approvals, 'approval');
  const obligationIds = unique(contract.evidenceObligations, 'evidence obligation');
  unique(contract.inputs, 'input'); unique(contract.outputs, 'output'); unique(contract.preconditions, 'precondition');
  if (!actorIds.has(contract.ownerRole)) fail('SOP_OWNER_UNKNOWN', `Owner role ${contract.ownerRole} is not a declared actor.`);
  contract.authors.forEach((author) => { if (!actorIds.has(author)) fail('SOP_AUTHOR_UNKNOWN', `Author ${author} is not a declared actor.`); });
  const edges = [];
  for (const step of contract.steps) {
    if (!actorIds.has(step.owner)) fail('SOP_OWNER_UNKNOWN', `Step ${step.id} owner ${step.owner} is unknown.`);
    step.systems.forEach((id) => { if (!systemIds.has(id)) fail('SOP_SYSTEM_UNKNOWN', `Step ${step.id} system ${id} is unknown.`); });
    step.dependsOn.forEach((id) => { if (!stepIds.has(id)) fail('SOP_DEPENDENCY_UNKNOWN', `Step ${step.id} dependency ${id} is unknown.`); edges.push([id, step.id, `step ${step.id}`]); });
    step.evidenceObligationIds.forEach((id) => { if (!obligationIds.has(id)) fail('SOP_EVIDENCE_UNKNOWN', `Step ${step.id} evidence obligation ${id} is unknown.`); });
  }
  for (const obligation of contract.evidenceObligations) {
    if (obligation.stepId !== null && !stepIds.has(obligation.stepId)) fail('SOP_EVIDENCE_STEP_UNKNOWN', `Evidence obligation ${obligation.id} step is unknown.`);
    const target = obligation.artifact.path;
    if (path.isAbsolute(target) || path.win32.isAbsolute(target) || target.includes('\\')
      || target.includes('\0') || target.split('/').some((part) => !part || part === '.' || part === '..' || part.includes(':'))) fail('SOP_ARTIFACT_INVALID', 'Evidence artifact must use an exact project-relative path.');
    if (new Set(obligation.requiredChecks.map(digest)).size !== obligation.requiredChecks.length
      || obligation.requiredChecks.some((check) => typeof check.type !== 'string' || !check.type)) fail('SOP_CHECK_INVALID', 'Evidence checks must have distinct explicit definitions.');
    const step = contract.steps.find((item) => item.id === obligation.stepId);
    if (step && (!step.evidenceObligationIds.includes(obligation.id)
      || !step.outputs.some((output) => output.name === obligation.artifact.id && output.kind === obligation.artifact.kind && output.path === target)
      || obligation.requiredChecks.some((check) => !step.verify.some((verify) => digest(verify) === digest(check))))) fail('SOP_EVIDENCE_BINDING_INVALID', 'Obligation must bind canonical step outputs and checks.');
  }
  for (const branch of contract.branches) {
    if (!stepIds.has(branch.fromStepId)) fail('SOP_BRANCH_SOURCE_UNKNOWN', `Branch ${branch.id} source is unknown.`);
    if (branch.joinStepId !== null && !stepIds.has(branch.joinStepId)) fail('SOP_BRANCH_JOIN_UNKNOWN', `Branch ${branch.id} join is unknown.`);
    const cases = unique(branch.cases, `branch ${branch.id} case`);
    if (cases.size !== branch.cases.length || branch.cases.filter((item) => item.otherwise).length !== 1) fail('SOP_BRANCH_AMBIGUOUS', `Branch ${branch.id} requires exactly one otherwise case.`);
    const conditions = new Set();
    for (const item of branch.cases) {
      const key = item.condition.trim().toLowerCase();
      if (conditions.has(key)) fail('SOP_BRANCH_AMBIGUOUS', `Branch ${branch.id} has overlapping case conditions.`);
      conditions.add(key);
      if (!stepIds.has(item.targetStepId)) fail('SOP_BRANCH_TARGET_UNKNOWN', `Branch ${branch.id} case ${item.id} target is unknown.`);
      if (item.targetStepId === branch.joinStepId) fail('SOP_BRANCH_JOIN_AMBIGUOUS', `Branch ${branch.id} targets its join directly.`);
      edges.push([branch.fromStepId, item.targetStepId, `branch ${branch.id}`]);
      if (branch.joinStepId) edges.push([item.targetStepId, branch.joinStepId, `branch ${branch.id} join`]);
    }
  }
  for (const item of contract.exceptions) {
    if (!stepIds.has(item.fromStepId) || !stepIds.has(item.targetStepId)) fail('SOP_EXCEPTION_TARGET_UNKNOWN', `Exception ${item.id} references an unknown step.`);
    if (!approvalIds.has(item.approvalId)) fail('SOP_EXCEPTION_APPROVAL_UNKNOWN', `Exception ${item.id} approval is unknown.`);
    edges.push([item.fromStepId, item.targetStepId, `exception ${item.id}`]);
  }
  assertAcyclic(stepIds, edges);
  const stageCounts = new Map();
  for (const approval of contract.approvals) {
    if (!actorIds.has(approval.roleId)) fail('SOP_APPROVAL_ROLE_UNKNOWN', `Approval ${approval.id} role is unknown.`);
    approval.prohibitedRoleIds.forEach((id) => { if (!actorIds.has(id)) fail('SOP_APPROVAL_POLICY_INVALID', `Approval ${approval.id} prohibits unknown role ${id}.`); });
    if (approval.prohibitedRoleIds.includes(approval.roleId)) fail('SOP_APPROVAL_POLICY_INVALID', `Approval ${approval.id} prohibits its own role.`);
    if (['review', 'approve'].includes(approval.stage) && !approval.independent) fail('SOP_APPROVAL_POLICY_INVALID', 'Independent review and approval cannot be disabled by content.');
    if (approval.stage === 'review' && (contract.authors.includes(approval.roleId) || approval.roleId === contract.ownerRole)) fail('SOP_APPROVAL_POLICY_INVALID', 'Review role cannot be an author or owner role.');
    stageCounts.set(approval.stage, (stageCounts.get(approval.stage) || 0) + 1);
  }
  for (const stage of ['review', 'approve', 'activate', 'supersede', 'deprecate']) {
    if ((stageCounts.get(stage) || 0) > 1) fail('SOP_APPROVAL_POLICY_INVALID', 'Lifecycle authority must be unambiguous per stage.');
  }
  for (const required of ['review', 'approve', 'activate']) if (!stageCounts.has(required)) fail('SOP_APPROVAL_POLICY_INVALID', `Approval policy lacks ${required} authority.`);
  contract.conformance.allowedSkipApprovalIds.forEach((id) => { if (!approvalIds.has(id)) fail('SOP_APPROVAL_POLICY_INVALID', `Skip approval ${id} is unknown.`); });
  if (contract.version > 1 && !contract.change) fail('SOP_CHANGE_REQUIRED', 'Versions after v1 require reason and compatibility impact.');
  if (contract.change && contract.change.supersedesVersion === null && contract.change.migrationRef === null) fail('SOP_CHANGE_REQUIRED', 'Version change requires a migration or supersession link.');
  if (contract.change?.classification === 'render-only') fail('SOP_CHANGE_INVALID', 'Rendering revisions belong to projections; every canonical version change requires semantic review.');
  return contract;
}

function normalizeSopContract(input) {
  const contract = validateSopContract(input);
  return Object.freeze({ contract: clone(contract), semanticHash: semanticHash(contract), canonical: stableStringify(contract) });
}

module.exports = { STATES, SopError, fail, normalizeSopContract, semanticContract, semanticHash, validateSopContract };
