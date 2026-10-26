'use strict';

const { clone, digest, stableStringify } = require('../execution/durable-evidence');
const { analyzeCompiledObservation } = require('./audit');
const {
  MIGRATION_BASELINE_SQL, PLAN_BASELINE_SQL, migrationBaselineMatches, planBaselineMatches,
} = require('./baseline-policy');
const {
  deepFreeze, fail, resolveValidatedRequest, validateObservation, validateRequest,
} = require('./contract');
const {
  MIGRATION_RELATIONS, classifyGeneratedStatement, compileAuditChecks,
} = require('./catalog');

const DRIVER_VERSION = '8.23.1';
const LIVE_SCHEMA_VERSION = 'aexos.database-audit.live-report/v1';
const LOOPBACK = '127.0.0.1';
const AUDIT_ACTION = 'audit:read';
const CONTROL_SQL = deepFreeze({
  begin: 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
  identity: `SELECT current_setting('transaction_read_only') AS transaction_read_only,
    current_setting('transaction_isolation') AS transaction_isolation,
    current_setting('statement_timeout') AS statement_timeout,
    current_setting('lock_timeout') AS lock_timeout,
    current_setting('idle_in_transaction_session_timeout') AS idle_timeout,
    current_database() AS database_name, current_user AS current_user_name,
    session_user AS session_user_name, pg_catalog.pg_backend_pid() AS backend_pid,
    current_setting('server_version_num') AS server_version_num,
    current_setting('server_version') AS server_version`,
  role: `SELECT r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole,
    r.rolreplication, r.rolcanlogin,
    pg_catalog.has_database_privilege(current_user, current_database(), 'CREATE') AS database_create,
    pg_catalog.has_database_privilege(current_user, current_database(), 'TEMP') AS database_temp,
    EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member = r.oid) AS has_membership,
    EXISTS (SELECT 1 FROM pg_catalog.pg_class c WHERE c.relowner = r.oid
      AND c.relnamespace IN (SELECT oid FROM pg_catalog.pg_namespace WHERE nspname = ANY($1::name[]))) AS owns_relation,
    EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspowner = r.oid
      AND n.nspname = ANY($1::name[])) AS owns_schema,
    EXISTS (SELECT 1 FROM pg_catalog.pg_database d
      WHERE d.datname = current_database() AND d.datdba = r.oid) AS owns_database,
    EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n WHERE n.nspname = ANY($1::name[])
      AND pg_catalog.has_schema_privilege(current_user, n.oid, 'CREATE')) AS schema_create,
    EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = ANY($1::name[]) AND c.relkind = 'r'
      AND pg_catalog.has_table_privilege(current_user, c.oid,
        'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS relation_write,
    EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      WHERE n.nspname = ANY($1::name[]) AND c.relkind = 'r'
      AND pg_catalog.has_column_privilege(current_user, c.oid, a.attnum,
        'INSERT,UPDATE,REFERENCES')) AS column_write,
    EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = ANY($1::name[]) AND c.relkind IN ('v','m','f','p')
      AND pg_catalog.has_table_privilege(current_user, c.oid, 'SELECT')) AS unsupported_relation_exposure
    FROM pg_catalog.pg_roles r WHERE r.rolname = current_user`,
  namespaceCoverage: `SELECT requested.schema_name, n.oid::text AS namespace_oid
    FROM pg_catalog.unnest($1::name[]) requested(schema_name)
    LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = requested.schema_name
    ORDER BY requested.schema_name`,
  planBaseline: PLAN_BASELINE_SQL,
  migrationBaseline: MIGRATION_BASELINE_SQL,
  rollback: 'ROLLBACK',
});

const UNAVAILABLE_ADAPTER = Object.freeze({
  id: 'postgresql', version: null, verified: false, status: 'unavailable',
  reasonCode: 'DATABASE_ADAPTER_UNAVAILABLE',
});

function getPostgresAdapter() {
  return UNAVAILABLE_ADAPTER;
}

async function assertPostgresAdapterAvailable() {
  fail('DATABASE_ADAPTER_UNAVAILABLE', 'A trusted host must inject the reviewed PostgreSQL adapter.');
}

function minLimits(requestLimits, registeredLimits = {}) {
  return deepFreeze(Object.fromEntries(Object.entries(requestLimits).map(([key, value]) => {
    const registered = Object.prototype.hasOwnProperty.call(registeredLimits, key)
      ? registeredLimits[key] : value;
    if (!Number.isInteger(registered) || registered < 1) {
      fail('DATABASE_REGISTERED_LIMIT_INVALID', 'Trusted registration limits must be positive integers.');
    }
    return [key, Math.min(value, registered)];
  })));
}

function normalizeRegistration(input, request) {
  if (!input || typeof input !== 'object') fail('DATABASE_CONNECTION_REGISTRATION_INVALID', 'Trusted connection registration is required.');
  minLimits(request.limits, input.limits);
  const entry = clone(input);
  for (const key of ['identity', 'database', 'user', 'secretRef']) {
    if (typeof entry[key] !== 'string' || !entry[key]) fail('DATABASE_CONNECTION_REGISTRATION_INVALID', 'Trusted connection registration is incomplete.');
  }
  if (entry.host !== LOOPBACK || !Number.isInteger(entry.port) || entry.port < 1 || entry.port > 65535) {
    fail('DATABASE_ENDPOINT_DENIED', 'Only the registered loopback fixture is supported.');
  }
  if (entry.expectedMajor !== 16 || request.expectedMajor !== entry.expectedMajor) fail('DATABASE_MAJOR_UNSUPPORTED', 'Registered PostgreSQL major does not match the request.');
  const schemas = new Set(entry.permittedSchemas || []);
  const checks = new Set(entry.permittedChecks || []);
  if (request.schemas.some((value) => !schemas.has(value)) || request.checks.some((value) => !checks.has(value))) {
    fail('DATABASE_SCOPE_DENIED', 'Requested scope exceeds the trusted registration.');
  }
  if (!entry.expectedManifest || typeof entry.expectedManifest !== 'object') fail('DATABASE_MANIFEST_REQUIRED', 'Trusted expected manifest is required.');
  entry.migrationRelationId = entry.migrationRelationId || 'aexos-fixture-v1';
  const migrationRelation = MIGRATION_RELATIONS[entry.migrationRelationId];
  if (request.checks.includes('migration') && (!migrationRelation
    || !request.schemas.includes(migrationRelation.schema))) {
    fail('DATABASE_MIGRATION_RELATION_UNSUPPORTED',
      'Migration observation requires a fixed relation inside the requested and registered scope.');
  }
  entry.limits = minLimits(request.limits, entry.limits);
  return deepFreeze(entry);
}

function createScope(identity, entry) {
  const request = identity.request;
  return stableStringify({
    requestHash: identity.requestHash, schemas: request.schemas, checks: request.checks,
    planRequestHashes: request.planRequests.map((item) => digest(item)), limits: entry.limits,
    manifestHash: digest(entry.expectedManifest),
    planBaselineHash: entry.planBaseline ? digest(entry.planBaseline) : null,
    migrationBaselineHash: entry.migrationBaseline ? digest(entry.migrationBaseline) : null,
    migrationRelationId: entry.migrationRelationId || 'aexos-fixture-v1',
    rlsPolicyBaselineHash: entry.rlsPolicyBaseline ? digest(entry.rlsPolicyBaseline) : null,
    backupHash: entry.backupDeclaration ? digest(entry.backupDeclaration) : null,
  });
}

function useRequest(host, identity, entry, action) {
  return {
    agentId: host.principal.agentId, task: host.principal.task,
    capability: identity.request.capability, action,
    resource: entry.identity, scope: createScope(identity, entry),
  };
}

function verifyHost(host) {
  if (!host || typeof host !== 'object' || typeof host.adapter?.audit !== 'function'
    || typeof host.broker?.verify !== 'function' || typeof host.broker?.useSecret !== 'function'
    || typeof host.connectionRegistry?.resolve !== 'function' || !host.leaseToken
    || !host.principal?.agentId || !host.principal?.task) {
    fail('DATABASE_TRUSTED_HOST_REQUIRED', 'A complete trusted database host is required.');
  }
}

function parseMilliseconds(value) {
  const match = /^(\d+)(ms|s|min)?$/.exec(String(value));
  if (!match) return NaN;
  return Number(match[1]) * (match[2] === 's' ? 1000 : match[2] === 'min' ? 60000 : 1);
}

function assertIdentity(row, entry, limits) {
  const major = Math.floor(Number(row.server_version_num) / 10000);
  if (major !== entry.expectedMajor) fail('DATABASE_MAJOR_UNSUPPORTED', 'Observed PostgreSQL major is not authorized.');
  if (row.database_name !== entry.database || row.current_user_name !== entry.user
    || row.session_user_name !== entry.user) fail('DATABASE_IDENTITY_MISMATCH', 'Observed database identity is not authorized.');
  if (row.transaction_read_only !== 'on' || row.transaction_isolation !== 'repeatable read') fail('DATABASE_READ_ONLY_NOT_ENFORCED', 'Read-only repeatable-read transaction was not established.');
  const observedTimeouts = [parseMilliseconds(row.statement_timeout),
    parseMilliseconds(row.lock_timeout), parseMilliseconds(row.idle_timeout)];
  if (observedTimeouts.some((value) => !Number.isFinite(value) || value <= 0)
    || observedTimeouts[0] > limits.statementTimeoutMs
    || observedTimeouts[1] > limits.lockTimeoutMs
    || observedTimeouts[2] > limits.idleTransactionTimeoutMs) {
    fail('DATABASE_TIMEOUT_POLICY_WEAK', 'Observed server timeouts are weaker than the audit policy.');
  }
  return { major, backendPid: Number(row.backend_pid), serverVersion: row.server_version,
    serverVersionNumber: String(row.server_version_num) };
}

function assertRestrictedRole(row) {
  if (!row || row.rolsuper || row.rolbypassrls || row.rolcreatedb || row.rolcreaterole
    || row.rolreplication || !row.rolcanlogin || row.database_create || row.database_temp
    || row.has_membership || row.owns_relation || row.owns_schema || row.owns_database
    || row.schema_create || row.relation_write || row.column_write
    || row.unsupported_relation_exposure) {
    fail('DATABASE_AUDIT_ROLE_UNSAFE', 'Observed audit login exceeds the bounded read-only role policy.');
  }
}

function constraintType(row) {
  return ({ p: 'primary-key', f: 'foreign-key', u: 'unique', c: 'check' })[row.constraint_type] || null;
}

function projectObservation(identity, entry, rows, planRows, major, assessed = {}) {
  const coveredSchemas = (rows.namespaceCoverage || [])
    .filter((row) => row.namespace_oid).map((row) => row.schema_name).sort();
  const catalogVisibility = coveredSchemas.length === identity.request.schemas.length
    ? 'complete' : coveredSchemas.length ? 'partial' : 'unavailable';
  const objects = new Map();
  const objectFor = (schema, name) => {
    const key = `${schema}\u0000${name}`;
    if (!objects.has(key)) objects.set(key, { schema, name, kind: 'table', constraints: [], indexes: [], expectedConstraints: [], expectedIndexes: [] });
    return objects.get(key);
  };
  for (const row of rows.schema || []) {
    const object = objectFor(row.schema_name, row.object_name);
    if (row.fact_kind === 'not-null' && row.column_name) {
      object.constraints.push({ id: `not-null:${row.column_name}`, type: 'not-null',
        columns: [row.column_name], referencedTable: null, referencedColumns: [], validated: true });
    } else if (row.fact_kind === 'constraint' && row.constraint_name) {
      let constraint = object.constraints.find((item) => item.id === row.constraint_name);
      if (!constraint) {
        constraint = { id: row.constraint_name, type: constraintType(row), columns: [],
          referencedTable: row.referenced_table || null, referencedColumns: [],
          validated: Boolean(row.is_validated) };
        object.constraints.push(constraint);
      }
      if (row.column_name) constraint.columns.push(row.column_name);
      if (row.referenced_column) constraint.referencedColumns.push(row.referenced_column);
    }
  }
  for (const row of rows.indexes || []) {
    const object = objectFor(row.schema_name, row.table_name);
    let index = object.indexes.find((item) => item.id === row.index_name);
    if (!index) {
      index = { id: row.index_name, columns: [], includeColumns: [], unique: Boolean(row.is_unique),
        valid: Boolean(row.is_valid), ready: Boolean(row.is_ready), partial: Boolean(row.is_partial),
        expression: Boolean(row.has_expression) };
      object.indexes.push(index);
    }
    if (row.column_name) {
      const target = row.is_key ? index.columns : index.includeColumns;
      if (!target.includes(row.column_name)) target.push(row.column_name);
    }
  }
  for (const expected of entry.expectedManifest.schemaObjects || []) {
    const object = objectFor(expected.schema, expected.name);
    object.expectedConstraints = clone(expected.expectedConstraints || expected.constraints || []);
    object.expectedIndexes = clone(expected.expectedIndexes || expected.indexes || []);
  }
  const rls = new Map();
  for (const row of rows.rls || []) {
    const key = `${row.schema_name}\u0000${row.table_name}`;
    if (!rls.has(key)) rls.set(key, { schema: row.schema_name, table: row.table_name,
      enabled: Boolean(row.rls_enabled), forced: Boolean(row.rls_forced), policies: [], grants: [] });
    if (row.policy_name) {
      let policy = rls.get(key).policies.find((item) => item.id === row.policy_name);
      if (!policy) {
        const baseline = entry.rlsPolicyBaseline?.find((item) => item.schema === row.schema_name
          && item.table === row.table_name && item.policy === row.policy_name
          && item.qualHash === row.policy_qual_hash && item.checkHash === row.policy_check_hash);
        policy = { id: row.policy_name, command: row.policy_command || 'ALL', roles: [],
          permissive: Boolean(row.policy_permissive),
          classification: baseline?.classification === 'seeded-always-true'
            ? 'seeded-always-true' : 'structural' };
        rls.get(key).policies.push(policy);
      }
      if (row.policy_role && !policy.roles.includes(row.policy_role)) policy.roles.push(row.policy_role);
    }
  }
  const grants = (rows.privileges || []).map((row) => ({
    schema: row.schema_name, object: row.object_name,
    grantee: row.grantee_name || 'PUBLIC', privilege: row.privilege_type,
  }));
  for (const grant of grants) {
    const table = rls.get(`${grant.schema}\u0000${grant.object}`);
    if (table && grant.privilege === 'SELECT' && !table.grants.includes(grant.grantee)) {
      table.grants.push(grant.grantee);
    }
  }
  const roles = new Map();
  for (const row of rows.privileges || []) {
    if (row.grantee_name && !roles.has(row.grantee_name)) roles.set(row.grantee_name, {
      id: row.grantee_name, superuser: Boolean(row.rolsuper), bypassRls: Boolean(row.rolbypassrls),
      canCreateDb: Boolean(row.rolcreatedb), canCreateRole: Boolean(row.rolcreaterole),
    });
  }
  const backup = entry.backupDeclaration || {};
  return {
    schemaVersion: 'aexos.database-audit.fixture-observation/v1', sourceKind: 'fixture',
    adapter: { id: 'fixture', version: 'live-projection-v1', verified: false },
    databaseIdentity: { fixtureId: `live-${digest(entry.identity).slice(0, 24)}`, postgresMajor: major },
    observedAt: new Date().toISOString(),
    coverage: { catalogVisibility, roleGraph: 'partial', coveredSchemas },
    schemaObjects: [...objects.values()].sort((a, b) => `${a.schema}.${a.name}`.localeCompare(`${b.schema}.${b.name}`)),
    migrations: {
      status: assessed.migration
        ? (catalogVisibility === 'complete' ? 'observed' : 'partial') : 'unavailable',
      expected: clone(entry.expectedManifest.migrations || []),
      observed: (rows.migration || []).map((row) => {
        if (row.oversized || !row.migration_id || !row.migration_hash) {
          fail('DATABASE_STRING_LIMIT', 'Observed migration metadata exceeds its string bound.');
        }
        return { id: row.migration_id, order: Number(row.migration_order), hash: row.migration_hash };
      }),
    },
    rls: [...rls.values()],
    privileges: { status: identity.request.checks.includes('privileges') ? 'partial' : 'unavailable',
      roles: [...roles.values()], grants, graphTruncated: true },
    backup: { status: backup.status || 'unavailable', hasSchedule: backup.hasSchedule ?? null,
      hasRetention: backup.hasRetention ?? null, hasEncryption: backup.hasEncryption ?? null,
      latestReceiptVerified: backup.latestReceiptVerified ?? null },
    plans: planRows,
    limitations: ['LOCAL_DISPOSABLE_FIXTURE_AUTHORITY', 'CUSTOMER_DATABASES_NOT_SUPPORTED',
      'RLS_TENANT_ISOLATION_NOT_VERIFIED', 'RESTORE_READINESS_NOT_VERIFIED'],
  };
}

function projectPlan(raw, state, limits, depth = 1) {
  if (!raw || typeof raw !== 'object') fail('DATABASE_PLAN_INVALID', 'PostgreSQL returned an invalid plan envelope.');
  state.nodes += 1;
  if (state.nodes > limits.maxPlanNodes) fail('DATABASE_PLAN_NODE_LIMIT', 'Observed plan exceeds its node bound.');
  if (depth > limits.maxPlanDepth) fail('DATABASE_PLAN_DEPTH_LIMIT', 'Observed plan exceeds its depth bound.');
  const allowed = ['Seq Scan', 'Index Scan', 'Index Only Scan', 'Bitmap Heap Scan', 'Bitmap Index Scan', 'Limit', 'Sort'];
  if (!allowed.includes(raw['Node Type'])) fail('DATABASE_PLAN_NODE_UNSUPPORTED', 'Observed plan contains an unsupported node type.');
  return { nodeType: raw['Node Type'], totalCost: Number(raw['Total Cost']),
    planRows: Number(raw['Plan Rows']), planWidth: Number(raw['Plan Width']),
    children: (raw.Plans || []).map((child) => projectPlan(child, state, limits, depth + 1)) };
}

function liveResult(analyzed, identity, entry, receipt) {
  const report = clone(analyzed.report);
  report.schemaVersion = LIVE_SCHEMA_VERSION;
  report.adapter = { id: 'postgresql', version: DRIVER_VERSION, verified: true };
  report.sourceKind = 'database_observation';
  report.environment = 'disposable-fixture';
  report.transport = 'PostgreSQL';
  report.databaseIdentityHash = digest(entry.identity);
  report.checks.forEach((check) => {
    check.sourceKind = check.checkId === 'backup-readiness'
      ? 'operator-declaration' : check.checkId === 'migration'
        ? 'database-observation+operator-manifest' : 'database-observation';
    check.coverage = check.checkId === 'backup-readiness'
      ? (check.status === 'OBSERVED' ? 'operator-declaration-complete' : 'operator-declaration-incomplete')
      : (check.status === 'OBSERVED' ? 'database-observation-complete' : 'database-observation-incomplete');
    check.limitations = check.limitations.filter((item) => !item.includes('FIXTURE_'));
    if (check.checkId === 'migration') {
      check.findings.forEach((finding) => { finding.classification = 'database-observation+operator-manifest'; });
    }
    if (check.checkId === 'backup-readiness') {
      check.findings.forEach((finding) => { finding.classification = 'operator-declaration'; });
    }
  });
  report.limitations = [...new Set(report.limitations.filter((item) => (
    item !== 'FIXTURE_ONLY_NO_DATABASE_AUDIT' && item !== 'READ_ONLY_SERVER_ENFORCEMENT_NOT_VERIFIED'
  )))].sort();
  report.serverVersion = receipt.serverVersion;
  report.serverVersionNumber = receipt.serverVersionNumber;
  report.requestHash = identity.requestHash;
  report.appliedLimits = clone(entry.limits);
  report.collectedMetadataHash = receipt.collectedMetadataHash;
  report.cleanup = { rollback: receipt.rollback, close: receipt.close };
  const canonicalContentDigest = digest(report);
  const liveReceiptBase = { requestHash: identity.requestHash, connectionIdentityHash: digest(entry.identity),
    dispatchHashes: receipt.dispatchHashes, appliedLimits: entry.limits,
    backendPidHash: digest(receipt.backendPid), observedAt: receipt.observedAt, cleanup: report.cleanup };
  const liveReceipt = { ...liveReceiptBase, receiptDigest: digest(liveReceiptBase),
    collectedMetadataHash: receipt.collectedMetadataHash };
  const observationDigest = digest({ canonicalContentDigest, liveReceipt });
  return deepFreeze({ report, canonicalContentDigest, observationDigest,
    canonical: stableStringify({ ...report, canonicalContentDigest, observationDigest }), liveReceipt });
}

function createPostgresAdapter({ Client, driverVersion }) {
  if (typeof Client !== 'function' || driverVersion !== DRIVER_VERSION) fail('DATABASE_DRIVER_UNREVIEWED', 'Trusted composition must inject pg Client version 8.23.1.');
  return deepFreeze({
    id: 'postgresql', version: DRIVER_VERSION, verified: true, status: 'available',
    async audit(identityInput, host, entryInput, secret) {
      const identity = resolveValidatedRequest(identityInput);
      const entry = normalizeRegistration(entryInput, identity.request);
      const limits = entry.limits;
      if (Buffer.byteLength(stableStringify(entry.expectedManifest)) > limits.maxManifestBytes) {
        fail('DATABASE_MANIFEST_LIMIT', 'Trusted expected manifest exceeds the effective policy.');
      }
      const effectiveIdentity = validateRequest({ ...clone(identity.request), limits: clone(limits) });
      const compiled = compileAuditChecks(effectiveIdentity,
        { migrationRelationId: entry.migrationRelationId });
      const { catalog, plans } = compiled;
      const controlCount = 5 + (identity.request.checks.includes('migration') ? 1 : 0)
        + (plans.length && entry.planBaseline ? 1 : 0);
      if (controlCount + catalog.length + plans.length > limits.maxStatements) {
        fail('DATABASE_STATEMENT_LIMIT', 'Audit controls and checks exceed the statement budget.');
      }
      const password = typeof secret === 'string' ? secret : secret?.password;
      if (typeof password !== 'string' || !password) fail('DATABASE_SECRET_INVALID', 'Resolved fixture credential is invalid.');
      const client = new Client({
        host: entry.host, port: entry.port, database: entry.database, user: entry.user, password,
        ssl: false, application_name: `aexos-db-audit-${digest(identity.request.auditId).slice(0, 16)}`,
        connectionTimeoutMillis: limits.connectTimeoutMs, query_timeout: limits.statementTimeoutMs,
        statement_timeout: limits.statementTimeoutMs,
        options: `-c default_transaction_read_only=on -c search_path=pg_catalog -c statement_timeout=${limits.statementTimeoutMs} -c lock_timeout=${limits.lockTimeoutMs} -c idle_in_transaction_session_timeout=${limits.idleTransactionTimeoutMs}`,
      });
      client.on?.('error', () => {});
      let rollback = 'not-started';
      let close = 'not-started';
      let backendPid = null;
      let transactionStarted = false;
      const dispatchHashes = [];
      let closePromise = null;
      let totalRows = 0;
      let metadataBytes = 0;
      const controlRows = {};
      const stableControlRows = {};
      const deadline = Math.min(host.deadlineMs || Number.POSITIVE_INFINITY,
        Date.now() + limits.totalAuditTimeoutMs);
      const authorize = () => {
        if (Date.now() >= deadline) fail('DATABASE_TOTAL_TIMEOUT', 'Database audit exceeded its total deadline.');
        host.broker.verify(host.leaseToken, useRequest(host, identity, entry, AUDIT_ACTION));
      };
      const initiateClose = () => {
        if (!closePromise) {
          try { closePromise = Promise.resolve(client.end()); } catch (error) {
            closePromise = Promise.reject(error);
          }
        }
        return closePromise;
      };
      const bounded = async (operation) => {
        const remaining = deadline - Date.now();
        if (remaining <= 0) fail('DATABASE_TOTAL_TIMEOUT', 'Database audit exceeded its total deadline.');
        let timer;
        const timeout = new Promise((_resolve, reject) => {
          timer = setTimeout(() => {
            initiateClose().catch(() => {});
            const error = new Error('Database audit exceeded its total deadline.');
            error.code = 'DATABASE_TOTAL_TIMEOUT';
            reject(error);
          }, remaining);
          timer.unref?.();
        });
        try {
          return await Promise.race([operation, timeout]);
        } finally {
          clearTimeout(timer);
        }
      };
      const dispatch = async (query, hash) => {
        authorize();
        const result = await bounded(client.query(query));
        authorize();
        dispatchHashes.push(hash);
        return result;
      };
      const collect = (result, perCheck = true) => {
        if (perCheck && result.rows.length > limits.maxRowsPerCheck) {
          fail('DATABASE_ROW_LIMIT', 'Observed catalog facts exceed the effective per-check limit.');
        }
        totalRows += result.rows.length;
        if (totalRows > limits.maxRowsTotal) {
          fail('DATABASE_ROW_LIMIT', 'Observed catalog facts exceed the effective aggregate limit.');
        }
        for (const row of result.rows) {
          metadataBytes += Buffer.byteLength(stableStringify(row));
          if (metadataBytes > limits.maxMetadataBytes) {
            fail('DATABASE_METADATA_LIMIT', 'Observed catalog facts exceed the effective metadata limit.');
          }
        }
        return result.rows;
      };
      const settle = async (operation, timeoutMs) => {
        let timer;
        const outcome = await Promise.race([
          Promise.resolve(operation).then(() => 'acknowledged', () => 'failed'),
          new Promise((resolve) => { timer = setTimeout(() => resolve('unresolved'), timeoutMs); }),
        ]);
        clearTimeout(timer);
        return outcome;
      };
      const cleanup = async () => {
        const timeoutMs = Math.max(25, Math.min(250, limits.lockTimeoutMs));
        if (transactionStarted && rollback === 'not-started' && closePromise) {
          rollback = 'superseded-by-close';
          transactionStarted = false;
        } else if (transactionStarted && rollback === 'not-started') {
          rollback = await settle(client.query(CONTROL_SQL.rollback), timeoutMs);
          if (rollback === 'acknowledged') dispatchHashes.push(digest(CONTROL_SQL.rollback));
          transactionStarted = false;
        } else if (!transactionStarted && rollback === 'not-started') rollback = 'not-required';
        if (close === 'not-started') close = await settle(initiateClose(), timeoutMs);
        return { rollback, close };
      };
      try {
        authorize();
        await bounded(client.connect());
        authorize();
        transactionStarted = true;
        await dispatch(CONTROL_SQL.begin, digest(CONTROL_SQL.begin));
        const identityResult = await dispatch(CONTROL_SQL.identity, digest(CONTROL_SQL.identity));
        controlRows.identity = collect(identityResult, false);
        stableControlRows.identity = controlRows.identity.map((row) => {
          const stable = clone(row);
          delete stable.backend_pid;
          return stable;
        });
        const observed = assertIdentity(identityResult.rows[0], entry, limits);
        backendPid = observed.backendPid;
        const roleResult = await dispatch(
          { text: CONTROL_SQL.role, values: [identity.request.schemas] },
          digest(CONTROL_SQL.role),
        );
        controlRows.role = collect(roleResult, false);
        stableControlRows.role = controlRows.role;
        assertRestrictedRole(roleResult.rows[0]);
        const rows = {};
        const namespaceResult = await dispatch(
          { text: CONTROL_SQL.namespaceCoverage, values: [identity.request.schemas] },
          digest(CONTROL_SQL.namespaceCoverage),
        );
        rows.namespaceCoverage = collect(namespaceResult);
        let migrationAssessed = false;
        if (identity.request.checks.includes('migration') && entry.migrationBaseline) {
          const migrationRelation = MIGRATION_RELATIONS[entry.migrationRelationId];
          const baseline = await dispatch(
            { text: CONTROL_SQL.migrationBaseline, values: [migrationRelation.schema] },
            digest(CONTROL_SQL.migrationBaseline),
          );
          controlRows.migrationBaseline = collect(baseline, false);
          stableControlRows.migrationBaseline = controlRows.migrationBaseline;
          migrationAssessed = migrationBaselineMatches(baseline.rows, entry.migrationBaseline);
        }
        for (const statement of catalog) {
          authorize();
          if (classifyGeneratedStatement(statement) !== 'catalog-template') fail('DATABASE_STATEMENT_DENIED', 'Catalog statement was not generated by the fixed compiler.');
          if (statement.checkId === 'migration' && !migrationAssessed) continue;
          const result = await dispatch(
            { text: statement.statement, values: statement.parameters,
              query_timeout: limits.statementTimeoutMs },
            statement.dispatchHash,
          );
          rows[statement.checkId] = collect(result);
        }
        const planRows = [];
        let rawPlanBytes = 0;
        if (plans.length) {
          let planSafe = false;
          if (entry.planBaseline) {
            const baselineResult = await dispatch(
              CONTROL_SQL.planBaseline,
              digest(CONTROL_SQL.planBaseline),
            );
            controlRows.planBaseline = collect(baselineResult, false);
            stableControlRows.planBaseline = controlRows.planBaseline;
            planSafe = planBaselineMatches(baselineResult.rows, entry.planBaseline);
          }
          if (!planSafe) {
            plans.forEach((statement) => planRows.push({
              requestId: statement.requestId, status: 'not-assessed', plan: null,
            }));
          } else {
            for (const statement of plans) {
              authorize();
              if (classifyGeneratedStatement(statement) !== 'fixture-plan-template') fail('DATABASE_STATEMENT_DENIED', 'Plan statement was not generated by the fixed compiler.');
              const result = await dispatch(
                { text: statement.statement, values: statement.parameters,
                  query_timeout: limits.statementTimeoutMs },
                statement.dispatchHash,
              );
              collect(result);
              const raw = result.rows[0]?.['QUERY PLAN'] || result.rows[0]?.query_plan;
              const planBytes = Buffer.byteLength(stableStringify(raw));
              rawPlanBytes += planBytes;
              if (rawPlanBytes > limits.maxPlanBytes) fail('DATABASE_PLAN_BYTE_LIMIT', 'Observed plans exceed their aggregate byte bound.');
              const root = Array.isArray(raw) ? raw[0]?.Plan : null;
              planRows.push({ requestId: statement.requestId, status: 'estimated',
                plan: projectPlan(root, { nodes: 0 }, limits) });
            }
          }
        }
        const observation = projectObservation(
          effectiveIdentity, entry, rows, planRows, observed.major, { migration: migrationAssessed },
        );
        validateObservation(observation, effectiveIdentity);
        const analyzed = analyzeCompiledObservation(effectiveIdentity, observation, compiled);
        authorize();
        await cleanup();
        if (rollback !== 'acknowledged' || close !== 'acknowledged') {
          fail('DATABASE_RESOURCE_UNRESOLVED', 'Database cleanup did not settle within its bounded grace.');
        }
        authorize();
        return liveResult(analyzed, identity, entry, { rollback, close, backendPid,
          serverVersion: observed.serverVersion, serverVersionNumber: observed.serverVersionNumber,
          collectedMetadataHash: digest({ controlRows: stableControlRows, rows, planRows }),
          dispatchHashes: dispatchHashes.sort(),
          observedAt: observation.observedAt });
      } catch (error) {
        await cleanup();
        if (!['acknowledged', 'not-required', 'superseded-by-close'].includes(rollback)
          || close !== 'acknowledged') {
          fail('DATABASE_RESOURCE_UNRESOLVED', 'Database cleanup did not settle within its bounded grace.',
            { rollback, close });
        }
        if (error?.code && /^DATABASE_[A-Z0-9_]+$/.test(error.code)) throw error;
        fail('DATABASE_AUDIT_FAILED', 'PostgreSQL audit failed without exposing server details.', { rollback, close });
      }
    },
  });
}

module.exports = {
  AUDIT_ACTION, DRIVER_VERSION, LIVE_SCHEMA_VERSION, UNAVAILABLE_ADAPTER,
  assertPostgresAdapterAvailable, createPostgresAdapter, createScope, getPostgresAdapter,
  normalizeRegistration, useRequest, verifyHost,
};
