'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const runtimeRoot = path.resolve(process.env.AEXOS_RUNTIME_ROOT || path.resolve(__dirname, '../../..'));
const runtimeRequire = createRequire(path.join(runtimeRoot, 'package.json'));
const { Client } = runtimeRequire('pg');
const {
  auditDatabase, buildCatalogChecks, buildFixturePlanChecks,
  createPostgresAdapter, createPostgresScope, validateRequest,
} = require(path.join(runtimeRoot, '.aexos-core/core/database-reliability'));
const { createCapabilityBroker } = require(path.join(runtimeRoot, '.aexos-core/core/permissions/capability-broker'));
const { digest, stableStringify } = require(path.join(runtimeRoot, '.aexos-core/core/execution/durable-evidence'));
const { createDatabaseCommand } = require(path.join(runtimeRoot, '.aexos-core/cli/commands/database'));
const { MIGRATION_BASELINE_SQL, PLAN_BASELINE_SQL } = require(
  path.join(runtimeRoot, '.aexos-core/core/database-reliability/baseline-policy'));
const { MIGRATION_RELATIONS } = require(
  path.join(runtimeRoot, '.aexos-core/core/database-reliability/catalog'));

const configPath = process.env.AEXOS_POSTGRES_FIXTURE_CONFIG;
const evidenceDir = process.env.AEXOS_DATABASE_EVIDENCE_DIR;
const runLive = configPath && evidenceDir ? describe : describe.skip;
const requestFixture = path.resolve(process.env.AEXOS_DATABASE_REQUEST_FIXTURE
  || path.join(runtimeRoot, 'tests/fixtures/database-reliability/request.json'));
const AUDIT_USER = 'aexos_audit_424_r2';
let fixtureBaselines;

async function query(client, text, values = []) {
  return client.query({ text, values });
}

async function setup(owner, auditPassword, databaseName) {
  const passwordLiteral = auditPassword.replace(/'/g, "''");
  await query(owner, `DO $a$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = '${AUDIT_USER}')
    THEN CREATE ROLE ${AUDIT_USER} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
    END IF;
  END $a$`);
  await query(owner, `ALTER ROLE ${AUDIT_USER} PASSWORD '${passwordLiteral}'`);
  await query(owner, `DO $a$ BEGIN IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='aexos_audit_424')
    THEN ALTER ROLE aexos_audit_424 PASSWORD '${passwordLiteral}'; END IF; END $a$`);
  await query(owner, `ALTER ROLE ${AUDIT_USER} SET log_statement = 'all'`);
  await query(owner, `REVOKE TEMP ON DATABASE "${databaseName}" FROM PUBLIC`);
  await query(owner, 'CREATE SCHEMA IF NOT EXISTS aexos_fixture');
  await query(owner, `CREATE TABLE IF NOT EXISTS aexos_fixture.accounts (
    id int4 PRIMARY KEY, tenant_id int4 NOT NULL, external_id int4 NOT NULL, created_at int4 NOT NULL)`);
  await query(owner, `CREATE TABLE IF NOT EXISTS aexos_fixture.events (
    id int4 PRIMARY KEY, tenant_id int4 NOT NULL, account_id int4 NOT NULL, created_at int4 NOT NULL)`);
  await query(owner, `CREATE INDEX IF NOT EXISTS accounts_tenant_idx
    ON aexos_fixture.accounts (tenant_id, id)`);
  await query(owner, `CREATE TABLE IF NOT EXISTS aexos_fixture.rls_safe (
    id int4 PRIMARY KEY, tenant_id int4 NOT NULL)`);
  await query(owner, 'ALTER TABLE aexos_fixture.rls_safe ENABLE ROW LEVEL SECURITY');
  await query(owner, `DO $a$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polname = 'tenant_policy'
      AND polrelid = 'aexos_fixture.rls_safe'::pg_catalog.regclass)
    THEN CREATE POLICY tenant_policy ON aexos_fixture.rls_safe USING (tenant_id = 7);
    END IF;
  END $a$`);
  await query(owner, `CREATE TABLE IF NOT EXISTS aexos_fixture.rls_permissive (
    id int4 PRIMARY KEY, tenant_id int4 NOT NULL)`);
  await query(owner, 'ALTER TABLE aexos_fixture.rls_permissive ENABLE ROW LEVEL SECURITY');
  await query(owner, `DO $a$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polname = 'seeded_allow_all'
      AND polrelid = 'aexos_fixture.rls_permissive'::pg_catalog.regclass)
    THEN CREATE POLICY seeded_allow_all ON aexos_fixture.rls_permissive USING (true);
    END IF;
  END $a$`);
  await query(owner, `CREATE TABLE IF NOT EXISTS aexos_fixture.rls_absent (
    id int4 PRIMARY KEY, tenant_id int4 NOT NULL)`);
  await query(owner, 'ALTER TABLE aexos_fixture.rls_absent ENABLE ROW LEVEL SECURITY');
  await query(owner, `CREATE TABLE IF NOT EXISTS aexos_fixture.constraint_wrong_key (
    id int4 NOT NULL, tenant_id int4 NOT NULL, CONSTRAINT constraint_wrong_key_pkey PRIMARY KEY (tenant_id))`);
  await query(owner, `CREATE TABLE IF NOT EXISTS aexos_fixture.index_wrong_order (
    id int4 NOT NULL, tenant_id int4 NOT NULL)`);
  await query(owner, `CREATE INDEX IF NOT EXISTS index_wrong_order_idx
    ON aexos_fixture.index_wrong_order (id, tenant_id)`);
  await query(owner, 'CREATE SCHEMA IF NOT EXISTS aexos_fixture_clean');
  await query(owner, 'CREATE SCHEMA IF NOT EXISTS aexos_fixture_rls_clean');
  await query(owner, `CREATE TABLE IF NOT EXISTS aexos_fixture_clean.rls_clean (
    id int4 PRIMARY KEY, tenant_id int4 NOT NULL)`);
  await query(owner, 'ALTER TABLE aexos_fixture_clean.rls_clean ENABLE ROW LEVEL SECURITY');
  await query(owner, `DO $a$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polname='tenant_clean_policy'
      AND polrelid='aexos_fixture_clean.rls_clean'::pg_catalog.regclass)
    THEN CREATE POLICY tenant_clean_policy ON aexos_fixture_clean.rls_clean
      FOR SELECT TO ${AUDIT_USER} USING (tenant_id = 7);
    END IF;
  END $a$`);
  await query(owner, `CREATE TABLE IF NOT EXISTS aexos_fixture_rls_clean.rls_clean (
    id int4 PRIMARY KEY, tenant_id int4 NOT NULL)`);
  await query(owner, 'ALTER TABLE aexos_fixture_rls_clean.rls_clean ENABLE ROW LEVEL SECURITY');
  await query(owner, `DO $a$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polname='tenant_clean_policy'
      AND polrelid='aexos_fixture_rls_clean.rls_clean'::pg_catalog.regclass)
    THEN CREATE POLICY tenant_clean_policy ON aexos_fixture_rls_clean.rls_clean
      FOR SELECT TO ${AUDIT_USER} USING (tenant_id = 7);
    END IF;
  END $a$`);
  await query(owner, `CREATE TABLE IF NOT EXISTS aexos_fixture.migration_history (
    manifest_ref text NOT NULL, migration_id text NOT NULL, migration_order int4 NOT NULL,
    migration_hash text NOT NULL, PRIMARY KEY (manifest_ref, migration_id))`);
  await query(owner, `CREATE TABLE IF NOT EXISTS aexos_fixture_clean.migration_history (
    manifest_ref text NOT NULL, migration_id text NOT NULL, migration_order int4 NOT NULL,
    migration_hash text NOT NULL, PRIMARY KEY (manifest_ref, migration_id))`);
  await query(owner, 'CREATE SCHEMA IF NOT EXISTS qa_424_r2_aux');
  await query(owner, `CREATE TABLE IF NOT EXISTS qa_424_r2_aux.history_child ()
    INHERITS (aexos_fixture.migration_history)`);
  await query(owner, `CREATE TABLE IF NOT EXISTS qa_424_r2_aux.history_child_clean ()
    INHERITS (aexos_fixture_clean.migration_history)`);
  await query(owner, `CREATE OR REPLACE FUNCTION aexos_fixture.qa_r3_planner_notice()
    RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $fn$ BEGIN
      RAISE NOTICE 'AEXOS_QA_R3_PLANNER_FUNCTION_EXECUTED';
      RETURN true;
    END $fn$`);
  await query(owner, `CREATE INDEX IF NOT EXISTS qa_r3_migration_partial
    ON ONLY aexos_fixture.migration_history (migration_order)
    WHERE aexos_fixture.qa_r3_planner_notice()`);
  await query(owner, `INSERT INTO aexos_fixture.accounts
    SELECT value, value % 25, value * 10, value FROM pg_catalog.generate_series(1, 20000) value
    ON CONFLICT (id) DO NOTHING`);
  await query(owner, `INSERT INTO aexos_fixture.events
    SELECT value, value % 25, value, value FROM pg_catalog.generate_series(1, 20000) value
    ON CONFLICT (id) DO NOTHING`);
  const migrationHash = 'a'.repeat(64);
  await query(owner, `INSERT INTO aexos_fixture.migration_history
    (manifest_ref, migration_id, migration_order, migration_hash)
    VALUES ('fixture-manifest-v1', '001_base', 1, $1)
    ON CONFLICT (manifest_ref, migration_id) DO UPDATE SET
      migration_order = EXCLUDED.migration_order, migration_hash = EXCLUDED.migration_hash`, [migrationHash]);
  await query(owner, `INSERT INTO aexos_fixture.migration_history
    (manifest_ref, migration_id, migration_order, migration_hash)
    VALUES ('fixture-manifest-v1', '002_ordered', 4, $1)
    ON CONFLICT (manifest_ref, migration_id) DO UPDATE SET
      migration_order = EXCLUDED.migration_order, migration_hash = EXCLUDED.migration_hash`, ['c'.repeat(64)]);
  await query(owner, `INSERT INTO aexos_fixture_clean.migration_history
    (manifest_ref, migration_id, migration_order, migration_hash)
    VALUES ('fixture-manifest-v1', '001_base', 1, $1)
    ON CONFLICT (manifest_ref, migration_id) DO UPDATE SET
      migration_order = EXCLUDED.migration_order, migration_hash = EXCLUDED.migration_hash`, [migrationHash]);
  await query(owner, `INSERT INTO aexos_fixture_clean.migration_history
    (manifest_ref, migration_id, migration_order, migration_hash)
    VALUES ('fixture-manifest-v1', '002_ordered', 4, $1)
    ON CONFLICT (manifest_ref, migration_id) DO UPDATE SET
      migration_order = EXCLUDED.migration_order, migration_hash = EXCLUDED.migration_hash`, ['c'.repeat(64)]);
  await query(owner, `INSERT INTO qa_424_r2_aux.history_child
    (manifest_ref, migration_id, migration_order, migration_hash)
    SELECT 'fixture-manifest-v1', 'qa_child_outside_scope', 99, $1
    WHERE NOT EXISTS (SELECT 1 FROM ONLY qa_424_r2_aux.history_child
      WHERE migration_id='qa_child_outside_scope')`, ['e'.repeat(64)]);
  await query(owner, `INSERT INTO qa_424_r2_aux.history_child_clean
    (manifest_ref, migration_id, migration_order, migration_hash)
    SELECT 'fixture-manifest-v1', 'qa_child_outside_scope', 99, $1
    WHERE NOT EXISTS (SELECT 1 FROM ONLY qa_424_r2_aux.history_child_clean
      WHERE migration_id='qa_child_outside_scope')`, ['e'.repeat(64)]);
  await query(owner, `GRANT USAGE ON SCHEMA aexos_fixture TO ${AUDIT_USER}`);
  await query(owner, `GRANT SELECT ON ALL TABLES IN SCHEMA aexos_fixture TO ${AUDIT_USER}`);
  await query(owner, `GRANT USAGE ON SCHEMA aexos_fixture_clean TO ${AUDIT_USER}`);
  await query(owner, `GRANT SELECT ON aexos_fixture_clean.rls_clean TO ${AUDIT_USER}`);
  await query(owner, `GRANT SELECT ON aexos_fixture_clean.migration_history TO ${AUDIT_USER}`);
  await query(owner, `GRANT USAGE ON SCHEMA aexos_fixture_rls_clean TO ${AUDIT_USER}`);
  await query(owner, `GRANT SELECT ON aexos_fixture_rls_clean.rls_clean TO ${AUDIT_USER}`);
  await query(owner, 'GRANT SELECT ON aexos_fixture.rls_permissive TO PUBLIC');
  await query(owner, 'ANALYZE aexos_fixture.accounts');
  await query(owner, 'ANALYZE aexos_fixture.events');
  const prerequisites = await query(owner, `SELECT
    pg_catalog.to_regprocedure('aexos_fixture.qa_r3_planner_notice()') IS NOT NULL AS unsafe_routine,
    EXISTS (SELECT 1 FROM pg_catalog.pg_index i
      WHERE i.indexrelid='aexos_fixture.qa_r3_migration_partial'::pg_catalog.regclass
        AND i.indrelid='aexos_fixture.migration_history'::pg_catalog.regclass
        AND i.indpred IS NOT NULL
        AND pg_catalog.pg_get_expr(i.indpred,i.indrelid) LIKE '%qa_r3_planner_notice%') AS unsafe_index,
    (SELECT count(*)::int FROM aexos_fixture.migration_history
      WHERE migration_id='qa_child_outside_scope') = 1 AS ordinary_child,
    (SELECT count(*)::int FROM ONLY aexos_fixture.migration_history
      WHERE migration_id='qa_child_outside_scope') = 0 AS ordinary_parent_clean,
    (SELECT count(*)::int FROM aexos_fixture_clean.migration_history
      WHERE migration_id='qa_child_outside_scope') = 1 AS clean_child,
    (SELECT count(*)::int FROM ONLY aexos_fixture_clean.migration_history
      WHERE migration_id='qa_child_outside_scope') = 0 AS clean_parent_clean`);
  if (Object.values(prerequisites.rows[0]).some((value) => value !== true)) {
    throw new Error('PostgreSQL adversarial fixture prerequisites were not established');
  }
  fixtureBaselines = await captureBaselines(owner);
}

async function captureBaselines(owner) {
  const plan = await query(owner, PLAN_BASELINE_SQL);
  const migrationDigests = {};
  for (const [relationId, relation] of Object.entries(MIGRATION_RELATIONS)) {
    migrationDigests[relationId] = digest((await query(owner, MIGRATION_BASELINE_SQL, [relation.schema])).rows);
  }
  const policies = await query(owner, `SELECT n.nspname AS schema_name,c.relname AS table_name,p.polname AS policy,
    pg_catalog.md5(COALESCE(p.polqual::text,'')) AS qual_hash,
    pg_catalog.md5(COALESCE(p.polwithcheck::text,'')) AS check_hash
    FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='aexos_fixture' ORDER BY c.relname,p.polname`);
  return { planDigest: digest(plan.rows), migrationDigests, policies: policies.rows };
}

async function snapshot(owner) {
  const statements = {
    schema: `SELECT n.oid::text,n.nspname,n.nspowner::text,n.nspacl::text FROM pg_catalog.pg_namespace n
      WHERE n.nspname IN ('aexos_fixture','aexos_fixture_clean','aexos_fixture_rls_clean','qa_424_r2_aux') ORDER BY n.oid`,
    classes: `SELECT n.nspname,c.oid::text,c.relname,c.relkind,c.relowner::text,c.relrowsecurity,c.relforcerowsecurity,
      c.relpersistence,c.relam::text,c.relacl::text FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('aexos_fixture','aexos_fixture_clean','aexos_fixture_rls_clean','qa_424_r2_aux') ORDER BY c.oid`,
    attributes: `SELECT n.nspname,c.relname,a.attnum,a.attname,a.atttypid::text,a.attnotnull,a.atthasdef,a.attgenerated,
      pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS default_expr FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
      LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
      WHERE n.nspname IN ('aexos_fixture','aexos_fixture_clean','aexos_fixture_rls_clean','qa_424_r2_aux') AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.oid,a.attnum`,
    constraints: `SELECT n.nspname,con.oid::text,c.relname,con.conname,con.contype,con.conkey::text,con.confrelid::text,
      con.confkey::text,con.convalidated FROM pg_catalog.pg_constraint con JOIN pg_catalog.pg_class c ON c.oid=con.conrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('aexos_fixture','aexos_fixture_clean','aexos_fixture_rls_clean','qa_424_r2_aux') ORDER BY con.oid`,
    indexes: `SELECT n.nspname,i.indexrelid::text,c.relname,ic.relname AS index_name,i.indisunique,i.indisvalid,i.indisready,
      i.indnkeyatts,i.indkey::text,i.indexprs::text,i.indpred::text,ic.relam::text FROM pg_catalog.pg_index i
      JOIN pg_catalog.pg_class c ON c.oid=i.indrelid JOIN pg_catalog.pg_class ic ON ic.oid=i.indexrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('aexos_fixture','aexos_fixture_clean','aexos_fixture_rls_clean','qa_424_r2_aux') ORDER BY i.indexrelid`,
    inheritance: `SELECT child_ns.nspname AS child_schema,child.relname AS child_name,
      parent_ns.nspname AS parent_schema,parent.relname AS parent_name,inh.inhseqno
      FROM pg_catalog.pg_inherits inh JOIN pg_catalog.pg_class child ON child.oid=inh.inhrelid
      JOIN pg_catalog.pg_namespace child_ns ON child_ns.oid=child.relnamespace
      JOIN pg_catalog.pg_class parent ON parent.oid=inh.inhparent
      JOIN pg_catalog.pg_namespace parent_ns ON parent_ns.oid=parent.relnamespace
      WHERE child_ns.nspname IN ('aexos_fixture','aexos_fixture_clean','aexos_fixture_rls_clean','qa_424_r2_aux')
        OR parent_ns.nspname IN ('aexos_fixture','aexos_fixture_clean','aexos_fixture_rls_clean','qa_424_r2_aux')
      ORDER BY child_ns.nspname,child.relname,parent_ns.nspname,parent.relname,inh.inhseqno`,
    policies: `SELECT n.nspname,p.oid::text,c.relname,p.polname,p.polcmd,p.polpermissive,p.polroles::text,
      pg_catalog.md5(COALESCE(p.polqual::text,'')) AS qual_hash,pg_catalog.md5(COALESCE(p.polwithcheck::text,'')) AS check_hash
      FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('aexos_fixture','aexos_fixture_clean','aexos_fixture_rls_clean','qa_424_r2_aux') ORDER BY p.oid`,
    routines: `SELECT n.nspname,p.oid::text,p.proname,l.lanname,p.provolatile,p.prosecdef,p.proleakproof,
      p.proargtypes::text,p.prorettype::text,pg_catalog.md5(p.prosrc) AS source_hash
      FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      JOIN pg_catalog.pg_language l ON l.oid=p.prolang
      WHERE n.nspname IN ('aexos_fixture','aexos_fixture_clean','aexos_fixture_rls_clean','qa_424_r2_aux')
      ORDER BY n.nspname,p.oid`,
    roles: `SELECT r.oid::text,r.rolname,r.rolsuper,r.rolinherit,r.rolcreaterole,r.rolcreatedb,r.rolcanlogin,
      r.rolreplication,r.rolbypassrls FROM pg_catalog.pg_roles r WHERE r.rolname LIKE 'aexos_audit_424%' ORDER BY r.rolname`,
    memberships: `SELECT m.roleid::text,m.member::text,m.grantor::text,m.admin_option FROM pg_catalog.pg_auth_members m
      WHERE m.member IN (SELECT oid FROM pg_catalog.pg_roles WHERE rolname LIKE 'aexos_audit_424%') ORDER BY m.roleid,m.member`,
    databaseAcl: 'SELECT d.oid::text,d.datname,d.datdba::text,d.datacl::text FROM pg_catalog.pg_database d WHERE d.datname=current_database()',
    tableAcl: `SELECT n.nspname,c.oid::text,c.relname,c.relacl::text FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('aexos_fixture','aexos_fixture_clean','aexos_fixture_rls_clean','qa_424_r2_aux') ORDER BY c.oid`,
    columnAcl: `SELECT n.nspname,c.relname,a.attnum,a.attname,a.attacl::text FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid WHERE n.nspname IN ('aexos_fixture','aexos_fixture_clean','aexos_fixture_rls_clean','qa_424_r2_aux') AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.oid,a.attnum`,
    sequences: `SELECT n.nspname,c.oid::text,c.relname,s.seqstart,s.seqincrement,s.seqmax,s.seqmin,s.seqcache,s.seqcycle
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_catalog.pg_sequence s ON s.seqrelid=c.oid WHERE n.nspname IN ('aexos_fixture','aexos_fixture_clean','aexos_fixture_rls_clean','qa_424_r2_aux') ORDER BY c.oid`,
  };
  const normalized = {};
  for (const [category, statement] of Object.entries(statements)) normalized[category] = (await query(owner, statement)).rows;
  const rows = {};
  const tables = (await query(owner, `SELECT n.nspname,c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('aexos_fixture','aexos_fixture_clean','aexos_fixture_rls_clean','qa_424_r2_aux') AND c.relkind='r' ORDER BY n.nspname,c.relname`)).rows;
  for (const { nspname: schema, relname: table } of tables) {
    if (![schema, table].every((value) => /^[a-z0-9_]+$/.test(value))) throw new Error('unsafe fixture identifier');
    const result = await query(owner, `SELECT * FROM "${schema}"."${table}" ORDER BY 1`);
    rows[`${schema}.${table}`] = digest(result.rows);
  }
  normalized.rowHashes = rows;
  return { normalized, digest: digest(normalized) };
}

function registration(ownerConfig, migrationRelationId = 'aexos-fixture-v1') {
  return {
    identity: 'postgresql16-loopback-aex-4.24', host: '127.0.0.1',
    port: ownerConfig.port, database: ownerConfig.database, user: AUDIT_USER,
    secretRef: 'fixture/aex-4.24/audit-login', expectedMajor: 16,
    permittedSchemas: ['aexos_fixture', 'aexos_fixture_clean', 'aexos_fixture_rls_clean'],
    migrationRelationId,
    permittedChecks: ['schema', 'indexes', 'migration', 'rls', 'privileges', 'plans', 'backup-readiness'],
    expectedManifest: {
      schemaObjects: [
        { schema: 'aexos_fixture', name: 'accounts',
          constraints: [{ id: 'accounts_pkey', type: 'primary-key', columns: ['id'],
            referencedTable: null, referencedColumns: [], validated: true }],
          indexes: [{ id: 'accounts_tenant_idx', columns: ['tenant_id', 'id'], includeColumns: [],
            unique: false, valid: true, ready: true, partial: false, expression: false }] },
        { schema: 'aexos_fixture', name: 'events',
          constraints: [{ id: 'events_pkey', type: 'primary-key', columns: ['id'],
            referencedTable: null, referencedColumns: [], validated: true }],
          indexes: [{ id: 'events_tenant_idx', columns: ['tenant_id'], includeColumns: [],
            unique: false, valid: true, ready: true, partial: false, expression: false }] },
      ],
      migrations: [{ id: '001_base', order: 1, hash: 'a'.repeat(64) },
        { id: '002_ordered', order: 4, hash: 'c'.repeat(64) }],
    },
    backupDeclaration: { status: 'declared', hasSchedule: true, hasRetention: false,
      hasEncryption: true, latestReceiptVerified: false },
    rlsPolicyBaseline: (fixtureBaselines?.policies || []).filter((row) => row.policy === 'seeded_allow_all')
      .map((row) => ({ schema: row.schema_name, table: row.table_name, policy: row.policy,
        qualHash: row.qual_hash, checkHash: row.check_hash, classification: 'seeded-always-true' })),
    planBaseline: { exclusiveControl: true, digest: fixtureBaselines?.planDigest || '0'.repeat(64) },
    migrationBaseline: { exclusiveControl: true,
      digest: fixtureBaselines?.migrationDigests[migrationRelationId] || '0'.repeat(64) },
  };
}

function composeHost(identity, entry, auditPassword, ClientClass = Client) {
  entry.limits = { ...identity.request.limits, ...(entry.limits || {}) };
  const scope = createPostgresScope(identity, entry);
  const expected = {
    agentId: 'fixture-runner', task: 'aex-4.24-live-fixture',
    capability: identity.request.capability,
    actions: ['audit:read', 'secret:read'], resource: entry.identity, scope,
  };
  const broker = createCapabilityBroker({
    signingSecret: Buffer.alloc(32, 7),
    policy: (candidate) => stableStringify(candidate) === stableStringify(expected),
    secretResolver: async (secretRef) => {
      if (secretRef !== entry.secretRef) throw new Error('unknown secret reference');
      return auditPassword;
    },
  });
  const lease = broker.grant({ ...expected, ttlMs: 60000 });
  return {
    adapter: createPostgresAdapter({ Client: ClientClass, driverVersion: runtimeRequire('pg/package.json').version }),
    broker, leaseToken: lease.token,
    principal: { agentId: expected.agentId, task: expected.task },
    connectionRegistry: { resolve: async (ref) => {
      if (ref !== identity.request.connectionRef) throw new Error('unknown connection');
      return entry;
    } },
  };
}

runLive('PostgreSQL 16 bounded live adapter', () => {
  let owner;
  let ownerConfig;
  let auditPassword;
  let before;

  beforeAll(async () => {
    ownerConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    owner = new Client(ownerConfig);
    await owner.connect();
    const stale = await query(owner, `SELECT pid FROM pg_catalog.pg_stat_activity
      WHERE pid <> pg_backend_pid() AND state = 'idle in transaction'
      AND query LIKE 'LOCK TABLE aexos_fixture.accounts%'`);
    expect(stale.rows).toHaveLength(0);
    auditPassword = crypto.randomBytes(24).toString('hex');
    await setup(owner, auditPassword, ownerConfig.database);
    before = await snapshot(owner);
  }, 60000);

  afterAll(async () => {
    if (owner) await owner.end();
  });

  test('produces genuine observations and leaves semantic fixture state unchanged', async () => {
    const raw = JSON.parse(fs.readFileSync(requestFixture, 'utf8'));
    raw.schemas.push('aexos_fixture_clean');
    const identity = validateRequest(raw);
    const entry = registration(ownerConfig, 'aexos-fixture-clean-v1');
    const serverLog = path.join(path.dirname(configPath), 'data', 'server-logs', 'aexos-postgresql.log');
    const logOffset = fs.statSync(serverLog).size;
    const result = await auditDatabase(identity, composeHost(identity, entry, auditPassword));
    await new Promise((resolve) => setTimeout(resolve, 50));
    const statementCapture = fs.readFileSync(serverLog, 'utf8').slice(logOffset);
    const normalizeSql = (value) => value.replace(/\s+/g, ' ').trim();
    const normalizedCapture = normalizeSql(statementCapture);
    const generatedStatements = [...buildCatalogChecks(identity,
      { migrationRelationId: entry.migrationRelationId }), ...buildFixturePlanChecks(identity)];
    generatedStatements.forEach((statement) => {
      expect(normalizedCapture).toContain(normalizeSql(statement.statement));
    });
    expect(statementCapture).toContain('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    expect(statementCapture).toContain('EXPLAIN (FORMAT JSON, ANALYZE FALSE');
    expect(statementCapture).toContain("current_setting('transaction_read_only')");
    expect(statementCapture).toContain('pg_catalog.pg_auth_members');
    expect(statementCapture).toContain('pg_catalog.pg_inherits');
    expect(statementCapture).toContain('statement: ROLLBACK');
    expect(result.report).toMatchObject({
      schemaVersion: 'aexos.database-audit.live-report/v1',
      sourceKind: 'database_observation', environment: 'disposable-fixture',
      adapter: { id: 'postgresql', version: '8.23.1', verified: true },
      cleanup: { rollback: 'acknowledged', close: 'acknowledged' },
    });
    expect(result.report.risks.map((item) => item.rule)).toEqual(expect.arrayContaining([
      'EXPECTED_INDEX_MISSING', 'SEEDED_PERMISSIVE_POLICY',
      'PUBLIC_PRIVILEGE_EXPOSURE', 'BACKUP_RETENTION_UNCONFIRMED',
    ]));
    const after = await snapshot(owner);
    expect(after.digest).toBe(before.digest);
    const sessions = await query(owner, `SELECT count(*)::int AS count FROM pg_catalog.pg_stat_activity
      WHERE application_name LIKE 'aexos-db-audit-%'`);
    expect(sessions.rows[0].count).toBe(0);
    const evidence = {
      schemaVersion: 'aexos.database-live-implementation-evidence/v1',
      serverMajor: 16, driverVersion: '8.23.1', authority: 'local-disposable-fixture',
      before: { digest: before.digest, categories: Object.fromEntries(
        Object.entries(before.normalized).map(([key, value]) => [key, digest(value)])) },
      after: { digest: after.digest, categories: Object.fromEntries(
        Object.entries(after.normalized).map(([key, value]) => [key, digest(value)])) },
      reportDigest: result.canonicalContentDigest,
      dispatchHashes: result.liveReceipt.dispatchHashes,
      statementCaptureHash: digest(statementCapture),
      statementReconciliation: { generatedTemplates: generatedStatements.length,
        controlStatements: 7, totalProductDispatches: generatedStatements.length + 7,
        result: 'MATCHED' },
      cleanup: result.report.cleanup, sessionsAfter: 0,
    };
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(evidenceDir, 'database-live-run.json'),
      `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'w' });
    fs.writeFileSync(path.join(evidenceDir, 'database-live-before-normalized.json'),
      `${JSON.stringify(before.normalized, null, 2)}\n`, { flag: 'w' });
    fs.writeFileSync(path.join(evidenceDir, 'database-live-after-normalized.json'),
      `${JSON.stringify(after.normalized, null, 2)}\n`, { flag: 'w' });
    fs.writeFileSync(path.join(evidenceDir, 'database-live-statements.log'), statementCapture, { flag: 'w' });
  }, 30000);

  test('the composed leaf CLI returns live provenance while root composition stays separate', async () => {
    const identity = validateRequest(JSON.parse(fs.readFileSync(requestFixture, 'utf8')));
    const command = createDatabaseCommand({ host: composeHost(identity,
      registration(ownerConfig), auditPassword) });
    const chunks = [];
    const write = process.stdout.write;
    process.stdout.write = (chunk) => { chunks.push(String(chunk)); return true; };
    try {
      await command.parseAsync(['node', 'database', 'audit', requestFixture, '--json']);
    } finally {
      process.stdout.write = write;
    }
    const output = JSON.parse(chunks.join(''));
    expect(output).toMatchObject({
      report: { sourceKind: 'database_observation', adapter: { version: '8.23.1', verified: true } },
      liveReceipt: { receiptDigest: expect.stringMatching(/^[a-f0-9]{64}$/) },
    });
    const compiled = buildCatalogChecks(identity);
    for (const check of output.report.checks) {
      const statements = check.checkId === 'plans' ? buildFixturePlanChecks(identity)
        : compiled.filter((item) => item.checkId === check.checkId
          || (check.checkId === 'rls' && item.checkId === 'privileges'));
      expect(check.statementHash).toBe(statements.length
        ? digest(statements.map((item) => item.dispatchHash).sort()) : null);
    }
    expect(process.exitCode).toBe(0);
  }, 30000);

  test('refuses a copied or stale planner baseline before EXPLAIN', async () => {
    const identity = validateRequest(JSON.parse(fs.readFileSync(requestFixture, 'utf8')));
    const entry = registration(ownerConfig);
    entry.planBaseline.digest = '0'.repeat(64);
    const result = await auditDatabase(identity, composeHost(identity, entry, auditPassword));
    expect(result.report.checks.find((check) => check.checkId === 'plans')).toMatchObject({
      status: 'NOT_ASSESSED', limitations: expect.arrayContaining(['PLAN_NOT_ASSESSED']),
    });
    expect((await snapshot(owner)).digest).toBe(before.digest);
  });

  test('detects catalog row overflow instead of reporting an all-clear result', async () => {
    const raw = JSON.parse(fs.readFileSync(requestFixture, 'utf8'));
    raw.auditId = 'fixture-row-overflow';
    raw.limits.maxRowsPerCheck = 1;
    const identity = validateRequest(raw);
    await expect(auditDatabase(identity, composeHost(identity, registration(ownerConfig), auditPassword)))
      .rejects.toMatchObject({ code: 'CAPABILITY_SECRET_OPERATION_FAILED' });
    expect((await snapshot(owner)).digest).toBe(before.digest);
  });

  test.each([
    ['maxRowsTotal', 1, 'DATABASE_ROW_LIMIT'],
    ['maxMetadataBytes', 1, 'DATABASE_METADATA_LIMIT'],
  ])('enforces stricter registered %s before projection', async (limit, value) => {
    const identity = validateRequest(JSON.parse(fs.readFileSync(requestFixture, 'utf8')));
    const entry = registration(ownerConfig);
    entry.limits = { [limit]: value };
    await expect(auditDatabase(identity, composeHost(identity, entry, auditPassword)))
      .rejects.toMatchObject({ code: 'CAPABILITY_SECRET_OPERATION_FAILED' });
    expect((await snapshot(owner)).digest).toBe(before.digest);
  });

  test('detects wrong constraint keys and partial or wrong-order indexes structurally', async () => {
    const raw = JSON.parse(fs.readFileSync(requestFixture, 'utf8'));
    raw.auditId = 'fixture-structural-defects'; raw.checks = ['schema', 'indexes']; raw.planRequests = [];
    const identity = validateRequest(raw); const entry = registration(ownerConfig);
    entry.expectedManifest.schemaObjects = [
      { schema: 'aexos_fixture', name: 'constraint_wrong_key', constraints: [{
        id: 'constraint_wrong_key_pkey', type: 'primary-key', columns: ['id'],
        referencedTable: null, referencedColumns: [], validated: true }], indexes: [] },
      { schema: 'aexos_fixture', name: 'qa_partial_index', constraints: [], indexes: [{
        id: 'required_full', columns: ['tenant_id'], includeColumns: [], unique: false,
        valid: true, ready: true, partial: false, expression: false }] },
      { schema: 'aexos_fixture', name: 'index_wrong_order', constraints: [], indexes: [{
        id: 'required_order', columns: ['tenant_id', 'id'], includeColumns: [], unique: false,
        valid: true, ready: true, partial: false, expression: false }] },
    ];
    const result = await auditDatabase(identity, composeHost(identity, entry, auditPassword));
    expect(result.report.risks.filter((risk) => risk.rule === 'EXPECTED_CONSTRAINT_MISSING')).toHaveLength(1);
    expect(result.report.risks.filter((risk) => risk.rule === 'EXPECTED_INDEX_MISSING')).toHaveLength(2);
    expect((await snapshot(owner)).digest).toBe(before.digest);
  });

  test('detects live migration missing, order, and hash drift against operator manifest', async () => {
    const raw = JSON.parse(fs.readFileSync(requestFixture, 'utf8'));
    raw.auditId = 'fixture-migration-drift'; raw.checks = ['migration']; raw.planRequests = [];
    raw.schemas.push('aexos_fixture_clean');
    const identity = validateRequest(raw);
    const entry = registration(ownerConfig, 'aexos-fixture-clean-v1');
    entry.expectedManifest.migrations = [
      { id: '001_base', order: 1, hash: 'b'.repeat(64) },
      { id: '002_ordered', order: 2, hash: 'c'.repeat(64) },
      { id: '003_missing', order: 3, hash: 'd'.repeat(64) },
    ];
    const result = await auditDatabase(identity, composeHost(identity, entry, auditPassword));
    expect(result.report.risks.map((risk) => risk.rule)).toEqual(expect.arrayContaining([
      'MIGRATION_HASH_DRIFT', 'MIGRATION_ORDER_DRIFT', 'EXPECTED_MIGRATION_MISSING',
    ]));
    expect((await snapshot(owner)).digest).toBe(before.digest);
  });

  test('reports disabled, absent-policy, permissive/public RLS facts without claiming full role coverage', async () => {
    const raw = JSON.parse(fs.readFileSync(requestFixture, 'utf8'));
    raw.auditId = 'fixture-rls-matrix'; raw.checks = ['rls', 'privileges']; raw.planRequests = [];
    const identity = validateRequest(raw); const entry = registration(ownerConfig);
    const result = await auditDatabase(identity, composeHost(identity, entry, auditPassword));
    const rules = result.report.risks.map((risk) => risk.rule);
    expect(rules).toEqual(expect.arrayContaining([
      'RLS_DISABLED_WITH_GRANTS', 'RLS_POLICY_ABSENT_DEFAULT_DENY',
      'SEEDED_PERMISSIVE_POLICY', 'PUBLIC_PRIVILEGE_EXPOSURE',
    ]));
    expect(result.report.checks.find((check) => check.checkId === 'privileges').status).toBe('TRUNCATED');
  });

  test('rejects the retained R1 login because its effective column write grant remains unsafe', async () => {
    const raw = JSON.parse(fs.readFileSync(requestFixture, 'utf8'));
    raw.auditId = 'fixture-column-write-role'; raw.checks = ['indexes']; raw.planRequests = [];
    const identity = validateRequest(raw); const entry = registration(ownerConfig); entry.user = 'aexos_audit_424';
    await expect(auditDatabase(identity, composeHost(identity, entry, auditPassword)))
      .rejects.toMatchObject({ code: 'CAPABILITY_SECRET_OPERATION_FAILED' });
  });

  test('all-clean live control has no unexpected findings and preserves receipt provenance', async () => {
    const raw = JSON.parse(fs.readFileSync(requestFixture, 'utf8'));
    raw.auditId = 'fixture-all-clean'; raw.checks = ['schema', 'indexes', 'migration', 'plans', 'backup-readiness'];
    raw.schemas.push('aexos_fixture_clean');
    const identity = validateRequest(raw);
    const entry = registration(ownerConfig, 'aexos-fixture-clean-v1');
    entry.expectedManifest.schemaObjects[1].indexes = [];
    entry.backupDeclaration = { status: 'receipt-verified', hasSchedule: true, hasRetention: true,
      hasEncryption: true, latestReceiptVerified: true };
    const result = await auditDatabase(identity, composeHost(identity, entry, auditPassword));
    expect(result.report.risks).toEqual([]);
    expect(result.report.serverVersionNumber).toBe('160015');
    expect(result.report.checks.find((check) => check.checkId === 'backup-readiness').sourceKind)
      .toBe('operator-declaration');
    expect(result.report.checks.find((check) => check.checkId === 'backup-readiness').coverage)
      .toBe('operator-declaration-complete');
    expect(result.liveReceipt.receiptDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  test('distinguishes an expensive unindexed estimate from a selective indexed estimate', async () => {
    const raw = JSON.parse(fs.readFileSync(requestFixture, 'utf8'));
    raw.auditId = 'fixture-plan-pair'; raw.checks = ['plans'];
    raw.planRequests = [raw.planRequests[0], { id: 'events-unbounded',
      relation: { schema: 'aexos_fixture', name: 'events' }, projection: ['id'],
      equalityPredicates: [], orderBy: [], limit: 25 }];
    const identity = validateRequest(raw); const entry = registration(ownerConfig);
    const result = await auditDatabase(identity, composeHost(identity, entry, auditPassword));
    const check = result.report.checks.find((item) => item.checkId === 'plans');
    expect(check.status).toBe('OBSERVED');
    expect(check.findings.map((finding) => finding.rule)).toEqual(['EXPENSIVE_FIXTURE_PLAN_ESTIMATE']);
  });

  test('leaves migration unassessed and does not dispatch history SQL without its exact baseline', async () => {
    const raw = JSON.parse(fs.readFileSync(requestFixture, 'utf8'));
    raw.auditId = 'fixture-migration-no-baseline'; raw.checks = ['migration']; raw.planRequests = [];
    const identity = validateRequest(raw); const entry = registration(ownerConfig); delete entry.migrationBaseline;
    const serverLog = path.join(path.dirname(configPath), 'data', 'server-logs', 'aexos-postgresql.log');
    const offset = fs.statSync(serverLog).size;
    const result = await auditDatabase(identity, composeHost(identity, entry, auditPassword));
    await new Promise((resolve) => setTimeout(resolve, 25));
    const capture = fs.readFileSync(serverLog, 'utf8').slice(offset);
    expect(result.report.checks.find((item) => item.checkId === 'migration').status).toBe('NOT_ASSESSED');
    expect(capture).not.toContain('FROM ONLY aexos_fixture.migration_history WHERE manifest_ref');
  });

  test('withholds an unsafe parent before history planning even with a newly matching baseline', async () => {
    const raw = JSON.parse(fs.readFileSync(requestFixture, 'utf8'));
    raw.auditId = 'fixture-unsafe-parent-dependency'; raw.checks = ['migration']; raw.planRequests = [];
    const identity = validateRequest(raw);
    const entry = registration(ownerConfig, 'aexos-fixture-v1');
    entry.migrationBaseline.digest = digest((await query(owner, MIGRATION_BASELINE_SQL,
      [MIGRATION_RELATIONS[entry.migrationRelationId].schema])).rows);
    const notices = [];
    class NoticeClient extends Client {
      constructor(...args) {
        super(...args);
        this.on('notice', (notice) => {
          if (notice.message === 'AEXOS_QA_R3_PLANNER_FUNCTION_EXECUTED') notices.push(notice.message);
        });
      }
    }
    const serverLog = path.join(path.dirname(configPath), 'data', 'server-logs', 'aexos-postgresql.log');
    const offset = fs.statSync(serverLog).size;
    const result = await auditDatabase(identity,
      composeHost(identity, entry, auditPassword, NoticeClient));
    await new Promise((resolve) => setTimeout(resolve, 25));
    const capture = fs.readFileSync(serverLog, 'utf8').slice(offset);
    expect(result.report.checks[0]).toMatchObject({ status: 'NOT_ASSESSED',
      limitations: expect.arrayContaining(['MIGRATION_HISTORY_UNAVAILABLE']) });
    expect(notices).toEqual([]);
    expect(capture).not.toContain('FROM ONLY aexos_fixture.migration_history WHERE manifest_ref');
    fs.writeFileSync(path.join(evidenceDir, 'r4-unsafe-parent.json'), `${JSON.stringify({
      schemaVersion: 'aexos.database-live-r4-unsafe-parent/v1',
      baselineDigest: entry.migrationBaseline.digest,
      checkStatus: result.report.checks[0].status,
      plannerFunctionNotices: notices.length,
      historyStatementDispatched: capture.includes(
        'FROM ONLY aexos_fixture.migration_history WHERE manifest_ref'),
      cleanup: result.report.cleanup,
    }, null, 2)}\n`);
  });

  test('observes the isolated ordinary builtin migration parent', async () => {
    const raw = JSON.parse(fs.readFileSync(requestFixture, 'utf8'));
    raw.auditId = 'fixture-safe-migration-parent'; raw.checks = ['migration']; raw.planRequests = [];
    raw.schemas.push('aexos_fixture_clean');
    const identity = validateRequest(raw);
    const entry = registration(ownerConfig, 'aexos-fixture-clean-v1');
    const result = await auditDatabase(identity, composeHost(identity, entry, auditPassword));
    const cleanStatement = buildCatalogChecks(identity,
      { migrationRelationId: 'aexos-fixture-clean-v1' })[0];
    const originalStatement = buildCatalogChecks(identity,
      { migrationRelationId: 'aexos-fixture-v1' })[0];
    const cleanReportHash = digest([cleanStatement.dispatchHash]);
    expect(result.report.checks[0]).toMatchObject({ status: 'OBSERVED',
      statementHash: cleanReportHash,
      limitations: expect.arrayContaining(['MIGRATION_SQL_NOT_VERIFIED']) });
    expect(result.liveReceipt.dispatchHashes).toContain(cleanStatement.dispatchHash);
    expect(result.liveReceipt.dispatchHashes).not.toContain(originalStatement.dispatchHash);
    expect(cleanReportHash).not.toBe(digest([originalStatement.dispatchHash]));
    expect(result.report.risks).toEqual([]);
    fs.writeFileSync(path.join(evidenceDir, 'r4-safe-parent.json'), `${JSON.stringify({
      schemaVersion: 'aexos.database-live-r4-safe-parent/v1',
      checkStatus: result.report.checks[0].status,
      risks: result.report.risks,
      limitations: result.report.checks[0].limitations,
      cleanup: result.report.cleanup,
    }, null, 2)}\n`);
  });

  test('binds migration provenance to the effective registered row limit', async () => {
    const raw = JSON.parse(fs.readFileSync(requestFixture, 'utf8'));
    raw.auditId = 'fixture-effective-provenance'; raw.checks = ['migration']; raw.planRequests = [];
    raw.schemas.push('aexos_fixture_clean');
    const identity = validateRequest(raw);
    const entry = registration(ownerConfig, 'aexos-fixture-clean-v1');
    entry.limits = { maxRowsPerCheck: 50 };
    const result = await auditDatabase(identity, composeHost(identity, entry, auditPassword));
    raw.limits.maxRowsPerCheck = 50;
    const effectiveIdentity = validateRequest(raw);
    const effectiveStatement = buildCatalogChecks(effectiveIdentity,
      { migrationRelationId: 'aexos-fixture-clean-v1' })[0];
    const requestedStatement = buildCatalogChecks(identity,
      { migrationRelationId: 'aexos-fixture-clean-v1' })[0];
    expect(result.report.appliedLimits.maxRowsPerCheck).toBe(50);
    expect(result.report.checks[0].statementHash).toBe(digest([effectiveStatement.dispatchHash]));
    expect(result.liveReceipt.dispatchHashes).toContain(effectiveStatement.dispatchHash);
    expect(effectiveStatement.dispatchHash).not.toBe(requestedStatement.dispatchHash);
  });

  test('requires the trusted exclusive-control declaration before migration observation', async () => {
    const raw = JSON.parse(fs.readFileSync(requestFixture, 'utf8'));
    raw.auditId = 'fixture-migration-exclusive-control'; raw.checks = ['migration']; raw.planRequests = [];
    raw.schemas.push('aexos_fixture_clean');
    const identity = validateRequest(raw);
    const entry = registration(ownerConfig, 'aexos-fixture-clean-v1');
    entry.migrationBaseline.exclusiveControl = false;
    const result = await auditDatabase(identity, composeHost(identity, entry, auditPassword));
    expect(result.report.checks[0].status).toBe('NOT_ASSESSED');
  });

  test('reads ONLY a safe migration parent and excludes retained out-of-scope descendants', async () => {
    const ordinary = await query(owner, `SELECT count(*)::int AS count FROM aexos_fixture.migration_history
      WHERE migration_id='qa_child_outside_scope'`);
    const parentOnly = await query(owner, `SELECT count(*)::int AS count FROM ONLY aexos_fixture.migration_history
      WHERE migration_id='qa_child_outside_scope'`);
    expect(ordinary.rows[0].count).toBe(1);
    expect(parentOnly.rows[0].count).toBe(0);
    const cleanOrdinary = await query(owner, `SELECT count(*)::int AS count
      FROM aexos_fixture_clean.migration_history WHERE migration_id='qa_child_outside_scope'`);
    const cleanOnly = await query(owner, `SELECT count(*)::int AS count
      FROM ONLY aexos_fixture_clean.migration_history WHERE migration_id='qa_child_outside_scope'`);
    expect(cleanOrdinary.rows[0].count).toBe(1);
    expect(cleanOnly.rows[0].count).toBe(0);
    const raw = JSON.parse(fs.readFileSync(requestFixture, 'utf8'));
    raw.auditId = 'fixture-inherited-migration-scope'; raw.checks = ['migration']; raw.planRequests = [];
    raw.schemas.push('aexos_fixture_clean');
    const identity = validateRequest(raw);
    const entry = registration(ownerConfig, 'aexos-fixture-clean-v1');
    entry.expectedManifest.migrations.push({ id: 'qa_child_outside_scope', order: 99, hash: 'e'.repeat(64) });
    const result = await auditDatabase(identity, composeHost(identity, entry, auditPassword));
    expect(result.report.checks[0]).toMatchObject({ status: 'OBSERVED',
      limitations: expect.arrayContaining(['MIGRATION_SQL_NOT_VERIFIED']) });
    expect(result.report.risks.map((risk) => risk.rule)).toContain('EXPECTED_MIGRATION_MISSING');
    expect((await snapshot(owner)).digest).toBe(before.digest);
  });

  test('collects bounded grant dependencies for an RLS-only request', async () => {
    const raw = JSON.parse(fs.readFileSync(requestFixture, 'utf8'));
    raw.auditId = 'fixture-rls-only'; raw.checks = ['rls']; raw.planRequests = [];
    const identity = validateRequest(raw); const entry = registration(ownerConfig);
    const result = await auditDatabase(identity, composeHost(identity, entry, auditPassword));
    const check = result.report.checks[0];
    expect(check.checkId).toBe('rls');
    expect(check.status).toBe('OBSERVED');
    expect(result.report.checks.some((item) => item.checkId === 'privileges')).toBe(false);
    expect(result.report.risks.filter((risk) => risk.rule === 'RLS_DISABLED_WITH_GRANTS').length)
      .toBeGreaterThan(0);
  });

  test('keeps a clean RLS-only schema finding-free without claiming privilege-graph coverage', async () => {
    const raw = JSON.parse(fs.readFileSync(requestFixture, 'utf8'));
    raw.auditId = 'fixture-rls-only-clean'; raw.checks = ['rls']; raw.planRequests = [];
    raw.schemas = ['aexos_fixture_rls_clean'];
    const identity = validateRequest(raw); const entry = registration(ownerConfig);
    entry.permittedSchemas.push('aexos_fixture_clean');
    entry.expectedManifest = { schemaObjects: [], migrations: [] };
    const result = await auditDatabase(identity, composeHost(identity, entry, auditPassword));
    expect(result.report.risks).toEqual([]);
    expect(result.report.checks).toEqual([expect.objectContaining({ checkId: 'rls', status: 'OBSERVED',
      coverage: 'database-observation-complete' })]);
    expect(result.report.checks.some((item) => item.checkId === 'privileges')).toBe(false);
    expect(result.report.limitations).toContain('RLS_TENANT_ISOLATION_NOT_VERIFIED');
  });

  test('marks a nonexistent requested schema as incomplete coverage', async () => {
    const raw = JSON.parse(fs.readFileSync(requestFixture, 'utf8'));
    raw.auditId = 'fixture-missing-schema'; raw.checks = ['schema']; raw.planRequests = [];
    raw.schemas.push('qa_424_missing_schema');
    const identity = validateRequest(raw); const entry = registration(ownerConfig);
    entry.permittedSchemas.push('qa_424_missing_schema');
    const result = await auditDatabase(identity, composeHost(identity, entry, auditPassword));
    expect((await query(owner, `SELECT count(*)::int AS count FROM pg_catalog.pg_namespace
      WHERE nspname='qa_424_missing_schema'`)).rows[0].count).toBe(0);
    expect(result.report.checks[0]).toMatchObject({ status: 'TRUNCATED',
      coverage: 'database-observation-incomplete',
      limitations: expect.arrayContaining(['CATALOG_VISIBILITY_PARTIAL']) });
  });

  test('enforces the raw aggregate plan byte limit at the exact total boundary', async () => {
    const raw = JSON.parse(fs.readFileSync(requestFixture, 'utf8'));
    raw.auditId = 'fixture-plan-byte-total'; raw.checks = ['plans'];
    raw.planRequests.push({ ...JSON.parse(JSON.stringify(raw.planRequests[0])), id: 'accounts-by-tenant-repeat' });
    const identity = validateRequest(raw); const sizes = [];
    class MeteredClient extends Client {
      async query(statement, ...args) {
        const result = await super.query(statement, ...args);
        const text = typeof statement === 'string' ? statement : statement.text;
        if (text.startsWith('EXPLAIN')) {
          sizes.push(Buffer.byteLength(stableStringify(result.rows[0]['QUERY PLAN'])));
        }
        return result;
      }
    }
    await auditDatabase(identity, composeHost(identity, registration(ownerConfig), auditPassword, MeteredClient));
    const exactTotal = sizes.reduce((sum, size) => sum + size, 0);
    expect(sizes).toHaveLength(2);
    const exactEntry = registration(ownerConfig); exactEntry.limits = { maxPlanBytes: exactTotal };
    await expect(auditDatabase(identity, composeHost(identity, exactEntry, auditPassword, MeteredClient)))
      .resolves.toMatchObject({ report: { appliedLimits: { maxPlanBytes: exactTotal } } });
    const deniedEntry = registration(ownerConfig); deniedEntry.limits = { maxPlanBytes: exactTotal - 1 };
    await expect(auditDatabase(identity, composeHost(identity, deniedEntry, auditPassword, MeteredClient)))
      .rejects.toMatchObject({ code: 'CAPABILITY_SECRET_OPERATION_FAILED' });
  });

  test('keeps stable content identity equal across identical real sessions', async () => {
    const raw = JSON.parse(fs.readFileSync(requestFixture, 'utf8'));
    raw.auditId = 'fixture-repeat-identity'; raw.checks = ['schema']; raw.planRequests = [];
    const identity = validateRequest(raw);
    const first = await auditDatabase(identity,
      composeHost(identity, registration(ownerConfig), auditPassword));
    const second = await auditDatabase(identity,
      composeHost(identity, registration(ownerConfig), auditPassword));
    expect(second.report.risks).toEqual(first.report.risks);
    expect(second.report.collectedMetadataHash).toBe(first.report.collectedMetadataHash);
    expect(second.canonicalContentDigest).toBe(first.canonicalContentDigest);
    expect(second.liveReceipt.backendPidHash).not.toBe(first.liveReceipt.backendPidHash);
  });

  test('server rejects writes for the restricted login under identical transaction settings', async () => {
    const client = new Client({ host: ownerConfig.host, port: ownerConfig.port,
      database: ownerConfig.database, user: AUDIT_USER, password: auditPassword, ssl: false,
      options: '-c default_transaction_read_only=on -c search_path=pg_catalog' });
    await client.connect();
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await expect(client.query('INSERT INTO aexos_fixture.accounts VALUES (30001, 1, 1, 1)'))
      .rejects.toMatchObject({ code: '25006' });
    await client.query('ROLLBACK');
    await client.end();
    expect((await snapshot(owner)).digest).toBe(before.digest);
  });

  test('statement timeout under an owner-held lock closes the backend and preserves state', async () => {
    const locker = new Client(ownerConfig);
    await locker.connect();
    await locker.query('BEGIN');
    await locker.query('LOCK TABLE aexos_fixture.accounts IN ACCESS EXCLUSIVE MODE');
    const raw = JSON.parse(fs.readFileSync(requestFixture, 'utf8'));
    raw.auditId = 'fixture-lock-timeout';
    raw.limits.statementTimeoutMs = 100;
    raw.limits.lockTimeoutMs = 200;
    const identity = validateRequest(raw);
    const entry = registration(ownerConfig);
    await expect(auditDatabase(identity, composeHost(identity, entry, auditPassword)))
      .rejects.toMatchObject({ code: 'CAPABILITY_SECRET_OPERATION_FAILED' });
    await locker.query('ROLLBACK');
    await locker.end();
    await new Promise((resolve) => setTimeout(resolve, 200));
    const sessions = await query(owner, `SELECT count(*)::int AS count FROM pg_catalog.pg_stat_activity
      WHERE application_name LIKE 'aexos-db-audit-%'`);
    expect(sessions.rows[0].count).toBe(0);
    expect((await snapshot(owner)).digest).toBe(before.digest);
  }, 30000);

  test('lock timeout under an owner-held lock closes the backend and preserves state', async () => {
    const locker = new Client(ownerConfig);
    await locker.connect();
    try {
      await locker.query('BEGIN');
      await locker.query('LOCK TABLE aexos_fixture.accounts IN ACCESS EXCLUSIVE MODE');
      const raw = JSON.parse(fs.readFileSync(requestFixture, 'utf8'));
      raw.auditId = 'fixture-lock-timeout-specific';
      raw.limits.statementTimeoutMs = 2000;
      raw.limits.lockTimeoutMs = 50;
      const identity = validateRequest(raw);
      await expect(auditDatabase(identity, composeHost(identity, registration(ownerConfig), auditPassword)))
        .rejects.toMatchObject({ code: 'CAPABILITY_SECRET_OPERATION_FAILED' });
    } finally {
      await locker.query('ROLLBACK');
      await locker.end();
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    const sessions = await query(owner, `SELECT count(*)::int AS count FROM pg_catalog.pg_stat_activity
      WHERE application_name LIKE 'aexos-db-audit-%'`);
    expect(sessions.rows[0].count).toBe(0);
    expect((await snapshot(owner)).digest).toBe(before.digest);
  }, 30000);

  test('total deadline force-disconnects a pending locked query and removes the session', async () => {
    const locker = new Client(ownerConfig);
    await locker.connect();
    try {
      await locker.query('BEGIN');
      await locker.query('LOCK TABLE aexos_fixture.accounts IN ACCESS EXCLUSIVE MODE');
      const raw = JSON.parse(fs.readFileSync(requestFixture, 'utf8'));
      raw.auditId = 'fixture-total-timeout';
      raw.limits.totalAuditTimeoutMs = 75;
      raw.limits.statementTimeoutMs = 2000;
      raw.limits.lockTimeoutMs = 250;
      const identity = validateRequest(raw);
      const failure = await auditDatabase(
        identity,
        composeHost(identity, registration(ownerConfig), auditPassword),
      ).then(() => null, (error) => error);
      expect(['DATABASE_TOTAL_TIMEOUT', 'CAPABILITY_SECRET_OPERATION_FAILED']).toContain(failure.code);
    } finally {
      await locker.query('ROLLBACK');
      await locker.end();
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    const sessions = await query(owner, `SELECT count(*)::int AS count FROM pg_catalog.pg_stat_activity
      WHERE application_name LIKE 'aexos-db-audit-%'`);
    expect(sessions.rows[0].count).toBe(0);
    expect((await snapshot(owner)).digest).toBe(before.digest);
  }, 30000);
});

