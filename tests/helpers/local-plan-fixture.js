'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const phases = [
  ['create-story', 'create-next-story', 'sm'], ['validate-story', 'validate-next-story', 'po'],
  ['plan-implementation', 'plan-create-implementation', 'architect'], ['implement-story', 'dev-develop-story', 'dev'],
  ['run-tests', 'qa-run-tests', 'qa'], ['review-story', 'qa-review-story', 'qa'],
];
const DEFAULT_AFTER = 'module.exports = function add(a, b) { return Number(a) + Number(b); };\n';
const DEFAULT_TEST_SOURCE = [
  "const test = require('node:test');", "const assert = require('node:assert/strict');", "const add = require('./app.cjs');",
  "test('numeric interface remains stable', () => { assert.equal(add(2, 3), 5); assert.equal(add(-2, 3), 1); });",
  "test('numeric text is supported', () => { assert.equal(add('2', '3'), 5); });", '',
].join('\n');

function createLocalPlanFixture(root, {
  journey = 'greenfield',
  beforeIdentity = null,
  source = 'app.cjs',
  after = DEFAULT_AFTER,
  testFile = 'acceptance.test.cjs',
  testSource = DEFAULT_TEST_SOURCE,
  expectedTests = 2,
  testNames = ['numeric interface remains stable', 'numeric text is supported'],
  outputPrefix = '',
  story = 'mission.md',
} = {}) {
  root = fs.realpathSync(root);
  fs.mkdirSync(path.join(root, '.aexos'), { recursive: true });
  fs.writeFileSync(path.join(root, '.aexos/config.yaml'), 'permissions:\n  mode: auto\n');
  fs.writeFileSync(path.join(root, story), '# Story FIXTURE-1\n\n## Status\n\nReady\n\n## Acceptance Criteria\n\n- [ ] Preserve addition and verify approved behavior.\n');
  fs.writeFileSync(path.join(root, testFile), testSource);
  fs.writeFileSync(path.join(root, 'unrelated-dirty.txt'), 'Uncommitted customer requirements must remain unchanged.\n');
  const before = journey === 'greenfield' ? null : fs.readFileSync(path.join(root, source));
  const actualTest = { type: 'node-test', target: testFile, sha256: sha256(testSource),
    expectedTests, testNames };
  const createdStory = '# Story FIXTURE-1-IMPLEMENTATION\n\n## Status\n\nReady\n\n## Acceptance Criteria\n\n- [ ] Publish the approved source bytes.\n- [ ] Execute the named behavioral checks.\n';
  const phaseOutput = (id) => `${outputPrefix}${id}.json`;
  const run = { runVersion: 1, workflow: 'story-development-cycle', story, journey,
    phases: phases.map(([id]) => {
      const output = phaseOutput(id);
      let content;
      if (id === 'create-story') content = createdStory;
      else if (id === 'plan-implementation') content = `${JSON.stringify({
        planVersion: 1,
        source,
        afterSha256: sha256(after),
        testFile,
      }, null, 2)}\n`;
      else if (id === 'validate-story') content = `# Story validation target\n\nArtifact: ${phaseOutput('create-story')}\nRequired structure: title, lifecycle status, acceptance criteria.\n`;
      else if (id === 'implement-story') content = `# Implementation target\n\nSource: ${source}\nApproved after SHA-256: ${sha256(after)}\n`;
      else content = `# QA expected checks\n\nPhase: ${id}\nTest file: ${testFile}\nExpected tests: ${testNames.join('; ')}.\n`;
      const operations = [{ operation: 'guarded-create', target: output, contentBase64: Buffer.from(content).toString('base64') }];
      const inputs = { story, output };
      const checks = [{ type: 'utf8-sha256', stage: 'after', target: output, sha256: sha256(content) }];
      if (id === 'validate-story') {
        checks.push({ type: 'utf8-sha256', stage: 'after', target: phaseOutput('create-story'), sha256: sha256(createdStory) });
      }
      if (id === 'implement-story') {
        inputs.source = source;
        operations.unshift(journey === 'greenfield'
          ? { operation: 'guarded-create', target: source, contentBase64: Buffer.from(after).toString('base64') }
          : { operation: 'guarded-recoverable-replace', target: source, contentBase64: Buffer.from(after).toString('base64'),
            expectedBefore: { identity: beforeIdentity, sha256: sha256(before) }, isolatedWorkspace: true, allowAbsentName: true });
        checks.push({ type: 'utf8-sha256', stage: 'after', target: source, sha256: sha256(after) });
        if (before) checks.unshift({ type: 'utf8-sha256', stage: 'before', target: source, sha256: sha256(before) });
        if (journey === 'defect') checks.unshift({ ...actualTest, stage: 'before', expectedExit: 1 });
      }
      if (id === 'run-tests' || id === 'review-story') checks.push({ ...actualTest, stage: 'after', expectedExit: 0 });
      if (id === 'review-story') checks.push({ type: 'utf8-sha256', stage: 'after', target: 'unrelated-dirty.txt', sha256: sha256(fs.readFileSync(path.join(root, 'unrelated-dirty.txt'))) });
      return { id, inputs, operations, checks };
    }),
  };
  const policy = { policyVersion: 1, runHash: '', projectRoot: root, budgetScope: `fixture-${crypto.randomUUID()}`,
    budgetCeilingUsd: 1, allowChildProcessIO: true, grants: [],
  };
  const grants = new Map();
  for (const phase of run.phases) {
    const [, task, agentId] = phases.find(([id]) => id === phase.id);
    const add = (capability, action, target) => {
      const grant = { agentId, task, capability, action, resource: path.resolve(root, target), scope: root };
      grants.set(JSON.stringify(grant), grant);
    };
    phase.operations.forEach((operation) => add('filesystem', operation.operation, operation.target));
    phase.checks.forEach((check) => { add('filesystem', 'read', check.target); if (check.type === 'node-test') add('process', 'node-test', check.target); });
  }
  policy.grants = [...grants.values()];
  const persist = () => {
    const content = JSON.stringify(run, null, 2) + '\n';
    policy.runHash = sha256(content);
    fs.writeFileSync(path.join(root, 'run.json'), content);
    fs.writeFileSync(path.join(root, 'policy.json'), JSON.stringify(policy, null, 2) + '\n');
  };
  persist();
  return { run, policy, persist, source, after, testFile, testSource,
    runFile: path.join(root, 'run.json'), policyFile: path.join(root, 'policy.json') };
}

module.exports = { createLocalPlanFixture, sha256, DEFAULT_AFTER, DEFAULT_TEST_SOURCE };
