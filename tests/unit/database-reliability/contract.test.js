'use strict';

const fs = require('fs');
const path = require('path');
const {
  LIMIT_MAXIMA,
  validateObservation,
  validateRequest,
} = require('../../../.aexos-core/core/database-reliability');

const FIXTURES = path.resolve(__dirname, '../../fixtures/database-reliability');
const load = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));

function request(overrides = {}) {
  const base = load('request.json');
  return { ...base, ...overrides };
}

describe('database reliability closed contracts', () => {
  test('accepts the exact bounded request and fixture observation', () => {
    const identity = validateRequest(request());
    const observed = validateObservation(load('clean-observation.json'), identity);
    expect(identity.requestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(observed.observationHash).toMatch(/^[a-f0-9]{64}$/);
    expect(observed.observation).toMatchObject({ sourceKind: 'fixture', adapter: { verified: false } });
    expect(Object.isFrozen(identity.request.limits)).toBe(true);
    expect(Object.isFrozen(identity.request.planRequests[0].relation)).toBe(true);
    expect(Object.isFrozen(observed.observation.schemaObjects[0].constraints)).toBe(true);
  });

  test.each([
    ['schema extras', { rawSql: 'SELECT 1' }, 'DATABASE_REQUEST_INVALID'],
    ['raw SQL', { sql: 'SELECT 1' }, 'DATABASE_REQUEST_INVALID'],
    ['multistatement', { query: 'SELECT 1; DROP TABLE x' }, 'DATABASE_REQUEST_INVALID'],
    ['COPY', { statement: 'COPY x TO STDOUT' }, 'DATABASE_REQUEST_INVALID'],
    ['CTE', { statement: 'WITH x AS (SELECT 1) SELECT * FROM x' }, 'DATABASE_REQUEST_INVALID'],
    ['DO', { statement: 'DO $$ BEGIN END $$' }, 'DATABASE_REQUEST_INVALID'],
    ['ANALYZE', { statement: 'EXPLAIN ANALYZE SELECT 1' }, 'DATABASE_REQUEST_INVALID'],
    ['credential field', { password: 'not-retained' }, 'DATABASE_SECRET_FIELD_DENIED'],
    ['connection URL', { connectionUrl: 'postgresql://user:pass@example.test/db' }, 'DATABASE_SECRET_FIELD_DENIED'],
    ['malicious schema', { schemas: ['safe;DROP_TABLE'] }, 'DATABASE_REQUEST_INVALID'],
  ])('rejects %s before any audit action', (_label, override, code) => {
    expect(() => validateRequest(request(override))).toThrow(expect.objectContaining({ code }));
  });

  test('enforces every finite policy maximum', () => {
    for (const [key, maximum] of Object.entries(LIMIT_MAXIMA)) {
      const limits = { ...request().limits, [key]: maximum + 1 };
      expect(() => validateRequest(request({ limits }))).toThrow(expect.objectContaining({ code: 'DATABASE_REQUEST_INVALID' }));
    }
  });

  test('enforces row, byte, string, and plan-depth bounds on fixture declarations', () => {
    const base = request();
    const rowIdentity = validateRequest(request({ limits: { ...base.limits, maxRowsPerCheck: 1, maxRowsTotal: 1 } }));
    expect(() => validateObservation(load('clean-observation.json'), rowIdentity))
      .toThrow(expect.objectContaining({ code: 'DATABASE_ROW_LIMIT' }));

    const byteIdentity = validateRequest(request({ limits: { ...base.limits, maxMetadataBytes: 128 } }));
    expect(() => validateObservation(load('clean-observation.json'), byteIdentity))
      .toThrow(expect.objectContaining({ code: 'DATABASE_METADATA_LIMIT' }));

    const stringIdentity = validateRequest(request({ limits: { ...base.limits, maxStringBytes: 8 } }));
    expect(() => validateObservation(load('clean-observation.json'), stringIdentity))
      .toThrow(expect.objectContaining({ code: 'DATABASE_STRING_LIMIT' }));

    const deep = load('clean-observation.json');
    deep.plans[0].plan = { nodeType: 'Limit', totalCost: 1, planRows: 1, planWidth: 1, children: [
      { nodeType: 'Limit', totalCost: 1, planRows: 1, planWidth: 1, children: [
        { nodeType: 'Index Scan', totalCost: 1, planRows: 1, planWidth: 1, children: [] },
      ] },
    ] };
    const depthIdentity = validateRequest(request({ limits: { ...base.limits, maxPlanDepth: 2 } }));
    expect(() => validateObservation(deep, depthIdentity))
      .toThrow(expect.objectContaining({ code: 'DATABASE_PLAN_DEPTH_LIMIT' }));
  });

  test('rejects nested secret-bearing metadata without reflecting its value', () => {
    const observed = load('clean-observation.json');
    observed.databaseIdentity.password = 'private-value-must-not-appear';
    try {
      validateObservation(observed, validateRequest(request()));
      throw new Error('expected rejection');
    } catch (error) {
      expect(error.code).toBe('DATABASE_SECRET_FIELD_DENIED');
      expect(JSON.stringify(error)).not.toContain('private-value-must-not-appear');
    }
  });

  test.each([
    ['credential assignment', 'password=synthetic-review-secret'],
    ['double-quoted key and value', '"password":"synthetic-review-secret"'],
    ['single-quoted key and value', "'password'='synthetic-review-secret'"],
    ['escaped double-quoted value', String.raw`"client_secret":"synthetic\"value"`],
    ['escaped single-quoted value', String.raw`'api-key'='synthetic\'value'`],
    ['short quoted credential', '"auth_token":"x"'],
    ['AWS access key identifier', 'AKIAABCDEFGHIJKLMNOP'],
    ['GitHub token shape', 'ghp_abcdefghijklmnopqrstuvwx'],
    ['bearer credential', 'Bearer synthetic-review-credential'],
  ])('rejects recognizable %s before hashing or projection', (_label, secretValue) => {
    const observed = load('clean-observation.json');
    observed.schemaObjects[0].name = secretValue;
    let rejection;
    try { validateObservation(observed, validateRequest(request())); } catch (error) { rejection = error; }
    expect(rejection).toMatchObject({ code: 'DATABASE_SECRET_VALUE_DENIED' });
    expect(JSON.stringify(rejection)).not.toContain(secretValue);
  });

  test('retains valid identifiers that do not match the documented recognizable-secret policy', () => {
    const valid = request({ auditId: 'tokenizer-audit', connectionRef: 'passwordless-fixture' });
    expect(validateRequest(valid).request.auditId).toBe('tokenizer-audit');
  });

  test('rejects foreign schema facts and plan relations outside requested scope', () => {
    const foreignPlan = request({ schemas: ['other'] });
    expect(() => validateRequest(foreignPlan))
      .toThrow(expect.objectContaining({ code: 'DATABASE_PLAN_SCOPE_MISMATCH' }));

    const noPlans = request({ schemas: ['other'], checks: request().checks.filter((item) => item !== 'plans'), planRequests: [] });
    expect(() => validateObservation(load('clean-observation.json'), validateRequest(noPlans)))
      .toThrow(expect.objectContaining({ code: 'DATABASE_OBSERVATION_SCOPE_MISMATCH' }));
  });

  test('rejects conflicting natural identities deterministically in either order', () => {
    for (const insertion of ['first', 'last']) {
      const observed = load('clean-observation.json');
      const conflict = { ...observed.migrations.observed[0], hash: 'b'.repeat(64) };
      if (insertion === 'first') observed.migrations.observed.unshift(conflict);
      else observed.migrations.observed.push(conflict);
      expect(() => validateObservation(observed, validateRequest(request())))
        .toThrow(expect.objectContaining({ code: 'DATABASE_MIGRATION_ID_DUPLICATE' }));
    }
  });

  test('accounts for nested facts in per-check and total requested row ceilings', () => {
    const base = request();
    const exact = validateRequest(request({ limits: { ...base.limits, maxRowsPerCheck: 4, maxRowsTotal: 16 } }));
    expect(() => validateObservation(load('clean-observation.json'), exact)).not.toThrow();

    const perCheck = load('clean-observation.json');
    perCheck.schemaObjects[0].constraints.push({ id: 'c2', type: 'check' }, { id: 'c3', type: 'check' });
    expect(() => validateObservation(perCheck, exact))
      .toThrow(expect.objectContaining({ code: 'DATABASE_ROW_LIMIT' }));

    const total = load('clean-observation.json');
    total.schemaObjects[0].constraints.push({ id: 'c2', type: 'check' });
    expect(() => validateObservation(total, exact))
      .toThrow(expect.objectContaining({ code: 'DATABASE_ROW_LIMIT' }));
  });
});
