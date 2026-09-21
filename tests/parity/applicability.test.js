const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { baselinePairs, contractHash, validateApplicability, applyApplicability } = require('../../scripts/parity/applicability');
const { verifyEvidence } = require('../../scripts/parity/lib');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

describe('reviewed parity applicability', () => {
  let root, source, capabilities, manifest;
  const binding = (file, bytes) => ({ path: file, sha256: sha(bytes) });
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-applicability-'));
    fs.mkdirSync(path.join(root, 'docs/parity'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs/parity/baseline-lock.json'), '{"upstream":"frozen"}');
    fs.writeFileSync(path.join(root, 'docs/README.md'), '# Public instructions');
    fs.writeFileSync(path.join(root, 'runtime.js'), 'module.exports = true;');
    fs.writeFileSync(path.join(root, 'docs/parity/review.md'), 'Reviewed upstream prose contract: verify instructions as source, no runtime entrypoint.');
    source = { upstream: { commit: 'locked-upstream' }, entries: [
      { path: 'docs/README.md', type: 'blob', sha256: sha('# Public instructions') },
      { path: 'runtime.js', type: 'blob', sha256: sha('module.exports = true;') },
    ] };
    capabilities = source.entries.map((entry, index) => ({
      id: `CAP-${index}`, upstream: { paths: [entry.path], commit: source.upstream.commit },
      aexos: { paths: [entry.path], entrypoints: [entry.path], required_artifacts: [entry.path] },
      classification: 'equivalent', scope_exception: null,
      required_scenarios: ['structure', 'behavior', 'installed'],
      required_environments: ['windows-node', 'linux-node', 'darwin-node'],
      acceptance_criteria: ['Preserve contract'], verification: { status: 'unverified', blockers: [] },
    }));
    manifest = {
      schema_version: 1, upstream_commit: source.upstream.commit,
      baseline_lock_sha256: sha('{"upstream":"frozen"}'), reviewed_by: 'explicit-reviewer',
      reviewed_at: '2026-09-21T12:00:00Z',
      review_evidence: [binding('docs/parity/review.md', fs.readFileSync(path.join(root, 'docs/parity/review.md')))],
      capabilities: [{ id: 'CAP-0', baseline_contract_sha256: contractHash(capabilities[0]),
        upstream_inputs: [binding('docs/README.md', '# Public instructions')],
        candidate_inputs: [binding('docs/README.md', '# Public instructions')],
        decisions: baselinePairs(capabilities[0]).map(pair => ({ ...pair,
          disposition: pair.scenario === 'structure' && pair.environment === 'windows-node' ? 'applicable' : 'not_applicable',
          ...(pair.scenario === 'structure' && pair.environment === 'windows-node' ? {} : {
            reason_code: 'documentation_only', rationale: 'This immutable prose has no host execution; its wording and links are checked by a source contract test.',
            source_refs: ['docs/README.md'], evidence_paths: ['docs/parity/review.md'],
          }),
        })),
      }],
    };
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  const validate = () => validateApplicability({ manifest, capabilities, source, root });

  test('curation changes only named pairs, preserves immutable fields, and cannot supply execution acceptance', () => {
    const before = JSON.stringify(capabilities);
    const validated = validate();
    const inventory = applyApplicability({ tree_complete: true, semantic_reconciliation_complete: false,
      upstream: source.upstream, capabilities }, validated, 'docs/parity/custom-applicability.json');
    expect(JSON.stringify(capabilities)).toBe(before);
    expect(inventory.capabilities[0].required_pairs).toEqual([{ scenario: 'structure', environment: 'windows-node' }]);
    expect(inventory.capabilities[1]).toEqual(capabilities[1]);
    const failures = verifyEvidence({ inventory, expectedCapabilities: capabilities, expectedSource: source,
      applicability: manifest, identity: { commit: 'candidate', tree_digest: 'digest' }, evidence: null, root });
    expect(failures.join('\n')).not.toContain('contract differs');
    expect(failures.join('\n')).toContain('missing/failed structure@windows-node');
    expect(failures.join('\n')).toContain('not fully verified');
    expect(failures.join('\n')).toContain('semantic reconciliation incomplete');
    expect(applyApplicability({ capabilities }, validate(), inventory.applicability.manifest_path).applicability)
      .toEqual(inventory.applicability);
  });

  test('positive replacements are validated and deduplicated without creating empty obligations', () => {
    manifest.capabilities[0].decisions[1] = { ...manifest.capabilities[0].decisions[1],
      disposition: 'replace', replacements: [{ scenario: 'structure', environment: 'windows-node' }] };
    expect(validate().requirements.get('CAP-0')).toHaveLength(1);
    manifest.capabilities[0].decisions[1].replacements = [];
    expect(validate).toThrow('empty replacement');
  });

  test.each(['unknown_id', 'duplicate_id', 'omitted_pair', 'duplicate_pair', 'unknown_pair',
    'empty_manifest', 'wrong_baseline', 'wrong_blob', 'wrong_contract', 'no_review', 'no_rationale',
    'no_source', 'no_review_evidence', 'vacuous', 'unavailable_provider_reason'])('rejects %s', mode => {
    const item = manifest.capabilities[0];
    if (mode === 'unknown_id') item.id = 'CAP-unknown';
    if (mode === 'duplicate_id') manifest.capabilities.push(structuredClone(item));
    if (mode === 'omitted_pair') item.decisions.pop();
    if (mode === 'duplicate_pair') item.decisions[1] = structuredClone(item.decisions[0]);
    if (mode === 'unknown_pair') item.decisions[1].environment = 'invented';
    if (mode === 'empty_manifest') manifest.capabilities = [];
    if (mode === 'wrong_baseline') manifest.baseline_lock_sha256 = sha('other');
    if (mode === 'wrong_blob') item.upstream_inputs[0].sha256 = sha('other');
    if (mode === 'wrong_contract') item.baseline_contract_sha256 = sha('other');
    if (mode === 'no_review') manifest.reviewed_by = '';
    if (mode === 'no_rationale') item.decisions[1].rationale = '';
    if (mode === 'no_source') item.decisions[1].source_refs = [];
    if (mode === 'no_review_evidence') item.decisions[1].evidence_paths = [];
    if (mode === 'vacuous') item.decisions[0] = { ...item.decisions[1], scenario: 'structure', environment: 'windows-node' };
    if (mode === 'unavailable_provider_reason') item.decisions[1].reason_code = 'credentials_unavailable';
    expect(validate).toThrow();
  });

  test('rejects stale candidate and review evidence bytes', () => {
    fs.appendFileSync(path.join(root, 'docs/README.md'), 'changed');
    expect(validate).toThrow('Stale candidate');
    fs.writeFileSync(path.join(root, 'docs/README.md'), '# Public instructions');
    fs.appendFileSync(path.join(root, 'docs/parity/review.md'), 'changed');
    expect(validate).toThrow('Stale review');
  });

  test('rejects linked evidence and escaping inputs', () => {
    const linked = path.join(root, 'docs/parity/linked');
    fs.symlinkSync(path.join(root, 'docs'), linked, process.platform === 'win32' ? 'junction' : 'dir');
    manifest.capabilities[0].candidate_inputs[0].path = 'docs/parity/linked/README.md';
    expect(validate).toThrow('Linked applicability');
    manifest.capabilities[0].candidate_inputs[0].path = '../outside';
    expect(validate).toThrow('outside review root');
  });

  test('runtime cannot lose installed/behavior and live environments cannot be renamed away', () => {
    const cap = capabilities[1];
    const item = manifest.capabilities[0];
    item.id = cap.id;
    item.baseline_contract_sha256 = contractHash(cap);
    item.upstream_inputs = [binding('runtime.js', 'module.exports = true;')];
    item.candidate_inputs = [...item.upstream_inputs];
    for (const d of item.decisions) if (d.source_refs) d.source_refs = ['runtime.js'];
    expect(validate).toThrow('runtime behavior obligation removed');
    item.decisions.find(d => d.scenario === 'behavior').disposition = 'applicable';
    expect(validate).toThrow('runtime installed obligation removed');
    item.decisions.find(d => d.scenario === 'installed').disposition = 'applicable';
    expect(validate).not.toThrow();
    cap.required_environments.push('provider-live');
    item.baseline_contract_sha256 = contractHash(cap);
    item.decisions.push(...cap.required_scenarios.map(scenario => ({ scenario, environment: 'provider-live',
      disposition: 'not_applicable', reason_code: 'platform_specific', rationale: 'No credentials',
      source_refs: ['runtime.js'], evidence_paths: ['docs/parity/review.md'] })));
    expect(validate).toThrow('external environment cannot be waived');
    item.decisions.find(d => d.environment === 'provider-live' && d.scenario === 'structure').disposition = 'applicable';
    expect(validate).toThrow('external environment cannot be waived');
  });

  test('blocked source cannot be reclassified by applicability', () => {
    capabilities[0].classification = 'blocked_access';
    expect(validate).toThrow('blocked/excepted');
  });

  test('forged pairs or removed manifest never bypass baseline execution guards', () => {
    const inventory = applyApplicability({ upstream: source.upstream, capabilities }, validate(), 'review.json');
    inventory.capabilities[0].required_pairs = [];
    const args = { inventory, expectedCapabilities: capabilities, expectedSource: source,
      identity: {}, evidence: null, root };
    expect(verifyEvidence({ ...args, applicability: manifest }).join('\n')).toContain('unvalidated applicability');
    expect(verifyEvidence(args).join('\n')).toContain('Missing bound applicability');
  });
});
