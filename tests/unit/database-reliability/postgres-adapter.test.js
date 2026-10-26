'use strict';

const fs = require('fs');
const path = require('path');
const {
  auditDatabase, createPostgresAdapter, createPostgresScope, validateRequest,
} = require('../../../.aexos-core/core/database-reliability');
const { createCapabilityBroker } = require('../../../.aexos-core/core/permissions/capability-broker');
const { digest, stableStringify } = require('../../../.aexos-core/core/execution/durable-evidence');
const { planBaselineMatches } = require('../../../.aexos-core/core/database-reliability/baseline-policy');

const requestFixture = path.resolve(__dirname, '../../fixtures/database-reliability/request.json');

function request(overrides = {}) {
  const value = JSON.parse(fs.readFileSync(requestFixture, 'utf8'));
  value.auditId = overrides.auditId || 'adapter-unit';
  value.checks = ['schema'];
  value.planRequests = [];
  Object.assign(value.limits, overrides.limits || {});
  return validateRequest(value);
}

function entry(identity, limits = {}) {
  return {
    identity: 'unit-loopback', host: '127.0.0.1', port: 5432,
    database: 'fixture', user: 'auditor', secretRef: 'unit-secret', expectedMajor: 16,
    permittedSchemas: ['aexos_fixture'], permittedChecks: ['schema'],
    expectedManifest: { schemaObjects: [], migrations: [] },
    limits: { ...identity.request.limits, ...limits },
  };
}

function host(registration, adapter = { audit: jest.fn() }) {
  return {
    adapter,
    broker: { verify: jest.fn(), useSecret: jest.fn() },
    leaseToken: 'opaque',
    principal: { agentId: 'unit-agent', task: 'unit-task' },
    connectionRegistry: { resolve: jest.fn(async () => registration) },
  };
}

describe('PostgreSQL live adapter preflight and identity guards', () => {
  test.each([0, -1, NaN, Infinity, 1.5])(
    'rejects invalid trusted registry maxima before broker or secret use: %p',
    async (invalid) => {
      const identity = request();
      const registration = entry(identity, { statementTimeoutMs: invalid });
      const trustedHost = host(registration);
      await expect(auditDatabase(identity, trustedHost))
        .rejects.toMatchObject({ code: 'DATABASE_REGISTERED_LIMIT_INVALID' });
      expect(trustedHost.broker.verify).not.toHaveBeenCalled();
      expect(trustedHost.broker.useSecret).not.toHaveBeenCalled();
    },
  );

  test('bounds connection registry resolution under the request total deadline', async () => {
    const identity = request({ limits: { totalAuditTimeoutMs: 10 } });
    const registration = entry(identity);
    const trustedHost = host(registration);
    trustedHost.connectionRegistry.resolve = jest.fn(() => new Promise((resolve) => {
      setTimeout(() => resolve(registration), 50);
    }));
    await expect(auditDatabase(identity, trustedHost))
      .rejects.toMatchObject({ code: 'DATABASE_TOTAL_TIMEOUT' });
    expect(trustedHost.broker.verify).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(trustedHost.broker.verify).not.toHaveBeenCalled();
  });

  test('a delayed secret callback cannot invoke the adapter after caller timeout', async () => {
    const identity = request({ auditId: 'late-secret', limits: { totalAuditTimeoutMs: 10 } });
    const registration = entry(identity);
    const scope = createPostgresScope(identity, registration);
    const expected = { agentId: 'unit-agent', task: 'unit-task',
      capability: identity.request.capability, actions: ['audit:read', 'secret:read'],
      resource: registration.identity, scope };
    const broker = createCapabilityBroker({
      signingSecret: Buffer.alloc(32, 4), policy: () => true,
      secretResolver: async () => new Promise((resolve) => setTimeout(() => resolve('late-secret'), 50)),
    });
    const lease = broker.grant({ ...expected, ttlMs: 1000 });
    const adapter = { audit: jest.fn(async () => ({ published: true })) };
    const trustedHost = { adapter, broker, leaseToken: lease.token,
      principal: { agentId: expected.agentId, task: expected.task },
      connectionRegistry: { resolve: async () => registration } };
    await expect(auditDatabase(identity, trustedHost))
      .rejects.toMatchObject({ code: 'DATABASE_TOTAL_TIMEOUT' });
    await new Promise((resolve) => setTimeout(resolve, 75));
    expect(adapter.audit).not.toHaveBeenCalled();
  });

  test('rejects a server identity whose zero timeout disables enforcement', async () => {
    const identity = request();
    const registration = entry(identity);
    class FakeClient {
      constructor() {
        this.connection = { stream: { destroy: jest.fn() } };
      }

      on() {}

      async connect() {}

      async end() {}

      async query(statement) {
        const text = typeof statement === 'string' ? statement : statement.text;
        if (text.startsWith('SELECT current_setting')) return { rows: [{
          transaction_read_only: 'on', transaction_isolation: 'repeatable read',
          statement_timeout: '0', lock_timeout: '250ms', idle_timeout: '3000ms',
          database_name: 'fixture', current_user_name: 'auditor',
          session_user_name: 'auditor', backend_pid: 42, server_version_num: '160015',
        }] };
        return { rows: [] };
      }
    }
    const adapter = createPostgresAdapter({ Client: FakeClient, driverVersion: '8.23.1' });
    const trustedHost = {
      deadlineMs: Date.now() + 30000,
      leaseToken: 'opaque',
      principal: { agentId: 'unit-agent', task: 'unit-task' },
      broker: { verify: jest.fn() },
    };
    await expect(adapter.audit(identity, trustedHost, registration, 'unit-password'))
      .rejects.toMatchObject({ code: 'DATABASE_TIMEOUT_POLICY_WEAK' });
  });

  test('does not dispatch identity after lease revocation completes with BEGIN', async () => {
    const identity = request({ auditId: 'revoke-after-begin' });
    const registration = entry(identity); const calls = []; const holder = {};
    class FakeClient {
      on() {}
      async connect() { calls.push('connect'); }
      async end() { calls.push('end'); }
      async query(statement) {
        const text = typeof statement === 'string' ? statement : statement.text;
        if (text.startsWith('BEGIN')) { calls.push('begin'); holder.host.broker.revoke(holder.host.leaseToken); }
        else if (text.startsWith('SELECT current_setting')) calls.push('identity');
        else if (text === 'ROLLBACK') calls.push('rollback');
        return { rows: [] };
      }
    }
    const scope = createPostgresScope(identity, registration);
    const expected = { agentId: 'unit-agent', task: 'unit-task', capability: identity.request.capability,
      actions: ['audit:read', 'secret:read'], resource: registration.identity, scope };
    const broker = createCapabilityBroker({ signingSecret: Buffer.alloc(32, 5),
      policy: (candidate) => stableStringify(candidate) === stableStringify(expected),
      secretResolver: async () => 'unit-password' });
    holder.host = { adapter: createPostgresAdapter({ Client: FakeClient, driverVersion: '8.23.1' }),
      broker, leaseToken: broker.grant({ ...expected, ttlMs: 1000 }).token,
      principal: { agentId: expected.agentId, task: expected.task },
      connectionRegistry: { resolve: async () => registration } };
    await expect(auditDatabase(identity, holder.host))
      .rejects.toMatchObject({ code: 'CAPABILITY_SECRET_OPERATION_FAILED' });
    expect(calls).toEqual(['connect', 'begin', 'rollback', 'end']);
  });

  test('classifies a never-settling driver close as an unresolved resource', async () => {
    const identity = request({ auditId: 'stalled-close', limits: { lockTimeoutMs: 25 } });
    const registration = entry(identity); const state = { endCalls: 0 };
    class FakeClient {
      on() {}
      async connect() {}
      end() { state.endCalls += 1; return new Promise(() => {}); }
      async query(statement) {
        const text = typeof statement === 'string' ? statement : statement.text;
        if (text.startsWith('SELECT current_setting')) return { rows: [{
          transaction_read_only: 'on', transaction_isolation: 'repeatable read',
          statement_timeout: '2s', lock_timeout: '25ms', idle_timeout: '3s',
          database_name: 'fixture', current_user_name: 'auditor', session_user_name: 'auditor',
          backend_pid: 42, server_version_num: '160015', server_version: '16.15',
        }] };
        if (text.startsWith('SELECT r.rolsuper')) return { rows: [{ rolcanlogin: true }] };
        return { rows: [] };
      }
    }
    const adapter = createPostgresAdapter({ Client: FakeClient, driverVersion: '8.23.1' });
    const trustedHost = { deadlineMs: Date.now() + 1000, leaseToken: 'opaque',
      principal: { agentId: 'unit-agent', task: 'unit-task' }, broker: { verify: jest.fn() } };
    await expect(adapter.audit(identity, trustedHost, registration, 'unit-password'))
      .rejects.toMatchObject({ code: 'DATABASE_RESOURCE_UNRESOLVED' });
    expect(state.endCalls).toBe(1);
  });

  test('does not trust a matching migration digest when an attached index is unsafe', async () => {
    const raw = request({ auditId: 'unsafe-migration-baseline' }).request;
    const identity = validateRequest({ ...raw, checks: ['migration'],
      migrationManifestRef: 'fixture-manifest-v1' });
    const registration = entry(identity);
    registration.permittedChecks = ['migration'];
    const names = ['manifest_ref', 'migration_id', 'migration_order', 'migration_hash'];
    const types = ['25', '25', '23', '25'];
    const baselineRows = names.map((name, index) => ({ namespace_oid: '1', relation_oid: '2',
      relkind: 'r', relrowsecurity: false, relforcerowsecurity: false, relispartition: false,
      relation_access_method_oid: '2', relation_access_method: 'heap', has_descendants: true,
      has_rules: false, attnum: index + 1, attname: name, type_oid: types[index],
      collation_oid: index === 2 ? '0' : '100', attnotnull: true,
      atthasdef: false, attgenerated: '', has_unsafe_column: false,
      has_unsafe_constraint: false, has_unsafe_index: true, has_unsafe_access_method: false,
      has_unsafe_opclass: false, has_unsafe_dependency: false,
      dependency_identity: 'a'.repeat(32), constraint_identity: 'b'.repeat(32),
      index_identity: 'c'.repeat(32), index_dependency_identity: 'd'.repeat(32) }));
    registration.migrationBaseline = { exclusiveControl: true, digest: digest(baselineRows) };
    const calls = [];
    class FakeClient {
      on() {}
      async connect() {}
      async end() {}
      async query(statement) {
        const text = typeof statement === 'string' ? statement : statement.text;
        calls.push(text);
        if (text.startsWith('SELECT current_setting')) return { rows: [{
          transaction_read_only: 'on', transaction_isolation: 'repeatable read',
          statement_timeout: '2s', lock_timeout: '250ms', idle_timeout: '3s',
          database_name: 'fixture', current_user_name: 'auditor', session_user_name: 'auditor',
          backend_pid: 42, server_version_num: '160015', server_version: '16.15',
        }] };
        if (text.startsWith('SELECT r.rolsuper')) return { rows: [{ rolcanlogin: true }] };
        if (text.startsWith('SELECT requested.schema_name')) return { rows: [{
          schema_name: 'aexos_fixture', namespace_oid: '1' }] };
        if (text.startsWith('SELECT n.oid::text AS namespace_oid')) return { rows: baselineRows };
        return { rows: [] };
      }
    }
    const adapter = createPostgresAdapter({ Client: FakeClient, driverVersion: '8.23.1' });
    const trustedHost = { deadlineMs: Date.now() + 1000, leaseToken: 'opaque',
      principal: { agentId: 'unit-agent', task: 'unit-task' }, broker: { verify: jest.fn() } };
    const result = await adapter.audit(identity, trustedHost, registration, 'unit-password');
    expect(result.report.checks[0].status).toBe('NOT_ASSESSED');
    expect(calls.some((text) => text.includes('FROM ONLY aexos_fixture.migration_history'))).toBe(false);
  });

  test('does not trust a matching plan digest when an attached dependency is unsafe', () => {
    const safeRows = ['accounts', 'events'].map((table) => ({ table_name: table, relkind: 'r',
      relrowsecurity: false, relispartition: false, has_inheritance: false, has_rules: false,
      has_unsafe_column: false, has_default: false, has_unsafe_constraint: false,
      has_unsafe_index: false, has_unsafe_access_method: false, has_unsafe_opclass: false,
      has_unsafe_operator: false, column_identity: 'a'.repeat(32), index_identity: 'b'.repeat(32),
      constraint_identity: 'c'.repeat(32), index_dependency_identity: 'd'.repeat(32) }));
    expect(planBaselineMatches(safeRows,
      { exclusiveControl: true, digest: digest(safeRows) })).toBe(true);
    const unsafeRows = structuredClone(safeRows);
    unsafeRows[0].has_unsafe_opclass = true;
    expect(planBaselineMatches(unsafeRows,
      { exclusiveControl: true, digest: digest(unsafeRows) })).toBe(false);
    expect(planBaselineMatches(safeRows,
      { exclusiveControl: false, digest: digest(safeRows) })).toBe(false);
  });
});
