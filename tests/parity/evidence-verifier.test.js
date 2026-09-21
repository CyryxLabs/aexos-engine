'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { sha256, verifyEvidence, verifyGraph } = require('../../scripts/parity/lib');
const { resolveJourneyEvidence } = require('../../scripts/parity/collect-installed-evidence');

describe('Upstream parity evidence gate', () => {
  let root;
  let consumerRoot;
  let fixture;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-evidence-'));
    consumerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-consumer-'));
    fs.writeFileSync(path.join(root, 'runtime.js'), 'module.exports = true;');
    fs.writeFileSync(path.join(root, 'installed-step.log'), 'installed execution');
    fs.mkdirSync(path.join(root, 'package'));
    fs.copyFileSync(path.join(root, 'runtime.js'), path.join(root, 'package/runtime.js'));
    require('tar').c({ cwd: root, file: path.join(root, 'fixture.tgz'), gzip: true, sync: true }, ['package']);
    const cap = {
      id: 'CAP-fixture', classification: 'equivalent',
      upstream: { paths: ['runtime.js'] },
      aexos: { paths: ['runtime.js'], entrypoints: ['runtime.js'], required_artifacts: ['runtime.js'] },
      required_scenarios: ['behavior', 'installed'], required_environments: ['windows-node'],
      acceptance_criteria: ['Returns the specified result'], verification: {
        status: 'passed', blockers: [], tests: ['runtime.js'], evidence_paths: ['execution.json'],
      },
    };
    const artifactSha256 = sha256(fs.readFileSync(path.join(root, 'fixture.tgz')));
    const logPath = path.join(root, 'installed-step.log');
    const consumerBinding = {
      id: 'consumer-fixture', consumer_path: consumerRoot, consumer_realpath: consumerRoot,
      package_root: path.join(consumerRoot, 'node_modules/@aexos/core'),
      package_realpath: path.join(consumerRoot, 'node_modules/@aexos/core'),
      package_json_sha256: sha256('package-json'), cli_sha256: sha256('cli'),
      artifact_sha256: artifactSha256, observed_at: '2026-09-21T12:00:00.000Z', observed_exists: true,
    };
    const executionSteps = [{ label: 'installed-fixture', exit_code: 0, expected_exit_code: 0,
      log_path: logPath, log_sha256: sha256(fs.readFileSync(logPath)) }];
    fixture = {
      root,
      inventory: { tree_complete: true, semantic_reconciliation_complete: true, upstream: { commit: 'upstream' }, capabilities: [cap] },
      expectedCapabilities: JSON.parse(JSON.stringify([cap])),
      identity: { commit: 'candidate', tree_digest: 'digest' },
      evidence: { upstream_commit: 'upstream', candidate: { commit: 'candidate', tree_digest: 'digest' },
        semantic_reconciliation_complete: true, acceptance_status: 'COMPLETE',
        records: cap.required_scenarios.map((scenario) => ({ capability_id: cap.id, scenario, environment: 'windows-node', status: 'passed', exit_code: 0, assertions: 3,
          command: 'node controlled-runtime-scenario.js', input: '{"scenario":"fixture"}', output: 'expected-result',
          evidence_path: 'execution.json', evidence_sha256: '',
          candidate_digest: 'digest', upstream_commit: 'upstream', coverage_scope: 'full_contract',
          artifact_path: 'fixture.tgz', artifact_sha256: artifactSha256,
          ...(scenario === 'installed' ? { isolated_consumer: consumerRoot, consumer_binding: consumerBinding,
            execution_steps: executionSteps, packaged_paths: ['runtime.js'] } : {}) })),
      },
    };
    fs.writeFileSync(path.join(root, 'execution.json'), JSON.stringify({ schema_version: 1, kind: 'aexos-parity-execution', candidate: fixture.identity, upstream_commit: 'upstream', results: fixture.evidence.records }));
    for (const record of fixture.evidence.records) record.evidence_sha256 = sha256(fs.readFileSync(path.join(root, 'execution.json')));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(consumerRoot, { recursive: true, force: true });
  });
  test('accepts complete, matching fixture evidence (not a product parity claim)', () => {
    expect(verifyEvidence(fixture)).toEqual([]);
  });
  test('rejects an incomplete acceptance envelope even when records pass', () => {
    fixture.evidence.semantic_reconciliation_complete = false;
    fixture.evidence.acceptance_status = 'INCOMPLETE';
    expect(verifyEvidence(fixture)).toContain('Incomplete acceptance evidence envelope');
  });
  test('rejects a partial journey record as full-contract acceptance', () => {
    const installed = fixture.evidence.records[1];
    installed.coverage_scope = 'partial';
    installed.coverage_limit = 'Named journey only';
    expect(verifyEvidence(fixture).join('\n')).toContain('partial coverage cannot satisfy installed@windows-node');
  });
  test('rejects a passed capability flag without bound semantic evidence', () => {
    fixture.inventory.capabilities[0].verification.tests = [];
    fixture.inventory.capabilities[0].verification.evidence_paths = [];
    expect(verifyEvidence(fixture).join('\n')).toContain('semantic verification lacks bound evidence');
  });
  test.each(['blocked', 'unverified', 'failed', 'skipped'])('rejects a %s mandatory result', (status) => {
    fixture.evidence.records[0].status = status;
    expect(verifyEvidence(fixture)).not.toEqual([]);
  });
  test('rejects an empty capability universe', () => {
    fixture.inventory.capabilities = [];
    expect(verifyEvidence(fixture)).toContain('Empty capability inventory');
  });
  test('rejects omitted capability obligations', () => {
    fixture.expectedCapabilities.push({ ...fixture.expectedCapabilities[0], id: 'CAP-required' });
    expect(verifyEvidence(fixture).join('\n')).toContain('independently rediscovered');
  });
  test('rejects removed scenarios even if the remaining test passes', () => {
    fixture.inventory.capabilities[0].required_scenarios.pop();
    expect(verifyEvidence(fixture).join('\n')).toContain('contract differs');
  });
  test('rejects absent execution evidence and zero assertions', () => {
    fixture.evidence.records = [];
    expect(verifyEvidence(fixture)).toContain('Empty execution evidence');
  });
  test('rejects a successful exit without assertions', () => {
    fixture.evidence.records[0].assertions = 0;
    expect(verifyEvidence(fixture).join('\n')).toContain('missing/failed');
  });
  test('rejects another candidate commit or dirty tree digest', () => {
    fixture.evidence.candidate.tree_digest = 'previous-code';
    expect(verifyEvidence(fixture)).toContain('Stale or mismatched candidate evidence');
  });
  test('rejects another upstream SHA', () => {
    fixture.evidence.upstream_commit = 'previous-baseline';
    expect(verifyEvidence(fixture)).toContain('Missing/mismatched upstream evidence');
  });
  test('rejects stale individual records even with a current envelope', () => {
    fixture.evidence.records[0].candidate_digest = 'previous-code';
    expect(verifyEvidence(fixture).join('\n')).toContain('record from another');
  });
  test('rejects tampered execution artifacts', () => {
    fs.writeFileSync(path.join(root, 'execution.json'), 'modified');
    expect(verifyEvidence(fixture).join('\n')).toContain('tampered evidence');
  });
  test('rejects missing installed package files', () => {
    fixture.evidence.records[1].packaged_paths = [];
    expect(verifyEvidence(fixture).join('\n')).toContain('installed artifact evidence');
  });
  test('rejects checkout results relabeled as installed results', () => {
    fixture.evidence.records[1].isolated_consumer = root;
    fixture.evidence.records[1].consumer_binding = {
      ...fixture.evidence.records[1].consumer_binding,
      consumer_path: root,
      consumer_realpath: root,
    };
    expect(verifyEvidence(fixture).join('\n')).toContain('installed artifact evidence');
  });
  test('rejects an invented consumer path without an observed binding and logs', () => {
    const installed = fixture.evidence.records[1];
    installed.isolated_consumer = path.join(os.tmpdir(), 'invented-consumer');
    delete installed.consumer_binding;
    delete installed.execution_steps;
    expect(verifyEvidence(fixture).join('\n')).toContain('incomplete installed artifact evidence');
  });
  test('rejects removed structural artifacts', () => {
    fs.unlinkSync(path.join(root, 'runtime.js'));
    expect(verifyEvidence(fixture).join('\n')).toContain('missing runtime.js');
  });
  test('cannot relabel an inaccessible upstream component as passed', () => {
    fixture.expectedCapabilities[0].classification = 'blocked_access';
    fixture.expectedCapabilities[0].verification.blockers = ['Authorized source required'];
    expect(verifyEvidence(fixture).join('\n')).toContain('access obligation remains blocked');
  });
  test('does not accept a checksummed package manifest as an execution report', () => {
    fs.writeFileSync(path.join(root, 'execution.json'), '{"name":"not-an-execution"}');
    for (const record of fixture.evidence.records) record.evidence_sha256 = sha256(fs.readFileSync(path.join(root, 'execution.json')));
    expect(verifyEvidence(fixture).join('\n')).toContain('execution result contract');
  });
  test('requires the real artifact to match its claimed hash', () => {
    fixture.evidence.records[1].artifact_sha256 = 'nonexistent artifact';
    expect(verifyEvidence(fixture).join('\n')).toContain('invalid installed artifact binding');
  });
  test('cannot substitute a different package while retaining the original execution report', () => {
    fs.writeFileSync(path.join(root, 'package/runtime.js'), 'module.exports = "DIFFERENT IMPLEMENTATION";');
    require('tar').c({ cwd: root, file: path.join(root, 'fixture.tgz'), gzip: true, sync: true }, ['package']);
    fixture.evidence.records[1].artifact_sha256 = sha256(fs.readFileSync(path.join(root, 'fixture.tgz')));
    expect(verifyEvidence(fixture).join('\n')).toContain('invalid execution result contract');
  });
  test('does not allow duplicate graph nodes to replace omitted obligations', () => {
    const nodes = ['a', 'b'].map((file) => ({ upstream: { path: file, oid: file, mode: '100644' }, reconciled: true }));
    const expected = { nodes, edges: [] };
    const graph = { nodes: [nodes[0], nodes[0]], edges: [], semantic_reconciliation_complete: true };
    expect(verifyGraph(graph, expected).join('\n')).toContain('Structural inventory differs');
  });
  test('honors only an independently discovered owner exception without dropping the source node', () => {
    const pro = { upstream: { path: 'pro', oid: 'locked-gitlink', mode: '160000' }, reconciled: false,
      scope_exception: { authorized_by: 'owner', authorization: 'exclude private content', gitlink: 'locked-gitlink' } };
    const publicNode = { upstream: { path: 'pro-loader.js', oid: 'blob', mode: '100644' }, reconciled: true,
      reconciliation: { disposition: 'equivalent', evidence_paths: ['runtime.js'] } };
    const expected = { nodes: [pro, publicNode], edges: [] };
    const graph = { nodes: structuredClone(expected.nodes), edges: [], semantic_reconciliation_complete: true };
    expect(verifyGraph(graph, expected, root)).toEqual([]);
    graph.nodes[1].reconciled = false;
    graph.nodes[1].scope_exception = pro.scope_exception;
    expect(verifyGraph(graph, expected, root)).toContain('Unreconciled structural or connection map');
  });
  test('rejects substituted candidate paths even when upstream nodes are unchanged', () => {
    const expected = { nodes: [{ upstream: { path: 'runtime.js', oid: 'blob', mode: '100644' },
      aexos: { path: 'runtime.js', exists: true }, reconciled: true,
      reconciliation: { disposition: 'equivalent', evidence_paths: ['runtime.js'] } }], edges: [] };
    const graph = { ...structuredClone(expected), semantic_reconciliation_complete: true };
    expect(verifyGraph(graph, expected, root)).toEqual([]);
    graph.nodes[0].aexos.path = 'disconnected-runtime.js';
    expect(verifyGraph(graph, expected, root).join('\n')).toContain('Structural mapping differs');
  });
  test('rejects substituted candidate connection destinations', () => {
    const expected = { nodes: [], edges: [{ source: 'caller.js', line: 2, interface: './runtime',
      destination: 'runtime.js', aexos_destination: 'runtime.js', kind: 'module', verified: true,
      condition: 'runtime import is reached', expected_effect: 'runtime module loads',
      expected_failure: 'missing runtime module fails', tests: ['runtime.js'], evidence_paths: ['execution.json'] }] };
    const graph = { ...structuredClone(expected), semantic_reconciliation_complete: true };
    expect(verifyGraph(graph, expected, root)).toEqual([]);
    graph.edges[0].aexos_destination = 'unrelated-runtime.js';
    expect(verifyGraph(graph, expected, root)).toContain('Connection inventory differs from upstream');
  });
  test('rejects reconciled and verified semantic flags without evidence', () => {
    const nodes = [{ upstream: { path: 'runtime.js' }, aexos: { path: 'runtime.js' }, reconciled: true }];
    const edges = [{ source: 'caller.js', line: 2, interface: './runtime', destination: 'runtime.js',
      aexos_destination: 'runtime.js', kind: 'module', verified: true }];
    const expected = { nodes: structuredClone(nodes), edges: structuredClone(edges) };
    const failures = verifyGraph({ nodes, edges, semantic_reconciliation_complete: true }, expected, root);
    expect(failures).toContain('Structural reconciliation lacks semantic evidence: runtime.js');
    expect(failures).toContain('Connection verification lacks semantic evidence: caller.js:2');
  });
  test('collector rejects a journey without an explicit observed consumer binding', () => {
    const logPath = path.join(root, 'installed-step.log');
    const installed = {
      artifact: { sha256: sha256('artifact') }, consumer_bindings: [],
      steps: [{ label: 'step', exit_code: 0, expected_exit_code: 0, log_path: logPath,
        log_sha256: sha256(fs.readFileSync(logPath)) }],
    };
    const journey = { name: 'fixture', isolated_consumer: consumerRoot, step_labels: ['step'] };
    expect(() => resolveJourneyEvidence(installed, journey, root)).toThrow('Missing consumer binding');
  });
});
