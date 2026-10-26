'use strict';

const fs = require('fs');
const path = require('path');
const {
  buildCatalogChecks,
  buildFixturePlanChecks,
  classifyGeneratedStatement,
  validateRequest,
} = require('../../../.aexos-core/core/database-reliability');

const REQUEST = JSON.parse(fs.readFileSync(path.resolve(__dirname,
  '../../fixtures/database-reliability/request.json'), 'utf8'));

describe('fixed database catalog and fixture plan templates', () => {
  test('generates only parameterized fixed metadata and fixture plan templates', () => {
    const identity = validateRequest(REQUEST);
    const catalog = buildCatalogChecks(identity);
    const plans = buildFixturePlanChecks(identity);
    expect(catalog).toHaveLength(6);
    expect(plans).toHaveLength(1);
    for (const statement of [...catalog, ...plans]) {
      expect(classifyGeneratedStatement(statement)).toBe(statement.classification);
      expect(statement.statement).not.toMatch(/;|--|\/\*|ANALYZE TRUE/i);
      expect(statement.statementHash).toMatch(/^[a-f0-9]{64}$/);
      expect(statement.dispatchHash).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(plans[0].statement).toContain('$1::int4');
    expect(plans[0].statement).toContain('FROM ONLY "aexos_fixture"."accounts"');
    expect(plans[0].statement).not.toContain(' 7 ');
    expect(catalog.find((item) => item.checkId === 'migration').statement)
      .toContain('FROM ONLY aexos_fixture.migration_history');
  });

  test('adds the bounded grant observation required by an RLS-only request', () => {
    const request = structuredClone(REQUEST);
    request.checks = ['rls']; request.planRequests = [];
    const catalog = buildCatalogChecks(validateRequest(request));
    expect(catalog.map((item) => item.checkId).sort()).toEqual(['privileges', 'rls']);
    expect(catalog.every((item) => classifyGeneratedStatement(item) === 'catalog-template')).toBe(true);
  });

  test('selects only sealed migration relations from trusted composition', () => {
    const request = structuredClone(REQUEST);
    request.checks = ['migration']; request.planRequests = [];
    request.schemas = ['aexos_fixture_clean'];
    const identity = validateRequest(request);
    const clean = buildCatalogChecks(identity,
      { migrationRelationId: 'aexos-fixture-clean-v1' });
    expect(clean[0].statement).toContain('FROM ONLY aexos_fixture_clean.migration_history');
    expect(classifyGeneratedStatement(clean[0])).toBe('catalog-template');
    expect(() => buildCatalogChecks(identity, { migrationRelationId: 'caller-controlled' }))
      .toThrow(expect.objectContaining({ code: 'DATABASE_MIGRATION_RELATION_UNSUPPORTED' }));
  });

  test.each([
    ['SELECT 1'],
    ['SELECT 1; DROP TABLE accounts'],
    ['COPY accounts TO STDOUT'],
    ['WITH x AS (SELECT 1) SELECT * FROM x'],
    ['DO $$ BEGIN END $$'],
    ['EXPLAIN ANALYZE SELECT * FROM accounts'],
  ])('denies arbitrary statement %s', (statement) => {
    expect(classifyGeneratedStatement({ statement, statementHash: 'a'.repeat(64) })).toBe('denied');
  });

  test('denies copied or modified generated objects rather than trusting caller labels', () => {
    const generated = buildFixturePlanChecks(validateRequest(REQUEST))[0];
    expect(classifyGeneratedStatement({ ...generated })).toBe('denied');
    expect(classifyGeneratedStatement({ ...generated, statement: `${generated.statement} -- injected` })).toBe('denied');
  });

  test('does not export the low-level plan compiler and freezes all dispatch fields', () => {
    const api = require('../../../.aexos-core/core/database-reliability');
    const catalogApi = require('../../../.aexos-core/core/database-reliability/catalog');
    expect(api.compileFixturePlan).toBeUndefined();
    expect(catalogApi.compileFixturePlan).toBeUndefined();
    expect(api.resolveValidatedRequest).toBeUndefined();
    expect(api.dispatchIdentity).toBeUndefined();
    expect(api.compileAuditChecks).toBeUndefined();
    const catalog = buildCatalogChecks(validateRequest(REQUEST))[0];
    const plan = buildFixturePlanChecks(validateRequest(REQUEST))[0];
    expect(Object.isFrozen(catalog.parameters)).toBe(true);
    expect(Object.isFrozen(catalog.parameters[0])).toBe(true);
    expect(Object.isFrozen(plan.parameters)).toBe(true);
    expect(() => { catalog.parameters[0][0] = 'not-approved'; }).toThrow(TypeError);
    expect(() => { plan.parameters[0] = 99; }).toThrow(TypeError);
    expect(classifyGeneratedStatement(catalog)).toBe('catalog-template');
    expect(classifyGeneratedStatement(plan)).toBe('fixture-plan-template');
  });

  test('seals compiler provenance and binds it to the exact effective request', () => {
    const catalogApi = require('../../../.aexos-core/core/database-reliability/catalog');
    const identity = validateRequest(REQUEST);
    const compiled = catalogApi.compileAuditChecks(identity,
      { migrationRelationId: 'aexos-fixture-clean-v1' });
    expect(Object.isFrozen(compiled)).toBe(true);
    expect(Object.isFrozen(compiled.effectiveLimits)).toBe(true);
    expect(Object.isFrozen(compiled.catalog)).toBe(true);
    expect(compiled.catalog.find((item) => item.checkId === 'migration').statement)
      .toContain('FROM ONLY aexos_fixture_clean.migration_history');
    expect(() => { compiled.migrationRelationId = 'aexos-fixture-v1'; }).toThrow(TypeError);
    expect(() => catalogApi.resolveCompiledAudit({ ...compiled }, identity))
      .toThrow(expect.objectContaining({ code: 'DATABASE_COMPILATION_INVALID' }));
    const changed = structuredClone(REQUEST);
    changed.limits.maxRowsPerCheck -= 1;
    expect(() => catalogApi.resolveCompiledAudit(compiled, validateRequest(changed)))
      .toThrow(expect.objectContaining({ code: 'DATABASE_COMPILATION_INVALID' }));
  });

  test('rejects unsupported relation and columns without interpolating them', () => {
    const relation = structuredClone(REQUEST);
    relation.planRequests[0].relation.name = 'attacker_table';
    expect(() => buildFixturePlanChecks(validateRequest(relation)))
      .toThrow(expect.objectContaining({ code: 'DATABASE_PLAN_RELATION_UNSUPPORTED' }));
    const column = structuredClone(REQUEST);
    column.planRequests[0].projection = ['attacker_column'];
    expect(() => buildFixturePlanChecks(validateRequest(column)))
      .toThrow(expect.objectContaining({ code: 'DATABASE_PLAN_COLUMN_UNSUPPORTED' }));
  });

  test('enforces statement count before returning templates', () => {
    const bounded = structuredClone(REQUEST);
    bounded.limits.maxStatements = 1;
    const identity = validateRequest(bounded);
    expect(() => buildCatalogChecks(identity)).toThrow(expect.objectContaining({ code: 'DATABASE_STATEMENT_LIMIT' }));
    expect(() => buildFixturePlanChecks(identity)).toThrow(expect.objectContaining({ code: 'DATABASE_STATEMENT_LIMIT' }));
  });

  test('does not trust caller-forged validated request wrappers', () => {
    expect(() => buildCatalogChecks({ request: { rawSql: 'SELECT 1' }, requestHash: 'a'.repeat(64) }))
      .toThrow(expect.objectContaining({ code: 'DATABASE_REQUEST_INVALID' }));
  });
});
