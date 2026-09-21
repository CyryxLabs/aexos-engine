'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

describe.each(['utils', 'infrastructure/scripts'])('actual validator CLI through %s', directory => {
  const cli = path.resolve(__dirname, '../../.aexos-core', directory, 'aexos-validator.js');
  let root;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-validator-cli-')); });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  function run(...args) {
    return spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', windowsHide: true });
  }
  test('executes the checkbox gate and rejects malformed state', () => {
    fs.mkdirSync(path.join(root, 'docs/stories'), { recursive: true });
    const file = path.join(root, 'docs/stories/story.md');
    fs.writeFileSync(file, '# Story\n- [ ] Pending\n- [x] Complete\n```md\n- [bad] example\n```\n- [Reference](guide.md)\n');
    const accepted = run('stories');
    expect(accepted.status).toBe(0);
    expect(accepted.stdout).toContain('Checked 1 Markdown files and 2 checkboxes');
    fs.appendFileSync(file, '- [bad] actual malformed checkbox\n');
    const rejected = run('stories');
    expect(rejected.status).toBe(1);
    expect(rejected.stdout).toContain('Invalid checkbox state');
  });
  test('fails on an empty tree and an unsupported command', () => {
    expect(run('stories').status).toBe(1);
    expect(run('not-a-validator').status).toBe(1);
    expect(run('story').status).toBe(1);
  });
  test('passes the actual singular story path to structure validation', () => {
    const file = path.join(root, 'story with spaces.md');
    fs.writeFileSync(file, '# Story\n## Problem Statement\n## Proposed Solution\n## Acceptance Criteria\n');
    expect(run('story', file).status).toBe(0);
    fs.writeFileSync(file, '# Incomplete story\n');
    expect(run('story', file).status).toBe(1);
  });
});
