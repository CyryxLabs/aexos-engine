#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const canonicalPath = path.resolve(
  __dirname,
  '../../../../.aexos-core/scripts/session-context-loader.js',
);

module.exports = require(canonicalPath);

if (require.main === module) {
  const result = spawnSync(process.execPath, [canonicalPath, ...process.argv.slice(2)], {
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  process.exitCode = result.status ?? 1;
}
