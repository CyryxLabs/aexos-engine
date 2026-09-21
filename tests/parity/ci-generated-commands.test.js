'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');
const { IntegrationSuggester } = require('../../.aexos-core/infrastructure/scripts/cicd-discovery');
const { PRReviewAI } = require('../../.aexos-core/infrastructure/scripts/pr-review-ai');
const { createDecisionProject } = require('../helpers/isolated-decision-project');
const reviewCli = path.resolve(__dirname, '../../.aexos-core/infrastructure/scripts/pr-review-ai.js');

describe('Executable CI guidance and truthful local security result', () => {
  let cleanup;
  beforeEach(() => { cleanup = createDecisionProject(); });
  afterEach(() => cleanup());
  const commit = content => {
    fs.writeFileSync('app.js', content);
    execFileSync('git', ['add', '--', 'app.js'], { stdio: 'pipe', windowsHide: true });
    execFileSync('git', ['-c', 'user.name=Parity Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'Fixture change'], { stdio: 'pipe', windowsHide: true });
  };
  test.each(['github-actions', 'gitlab-ci', 'jenkins', 'circleci'])('generates supported commands for %s with explicit prerequisites', provider => {
    const generator = new IntegrationSuggester();
    expect(generator.getCYRYXBuildStep(provider)).toContain('npm run build');
    expect(generator.getTestStep(provider)).toContain('test-discovery.js --run --coverage');
    expect(generator.getSecurityStep(provider)).toContain('pr-review-ai.js --local HEAD~1 --no-ai --security-only');
    expect(generator.getSecurityStep(provider)).not.toMatch(/(?:continue-on-error|allow_failure): true/);
  });
  test('real security CLI fails on a critical local finding', () => {
    commit('const password = "FAKE_TEST_VALUE_NOT_A_CREDENTIAL";\n');
    const result = spawnSync(process.execPath, [reviewCli, '--local', 'HEAD~1', '--no-ai', '--security-only'], { encoding: 'utf8', windowsHide: true });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('request_changes');
    expect(result.stdout).toContain('Potential hardcoded credential');
  });
  test('real security CLI succeeds for a clean change', () => {
    commit('module.exports = 42;\n');
    const result = spawnSync(process.execPath, [reviewCli, '--local', 'HEAD~1', '--no-ai', '--security-only'], { encoding: 'utf8', windowsHide: true });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Findings: 0');
  });
  test('treats untrusted base text as a git revision, never shell code', async () => {
    const reviewer = new PRReviewAI({ enableAI: false });
    await expect(reviewer.reviewLocal('HEAD; echo unsafe > injected.txt')).rejects.toThrow();
    expect(fs.existsSync('injected.txt')).toBe(false);
  });
});
