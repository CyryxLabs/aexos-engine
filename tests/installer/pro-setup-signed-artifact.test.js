'use strict';

const fs = require('fs');
const fsExtra = require('fs-extra');
const os = require('os');
const path = require('path');
const proSetup = require('../../packages/installer/src/wizard/pro-setup');
const { createTrustStore } = require('../helpers/paid-squad-artifact-fixture');

describe('Pro artifact acquisition signed-descriptor gate', () => {
  let originalGetArtifactUrl;
  let originalFetch;

  beforeEach(() => {
    originalGetArtifactUrl =
      proSetup._testing.InlineLicenseClient.prototype.getProArtifactUrl;
    originalFetch = global.fetch;
  });

  afterEach(() => {
    proSetup._testing.InlineLicenseClient.prototype.getProArtifactUrl =
      originalGetArtifactUrl;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('rejects the former unsigned descriptor before download and removes its temp directory', async () => {
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-pro-signed-gate-target-'));
    const originalMkdtemp = fsExtra.mkdtemp.bind(fsExtra);
    let artifactTempRoot;
    jest.spyOn(fsExtra, 'mkdtemp').mockImplementation(async (...args) => {
      artifactTempRoot = await originalMkdtemp(...args);
      return artifactTempRoot;
    });
    proSetup._testing.InlineLicenseClient.prototype.getProArtifactUrl = jest
      .fn()
      .mockResolvedValue({
        package: '@aexos/pro',
        version: proSetup._testing.DEFAULT_PRO_ARTIFACT_VERSION,
        artifactUrl: 'https://artifacts.example.test/pro.tgz',
        sha256: 'a'.repeat(64),
        sizeBytes: 123,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      });
    global.fetch = jest.fn();

    try {
      const result = await proSetup._testing.acquireProArtifactSourceDir(
        target,
        { accessToken: 'access-token', machineId: 'm'.repeat(64) },
        {
          proArtifactVersion: proSetup._testing.DEFAULT_PRO_ARTIFACT_VERSION,
          artifactTrustStore: createTrustStore(),
        },
      );
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/descriptor/i);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(artifactTempRoot).toBeTruthy();
      expect(fs.existsSync(artifactTempRoot)).toBe(false);
    } finally {
      fs.rmSync(target, { recursive: true, force: true });
    }
  });
});
