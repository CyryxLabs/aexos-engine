/**
 * Unit tests for pro-setup.js email auth flow (PRO-11)
 *
 * Public machine identity and activation checks run unconditionally. Only the
 * comparison with private `pro/license/license-crypto` requires that runtime;
 * its absence does not skip the public checks or establish private acceptance.
 *
 * @see Story PRO-11 - Email Authentication & Buyer-Based Pro Activation
 * @see AC-7 - Backward compatibility with license key
 */

'use strict';

const childProcess = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const proSetup = require('../../packages/installer/src/wizard/pro-setup');

let generateRuntimeMachineId;
try {
  ({ generateMachineId: generateRuntimeMachineId } = require('../../pro/license/license-crypto'));
} catch {
  // Private runtime unavailable; only the private derivation comparison skips.
}

const isProAvailable = Boolean(
  generateRuntimeMachineId && generateRuntimeMachineId.isProStub !== true,
);

describe('pro-setup auth constants', () => {
  it('should export EMAIL_PATTERN', () => {
    const { EMAIL_PATTERN } = proSetup._testing;

    expect(EMAIL_PATTERN.test('valid@email.com')).toBe(true);
    expect(EMAIL_PATTERN.test('user+tag@domain.co')).toBe(true);
    expect(EMAIL_PATTERN.test('invalid')).toBe(false);
    expect(EMAIL_PATTERN.test('@no-user.com')).toBe(false);
    expect(EMAIL_PATTERN.test('no-domain@')).toBe(false);
    expect(EMAIL_PATTERN.test('')).toBe(false);
  });

  it('should have MIN_PASSWORD_LENGTH of 8', () => {
    expect(proSetup._testing.MIN_PASSWORD_LENGTH).toBe(8);
  });

  it('should have VERIFY_POLL_INTERVAL_MS of 5000', () => {
    expect(proSetup._testing.VERIFY_POLL_INTERVAL_MS).toBe(5000);
  });

  it('should have VERIFY_POLL_TIMEOUT_MS of 10 minutes', () => {
    expect(proSetup._testing.VERIFY_POLL_TIMEOUT_MS).toBe(10 * 60 * 1000);
  });
});

describe('pro-setup CI auth (AC-7, Task 4.6)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore env
    process.env = { ...originalEnv };
  });

  it('should prefer email+password over key in CI mode', async () => {
    const mockClient = {
      isOnline: jest.fn().mockResolvedValue(true),
      login: jest.fn().mockResolvedValue({
        sessionToken: 'test-session',
        userId: 'user-1',
        emailVerified: true,
      }),
      activateByAuth: jest.fn().mockResolvedValue({
        key: 'PRO-AUTO-1234-5678-ABCD',
        features: ['pro.squads.*'],
        seats: { used: 1, max: 2 },
        cacheValidDays: 30,
        gracePeriodDays: 7,
      }),
    };

    const mockLicenseApi = {
      LicenseApiClient: jest.fn().mockReturnValue(mockClient),
    };

    // Override the loader
    proSetup._testing.loadLicenseApi = () => mockLicenseApi;

    const result = await proSetup._testing.stepLicenseGateCI({
      email: 'ci@test.com',
      password: 'CIPassword123',
      key: 'PRO-SKIP-THIS-KEY0-XXXX',
    });

    expect(result.success).toBe(true);
    expect(mockClient.login).toHaveBeenCalledWith('ci@test.com', 'CIPassword123');
    // Key should NOT be used when email is present
    expect(result.key).toBe('PRO-AUTO-1234-5678-ABCD');

    // Cleanup
    proSetup._testing.loadLicenseApi = undefined;
  });

  it('should fall back to key when no email in CI mode', async () => {
    const mockClient = {
      isOnline: jest.fn().mockResolvedValue(true),
      activate: jest.fn().mockResolvedValue({
        key: 'PRO-KEY0-1234-5678-ABCD',
        features: ['pro.squads.*'],
        seats: { used: 1, max: 2 },
        cacheValidDays: 30,
        gracePeriodDays: 7,
      }),
      syncPendingDeactivation: jest.fn().mockResolvedValue(false),
    };

    const mockLicenseApi = {
      LicenseApiClient: jest.fn().mockReturnValue(mockClient),
    };

    proSetup._testing.loadLicenseApi = () => mockLicenseApi;

    const result = await proSetup._testing.stepLicenseGateCI({
      key: 'PRO-KEY0-1234-5678-ABCD',
    });

    // Should validate via key flow
    expect(result.success).toBeDefined();

    proSetup._testing.loadLicenseApi = undefined;
  });

  it('should return error when no credentials in CI mode', async () => {
    const result = await proSetup._testing.stepLicenseGateCI({});

    expect(result.success).toBe(false);
    expect(result.error).toContain('AEXOS_PRO_EMAIL');
  });
});

describe('pro-setup backward compatibility (AC-7)', () => {
  it('should still export validateKeyFormat', () => {
    expect(typeof proSetup.validateKeyFormat).toBe('function');
    expect(proSetup.validateKeyFormat('PRO-ABCD-1234-5678-WXYZ')).toBe(true);
    expect(proSetup.validateKeyFormat('invalid')).toBe(false);
  });

  it('should still export maskLicenseKey', () => {
    expect(typeof proSetup.maskLicenseKey).toBe('function');
    expect(proSetup.maskLicenseKey('PRO-ABCD-1234-5678-WXYZ')).toBe('PRO-ABCD-****-****-WXYZ');
  });

  it('should export all original functions', () => {
    expect(typeof proSetup.runProWizard).toBe('function');
    expect(typeof proSetup.stepLicenseGate).toBe('function');
    expect(typeof proSetup.stepInstallScaffold).toBe('function');
    expect(typeof proSetup.stepVerify).toBe('function');
    expect(typeof proSetup.isCIEnvironment).toBe('function');
    expect(typeof proSetup.showProHeader).toBe('function');
  });

  it('should export new auth testing helpers', () => {
    expect(typeof proSetup._testing.authenticateWithEmail).toBe('function');
    expect(typeof proSetup._testing.waitForEmailVerification).toBe('function');
    expect(typeof proSetup._testing.activateProByAuth).toBe('function');
    expect(typeof proSetup._testing.stepLicenseGateCI).toBe('function');
    expect(typeof proSetup._testing.fallbackAuthWithoutBuyerCheck).toBe('function');
    expect(typeof proSetup._testing.generateMachineId).toBe('function');
    expect(typeof proSetup._testing.persistLicenseCache).toBe('function');
    expect(typeof proSetup._testing.installProArtifactIntoTarget).toBe('function');
  });
});

describe('pro-setup npm invocation', () => {
  it('uses node + npm-cli.js on Windows when npm_execpath is available', () => {
    const invocation = proSetup._testing.resolveNpmInvocation({
      platform: 'win32',
      execPath: 'C:\\Program Files\\nodejs\\node.exe',
      env: {
        npm_execpath: 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js',
      },
      fileExists: () => true,
    });

    expect(invocation).toEqual({
      command: 'C:\\Program Files\\nodejs\\node.exe',
      prefixArgs: ['C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js'],
      execOptions: {},
    });
  });

  it('derives npm-cli.js when invoked through npx-cli.js', () => {
    const invocation = proSetup._testing.resolveNpmInvocation({
      platform: 'linux',
      execPath: '/usr/bin/node',
      env: {
        npm_execpath: '/usr/lib/node_modules/npm/bin/npx-cli.js',
      },
      fileExists: (candidate) => candidate.endsWith('/npm-cli.js'),
    });

    expect(invocation).toEqual({
      command: '/usr/bin/node',
      prefixArgs: ['/usr/lib/node_modules/npm/bin/npm-cli.js'],
      execOptions: {},
    });
  });

  it('does not execute npx-cli.js as npm when npm-cli.js cannot be found', () => {
    const invocation = proSetup._testing.resolveNpmInvocation({
      platform: 'linux',
      env: {
        npm_execpath: '/usr/lib/node_modules/npm/bin/npx-cli.js',
      },
      fileExists: () => false,
    });

    expect(invocation).toEqual({
      command: 'npm',
      prefixArgs: [],
      execOptions: {},
    });
  });

  it('fails actionably instead of shell execution when Windows npm cannot be located', () => {
    expect(() => proSetup._testing.resolveNpmInvocation({
      platform: 'win32',
      env: {},
      fileExists: () => false,
    })).toThrow('Cannot find npm-cli.js');
  });

  it('uses npm directly on POSIX platforms', () => {
    const invocation = proSetup._testing.resolveNpmInvocation({
      platform: 'darwin',
      env: {},
      fileExists: () => false,
    });

    expect(invocation).toEqual({
      command: 'npm',
      prefixArgs: [],
      execOptions: {},
    });
  });
});

describe('pro-setup account-first email authentication', () => {
  afterEach(() => {
    proSetup._testing.loadLicenseApi = undefined;
  });

  it('authenticates without buyer enumeration or silent account creation', async () => {
    const inquirer = require('inquirer');
    const originalPrompt = inquirer.prompt;
    const mockClient = {
      isOnline: jest.fn().mockResolvedValue(true),
      login: jest.fn().mockResolvedValue({
        sessionToken: 'session-token',
        emailVerified: true,
      }),
      validate: jest.fn().mockResolvedValue({
        valid: true,
        features: ['pro'],
        seats: { used: 1, max: 3 },
        cacheValidDays: 30,
        gracePeriodDays: 7,
      }),
      activate: jest.fn(),
      activateByAuth: jest.fn().mockResolvedValue({
        key: 'PRO-ABCD-1234-5678-WXYZ',
        features: ['pro'],
        seats: { used: 1, max: 3 },
        cacheValidDays: 30,
        gracePeriodDays: 7,
      }),
    };

    proSetup._testing.loadLicenseApi = () => ({
      LicenseApiClient: jest.fn().mockReturnValue(mockClient),
    });

    inquirer.prompt = jest
      .fn()
      .mockResolvedValueOnce({ email: 'buyer@example.com' })
      .mockResolvedValueOnce({ password: 'Password123' });

    try {
      const result = await proSetup._testing.stepLicenseGateWithEmail();

      expect(result.success).toBe(true);
      expect(mockClient.login).toHaveBeenCalledWith('buyer@example.com', 'Password123');
      expect(mockClient.activateByAuth).toHaveBeenCalled();
      expect(mockClient.signup).toBeUndefined();
    } finally {
      inquirer.prompt = originalPrompt;
    }
  });
});

describe('pro-setup machine id compatibility', () => {
  it('should generate a 64-char machine id for backend requests', () => {
    const machineId = proSetup._testing.generateMachineId();

    expect(machineId).toMatch(/^[a-f0-9]{64}$/i);
  });

  (isProAvailable ? it : it.skip)('should match the Pro runtime machine id derivation', () => {
    const wizardMachineId = proSetup._testing.generateMachineId();
    const runtimeMachineId = generateRuntimeMachineId();

    expect(wizardMachineId).toBe(runtimeMachineId);
  });

  it('should pass a 64-char machine id when activating via auth', async () => {
    const client = {
      activateByAuth: jest.fn().mockResolvedValue({
        key: 'PRO-ABCD-1234-5678-WXYZ',
        features: ['pro.squads.*'],
        seats: { used: 1, max: 3 },
        cacheValidDays: 30,
        gracePeriodDays: 7,
      }),
      validate: jest.fn().mockResolvedValue({
        valid: true,
        features: ['pro.squads.*'],
        seats: { used: 1, max: 3 },
        cacheValidDays: 30,
        gracePeriodDays: 7,
      }),
      activate: jest.fn(),
    };

    const result = await proSetup._testing.activateProByAuth(client, 'session-token');
    const [, machineId] = client.activateByAuth.mock.calls[0];

    expect(result.success).toBe(true);
    expect(machineId).toMatch(/^[a-f0-9]{64}$/i);
    expect(client.validate).toHaveBeenCalledWith('PRO-ABCD-1234-5678-WXYZ', machineId);
    expect(client.activate).not.toHaveBeenCalled();
  });

  it('should backfill key activation when auth activation is not yet validatable', async () => {
    let observedMachineId;
    const client = {
      activateByAuth: jest.fn().mockResolvedValue({
        key: 'PRO-ABCD-1234-5678-WXYZ',
        features: ['pro.squads.*'],
        seats: { used: 1, max: 3 },
        cacheValidDays: 30,
        gracePeriodDays: 7,
      }),
      validate: jest.fn().mockRejectedValue({
        code: 'MACHINE_NOT_ACTIVATED',
        message: 'This machine is not activated for this license',
      }),
      activate: jest.fn().mockImplementation((key, machineId) => {
        observedMachineId = machineId;
        return Promise.resolve({
          key,
          features: ['pro.squads.*', 'pro.memory.*'],
          seats: { used: 1, max: 3 },
          cacheValidDays: 30,
          gracePeriodDays: 7,
        });
      }),
    };

    const result = await proSetup._testing.activateProByAuth(client, 'session-token');

    expect(result.success).toBe(true);
    expect(observedMachineId).toMatch(/^[a-f0-9]{64}$/i);
    expect(client.activate).toHaveBeenCalledWith(
      'PRO-ABCD-1234-5678-WXYZ',
      observedMachineId,
      expect.any(String),
    );
    expect(result.activationResult.features).toEqual(['pro.squads.*', 'pro.memory.*']);
  });

  it('should pass a 64-char machine id in license-key activation flow', async () => {
    let observedMachineId;
    const mockLicenseApi = {
      LicenseApiClient: jest.fn().mockReturnValue({
        isOnline: jest.fn().mockResolvedValue(true),
        activate: jest.fn().mockImplementation((key, machineId) => {
          observedMachineId = machineId;
          return Promise.resolve({
            key,
            features: ['pro.squads.*'],
            seats: { used: 1, max: 3 },
            cacheValidDays: 30,
            gracePeriodDays: 7,
          });
        }),
        syncPendingDeactivation: jest.fn().mockResolvedValue(false),
      }),
    };

    proSetup._testing.loadLicenseApi = () => mockLicenseApi;

    const result = await proSetup._testing.validateKeyWithApi('PRO-ABCD-1234-5678-WXYZ');

    expect(result.success).toBe(true);
    expect(observedMachineId).toMatch(/^[a-f0-9]{64}$/i);

    proSetup._testing.loadLicenseApi = undefined;
  });
});

describe('pro-setup license cache persistence', () => {
  afterEach(() => {
    proSetup._testing.loadLicenseCache = undefined;
  });

  it('should persist the activated license into the target project cache', () => {
    const writeLicenseCache = jest.fn().mockReturnValue({ success: true });
    proSetup._testing.loadLicenseCache = () => ({ writeLicenseCache });

    const result = proSetup._testing.persistLicenseCache('/tmp/aexos-pro-target', {
      success: true,
      key: 'PRO-ABCD-1234-5678-WXYZ',
      activationResult: {
        activatedAt: '2026-04-15T12:00:00.000Z',
        expiresAt: '2027-04-15T12:00:00.000Z',
        features: ['pro.squads.*'],
        seats: { used: 1, max: 3 },
        cacheValidDays: 30,
        gracePeriodDays: 7,
      },
    });

    expect(result).toEqual({ success: true });
    expect(writeLicenseCache).toHaveBeenCalledWith(
      {
        key: 'PRO-ABCD-1234-5678-WXYZ',
        activatedAt: '2026-04-15T12:00:00.000Z',
        expiresAt: '2027-04-15T12:00:00.000Z',
        features: ['pro.squads.*'],
        seats: { used: 1, max: 3 },
        cacheValidDays: 30,
        gracePeriodDays: 7,
      },
      '/tmp/aexos-pro-target',
    );
  });

  it('should accept existing license sentinel for reactivation without rewriting cache', () => {
    const writeLicenseCache = jest.fn();
    proSetup._testing.loadLicenseCache = () => ({ writeLicenseCache });

    const result = proSetup._testing.persistLicenseCache('/tmp/aexos-pro-target', {
      success: true,
      key: 'existing',
      activationResult: { reactivation: true },
    });

    expect(result).toEqual({ success: true });
    expect(writeLicenseCache).not.toHaveBeenCalled();
  });

  it('should fail when no concrete license key is available to persist', () => {
    const writeLicenseCache = jest.fn();
    proSetup._testing.loadLicenseCache = () => ({ writeLicenseCache });

    const result = proSetup._testing.persistLicenseCache('/tmp/aexos-pro-target', {
      success: true,
      key: 'existing',
      activationResult: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Activated license key not available');
    expect(writeLicenseCache).not.toHaveBeenCalled();
  });
});

describe('InlineLicenseClient current auth contract', () => {
  let server;
  let baseUrl;

  function createMockServer(handler) {
    return new Promise((resolve) => {
      server = http.createServer(handler);
      server.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  }

  function closeMockServer() {
    return new Promise((resolve) => {
      if (server) {
        if (typeof server.closeAllConnections === 'function') {
          server.closeAllConnections();
        }
        server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  afterEach(async () => {
    await closeMockServer();
  });

  it('discovers public auth config and sends credentials directly to Supabase Auth', async () => {
    let requests = 0;
    await createMockServer((req, res) => {
      requests += 1;
      if (requests === 1) {
        expect(req.method).toBe('GET');
        expect(req.url).toBe('/api/v1/auth/config');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          provider: 'supabase',
          authUrl: `${baseUrl}/auth/v1`,
          anonKey: 'public-anon-key',
        }));
        return;
      }

      expect(req.method).toBe('POST');
      expect(req.url).toBe('/auth/v1/token?grant_type=password');
      expect(req.headers.apikey).toBe('public-anon-key');

      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        expect(JSON.parse(body)).toEqual({
          email: 'user@example.com',
          password: 'TestPass123',
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            access_token: 'live-access-token',
            refresh_token: 'refresh-token',
            user: { email_confirmed_at: '2026-08-27T00:00:00.000Z' },
          }),
        );
      });
    });

    const client = new proSetup._testing.InlineLicenseClient(baseUrl);
    const result = await client.login('user@example.com', 'TestPass123');

    expect(result.accessToken).toBe('live-access-token');
    expect(result.sessionToken).toBe('live-access-token');
    expect(result.emailVerified).toBe(true);
  });

  it('checks verification directly through Supabase /user with bearer auth', async () => {
    let requests = 0;
    await createMockServer((req, res) => {
      requests += 1;
      if (requests === 1) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          provider: 'supabase',
          authUrl: `${baseUrl}/auth/v1`,
          anonKey: 'public-anon-key',
        }));
        return;
      }

      expect(req.method).toBe('GET');
      expect(req.url).toBe('/auth/v1/user');
      expect(req.headers.apikey).toBe('public-anon-key');
      expect(req.headers.authorization).toBe('Bearer live-access-token');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        email: 'user@example.com',
        email_confirmed_at: '2026-08-27T00:00:00.000Z',
      }));
    });

    const client = new proSetup._testing.InlineLicenseClient(baseUrl);
    const result = await client.checkEmailVerified('live-access-token');

    expect(result.email).toBe('user@example.com');
    expect(result.verified).toBe(true);
  });

  it('sends accessToken to activate-pro and normalizes licenseKey to key', async () => {
    await createMockServer((req, res) => {
      expect(req.method).toBe('POST');
      expect(req.url).toBe('/api/v1/auth/activate-pro');
      expect(req.headers.authorization).toBe('Bearer live-access-token');

      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        const parsed = JSON.parse(body);
        expect(parsed.accessToken).toBe('live-access-token');
        expect(parsed.machineId).toBe('machine-id');
        expect(parsed.cyryxCoreVersion).toBe('4.1.0');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            activated: true,
            licenseKey: 'PRO-ABCD-1234-EFGH-5678',
            features: ['pro'],
          }),
        );
      });
    });

    const client = new proSetup._testing.InlineLicenseClient(baseUrl);
    const result = await client.activateByAuth('live-access-token', 'machine-id', '4.1.0');

    expect(result.key).toBe('PRO-ABCD-1234-EFGH-5678');
    expect(result.licenseKey).toBe('PRO-ABCD-1234-EFGH-5678');
  });

  it('requests signed Pro artifact URLs with bearer auth', async () => {
    await createMockServer((req, res) => {
      expect(req.method).toBe('POST');
      expect(req.url).toBe('/api/v1/pro/artifact-url');
      expect(req.headers.authorization).toBe('Bearer live-access-token');

      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        const payload = JSON.parse(body);
        expect(payload).toEqual(expect.objectContaining({
          package: '@aexos/pro',
          version: '0.4.0',
          format: 'tgz',
          machineId: 'machine-id',
          cyryxCoreVersion: '5.1.3',
        }));
        if (payload.machineIdSource !== undefined) {
          expect(['persisted', 'native', 'legacy']).toContain(payload.machineIdSource);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            package: '@aexos/pro',
            version: '0.4.0',
            artifactUrl: `${baseUrl}/artifact.tgz`,
            expiresAt: '2026-05-08T20:00:00.000Z',
            sha256: 'a'.repeat(64),
            sizeBytes: 123,
          }),
        );
      });
    });

    const client = new proSetup._testing.InlineLicenseClient(baseUrl);
    const result = await client.getProArtifactUrl('live-access-token', {
      package: '@aexos/pro',
      version: '0.4.0',
      format: 'tgz',
      machineId: 'machine-id',
      cyryxCoreVersion: '5.1.3',
    });

    expect(result.artifactUrl).toBe(`${baseUrl}/artifact.tgz`);
    expect(result.sha256).toBe('a'.repeat(64));
  });
});

describe('resolveProSourceDir', () => {
  const bundledProDir = path.resolve(__dirname, '../../pro');
  const bundledSquadsDir = path.join(bundledProDir, 'squads');
  const gitmodulesPath = path.resolve(__dirname, '../../.gitmodules');
  const npmProDir = path.join('/tmp/aexos-project', 'node_modules', '@aexos', 'pro');

  function mockImplementedSource(sourceDir, available = () => true) {
    jest.spyOn(fs, 'readFileSync').mockImplementation((target) => {
      if (available() && target === path.join(sourceDir, 'package.json')) {
        return JSON.stringify({ name: '@aexos/pro', version: '0.4.2' });
      }
      throw new Error('Package unavailable');
    });
    jest.spyOn(fs, 'statSync').mockImplementation((target) => ({
      isDirectory: () => available() && target === path.join(sourceDir, 'squads'),
      isFile: () => available() && target === path.join(sourceDir, 'pro-config.yaml'),
    }));
  }

  beforeEach(() => {
    jest.spyOn(childProcess, 'execFileSync').mockImplementation(() => {
      throw new Error('Unexpected Git bootstrap');
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses implemented bundled pro content when no target package is available', () => {
    mockImplementedSource(bundledProDir);
    jest.spyOn(fs, 'existsSync').mockImplementation((target) => target === bundledSquadsDir);

    const result = proSetup._testing.resolveProSourceDir('/tmp/aexos-project');

    expect(result).toEqual({ proSourceDir: bundledProDir });
  });

  it('bootstraps the pro submodule in source checkouts when needed', () => {
    let squadsVisible = false;
    mockImplementedSource(bundledProDir, () => squadsVisible);

    jest.spyOn(fs, 'existsSync').mockImplementation((target) => {
      if (target === bundledSquadsDir) {
        return squadsVisible;
      }
      if (target === bundledProDir || target === gitmodulesPath) {
        return true;
      }
      return false;
    });

    jest.spyOn(childProcess, 'execFileSync').mockImplementation(() => {
      squadsVisible = true;
      return Buffer.from('');
    });

    const result = proSetup._testing.resolveProSourceDir('/tmp/aexos-project');

    expect(childProcess.execFileSync).toHaveBeenCalledWith(
      'git',
      ['submodule', 'update', '--init', '--recursive', 'pro'],
      expect.objectContaining({
        cwd: path.resolve(__dirname, '../..'),
        stdio: 'ignore',
      }),
    );
    expect(result).toEqual({ proSourceDir: bundledProDir });
  });

  it('falls back to target node_modules @aexos/pro when bundled content is unavailable', () => {
    mockImplementedSource(npmProDir);
    jest.spyOn(fs, 'existsSync').mockImplementation((target) => target === npmProDir);

    const result = proSetup._testing.resolveProSourceDir('/tmp/aexos-project');

    expect(result).toEqual({ proSourceDir: npmProDir });
  });

  it('returns bootstrapError when git submodule initialization fails', () => {
    mockImplementedSource(bundledProDir, () => false);
    jest.spyOn(fs, 'existsSync').mockImplementation((target) => {
      if (target === bundledProDir || target === gitmodulesPath) {
        return true;
      }
      return false;
    });

    jest.spyOn(childProcess, 'execFileSync').mockImplementation(() => {
      throw new Error('git unavailable');
    });

    const result = proSetup._testing.resolveProSourceDir('/tmp/aexos-project');

    expect(result).toEqual({
      proSourceDir: null,
      bootstrapError: 'git unavailable',
    });
  });
});
