#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { localFile, validateApplicability, applyApplicability } = require('./applicability');
const path = require('path');
const { ROOT, OUTPUT, sha256, readJson, writeJson, git, tree, blobs, discover, candidateIdentity, verifyEvidence, verifyGraph, summarizeDrift } = require('./lib');

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}
function main() {
  const command = process.argv[2];
  if (command === 'applicability-help') {
    console.log('Optional reviewed docs/parity/applicability.json, or --applicability <workspace-relative.json>, is revalidated for inventory/diff/verify. Custom selection persists in inventory metadata. Manifest schema_version:1 requires upstream_commit, baseline_lock_sha256, reviewed_by/reviewed_at, review_evidence:[{path,sha256}], capabilities:[{id,baseline_contract_sha256,upstream_inputs:[{path,sha256}],candidate_inputs:[{path,sha256}],decisions:[{scenario,environment,disposition}]}]. Each original pair is applicable, replace (nonempty replacements), or not_applicable (reason_code). Changed decisions require rationale, source_refs and evidence_paths. Supported reason codes: documentation_only, build_time_only, platform_specific, no_executable_effect. All positive pairs still require full execution evidence. No approval, reconciliation or PASS is generated.');
    return;
  }
  const source = path.resolve(option('--upstream') || process.env.AEXOS_PARITY_UPSTREAM || path.join(ROOT, '../upstream'));
  const lockFile = path.join(OUTPUT, 'baseline-lock.json');
  if (command === 'freeze') {
    if (fs.existsSync(lockFile)) throw new Error('Baseline already frozen; drift review and reconciliation are required before replacement');
    const commit = git(source, ['rev-parse', 'HEAD']).trim();
    writeJson(lockFile, {
      schema_version: 1, frozen_at: new Date().toISOString(),
      upstream: { repository: 'https://github.com/SynkraAI/aiox-core.git', ref: 'main', commit, tree: git(source, ['rev-parse', 'HEAD^{tree}']).trim(), entries: tree(source).length },
      candidate: { repository: 'https://github.com/CyryxLabs/aexos-engine.git', commit: git(ROOT, ['rev-parse', 'HEAD']).trim(), tree: git(ROOT, ['rev-parse', 'HEAD^{tree}']).trim(), initial_status: 'clean isolated clone before story and implementation' },
      origin_baseline: 'unknown',
      environment: { platform: process.platform, arch: process.arch, node: process.version, git: git(ROOT, ['--version']).trim(), npm: '10.9.2' },
      locks: { upstream: sha256(fs.readFileSync(path.join(source, 'package-lock.json'))), candidate: sha256(fs.readFileSync(path.join(ROOT, 'package-lock.json'))) },
      safety: { upstream_read_only: true, submodules_initialized: false, external_model_calls_authorized: false, remote_writes_authorized: false },
    });
    console.log(`Frozen upstream ${commit}`);
    return;
  }
  if (command === 'identity') { console.log(JSON.stringify(candidateIdentity(), null, 2)); return; }
  if (command === 'drift') {
    const ref = option('--ref');
    if (!ref || ref.startsWith('-')) throw new Error('drift requires --ref <available-upstream-SHA>');
    const lock = readJson(lockFile);
    const next = git(source, ['rev-parse', '--verify', `${ref}^{commit}`]).trim();
    const before = tree(source, lock.upstream.commit);
    const after = tree(source, next);
    const discovered = discover(source);
    const report = summarizeDrift(before, after, blobs(source, before), blobs(source, after), discovered.inventory.capabilities, discovered.graph.edges);
    writeJson(path.join(OUTPUT, 'evidence/upstream-drift.json'), { locked: lock.upstream.commit, proposed: next, ...report });
    console.log(JSON.stringify({ locked: lock.upstream.commit, proposed: next, ...report, action: 'Reconcile changed contracts and reopen listed obligations; added paths need new inventory; lock unchanged' }, null, 2));
    process.exitCode = report.changes.length ? 1 : 0;
    return;
  }
  const discovered = discover(source);
  const inventoryPath = path.join(OUTPUT, 'capabilities.json');
  const previous = fs.existsSync(inventoryPath) ? readJson(inventoryPath) : null;
  const explicit = option('--applicability');
  if (process.argv.includes('--applicability') && (!explicit || explicit.startsWith('-'))) throw new Error('--applicability requires a workspace-relative manifest path');
  const manifestPath = explicit || previous?.applicability?.manifest_path ||
    (fs.existsSync(path.join(OUTPUT, 'applicability.json')) ? 'docs/parity/applicability.json' : null);
  const applicability = manifestPath ? readJson(localFile(ROOT, manifestPath)) : null;
  const validated = applicability ? validateApplicability({ manifest: applicability,
    capabilities: discovered.inventory.capabilities, source: discovered.source, root: ROOT }) : null;
  const effectiveInventory = validated ? applyApplicability(discovered.inventory, validated, manifestPath) : discovered.inventory;
  if (command === 'inventory' || command === 'diff') {
    if (command === 'inventory') {
      writeJson(path.join(OUTPUT, 'source-tree.json'), discovered.source);
      writeJson(path.join(OUTPUT, 'capabilities.json'), effectiveInventory);
      writeJson(path.join(OUTPUT, 'component-and-edge-map.json'), discovered.graph);
    }
    const counts = {};
    for (const node of discovered.graph.nodes) counts[node.classification] = (counts[node.classification] || 0) + 1;
    const report = { upstream: discovered.source.upstream, candidate: candidateIdentity(), tree_entries: discovered.graph.nodes.length,
      capability_obligations: discovered.inventory.capabilities.length, static_edges: discovered.graph.edges.length, classifications: counts,
      missing: discovered.graph.nodes.filter((node) => node.classification === 'missing').map((node) => ({ upstream: node.upstream.path, expected: node.aexos.path, kind: node.kind })),
      extensions: discovered.graph.aexos_extensions.length, semantic_reconciliation_complete: false,
    };
    writeJson(path.join(OUTPUT, 'diff.json'), report);
    console.log(JSON.stringify({ ...report, missing: report.missing.length }, null, 2));
    return;
  }
  if (command === 'verify') {
    const inventory = readJson(path.join(OUTPUT, 'capabilities.json'));
    const evidenceFile = path.join(OUTPUT, 'acceptance-evidence.json');
    const evidence = fs.existsSync(evidenceFile) ? readJson(evidenceFile) : null;
    const failures = verifyEvidence({ inventory, expectedCapabilities: discovered.inventory.capabilities, identity: candidateIdentity(), evidence, applicability, expectedSource: discovered.source });
    const graph = readJson(path.join(OUTPUT, 'component-and-edge-map.json'));
    failures.push(...verifyGraph(graph, discovered.graph));
    console.log(JSON.stringify({ verdict: failures.length ? 'FAIL' : 'PASS', failures: failures.length, first_failures: failures.slice(0, 20) }, null, 2));
    process.exitCode = failures.length ? 1 : 0;
    return;
  }
  throw new Error('Usage: node scripts/parity/index.js freeze|inventory|diff|verify|identity|drift|applicability-help [--upstream path] [--ref SHA] [--applicability workspace-relative.json]');
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(`[upstream-parity] ${error.message}`); process.exitCode = 1; }
}
module.exports = { main };
