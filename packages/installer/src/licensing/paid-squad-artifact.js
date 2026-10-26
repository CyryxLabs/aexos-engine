'use strict';

const crypto = require('crypto');
const semver = require('semver');

const DEFAULT_TRUST_STORE = require('./artifact-trust-store.json');

const DESCRIPTOR_SCHEMA = 'aexos.squad-artifact/v1';
const DESCRIPTOR_ALGORITHM = 'Ed25519';
const DEFAULT_MAX_ARTIFACT_BYTES = 100 * 1024 * 1024;
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 60000;
const MAX_DESCRIPTOR_TTL_MS = 15 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const ALLOWED_CHANNELS = new Set(['stable', 'beta', 'alpha', 'preview']);
const ALLOWED_PLATFORMS = new Set(['any', 'win32', 'linux', 'darwin']);
const DESCRIPTOR_FIELDS = new Set([
  'schema',
  'algorithm',
  'keyId',
  'descriptorId',
  'product',
  'plan',
  'subjectIdHash',
  'entitlementId',
  'machineIdHash',
  'squadId',
  'package',
  'version',
  'platform',
  'releaseChannel',
  'format',
  'artifactUrl',
  'sizeBytes',
  'sha256',
  'issuedAt',
  'expiresAt',
  'entitlementExpiresAt',
  'revocationEpoch',
  'signature',
]);

class ArtifactVerificationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ArtifactVerificationError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new ArtifactVerificationError(message, code);
}

function canonicalize(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
    .join(',')}}`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hashMachineId(machineId) {
  if (typeof machineId !== 'string' || machineId.trim().length < 16) {
    fail('INVALID_MACHINE_ID', 'A valid machine identifier is required.');
  }
  return sha256(Buffer.from(machineId.trim(), 'utf8'));
}

function isSafeIdentifier(value) {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 128 &&
    /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(value)
  );
}

function isSafePackageName(value) {
  return (
    typeof value === 'string' &&
    value.length <= 214 &&
    /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(value)
  );
}

function parseIso(value, field) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    fail('INVALID_DESCRIPTOR_SCHEMA', `${field} must be an ISO timestamp.`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    fail('INVALID_DESCRIPTOR_SCHEMA', `${field} must be an ISO timestamp.`);
  }
  return timestamp;
}

function assertSafeArtifactUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length > 2048) {
    fail('INVALID_ARTIFACT_URL', 'Artifact URL is invalid.');
  }
  let artifactUrl;
  try {
    artifactUrl = new URL(rawUrl);
  } catch {
    fail('INVALID_ARTIFACT_URL', 'Artifact URL is invalid.');
  }

  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(artifactUrl.hostname);
  if (artifactUrl.protocol !== 'https:' && !(artifactUrl.protocol === 'http:' && isLocal)) {
    fail('INVALID_ARTIFACT_URL', 'Artifact URL must use HTTPS.');
  }
  if (artifactUrl.username || artifactUrl.password) {
    fail('INVALID_ARTIFACT_URL', 'Artifact URL must not contain credentials.');
  }
  return artifactUrl;
}

function validateDescriptorShape(descriptor) {
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
    fail('INVALID_DESCRIPTOR_SCHEMA', 'Artifact descriptor must be an object.');
  }
  const fields = Object.keys(descriptor);
  if (fields.length !== DESCRIPTOR_FIELDS.size || fields.some((key) => !DESCRIPTOR_FIELDS.has(key))) {
    fail('INVALID_DESCRIPTOR_SCHEMA', 'Artifact descriptor fields do not match schema.');
  }
  if (descriptor.schema !== DESCRIPTOR_SCHEMA || descriptor.algorithm !== DESCRIPTOR_ALGORITHM) {
    fail('INVALID_DESCRIPTOR_SCHEMA', 'Artifact descriptor protocol is unsupported.');
  }
  if (descriptor.product !== 'aexos') {
    fail('WRONG_PRODUCT', 'Artifact is not authorized for AEXOS.');
  }
  if (!['pro', 'team', 'enterprise'].includes(descriptor.plan)) {
    fail('INVALID_DESCRIPTOR_SCHEMA', 'Artifact plan is invalid.');
  }
  for (const field of ['keyId', 'descriptorId', 'squadId', 'version']) {
    if (!isSafeIdentifier(descriptor[field])) {
      fail('INVALID_DESCRIPTOR_SCHEMA', `${field} is invalid.`);
    }
  }
  if (!semver.valid(descriptor.version)) {
    fail('INVALID_DESCRIPTOR_SCHEMA', 'version must be a semantic version.');
  }
  for (const field of ['subjectIdHash', 'machineIdHash', 'sha256']) {
    if (typeof descriptor[field] !== 'string' || !/^[a-f0-9]{64}$/.test(descriptor[field])) {
      fail('INVALID_DESCRIPTOR_SCHEMA', `${field} must be a lowercase SHA-256 value.`);
    }
  }
  if (!isSafeIdentifier(descriptor.entitlementId)) {
    fail('INVALID_DESCRIPTOR_SCHEMA', 'entitlementId is invalid.');
  }
  if (!isSafePackageName(descriptor.package)) {
    fail('INVALID_DESCRIPTOR_SCHEMA', 'package is invalid.');
  }
  if (!ALLOWED_PLATFORMS.has(descriptor.platform)) {
    fail('INVALID_DESCRIPTOR_SCHEMA', 'platform is invalid.');
  }
  if (!ALLOWED_CHANNELS.has(descriptor.releaseChannel) || descriptor.format !== 'tgz') {
    fail('INVALID_DESCRIPTOR_SCHEMA', 'Artifact channel or format is invalid.');
  }
  if (!Number.isSafeInteger(descriptor.sizeBytes) || descriptor.sizeBytes < 1) {
    fail('INVALID_DESCRIPTOR_SCHEMA', 'sizeBytes must be a positive safe integer.');
  }
  if (!Number.isSafeInteger(descriptor.revocationEpoch) || descriptor.revocationEpoch < 0) {
    fail('INVALID_DESCRIPTOR_SCHEMA', 'revocationEpoch must be a non-negative integer.');
  }
  if (
    typeof descriptor.signature !== 'string' ||
    !/^[A-Za-z0-9_-]{86}$/.test(descriptor.signature)
  ) {
    fail('INVALID_DESCRIPTOR_SCHEMA', 'Artifact signature is invalid.');
  }
  assertSafeArtifactUrl(descriptor.artifactUrl);
  parseIso(descriptor.issuedAt, 'issuedAt');
  parseIso(descriptor.expiresAt, 'expiresAt');
  parseIso(descriptor.entitlementExpiresAt, 'entitlementExpiresAt');
}

function resolveTrustedKey(trustStore, keyId, nowMs) {
  if (
    !trustStore ||
    trustStore.schemaVersion !== 1 ||
    trustStore.product !== 'aexos' ||
    trustStore.algorithm !== DESCRIPTOR_ALGORITHM ||
    !Array.isArray(trustStore.keys)
  ) {
    fail('INVALID_TRUST_STORE', 'Artifact trust store is invalid.');
  }
  const matching = trustStore.keys.filter((key) => key && key.keyId === keyId);
  if (matching.length !== 1) {
    fail('UNKNOWN_SIGNING_KEY', 'Artifact signing key is not trusted.');
  }
  const key = matching[0];
  if (key.algorithm !== DESCRIPTOR_ALGORITHM || key.status !== 'active') {
    fail('UNTRUSTED_SIGNING_KEY', 'Artifact signing key is not active.');
  }
  const notBefore = parseIso(key.notBefore, 'key.notBefore');
  const notAfter = parseIso(key.notAfter, 'key.notAfter');
  if (nowMs < notBefore || nowMs >= notAfter || typeof key.publicKeyPem !== 'string') {
    fail('UNTRUSTED_SIGNING_KEY', 'Artifact signing key is outside its validity window.');
  }
  let publicKey;
  try {
    publicKey = crypto.createPublicKey(key.publicKeyPem);
  } catch {
    fail('INVALID_TRUST_STORE', 'Artifact public key is invalid.');
  }
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    fail('INVALID_TRUST_STORE', 'Artifact public key must use Ed25519.');
  }
  return publicKey;
}

function assertExpectedBindings(descriptor, expected) {
  const required = ['product', 'squadId', 'package', 'version', 'platform', 'releaseChannel'];
  if (!expected || required.some((field) => typeof expected[field] !== 'string')) {
    fail('MISSING_EXPECTED_BINDINGS', 'Expected artifact request bindings are required.');
  }
  for (const field of ['product', 'squadId', 'package', 'version', 'releaseChannel']) {
    if (descriptor[field] !== expected[field]) {
      fail('ARTIFACT_BINDING_MISMATCH', `Artifact ${field} does not match the request.`);
    }
  }
  if (descriptor.platform !== 'any' && descriptor.platform !== expected.platform) {
    fail('ARTIFACT_BINDING_MISMATCH', 'Artifact platform does not match the request.');
  }
  const expectedMachineHash = expected.machineIdHash || hashMachineId(expected.machineId);
  if (descriptor.machineIdHash !== expectedMachineHash) {
    fail('MACHINE_MISMATCH', 'Artifact is bound to another machine.');
  }
  for (const [field, code] of [
    ['subjectIdHash', 'SUBJECT_MISMATCH'],
    ['entitlementId', 'ENTITLEMENT_MISMATCH'],
    ['plan', 'PLAN_MISMATCH'],
  ]) {
    if (expected[field] !== undefined && descriptor[field] !== expected[field]) {
      fail(code, `Artifact ${field} does not match the active entitlement.`);
    }
  }
  if (
    expected.revocationEpoch !== undefined &&
    descriptor.revocationEpoch !== expected.revocationEpoch
  ) {
    fail('REVOCATION_EPOCH_MISMATCH', 'Artifact entitlement freshness is stale.');
  }
}

function verifySignedArtifactDescriptor(descriptor, expected, options = {}) {
  validateDescriptorShape(descriptor);
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const nowMs = now.getTime();
  const issuedAt = parseIso(descriptor.issuedAt, 'issuedAt');
  const expiresAt = parseIso(descriptor.expiresAt, 'expiresAt');
  const entitlementExpiresAt = parseIso(
    descriptor.entitlementExpiresAt,
    'entitlementExpiresAt',
  );
  if (issuedAt > nowMs + MAX_CLOCK_SKEW_MS) {
    fail('DESCRIPTOR_NOT_YET_VALID', 'Artifact descriptor was issued in the future.');
  }
  if (expiresAt <= nowMs || entitlementExpiresAt <= nowMs) {
    fail('ARTIFACT_AUTHORITY_EXPIRED', 'Artifact authority has expired.');
  }
  if (
    expiresAt <= issuedAt ||
    expiresAt - issuedAt > MAX_DESCRIPTOR_TTL_MS ||
    expiresAt > entitlementExpiresAt
  ) {
    fail('INVALID_DESCRIPTOR_LIFETIME', 'Artifact descriptor lifetime is invalid.');
  }
  assertExpectedBindings(descriptor, expected);
  const publicKey = resolveTrustedKey(
    options.trustStore || DEFAULT_TRUST_STORE,
    descriptor.keyId,
    nowMs,
  );
  const { signature, ...unsignedDescriptor } = descriptor;
  const signatureBytes = Buffer.from(signature, 'base64url');
  const isValid = crypto.verify(
    null,
    Buffer.from(canonicalize(unsignedDescriptor), 'utf8'),
    publicKey,
    signatureBytes,
  );
  if (!isValid) {
    fail('INVALID_ARTIFACT_SIGNATURE', 'Artifact descriptor signature is invalid.');
  }
  return Object.freeze({ ...descriptor });
}

function verifyArtifactPayload(payload, descriptor, options = {}) {
  const buffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const maxBytes = options.maxBytes || DEFAULT_MAX_ARTIFACT_BYTES;
  if (buffer.length > maxBytes || buffer.length !== descriptor.sizeBytes) {
    fail('ARTIFACT_SIZE_MISMATCH', 'Artifact payload size does not match its descriptor.');
  }
  if (sha256(buffer) !== descriptor.sha256) {
    fail('ARTIFACT_DIGEST_MISMATCH', 'Artifact payload digest does not match its descriptor.');
  }
  return buffer;
}

async function readBoundedBody(response, maxBytes) {
  const contentLength = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    fail('ARTIFACT_TOO_LARGE', 'Artifact payload exceeds the configured size limit.');
  }
  if (response.body && typeof response.body[Symbol.asyncIterator] === 'function') {
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      const buffer = Buffer.from(chunk);
      size += buffer.length;
      if (size > maxBytes) {
        fail('ARTIFACT_TOO_LARGE', 'Artifact payload exceeds the configured size limit.');
      }
      chunks.push(buffer);
    }
    return Buffer.concat(chunks, size);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxBytes) {
    fail('ARTIFACT_TOO_LARGE', 'Artifact payload exceeds the configured size limit.');
  }
  return buffer;
}

async function downloadAndVerifySignedArtifact(descriptor, expected, options = {}) {
  const verifiedDescriptor = verifySignedArtifactDescriptor(descriptor, expected, options);
  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') {
    fail('FETCH_UNAVAILABLE', 'Artifact download transport is unavailable.');
  }
  const maxBytes = options.maxBytes || DEFAULT_MAX_ARTIFACT_BYTES;
  if (verifiedDescriptor.sizeBytes > maxBytes) {
    fail('ARTIFACT_TOO_LARGE', 'Artifact payload exceeds the configured size limit.');
  }
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || DEFAULT_DOWNLOAD_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(verifiedDescriptor.artifactUrl, {
      signal: controller.signal,
      redirect: 'error',
    });
    if (!response.ok) {
      fail('ARTIFACT_DOWNLOAD_FAILED', `Artifact download failed with HTTP ${response.status}.`);
    }
    const payload = await readBoundedBody(response, maxBytes);
    return {
      descriptor: verifiedDescriptor,
      payload: verifyArtifactPayload(payload, verifiedDescriptor, { maxBytes }),
    };
  } catch (error) {
    if (error && error.name === 'AbortError') {
      fail('ARTIFACT_DOWNLOAD_TIMEOUT', 'Artifact download timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  ArtifactVerificationError,
  DESCRIPTOR_SCHEMA,
  DESCRIPTOR_ALGORITHM,
  DEFAULT_TRUST_STORE,
  hashMachineId,
  verifySignedArtifactDescriptor,
  verifyArtifactPayload,
  downloadAndVerifySignedArtifact,
  _testing: {
    canonicalize,
    sha256,
    validateDescriptorShape,
    assertSafeArtifactUrl,
    DESCRIPTOR_FIELDS,
    MAX_DESCRIPTOR_TTL_MS,
  },
};
