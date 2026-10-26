'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { sha256 } = require('../../../.aexos-core/core/execution/execution-binding');
const { LocalPlanChecker } = require('../../../.aexos-core/core/execution/local-plan-checker');
const { inspectPlanningEvidence, verifyPlanningSelection } = require('../../../.aexos-core/core/execution/brownfield-planning');
const { analyzeBrownfield, DEFAULT_LIMITS, exportBrownfieldEvidence } = require('../../../.aexos-core/core/code-intel/brownfield');
const { ConfinedFilesystem } = require('../../../.aexos-core/core/permissions/confined-filesystem');
const { createCapabilityBroker } = require('../../../.aexos-core/core/permissions/capability-broker');
const { OperationGuard } = require('../../../.aexos-core/core/permissions/operation-guard');
const { PermissionMode } = require('../../../.aexos-core/core/permissions/permission-mode');

describe('brownfield planning consumes actual source lineage through read leases', () => {
  let root; let evidence; let phase; let checker; let selection; let plan; let records; let source;
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-planning-lineage-'));
    source = 'export function add(a: number, b: number): number { return a + b; }\n';
    fs.writeFileSync(path.join(root, 'app.ts'), source);
    const analyzed = await analyzeBrownfield({
      protocol: 'aexos.brownfield-analysis/v1', analysisId: 'planning-fixture', projectRoot: root,
      allowedPaths: ['app.ts'], exclusions: [], requestedViews: ['api'], limits: { ...DEFAULT_LIMITS },
      output: { mode: 'return', path: 'evidence.json' },
      verification: { mode: 'static-only', requireSourceHashes: true, requireNoMutation: true },
    }, { authorizedProjectRoot: root, readBoundary: new ConfinedFilesystem({ projectRoot: root }) });
    evidence = analyzed.canonicalEvidence;
    const bytes = exportBrownfieldEvidence(evidence);
    fs.writeFileSync(path.join(root, 'evidence.json'), bytes);
    selection = { evidencePath: 'evidence.json', sha256: sha256(bytes), inputDigest: evidence.inputDigest,
      findingIds: [evidence.findings.find((finding) => finding.sourceRefs[0].path === 'app.ts').id] };
    plan = { planVersion: 1, source: 'app.ts', afterSha256: sha256('approved new source'),
      testFile: 'test.cjs', brownfield: selection };
    fs.writeFileSync(path.join(root, 'plan.json'), JSON.stringify(plan));
    phase = { id: 'plan-implementation', inputs: { output: 'plan.json', brownfieldEvidence: 'evidence.json' },
      checks: [{ type: 'utf8-sha256', stage: 'before', target: 'evidence.json', sha256: sha256(bytes) }] };
    const phases = new Map([
      ['implement-story', { inputs: { source: 'app.ts' }, operations: [{ target: 'app.ts', contentBase64: Buffer.from('approved new source').toString('base64') }] }],
      ['run-tests', { checks: [{ type: 'node-test', target: 'test.cjs' }] }],
    ]);
    const broker = createCapabilityBroker({ policy: () => true });
    const guard = new OperationGuard(new PermissionMode(root));
    records = [];
    checker = new LocalPlanChecker({ projectRoot: root, capabilityBroker: broker, getGuard: () => guard,
      phases, evidenceSink: (record) => records.push(record) });
    const binding = { agentId: 'architect', task: 'plan-create-implementation', requiredCapabilities: [] };
    for (const target of ['app.ts', 'evidence.json', 'plan.json']) {
      const requirement = { capability: 'filesystem', action: 'read', resource: path.join(root, target), scope: root };
      const lease = broker.grant({ ...requirement, actions: ['read'], agentId: binding.agentId, task: binding.task });
      binding.requiredCapabilities.push({ ...requirement, token: lease.token });
    }
    checker.bind(phase.id, binding);
  });
  afterEach(() => {
    if (root && path.dirname(root) === fs.realpathSync(os.tmpdir()) && path.basename(root).startsWith('aexos-planning-lineage-')) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  const inspect = () => inspectPlanningEvidence(phase, { projectRoot: root,
    read: (target, max) => checker.read(phase, target, max) });
  const persistEvidence = () => {
    const bytes = exportBrownfieldEvidence(evidence);
    fs.writeFileSync(path.join(root, 'evidence.json'), bytes);
    phase.checks[0].sha256 = sha256(bytes);
  };

  test('accepts a selected real finding, leaving source bytes unchanged and conferring no acceptance', async () => {
    await checker.verify(phase, 'before');
    await checker.verifySemanticArtifact(phase);
    expect(records).toContainEqual(expect.objectContaining({ type: 'brownfield-planning-evidence',
      findingIds: selection.findingIds, evidenceLevel: 'static-source-lineage', acceptance: 'not-conferred' }));
    expect(fs.readFileSync(path.join(root, 'app.ts'), 'utf8')).toBe(source);
    expect(fs.readdirSync(root).sort()).toEqual(['app.ts', 'evidence.json', 'plan.json']);
  });
  test('source mutation after analysis cannot be accepted as current', async () => {
    fs.writeFileSync(path.join(root, 'app.ts'), source.replace('a + b', 'a - b'));
    await expect(inspect()).rejects.toMatchObject({ code: 'BROWNFIELD_PLANNING_SOURCE_CHANGED' });
  });
  test('source reads require an independently issued exact lease', async () => {
    checker.bindings.get(phase.id).requiredCapabilities.shift();
    await expect(inspect()).rejects.toMatchObject({ code: 'LOCAL_CHECK_CAPABILITY_REQUIRED' });
  });
  test('new evidence bytes cannot reuse an old approved hash', async () => {
    fs.appendFileSync(path.join(root, 'evidence.json'), ' ');
    await expect(inspect()).rejects.toMatchObject({ code: 'BROWNFIELD_PLANNING_HASH_MISMATCH' });
  });
  test('invalid spans and source inventories fail even if document bytes were approved', async () => {
    evidence.findings[0].sourceRefs[0].spanHash = '0'.repeat(64); persistEvidence();
    await expect(inspect()).rejects.toMatchObject({ code: 'BROWNFIELD_PLANNING_LINEAGE_INVALID' });
    evidence.inputDigest = '0'.repeat(64); persistEvidence();
    await expect(inspect()).rejects.toMatchObject({ code: 'BROWNFIELD_PLANNING_DIGEST_MISMATCH' });
  });
  test('unknown selections, wrong source, and undeclared evidence cannot satisfy planning', async () => {
    const proof = await inspect();
    expect(() => verifyPlanningSelection(proof, { ...selection, findingIds: ['missing'] }, 'app.ts'))
      .toThrow(expect.objectContaining({ code: 'BROWNFIELD_PLANNING_SELECTION_UNBOUND' }));
    expect(() => verifyPlanningSelection(proof, selection, 'unrelated.ts'))
      .toThrow(expect.objectContaining({ code: 'BROWNFIELD_PLANNING_SELECTION_UNBOUND' }));
    expect(() => verifyPlanningSelection(null, selection, 'app.ts'))
      .toThrow(expect.objectContaining({ code: 'BROWNFIELD_PLANNING_INPUT_REQUIRED' }));
  });
  test('validated proof is opaque and cannot be retargeted by mutation or reconstruction', async () => {
    const proof = await inspect();
    expect(Object.isFrozen(proof)).toBe(true);
    expect(proof.evidence).toBeUndefined();
    expect(() => { proof.evidence = { findings: [{ id: selection.findingIds[0], sourceRefs: [{ path: 'other.ts' }] }] }; })
      .toThrow(TypeError);
    expect(() => { proof.target = 'other.json'; }).toThrow(TypeError);
    expect(() => verifyPlanningSelection(proof, selection, 'other.ts'))
      .toThrow(expect.objectContaining({ code: 'BROWNFIELD_PLANNING_SELECTION_UNBOUND' }));
    expect(() => verifyPlanningSelection({ ...proof }, selection, 'app.ts'))
      .toThrow(expect.objectContaining({ code: 'BROWNFIELD_PLANNING_PROOF_INVALID' }));
    expect(verifyPlanningSelection(proof, selection, 'app.ts')).toMatchObject({ acceptance: 'not-conferred' });
  });
});
