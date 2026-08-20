'use strict';

const {
  POLICY_ROWS,
  validateApprovedPolicies,
} = require('../../../../scripts/native/provision-trust-root-launcher-inputs-host');

describe('B2P1B0P layout selector and activation-lock pins', () => {
  test('retains exact normative policy bytes', () => {
    expect(validateApprovedPolicies()).toBe(true);
    const policies = Object.fromEntries(POLICY_ROWS.map((row) => [row.name, row]));
    expect(policies.layout.text).toContain('FOLDERID_ProgramFiles::AEXOS\\\\NativeCapability');
    expect(policies.selector.text).toContain('kind=sole-same-volume-hardlink');
    expect(policies.activationLock.text).toContain('range=[0,1)');
  });
});
