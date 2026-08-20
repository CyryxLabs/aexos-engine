'use strict';

const {
  EMBEDDED_NODE,
  RELEASE_LANES,
} = require('../../../../scripts/native/provision-trust-root-launcher-inputs-host');

describe('B2P1B0P static embedder approved input', () => {
  test('pins only the Node 24.19.0 source identity and excludes HOST_TEST', () => {
    expect(EMBEDDED_NODE).toEqual({
      version: '24.19.0',
      annotatedTagObject: '1dbab0e88e7ccc6b44c801418911767447796ed0',
      sourceCommit: 'cdc1b38d40cb567b7ad0b39c86addf830a0af0ae',
      archiveName: 'node-v24.19.0.tar.gz',
      archiveBytes: 112888473,
      archiveSha256: '16fe258006a6e86844fbe05b3b5e1e5623ca8d3da54e32d98d9e83234bf25b01',
      embedderAbi:
        'node-cxx-embedder/v24.19.0@cdc1b38d40cb567b7ad0b39c86addf830a0af0ae;NODE_MODULE_VERSION=137',
    });
    expect(RELEASE_LANES.some((row) => row.launcherTupleId.includes('24.15.0'))).toBe(false);
  });
});
