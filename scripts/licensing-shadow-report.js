'use strict';

const fs = require('fs');
const path = require('path');

function buildReport(records, requiredEntrypoints = ['installer']) {
  const valid = records.filter((row) => row && row.schemaVersion === 1 && typeof row.entrypoint === 'string');
  const observedEntrypoints = [...new Set(valid.map((row) => row.entrypoint))].sort();
  const unknownEntrypoints = requiredEntrypoints.filter((entrypoint) => !observedEntrypoints.includes(entrypoint));
  const decisions = Object.fromEntries(
    ['would_admit', 'would_deny', 'credential_missing', 'evaluation_error'].map((decision) => [
      decision, valid.filter((row) => row.decision === decision).length,
    ]),
  );
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    total: valid.length,
    observedEntrypoints,
    requiredEntrypoints,
    unknownEntrypoints,
    decisionCoverage: valid.length ? 1 - (decisions.evaluation_error / valid.length) : 0,
    decisions,
    containsProjectContent: false,
  };
}

if (require.main === module) {
  const source = path.resolve(process.argv[2] || '.aexos/telemetry/licensing-shadow.jsonl');
  const required = (process.env.AEXOS_REQUIRED_LICENSE_ENTRYPOINTS || 'installer').split(',').map((v) => v.trim()).filter(Boolean);
  const records = fs.existsSync(source)
    ? fs.readFileSync(source, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
    : [];
  process.stdout.write(`${JSON.stringify(buildReport(records, required), null, 2)}\n`);
}

module.exports = { buildReport };
