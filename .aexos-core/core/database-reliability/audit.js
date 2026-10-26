'use strict';

const { clone, digest, stableStringify } = require('../execution/durable-evidence');
const { deepFreeze, resolveValidatedObservation, resolveValidatedRequest } = require('./contract');
const { compileAuditChecks, resolveCompiledAudit } = require('./catalog');

const REPORT_SCHEMA_VERSION = 'aexos.database-audit.report/v1';

function objectReference(kind, value) {
  return { kind, identityHash: digest({ kind, value }) };
}

function evidenceId(checkId, reference, fact) {
  return `e-${digest({ checkId, reference, fact })}`;
}

function finding(checkId, rule, severity, reference, fact, classification = 'inferred-risk') {
  const safeReference = objectReference(reference.kind, reference.value);
  const evidenceIds = [evidenceId(checkId, safeReference, fact)];
  const result = {
    rule, version: '1.0.0', severity, objectReference: safeReference,
    evidenceIds, classification, advisoryRemediation: `${rule}_REVIEW`,
  };
  return { ...result, id: `f-${digest(result)}` };
}

function checkEnvelope(checkId, status, findings, limitations = []) {
  const sortedFindings = [...findings].sort((a, b) => (
    `${a.rule}:${a.objectReference.identityHash}:${a.id}`.localeCompare(`${b.rule}:${b.objectReference.identityHash}:${b.id}`)
  ));
  return {
    checkId, templateVersion: '1.0.0', status, sourceKind: 'fixture',
    coverage: status === 'OBSERVED' ? 'fixture-declaration-complete' : 'fixture-declaration-incomplete',
    findings: sortedFindings, limitations: [...new Set(limitations)].sort(),
  };
}

function analyzeSchema(observation) {
  if (!observation.schemaObjects.length || observation.coverage.catalogVisibility === 'unavailable') {
    return checkEnvelope('schema', 'NOT_ASSESSED', [], ['SCHEMA_EVIDENCE_MISSING']);
  }
  const findings = [];
  for (const object of observation.schemaObjects) {
    const structure = (item) => [item.id, item.type, item.columns || [],
      item.referencedTable || null, item.referencedColumns || [], item.validated !== false];
    const actual = new Set(object.constraints.map((item) => stableStringify(structure(item))));
    for (const expected of object.expectedConstraints) {
      if (!actual.has(stableStringify(structure(expected)))) findings.push(finding('schema', 'EXPECTED_CONSTRAINT_MISSING', 'high',
        { kind: 'table', value: [object.schema, object.name] }, { expectedType: expected.type, expectedIdHash: digest(expected.id) }));
    }
  }
  const limitations = observation.coverage.catalogVisibility === 'partial' ? ['CATALOG_VISIBILITY_PARTIAL'] : [];
  return checkEnvelope('schema', limitations.length ? 'TRUNCATED' : 'OBSERVED', findings, limitations);
}

function analyzeIndexes(observation) {
  if (!observation.schemaObjects.length || observation.coverage.catalogVisibility === 'unavailable') {
    return checkEnvelope('indexes', 'NOT_ASSESSED', [], ['INDEX_EVIDENCE_MISSING']);
  }
  const findings = [];
  for (const object of observation.schemaObjects) {
    const structure = (item) => [item.columns, item.includeColumns || [], item.unique,
      item.valid !== false, item.ready !== false, item.partial === true, item.expression === true];
    const actual = new Set(object.indexes.map((item) => stableStringify(structure(item))));
    for (const expected of object.expectedIndexes) {
      const required = { ...expected, valid: true, ready: true, partial: false, expression: false };
      if (!actual.has(stableStringify(structure(required)))) findings.push(finding('indexes', 'EXPECTED_INDEX_MISSING', 'medium',
        { kind: 'table', value: [object.schema, object.name] }, { expectedColumnsHash: digest(expected.columns), unique: expected.unique }));
    }
  }
  const limitations = observation.coverage.catalogVisibility === 'partial' ? ['CATALOG_VISIBILITY_PARTIAL'] : [];
  return checkEnvelope('indexes', limitations.length ? 'TRUNCATED' : 'OBSERVED', findings, limitations);
}

function analyzeMigrations(observation) {
  const migration = observation.migrations;
  if (migration.status === 'unavailable' || !migration.expected.length || !migration.observed.length) {
    return checkEnvelope('migration', 'NOT_ASSESSED', [], ['MIGRATION_HISTORY_UNAVAILABLE']);
  }
  const findings = [];
  const observed = new Map(migration.observed.map((item) => [item.id, item]));
  migration.expected.forEach((expected) => {
    const actual = observed.get(expected.id);
    if (!actual) findings.push(finding('migration', 'EXPECTED_MIGRATION_MISSING', 'high',
      { kind: 'migration', value: expected.id }, { expectedOrder: expected.order }));
    else if (actual.hash !== expected.hash) findings.push(finding('migration', 'MIGRATION_HASH_DRIFT', 'high',
      { kind: 'migration', value: expected.id }, { expectedHash: expected.hash, observedHash: actual.hash }));
    else if (actual.order !== expected.order) findings.push(finding('migration', 'MIGRATION_ORDER_DRIFT', 'medium',
      { kind: 'migration', value: expected.id }, { expectedOrder: expected.order, observedOrder: actual.order }));
  });
  const limitations = migration.status === 'partial' ? ['MIGRATION_HISTORY_PARTIAL'] : ['MIGRATION_SQL_NOT_VERIFIED'];
  return checkEnvelope('migration', migration.status === 'partial' ? 'TRUNCATED' : 'OBSERVED', findings, limitations);
}

function analyzeRls(observation) {
  if (!observation.rls.length || observation.coverage.catalogVisibility === 'unavailable') {
    return checkEnvelope('rls', 'NOT_ASSESSED', [], ['RLS_EVIDENCE_MISSING']);
  }
  const findings = [];
  const partial = observation.coverage.catalogVisibility === 'partial';
  const limitations = ['RLS_POLICY_SEMANTICS_NOT_VERIFIED', 'TENANT_ISOLATION_NOT_TESTED',
    ...(partial ? ['CATALOG_VISIBILITY_PARTIAL'] : [])];
  for (const table of observation.rls) {
    const ref = { kind: 'table', value: [table.schema, table.table] };
    if (!table.enabled && table.grants.length) findings.push(finding('rls', 'RLS_DISABLED_WITH_GRANTS', 'high', ref,
      { grantsHash: digest([...table.grants].sort()) }, 'observed'));
    if (table.enabled && !table.policies.length) findings.push(finding('rls', 'RLS_POLICY_ABSENT_DEFAULT_DENY', 'info', ref,
      { enabled: true, policyCount: 0 }, 'observed'));
    if (table.policies.some((policy) => policy.classification === 'seeded-always-true')) findings.push(finding('rls', 'SEEDED_PERMISSIVE_POLICY', 'high', ref,
      { seededClassification: 'always-true' }, 'observed'));
  }
  return checkEnvelope('rls', partial ? 'TRUNCATED' : 'OBSERVED', findings, limitations);
}

function analyzePrivileges(observation) {
  const privileges = observation.privileges;
  if (privileges.status === 'unavailable' || (!privileges.roles.length && !privileges.grants.length)) {
    return checkEnvelope('privileges', 'NOT_ASSESSED', [], ['PRIVILEGE_EVIDENCE_MISSING']);
  }
  const findings = [];
  for (const grant of privileges.grants) {
    if (grant.grantee.toUpperCase() === 'PUBLIC') findings.push(finding('privileges', 'PUBLIC_PRIVILEGE_EXPOSURE', 'high',
      { kind: 'object', value: [grant.schema, grant.object] }, { privilege: grant.privilege }, 'observed'));
  }
  for (const role of privileges.roles) {
    if (role.superuser || role.bypassRls || role.canCreateDb || role.canCreateRole) findings.push(finding('privileges', 'ELEVATED_ROLE_SCOPE', 'high',
      { kind: 'role', value: role.id }, { superuser: role.superuser, bypassRls: role.bypassRls,
        canCreateDb: role.canCreateDb, canCreateRole: role.canCreateRole }, 'observed'));
  }
  const partial = privileges.status === 'partial' || privileges.graphTruncated
    || observation.coverage.roleGraph !== 'complete' || observation.coverage.catalogVisibility !== 'complete';
  return checkEnvelope('privileges', partial ? 'TRUNCATED' : 'OBSERVED', findings,
    partial ? ['EFFECTIVE_ROLE_OR_CATALOG_SCOPE_INCOMPLETE'] : []);
}

function analyzeBackup(observation) {
  const backup = observation.backup;
  if (backup.status === 'unavailable') return checkEnvelope('backup-readiness', 'NOT_ASSESSED', [], ['BACKUP_METADATA_UNAVAILABLE']);
  const findings = [];
  for (const [field, rule] of [['hasSchedule', 'BACKUP_SCHEDULE_UNCONFIRMED'], ['hasRetention', 'BACKUP_RETENTION_UNCONFIRMED'],
    ['hasEncryption', 'BACKUP_ENCRYPTION_UNCONFIRMED'], ['latestReceiptVerified', 'BACKUP_RECEIPT_UNVERIFIED']]) {
    if (backup[field] !== true) findings.push(finding('backup-readiness', rule, 'medium',
      { kind: 'backup-metadata', value: 'operator-supplied' }, { status: backup[field] === null ? 'missing' : 'negative' }, 'observed'));
  }
  const complete = backup.status === 'receipt-verified' && Object.values({ schedule: backup.hasSchedule,
    retention: backup.hasRetention, encryption: backup.hasEncryption, receipt: backup.latestReceiptVerified }).every(Boolean);
  return checkEnvelope('backup-readiness', complete ? 'OBSERVED' : 'TRUNCATED', findings,
    ['RESTORE_READINESS_NOT_VERIFIED', 'PROVIDER_BACKUP_BEHAVIOR_NOT_ASSESSED']);
}

function visitPlan(node, state) {
  if (!node) return;
  state.maxCost = Math.max(state.maxCost, node.totalCost);
  state.maxRows = Math.max(state.maxRows, node.planRows);
  if (node.nodeType === 'Seq Scan') state.hasSequentialScan = true;
  node.children.forEach((child) => visitPlan(child, state));
}

function analyzePlans(observation, request) {
  if (!observation.plans.length) return checkEnvelope('plans', 'NOT_ASSESSED', [], ['PLAN_EVIDENCE_MISSING']);
  const findings = [];
  const limitations = ['FIXTURE_PLAN_DECLARATION_UNVERIFIED', 'PLAN_ESTIMATES_ARE_NOT_MEASURED_LATENCY'];
  for (const plan of observation.plans) {
    if (plan.status !== 'estimated' || !plan.plan) {
      limitations.push(`PLAN_${plan.status.replace('-', '_').toUpperCase()}`);
      continue;
    }
    const state = { maxCost: 0, maxRows: 0, hasSequentialScan: false };
    visitPlan(plan.plan, state);
    if (state.hasSequentialScan && (state.maxRows >= 10000 || state.maxCost >= 10000)) findings.push(finding('plans', 'EXPENSIVE_FIXTURE_PLAN_ESTIMATE', 'medium',
      { kind: 'plan-request', value: plan.requestId }, state, 'inferred-risk'));
  }
  const complete = observation.coverage.catalogVisibility === 'complete'
    && request.planRequests.every((item) => observation.plans.some((plan) => (
      plan.requestId === item.id && plan.status === 'estimated' && plan.plan
    )));
  if (observation.coverage.catalogVisibility !== 'complete') limitations.push('CATALOG_VISIBILITY_PARTIAL');
  return checkEnvelope('plans', complete ? 'OBSERVED'
    : observation.coverage.catalogVisibility === 'partial' ? 'TRUNCATED' : 'NOT_ASSESSED', findings, limitations);
}

const ANALYZERS = Object.freeze({
  schema: analyzeSchema, indexes: analyzeIndexes, migration: analyzeMigrations, rls: analyzeRls,
  privileges: analyzePrivileges, plans: analyzePlans, 'backup-readiness': analyzeBackup,
});

function analyzeWithCompilation(validatedRequest, fixtureObservation, compiledInput) {
  const requestIdentity = resolveValidatedRequest(validatedRequest);
  const observationIdentity = resolveValidatedObservation(fixtureObservation, requestIdentity);
  const compiled = resolveCompiledAudit(compiledInput, requestIdentity);
  const request = requestIdentity.request;
  const observation = observationIdentity.observation;
  const checks = request.checks.map((checkId) => ANALYZERS[checkId](observation, request))
    .sort((a, b) => a.checkId.localeCompare(b.checkId));
  for (const check of checks) {
    const matching = check.checkId === 'plans' ? compiled.plans
      : compiled.catalog.filter((statement) => statement.checkId === check.checkId
        || (check.checkId === 'rls' && statement.checkId === 'privileges'));
    check.statementHash = matching.length ? digest(matching.map((statement) => statement.dispatchHash).sort()) : null;
  }
  const risks = checks.flatMap((check) => check.findings.map((item) => ({
    checkId: check.checkId, findingId: item.id, rule: item.rule, severity: item.severity,
  }))).sort((a, b) => `${a.checkId}:${a.rule}:${a.findingId}`.localeCompare(`${b.checkId}:${b.rule}:${b.findingId}`));
  const unsupportedChecks = checks.filter((check) => check.status !== 'OBSERVED').map((check) => ({
    checkId: check.checkId, status: check.status, reasonCodes: check.limitations,
  }));
  const report = {
    schemaVersion: REPORT_SCHEMA_VERSION, auditId: request.auditId, requestHash: requestIdentity.requestHash,
    policyHash: digest({ limits: request.limits, checks: request.checks, redaction: request.redaction }),
    adapter: clone(observation.adapter), sourceKind: 'fixture', databaseIdentityHash: digest(observation.databaseIdentity),
    serverMajor: observation.databaseIdentity.postgresMajor, scope: { schemas: request.schemas, checks: request.checks },
    appliedLimits: clone(request.limits), checks, risks, unsupportedChecks,
    limitations: [...new Set(['FIXTURE_ONLY_NO_DATABASE_AUDIT', 'READ_ONLY_SERVER_ENFORCEMENT_NOT_VERIFIED',
      ...observation.limitations])].sort(), publication: { status: 'not-requested', target: 'stdout', reason: null },
  };
  const canonicalContentDigest = digest(report);
  const observationDigest = digest({ report, observedAt: observation.observedAt, observationHash: observationIdentity.observationHash });
  return deepFreeze({ report, canonicalContentDigest, observationDigest,
    canonical: stableStringify({ ...report, canonicalContentDigest, observationDigest }) });
}

function analyzeObservation(validatedRequest, fixtureObservation) {
  const requestIdentity = resolveValidatedRequest(validatedRequest);
  return analyzeWithCompilation(requestIdentity, fixtureObservation, compileAuditChecks(requestIdentity));
}

function analyzeCompiledObservation(validatedRequest, fixtureObservation, compiled) {
  return analyzeWithCompilation(validatedRequest, fixtureObservation, compiled);
}

module.exports = { REPORT_SCHEMA_VERSION, analyzeCompiledObservation, analyzeObservation, objectReference };
