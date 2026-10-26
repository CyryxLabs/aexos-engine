'use strict';

const path = require('path');
const Ajv2020 = require('ajv/dist/2020');
const {
  DEFAULT_LIMITS,
  validateBrownfieldContract,
} = require('../../../.aexos-core/core/code-intel/brownfield');

const ROOT = path.resolve(__dirname, '../../fixtures/brownfield/monorepo');

function request(overrides = {}) {
  return {
    protocol: 'aexos.brownfield-analysis/v1',
    analysisId: 'fixture-analysis',
    projectRoot: ROOT,
    allowedPaths: ['.'],
    exclusions: ['operator-private/**'],
    requestedViews: ['architecture', 'domain', 'api', 'data', 'dependencies', 'tests', 'risks'],
    limits: { ...DEFAULT_LIMITS },
    output: { mode: 'return', path: 'evidence/brownfield.json' },
    verification: { mode: 'static-only', requireSourceHashes: true, requireNoMutation: true },
    ...overrides,
  };
}

describe('brownfield analysis contract', () => {
  test('accepts an exact authorized bounded static contract', () => {
    const schema = require('../../../.aexos-core/schemas/brownfield-analysis-v1.schema.json');
    const validateSchema = new Ajv2020({ strict: true }).compile(schema);
    expect(validateSchema(request())).toBe(true);
    const result = validateBrownfieldContract(request(), { authorizedProjectRoot: ROOT });
    expect(result.contract.projectRoot).toBe(ROOT);
    expect(result.contractHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test.each([
    ['implicit clone', { clone: 'https://example.test/repository.git' }, 'BROWNFIELD_CONTRACT_INVALID'],
    ['root mismatch', { projectRoot: path.resolve(ROOT, '..') }, 'BROWNFIELD_ROOT_MISMATCH'],
    ['path traversal', { allowedPaths: ['../outside'] }, 'BROWNFIELD_PATH_INVALID'],
    ['dynamic execution', { verification: { mode: 'execute-tests', requireSourceHashes: true, requireNoMutation: true } }, 'BROWNFIELD_VERIFICATION_INVALID'],
    ['oversized read', { limits: { ...DEFAULT_LIMITS, maxFileBytes: 32 * 1024 * 1024, maxTotalBytes: 32 * 1024 * 1024 } }, 'BROWNFIELD_LIMITS_INVALID'],
  ])('rejects %s before source analysis', (_label, override, code) => {
    expect(() => validateBrownfieldContract(request(override), { authorizedProjectRoot: ROOT }))
      .toThrow(expect.objectContaining({ code }));
  });

  test('rejects case-equivalent aliases and ambiguous nested ownership', () => {
    expect(() => validateBrownfieldContract(request({ allowedPaths: ['packages', 'packages/api'] }), {
      authorizedProjectRoot: ROOT,
    })).toThrow(expect.objectContaining({ code: 'BROWNFIELD_OWNERSHIP_AMBIGUOUS' }));
  });
});
