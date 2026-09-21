'use strict';

// Applicability refines execution obligations, never source identity or acceptance.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const stable = value => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  return value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])])) : value;
}
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const pairKey = pair => `${pair.scenario}@${pair.environment}`;
const baselinePairs = cap => cap.required_scenarios.flatMap(scenario =>
  cap.required_environments.map(environment => ({ scenario, environment })));
function contractHash(cap) {
  return digest(stable(Object.fromEntries(['id', 'upstream', 'aexos', 'required_scenarios',
    'required_environments', 'acceptance_criteria', 'scope_exception'].map(key => [key, cap[key]]))));
}

function localFile(root, relative) {
  if (!nonempty(relative) || path.isAbsolute(relative) || relative.includes('\\')) throw new Error('Expected relative POSIX evidence path');
  const absolute = path.resolve(root, relative);
  const inside = path.relative(root, absolute);
  if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) throw new Error(`Path outside review root: ${relative}`);
  let current = path.resolve(root);
  for (const part of inside.split(path.sep)) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`Linked applicability input: ${relative}`);
  }
  if (!fs.statSync(absolute).isFile()) throw new Error(`Not a regular applicability input: ${relative}`);
  return absolute;
}

function boundFiles(records, root, label) {
  if (!Array.isArray(records) || !records.length) throw new Error(`Missing ${label}`);
  const paths = new Set();
  for (const record of records) {
    if (!record || paths.has(record.path) || !/^[a-f0-9]{64}$/.test(record.sha256 || '')) throw new Error(`Invalid ${label}`);
    paths.add(record.path);
    if (digest(fs.readFileSync(localFile(root, record.path))) !== record.sha256) throw new Error(`Stale ${label}: ${record.path}`);
  }
  return paths;
}

function validateApplicability({ manifest, capabilities, source, root }) {
  const fail = message => { throw new Error(`Invalid applicability: ${message}`); };
  if (!manifest || manifest.schema_version !== 1 || !Array.isArray(manifest.capabilities) || !manifest.capabilities.length) fail('empty or unsupported manifest');
  if (manifest.upstream_commit !== source.upstream.commit) fail('upstream commit mismatch');
  const baseline = fs.readFileSync(localFile(root, 'docs/parity/baseline-lock.json'));
  if (manifest.baseline_lock_sha256 !== digest(baseline)) fail('baseline lock mismatch');
  if (!nonempty(manifest.reviewed_by) || !nonempty(manifest.reviewed_at) || Number.isNaN(Date.parse(manifest.reviewed_at))) fail('missing review attribution');
  const reviewFiles = boundFiles(manifest.review_evidence, root, 'review evidence');
  const expected = new Map(capabilities.map(cap => [cap.id, cap]));
  const sources = new Map(source.entries.map(entry => [entry.path, entry]));
  const requirements = new Map();
  for (const item of manifest.capabilities) {
    const cap = expected.get(item.id);
    if (!cap || requirements.has(item.id)) fail(`unknown or duplicate capability ${item.id}`);
    if (cap.scope_exception || cap.classification === 'blocked_access' || cap.verification?.blockers?.length) fail(`blocked/excepted capability ${item.id} cannot be curated`);
    if (item.baseline_contract_sha256 !== contractHash(cap)) fail(`changed baseline contract ${item.id}`);
    if (!Array.isArray(item.upstream_inputs) || !item.upstream_inputs.length) fail('missing upstream input bindings');
    const upstreamPaths = new Set();
    for (const input of item.upstream_inputs) {
      const original = sources.get(input.path);
      if (!original || original.type !== 'blob' || original.sha256 !== input.sha256 || upstreamPaths.has(input.path)) fail(`invalid upstream input ${input.path}`);
      upstreamPaths.add(input.path);
    }
    if (cap.upstream.paths.some(p => !upstreamPaths.has(p))) fail(`unbound upstream capability ${item.id}`);
    const candidatePaths = boundFiles(item.candidate_inputs, root, 'candidate inputs');
    if (cap.aexos.paths.some(p => !candidatePaths.has(p))) fail(`unbound candidate capability ${item.id}`);
    const originals = new Map(baselinePairs(cap).map(pair => [pairKey(pair), pair]));
    if (!Array.isArray(item.decisions) || item.decisions.length !== originals.size) fail(`omitted decisions ${item.id}`);
    const seen = new Set();
    const effective = new Map();
    const acceptPair = pair => {
      if (!pair || !['structure', 'behavior', 'installed'].includes(pair.scenario) ||
          !cap.required_environments.includes(pair.environment)) fail('replacement must name a concrete known scenario/environment');
      effective.set(pairKey(pair), { scenario: pair.scenario, environment: pair.environment });
    };
    for (const decision of item.decisions) {
      const key = pairKey(decision);
      if (!originals.has(key) || seen.has(key)) fail(`unknown or duplicate original pair ${key}`);
      seen.add(key);
      if (decision.disposition === 'applicable') {
        if (decision.replacements !== undefined) fail('applicable pair cannot carry replacements');
        acceptPair(decision);
        continue;
      }
      if (!['replace', 'not_applicable'].includes(decision.disposition)) fail(`invalid disposition ${key}`);
      if (!nonempty(decision.rationale) || !Array.isArray(decision.source_refs) || !decision.source_refs.length ||
          decision.source_refs.some(p => !upstreamPaths.has(p)) || !Array.isArray(decision.evidence_paths) ||
          !decision.evidence_paths.length || decision.evidence_paths.some(p => !reviewFiles.has(p))) fail(`missing source-backed rationale ${key}`);
      if (decision.disposition === 'replace') {
        if (!Array.isArray(decision.replacements) || !decision.replacements.length) fail(`empty replacement ${key}`);
        decision.replacements.forEach(acceptPair);
      } else {
        if (!['documentation_only', 'build_time_only', 'platform_specific', 'no_executable_effect'].includes(decision.reason_code) || decision.replacements !== undefined) fail(`unsupported non-applicability reason ${key}`);
      }
    }
    const pairs = [...effective.values()].sort((a, b) => pairKey(a).localeCompare(pairKey(b)));
    if (!pairs.some(pair => pair.scenario === 'structure')) fail(`vacuous/source-less capability ${item.id}`);
    // Only unequivocal prose documents can omit runtime/installed execution.
    // YAML tasks, manifests, package dependencies and ambiguous artifacts stay conservative.
    const proseOnly = cap.upstream.paths.every(p => /\.md$/i.test(p) &&
      (/^docs\//.test(p) || /(?:^|\/)README\.md$/i.test(p)));
    for (const scenario of ['behavior', 'installed']) {
      if (!proseOnly && cap.required_scenarios.includes(scenario) && !pairs.some(p => p.scenario === scenario)) fail(`runtime ${scenario} obligation removed for ${item.id}`);
    }
    for (const environment of cap.required_environments.filter(env => /live|controlled-service|authorized-pro/.test(env))) {
      if (baselinePairs(cap).filter(pair => pair.environment === environment)
        .some(pair => !effective.has(pairKey(pair)))) fail(`external environment cannot be waived: ${environment}`);
    }
    requirements.set(item.id, pairs);
  }
  return { manifest_sha256: digest(stable(manifest)), requirements };
}

function applyApplicability(inventory, validated, manifestPath) {
  return { ...inventory, applicability: { manifest_path: manifestPath, manifest_sha256: validated.manifest_sha256 },
    capabilities: inventory.capabilities.map(cap => validated.requirements.has(cap.id)
      ? { ...cap, required_pairs: validated.requirements.get(cap.id) } : cap) };
}

module.exports = { baselinePairs, contractHash, localFile, validateApplicability, applyApplicability };
