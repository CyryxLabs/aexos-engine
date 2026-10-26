'use strict';

const { digest } = require('../execution/durable-evidence');
const { deepFreeze, fail, resolveValidatedRequest } = require('./contract');

const TEMPLATE_VERSION = '2.0.0';
const MIGRATION_RELATIONS = Object.freeze({
  'aexos-fixture-v1': Object.freeze({ schema: 'aexos_fixture', statement: `SELECT
    CASE WHEN pg_catalog.octet_length(migration_id) <= $3 THEN migration_id ELSE NULL END AS migration_id,
    migration_order,
    CASE WHEN pg_catalog.octet_length(migration_hash) <= $3 THEN migration_hash ELSE NULL END AS migration_hash,
    pg_catalog.octet_length(migration_id) > $3 OR pg_catalog.octet_length(migration_hash) > $3 AS oversized
    FROM ONLY aexos_fixture.migration_history WHERE manifest_ref = $1
    ORDER BY migration_order, migration_id LIMIT $2` }),
  'aexos-fixture-clean-v1': Object.freeze({ schema: 'aexos_fixture_clean', statement: `SELECT
    CASE WHEN pg_catalog.octet_length(migration_id) <= $3 THEN migration_id ELSE NULL END AS migration_id,
    migration_order,
    CASE WHEN pg_catalog.octet_length(migration_hash) <= $3 THEN migration_hash ELSE NULL END AS migration_hash,
    pg_catalog.octet_length(migration_id) > $3 OR pg_catalog.octet_length(migration_hash) > $3 AS oversized
    FROM ONLY aexos_fixture_clean.migration_history WHERE manifest_ref = $1
    ORDER BY migration_order, migration_id LIMIT $2` }),
});
const CATALOG_TEMPLATES = Object.freeze({
  schema: `SELECT * FROM (
    SELECT n.nspname AS schema_name, c.relname AS object_name, c.relkind::text AS object_kind,
      'constraint'::text AS fact_kind, con.conname AS constraint_name,
      con.contype::text AS constraint_type, con.convalidated AS is_validated,
      keycol.ordinality::int4 AS key_order, a.attname AS column_name,
      CASE WHEN con.confrelid = 0 THEN NULL ELSE rn.nspname || '.' || rc.relname END AS referenced_table,
      ra.attname AS referenced_column
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN LATERAL pg_catalog.unnest(con.conkey) WITH ORDINALITY keycol(attnum, ordinality) ON true
    LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum = keycol.attnum
    LEFT JOIN pg_catalog.pg_class rc ON rc.oid = con.confrelid
    LEFT JOIN pg_catalog.pg_namespace rn ON rn.oid = rc.relnamespace
    LEFT JOIN pg_catalog.pg_attribute ra ON ra.attrelid = con.confrelid
      AND ra.attnum = con.confkey[keycol.ordinality]
    WHERE n.nspname = ANY($1::name[]) AND c.relkind = 'r' AND con.contype IN ('p','f','u','c')
    UNION ALL
    SELECT n.nspname, c.relname, c.relkind::text, 'not-null'::text, NULL::name, NULL::text,
      true, a.attnum::int4, a.attname, NULL::text, NULL::name
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0
      AND NOT a.attisdropped AND a.attnotnull
    WHERE n.nspname = ANY($1::name[]) AND c.relkind = 'r'
    UNION ALL
    SELECT n.nspname, c.relname, c.relkind::text, 'object'::text, NULL::name, NULL::text,
      true, NULL::int4, NULL::name, NULL::text, NULL::name
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ANY($1::name[]) AND c.relkind = 'r') facts
    ORDER BY schema_name, object_name, fact_kind, constraint_name, key_order LIMIT $2`,
  indexes: `SELECT n.nspname AS schema_name, c.relname AS table_name,
    i.relname AS index_name, x.indisunique AS is_unique, x.indisvalid AS is_valid,
    x.indisready AS is_ready, x.indexprs IS NOT NULL AS has_expression,
    x.indpred IS NOT NULL AS is_partial, k.ordinality AS column_order,
    k.ordinality <= x.indnkeyatts AS is_key, a.attname AS column_name
    FROM pg_catalog.pg_index x JOIN pg_catalog.pg_class c ON c.oid = x.indrelid
    JOIN pg_catalog.pg_class i ON i.oid = x.indexrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN LATERAL pg_catalog.unnest(x.indkey) WITH ORDINALITY k(attnum, ordinality) ON true
    LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
    WHERE n.nspname = ANY($1::name[]) AND c.relkind = 'r'
    ORDER BY n.nspname, c.relname, i.relname, k.ordinality LIMIT $2`,
  migration: MIGRATION_RELATIONS['aexos-fixture-v1'].statement,
  rls: `SELECT n.nspname AS schema_name, c.relname AS table_name,
    c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
    p.polname AS policy_name, CASE p.polcmd WHEN '*' THEN 'ALL' WHEN 'r' THEN 'SELECT'
      WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' END AS policy_command,
    p.polpermissive AS policy_permissive, role_oid AS policy_role_oid,
    CASE WHEN role_oid = 0 THEN 'PUBLIC' ELSE pr.rolname END AS policy_role,
    pg_catalog.md5(COALESCE(p.polqual::text, '')) AS policy_qual_hash,
    pg_catalog.md5(COALESCE(p.polwithcheck::text, '')) AS policy_check_hash
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_catalog.pg_policy p ON p.polrelid = c.oid
    LEFT JOIN LATERAL pg_catalog.unnest(p.polroles) role_oid ON true
    LEFT JOIN pg_catalog.pg_roles pr ON pr.oid = role_oid
    WHERE n.nspname = ANY($1::name[]) AND c.relkind = 'r'
    ORDER BY n.nspname, c.relname, p.polname, pr.rolname LIMIT $2`,
  privileges: `SELECT n.nspname AS schema_name, c.relname AS object_name,
    grantee.rolname AS grantee_name, acl.privilege_type,
    COALESCE(grantee.rolsuper, false) AS rolsuper,
    COALESCE(grantee.rolbypassrls, false) AS rolbypassrls,
    COALESCE(grantee.rolcreatedb, false) AS rolcreatedb,
    COALESCE(grantee.rolcreaterole, false) AS rolcreaterole
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN LATERAL pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))) acl ON true
    LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid = acl.grantee
    WHERE n.nspname = ANY($1::name[]) AND c.relkind = 'r'
    ORDER BY n.nspname, c.relname, acl.grantee, acl.privilege_type LIMIT $2`,
  'backup-readiness': 'SELECT current_setting($1, true) AS setting_value',
});

const FIXTURE_RELATIONS = Object.freeze({
  'aexos_fixture.accounts': Object.freeze(['id', 'tenant_id', 'external_id', 'created_at']),
  'aexos_fixture.events': Object.freeze(['id', 'tenant_id', 'account_id', 'created_at']),
});
const GENERATED_STATEMENTS = new WeakSet();
const COMPILED_AUDITS = new WeakSet();

function generated(value) {
  const result = deepFreeze(value);
  GENERATED_STATEMENTS.add(result);
  return result;
}

function templateIdentity(templateId, sql) {
  return digest({ templateId, templateVersion: TEMPLATE_VERSION, sql });
}

function dispatchIdentity(templateId, sql, parameters) {
  return digest({ templateId, templateVersion: TEMPLATE_VERSION, sql, parameters });
}

function buildCatalogChecks(validated, trustedOptions = {}) {
  const identity = resolveValidatedRequest(validated);
  const requested = identity.request.checks.filter((check) => check !== 'plans');
  const checksWithDependencies = [...new Set([
    ...requested,
    ...(requested.includes('rls') ? ['privileges'] : []),
  ])];
  const checks = checksWithDependencies.map((check) => {
    const migrationRelation = MIGRATION_RELATIONS[
      trustedOptions.migrationRelationId || 'aexos-fixture-v1'
    ];
    const sql = check === 'migration' ? migrationRelation?.statement : CATALOG_TEMPLATES[check];
    if (!sql) fail('DATABASE_MIGRATION_RELATION_UNSUPPORTED',
      'Migration observation is limited to a fixed registered fixture relation.');
    const parameters = check === 'migration'
      ? [identity.request.migrationManifestRef, identity.request.limits.maxRowsPerCheck + 1,
        identity.request.limits.maxStringBytes]
      : check === 'backup-readiness'
        ? ['wal_level']
        : [identity.request.schemas, identity.request.limits.maxRowsPerCheck + 1];
    return generated({ checkId: check, templateId: `database.catalog.${check}/v2`,
      templateVersion: TEMPLATE_VERSION, statement: sql, parameters,
      statementHash: templateIdentity(`database.catalog.${check}/v2`, sql),
      dispatchHash: dispatchIdentity(`database.catalog.${check}/v2`, sql, parameters), classification: 'catalog-template' });
  });
  if (checks.length + identity.request.planRequests.length > identity.request.limits.maxStatements) {
    fail('DATABASE_STATEMENT_LIMIT', 'Requested checks exceed the statement budget.');
  }
  return checks;
}

function compileFixturePlan(planRequest) {
  const relationKey = `${planRequest.relation.schema}.${planRequest.relation.name}`;
  const allowed = FIXTURE_RELATIONS[relationKey];
  if (!allowed) fail('DATABASE_PLAN_RELATION_UNSUPPORTED', 'Plan relation is not in the fixed fixture allowlist.');
  const columns = [...planRequest.projection, ...planRequest.equalityPredicates.map((item) => item.column), ...planRequest.orderBy];
  if (columns.some((column) => !allowed.includes(column))) fail('DATABASE_PLAN_COLUMN_UNSUPPORTED', 'Plan column is not in the fixed fixture allowlist.');
  const fixedRelation = relationKey === 'aexos_fixture.accounts' ? '"aexos_fixture"."accounts"' : '"aexos_fixture"."events"';
  const renderColumn = (column) => `"${allowed.find((item) => item === column)}"`;
  const projection = planRequest.projection.map(renderColumn).join(', ');
  const predicates = planRequest.equalityPredicates.map((item, index) => `${renderColumn(item.column)} = $${index + 1}::int4`);
  const order = planRequest.orderBy.length ? ` ORDER BY ${planRequest.orderBy.map(renderColumn).join(', ')}` : '';
  const where = predicates.length ? ` WHERE ${predicates.join(' AND ')}` : '';
  const statement = `EXPLAIN (FORMAT JSON, ANALYZE FALSE, VERBOSE FALSE, COSTS TRUE) SELECT ${projection} FROM ONLY ${fixedRelation}${where}${order} LIMIT ${planRequest.limit}`;
  const templateId = `database.fixture-plan.${relationKey}/v2`;
  return generated({ checkId: 'plans', requestId: planRequest.id, templateId,
    templateVersion: TEMPLATE_VERSION, statement,
    parameters: planRequest.equalityPredicates.map((item) => item.value),
    statementHash: templateIdentity(templateId, statement),
    dispatchHash: dispatchIdentity(templateId, statement, planRequest.equalityPredicates.map((item) => item.value)),
    classification: 'fixture-plan-template' });
}

function buildFixturePlanChecks(validated) {
  const identity = resolveValidatedRequest(validated);
  if (identity.request.checks.filter((check) => check !== 'plans').length
    + identity.request.planRequests.length > identity.request.limits.maxStatements) {
    fail('DATABASE_STATEMENT_LIMIT', 'Requested checks exceed the statement budget.');
  }
  return identity.request.planRequests.map(compileFixturePlan);
}

function compileAuditChecks(validated, trustedOptions = {}) {
  const identity = resolveValidatedRequest(validated);
  const migrationRelationId = trustedOptions.migrationRelationId || 'aexos-fixture-v1';
  if (!MIGRATION_RELATIONS[migrationRelationId]) fail('DATABASE_MIGRATION_RELATION_UNSUPPORTED',
    'Migration observation is limited to a fixed registered fixture relation.');
  const compiled = deepFreeze({
    requestHash: identity.requestHash,
    migrationRelationId,
    effectiveLimits: identity.request.limits,
    catalog: buildCatalogChecks(identity, { migrationRelationId }),
    plans: buildFixturePlanChecks(identity),
  });
  COMPILED_AUDITS.add(compiled);
  return compiled;
}

function resolveCompiledAudit(candidate, validated) {
  const identity = resolveValidatedRequest(validated);
  if (!candidate || typeof candidate !== 'object' || !COMPILED_AUDITS.has(candidate)
    || candidate.requestHash !== identity.requestHash) {
    fail('DATABASE_COMPILATION_INVALID',
      'Audit analysis requires the exact sealed compiler result for this request.');
  }
  return candidate;
}

function classifyGeneratedStatement(candidate) {
  if (!candidate || typeof candidate !== 'object' || !GENERATED_STATEMENTS.has(candidate)) return 'denied';
  const catalogTemplates = Object.entries(CATALOG_TEMPLATES)
    .filter(([check]) => check !== 'migration')
    .concat(Object.values(MIGRATION_RELATIONS).map(({ statement }) => ['migration', statement]));
  const catalogMatch = catalogTemplates.some(([check, sql]) => (
    candidate.templateId === `database.catalog.${check}/v2`
    && candidate.statement === sql
    && candidate.statementHash === templateIdentity(candidate.templateId, sql)
    && candidate.dispatchHash === dispatchIdentity(candidate.templateId, sql, candidate.parameters)
  ));
  if (catalogMatch) return 'catalog-template';
  if (candidate.classification === 'fixture-plan-template'
    && Object.keys(FIXTURE_RELATIONS).some((relation) => candidate.templateId === `database.fixture-plan.${relation}/v2`)
    && candidate.statementHash === templateIdentity(candidate.templateId, candidate.statement)
    && candidate.dispatchHash === dispatchIdentity(candidate.templateId, candidate.statement, candidate.parameters)
    && /^EXPLAIN \(FORMAT JSON, ANALYZE FALSE, VERBOSE FALSE, COSTS TRUE\) SELECT /.test(candidate.statement)
    && !/[;]|--|\/\*|\bANALYZE\s+TRUE\b|\b(?:WITH|COPY|CALL|DO)\b/i.test(candidate.statement)) return 'fixture-plan-template';
  return 'denied';
}

module.exports = {
  CATALOG_TEMPLATES, FIXTURE_RELATIONS, MIGRATION_RELATIONS, TEMPLATE_VERSION, buildCatalogChecks,
  buildFixturePlanChecks, classifyGeneratedStatement, compileAuditChecks, dispatchIdentity,
  resolveCompiledAudit, templateIdentity,
};
