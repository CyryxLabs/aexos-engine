'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

describe('capability evidence CLI', () => {
  let root;
  const cli = path.resolve(__dirname, '../../bin/aexos.js');
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-evidence-cli-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });
  function run(args) {
    return spawnSync(process.execPath, [cli, 'capabilities', ...args], { cwd: root, encoding: 'utf8', timeout: 10000 });
  }
  test('real CLI verifies output and rejects a missing file', () => {
    const input = path.join(root, 'outcome.json');
    fs.writeFileSync(input, JSON.stringify({ contract: { contractVersion: 1, inputs: [],
      produces: [{ name: 'report', kind: 'file', path: 'report.md' }],
      verify: [{ type: 'file-exists', target: 'report.md' }] }, success: true, produced: ['report.md'] }));
    expect(run([`--verify=${input}`]).status).toBe(1);
    fs.writeFileSync(path.join(root, 'report.md'), 'report');
    const result = run([`--verify=${input}`]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).verdict).toBe('ACCEPTED');
  });
  test('real CLI ranks evidence and rejects conflicting modes', () => {
    const input = path.join(root, 'rubric.json');
    fs.writeFileSync(input, JSON.stringify({ criteria: [{ id: 'quality', weight: 1 }],
      sources: [{ id: 'pilot', reference: 'pilot.json' }],
      alternatives: [{ id: 'candidate', scores: { quality: { value: 90, sources: ['pilot'] } } }] }));
    const result = run([`--rank=${input}`]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).winner).toBe('candidate');
    expect(run([`--rank=${input}`, `--verify=${input}`]).status).toBe(1);
  });
});
