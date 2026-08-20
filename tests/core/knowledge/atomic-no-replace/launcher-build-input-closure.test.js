'use strict';

const {
  MODE,
  POLICY_ROWS,
  RELEASE_LANES,
  SCHEMA_VERSION,
  validateApprovedPolicies,
} = require('../../../../scripts/native/provision-trust-root-launcher-inputs-host');
const {
  APPROVED_KEYS,
  GENERATED_KEYS,
  TOP_LEVEL_KEYS,
} = require('../../../../scripts/native/verify-trust-root-launcher-inputs-host');

describe('B2P1B0P canonical closure contract', () => {
  test('pins schema, mode, key order, tuples and seven policy hashes', () => {
    expect(SCHEMA_VERSION).toBe('aexos.os-rooted-launcher-build-input-closure/v2');
    expect(MODE).toBe('HOST_INPUT_CLOSURE');
    expect(TOP_LEVEL_KEYS).toEqual([
      'schemaVersion', 'mode', 'sourceRevision', 'packageVersion', 'launcherTupleId',
      'approvedInputs', 'generatedOutputs', 'closureSha256', 'result',
    ]);
    expect(APPROVED_KEYS).toEqual(['embeddedNode', 'lane', 'toolchain', 'policies']);
    expect(GENERATED_KEYS).toEqual([
      'buildRecipe', 'toolchainFiles', 'expandedFlags', 'archives', 'objects',
      'runtimeImports', 'systemLibraries', 'elevatedLane',
    ]);
    expect(RELEASE_LANES.map((row) => row.launcherTupleId)).toEqual([
      'win32-x64-none-node-v24.19.0',
      'linux-x64-glibc-node-v24.19.0',
      'darwin-arm64-none-node-v24.19.0',
    ]);
    expect(POLICY_ROWS).toHaveLength(7);
    expect(validateApprovedPolicies()).toBe(true);
  });
});
