'use strict';
const fs = require('fs');
const path = require('path');
const { loadTaskContract } = require('../../.aexos-core/core/execution/task-contract');
const root = path.resolve(__dirname, '../..');
const tasks = path.join(root, '.aexos-core/development/tasks');

test.each(['create-next-story', 'dev-develop-story', 'qa-review-story', 'qa-run-tests', 'validate-next-story'])('reviewed %s contract requires real inputs, output and verification', (name) => {
  const result = loadTaskContract(path.join(tasks, name + '.md'), { projectRoot: root, enforcement: 'strict' });
  expect(result).toMatchObject({ status: 'contracted', valid: true, errors: [] });
  expect(result.contract.inputs.filter((input) => input.required).length).toBeGreaterThanOrEqual(2);
  expect(result.contract.produces.length).toBeGreaterThan(0);
  expect(result.contract.verify).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'file-exists' }),
    expect.objectContaining({ type: 'checklist', ref: 'selected-sdlc-phase' }),
  ]));
  if (name === 'dev-develop-story') expect(result.contract.produces.length).toBeGreaterThanOrEqual(2);
});
test('reviewed analysis contract preserves stdout and explicit successful-result verification', () => {
  const result = loadTaskContract(path.join(tasks, 'analyze-cross-artifact.md'), { projectRoot: root, enforcement: 'strict' });
  expect(result).toMatchObject({ status: 'contracted', valid: true, errors: [] });
  expect(result.contract.produces).toContainEqual(expect.objectContaining({ kind: 'stdout' }));
  expect(result.contract.verify).toContainEqual(expect.objectContaining({ type: 'result-status', expected: 'success' }));
});
test('reviewed security guidance retains adapter refusal and the separate authority boundary', () => {
  const source = fs.readFileSync(path.join(tasks, 'security-audit.md'), 'utf8');
  for (const expected of ['aexos database validate request.json --json', 'aexos database audit request.json --json', 'opaque lease', 'DATABASE_ADAPTER_UNAVAILABLE', 'Those actions require their own explicit authorization']) expect(source).toContain(expected);
});
test('reviewed release guidance retains protected review and the sealed manual transaction', () => {
  const source = fs.readFileSync(path.join(tasks, 'release-management.md'), 'utf8');
  for (const expected of ['.github/workflows/npm-publish.yml', 'manual `prepare`', 'manual `publish`', 'normal protected PR review and merge', 'Keep required protections active', 'immutable locator']) expect(source).toContain(expected);
  expect(source).not.toMatch(/gh\s+pr\s+merge[^\n]*--admin|npm\s+publish\s+--force/);
});
