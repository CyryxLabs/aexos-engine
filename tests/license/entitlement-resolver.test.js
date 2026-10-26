'use strict';

const crypto = require('crypto');
const { verifyEntitlementEnvelope, resolveEntitlement, _testing } = require('../../pro/license/entitlement-resolver');

const PRIVATE_DER_HEX =
  '302e020100300506032b6570042204209d61b19deffd5a60ba844af492ec2cc4' +
  '4449c5697b326919703bac031cae7f60';
const machineId = 'a'.repeat(64);

function envelope(overrides = {}) {
  const issuedAt = new Date('2026-08-27T12:00:00.000Z');
  const unsigned = {
    schemaVersion: 1, algorithm: 'Ed25519', keyId: _testing.TEST_KEY_ID,
    entitlementId: 'ent_test', customerId: 'cus_test', organizationId: null,
    product: 'aexos', plan: 'pro', features: ['pro.squads.*'],
    seats: { used: 1, max: 3 }, machineIdHash: _testing.hashMachineId(machineId),
    issuedAt: issuedAt.toISOString(), notBefore: new Date(issuedAt.getTime() - 300000).toISOString(),
    expiresAt: '2026-10-27T12:00:00.000Z', offline: { cacheValidDays: 30, gracePeriodDays: 7 },
    release: { channel: 'stable', versionRange: '*' }, revocationEpoch: 1,
    ...overrides,
  };
  const key = crypto.createPrivateKey({ key: Buffer.from(PRIVATE_DER_HEX, 'hex'), format: 'der', type: 'pkcs8' });
  return { ...unsigned, signature: crypto.sign(null, Buffer.from(_testing.canonicalize(unsigned)), key).toString('base64url') };
}

describe('signed entitlement resolver', () => {
  it('verifies the strict machine-bound Ed25519 envelope', () => {
    expect(verifyEntitlementEnvelope(envelope(), machineId)).toMatchObject({ valid: true });
  });
  it('rejects tamper, clone, unknown key and unknown fields', () => {
    expect(verifyEntitlementEnvelope({ ...envelope(), plan: 'enterprise' }, machineId)).toMatchObject({ valid: false });
    expect(verifyEntitlementEnvelope(envelope(), 'b'.repeat(64))).toMatchObject({ valid: false, reason: 'machine_mismatch' });
    expect(verifyEntitlementEnvelope(envelope({ keyId: 'substituted' }), machineId)).toMatchObject({ valid: false, reason: 'unknown_key' });
    expect(verifyEntitlementEnvelope({ ...envelope(), injected: true }, machineId)).toMatchObject({ valid: false, reason: 'invalid_schema' });
  });
  it('uses signed cache only for transport failure and never overrides denial', () => {
    const signed = envelope();
    expect(resolveEntitlement({ cachedEntitlement: signed, transportError: true, machineId, now: '2026-09-01T12:00:00Z' })).toMatchObject({ state: 'OFFLINE_VALID', allowed: true });
    expect(resolveEntitlement({ cachedEntitlement: signed, transportError: true, remoteDenied: 'REVOKED', machineId, now: '2026-09-01T12:00:00Z' })).toMatchObject({ state: 'REVOKED', allowed: false });
  });
  it('has deterministic grace, expiry and clock rollback states', () => {
    const signed = envelope();
    expect(resolveEntitlement({ cachedEntitlement: signed, transportError: true, machineId, now: '2026-09-28T12:00:00Z' })).toMatchObject({ state: 'GRACE', allowed: true });
    expect(resolveEntitlement({ cachedEntitlement: signed, transportError: true, machineId, now: '2026-10-05T12:00:00Z' })).toMatchObject({ state: 'EXPIRED', allowed: false });
    expect(resolveEntitlement({ cachedEntitlement: signed, transportError: true, machineId, now: '2026-08-20T12:00:00Z', lastTrustedAt: '2026-08-27T12:00:00Z' })).toMatchObject({ state: 'CLOCK_ROLLBACK', allowed: false });
  });
});
