'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function createDecisionProject() {
  const cwd = process.cwd();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-decision-project-'));
  fs.mkdirSync(path.join(root, '.aexos-core'));
  fs.writeFileSync(path.join(root, '.aexos-core/core-config.yaml'), 'decisionLogging:\n  enabled: true\n');
  const gitOptions = { cwd: root, stdio: 'pipe', windowsHide: true, env: { ...process.env, GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } };
  execFileSync('git', ['init', '--quiet'], gitOptions);
  execFileSync('git', ['-c', 'user.name=Parity Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '--allow-empty', '-m', 'Local test fixture'], gitOptions);
  process.chdir(root);
  return () => { process.chdir(cwd); fs.rmSync(root, { recursive: true, force: true }); };
}

module.exports = { createDecisionProject };
