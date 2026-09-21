'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { mapPath, pathContract } = require('./path-contracts');

const ROOT = path.resolve(__dirname, '../..');
const OUTPUT = path.join(ROOT, 'docs/parity');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const stable = (value) => JSON.stringify(value);
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}
function git(root, args, options = {}) {
  return execFileSync('git', ['-c', 'core.quotepath=false', '-C', root, ...args], {
    encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, ...options,
  });
}
function tree(root, ref = 'HEAD') {
  return git(root, ['ls-tree', '-rz', '--full-tree', ref]).split('\0').filter(Boolean).map((line) => {
    const match = /^(\d+) (\w+) ([a-f0-9]+)\t([\s\S]+)$/.exec(line);
    if (!match) throw new Error('Invalid git tree record');
    return { mode: match[1], type: match[2], oid: match[3], path: match[4] };
  });
}
// One batched object read preserves original bytes, executable modes and gitlinks.
// No API pagination, checked-out newline conversion, or directory exclusions.
function blobs(root, entries) {
  const ids = [...new Set(entries.filter((entry) => entry.type === 'blob').map((entry) => entry.oid))];
  const output = git(root, ['cat-file', '--batch'], { input: ids.join('\n') + '\n', encoding: null });
  const result = new Map();
  let cursor = 0;
  for (const oid of ids) {
    const end = output.indexOf(10, cursor);
    const header = output.subarray(cursor, end).toString();
    const match = /^([a-f0-9]+) blob (\d+)$/.exec(header);
    if (!match || match[1] !== oid) throw new Error('Incomplete source object stream');
    const size = Number(match[2]);
    result.set(oid, output.subarray(end + 1, end + 1 + size));
    cursor = end + size + 2;
  }
  if (cursor !== output.length) throw new Error('Unexpected source object stream length');
  return result;
}
function workingSnapshot(root = ROOT) {
  const snapshot = new Map(tree(root).map((entry) => [entry.path, { ...entry, bytes: null }]));
  const changed = new Set(git(root, ['diff', '--name-only', '-z', 'HEAD', '--']).split('\0').filter(Boolean));
  for (const file of git(root, ['ls-files', '-z', '--others', '--exclude-standard']).split('\0').filter(Boolean)) changed.add(file);
  for (const file of changed) {
    if (isEvidenceOutput(file)) continue;
    const full = path.join(root, file);
    if (!fs.existsSync(full)) { snapshot.delete(file); continue; }
    const stat = fs.lstatSync(full);
    if (!stat.isFile() && !stat.isSymbolicLink()) continue;
    const bytes = stat.isSymbolicLink() ? Buffer.from(fs.readlinkSync(full)) : fs.readFileSync(full);
    snapshot.set(file, { path: file, mode: stat.isSymbolicLink() ? '120000' : '100644', type: 'blob', oid: null, sha256: sha256(bytes), bytes });
  }
  return snapshot;
}
function isEvidenceOutput(file) {
  return /^docs\/parity\/(?:baseline-lock\.json|source-tree\.json|capabilities\.json|component-and-edge-map\.json|acceptance-evidence\.json|diff\.json|PARITY-REPORT\.md|CONTINUATION\.md|delta-register\.md|evidence\/)/.test(file);
}
function candidateIdentity(root = ROOT) {
  const entries = [...workingSnapshot(root)].filter(([file]) => !isEvidenceOutput(file))
    .sort(([a], [b]) => a.localeCompare(b)).map(([file, entry]) => [file, entry.mode, entry.oid ? `git:${entry.oid}` : `sha256:${entry.sha256}`]);
  return {
    commit: git(root, ['rev-parse', 'HEAD']).trim(),
    tree_digest: sha256(stable(entries)),
    digest_definition: 'sha256 of sorted [path,mode,git-object-id-or-sha256-working-bytes]; tracked deletions and untracked source included; generated parity evidence excluded',
    files: entries.length,
  };
}
function readLockedSource(source, root = ROOT) {
  const lock = readJson(path.join(root, 'docs/parity/baseline-lock.json'));
  const actual = git(source, ['rev-parse', 'HEAD']).trim();
  if (actual !== lock.upstream.commit) throw new Error(`Upstream drift: locked ${lock.upstream.commit}, got ${actual}`);
  const entries = tree(source, actual);
  if (git(source, ['rev-parse', `${actual}^{tree}`]).trim() !== lock.upstream.tree) throw new Error('Upstream tree mismatch');
  return { lock, entries, contents: blobs(source, entries) };
}
function fileKind(file) {
  if (/^(?:tests\/|audits\/|outputs\/)|(?:^|\/)(?:__tests__|fixtures)\/|\.(?:test|spec)\.[cm]?js$/.test(file)) return 'test_or_evidence';
  if (/^(?:CHANGELOG|docs\/(?:framework\/epics|stories|qa|reports|archive|research))/.test(file)) return 'historical_or_planning';
  if (/^(?:LICENSE|CODE_OF_CONDUCT|CONTRIBUTING)|(?:^|\/)(?:\.gitkeep|\.DS_Store)$/.test(file)) return 'governance';
  return 'operational';
}
function subsystem(file) {
  const match = /\.aiox-core\/(?:core|infrastructure|development|product)\/([^/]+)/.exec(file);
  return match ? match[1] : file.split('/')[0];
}
function environments(file) {
  if (/grok/.test(file)) return ['windows-node', 'grok-live'];
  if (/^\.claude\//.test(file)) return ['windows-node', 'claude-code-live'];
  if (/^\.codex\//.test(file)) return ['windows-node', 'codex-live'];
  if (/gemini/.test(file)) return ['windows-node', 'gemini-live'];
  if (/^\.cursor\//.test(file)) return ['cursor-live'];
  if (/^\.antigravity\//.test(file)) return ['antigravity-live'];
  if (/docker|mcp/.test(file)) return ['windows-node', 'controlled-service'];
  if (file === 'pro') return ['authorized-pro'];
  return ['windows-node', 'linux-node', 'darwin-node'];
}
function discover(source, root = ROOT) {
  const { lock, entries, contents } = readLockedSource(source, root);
  const exceptionPath = path.join(root, 'docs/parity/scope-exceptions.json');
  const exceptions = fs.existsSync(exceptionPath) ? readJson(exceptionPath).exceptions : [];
  const exceptionFor = (entry) => exceptions.find((item) => item.authorized_by === 'owner' && item.authorization && item.upstream_commit === lock.upstream.commit && item.upstream_path === entry.path && entry.type === 'commit' && item.gitlink === entry.oid);
  const snapshot = workingSnapshot(root);
  const candidate = new Set(snapshot.keys());
  const upstreamPaths = new Set(entries.map((entry) => entry.path));
  const mapped = new Set();
  const nodes = entries.map((entry) => {
    const mapping = pathContract(entry.path);
    const target = mapping.paths[0];
    const candidateEntry = snapshot.get(target);
    const exists = Boolean(candidateEntry);
    const sourceBytes = contents.get(entry.oid);
    const targetBytes = candidateEntry && candidateEntry.bytes;
    if (exists) mapped.add(target);
    return {
      upstream: { ...entry, sha256: sourceBytes ? sha256(sourceBytes) : null },
      aexos: { path: target, mapping, exists, oid: candidateEntry && candidateEntry.oid, mode: candidateEntry && candidateEntry.mode, sha256: targetBytes ? sha256(targetBytes) : null },
      kind: fileKind(entry.path),
      scope_exception: exceptionFor(entry) || null,
      classification: entry.type === 'commit' ? 'blocked_access' : !exists ? 'missing' :
        candidateEntry.oid === entry.oid || (targetBytes && sourceBytes.equals(targetBytes)) ? 'equivalent' : 'unclassified',
      // Byte equality is structural evidence only. No behavioral PASS is inferred.
      reconciled: false,
    };
  });
  const edges = [];
  for (const entry of entries.filter((item) => item.type === 'blob')) {
    const bytes = contents.get(entry.oid);
    if (bytes.includes(0)) continue;
    const text = bytes.toString('utf8');
    const patterns = [
      { regex: /(?:require\(|from\s+|import\()\s*['"]([^'"]+)['"]/g, kind: 'module' },
      { regex: /\]\(([^)\s]+)\)/g, kind: 'document-reference' },
      { regex: /(?:^|\s)(\.aiox-core\/[^\s`'"<>),;]+|\.aiox\/[^\s`'"<>),;]+)/gm, kind: 'operational-path' },
    ];
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern.regex)) {
        const spec = match[1].split('#')[0];
        if (!spec || /^(?:https?:|mailto:|data:)/.test(spec)) continue;
        const local = spec.startsWith('.') && !spec.startsWith('.aiox') ? path.posix.normalize(path.posix.join(path.posix.dirname(entry.path), spec)) : spec;
        const resolved = [local, local + '.js', local + '.json', local + '/index.js'].find((item) => upstreamPaths.has(item));
        edges.push({
          source: entry.path, line: text.slice(0, match.index).split('\n').length,
          interface: spec, destination: resolved || null, kind: pattern.kind,
          aexos_destination: resolved ? pathContract(resolved).paths[0] : null,
          condition: 'Requires contract reconciliation; static reference does not prove invocation',
          expected_effect: null, expected_failure: null, tests: [], verified: false,
        });
      }
    }
  }
  const caps = [];
  const discoveredContracts = new Set();
  function add(file, contract, entrypoint, classification, dependencyNames = []) {
    const contractKey = file + ':' + contract;
    // Command examples may repeat the canonical command declaration in prose.
    if (discoveredContracts.has(contractKey)) return;
    discoveredContracts.add(contractKey);
    const node = nodes.find((item) => item.upstream.path === file);
    const mapping = pathContract(file);
    const requiredEnvs = environments(file);
    caps.push({
      id: `CAP-${sha256(contractKey).slice(0, 16)}`,
      subsystem: subsystem(file), contract,
      upstream: { commit: lock.upstream.commit, paths: [file], entrypoints: [entrypoint],
        callers: [...new Set(edges.filter((edge) => edge.destination === file).map((edge) => edge.source))],
        required_artifacts: [file], evidence: [node.upstream.oid], dependencies: dependencyNames },
      aexos: { paths: mapping.paths, entrypoints: mapping.kind === 'generated' ? mapping.entrypoints : [mapPath(entrypoint)],
        callers: [...new Set(edges.filter((edge) => edge.destination === file).map((edge) => mapPath(edge.source)))],
        required_artifacts: mapping.paths, mapping_kind: mapping.kind, generated_outputs: mapping.outputs },
      classification,
      scope_exception: node.scope_exception,
      required_scenarios: ['structure', 'behavior', 'installed'],
      required_environments: requiredEnvs,
      acceptance_criteria: ['Preserve the full upstream contract, valid failure behavior and reachable installed entrypoint', 'All required scenarios and environments have current, nonempty execution evidence'],
      verification: { status: node.scope_exception ? 'excluded_by_owner' : classification === 'blocked_access' ? 'blocked' : 'unverified', tests: [], evidence_paths: [],
        blockers: classification === 'blocked_access' ? [`Authorized source/artifact required for gitlink ${node.upstream.oid}`] : [] },
    });
  }
  for (const node of nodes) {
    if (node.kind !== 'operational' && node.upstream.type !== 'commit') continue;
    const file = node.upstream.path;
    const bytes = contents.get(node.upstream.oid);
    const text = bytes && !bytes.includes(0) ? bytes.toString('utf8') : '';
    const dependencies = [...new Set(edges.filter((edge) => edge.source === file && edge.kind === 'module').map((edge) => edge.interface))];
    add(file, 'complete-artifact-contract', file, node.classification, dependencies);
    if (/(?:^|\/)package\.json$/.test(file)) {
      const pkg = JSON.parse(text);
      for (const section of ['bin', 'scripts', 'exports', 'dependencies', 'optionalDependencies']) {
        const value = pkg[section];
        for (const [name, spec] of Object.entries(typeof value === 'object' && value || {})) {
          add(file, `${section}:${name}`, typeof spec === 'string' ? spec : JSON.stringify(spec), 'unclassified', section.includes('Dependencies') || section === 'dependencies' ? [name] : []);
        }
      }
    }
    if (/\.aiox-core\/development\/agents\/[^/]+\.md$/.test(file)) {
      for (const match of text.matchAll(/^\s+-\s+name:\s*['"]?([^\s'"#]+).*$/gm)) {
        add(file, `agent-command:${match[1]}`, `${file}#${match[1]}`, 'unclassified', dependencies);
      }
    }
  }
  const ids = caps.map((cap) => cap.id);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate capability identity');
  return {
    source: { schema_version: 1, upstream: lock.upstream, entries: entries.map((entry) => ({ ...entry, sha256: contents.has(entry.oid) ? sha256(contents.get(entry.oid)) : null })) },
    graph: { schema_version: 1, tree_complete: true, semantic_reconciliation_complete: false, nodes, edges,
      aexos_extensions: [...candidate].filter((file) => !mapped.has(file) && !isEvidenceOutput(file)).sort() },
    inventory: { schema_version: 1, upstream: lock.upstream, tree_complete: true,
      semantic_reconciliation_complete: false,
      discovery_note: 'Conservative artifact obligations plus package and agent-command contracts. Static discovery is not complete semantic reconciliation or behavioral proof. All source files remain in source-tree and component map.',
      capabilities: caps },
  };
}
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
function isSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
function isPathInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
function hasLocalEvidence(paths, root) {
  return Array.isArray(paths) && paths.length > 0 && paths.every((file) => {
    if (!isNonEmptyString(file)) return false;
    const resolved = path.resolve(root, file);
    return isPathInside(root, resolved) && fs.existsSync(resolved) && fs.statSync(resolved).isFile();
  });
}
function hasCapabilityVerificationEvidence(cap, root) {
  const verification = cap && cap.verification;
  return verification && verification.status === 'passed' && Array.isArray(verification.blockers) &&
    verification.blockers.length === 0 && hasLocalEvidence(verification.tests, root) &&
    hasLocalEvidence(verification.evidence_paths, root);
}
function hasInstalledConsumerBinding(record, root) {
  const binding = record && record.consumer_binding;
  const pathFields = ['consumer_path', 'consumer_realpath', 'package_root', 'package_realpath'];
  const hashFields = ['package_json_sha256', 'cli_sha256', 'artifact_sha256'];
  if (!binding || !isNonEmptyString(binding.id) || binding.observed_exists !== true ||
      !isNonEmptyString(binding.observed_at) || Number.isNaN(Date.parse(binding.observed_at)) ||
      pathFields.some((key) => !isNonEmptyString(binding[key]) || !path.isAbsolute(binding[key]) || isPathInside(root, binding[key])) ||
      hashFields.some((key) => !isSha256(binding[key])) || binding.artifact_sha256 !== record.artifact_sha256 ||
      record.isolated_consumer !== binding.consumer_realpath) return false;
  if (!Array.isArray(record.execution_steps) || record.execution_steps.length === 0) return false;
  const labels = new Set();
  for (const step of record.execution_steps) {
    if (!step || !isNonEmptyString(step.label) || labels.has(step.label) ||
        step.exit_code !== (step.expected_exit_code ?? 0) || !isNonEmptyString(step.log_path) ||
        !isSha256(step.log_sha256) || !fs.existsSync(step.log_path) ||
        !fs.statSync(step.log_path).isFile() || sha256(fs.readFileSync(step.log_path)) !== step.log_sha256) return false;
    labels.add(step.label);
  }
  return true;
}
function verifyEvidence({ inventory, expectedCapabilities, expectedIds, identity, evidence, root = ROOT, applicability, expectedSource }) {
  const failures = [];
  const caps = inventory && inventory.capabilities;
  if (!Array.isArray(caps) || caps.length === 0) return ['Empty capability inventory'];
  const { validateApplicability, baselinePairs } = require('./applicability');
  let curated;
  if (applicability) {
    try {
      if (!expectedCapabilities || !expectedSource) throw new Error('Independent applicability source required');
      curated = validateApplicability({ manifest: applicability, capabilities: expectedCapabilities, source: expectedSource, root });
      if (inventory.applicability?.manifest_sha256 !== curated.manifest_sha256) failures.push('Applicability manifest binding differs');
    } catch (error) { failures.push(error.message); }
  } else if (inventory.applicability) failures.push('Missing bound applicability manifest');
  const ids = caps.map((cap) => cap.id);
  expectedIds = expectedCapabilities ? expectedCapabilities.map((cap) => cap.id) : expectedIds;
  if (new Set(ids).size !== ids.length) failures.push('Duplicate capabilities');
  if (stable([...ids].sort()) !== stable([...expectedIds].sort())) failures.push('Inventory differs from independently rediscovered upstream obligations');
  if (!inventory.tree_complete || !inventory.semantic_reconciliation_complete) failures.push('Inventory or semantic reconciliation incomplete');
  if (!evidence || evidence.upstream_commit !== inventory.upstream.commit) failures.push('Missing/mismatched upstream evidence');
  if (!evidence || !evidence.candidate || evidence.candidate.commit !== identity.commit || evidence.candidate.tree_digest !== identity.tree_digest) failures.push('Stale or mismatched candidate evidence');
  if (!evidence || evidence.semantic_reconciliation_complete !== true || evidence.acceptance_status !== 'COMPLETE') failures.push('Incomplete acceptance evidence envelope');
  const records = evidence && evidence.records;
  if (!Array.isArray(records) || records.length === 0) failures.push('Empty execution evidence');
  for (const cap of caps) {
    const expected = expectedCapabilities && expectedCapabilities.find((item) => item.id === cap.id);
    if (expected && ['upstream', 'aexos', 'required_scenarios', 'required_environments', 'acceptance_criteria', 'scope_exception'].some((key) => stable(cap[key]) !== stable(expected[key]))) failures.push(`${cap.id}: contract differs from upstream discovery`);
    if (expected && expected.scope_exception && stable(expected.scope_exception) === stable(cap.scope_exception)) continue;
    if (expected && (expected.classification === 'blocked_access' || expected.verification.blockers.length)) failures.push(`${cap.id}: upstream access obligation remains blocked`);
    if (!cap.verification || cap.verification.status !== 'passed' || cap.verification.blockers.length) failures.push(`${cap.id}: not fully verified`);
    else if (!hasCapabilityVerificationEvidence(cap, root)) failures.push(`${cap.id}: semantic verification lacks bound evidence`);
    if (!['identity_only', 'equivalent', 'corrective_divergence'].includes(cap.classification)) failures.push(`${cap.id}: unresolved ${cap.classification}`);
    if (!cap.required_scenarios.length || !cap.required_environments.length || !cap.aexos.paths.length || !cap.aexos.entrypoints.length) {
      failures.push(`${cap.id}: incomplete contract`); continue;
    }
    for (const file of cap.aexos.required_artifacts) if (!fs.existsSync(path.join(root, file))) failures.push(`${cap.id}: missing ${file}`);
    const requiredPairs = curated?.requirements.get(cap.id);
    if (stable(cap.required_pairs) !== stable(requiredPairs)) failures.push(`${cap.id}: unvalidated applicability pairs`);
    for (const { scenario, environment } of requiredPairs || baselinePairs(expected || cap)) {
      const matchingRecords = (records || []).filter((item) => item.capability_id === cap.id && item.scenario === scenario && item.environment === environment);
      const record = matchingRecords.find((item) => item.coverage_scope === 'full_contract' && !item.coverage_limit);
      if (!record && matchingRecords.length > 0) {
        failures.push(`${cap.id}: partial coverage cannot satisfy ${scenario}@${environment}`);
        continue;
      }
      if (!record || record.status !== 'passed' || record.exit_code !== 0 || !(record.assertions > 0) || !record.command || !record.input || !record.output || !record.evidence_path || !record.evidence_sha256) {
        failures.push(`${cap.id}: missing/failed ${scenario}@${environment}`); continue;
      }
      const evidencePath = path.resolve(root, record.evidence_path);
      const relative = path.relative(root, evidencePath);
      if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(evidencePath) || sha256(fs.readFileSync(evidencePath)) !== record.evidence_sha256) {
        failures.push(`${cap.id}: invalid/tampered evidence`);
      } else {
        try {
          const execution = readJson(evidencePath);
          const result = execution.results && execution.results.find((item) => item.capability_id === cap.id && item.scenario === scenario && item.environment === environment && item.coverage_scope === 'full_contract' && !item.coverage_limit);
          if (execution.schema_version !== 1 || execution.kind !== 'aexos-parity-execution' ||
              execution.candidate.tree_digest !== identity.tree_digest || execution.candidate.commit !== identity.commit || execution.upstream_commit !== inventory.upstream.commit ||
              !result || ['status', 'exit_code', 'assertions', 'command', 'input', 'output', 'coverage_scope', 'coverage_limit', ...(scenario === 'installed' ? ['artifact_sha256', 'artifact_path', 'isolated_consumer', 'consumer_binding', 'execution_steps', 'packaged_paths'] : [])].some((key) => stable(result[key]) !== stable(record[key]))) failures.push(`${cap.id}: invalid execution result contract`);
        } catch { failures.push(`${cap.id}: unreadable execution result contract`); }
      }
      if (record.candidate_digest !== identity.tree_digest || record.upstream_commit !== inventory.upstream.commit) failures.push(`${cap.id}: record from another candidate/upstream`);
      if (scenario === 'installed' && (!record.artifact_sha256 || !record.isolated_consumer || !Array.isArray(record.packaged_paths) || cap.aexos.required_artifacts.some((file) => !record.packaged_paths.includes(file)) || !hasInstalledConsumerBinding(record, root))) failures.push(`${cap.id}: incomplete installed artifact evidence`);
      if (scenario === 'installed') {
        try {
          const artifact = path.resolve(root, record.artifact_path || '');
          if (!/^[a-f0-9]{64}$/.test(record.artifact_sha256) || !fs.statSync(artifact).isFile() || sha256(fs.readFileSync(artifact)) !== record.artifact_sha256) throw new Error('Artifact missing or hash mismatch');
          const files = [];
          require('tar').t({ file: artifact, sync: true, onentry: (entry) => { if (entry.type === 'File') files.push(entry.path.replace(/^package\//, '')); } });
          if (!files.length || cap.aexos.required_artifacts.some((file) => !files.includes(file)) || stable([...files].sort()) !== stable([...record.packaged_paths].sort())) throw new Error('Package manifest does not match artifact');
        } catch { failures.push(`${cap.id}: invalid installed artifact binding`); }
      }
    }
  }
  return failures;
}

function verifyGraph(graph, expected, root = ROOT) {
  const failures = [];
  const keys = (nodes) => nodes.map((node) => stable(node.upstream)).sort();
  if (!graph || !Array.isArray(graph.nodes) || stable(keys(graph.nodes)) !== stable(keys(expected.nodes))) return ['Structural inventory differs from upstream source records'];
  for (const node of graph.nodes) {
    const original = expected.nodes.find(item => item.upstream.path === node.upstream.path);
    if (stable(node.aexos) !== stable(original.aexos)) failures.push(`Structural mapping differs from current discovery: ${node.upstream.path}`);
  }
  const isAuthorizedException = node => {
    const original = expected.nodes.find(item => item.upstream.path === node.upstream.path);
    return original.scope_exception && stable(original.scope_exception) === stable(node.scope_exception);
  };
  if (!graph.semantic_reconciliation_complete || graph.nodes.some((node) => !node.reconciled && !isAuthorizedException(node)) || graph.edges.some((edge) => !edge.verified)) failures.push('Unreconciled structural or connection map');
  for (const node of graph.nodes.filter((item) => !isAuthorizedException(item))) {
    if (node.reconciled === true && (!node.reconciliation || !isNonEmptyString(node.reconciliation.disposition) ||
        !hasLocalEvidence(node.reconciliation.evidence_paths, root))) {
      failures.push(`Structural reconciliation lacks semantic evidence: ${node.upstream.path}`);
    }
  }
  for (const edge of graph.edges) {
    if (edge.verified === true && (!isNonEmptyString(edge.condition) || !isNonEmptyString(edge.expected_effect) ||
        !isNonEmptyString(edge.expected_failure) || !hasLocalEvidence(edge.tests, root) ||
        !hasLocalEvidence(edge.evidence_paths, root))) {
      failures.push(`Connection verification lacks semantic evidence: ${edge.source}:${edge.line}`);
    }
  }
  const edgeKeys = (edges) => edges.map((edge) => stable([edge.source, edge.line, edge.interface, edge.destination, edge.aexos_destination, edge.kind])).sort();
  if (stable(edgeKeys(graph.edges)) !== stable(edgeKeys(expected.edges))) failures.push('Connection inventory differs from upstream');
  return failures;
}

function summarizeDrift(before, after, contentsBefore, contentsAfter, capabilities = [], edges = []) {
  const oldFiles = new Map(before.map(entry => [entry.path, entry]));
  const newFiles = new Map(after.map(entry => [entry.path, entry]));
  const changes = [];
  const contractChanges = [];
  for (const file of [...new Set([...oldFiles.keys(), ...newFiles.keys()])].sort()) {
    const old = oldFiles.get(file);
    const next = newFiles.get(file);
    if (old && next && old.oid === next.oid && old.mode === next.mode) continue;
    changes.push({ path: file, status: !old ? 'added' : !next ? 'removed' : 'modified', before: old || null, after: next || null });
    if (/(?:^|\/)package\.json$/.test(file)) {
      const parse = (entry, content) => entry ? JSON.parse(content.get(entry.oid).toString('utf8')) : {};
      const oldPackage = parse(old, contentsBefore);
      const nextPackage = parse(next, contentsAfter);
      for (const section of ['bin', 'scripts', 'exports', 'dependencies', 'optionalDependencies', 'engines', 'files']) {
        const oldValue = oldPackage[section];
        const nextValue = nextPackage[section];
        if (stable(oldValue) !== stable(nextValue)) contractChanges.push({ path: file, contract: section, before: oldValue ?? null, after: nextValue ?? null });
      }
    }
  }
  const affected = new Set(changes.map(change => change.path));
  // Reopen transitive callers as well as directly changed entry points.
  let expanded;
  do {
    expanded = false;
    for (const edge of edges) if (affected.has(edge.destination) && !affected.has(edge.source)) {
      affected.add(edge.source);
      expanded = true;
    }
  } while (expanded);
  return { changes, contract_changes: contractChanges,
    reopen_capability_ids: capabilities.filter(cap => cap.upstream.paths.some(file => affected.has(file))).map(cap => cap.id),
    newly_discovered_paths_requiring_inventory: changes.filter(change => change.status === 'added').map(change => change.path),
    affected_paths: [...affected].sort(),
  };
}

module.exports = { ROOT, OUTPUT, sha256, stable, readJson, writeJson, git, tree, blobs, mapPath, candidateIdentity, discover, verifyEvidence, verifyGraph, summarizeDrift };
