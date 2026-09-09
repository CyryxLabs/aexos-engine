'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  ArtifactVerificationError,
  hashMachineId,
  verifySignedArtifactDescriptor,
  verifyArtifactPayload,
  downloadAndVerifySignedArtifact,
} = require('../../../packages/installer/src/licensing/paid-squad-artifact');
const {
  artifactKeys,
  DEFAULT_NOW,
  DEFAULT_MACHINE_ID,
  createTrustStore,
  signDescriptor,
  expectedBindings,
} = require('../../helpers/paid-squad-artifact-fixture');

function expectCode(fn, code) {
  expect(fn).toThrow(expect.objectContaining({ code }));
}

describe('signed paid squad artifact verifier', () => {
  test('accepts an exact, active, pinned Ed25519 descriptor', () => {
    const descriptor = signDescriptor();
    const verified = verifySignedArtifactDescriptor(descriptor, expectedBindings(), {
      now: DEFAULT_NOW,
      trustStore: createTrustStore(),
    });
    expect(verified).toEqual(descriptor);
    expect(Object.isFrozen(verified)).toBe(true);
  });

  test('keeps runtime fields aligned with the versioned JSON schema', () => {
    const schema = JSON.parse(
      fs.readFileSync(
        path.resolve('.aexos-core/schemas/paid-squad-artifact-v1.schema.json'),
        'utf8',
      ),
    );
    expect(schema.additionalProperties).toBe(false);
    expect(new Set(schema.required)).toEqual(
      require('../../../packages/installer/src/licensing/paid-squad-artifact')._testing
        .DESCRIPTOR_FIELDS,
    );
  });

  test('rejects a short machine identity and an oversized artifact URL', () => {
    expectCode(() => hashMachineId('short'), 'INVALID_MACHINE_ID');
    const descriptor = {
      ...signDescriptor(),
      artifactUrl: `https://artifacts.example.test/${'x'.repeat(2100)}`,
    };
    expectCode(
      () =>
        verifySignedArtifactDescriptor(descriptor, expectedBindings(), {
          now: DEFAULT_NOW,
          trustStore: createTrustStore(),
        }),
      'INVALID_ARTIFACT_URL',
    );
  });

  test.each([
    ['expired descriptor', { expiresAt: '2026-09-04T15:59:59.000Z' }, 'ARTIFACT_AUTHORITY_EXPIRED'],
    ['wrong product', { product: 'another-product' }, 'WRONG_PRODUCT'],
    ['wrong machine', { machineId: 'different-machine-0123456789' }, 'MACHINE_MISMATCH'],
  ])('rejects %s', (_name, overrides, code) => {
    const descriptor = signDescriptor(overrides);
    expectCode(
      () =>
        verifySignedArtifactDescriptor(descriptor, expectedBindings(), {
          now: DEFAULT_NOW,
          trustStore: createTrustStore(),
        }),
      code,
    );
  });

  test('rejects descriptor modification after signing', () => {
    const descriptor = { ...signDescriptor(), artifactUrl: 'https://evil.example.test/file.tgz' };
    expectCode(
      () =>
        verifySignedArtifactDescriptor(descriptor, expectedBindings(), {
          now: DEFAULT_NOW,
          trustStore: createTrustStore(),
        }),
      'INVALID_ARTIFACT_SIGNATURE',
    );
  });

  test('rejects unknown and substituted signing keys', () => {
    const descriptor = signDescriptor();
    expectCode(
      () =>
        verifySignedArtifactDescriptor(descriptor, expectedBindings(), {
          now: DEFAULT_NOW,
          trustStore: { ...createTrustStore(), keys: [] },
        }),
      'UNKNOWN_SIGNING_KEY',
    );

    const substitute = crypto.generateKeyPairSync('ed25519');
    expectCode(
      () =>
        verifySignedArtifactDescriptor(descriptor, expectedBindings(), {
          now: DEFAULT_NOW,
          trustStore: createTrustStore({ publicKey: substitute.publicKey }),
        }),
      'INVALID_ARTIFACT_SIGNATURE',
    );
  });

  test('rejects unknown fields and an unpinned default trust store', () => {
    const descriptor = { ...signDescriptor(), unexpected: true };
    expectCode(
      () => verifySignedArtifactDescriptor(descriptor, expectedBindings(), { now: DEFAULT_NOW }),
      'INVALID_DESCRIPTOR_SCHEMA',
    );
    expectCode(
      () =>
        verifySignedArtifactDescriptor(signDescriptor(), expectedBindings(), {
          now: DEFAULT_NOW,
        }),
      'UNKNOWN_SIGNING_KEY',
    );
  });

  test.each([
    ['null descriptor', null, 'INVALID_DESCRIPTOR_SCHEMA'],
    ['array descriptor', [], 'INVALID_DESCRIPTOR_SCHEMA'],
    ['unsupported schema', signDescriptor({}), 'INVALID_DESCRIPTOR_SCHEMA'],
  ])('rejects malformed shape: %s', (_name, candidate, code) => {
    const descriptor =
      _name === 'unsupported schema'
        ? { ...candidate, schema: 'aexos.squad-artifact/v2' }
        : candidate;
    expectCode(
      () =>
        verifySignedArtifactDescriptor(descriptor, expectedBindings(), {
          now: DEFAULT_NOW,
          trustStore: createTrustStore(),
        }),
      code,
    );
  });

  test.each([
    ['plan', { plan: 'free' }],
    ['key identifier', { keyId: 'Invalid Key' }],
    ['semantic version', { version: 'release' }],
    ['subject hash', { subjectIdHash: 'A'.repeat(64) }],
    ['entitlement identifier', { entitlementId: '../entitlement' }],
    ['package', { package: '../../../private' }],
    ['platform', { platform: 'solaris' }],
    ['release channel', { releaseChannel: 'production' }],
    ['format', { format: 'zip' }],
    ['size', { sizeBytes: 0 }],
    ['revocation epoch', { revocationEpoch: -1 }],
    ['signature encoding', { signature: '!' }],
    ['URL protocol', { artifactUrl: 'file:///private/artifact.tgz' }],
    ['URL credentials', { artifactUrl: 'https://user:pass@example.test/a.tgz' }],
    ['URL syntax', { artifactUrl: 'not a url' }],
    ['timestamp syntax', { issuedAt: 'yesterday' }],
    ['timestamp value', { issuedAt: '2026-99-99T99:99:99.999Z' }],
  ])('rejects invalid descriptor %s', (_name, override) => {
    const descriptor = { ...signDescriptor(), ...override };
    expectCode(
      () =>
        verifySignedArtifactDescriptor(descriptor, expectedBindings(), {
          now: DEFAULT_NOW,
          trustStore: createTrustStore(),
        }),
      _name.startsWith('URL') ? 'INVALID_ARTIFACT_URL' : 'INVALID_DESCRIPTOR_SCHEMA',
    );
  });

  test('rejects invalid, inactive, expired and non-Ed25519 trust roots', () => {
    const descriptor = signDescriptor();
    const stores = [
      [{}, 'INVALID_TRUST_STORE'],
      [createTrustStore({ status: 'retired' }), 'UNTRUSTED_SIGNING_KEY'],
      [
        createTrustStore({ notAfter: '2026-09-04T15:59:59.000Z' }),
        'UNTRUSTED_SIGNING_KEY',
      ],
      [
        {
          ...createTrustStore(),
          keys: [{ ...createTrustStore().keys[0], publicKeyPem: 'not a public key' }],
        },
        'INVALID_TRUST_STORE',
      ],
      [
        createTrustStore({ publicKey: crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey }),
        'INVALID_TRUST_STORE',
      ],
    ];
    for (const [trustStore, code] of stores) {
      expectCode(
        () =>
          verifySignedArtifactDescriptor(descriptor, expectedBindings(), {
            now: DEFAULT_NOW,
            trustStore,
          }),
        code,
      );
    }
  });

  test.each([
    ['missing expected request', null, 'MISSING_EXPECTED_BINDINGS'],
    [
      'squad binding',
      expectedBindings({ squadId: 'sales' }),
      'ARTIFACT_BINDING_MISMATCH',
    ],
    [
      'platform binding',
      expectedBindings({ platform: 'linux' }),
      null,
    ],
    [
      'subject binding',
      { ...expectedBindings(), subjectIdHash: 'f'.repeat(64) },
      'SUBJECT_MISMATCH',
    ],
    [
      'entitlement binding',
      { ...expectedBindings(), entitlementId: 'another-entitlement' },
      'ENTITLEMENT_MISMATCH',
    ],
    ['plan binding', { ...expectedBindings(), plan: 'team' }, 'PLAN_MISMATCH'],
    [
      'revocation freshness',
      { ...expectedBindings(), revocationEpoch: 8 },
      'REVOCATION_EPOCH_MISMATCH',
    ],
  ])('enforces %s', (_name, expected, code) => {
    const descriptor =
      _name === 'platform binding' ? signDescriptor({ platform: 'darwin' }) : signDescriptor();
    if (code === null) {
      expectCode(
        () =>
          verifySignedArtifactDescriptor(descriptor, expected, {
            now: DEFAULT_NOW,
            trustStore: createTrustStore(),
          }),
        'ARTIFACT_BINDING_MISMATCH',
      );
      return;
    }
    expectCode(
      () =>
        verifySignedArtifactDescriptor(descriptor, expected, {
          now: DEFAULT_NOW,
          trustStore: createTrustStore(),
        }),
      code,
    );
  });

  test.each([
    [
      'future issuance',
      { issuedAt: '2026-09-04T16:06:00.000Z', expiresAt: '2026-09-04T16:10:00.000Z' },
      'DESCRIPTOR_NOT_YET_VALID',
    ],
    [
      'excessive TTL',
      { expiresAt: '2026-09-04T16:16:00.000Z' },
      'INVALID_DESCRIPTOR_LIFETIME',
    ],
    [
      'expiry after entitlement',
      {
        expiresAt: '2026-09-04T16:10:00.000Z',
        entitlementExpiresAt: '2026-09-04T16:05:00.000Z',
      },
      'INVALID_DESCRIPTOR_LIFETIME',
    ],
  ])('rejects %s', (_name, override, code) => {
    expectCode(
      () =>
        verifySignedArtifactDescriptor(signDescriptor(override), expectedBindings(), {
          now: DEFAULT_NOW,
          trustStore: createTrustStore(),
        }),
      code,
    );
  });

  test('rejects tampered payload bytes', () => {
    const payload = Buffer.from('original artifact');
    const descriptor = signDescriptor({ payload });
    expectCode(
      () => verifyArtifactPayload(Buffer.from('tampered artifact'), descriptor),
      'ARTIFACT_DIGEST_MISMATCH',
    );
  });

  test('rejects payload size and configured maximum mismatches', () => {
    const payload = Buffer.from('original artifact');
    const descriptor = signDescriptor({ payload });
    expectCode(
      () => verifyArtifactPayload(Buffer.from('short'), descriptor),
      'ARTIFACT_SIZE_MISMATCH',
    );
    expectCode(
      () => verifyArtifactPayload(payload, descriptor, { maxBytes: payload.length - 1 }),
      'ARTIFACT_SIZE_MISMATCH',
    );
  });

  test('verifies descriptor before download and sends no authorization header to origin', async () => {
    const payload = Buffer.from('downloaded paid squad');
    const descriptor = signDescriptor({ payload });
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => String(payload.length) },
      body: null,
      arrayBuffer: async () =>
        payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength),
    });
    const result = await downloadAndVerifySignedArtifact(descriptor, expectedBindings(), {
      now: DEFAULT_NOW,
      trustStore: createTrustStore(),
      fetchImpl,
    });
    expect(result.payload).toEqual(payload);
    expect(fetchImpl).toHaveBeenCalledWith(
      descriptor.artifactUrl,
      expect.objectContaining({ redirect: 'error' }),
    );
    expect(fetchImpl.mock.calls[0][1].headers).toBeUndefined();

    fetchImpl.mockClear();
    await expect(
      downloadAndVerifySignedArtifact(
        { ...descriptor, signature: artifactKeys.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString() },
        expectedBindings({ machineId: DEFAULT_MACHINE_ID }),
        { now: DEFAULT_NOW, trustStore: createTrustStore(), fetchImpl },
      ),
    ).rejects.toBeInstanceOf(ArtifactVerificationError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test.each([
    [
      'missing transport',
      () => ({ fetchImpl: 'unavailable' }),
      'FETCH_UNAVAILABLE',
    ],
    [
      'declared artifact over limit',
      () => ({ maxBytes: 1, fetchImpl: jest.fn() }),
      'ARTIFACT_TOO_LARGE',
    ],
    [
      'HTTP failure',
      () => ({ fetchImpl: jest.fn().mockResolvedValue({ ok: false, status: 503 }) }),
      'ARTIFACT_DOWNLOAD_FAILED',
    ],
    [
      'oversized content length',
      () => ({
        maxBytes: 100,
        fetchImpl: jest.fn().mockResolvedValue({
          ok: true,
          headers: { get: () => '101' },
          body: null,
        }),
      }),
      'ARTIFACT_TOO_LARGE',
    ],
    [
      'oversized streamed body',
      () => ({
        maxBytes: 100,
        fetchImpl: jest.fn().mockResolvedValue({
          ok: true,
          headers: { get: () => null },
          body: (async function* body() {
            yield Buffer.alloc(101);
          })(),
        }),
      }),
      'ARTIFACT_TOO_LARGE',
    ],
    [
      'oversized buffered body',
      () => ({
        maxBytes: 100,
        fetchImpl: jest.fn().mockResolvedValue({
          ok: true,
          headers: { get: () => null },
          body: null,
          arrayBuffer: async () => Buffer.alloc(101),
        }),
      }),
      'ARTIFACT_TOO_LARGE',
    ],
    [
      'aborted download',
      () => ({
        fetchImpl: jest.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })),
      }),
      'ARTIFACT_DOWNLOAD_TIMEOUT',
    ],
  ])('fails closed on %s', async (_name, makeOptions, code) => {
    const payload = Buffer.from('download fixture');
    const descriptor = signDescriptor({ payload });
    await expect(
      downloadAndVerifySignedArtifact(descriptor, expectedBindings(), {
        now: DEFAULT_NOW,
        trustStore: createTrustStore(),
        ...makeOptions(),
      }),
    ).rejects.toMatchObject({ code });
  });
});
