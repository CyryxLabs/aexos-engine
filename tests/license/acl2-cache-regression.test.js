'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const cacheModule = require('../../pro/license/license-cache');
const { FeatureGate, featureGate } = require('../../pro/license/feature-gate');
const { generateMachineId } = require('../../pro/license/license-crypto');
const { LicenseApiClient, licenseApi } = require('../../pro/license/license-api');
const { LicenseActivationError } = require('../../pro/license/errors');
const { resolveEntitlement, _testing } = require('../../pro/license/entitlement-resolver');
const { createProCommand } = require('@aexos-core/cli/commands/pro');
const { withGracefulDegradation } = require('../../pro/license/degradation');

const DAY = 86400000;
const NOW = new Date('2026-09-07T12:00:00Z');
const iso = (offset = 0) => new Date(NOW.getTime() + offset).toISOString();
// The RFC 8032 fixture already used by entitlement-resolver.test.js. This is
// deliberately a test key; the runtime must reject it in production.
const PRIVATE_DER = '302e020100300506032b6570042204209d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';

function record(overrides = {}) {
  return {
    key: 'PRO-TEST-1234-5678-ABCD', activatedAt: iso(), expiresAt: iso(60 * DAY),
    features: ['pro.squads.*'], seats: { used: 1, max: 3 },
    cacheValidDays: 30, gracePeriodDays: 7, lastTrustedAt: iso(), ...overrides,
  };
}

function signed(overrides = {}) {
  const unsigned = {
    schemaVersion: 1, algorithm: 'Ed25519', keyId: _testing.TEST_KEY_ID,
    entitlementId: 'ent_test', customerId: 'cus_test', organizationId: null,
    product: 'aexos', plan: 'pro', features: ['pro.squads.*'],
    seats: { used: 1, max: 3 }, machineIdHash: _testing.hashMachineId(generateMachineId()),
    issuedAt: iso(), notBefore: iso(-300000), expiresAt: iso(60 * DAY),
    offline: { cacheValidDays: 30, gracePeriodDays: 7 },
    release: { channel: 'stable', versionRange: '*' }, revocationEpoch: 1, ...overrides,
  };
  const privateKey = crypto.createPrivateKey({ key: Buffer.from(PRIVATE_DER, 'hex'), format: 'der', type: 'pkcs8' });
  return { ...unsigned, signature: crypto.sign(null, Buffer.from(_testing.canonicalize(unsigned)), privateKey).toString('base64url') };
}

describe('ACL.2 cache admission and real legacy validate consumer', () => {
  let directory;
  let log;
  let errors;
  let previousExitCode;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-acl2-'));
    previousExitCode = process.exitCode;
    process.exitCode = undefined;
    jest.spyOn(process, 'cwd').mockReturnValue(directory);
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'performance'] });
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
    errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    featureGate._reset();
  });

  afterEach(() => {
    featureGate._reset();
    jest.useRealTimers();
    jest.restoreAllMocks();
    process.exitCode = previousExitCode;
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function save(data) {
    expect(cacheModule.writeLicenseCache(data, directory)).toEqual({ success: true });
    return cacheModule.readLicenseCache(directory);
  }

  function validate(response) {
    jest.spyOn(licenseApi, 'validate').mockResolvedValue(response);
    return createProCommand().parseAsync(['validate'], { from: 'user' });
  }

  function activate(response) {
    jest.spyOn(licenseApi, 'activate').mockResolvedValue(response);
    const exit = jest.spyOn(process, 'exit').mockImplementation((code) => { process.exitCode = code; });
    const exists = fs.existsSync;
    const source = path.resolve(__dirname, '../../node_modules/@aexos/pro');
    jest.spyOn(fs, 'existsSync').mockImplementation((candidate) => candidate === source ? false : exists(candidate));
    return createProCommand().parseAsync(['activate', '--key', record().key], { from: 'user' }).then(() => exit);
  }

  it('caps recent activation and validation at the paid expiry in cache, gate and runtime fallback', () => {
    const expired = save(record({ expiresAt: iso(-1), lastValidated: iso() }));
    expect(cacheModule.getExpiryDate(expired).toISOString()).toBe(iso(-1));
    expect(cacheModule.getLicenseState(expired)).toBe('Expired');
    expect(cacheModule.isInGracePeriod(expired)).toBe(false);
    expect(featureGate.isAvailable('pro.squads.premium')).toBe(false);
    const work = jest.fn();
    expect(withGracefulDegradation('pro.squads.premium', work, () => 'safe', { silent: true })).toBe('safe');
    expect(work).not.toHaveBeenCalled();
  });

  it.each([-1, 0, 1])('preserves zero grace at offline boundary offset %i ms', (offset) => {
    const zero = save(record({ gracePeriodDays: 0 }));
    const time = new Date(NOW.getTime() + 30 * DAY + offset);
    expect(zero.gracePeriodDays).toBe(0);
    expect(cacheModule.getLicenseState(zero, time)).toBe(offset < 0 ? 'Active' : 'Expired');
    jest.setSystemTime(time);
    expect(featureGate.isAvailable('pro.squads.premium')).toBe(offset < 0);
  });

  it('defaults only absent grace and permits nonzero grace only before the paid cap', () => {
    const defaults = save(record({ activatedAt: iso(-31 * DAY), gracePeriodDays: undefined }));
    expect(defaults.gracePeriodDays).toBe(7);
    expect(cacheModule.getLicenseState(defaults)).toBe('Grace');
    for (const offset of [-1, 0, 1]) {
      const bounded = record({ activatedAt: iso(-31 * DAY), expiresAt: iso(offset) });
      expect(cacheModule.isInGracePeriod(bounded)).toBe(offset > 0);
    }
  });

  it.each([null, -1, NaN, Infinity, '7', 0.5, Number.MAX_VALUE])('rejects malformed grace %p without replacing a valid record', (gracePeriodDays) => {
    save(record());
    const bytes = fs.readFileSync(cacheModule.getCachePath(directory));
    const malformed = record({ gracePeriodDays });
    expect(cacheModule.writeLicenseCache(malformed, directory).success).toBe(false);
    expect(cacheModule.getLicenseState(malformed)).toBe('Expired');
    expect(fs.readFileSync(cacheModule.getCachePath(directory))).toEqual(bytes);
  });

  it.each([null, 0, -1, NaN, Infinity, '30', 1.5, Number.MAX_VALUE])('rejects malformed cache duration %p', (cacheValidDays) => {
    const malformed = record({ cacheValidDays });
    expect(cacheModule.writeLicenseCache(malformed, directory).success).toBe(false);
    expect(cacheModule.getLicenseState(malformed)).toBe('Expired');
  });

  it.each([null, '', 'not-a-date'])('fails closed for malformed paid expiry %p', (expiresAt) => {
    save(record({ expiresAt }));
    expect(featureGate.isAvailable('pro.squads.premium')).toBe(false);
  });

  it('does not turn an invalid or rolled-back clock into cached authority', () => {
    expect(cacheModule.getLicenseState(record(), new Date(NaN))).toBe('Expired');
    const entitlement = signed();
    expect(resolveEntitlement({ cachedEntitlement: entitlement, transportError: true, machineId: generateMachineId(), now: 'invalid' }).allowed).toBe(false);
    save(record({ entitlement, lastTrustedAt: iso(DAY) }));
    expect(featureGate.isAvailable('pro.squads.premium')).toBe(false);
  });

  it('uses signed features, dates and grace instead of unsigned cache fields', () => {
    save(record({
      features: ['pro.*'], activatedAt: iso(-99 * DAY), expiresAt: iso(999 * DAY),
      entitlement: signed({ features: ['pro.memory.extended'] }),
    }));
    expect(featureGate.isAvailable('pro.memory.extended')).toBe(true);
    expect(featureGate.isAvailable('pro.squads.premium')).toBe(false);
    expect(featureGate.getLicenseInfo().features).toEqual(['pro.memory.extended']);
    expect(featureGate.getLicenseInfo().expiresAt).toBe(iso(60 * DAY));
  });

  it.each([-1, 0, 1])('enforces signed zero grace at exact boundary offset %i ms', (offset) => {
    save(record({ entitlement: signed({ offline: { cacheValidDays: 30, gracePeriodDays: 0 } }) }));
    jest.setSystemTime(new Date(NOW.getTime() + 30 * DAY + offset));
    expect(featureGate.isAvailable('pro.squads.premium')).toBe(offset < 0);
  });

  it('caps signed grace at entitlement expiry despite renewed local timestamps', () => {
    const entitlement = signed({ issuedAt: iso(-31 * DAY), notBefore: iso(-31 * DAY), expiresAt: iso() });
    save(record({ entitlement }));
    expect(featureGate.getLicenseState()).toBe('Expired');
    expect(featureGate.isAvailable('pro.squads.premium')).toBe(false);
  });

  it.each([null, {}, { signature: 'fake' }])('never falls back to unsigned fields for an invalid envelope %p', (entitlement) => {
    save(record({ entitlement }));
    expect(featureGate.isAvailable('pro.squads.premium')).toBe(false);
  });

  it('rejects the test signing key in production through the real FeatureGate', () => {
    save(record({ entitlement: signed() }));
    const previous = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      expect(featureGate.isAvailable('pro.squads.premium')).toBe(false);
    } finally { process.env.NODE_ENV = previous; }
  });

  it('persists minimal authoritative denial and fails after a new process reload without touching user files', async () => {
    save(record());
    const userFile = path.join(directory, 'customer-project.txt');
    fs.writeFileSync(userFile, 'user-owned');
    expect(featureGate.isAvailable('pro.squads.premium')).toBe(true);
    await validate({ valid: false });
    expect(process.exitCode).toBe(1);
    expect(featureGate.isAvailable('pro.squads.premium')).toBe(false);
    expect(new FeatureGate(() => directory).getLicenseState()).toBe('Revoked');
    const child = spawnSync(process.execPath, ['-e', `
      const {FeatureGate}=require(${JSON.stringify(require.resolve('../../pro/license/feature-gate'))});
      const gate=new FeatureGate(()=>${JSON.stringify(directory)});
      process.stdout.write(JSON.stringify({state:gate.getLicenseState(),allowed:gate.isAvailable('pro.squads.premium')}));
    `], { encoding: 'utf8', timeout: 15000 });
    expect(child.status).toBe(0);
    expect(JSON.parse(child.stdout)).toEqual({ state: 'Revoked', allowed: false });
    expect(fs.readFileSync(userFile, 'utf8')).toBe('user-owned');
    expect(log.mock.calls.flat().join('\n')).toContain('aexos pro status');
    expect(log.mock.calls.flat().join('\n')).not.toContain('validated successfully');
    process.exitCode = undefined;
    await createProCommand().parseAsync(['status'], { from: 'user' });
    expect(process.exitCode).toBeUndefined();
  });

  it.each([false, true])('transport failure leaves cache bytes and admission unchanged (denied=%s)', async (denied) => {
    save(record({ revoked: denied }));
    const before = fs.readFileSync(cacheModule.getCachePath(directory));
    jest.spyOn(licenseApi, 'validate').mockRejectedValue(LicenseActivationError.networkError());
    await createProCommand().parseAsync(['validate'], { from: 'user' });
    expect(process.exitCode).toBe(1);
    expect(fs.readFileSync(cacheModule.getCachePath(directory))).toEqual(before);
    expect(featureGate.isAvailable('pro.squads.premium')).toBe(!denied);
    expect(log.mock.calls.flat().join('\n')).toContain('not refreshed or extended');
  });

  it('does not grant expired cached authority during transport failure', async () => {
    save(record({ expiresAt: iso(-1) }));
    jest.spyOn(licenseApi, 'validate').mockRejectedValue(LicenseActivationError.networkError());
    await createProCommand().parseAsync(['validate'], { from: 'user' });
    expect(featureGate.isAvailable('pro.squads.premium')).toBe(false);
    expect(process.exitCode).toBe(1);
  });

  it('persists a structured authoritative expired-key response', async () => {
    save(record());
    jest.spyOn(licenseApi, 'validate').mockRejectedValue(LicenseActivationError.expiredKey());
    await createProCommand().parseAsync(['validate'], { from: 'user' });
    expect(cacheModule.readLicenseCache(directory).revoked).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it('removes only the cache if denial persistence fails and immediately disables in-memory admission', async () => {
    save(record());
    const userFile = path.join(directory, 'project.md');
    fs.writeFileSync(userFile, 'keep');
    jest.spyOn(cacheModule, 'writeLicenseCache').mockReturnValue({ success: false, error: 'disk failure' });
    await validate({ valid: false });
    expect(process.exitCode).toBe(1);
    expect(featureGate.isAvailable('pro.squads.premium')).toBe(false);
    expect(cacheModule.readLicenseCache(directory)).toBeNull();
    expect(fs.readFileSync(userFile, 'utf8')).toBe('keep');
    expect(errors.mock.calls.flat().join('\n')).toContain('local license cache was removed');
  });

  it('recovers a denied legacy record only after a positive online decision while retaining absent expiry and zero grace', async () => {
    save(record({ revoked: true, remoteDenied: 'REVOKED', activatedAt: iso(-40 * DAY), gracePeriodDays: 0 }));
    await validate({ valid: true, features: ['pro.memory.extended'], seats: { used: 1, max: 3 } });
    expect(process.exitCode).toBeUndefined();
    expect(featureGate.isAvailable('pro.memory.extended')).toBe(true);
    const saved = cacheModule.readLicenseCache(directory);
    expect(saved.expiresAt).toBe(iso(60 * DAY));
    expect(saved.gracePeriodDays).toBe(0);
    expect(saved.lastValidated).toBe(iso());
  });

  it('cannot clear signed denial with a positive unsigned response', async () => {
    save(record({ entitlement: signed(), revoked: true, remoteDenied: 'REVOKED' }));
    const before = fs.readFileSync(cacheModule.getCachePath(directory));
    await validate({ valid: true, ...record() });
    expect(process.exitCode).toBe(1);
    expect(fs.readFileSync(cacheModule.getCachePath(directory))).toEqual(before);
    expect(featureGate.isAvailable('pro.squads.premium')).toBe(false);
  });

  it('can recover signed denial only with verified usable signed authority', async () => {
    save(record({ entitlement: signed(), revoked: true, remoteDenied: 'REVOKED' }));
    await validate({ valid: true, ...record(), entitlement: signed({ features: ['pro.memory.extended'] }) });
    expect(process.exitCode).toBeUndefined();
    expect(featureGate.isAvailable('pro.memory.extended')).toBe(true);
    expect(featureGate.isAvailable('pro.squads.premium')).toBe(false);
  });

  it('cannot downgrade signed denial by reactivating with an unsigned response', async () => {
    save(record({ entitlement: signed(), revoked: true, remoteDenied: 'REVOKED' }));
    const before = fs.readFileSync(cacheModule.getCachePath(directory));
    const exit = await activate(record());
    expect(exit).toHaveBeenCalledWith(1);
    expect(fs.readFileSync(cacheModule.getCachePath(directory))).toEqual(before);
    expect(featureGate.isAvailable('pro.squads.premium')).toBe(false);
    expect(log.mock.calls.flat().join('\n')).not.toContain('activated successfully');
  });

  it('retains legacy activation and admits a verified signed reactivation without trusting unsigned feature claims', async () => {
    save(record({ entitlement: signed(), revoked: true, remoteDenied: 'REVOKED' }));
    const entitlement = signed({ features: ['pro.memory.extended'] });
    const exit = await activate(record({ entitlement, features: ['pro.*'] }));
    expect(exit).not.toHaveBeenCalled();
    expect(featureGate.isAvailable('pro.memory.extended')).toBe(true);
    expect(featureGate.isAvailable('pro.squads.premium')).toBe(false);
    expect(cacheModule.readLicenseCache(directory).entitlement).toEqual(entitlement);
    expect(log.mock.calls.flat().join('\n')).toContain('Features:     pro.memory.extended');
  });

  it('retains compatible successful legacy activation', async () => {
    const exit = await activate(record());
    expect(exit).not.toHaveBeenCalled();
    expect(featureGate.isAvailable('pro.squads.premium')).toBe(true);
    expect(cacheModule.readLicenseCache(directory)).not.toHaveProperty('entitlement');
  });

  it('never reports activation success when cache persistence fails', async () => {
    jest.spyOn(cacheModule, 'writeLicenseCache').mockReturnValue({ success: false, error: 'disk failure' });
    const exit = await activate(record());
    expect(exit).toHaveBeenCalledWith(1);
    expect(featureGate.isAvailable('pro.squads.premium')).toBe(false);
    expect(log.mock.calls.flat().join('\n')).not.toContain('activated successfully');
  });

  it('fails nonzero when no license exists', async () => {
    await validate({ valid: true });
    expect(process.exitCode).toBe(1);
    expect(licenseApi.validate).not.toHaveBeenCalled();
  });

  it('accepts minimal false from the API, but rejects unknown or malformed positive decisions', async () => {
    const client = new LicenseApiClient();
    const request = jest.spyOn(client, '_request');
    request.mockResolvedValueOnce({ valid: false });
    await expect(client.validate('fixture', 'machine')).resolves.toEqual({ valid: false });
    for (const response of [null, {}, { valid: 'false' }, { valid: true }, { valid: true, features: [] }]) {
      request.mockResolvedValueOnce(response);
      await expect(client.validate('fixture', 'machine')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    }
  });
});
