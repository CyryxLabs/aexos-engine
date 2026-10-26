'use strict';

const fs = require('fs');
const path = require('path');
const {
  analyzeObservation,
  auditDatabase,
  validateRequest,
} = require('../../../.aexos-core/core/database-reliability');

const FIXTURES = path.resolve(__dirname, '../../fixtures/database-reliability');
const load = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));

describe('fixture-only database reliability analysis', () => {
  const identity = validateRequest(load('request.json'));

  test('detects independently seeded structural defects and keeps fixture truth labels', () => {
    const result = analyzeObservation(identity, load('seeded-observation.json'));
    const rules = result.report.risks.map((risk) => risk.rule);
    expect(rules).toEqual(expect.arrayContaining([
      'EXPECTED_CONSTRAINT_MISSING', 'EXPECTED_INDEX_MISSING', 'MIGRATION_HASH_DRIFT',
      'EXPECTED_MIGRATION_MISSING', 'RLS_DISABLED_WITH_GRANTS', 'SEEDED_PERMISSIVE_POLICY',
      'PUBLIC_PRIVILEGE_EXPOSURE', 'ELEVATED_ROLE_SCOPE', 'BACKUP_RETENTION_UNCONFIRMED',
      'EXPENSIVE_FIXTURE_PLAN_ESTIMATE',
    ]));
    expect(result.report).toMatchObject({ sourceKind: 'fixture', adapter: { verified: false } });
    expect(result.report.limitations).toContain('FIXTURE_ONLY_NO_DATABASE_AUDIT');
    expect(result.report.unsupportedChecks.map((item) => item.status)).toContain('TRUNCATED');
  });

  test('keeps positive controls free of the seeded defect rules', () => {
    const result = analyzeObservation(identity, load('clean-observation.json'));
    expect(result.report.risks).toEqual([]);
    expect(result.report.checks.every((check) => check.status === 'OBSERVED')).toBe(true);
    expect(result.report.checks.find((check) => check.checkId === 'rls').limitations)
      .toContain('TENANT_ISOLATION_NOT_TESTED');
  });

  test.each([
    [['a,b'], ['a', 'b']],
    [['a', 'b'], ['a,b']],
    [['a', 'b'], ['b', 'a']],
  ])('retains structural index differences between %j and %j', (actual, expected) => {
    const observed = load('clean-observation.json');
    observed.schemaObjects[0].indexes[0].columns = actual;
    observed.schemaObjects[0].expectedIndexes[0].columns = expected;
    const result = analyzeObservation(identity, observed);
    expect(result.report.checks.find((check) => check.checkId === 'indexes').findings)
      .toEqual([expect.objectContaining({ rule: 'EXPECTED_INDEX_MISSING' })]);
  });

  test.each([
    ['invalid', { valid: false }], ['not-ready', { ready: false }],
    ['partial', { partial: true }], ['expression', { expression: true }],
    ['wrong-include', { includeColumns: ['created_at'] }],
  ])('does not admit a structurally %s index', (_label, change) => {
    const observed = load('clean-observation.json');
    Object.assign(observed.schemaObjects[0].indexes[0], change);
    const result = analyzeObservation(identity, observed);
    expect(result.report.risks.map((risk) => risk.rule)).toContain('EXPECTED_INDEX_MISSING');
  });

  test('distinguishes not-null facts from a primary key on the wrong column', () => {
    const observed = load('clean-observation.json');
    const expected = observed.schemaObjects[0].expectedConstraints[0];
    expected.columns = ['id']; expected.referencedTable = null;
    expected.referencedColumns = []; expected.validated = true;
    const actual = observed.schemaObjects[0].constraints[0];
    actual.columns = ['tenant_id']; actual.referencedTable = null;
    actual.referencedColumns = []; actual.validated = true;
    observed.schemaObjects[0].constraints.push({ id: 'not-null:id', type: 'not-null',
      columns: ['id'], referencedTable: null, referencedColumns: [], validated: true });
    const result = analyzeObservation(identity, observed);
    expect(result.report.risks.map((risk) => risk.rule)).toContain('EXPECTED_CONSTRAINT_MISSING');
  });

  test('distinguishes index uniqueness and preserves matching punctuation-bearing columns', () => {
    const observed = load('clean-observation.json');
    observed.schemaObjects[0].indexes[0].columns = ['a,b', 'c:d'];
    observed.schemaObjects[0].expectedIndexes[0].columns = ['a,b', 'c:d'];
    expect(analyzeObservation(identity, observed).report.risks).toEqual([]);
    observed.schemaObjects[0].expectedIndexes[0].unique = !observed.schemaObjects[0].indexes[0].unique;
    expect(analyzeObservation(identity, observed).report.risks)
      .toEqual([expect.objectContaining({ rule: 'EXPECTED_INDEX_MISSING' })]);
  });

  test('is deterministic across unordered observations and excludes timestamps from content identity', () => {
    const first = load('seeded-observation.json');
    const second = structuredClone(first);
    second.observedAt = '2026-10-11T00:00:00.000Z';
    second.privileges.grants.reverse(); second.schemaObjects.reverse();
    second.migrations.expected.reverse(); second.migrations.observed.reverse(); second.rls.reverse(); second.plans.reverse();
    const left = analyzeObservation(identity, first);
    const right = analyzeObservation(identity, second);
    expect(right.canonicalContentDigest).toBe(left.canonicalContentDigest);
    expect(right.observationDigest).not.toBe(left.observationDigest);
  });

  test('revalidates a branded observation against the exact current request limits', () => {
    const branded = require('../../../.aexos-core/core/database-reliability')
      .validateObservation(load('clean-observation.json'), identity);
    const narrow = load('request.json');
    narrow.limits.maxMetadataBytes = 128;
    expect(() => analyzeObservation(validateRequest(narrow), branded))
      .toThrow(expect.objectContaining({ code: 'DATABASE_METADATA_LIMIT' }));
    expect(() => analyzeObservation(identity, branded)).not.toThrow();
  });

  test('propagates partial catalog scope to schema, index, RLS, and privilege checks', () => {
    const partial = load('clean-observation.json');
    partial.coverage.catalogVisibility = 'partial';
    partial.coverage.coveredSchemas = [];
    const result = analyzeObservation(identity, partial);
    for (const checkId of ['schema', 'indexes', 'rls', 'privileges']) {
      expect(result.report.checks.find((check) => check.checkId === checkId).status).toBe('TRUNCATED');
    }
  });

  test('rejects inconsistent estimated plans with missing trees', () => {
    const missing = load('clean-observation.json');
    missing.plans[0].plan = null;
    expect(() => analyzeObservation(identity, missing))
      .toThrow(expect.objectContaining({ code: 'DATABASE_PLAN_OBSERVATION_INVALID' }));
  });

  test('never projects malicious metadata into commands, Markdown, or report strings', () => {
    const malicious = load('seeded-observation.json');
    malicious.schemaObjects[0].name = '<img src=x onerror=alert(1)>';
    malicious.rls[0].table = '[click](javascript:alert(1))';
    malicious.privileges.grants[0].object = '`; DROP TABLE users; --';
    const result = analyzeObservation(identity, malicious);
    expect(result.canonical).not.toMatch(/<img|javascript:|DROP TABLE|onerror/i);
    expect(result.report.risks.every((risk) => /^[A-Z0-9_]+$/.test(risk.rule))).toBe(true);
  });

  test('marks missing and unavailable evidence instead of producing an all-clear', () => {
    const missing = load('clean-observation.json');
    missing.coverage = { catalogVisibility: 'unavailable', roleGraph: 'unavailable', coveredSchemas: [] };
    missing.schemaObjects = []; missing.migrations = { status: 'unavailable', expected: [], observed: [] };
    missing.rls = []; missing.privileges = { status: 'unavailable', roles: [], grants: [], graphTruncated: false };
    missing.backup = { status: 'unavailable', hasSchedule: null, hasRetention: null, hasEncryption: null, latestReceiptVerified: null };
    missing.plans = [];
    const result = analyzeObservation(identity, missing);
    expect(result.report.checks.every((check) => check.status === 'NOT_ASSESSED')).toBe(true);
    expect(result.report.unsupportedChecks).toHaveLength(7);
  });

  test('reports adapter unavailable before accessing secrets, registry, or connection properties', async () => {
    const accessed = [];
    const host = {};
    for (const key of ['secretResolver', 'connectionRegistry', 'adapter', 'broker', 'lease']) {
      Object.defineProperty(host, key, { get() { accessed.push(key); throw new Error('must not access'); } });
    }
    await expect(auditDatabase(identity, host)).rejects.toMatchObject({ code: 'DATABASE_ADAPTER_UNAVAILABLE' });
    expect(accessed).toEqual([]);
  });

  test('revalidates caller-forged request and observation identity wrappers', () => {
    expect(() => analyzeObservation({ request: { rawSql: 'SELECT 1' }, requestHash: 'a'.repeat(64) },
      load('clean-observation.json'))).toThrow(expect.objectContaining({ code: 'DATABASE_REQUEST_INVALID' }));
    expect(() => analyzeObservation(identity, { observation: { sourceKind: 'fixture' }, observationHash: 'a'.repeat(64) }))
      .toThrow(expect.objectContaining({ code: 'DATABASE_OBSERVATION_INVALID' }));
  });
});
