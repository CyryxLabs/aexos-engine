'use strict';

const fs = require('fs');
const path = require('path');

const DECISIONS = new Set(['would_admit', 'would_deny', 'credential_missing', 'evaluation_error']);

function recordShadowDecision(event, targetDir = process.cwd()) {
  if (!event || !DECISIONS.has(event.decision)) throw new TypeError('Invalid shadow decision');
  const directory = path.join(targetDir, '.aexos', 'telemetry');
  fs.mkdirSync(directory, { recursive: true });
  const record = {
    schemaVersion: 1,
    observedAt: new Date().toISOString(),
    mode: event.mode,
    entrypoint: event.entrypoint || 'unknown',
    decision: event.decision,
    cohort: event.cohort === true,
  };
  fs.appendFileSync(path.join(directory, 'licensing-shadow.jsonl'), `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 });
  return record;
}

module.exports = { recordShadowDecision, DECISIONS };
