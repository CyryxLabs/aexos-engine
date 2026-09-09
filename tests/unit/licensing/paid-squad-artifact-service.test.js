'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  ArtifactServiceError,
  SignedSquadArtifactService,
} = require('../../../pro/artifact-service');
const {
  verifySignedArtifactDescriptor,
  _testing: { sha256 },
} = require('../../../packages/installer/src/licensing/paid-squad-artifact');
const {
  artifactKeys,
  DEFAULT_NOW,
  DEFAULT_MACHINE_ID,
  createTrustStore,
  expectedBindings,
  signEntitlement,
  verifyTestEntitlement,
} = require('../../helpers/paid-squad-artifact-fixture');

function expectCode(promise, code) {
  return expect(promise).rejects.toMatchObject({ code });
}

describe('SignedSquadArtifactService', () => {
  let artifactRoot;
  let artifactPath;
  let payload;
  let auditEvents;
  let authority;

  beforeEach(() => {
    artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-paid-artifact-service-'));
    artifactPath = path.join(artifactRoot, 'marketing-1.2.3.tgz');
    payload = Buffer.from('private paid squad artifact bytes');
    fs.writeFileSync(artifactPath, payload);
    auditEvents = [];
    const entitlement = signEntitlement();
    authority = {
      state: 'ACTIVE',
      allowed: true,
      source: 'remote',
      subjectId: 'user-1',
      revocationEpoch: entitlement.revocationEpoch,
      entitlement,
    };
  });

  afterEach(() => {
    fs.rmSync(artifactRoot, { recursive: true, force: true });
  });

  function buildService(options = {}) {
    const record = {
      enabled: true,
      product: 'aexos',
      squadId: 'marketing',
      package: '@aexos/marketing',
      version: '1.2.3',
      platform: 'any',
      releaseChannel: 'stable',
      format: 'tgz',
      filePath: path.basename(artifactPath),
      sizeBytes: payload.length,
      sha256: sha256(payload),
    };
    return new SignedSquadArtifactService({
      artifactRoot,
      artifactOrigin: 'http://127.0.0.1:4444',
      signingPrivateKey: artifactKeys.privateKey,
      keyId: 'artifact-test-v1',
      registry: [record],
      authenticate: async ({ authorization }) =>
        authorization === 'Bearer access-token-secret' ? { id: 'user-1' } : null,
      resolveEntitlement: async () => authority,
      verifyEntitlement: async (entitlement) => verifyTestEntitlement(entitlement),
      audit: async (event) => auditEvents.push(event),
      now: () => new Date(DEFAULT_NOW),
      ...options,
    });
  }

  function validRequest(overrides = {}) {
    return {
      authorization: 'Bearer access-token-secret',
      product: 'aexos',
      squadId: 'marketing',
      package: '@aexos/marketing',
      version: '1.2.3',
      platform: 'win32',
      releaseChannel: 'stable',
      format: 'tgz',
      machineId: DEFAULT_MACHINE_ID,
      ...overrides,
    };
  }

  test('issues a client-verifiable descriptor only after current entitlement checks', async () => {
    const service = buildService();
    const descriptor = await service.issueDescriptor(validRequest());
    const verified = verifySignedArtifactDescriptor(descriptor, expectedBindings(), {
      trustStore: createTrustStore(),
      now: DEFAULT_NOW,
    });
    expect(verified.squadId).toBe('marketing');
    expect(verified.subjectIdHash).toMatch(/^[a-f0-9]{64}$/);
    const artifactFileName = decodeURIComponent(new URL(verified.artifactUrl).pathname.split('/').pop());
    expect(await service.readArtifact(verified.descriptorId, artifactFileName)).toEqual(payload);
    expect(auditEvents).toContainEqual(
      expect.objectContaining({ decision: 'allow', squadId: 'marketing' }),
    );
  });

  test.each([
    ['revoked authority', () => ({ ...authority, state: 'REVOKED', allowed: false }), 'ENTITLEMENT_REVOKED'],
    ['held authority', () => ({ ...authority, state: 'HELD', allowed: false }), 'ENTITLEMENT_HELD'],
    [
      'expired entitlement',
      () => {
        const entitlement = signEntitlement({ expiresAt: '2026-09-04T15:59:59.000Z' });
        return { ...authority, entitlement, revocationEpoch: entitlement.revocationEpoch };
      },
      'ENTITLEMENT_EXPIRED',
    ],
    [
      'wrong product entitlement',
      () => {
        const entitlement = signEntitlement({ product: 'another-product' });
        return { ...authority, entitlement, revocationEpoch: entitlement.revocationEpoch };
      },
      'WRONG_PRODUCT',
    ],
    [
      'wrong machine entitlement',
      () => {
        const entitlement = signEntitlement({ machineId: 'another-machine-0123456789abcdef' });
        return { ...authority, entitlement, revocationEpoch: entitlement.revocationEpoch };
      },
      'ENTITLEMENT_MACHINE_MISMATCH',
    ],
    [
      'missing squad scope',
      () => {
        const entitlement = signEntitlement({ features: ['aexos.squads.sales'] });
        return { ...authority, entitlement, revocationEpoch: entitlement.revocationEpoch };
      },
      'ENTITLEMENT_SCOPE_MISSING',
    ],
    [
      'invalid seat state',
      () => {
        const entitlement = signEntitlement({ seats: { used: 0, max: 1 } });
        return { ...authority, entitlement, revocationEpoch: entitlement.revocationEpoch };
      },
      'ENTITLEMENT_SEAT_INVALID',
    ],
    [
      'unauthorized release range',
      () => {
        const entitlement = signEntitlement({
          release: { channel: 'stable', versionRange: '>=2.0.0' },
        });
        return { ...authority, entitlement, revocationEpoch: entitlement.revocationEpoch };
      },
      'ENTITLEMENT_RELEASE_NOT_AUTHORIZED',
    ],
  ])('rejects %s before returning artifact authority', async (_name, mutate, code) => {
    authority = mutate();
    const service = buildService();
    await expectCode(service.issueDescriptor(validRequest()), code);
    expect(service.tickets.size).toBe(0);
  });

  test('rejects unauthenticated and wrong-product requests', async () => {
    const service = buildService();
    await expectCode(
      service.issueDescriptor(validRequest({ authorization: undefined })),
      'AUTHENTICATION_REQUIRED',
    );
    await expectCode(
      service.issueDescriptor(validRequest({ product: 'other' })),
      'WRONG_PRODUCT',
    );
  });

  test('rejects a forged entitlement even when the authority claims active', async () => {
    authority = {
      ...authority,
      entitlement: { ...authority.entitlement, signature: 'a'.repeat(86) },
    };
    const service = buildService();
    await expectCode(service.issueDescriptor(validRequest()), 'INVALID_SIGNED_ENTITLEMENT');
  });

  test.each([
    [
      'subject mismatch',
      () => ({ ...authority, subjectId: 'different-user' }),
      {},
      'ENTITLEMENT_SUBJECT_MISMATCH',
    ],
    [
      'invalid plan',
      () => {
        const entitlement = signEntitlement({ plan: 'free' });
        return { ...authority, entitlement, revocationEpoch: entitlement.revocationEpoch };
      },
      {},
      'INVALID_ENTITLEMENT_PLAN',
    ],
    [
      'invalid lifetime',
      () => {
        const entitlement = signEntitlement({ notBefore: 'not-a-date' });
        return { ...authority, entitlement, revocationEpoch: entitlement.revocationEpoch };
      },
      {},
      'INVALID_SIGNED_ENTITLEMENT',
    ],
    [
      'stale revocation epoch',
      () => ({ ...authority, revocationEpoch: authority.revocationEpoch + 1 }),
      {},
      'ENTITLEMENT_REVOKED',
    ],
    [
      'verifier substitution',
      () => authority,
      {
        verifyEntitlement: async () => ({
          valid: true,
          entitlement: signEntitlement({ entitlementId: 'substituted-entitlement' }),
        }),
      },
      'INVALID_SIGNED_ENTITLEMENT',
    ],
    [
      'verifier exception',
      () => authority,
      { verifyEntitlement: async () => { throw new Error('crypto unavailable'); } },
      'INVALID_SIGNED_ENTITLEMENT',
    ],
  ])('rejects %s', async (_name, mutateAuthority, serviceOptions, code) => {
    authority = mutateAuthority();
    await expectCode(buildService(serviceOptions).issueDescriptor(validRequest()), code);
  });

  test('accepts the explicit AEXOS wildcard scope and a Map registry', async () => {
    const entitlement = signEntitlement({ features: ['aexos.squads.*'] });
    authority = { ...authority, entitlement, revocationEpoch: entitlement.revocationEpoch };
    const baseService = buildService();
    const service = buildService({ registry: new Map([['marketing', baseService.registry[0]]]) });
    await expect(service.issueDescriptor(validRequest())).resolves.toMatchObject({
      squadId: 'marketing',
    });
  });

  test.each([
    ['request object', null, 'INVALID_ARTIFACT_REQUEST'],
    ['squad identifier', { squadId: '../marketing' }, 'INVALID_ARTIFACT_REQUEST'],
    ['semantic version', { version: 'latest' }, 'INVALID_ARTIFACT_REQUEST'],
    ['package', { package: '../../../private' }, 'INVALID_ARTIFACT_REQUEST'],
    ['platform', { platform: 'solaris' }, 'INVALID_ARTIFACT_REQUEST'],
    ['release channel', { releaseChannel: 'production' }, 'INVALID_ARTIFACT_REQUEST'],
    ['machine ID', { machineId: 'short' }, 'INVALID_ARTIFACT_REQUEST'],
  ])('rejects invalid %s', async (_name, request, code) => {
    const input = request === null ? null : validRequest(request);
    await expectCode(buildService().issueDescriptor(input), code);
  });

  test('rejects exact-record drift before issuing a descriptor', async () => {
    const service = buildService();
    fs.appendFileSync(artifactPath, 'tampered');
    await expectCode(service.issueDescriptor(validRequest()), 'ARTIFACT_REGISTRY_DRIFT');
  });

  test('rejects version confusion and unsafe paths', async () => {
    const service = buildService();
    await expectCode(
      service.issueDescriptor(validRequest({ version: '1.2.4' })),
      'ARTIFACT_RECORD_NOT_FOUND',
    );

    const outsidePath = path.join(path.dirname(artifactRoot), `outside-${crypto.randomUUID()}.tgz`);
    fs.writeFileSync(outsidePath, payload);
    try {
      const unsafe = buildService({
        registry: [
          {
            enabled: true,
            product: 'aexos',
            squadId: 'marketing',
            package: '@aexos/marketing',
            version: '1.2.3',
            platform: 'any',
            releaseChannel: 'stable',
            format: 'tgz',
            filePath: path.relative(artifactRoot, outsidePath),
            sizeBytes: payload.length,
            sha256: sha256(payload),
          },
        ],
      });
      await expectCode(unsafe.issueDescriptor(validRequest()), 'ARTIFACT_REGISTRY_INVALID');
    } finally {
      fs.rmSync(outsidePath, { force: true });
    }
  });

  test('rejects unavailable, non-file, absolute and invalid-integrity registry records', async () => {
    const baseline = buildService().registry[0];
    const subdirectory = path.join(artifactRoot, 'not-a-file');
    fs.mkdirSync(subdirectory);
    const cases = [
      [{ ...baseline, filePath: artifactPath }, 'ARTIFACT_REGISTRY_INVALID'],
      [{ ...baseline, filePath: 'missing.tgz' }, 'ARTIFACT_UNAVAILABLE'],
      [{ ...baseline, filePath: 'not-a-file' }, 'ARTIFACT_UNAVAILABLE'],
      [{ ...baseline, sizeBytes: 0 }, 'ARTIFACT_REGISTRY_INVALID'],
    ];
    for (const [record, code] of cases) {
      await expectCode(
        buildService({ registry: [record] }).issueDescriptor(validRequest()),
        code,
      );
    }
  });

  test('fails closed on invalid clock and an unavailable durable audit sink', async () => {
    await expectCode(
      buildService({ now: () => new Date('invalid') }).issueDescriptor(validRequest()),
      'ARTIFACT_SERVICE_MISCONFIGURED',
    );
    const service = buildService({ audit: async () => { throw new Error('audit down'); } });
    await expectCode(service.issueDescriptor(validRequest()), 'ARTIFACT_AUDIT_UNAVAILABLE');
    expect(service.tickets.size).toBe(0);
  });

  test('rejects invalid, mismatched, expired and drifted download tickets', async () => {
    const service = buildService();
    await expectCode(service.readArtifact('../ticket', 'artifact.tgz'), 'ARTIFACT_TICKET_INVALID');
    const descriptor = await service.issueDescriptor(validRequest());
    const artifactFileName = decodeURIComponent(new URL(descriptor.artifactUrl).pathname.split('/').pop());
    await expectCode(
      service.readArtifact(descriptor.descriptorId, 'different.tgz'),
      'ARTIFACT_TICKET_EXPIRED',
    );

    const expiringService = buildService();
    const expiringDescriptor = await expiringService.issueDescriptor(validRequest());
    const expiringName = decodeURIComponent(
      new URL(expiringDescriptor.artifactUrl).pathname.split('/').pop(),
    );
    expiringService.tickets.get(expiringDescriptor.descriptorId).expiresAtMs =
      DEFAULT_NOW.getTime();
    await expectCode(
      expiringService.readArtifact(expiringDescriptor.descriptorId, expiringName),
      'ARTIFACT_TICKET_EXPIRED',
    );

    const driftService = buildService();
    const driftDescriptor = await driftService.issueDescriptor(validRequest());
    const driftName = decodeURIComponent(new URL(driftDescriptor.artifactUrl).pathname.split('/').pop());
    fs.appendFileSync(artifactPath, 'drift');
    await expectCode(
      driftService.readArtifact(driftDescriptor.descriptorId, driftName),
      'ARTIFACT_REGISTRY_DRIFT',
    );
  });

  test('audit records are privacy bounded and exclude secrets and payloads', async () => {
    const service = buildService();
    await service.issueDescriptor(validRequest());
    await expectCode(
      service.issueDescriptor(validRequest({ authorization: 'Bearer wrong-token' })),
      'AUTHENTICATION_REQUIRED',
    );
    const serialized = JSON.stringify(auditEvents);
    expect(serialized).not.toContain('access-token-secret');
    expect(serialized).not.toContain(authority.entitlement.signature);
    expect(serialized).not.toContain(payload.toString('utf8'));
    expect(serialized).not.toContain('PRIVATE KEY');
    expect(auditEvents.map((event) => event.decision)).toEqual(['allow', 'deny']);
  });

  test('missing key, origin, verifier, registry or audit configuration fails closed', () => {
    const base = {
      artifactRoot,
      artifactOrigin: 'https://artifacts.example.test',
      signingPrivateKey: artifactKeys.privateKey,
      keyId: 'artifact-test-v1',
      registry: [],
      authenticate: async () => ({ id: 'user-1' }),
      resolveEntitlement: async () => authority,
      verifyEntitlement: async (entitlement) => verifyTestEntitlement(entitlement),
      audit: async () => {},
    };
    for (const field of [
      'artifactRoot',
      'artifactOrigin',
      'signingPrivateKey',
      'authenticate',
      'resolveEntitlement',
      'verifyEntitlement',
      'audit',
    ]) {
      const invalid = { ...base, [field]: undefined };
      expect(() => new SignedSquadArtifactService(invalid)).toThrow(ArtifactServiceError);
    }
    expect(() => new SignedSquadArtifactService({ ...base, registry: null })).toThrow(
      ArtifactServiceError,
    );
    const invalidCases = [
      { artifactOrigin: 'http://artifacts.example.test' },
      { artifactOrigin: 'https://user:pass@artifacts.example.test' },
      { artifactOrigin: 'https://artifacts.example.test/private' },
      { signingPrivateKey: 'not-a-private-key' },
      { signingPrivateKey: crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey },
      { keyId: 'Invalid Key' },
      { descriptorTtlMs: 999 },
      { descriptorTtlMs: 16 * 60 * 1000 },
    ];
    for (const overrides of invalidCases) {
      expect(() => new SignedSquadArtifactService({ ...base, ...overrides })).toThrow(
        ArtifactServiceError,
      );
    }
  });
});
