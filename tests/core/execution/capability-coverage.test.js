'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { inspectCapabilityCoverage } = require(path.resolve(__dirname, '../../../.aexos-core/core/execution/capability-coverage'));

describe('registered squad coverage', () => {
  let root;
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  };
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-coverage-test-'));
    write('.aexos-core/development/tasks/legacy.md', '# Legacy');
    write('.aexos-core/data/squad-registry.yaml', 'squads:\n  - name: sample\n');
    write('squads/sample/squad.yaml', 'components:\n  tasks: [good.md, missing.md]\n');
    write('squads/sample/tasks/good.md', '---\ncontractVersion: 1\ninputs: []\nproduces: []\nverify:\n  - type: result-status\n    expected: success\n---\n# Task');
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  test('counts missing tasks as invalid and never infers operational readiness', () => {
    const result = inspectCapabilityCoverage(root);
    expect(result).toMatchObject({ total: 3, contracted: 1, hasErrors: true, runtimeReadiness: 'NOT_ASSESSED' });
    expect(result.groups[1]).toMatchObject({ total: 2, contracted: 1, invalid: 1, coveragePercent: 50 });
  });
  test('invalid or absent manifests remain visible', () => {
    write('squads/sample/squad.yaml', 'components:\n  tasks: [../../escape.md]\n');
    expect(inspectCapabilityCoverage(root).groups[1].errors).toHaveLength(1);
  });
  test('unregistered folders are not implicitly admitted', () => {
    write('squads/unregistered/tasks/task.md', '# Unregistered');
    expect(inspectCapabilityCoverage(root).groups.map((group) => group.name)).toEqual(['core', 'sample']);
  });
  test('duplicate registry identities fail closed', () => {
    write('.aexos-core/data/squad-registry.yaml', 'squads:\n  - name: sample\n  - name: sample\n');
    expect(() => inspectCapabilityCoverage(root)).toThrow(/duplicate/);
  });
});
