'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const yaml = require('js-yaml');

const rulesFiles = require('../../.aexos-core/core/doctor/checks/rules-files');
const claudeMd = require('../../.aexos-core/core/doctor/checks/claude-md');
const hooksClaudeCount = require('../../.aexos-core/core/doctor/checks/hooks-claude-count');

const CHECKS = [rulesFiles, claudeMd, hooksClaudeCount];

function writeConfig(root, selected, claudeCode) {
  const file = path.join(root, '.aexos-core', 'core-config.yaml');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, yaml.dump({ ide: { selected, configs: { 'claude-code': claudeCode } } }));
}

describe('Doctor IDE host awareness', () => {
  let root;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-doctor-host-')); });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  async function statuses() {
    return Promise.all(CHECKS.map((check) => check.run({ projectRoot: root })));
  }

  test('Codex-only canonical metadata marks Claude checks not applicable with evidence', async () => {
    writeConfig(root, ['codex'], false);
    const results = await statuses();
    expect(results.map((result) => result.status)).toEqual(['INFO', 'INFO', 'INFO']);
    for (const result of results) {
      expect(result.message).toMatch(/Claude Code is explicitly disabled.*codex/i);
      expect(result.fixCommand).toBeNull();
    }
  });

  test.each([
    [['claude-code'], true],
    [['codex', 'claude-code'], true],
  ])('Claude-selected metadata keeps missing Claude surfaces as failures', async (selected, enabled) => {
    writeConfig(root, selected, enabled);
    expect((await statuses()).map((result) => result.status)).toEqual(['FAIL', 'FAIL', 'FAIL']);
  });

  test('missing, malformed, and contradictory metadata fail closed', async () => {
    expect((await statuses()).map((result) => result.status)).toEqual(['FAIL', 'FAIL', 'FAIL']);

    const file = path.join(root, '.aexos-core', 'core-config.yaml');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'ide: [malformed');
    expect((await statuses()).map((result) => result.status)).toEqual(['FAIL', 'FAIL', 'FAIL']);

    writeConfig(root, ['codex'], true);
    expect((await statuses()).map((result) => result.status)).toEqual(['FAIL', 'FAIL', 'FAIL']);
  });
});
