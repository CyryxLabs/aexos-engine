'use strict';

const path = require('path');
const { sha256, stableStringify } = require('./contract');

const EVIDENCE_PROTOCOL = 'aexos.brownfield-evidence/v1';
const HASH = /^[a-f0-9]{64}$/;
const FINDING_ASSERTIONS = new Set(['observed-syntax', 'inferred-static']);
const CONFIDENCE = new Set(['low', 'medium', 'high']);
const SOURCE_STATUSES = new Set(['analyzed', 'metadata-only', 'unsupported']);
const VIEW_STATUSES = new Set(['complete-within-declared-supported-scope', 'partial', 'unavailable']);

function evidenceError(code, message) { return Object.assign(new Error(message), { code }); }

function exactKeys(value, required, code, label, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw evidenceError(code, `${label} must be an object.`);
  const allowed = new Set([...required, ...optional]);
  if (Object.keys(value).some((key) => !allowed.has(key)) || required.some((key) => !(key in value))) {
    throw evidenceError(code, `${label} has an invalid structure.`);
  }
}

function referenceIdentity(reference) {
  return {
    sourceId: reference.sourceId, path: reference.path, sha256: reference.sha256,
    startLine: reference.startLine, startColumn: reference.startColumn,
    endLine: reference.endLine, endColumn: reference.endColumn,
    startOffset: reference.startOffset, endOffset: reference.endOffset, spanHash: reference.spanHash,
  };
}

function computeSourceId(sourcePath, sourceHash) { return sha256(`${sourcePath}\0${sourceHash}`); }

function computeFindingId(finding) {
  return `finding-${sha256(stableStringify({
    kind: finding.kind, name: finding.name, assertionLevel: finding.assertionLevel,
    confidence: finding.confidence, extractorId: finding.extractorId,
    extractorVersion: finding.extractorVersion, sourceRefs: finding.sourceRefs.map(referenceIdentity),
    ...(finding.attributes === undefined ? {} : { attributes: finding.attributes }),
  }))}`;
}

function computeRelationshipId(relationship) {
  return `relationship-${sha256(stableStringify({
    kind: relationship.kind, fromFindingId: relationship.fromFindingId, to: relationship.to,
    resolution: relationship.resolution,
    ...(relationship.candidates === undefined ? {} : { candidates: relationship.candidates }),
    sourceRefs: relationship.sourceRefs.map(referenceIdentity),
  }))}`;
}

function publicSource(source) {
  return {
    id: source.id, path: source.path, sha256: source.sha256, byteLength: source.byteLength,
    language: source.language, workspaceOwner: source.workspaceOwner, status: source.status,
  };
}

function lineColumnAt(text, offset) {
  const lines = text.slice(0, offset).split(/\r\n|\r|\n/);
  return { line: lines.length, column: lines.at(-1).length + 1 };
}

function validateSourceReference(reference, snapshot, evidenceSources = null) {
  exactKeys(reference, ['sourceId', 'path', 'sha256', 'startLine', 'startColumn', 'endLine', 'endColumn',
    'startOffset', 'endOffset', 'spanHash'], 'BROWNFIELD_SOURCE_REF_INVALID', 'Source reference');
  const source = snapshot.entries.get(reference.path);
  if (!source || source.id !== reference.sourceId || source.sha256 !== reference.sha256 || source.text === null
    || (evidenceSources && evidenceSources.get(reference.sourceId)?.path !== reference.path)) {
    throw evidenceError('BROWNFIELD_SOURCE_REF_MISMATCH', 'Evidence reference does not resolve to a published captured source.');
  }
  if (!HASH.test(reference.sha256) || !HASH.test(reference.spanHash)
    || !Number.isSafeInteger(reference.startOffset) || !Number.isSafeInteger(reference.endOffset)
    || reference.startOffset < 0 || reference.endOffset <= reference.startOffset
    || reference.endOffset > source.text.length) {
    throw evidenceError('BROWNFIELD_SOURCE_SPAN_INVALID', 'Evidence reference contains an invalid source span.');
  }
  const start = lineColumnAt(source.text, reference.startOffset);
  const end = lineColumnAt(source.text, reference.endOffset);
  if (reference.startLine !== start.line || reference.startColumn !== start.column
    || reference.endLine !== end.line || reference.endColumn !== end.column) {
    throw evidenceError('BROWNFIELD_SOURCE_POSITION_MISMATCH', 'Evidence line and column coordinates do not match source offsets.');
  }
  const actual = sha256(Buffer.from(source.text.slice(reference.startOffset, reference.endOffset), 'utf8'));
  if (actual !== reference.spanHash) throw evidenceError('BROWNFIELD_SOURCE_SPAN_MISMATCH', 'Evidence span hash does not match captured bytes.');
}

function validateBrownfieldEvidence(evidence, snapshot) {
  exactKeys(evidence, ['protocol', 'analysisId', 'contractHash', 'inputDigest', 'analyzers', 'scope', 'limits',
    'coverage', 'sources', 'views', 'findings', 'relationships', 'risks', 'uncertainty', 'provenance',
    'verification', 'publication'], 'BROWNFIELD_EVIDENCE_STRUCTURE', 'Evidence');
  if (evidence.protocol !== EVIDENCE_PROTOCOL || typeof evidence.analysisId !== 'string'
    || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(evidence.analysisId)
    || !HASH.test(evidence.contractHash) || !HASH.test(evidence.inputDigest)) {
    throw evidenceError('BROWNFIELD_EVIDENCE_PROTOCOL', 'Brownfield evidence identity is invalid.');
  }
  if (!snapshot?.entries || typeof snapshot.entries.get !== 'function' || typeof snapshot.projectRoot !== 'string') {
    throw evidenceError('BROWNFIELD_SNAPSHOT_REQUIRED', 'Exact snapshot entries are required for evidence validation.');
  }
  if (!Array.isArray(evidence.sources) || !Array.isArray(evidence.findings) || !Array.isArray(evidence.relationships)) {
    throw evidenceError('BROWNFIELD_EVIDENCE_STRUCTURE', 'Evidence collections are invalid.');
  }
  if (!Array.isArray(evidence.analyzers) || evidence.analyzers.length !== 2) {
    throw evidenceError('BROWNFIELD_ANALYZERS_INVALID', 'Analyzer declarations are invalid.');
  }
  for (const analyzer of evidence.analyzers) {
    exactKeys(analyzer, ['id', 'version', 'evidenceLevel'], 'BROWNFIELD_ANALYZERS_INVALID', 'Analyzer');
    if (!['codebase-mapper', 'typescript-snapshot'].includes(analyzer.id)
      || !['structural-hint', 'observed-syntax', 'unavailable'].includes(analyzer.evidenceLevel)
      || !(analyzer.version === null || typeof analyzer.version === 'string')) {
      throw evidenceError('BROWNFIELD_ANALYZERS_INVALID', 'Analyzer declaration values are invalid.');
    }
  }
  exactKeys(evidence.scope, ['allowedPaths', 'exclusions', 'requestedViews', 'staticOnly'],
    'BROWNFIELD_SCOPE_INVALID', 'Evidence scope');
  if (!Array.isArray(evidence.scope.allowedPaths) || !Array.isArray(evidence.scope.exclusions)
    || !Array.isArray(evidence.scope.requestedViews) || evidence.scope.staticOnly !== true) {
    throw evidenceError('BROWNFIELD_SCOPE_INVALID', 'Evidence scope values are invalid.');
  }
  const limitKeys = ['maxFiles', 'maxDirectories', 'maxDepth', 'maxFileBytes', 'maxTotalBytes', 'maxFindings', 'maxElapsedMs'];
  exactKeys(evidence.limits, limitKeys, 'BROWNFIELD_LIMITS_INVALID', 'Evidence limits');
  if (limitKeys.some((key) => !Number.isSafeInteger(evidence.limits[key]) || evidence.limits[key] < 1)) {
    throw evidenceError('BROWNFIELD_LIMITS_INVALID', 'Evidence limits are invalid.');
  }
  const sourceIds = new Map();
  for (const source of evidence.sources) {
    exactKeys(source, ['id', 'path', 'sha256', 'byteLength', 'language', 'workspaceOwner', 'status'],
      'BROWNFIELD_SOURCE_INVALID', 'Evidence source');
    const captured = snapshot.entries.get(source.path);
    if (source.id !== computeSourceId(source.path, source.sha256) || sourceIds.has(source.id)
      || !captured || captured.id !== source.id || captured.sha256 !== source.sha256
      || captured.byteLength !== source.byteLength || !HASH.test(source.sha256)
      || !Number.isSafeInteger(source.byteLength) || source.byteLength < 0 || !SOURCE_STATUSES.has(source.status)) {
      throw evidenceError('BROWNFIELD_SOURCE_IDENTITY', 'Evidence source identity does not match captured bytes.');
    }
    sourceIds.set(source.id, source);
  }
  const expectedInputDigest = sha256(stableStringify(evidence.sources.map((source) => ({
    path: source.path, sha256: source.sha256, status: source.status,
  }))));
  if (expectedInputDigest !== evidence.inputDigest) {
    throw evidenceError('BROWNFIELD_INPUT_IDENTITY', 'Evidence input digest does not match its published sources.');
  }
  const findingIds = new Set();
  for (const finding of evidence.findings) {
    exactKeys(finding, ['id', 'kind', 'name', 'assertionLevel', 'confidence', 'extractorId', 'extractorVersion',
      'sourceRefs', 'limitations'], 'BROWNFIELD_FINDING_INVALID', 'Finding', ['attributes']);
    if (typeof finding.kind !== 'string' || !/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/.test(finding.kind)
      || typeof finding.name !== 'string' || !finding.name || !FINDING_ASSERTIONS.has(finding.assertionLevel)
      || !CONFIDENCE.has(finding.confidence) || typeof finding.extractorId !== 'string'
      || typeof finding.extractorVersion !== 'string' || !Array.isArray(finding.limitations)
      || finding.limitations.some((item) => typeof item !== 'string')
      || !Array.isArray(finding.sourceRefs) || !finding.sourceRefs.length) {
      throw evidenceError('BROWNFIELD_FINDING_INVALID', 'Finding fields are invalid.');
    }
    for (const reference of finding.sourceRefs) validateSourceReference(reference, snapshot, sourceIds);
    if (finding.id !== computeFindingId(finding) || findingIds.has(finding.id)) {
      throw evidenceError('BROWNFIELD_FINDING_IDENTITY', 'Finding identity is invalid or duplicated.');
    }
    findingIds.add(finding.id);
  }
  const relationshipIds = new Set();
  for (const relationship of evidence.relationships) {
    exactKeys(relationship, ['id', 'kind', 'fromFindingId', 'to', 'resolution', 'sourceRefs'],
      'BROWNFIELD_RELATIONSHIP_INVALID', 'Relationship', ['candidates']);
    const fromFinding = evidence.findings.find((finding) => finding.id === relationship.fromFindingId);
    if (!fromFinding
      || !['declares-dependency', 'static-module-edge'].includes(relationship.kind)
      || !['external-declaration', 'resolved-local', 'ambiguous', 'unresolved'].includes(relationship.resolution)
      || !(relationship.to === null || typeof relationship.to === 'string')
      || (relationship.candidates !== undefined && (!Array.isArray(relationship.candidates)
        || relationship.candidates.some((candidate) => typeof candidate !== 'string')))
      || !Array.isArray(relationship.sourceRefs)) {
      throw evidenceError('BROWNFIELD_RELATIONSHIP_UNBOUND', 'Relationship source finding is missing or malformed.');
    }
    for (const reference of relationship.sourceRefs) validateSourceReference(reference, snapshot, sourceIds);
    const findingReferenceIds = new Set(fromFinding.sourceRefs.map((reference) => stableStringify(referenceIdentity(reference))));
    if (!relationship.sourceRefs.length
      || relationship.sourceRefs.some((reference) => !findingReferenceIds.has(stableStringify(referenceIdentity(reference))))) {
      throw evidenceError('BROWNFIELD_RELATIONSHIP_REFERENCE', 'Relationship references must be bound to its source finding.');
    }
    if (relationship.kind === 'declares-dependency') {
      if (fromFinding.kind !== 'dependency.manifest-declaration'
        || relationship.resolution !== 'external-declaration' || relationship.to !== fromFinding.name
        || relationship.candidates !== undefined) {
        throw evidenceError('BROWNFIELD_RELATIONSHIP_SEMANTICS', 'Dependency declaration relationship is inconsistent.');
      }
    } else {
      if (fromFinding.kind !== 'dependency.static-specifier') {
        throw evidenceError('BROWNFIELD_RELATIONSHIP_SEMANTICS', 'Module relationship source finding is inconsistent.');
      }
      if (relationship.resolution === 'resolved-local'
        && (typeof relationship.to !== 'string' || !snapshot.entries.has(relationship.to)
          || ![...sourceIds.values()].some((source) => source.path === relationship.to)
          || relationship.candidates !== undefined)) {
        throw evidenceError('BROWNFIELD_RELATIONSHIP_TARGET', 'Resolved local relationship target is not a captured published source.');
      }
      if (relationship.resolution === 'ambiguous'
        && (relationship.to !== null || !Array.isArray(relationship.candidates) || !relationship.candidates.length
          || relationship.candidates.some((candidate) => !snapshot.entries.has(candidate)
            || ![...sourceIds.values()].some((source) => source.path === candidate)))) {
        throw evidenceError('BROWNFIELD_RELATIONSHIP_TARGET', 'Ambiguous relationship candidates must be captured published sources.');
      }
      if (['external-declaration', 'unresolved'].includes(relationship.resolution)
        && (typeof relationship.to !== 'string' || relationship.candidates !== undefined)) {
        throw evidenceError('BROWNFIELD_RELATIONSHIP_TARGET', 'Non-local relationship target is inconsistent.');
      }
    }
    if (relationship.id !== computeRelationshipId(relationship) || relationshipIds.has(relationship.id)) {
      throw evidenceError('BROWNFIELD_RELATIONSHIP_IDENTITY', 'Relationship identity is invalid or duplicated.');
    }
    relationshipIds.add(relationship.id);
  }
  exactKeys(evidence.verification, ['mode', 'sourceHashes', 'sourceSpans', 'noMutation', 'sourceExecution', 'tests'],
    'BROWNFIELD_VERIFICATION_INVALID', 'Evidence verification');
  if (evidence.verification.mode !== 'static-only' || evidence.verification.sourceHashes !== 'verified'
    || evidence.verification.sourceSpans !== 'verified' || evidence.verification.noMutation !== 'verified-read-only-analysis'
    || evidence.verification.sourceExecution !== 'not-run' || evidence.verification.tests !== 'not-run-by-analysis') {
    throw evidenceError('BROWNFIELD_VERIFICATION_INVALID', 'Evidence verification claims are outside the static contract.');
  }
  if (!evidence.views || typeof evidence.views !== 'object' || Array.isArray(evidence.views)
    || Object.keys(evidence.views).some((view) => !evidence.scope.requestedViews.includes(view))) {
    throw evidenceError('BROWNFIELD_VIEW_INVALID', 'Evidence view collection is invalid.');
  }
  for (const [viewName, view] of Object.entries(evidence.views)) {
    const optional = [viewName === 'architecture' ? 'mapperSummary' : null,
      viewName === 'tests' ? 'coveragePercent' : null, viewName === 'tests' ? 'testExecution' : null,
      'reason'].filter(Boolean);
    exactKeys(view, ['status', 'findingIds'], 'BROWNFIELD_VIEW_INVALID', 'Evidence view', optional);
    if (!VIEW_STATUSES.has(view.status) || !Array.isArray(view.findingIds)
      || view.findingIds.some((id) => !findingIds.has(id))) {
      throw evidenceError('BROWNFIELD_VIEW_INVALID', 'Evidence view is malformed or references an unknown finding.');
    }
  }
  exactKeys(evidence.coverage, ['status', 'inventoryComplete', 'encounteredFiles', 'capturedBytes', 'byStatus',
    'byLanguage', 'supportedAnalyzedFiles', 'findingLimitReached'], 'BROWNFIELD_COVERAGE_INVALID', 'Evidence coverage');
  if (!['partial', 'complete-within-declared-supported-scope'].includes(evidence.coverage.status)
    || typeof evidence.coverage.inventoryComplete !== 'boolean'
    || !Number.isSafeInteger(evidence.coverage.encounteredFiles) || evidence.coverage.encounteredFiles < 0
    || !Number.isSafeInteger(evidence.coverage.capturedBytes) || evidence.coverage.capturedBytes < 0
    || evidence.coverage.capturedBytes > evidence.limits.maxTotalBytes
    || typeof evidence.coverage.findingLimitReached !== 'boolean') {
    throw evidenceError('BROWNFIELD_COVERAGE_INVALID', 'Evidence coverage values are invalid.');
  }
  if (!Array.isArray(evidence.risks) || evidence.risks.some((risk) => {
    try { exactKeys(risk, ['code', 'path'], 'BROWNFIELD_RISK_INVALID', 'Risk'); } catch (_error) { return true; }
    return typeof risk.code !== 'string' || !(risk.path === null || typeof risk.path === 'string');
  })) throw evidenceError('BROWNFIELD_RISK_INVALID', 'Evidence risks are invalid.');
  if (!Array.isArray(evidence.uncertainty) || evidence.uncertainty.some((item) => {
    try { exactKeys(item, ['code', 'statement'], 'BROWNFIELD_UNCERTAINTY_INVALID', 'Uncertainty'); } catch (_error) { return true; }
    return typeof item.code !== 'string' || typeof item.statement !== 'string';
  })) throw evidenceError('BROWNFIELD_UNCERTAINTY_INVALID', 'Evidence uncertainty is invalid.');
  exactKeys(evidence.provenance, ['implementationOrigin', 'upstreamCodeImported', 'intake'],
    'BROWNFIELD_PROVENANCE_INVALID', 'Evidence provenance');
  if (evidence.provenance.implementationOrigin !== 'independently-authored'
    || evidence.provenance.upstreamCodeImported !== false || typeof evidence.provenance.intake !== 'string') {
    throw evidenceError('BROWNFIELD_PROVENANCE_INVALID', 'Evidence provenance is invalid.');
  }
  exactKeys(evidence.publication, ['status', 'target', 'reason'], 'BROWNFIELD_PUBLICATION_INVALID', 'Evidence publication');
  if (!['unavailable', 'not-requested'].includes(evidence.publication.status)
    || typeof evidence.publication.target !== 'string'
    || !(evidence.publication.reason === null || typeof evidence.publication.reason === 'string')) {
    throw evidenceError('BROWNFIELD_PUBLICATION_INVALID', 'Evidence publication is invalid.');
  }
  if (stableStringify(evidence).includes(path.resolve(snapshot.projectRoot))) {
    throw evidenceError('BROWNFIELD_ABSOLUTE_PATH_EXPOSED', 'Canonical evidence exposes an absolute machine path.');
  }
  return evidence;
}

function buildEvidence({ contract, contractHash, snapshot, syntax, mapperSummary }) {
  const sources = snapshot.sources.filter((source) => source.id).map(publicSource);
  const supportedAnalyzed = sources.filter((source) => source.status === 'analyzed');
  const unsupported = sources.filter((source) => source.status === 'unsupported');
  const diagnostics = [...snapshot.diagnostics, ...(syntax?.diagnostics || [])]
    .sort((left, right) => `${left.code}:${left.path || ''}`.localeCompare(`${right.code}:${right.path || ''}`));
  let findings = [...(syntax?.findings || [])].sort((left, right) => left.id.localeCompare(right.id));
  const truncatedFindings = findings.length > contract.limits.maxFindings;
  findings = findings.slice(0, contract.limits.maxFindings);
  const retainedFindingIds = new Set(findings.map((finding) => finding.id));
  const relationships = (syntax?.relationships || []).filter((item) => retainedFindingIds.has(item.fromFindingId))
    .sort((left, right) => left.id.localeCompare(right.id));
  const omittedStatuses = Object.entries(snapshot.stats.coverageCounts)
    .filter(([status, count]) => count > 0 && !['analyzed', 'metadata-only'].includes(status));
  const parserUnavailable = !syntax;
  const partial = snapshot.stats.truncated || omittedStatuses.length > 0 || diagnostics.length > 0
    || truncatedFindings || parserUnavailable;
  const kindPrefix = { architecture: ['architecture.'], domain: ['domain.'], api: ['api.'], data: ['data.'],
    dependencies: ['dependency.'], tests: ['tests.'], risks: ['risk.'] };
  const views = {};
  for (const view of contract.requestedViews) {
    const selected = findings.filter((finding) => kindPrefix[view].some((prefix) => finding.kind.startsWith(prefix)));
    const syntaxRequired = ['domain', 'api', 'data', 'dependencies', 'tests', 'risks'].includes(view);
    const unavailable = syntaxRequired && parserUnavailable;
    views[view] = {
      status: unavailable ? 'unavailable' : partial ? 'partial' : 'complete-within-declared-supported-scope',
      findingIds: selected.map((finding) => finding.id),
      ...(unavailable ? { reason: 'TYPESCRIPT_ANALYZER_UNAVAILABLE' } : {}),
      ...(view === 'architecture' ? { mapperSummary } : {}),
      ...(view === 'tests' ? { coveragePercent: null, testExecution: 'not-run' } : {}),
    };
  }
  const inputDigest = sha256(stableStringify(sources.map((source) => ({ path: source.path, sha256: source.sha256, status: source.status }))));
  const evidence = {
    protocol: EVIDENCE_PROTOCOL, analysisId: contract.analysisId, contractHash, inputDigest,
    analyzers: [
      { id: 'codebase-mapper', version: mapperSummary.version || 'unknown', evidenceLevel: 'structural-hint' },
      { id: 'typescript-snapshot', version: syntax?.analyzerVersion || null, evidenceLevel: syntax ? 'observed-syntax' : 'unavailable' },
    ],
    scope: { allowedPaths: contract.allowedPaths, exclusions: contract.exclusions, requestedViews: contract.requestedViews, staticOnly: true },
    limits: contract.limits,
    coverage: {
      status: partial ? 'partial' : 'complete-within-declared-supported-scope',
      inventoryComplete: !snapshot.stats.truncated && omittedStatuses.length === 0,
      encounteredFiles: snapshot.stats.files, capturedBytes: snapshot.stats.totalBytes,
      byStatus: snapshot.stats.coverageCounts,
      byLanguage: sources.reduce((result, source) => ({ ...result, [source.language]: (result[source.language] || 0) + 1 }), {}),
      supportedAnalyzedFiles: supportedAnalyzed.length, findingLimitReached: truncatedFindings,
    },
    sources, views, findings, relationships,
    risks: diagnostics.map((diagnostic) => ({ code: diagnostic.code, path: diagnostic.path || null })),
    uncertainty: [
      { code: 'STATIC_ONLY', statement: 'Runtime reachability, deployed topology, installed dependencies, test results, and database state were not observed.' },
      ...(unsupported.length ? [{ code: 'UNSUPPORTED_LANGUAGES', statement: 'Unsupported-language files are inventory-only.' }] : []),
    ],
    provenance: { implementationOrigin: 'independently-authored', upstreamCodeImported: false,
      intake: 'docs/framework/epics/aexos-evolution/provenance/brownfield-intake.json' },
    verification: { mode: 'static-only', sourceHashes: 'verified', sourceSpans: 'verified',
      noMutation: 'verified-read-only-analysis', sourceExecution: 'not-run', tests: 'not-run-by-analysis' },
    publication: { status: contract.output.mode === 'governed' ? 'unavailable' : 'not-requested', target: contract.output.path,
      reason: contract.output.mode === 'governed' ? 'GOVERNED_PUBLICATION_REQUIRES_EXTERNAL_RUNTIME' : null },
  };
  validateBrownfieldEvidence(evidence, snapshot);
  return evidence;
}

module.exports = {
  CONFIDENCE, EVIDENCE_PROTOCOL, FINDING_ASSERTIONS, buildEvidence, computeFindingId,
  computeRelationshipId, computeSourceId, lineColumnAt, publicSource,
  validateBrownfieldEvidence, validateSourceReference,
};
