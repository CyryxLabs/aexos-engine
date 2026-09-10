'use strict';

const crypto = require('crypto');
const {
  DESCRIPTOR_SCHEMA,
  DESCRIPTOR_ALGORITHM,
  hashMachineId,
  _testing: { canonicalize, sha256 },
} = require('../../packages/installer/src/licensing/paid-squad-artifact');

const artifactKeys = crypto.generateKeyPairSync('ed25519');
const entitlementKeys = crypto.generateKeyPairSync('ed25519');
const DEFAULT_NOW = new Date('2026-09-04T16:00:00.000Z');
const DEFAULT_MACHINE_ID = 'machine-fixture-0123456789abcdef';

function createTrustStore(options = {}) {
  const publicKey = options.publicKey || artifactKeys.publicKey;
  return {
    schemaVersion: 1,
    product: 'aexos',
    algorithm: 'Ed25519',
    keys: [
      {
        keyId: options.keyId || 'artifact-test-v1',
        algorithm: 'Ed25519',
        status: options.status || 'active',
        notBefore: options.notBefore || '2026-01-01T00:00:00.000Z',
        notAfter: options.notAfter || '2027-01-01T00:00:00.000Z',
        publicKeyPem: publicKey.export({ format: 'pem', type: 'spki' }).toString(),
      },
    ],
  };
}

function signDescriptor(options = {}) {
  const now = options.now || DEFAULT_NOW;
  const payload = options.payload || Buffer.from('paid squad fixture');
  const unsigned = {
    schema: DESCRIPTOR_SCHEMA,
    algorithm: DESCRIPTOR_ALGORITHM,
    keyId: options.keyId || 'artifact-test-v1',
    descriptorId: options.descriptorId || 'descriptor-test-1',
    product: options.product || 'aexos',
    plan: options.plan || 'pro',
    subjectIdHash: options.subjectIdHash || sha256(Buffer.from('user-1')),
    entitlementId: options.entitlementId || 'entitlement-test-1',
    machineIdHash: options.machineIdHash || hashMachineId(options.machineId || DEFAULT_MACHINE_ID),
    squadId: options.squadId || 'marketing',
    package: options.package || '@aexos/marketing',
    version: options.version || '1.2.3',
    platform: options.platform || 'any',
    releaseChannel: options.releaseChannel || 'stable',
    format: 'tgz',
    artifactUrl: options.artifactUrl || 'https://artifacts.example.test/file.tgz',
    sizeBytes: options.sizeBytes || payload.length,
    sha256: options.sha256 || sha256(payload),
    issuedAt: options.issuedAt || now.toISOString(),
    expiresAt:
      options.expiresAt || new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
    entitlementExpiresAt:
      options.entitlementExpiresAt ||
      new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    revocationEpoch: options.revocationEpoch ?? 7,
  };
  const privateKey = options.privateKey || artifactKeys.privateKey;
  return {
    ...unsigned,
    signature: crypto
      .sign(null, Buffer.from(canonicalize(unsigned), 'utf8'), privateKey)
      .toString('base64url'),
  };
}

function expectedBindings(options = {}) {
  return {
    product: options.product || 'aexos',
    squadId: options.squadId || 'marketing',
    package: options.package || '@aexos/marketing',
    version: options.version || '1.2.3',
    platform: options.platform || 'win32',
    releaseChannel: options.releaseChannel || 'stable',
    machineId: options.machineId || DEFAULT_MACHINE_ID,
    ...(options.subjectIdHash ? { subjectIdHash: options.subjectIdHash } : {}),
    ...(options.entitlementId ? { entitlementId: options.entitlementId } : {}),
    ...(options.plan ? { plan: options.plan } : {}),
    ...(options.revocationEpoch !== undefined
      ? { revocationEpoch: options.revocationEpoch }
      : {}),
  };
}

function signEntitlement(options = {}) {
  const now = options.now || DEFAULT_NOW;
  const unsigned = {
    schemaVersion: 1,
    algorithm: 'Ed25519',
    keyId: 'entitlement-test-v1',
    entitlementId: options.entitlementId || 'entitlement-test-1',
    customerId: options.customerId || 'customer-test-1',
    organizationId: null,
    product: options.product || 'aexos',
    plan: options.plan || 'pro',
    features: options.features || ['aexos.squads.marketing'],
    seats: options.seats || { used: 1, max: 1 },
    machineIdHash: options.machineIdHash || hashMachineId(options.machineId || DEFAULT_MACHINE_ID),
    issuedAt: options.issuedAt || now.toISOString(),
    notBefore: options.notBefore || new Date(now.getTime() - 1000).toISOString(),
    expiresAt:
      options.expiresAt || new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    offline: { cacheValidDays: 1, gracePeriodDays: 0 },
    release: options.release || { channel: 'stable', versionRange: '>=1.0.0' },
    revocationEpoch: options.revocationEpoch ?? 7,
  };
  return {
    ...unsigned,
    signature: crypto
      .sign(null, Buffer.from(canonicalize(unsigned), 'utf8'), entitlementKeys.privateKey)
      .toString('base64url'),
  };
}

function verifyTestEntitlement(entitlement) {
  if (!entitlement || typeof entitlement.signature !== 'string') {
    return { valid: false };
  }
  const { signature, ...unsigned } = entitlement;
  const valid = crypto.verify(
    null,
    Buffer.from(canonicalize(unsigned), 'utf8'),
    entitlementKeys.publicKey,
    Buffer.from(signature, 'base64url'),
  );
  return valid ? { valid: true, entitlement } : { valid: false };
}

module.exports = {
  artifactKeys,
  DEFAULT_NOW,
  DEFAULT_MACHINE_ID,
  createTrustStore,
  signDescriptor,
  expectedBindings,
  signEntitlement,
  verifyTestEntitlement,
};
