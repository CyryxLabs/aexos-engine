#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_ROOT = path.resolve(__dirname, '../..');
const CANONICAL_ROOT = '.aexos-core/product/templates';
const PROJECTION_ROOT = '.claude/templates';
const UPSTREAM_LICENSE = 'docs/legal/upstream-aiox-license.txt';

const PROJECTION_MAP = Object.freeze({
  'agent-template.yaml': { source: `${CANONICAL_ROOT}/agent-template.yaml` },
  'architecture-tmpl.yaml': { source: `${CANONICAL_ROOT}/architecture-tmpl.yaml` },
  'brainstorming-output-tmpl.yaml': {
    source: `${CANONICAL_ROOT}/brainstorming-output-tmpl.yaml`,
  },
  'brownfield-architecture-tmpl.yaml': {
    source: `${CANONICAL_ROOT}/brownfield-architecture-tmpl.yaml`,
  },
  'brownfield-prd-tmpl.yaml': { source: `${CANONICAL_ROOT}/brownfield-prd-tmpl.yaml` },
  'competitor-analysis-tmpl.yaml': {
    source: `${CANONICAL_ROOT}/competitor-analysis-tmpl.yaml`,
  },
  'database-schema-request-full.md': {
    upstreamDelta: true,
    sha256: '4d7d606339de485a0714dd14cdbc91bd3a75ce53c6a17c20f204a694761a4e88',
    license: UPSTREAM_LICENSE,
  },
  'database-schema-request-lite.md': {
    upstreamDelta: true,
    sha256: '2528c5d212f701f713fe9d9a1bf366fdb279fd705eee85cd7fdeb215a09f3bd1',
    license: UPSTREAM_LICENSE,
  },
  'front-end-architecture-tmpl.yaml': {
    source: `${CANONICAL_ROOT}/front-end-architecture-tmpl.yaml`,
  },
  'front-end-spec-tmpl.yaml': { source: `${CANONICAL_ROOT}/front-end-spec-tmpl.yaml` },
  'fullstack-architecture-tmpl.yaml': {
    source: `${CANONICAL_ROOT}/fullstack-architecture-tmpl.yaml`,
  },
  'market-research-tmpl.yaml': { source: `${CANONICAL_ROOT}/market-research-tmpl.yaml` },
  'prd-tmpl.yaml': { source: `${CANONICAL_ROOT}/prd-tmpl.yaml` },
  'project-brief-tmpl.yaml': { source: `${CANONICAL_ROOT}/project-brief-tmpl.yaml` },
  'qa-gate-tmpl.yaml': { source: `${CANONICAL_ROOT}/qa-gate-tmpl.yaml` },
  'story-tmpl.yaml': { source: `${CANONICAL_ROOT}/story-tmpl.yaml` },
  'task-template.md': { source: `${CANONICAL_ROOT}/task-template.md` },
  'workflow-template.yaml': { source: `${CANONICAL_ROOT}/workflow-template.yaml` },
});

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function syncClaudeTemplates({ root = DEFAULT_ROOT, check = false } = {}) {
  const changed = [];
  const errors = [];

  for (const [name, projection] of Object.entries(PROJECTION_MAP)) {
    const target = path.join(root, PROJECTION_ROOT, name);

    if (projection.upstreamDelta) {
      if (!fs.existsSync(target)) {
        errors.push(`${name}: missing retained upstream delta`);
        continue;
      }

      const actualHash = sha256(fs.readFileSync(target));
      if (actualHash !== projection.sha256) {
        errors.push(`${name}: retained upstream delta differs from frozen source`);
      }
      continue;
    }

    const source = path.join(root, projection.source);
    if (!fs.existsSync(source)) {
      errors.push(`${name}: canonical source missing (${projection.source})`);
      continue;
    }

    const expected = fs.readFileSync(source);
    const current = fs.existsSync(target) ? fs.readFileSync(target) : null;
    if (current && current.equals(expected)) continue;

    changed.push(name);
    if (check) continue;

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, expected);
  }

  if (check && changed.length) {
    errors.push(`canonical projections out of date: ${changed.join(', ')}`);
  }

  return { ok: errors.length === 0, changed, errors };
}

function runCli() {
  const check = process.argv.includes('--check');
  const result = syncClaudeTemplates({ check });
  const label = check ? 'checked' : 'synchronized';

  console.log(
    `Claude templates ${label}: ${Object.keys(PROJECTION_MAP).length}; changed: ${result.changed.length}`,
  );
  for (const error of result.errors) console.error(`- ${error}`);

  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) runCli();

module.exports = {
  CANONICAL_ROOT,
  PROJECTION_MAP,
  PROJECTION_ROOT,
  UPSTREAM_LICENSE,
  sha256,
  syncClaudeTemplates,
};
