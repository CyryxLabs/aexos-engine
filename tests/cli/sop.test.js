'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '../..');
const fixture = path.join(root, 'tests/fixtures/sop/straight-through.json');
function cli(args) { return spawnSync(process.execPath, [path.join(root, 'bin/aexos.js'), 'workflow', 'sop', ...args], { cwd: root, encoding: 'utf8', timeout: 15000 }); }

describe('installed command tree SOP entry', () => {
  test('registers existing workflow leaf and validates a real local contract', () => {
    const help = cli(['--help']); expect(help.status).toBe(0); expect(help.stdout).toContain('verify-projection');
    const checked = cli(['validate', fixture]); expect(checked.status).toBe(0);
    expect(JSON.parse(checked.stdout).semanticHash).toMatch(/^[a-f0-9]{64}$/);
  });
  test('preview remains non-executable and standalone transition is denied', () => {
    const preview = cli(['preview', fixture]); expect(preview.status).toBe(0);
    expect(JSON.parse(preview.stdout).executable).toBe(false);
    const denied = cli(['transition']); expect(denied.status).toBe(4); expect(denied.stderr).toContain('SOP_AUTHORITY_UNAVAILABLE');
  });
  test('bounds raw bytes before JSON or projection parsing and hides hostile parse content', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-sop-cli-'));
    try {
      const large = path.join(directory, 'large.json');
      fs.writeFileSync(large, ' '.repeat(1024 * 1024 + 1) + fs.readFileSync(fixture, 'utf8'));
      const rejected = cli(['validate', large]);
      expect(rejected.status).toBe(4); expect(rejected.stderr).toContain('SOP_INPUT_LIMIT');
      fs.writeFileSync(large, 'sensitive-parse-marker');
      const malformed = cli(['validate', large]);
      expect(malformed.status).toBe(4); expect(malformed.stderr).not.toContain('sensitive-parse-marker');
      expect(cli(['validate', directory]).status).toBe(4);
      const projection = path.join(directory, 'projection.md'); fs.writeFileSync(projection, ' '.repeat(8 * 1024 * 1024 + 1));
      expect(cli(['verify-projection', fixture, projection]).stderr).toContain('SOP_INPUT_LIMIT');
      const original = path.join(directory, 'original.json'); fs.copyFileSync(fixture, original);
      const alias = path.join(directory, 'alias.json'); fs.linkSync(original, alias);
      try { expect(cli(['validate', alias]).status).toBe(4); } finally { fs.unlinkSync(alias); }
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
});
