'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
function check(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.vercel') continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) check(file);
    else if (/\.(?:js|mjs|cjs)$/.test(file)) execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  }
}
check(path.resolve(__dirname, '..'));
console.log('Dashboard JavaScript syntax check passed (no TypeScript typecheck claimed).');
