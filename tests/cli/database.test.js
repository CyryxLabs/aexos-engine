'use strict';

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '../..');
const fixture = path.join(root, 'tests/fixtures/database-reliability/request.json');
const cli = (...args) => spawnSync(process.execPath, [path.join(root, 'bin/aexos.js'), 'database', ...args], { cwd: root, encoding: 'utf8', timeout: 15000 });

describe('database contract commands through the actual root CLI', () => {
  test('validates a bounded contract without asserting runtime availability', () => {
    const before = fs.readFileSync(fixture);
    const result = cli('validate', fixture, '--json');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: 'validated', sourceKind: 'request', adapterVerified: false });
    expect(fs.readFileSync(fixture).equals(before)).toBe(true);
  });
  test('audit reports unavailable and the leaf exposes no mutation or raw SQL controls', () => {
    const result = cli('audit', fixture, '--json');
    expect(result.status).toBe(4);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: 'unavailable', code: 'DATABASE_ADAPTER_UNAVAILABLE' });
    const help = cli('--help'); expect(help.status).toBe(0); expect(help.stdout).toContain('validate');
    for (const args of [['apply', fixture], ['audit', fixture, '--sql=SELECT 1'], ['audit', fixture, '--output=unexpected.json']]) {
      expect(cli(...args).status).not.toBe(0);
    }
    expect(fs.existsSync(path.join(root, 'unexpected.json'))).toBe(false);
  });
});
