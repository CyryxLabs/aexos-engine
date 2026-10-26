'use strict';

const { digest } = require('../../execution/durable-evidence');
const { fail, normalizeSopContract } = require('./contract');

const RENDERER_VERSION = '1.0.0';
const PROJECTION_REVISION = 1;
function text(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/[\\`*_{}[\]()#+.!|~:-]/g, (character) => `&#${character.charCodeAt(0)};`)
    .replace(/\r?\n/g, '<br>');
}
function cell(value) { return text(value); }
function list(values) { return values.length ? values.map((item) => `- ${text(item)}`).join('\n') : '- None'; }
function normalizedBytes(value) { return String(value).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'); }

function renderSop(input, options = {}) {
  const normalized = normalizeSopContract(input);
  const contract = normalized.contract;
  const rendererVersion = options.rendererVersion || RENDERER_VERSION;
  if (!/^\d+\.\d+\.\d+$/.test(rendererVersion)) fail('SOP_RENDERER_INVALID', 'Renderer version must be a literal semantic version.');
  const lines = [
    `<!-- aexos-sop protocol=${contract.protocol} version=${contract.version} semanticHash=${normalized.semanticHash} rendererVersion=${rendererVersion} projectionRevision=${PROJECTION_REVISION} -->`,
    `<a id="sop-${contract.sopId}"></a>`, `# ${text(contract.title)}`, '',
    `**SOP:** \`${contract.sopId}\`  `, `**Version:** ${contract.version}  `,
    `**Lifecycle:** ${contract.lifecycleState}  `, `**Owner role:** \`${contract.ownerRole}\``, '',
    `**Authors:** ${contract.authors.map((item) => `\`${item}\``).join(', ')}`, '',
    '## Purpose', '', text(contract.purpose), '', '## Scope', '', '### Included', '', list(contract.scope.included), '', '### Excluded', '', list(contract.scope.excluded), '',
    '## Inputs', '', '| ID | Description | Required |', '| --- | --- | --- |',
    ...contract.inputs.map((item) => `| \`${item.id}\` | ${cell(item.description)} | ${item.required !== false ? 'yes' : 'no'} |`), '',
    '## Outputs', '', '| ID | Description | Required |', '| --- | --- | --- |',
    ...contract.outputs.map((item) => `| \`${item.id}\` | ${cell(item.description)} | ${item.required !== false ? 'yes' : 'no'} |`), '',
    '## Preconditions', '', ...contract.preconditions.map((item) => `- \`${item.id}\`: ${text(item.description)}${item.required ? ' (required)' : ''}`), '',
    '## Actors and systems', '',
    ...contract.actors.map((item) => `- Actor \`${item.id}\`: ${text(item.name)} (${item.type})`),
    ...contract.systems.map((item) => `- System \`${item.id}\`: ${text(item.name)} (${item.type})`), '',
    '## Procedure', '',
  ];
  for (const [index, step] of contract.steps.entries()) {
    lines.push(`<a id="step-${step.id}"></a>`, `### ${index + 1}. ${text(step.name)} (\`${step.id}\`)`, '',
      `Owner: \`${step.owner}\` · Kind: \`${step.kind}\` · Depends on: ${step.dependsOn.length ? step.dependsOn.map((id) => `\`${id}\``).join(', ') : 'none'}`, '',
      text(step.instructions), '',
      `Systems: ${step.systems.length ? step.systems.map((id) => `\`${id}\``).join(', ') : 'none'}  `,
      `Capabilities: ${step.capabilities.length ? step.capabilities.map(text).join(', ') : 'none'}  `,
      `Side effects: ${step.sideEffects} · Approval required: ${step.approvalRequired}  `,
      `Task inputs: ${cell(JSON.stringify(step.inputs))}  `,
      `Task outputs: ${cell(JSON.stringify(step.outputs))}  `,
      `Verification: ${cell(JSON.stringify(step.verify))}`, '',
      `Evidence: ${step.evidenceObligationIds.length ? step.evidenceObligationIds.map((id) => `\`${id}\``).join(', ') : 'none'}`, '');
  }
  lines.push('## Branches', '');
  for (const branch of contract.branches) {
    lines.push(`### Branch \`${branch.id}\` from \`${branch.fromStepId}\``, '');
    for (const item of branch.cases) lines.push(`<a id="branch-${branch.id}-case-${item.id}"></a>`, `- \`${item.id}\` → \`${item.targetStepId}\`: ${text(item.condition)}${item.otherwise ? ' (otherwise)' : ''}`);
    lines.push(`- Join: ${branch.joinStepId ? `\`${branch.joinStepId}\`` : 'none'}`, '');
  }
  lines.push('## Exceptions', '');
  for (const item of contract.exceptions) lines.push(`<a id="exception-${item.id}"></a>`, `- \`${item.id}\`: from \`${item.fromStepId}\` to \`${item.targetStepId}\` when ${text(item.condition)}; approval \`${item.approvalId}\`.`, '');
  lines.push('## Approvals', '');
  for (const item of contract.approvals) lines.push(`<a id="approval-${item.id}"></a>`, `- \`${item.id}\`: ${item.stage} by \`${item.roleId}\`; independent=${item.independent}; prohibited roles=${item.prohibitedRoleIds.length ? item.prohibitedRoleIds.map((id) => `\`${id}\``).join(', ') : 'none'}.`, '');
  lines.push('## Evidence obligations', '', ...contract.evidenceObligations.map((item) => `- \`${item.id}\` (${item.stepId || 'SOP'}): ${text(item.description)}${item.required ? ' (required)' : ''}`), '',
    '## Conformance policy', '', `- Maximum receipt age: ${contract.conformance.maxReceiptAgeMs} ms`, `- Skips allowed: ${contract.conformance.allowSkips}`, `- Real origin required: ${contract.conformance.requireRealOrigin}`, '');
  const markdown = `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
  return { protocol: 'aexos.sop-projection/v1', rendererVersion, projectionRevision: PROJECTION_REVISION,
    semanticHash: normalized.semanticHash, projectionHash: digest(markdown), markdown };
}

function expectedAnchors(contract) {
  return [`sop-${contract.sopId}`, ...contract.steps.map((item) => `step-${item.id}`),
    ...contract.branches.flatMap((branch) => branch.cases.map((item) => `branch-${branch.id}-case-${item.id}`)),
    ...contract.exceptions.map((item) => `exception-${item.id}`), ...contract.approvals.map((item) => `approval-${item.id}`)];
}

function verifyProjection(input, markdown, rendererVersion = RENDERER_VERSION) {
  const expected = renderSop(input, { rendererVersion });
  const actual = normalizedBytes(markdown); const wanted = normalizedBytes(expected.markdown);
  const missingAnchors = expectedAnchors(input).filter((anchor) => !actual.includes(`<a id="${anchor}"></a>`));
  const marker = actual.match(/<!-- aexos-sop ([^>]+) -->/)?.[1] || null;
  return { status: actual === wanted ? 'MATCH' : 'DRIFT', matches: actual === wanted,
    semanticHash: expected.semanticHash, expectedProjectionHash: digest(wanted), actualProjectionHash: digest(actual),
    missingAnchors, markerPresent: marker !== null, reason: actual === wanted ? null : missingAnchors.length ? 'ANCHOR_MISSING' : 'PROJECTION_BYTES_DIFFER' };
}

module.exports = { PROJECTION_REVISION, RENDERER_VERSION, renderSop, verifyProjection };
