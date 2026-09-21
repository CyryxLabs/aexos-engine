'use strict';

const os = require('os');
const path = require('path');

const errors = require('../../.aexos-core/core/errors');
const osDetector = require('../../.aexos-core/core/mcp/os-detector');
const AexosDirectoryCheck = require('../../.aexos-core/core/health-check/checks/project/aexos-directory');
const projectChecks = require('../../.aexos-core/core/health-check/checks/project');

describe('public interface compatibility', () => {
  test('canonical and legacy error constructors serialize with recognized markers', () => {
    const constructors = [errors.AEXOSError, errors.AIOXError, errors.CYRYXError];
    expect(constructors.every((Constructor) => typeof Constructor === 'function')).toBe(true);

    const names = constructors.map((Constructor) => {
      const error = new Constructor('compatible', { code: 'AEXOS_EXECUTION_FAILED' });
      expect(errors.isAEXOSError(error)).toBe(true);
      expect(errors.isAIOXError(error)).toBe(true);
      expect(errors.isCYRYXError(error)).toBe(true);
      expect(error).toMatchObject({
        isAEXOSError: true,
        isAIOXError: true,
        isCYRYXError: true,
      });
      expect(error.toJSON()).toMatchObject({
        name: error.name,
        message: 'compatible',
        code: 'AEXOS_EXECUTION_FAILED',
      });
      return error.name;
    });

    expect(names).toEqual(['AEXOSError', 'AIOXError', 'CYRYXError']);
    // Generic normalization retains the name consumed by existing metrics and
    // persisted build state. Canonical aliases must be additive compatibility.
    const normalized = errors.normalizeError(new Error('current'));
    expect(normalized.name).toBe('CYRYXError');
    expect(errors.isAEXOSError(normalized)).toBe(true);
    for (const Constructor of constructors) {
      const original = new Constructor('preserved');
      const enriched = errors.normalizeError(original, { metadata: { reviewed: true } });
      expect(enriched.name).toBe(original.name);
      expect(enriched).toBeInstanceOf(Constructor);
      expect(enriched.metadata.reviewed).toBe(true);
    }

    const hydratedLegacy = new Error('hydrated');
    hydratedLegacy.name = 'AIOXError';
    hydratedLegacy.isAIOXError = true;
    hydratedLegacy.code = 'AEXOS_EXECUTION_FAILED';
    expect(errors.serializeError(hydratedLegacy)).toMatchObject({
      name: 'AIOXError',
      message: 'hydrated',
      code: 'AEXOS_EXECUTION_FAILED',
    });
  });

  test('all MCP global-directory names resolve to the current AEXOS namespace', () => {
    const expected = path.join(os.homedir(), '.aexos');
    expect(osDetector.getGlobalAexosDir()).toBe(expected);
    expect(osDetector.getGlobalAioxDir()).toBe(expected);
    expect(osDetector.getGlobalCyryxDir()).toBe(expected);
  });

  test('health-check aliases resolve without duplicate registry enumeration', () => {
    expect(projectChecks.AexosDirectoryCheck).toBe(AexosDirectoryCheck);
    expect(projectChecks.AioxDirectoryCheck).toBe(AexosDirectoryCheck);
    expect(projectChecks.CyryxDirectoryCheck).toBe(AexosDirectoryCheck);

    const instances = [
      new projectChecks.AexosDirectoryCheck(),
      new projectChecks.AioxDirectoryCheck(),
      new projectChecks.CyryxDirectoryCheck(),
    ];
    expect(instances.map((check) => check.id)).toEqual([
      'project.aexos-directory',
      'project.aexos-directory',
      'project.aexos-directory',
    ]);

    const enumerableIds = Object.values(projectChecks).map((Check) => new Check().id);
    expect(enumerableIds.filter((id) => id === 'project.aexos-directory')).toHaveLength(1);
    expect(new Set(enumerableIds).size).toBe(enumerableIds.length);
  });
});
