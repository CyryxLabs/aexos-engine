'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const cliBin = path.join(repoRoot, 'bin', 'aexos.js');
const { _testing } = require(cliBin);

describe('init first-value CLI contract', () => {
  it('documents the npm command and every supported non-interactive flag', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-init-help-'));

    try {
      const output = execFileSync('node', [cliBin, 'init', '--help'], {
        cwd: tempDir,
        encoding: 'utf8',
      });

      expect(output).toContain('npx @aexos/core init <project-name>');
      expect(output).toContain('--ci');
      expect(output).toContain('--yes, -y');
      expect(output).not.toContain('github:CyryxLabs/AEXOS');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it.each([
    [['--ci'], { ci: true, yes: false, force: true, quiet: true }],
    [['--yes'], { ci: false, yes: true, force: true, quiet: false }],
    [['-y'], { ci: false, yes: true, force: true, quiet: false }],
    [['--force'], { ci: false, yes: false, force: true, quiet: false }],
    [[], { ci: false, yes: false, force: false, quiet: false }],
  ])('parses and forwards init execution flags: %j', (args, expected) => {
    expect(_testing.parseInitExecutionFlags(args)).toEqual(expected);
  });

  it('reports installed agent definitions from cwd without counting memory directories', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-info-count-'));
    const agentsDir = path.join(tempDir, '.aexos-core', 'development', 'agents');

    try {
      fs.mkdirSync(path.join(agentsDir, 'dev'), { recursive: true });
      fs.writeFileSync(path.join(agentsDir, 'dev.md'), '# dev', 'utf8');
      fs.writeFileSync(path.join(agentsDir, 'qa.md'), '# qa', 'utf8');
      fs.writeFileSync(path.join(agentsDir, 'dev', 'MEMORY.md'), '# memory', 'utf8');

      const output = execFileSync('node', [cliBin, 'info'], {
        cwd: tempDir,
        encoding: 'utf8',
      });

      expect(output).toContain('Agents: 2');
      expect(output).not.toContain('Agents: 3');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
