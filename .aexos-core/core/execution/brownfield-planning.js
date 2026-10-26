'use strict';

const path = require('path');
const { relativeFile, sha256 } = require(path.resolve(__dirname, 'execution-binding'));
const { stableStringify } = require(path.resolve(__dirname, '../code-intel/brownfield/contract'));
const { validateBrownfieldEvidence } = require(path.resolve(__dirname, '../code-intel/brownfield/evidence'));

const MAX_BYTES = 16 * 1024 * 1024;
const validatedProofs = new WeakMap();
function fail(code) { throw Object.assign(new Error('Brownfield planning evidence failed its source-bound contract.'), { code }); }

/** Read-only evidence consumption. Caller supplies the existing leased read boundary.
 * Hashes attest bytes and lineage, not semantic truth or independent acceptance. */
async function inspectPlanningEvidence(phase, { projectRoot, read }) {
  const target = phase.inputs.brownfieldEvidence;
  if (!target) return null;
  if (phase.id !== 'plan-implementation') fail('BROWNFIELD_PLANNING_PHASE');
  relativeFile(projectRoot, target, { mustExist: true });
  const approval = phase.checks.find((check) => check.target === target
    && check.stage === 'before' && check.type === 'utf8-sha256');
  if (!approval) fail('BROWNFIELD_PLANNING_HASH_REQUIRED');
  const text = await read(target, MAX_BYTES);
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length > MAX_BYTES || sha256(bytes) !== approval.sha256) fail('BROWNFIELD_PLANNING_HASH_MISMATCH');
  let evidence;
  try { evidence = JSON.parse(text); } catch { fail('BROWNFIELD_PLANNING_INVALID'); }
  if (evidence?.protocol !== 'aexos.brownfield-evidence/v1' || evidence.scope?.staticOnly !== true
    || evidence.verification?.mode !== 'static-only' || !Array.isArray(evidence.sources)
    || evidence.sources.length < 1 || evidence.sources.length > 1000 || !Array.isArray(evidence.findings)
    || evidence.findings.length > 2000 || !Array.isArray(evidence.relationships)
    || evidence.relationships.length > 4000) fail('BROWNFIELD_PLANNING_INVALID');
  const digest = sha256(stableStringify(evidence.sources.map((source) => ({
    path: source.path, sha256: source.sha256, status: source.status,
  }))));
  if (digest !== evidence.inputDigest) fail('BROWNFIELD_PLANNING_DIGEST_MISMATCH');
  const entries = new Map();
  const keys = new Set();
  let totalBytes = 0;
  for (const source of evidence.sources) {
    const sourcePath = relativeFile(projectRoot, source.path, { mustExist: true });
    const key = process.platform === 'win32' ? sourcePath.toLowerCase() : sourcePath;
    if (sourcePath !== source.path || keys.has(key) || !/^[a-f0-9]{64}$/.test(source.sha256)
      || source.id !== sha256(`${sourcePath}\0${source.sha256}`)
      || !Number.isSafeInteger(source.byteLength) || source.byteLength < 0 || source.byteLength > MAX_BYTES) {
      fail('BROWNFIELD_PLANNING_SOURCE_INVALID');
    }
    keys.add(key);
    const content = await read(sourcePath, Math.max(1, source.byteLength));
    const actual = Buffer.from(content, 'utf8');
    totalBytes += actual.length;
    if (totalBytes > MAX_BYTES || actual.length !== source.byteLength || sha256(actual) !== source.sha256) {
      fail('BROWNFIELD_PLANNING_SOURCE_CHANGED');
    }
    entries.set(sourcePath, { ...source, text: content });
  }
  try { validateBrownfieldEvidence(evidence, { projectRoot, entries }); }
  catch { fail('BROWNFIELD_PLANNING_LINEAGE_INVALID'); }
  // Keep validated selections private. Exporting the parsed evidence here would
  // let a caller redirect a finding after its source bytes had been checked.
  const proof = Object.freeze({ target, sha256: approval.sha256, inputDigest: digest });
  validatedProofs.set(proof, evidence.findings.map((finding) => ({
    id: finding.id, sourcePaths: finding.sourceRefs.map((reference) => reference.path),
  })));
  return proof;
}

function verifyPlanningSelection(proof, selection, affectedSource) {
  if (!proof) {
    if (selection !== undefined) fail('BROWNFIELD_PLANNING_INPUT_REQUIRED');
    return null;
  }
  const findings = validatedProofs.get(proof);
  if (!findings) fail('BROWNFIELD_PLANNING_PROOF_INVALID');
  if (!selection || Object.keys(selection).sort().join(',') !== 'evidencePath,findingIds,inputDigest,sha256'
    || selection.evidencePath !== proof.target || selection.sha256 !== proof.sha256
    || selection.inputDigest !== proof.inputDigest || !Array.isArray(selection.findingIds)
    || selection.findingIds.length < 1 || selection.findingIds.length > 100
    || new Set(selection.findingIds).size !== selection.findingIds.length) fail('BROWNFIELD_PLANNING_SELECTION_INVALID');
  const selected = selection.findingIds.map((id) => findings.find((finding) => finding.id === id));
  if (selected.some((finding) => !finding)
    || !selected.some((finding) => finding.sourcePaths.includes(affectedSource))) {
    fail('BROWNFIELD_PLANNING_SELECTION_UNBOUND');
  }
  return { type: 'brownfield-planning-evidence', target: proof.target, sha256: proof.sha256,
    inputDigest: proof.inputDigest, findingIds: [...selection.findingIds], evidenceLevel: 'static-source-lineage',
    acceptance: 'not-conferred' };
}

module.exports = { inspectPlanningEvidence, verifyPlanningSelection };
