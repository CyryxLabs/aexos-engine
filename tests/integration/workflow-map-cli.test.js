'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

describe('aexos workflow map CLI', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-workflow-cli-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function input(kind = 'deterministic') {
    return {
      workflowId: 'cli-process', name: 'CLI Process', objective: 'Compile one step',
      trigger: 'Fixture starts', outcome: 'Fixture ends',
      actors: [{ id: 'owner', name: 'Owner', type: kind === 'agentic' ? 'agent' : 'human' }],
      systems: [],
      steps: [{
        id: 'do-work', name: 'Do work', owner: 'owner', kind, dependsOn: [], systems: [],
        capabilities: kind === 'agentic' ? ['model:invoke'] : [], sideEffects: false,
        approvalRequired: false,
        inputs: [{ name: 'request', type: 'object', required: true }],
        outputs: [{ name: 'result', kind: 'state' }],
        verify: [{ type: 'result-status', expected: 'complete' }],
      }],
    };
  }

  function run(payload, json = false) {
    const file = path.join(tempDir, 'process.json');
    fs.writeFileSync(file, JSON.stringify(payload));
    return spawnSync(process.execPath, [
      path.join(process.cwd(), 'bin', 'aexos.js'), 'workflow', 'map', file,
      ...(json ? ['--json'] : []),
    ], { cwd: process.cwd(), encoding: 'utf8' });
  }

  it('returns PASS as JSON without executing the workflow', () => {
    const result = run(input(), true);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      workflowId: 'cli-process',
      qa: { verdict: 'PASS', contractedTasks: 1 },
    });
  });

  it('returns CONCERNS for governed agentic work', () => {
    const result = run(input('agentic'));
    expect(result.status).toBe(2);
    expect(result.stdout).toContain('Workflow QA: CONCERNS');
  });

  it('returns exit 4 for invalid topology without a false PASS', () => {
    const payload = input();
    payload.steps[0].dependsOn = ['missing'];
    const result = run(payload);
    expect(result.status).toBe(4);
    expect(result.stderr).toContain('[WORKFLOW_DEPENDENCY_UNKNOWN]');
    expect(result.stdout).not.toContain('Workflow QA: PASS');
  });
});
