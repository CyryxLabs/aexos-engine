#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const input = (() => { try { return fs.readFileSync(0, 'utf8'); } catch (_) { return ''; } })();
if (input) {
  try {
    const stdout = execFileSync(process.execPath, [path.join(__dirname, 'precompact-session-digest.cjs')], {
      input, timeout: 12000, maxBuffer: 1024 * 1024, env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (stdout?.length) process.stdout.write(stdout);
  } catch (error) {
    if (error.stdout?.length) process.stdout.write(error.stdout);
  }
}
process.exitCode = 0;
