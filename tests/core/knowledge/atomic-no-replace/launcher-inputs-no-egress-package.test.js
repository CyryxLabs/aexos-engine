'use strict';

const fs = require('fs');
const path = require('path');

describe('B2P1B0P package and no-authority boundary', () => {
  test('does not materialize launcher PASS or include evidence/controllers in the package file list', () => {
    const root = path.resolve(__dirname, '..', '..', '..', '..');
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(packageJson.files).not.toContain('artifacts/');
    expect(packageJson.files).not.toContain('tests/');
    const evidenceRoot = path.join(root, 'artifacts', 'b2p-launcher-inputs-host-local');
    const pending = fs.existsSync(evidenceRoot) ? [evidenceRoot] : [];
    const launcherReceipts = [];
    while (pending.length > 0) {
      const current = pending.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const entryPath = path.join(current, entry.name);
        if (entry.isDirectory()) pending.push(entryPath);
        if (entry.isFile() && entry.name === 'launcher-host-test-receipt.json') {
          launcherReceipts.push(entryPath);
        }
      }
    }
    expect(launcherReceipts).toEqual([]);
  });
});
