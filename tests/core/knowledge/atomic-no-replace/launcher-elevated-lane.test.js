'use strict';

const {
  matchingLane,
  observedHost,
} = require('../../../../scripts/native/provision-trust-root-launcher-inputs-host');

describe('B2P1B0P governed lane fail-closed preflight', () => {
  test('admits a host only when every exact RELEASE lane identity matches', () => {
    const host = observedHost();
    const lane = matchingLane(host);
    if (lane) {
      expect(lane.launcherTupleId).toMatch(/-node-v24\.19\.0$/);
    } else {
      expect(lane).toBeNull();
    }
  });

  test('does not admit a semantic label without the exact asserted image and OS', () => {
    expect(matchingLane({
      platform: 'win32', arch: 'x64', nodeVersion: '24.19.0', imageOs: 'win22',
      imageVersion: 'latest', osVersion: '10.0.20348', osRelease: '',
    })).toBeNull();
  });
});
