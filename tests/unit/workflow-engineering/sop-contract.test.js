'use strict';

const fs = require('fs');
const path = require('path');
const { normalizeSopContract, validateSopContract } = require('../../../.aexos-core/core/workflow-engineering/sop');

const fixturePath = path.resolve(__dirname, '../../fixtures/sop/straight-through.json');
const fixture = () => JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

describe('SOP v1 contract and graph', () => {
  it('validates and hashes a strict straight-through contract deterministically', () => {
    const first = normalizeSopContract(fixture()); const second = normalizeSopContract(fixture());
    expect(first.semanticHash).toMatch(/^[a-f0-9]{64}$/); expect(first).toEqual(second);
  });

  it.each([
    ['missing owner', (value) => { value.ownerRole = 'missing'; }, 'SOP_OWNER_UNKNOWN'],
    ['duplicate step', (value) => { value.steps.push(structuredClone(value.steps[0])); }, 'SOP_ID_DUPLICATE'],
    ['broken dependency', (value) => { value.steps[0].dependsOn = ['missing']; }, 'SOP_DEPENDENCY_UNKNOWN'],
    ['unknown system', (value) => { value.steps[0].systems = ['missing']; }, 'SOP_SYSTEM_UNKNOWN'],
    ['invalid approval role', (value) => { value.approvals[0].roleId = 'missing'; }, 'SOP_APPROVAL_ROLE_UNKNOWN'],
  ])('rejects %s before writes', (_name, mutate, code) => {
    const value = fixture(); mutate(value); expect(() => validateSopContract(value)).toThrow(expect.objectContaining({ code }));
  });

  it('rejects cycles across dependency and branch edges and ambiguous branches', () => {
    const value = fixture();
    value.steps.push({ ...structuredClone(value.steps[0]), id: 'archive-note', name: 'Archive note', dependsOn: ['write-note'], outputs: [{ name: 'archive', kind: 'file', path: 'artifacts/archive.md' }], verify: [{ type: 'file-exists', target: 'artifacts/archive.md' }] });
    value.branches = [{ id: 'route', fromStepId: 'archive-note', joinStepId: null, cases: [
      { id: 'retry', condition: 'retry', targetStepId: 'write-note', otherwise: false }, { id: 'stop', condition: 'otherwise', targetStepId: 'archive-note', otherwise: true },
    ] }];
    expect(() => validateSopContract(value)).toThrow(expect.objectContaining({ code: 'SOP_GRAPH_CYCLE' }));
    value.branches[0].fromStepId = 'write-note'; value.branches[0].cases[0].targetStepId = 'archive-note'; value.branches[0].cases[1].targetStepId = 'archive-note'; value.branches[0].cases[1].otherwise = false;
    expect(() => validateSopContract(value)).toThrow(expect.objectContaining({ code: 'SOP_BRANCH_AMBIGUOUS' }));
  });
});
