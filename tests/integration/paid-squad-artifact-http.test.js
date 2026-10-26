'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const {
  SignedSquadArtifactService,
  createArtifactHttpHandler,
} = require('../../pro/artifact-service');
const {
  downloadAndVerifySignedArtifact,
  _testing: { sha256 },
} = require('../../packages/installer/src/licensing/paid-squad-artifact');
const {
  _testing: { InlineLicenseClient },
} = require('../../packages/installer/src/wizard/pro-setup');
const {
  artifactKeys,
  DEFAULT_NOW,
  DEFAULT_MACHINE_ID,
  createTrustStore,
  expectedBindings,
  signEntitlement,
  verifyTestEntitlement,
} = require('../helpers/paid-squad-artifact-fixture');

describe('paid squad artifact real HTTP boundary', () => {
  let root;
  let server;
  let origin;
  let artifact;

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-paid-artifact-http-'));
    artifact = Buffer.from('real local HTTP paid artifact');
    fs.writeFileSync(path.join(root, 'marketing.tgz'), artifact);
    const state = { handler: null };
    server = http.createServer((request, response) => state.handler(request, response));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
    const entitlement = signEntitlement();
    const service = new SignedSquadArtifactService({
      artifactRoot: root,
      artifactOrigin: origin,
      signingPrivateKey: artifactKeys.privateKey,
      keyId: 'artifact-test-v1',
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
          filePath: 'marketing.tgz',
          sizeBytes: artifact.length,
          sha256: sha256(artifact),
        },
      ],
      authenticate: async ({ authorization }) =>
        authorization === 'Bearer live-test-token' ? { id: 'user-1' } : null,
      resolveEntitlement: async () => ({
        state: 'ACTIVE',
        allowed: true,
        source: 'remote',
        subjectId: 'user-1',
        revocationEpoch: entitlement.revocationEpoch,
        entitlement,
      }),
      verifyEntitlement: async (candidate) => verifyTestEntitlement(candidate),
      audit: async () => {},
      now: () => new Date(DEFAULT_NOW),
    });
    state.handler = createArtifactHttpHandler(service);
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('authenticates descriptor issuance and downloads verified bytes without bearer forwarding', async () => {
    const descriptor = await new InlineLicenseClient(origin).getProArtifactUrl(
      'live-test-token',
      {
        product: 'aexos',
        squadId: 'marketing',
        package: '@aexos/marketing',
        version: '1.2.3',
        platform: 'win32',
        releaseChannel: 'stable',
        format: 'tgz',
        machineId: DEFAULT_MACHINE_ID,
      },
    );
    const downloaded = await downloadAndVerifySignedArtifact(
      descriptor,
      expectedBindings(),
      { trustStore: createTrustStore(), now: DEFAULT_NOW },
    );
    expect(downloaded.payload).toEqual(artifact);
  });

  test('fails closed when descriptor authentication is absent', async () => {
    const response = await fetch(`${origin}/api/v1/pro/artifact-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product: 'aexos',
        squadId: 'marketing',
        package: '@aexos/marketing',
        version: '1.2.3',
        platform: 'win32',
        releaseChannel: 'stable',
        format: 'tgz',
        machineId: DEFAULT_MACHINE_ID,
      }),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.' },
    });
  });

  test('returns bounded structured errors for malformed and unknown requests', async () => {
    const invalidJson = await fetch(`${origin}/api/v1/pro/artifact-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid',
    });
    expect(invalidJson.status).toBe(400);
    expect((await invalidJson.json()).error.code).toBe('INVALID_JSON');

    const oversized = await fetch(`${origin}/api/v1/pro/artifact-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ padding: 'x'.repeat(17 * 1024) }),
    });
    expect(oversized.status).toBe(413);
    expect((await oversized.json()).error.code).toBe('REQUEST_TOO_LARGE');

    const missing = await fetch(`${origin}/unknown`);
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe('NOT_FOUND');

    const malformedTicket = await fetch(`${origin}/v1/artifacts/ticket/%E0%A4%A`);
    expect(malformedTicket.status).toBe(404);
    expect((await malformedTicket.json()).error.code).toBe('ARTIFACT_TICKET_INVALID');
  });

  test('rejects construction of an HTTP adapter without the governed service', () => {
    expect(() => createArtifactHttpHandler({})).toThrow('Artifact service is required.');
  });
});
