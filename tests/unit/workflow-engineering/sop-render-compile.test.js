'use strict';

const fs = require('fs'); const path = require('path');
const { normalizeSopContract, previewSop, renderSop, verifyProjection } = require('../../../.aexos-core/core/workflow-engineering/sop');
const fixture = () => JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../fixtures/sop/straight-through.json'), 'utf8'));

describe('SOP projection and existing compiler adapter', () => {
  it('renders byte-stable Markdown and detects meaningful drift despite an intact marker', () => {
    const rendered = renderSop(fixture()); expect(renderSop(fixture())).toEqual(rendered);
    expect(rendered.markdown).toContain('<a id="step-write-note"></a>');
    expect(verifyProjection(fixture(), `\uFEFF${rendered.markdown.replace(/\n/g, '\r\n')}`).status).toBe('MATCH');
    expect(verifyProjection(fixture(), rendered.markdown.replace('Write the release note', 'Skip the release note'))).toMatchObject({ status: 'DRIFT', reason: 'PROJECTION_BYTES_DIFFER' });
    expect(verifyProjection(fixture(), rendered.markdown.replace('<a id="step-write-note"></a>', ''))).toMatchObject({ status: 'DRIFT', missingAnchors: ['step-write-note'] });
  });

  it('previews through the real workflow-map compiler deterministically without executable authority', () => {
    const first = previewSop(fixture(), { projectRoot: process.cwd() }); const second = previewSop(fixture(), { projectRoot: process.cwd() });
    expect(first).toEqual(second); expect(first.executable).toBe(false); expect(first.compilationMode).toBe('preview');
    expect(first.workflowMap.workflowId).toBe('sop-release-note-v1'); expect(first.compilerCheck.verdict).toBe('PASS');
    expect(first.semanticHash).toBe(normalizeSopContract(fixture()).semanticHash);
  });

  it('retains conditional and exception sidecars and blocks executable status', () => {
    const value = fixture();
    value.steps.push({ ...structuredClone(value.steps[0]), id: 'archive-note', name: 'Archive note', dependsOn: ['write-note'], outputs: [{ name: 'archive', kind: 'file', path: 'artifacts/archive.md' }], verify: [{ type: 'file-exists', target: 'artifacts/archive.md' }] });
    value.branches = [{ id: 'route', fromStepId: 'write-note', joinStepId: null, cases: [{ id: 'archive', condition: 'archive requested', targetStepId: 'archive-note', otherwise: false }, { id: 'default', condition: 'otherwise', targetStepId: 'archive-note', otherwise: true }] }];
    value.approvals.push({ id: 'exception-approval', stage: 'exception', roleId: 'approver', independent: true, prohibitedRoleIds: ['author'] });
    value.exceptions = [{ id: 'manual-recovery', fromStepId: 'write-note', condition: 'write failed', targetStepId: 'archive-note', approvalId: 'exception-approval' }];
    const result = previewSop(value); expect(result.executable).toBe(false); expect(result.controlFlow).toEqual({ branches: value.branches, exceptions: value.exceptions });
    expect(result.diagnostics).toEqual(expect.arrayContaining(['route-adapter-required', 'exception-adapter-required']));
  });
});
