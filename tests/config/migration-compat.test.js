const { deepMerge } = require('../../.aexos-core/core/config/merge-utils');
const {
  MIGRATION_KEY, withMigrationCompatibility, mergeLocalConfig,
} = require('../../.aexos-core/core/config/migration-compat');

describe('migration-only literal null compatibility', () => {
  test('retains nested and dotted literal keys without mutating lower layers', () => {
    const base = { nested: { value: 'default', retained: true }, 'a.b': 'default' };
    const local = withMigrationCompatibility({ nested: { value: null }, 'a.b': null, list: [null] });
    const result = mergeLocalConfig(base, local);
    expect(result).toEqual({ nested: { value: null, retained: true }, 'a.b': null, list: [null] });
    expect(base).toEqual({ nested: { value: 'default', retained: true }, 'a.b': 'default' });
    expect(local[MIGRATION_KEY].literal_null_paths).toEqual([['nested', 'value'], ['a.b']]);
    expect(result).not.toHaveProperty(MIGRATION_KEY);
  });

  test('ordinary local nulls and later user-layer nulls still delete', () => {
    const base = { old: true, nested: { old: true, keep: true } };
    expect(mergeLocalConfig(base, { old: null, nested: { old: null } }))
      .toEqual({ nested: { keep: true } });
    const migrated = mergeLocalConfig(base, withMigrationCompatibility({ old: null }));
    expect(migrated.old).toBeNull();
    expect(deepMerge(migrated, { old: null })).not.toHaveProperty('old');
    expect(deepMerge(migrated, { old: 'user-value' }).old).toBe('user-value');
  });

  test('stale metadata never resurrects removed keys or overrides edited values', () => {
    const local = withMigrationCompatibility({ nested: { old: null }, other: null });
    delete local.nested;
    local.other = false;
    expect(mergeLocalConfig({}, local)).toEqual({ other: false });
    local.nested = null;
    expect(mergeLocalConfig({ nested: { value: true } }, local)).toEqual({ other: false });
  });

  test('removing a migration exception restores deletion for that key', () => {
    const local = withMigrationCompatibility({ old: null, keep: null });
    local[MIGRATION_KEY].literal_null_paths = [['keep']];
    expect(mergeLocalConfig({ old: true, keep: true }, local)).toEqual({ keep: null });
  });

  test.each([
    null, { version: 2, literal_null_paths: [] }, { version: 1, literal_null_paths: ['key'] },
    { version: 1, literal_null_paths: [[]] },
    ...['__proto__', 'constructor', 'prototype', MIGRATION_KEY].map(key => ({
      version: 1, literal_null_paths: [[key, 'polluted']],
    })),
  ])('rejects malformed or unsafe migration metadata: %j', metadata => {
    expect(() => mergeLocalConfig({}, { [MIGRATION_KEY]: metadata })).toThrow('Invalid');
    expect({}.polluted).toBeUndefined();
  });

  test('refuses reserved-key collisions instead of deleting legacy data', () => {
    expect(() => withMigrationCompatibility({ [MIGRATION_KEY]: { private: true } }))
      .toThrow('reserved key');
  });
});
