/** Bounded, local-only collection and stable citation identity helpers. */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { digest } = require('../execution/durable-evidence');
const { applySecretPolicy, fail } = require('./contract');

const SECRET_QUERY_NAMES = /^(access[_-]?token|api[_-]?key|credential|key|secret|sig|signature|token|x-amz-credential|x-amz-signature)$/i;
const MAX_OBSERVATIONS_PER_BATCH = 1000;

function sha256Text(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizeContent(value, normalizationVersion = 'utf8-crlf-v1') {
  if (normalizationVersion !== 'utf8-crlf-v1' || typeof value !== 'string') {
    fail('RESEARCH_SOURCE_INVALID', 'Source content or normalization version is invalid.');
  }
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function citationIdentity(content, accessClass = 'public', normalizationVersion = 'utf8-crlf-v1') {
  const retainedContent = normalizeContent(content, normalizationVersion);
  const contentHash = sha256Text(retainedContent);
  return {
    citationId: `s-${digest({ normalizationVersion, accessClass, contentHash })}`,
    contentHash,
    retainedContent,
  };
}

function safeLocator(locator, secretHandling = 'reject') {
  if (typeof locator !== 'string' || locator.length > 4096) {
    fail('RESEARCH_LOCATOR_INVALID', 'Source locator is invalid.');
  }
  let parsed;
  try { parsed = new URL(locator); }
  catch (_error) { fail('RESEARCH_LOCATOR_INVALID', 'Source locator must be an absolute HTTP(S) URL.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    fail('RESEARCH_LOCATOR_INVALID', 'Source locator uses an unsafe scheme or credentials.');
  }
  let redacted = false;
  for (const key of [...parsed.searchParams.keys()]) {
    if (!SECRET_QUERY_NAMES.test(key)) continue;
    if (secretHandling !== 'redact') fail('RESEARCH_SECRET_LOCATOR', 'Secret-bearing source locators are rejected.');
    const value = parsed.searchParams.get(key);
    if (!/^redacted-[a-f0-9]{64}$/.test(value)) parsed.searchParams.set(key, `redacted-${digest(value)}`);
    redacted = true;
  }
  const originalLocator = redacted ? parsed.toString() : locator;
  parsed.hash = '';
  return { originalLocator, canonicalLocator: parsed.toString(), locatorId: `l-${digest(parsed.toString())}` };
}

function validateObservation(raw, limits, sourcePolicy = { secretHandling: 'reject' }) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('RESEARCH_SOURCE_INVALID', 'Observation must be an object.');
  const allowed = ['accessClass', 'availability', 'content', 'locator', 'retrievedAt'];
  if (Object.keys(raw).some((key) => !allowed.includes(key))) {
    fail('RESEARCH_SOURCE_INVALID', 'Fixture observation contains provider or unknown authority fields.');
  }
  if (!['public', 'private'].includes(raw.accessClass)
    || !['available', 'unavailable'].includes(raw.availability)
    || typeof raw.retrievedAt !== 'string' || !Number.isFinite(Date.parse(raw.retrievedAt))) {
    fail('RESEARCH_SOURCE_INVALID', 'Observation metadata is invalid.');
  }
  const locator = safeLocator(raw.locator, sourcePolicy.secretHandling);
  if (raw.availability === 'available' && raw.accessClass === 'public') {
    if (typeof raw.content !== 'string' || Buffer.byteLength(raw.content, 'utf8') > limits.maxContentBytes) {
      fail('RESEARCH_SOURCE_INVALID', 'Public source content is missing or exceeds its limit.');
    }
  }
  if (raw.accessClass === 'private' && raw.content !== undefined) {
    fail('RESEARCH_PRIVATE_CONTENT', 'Private source text is never accepted by the v1 fixture collector.');
  }
  const content = raw.content === undefined
    ? undefined
    : applySecretPolicy(raw.content, sourcePolicy.secretHandling);
  return { ...locator, accessClass: raw.accessClass, availability: raw.availability,
    content, retrievedAt: new Date(raw.retrievedAt).toISOString() };
}

function validateCollectedObservation(observation, limits, sourcePolicy) {
  if (!observation || typeof observation !== 'object' || Array.isArray(observation)) {
    fail('RESEARCH_SOURCE_INVALID', 'Collector observation must be an object.');
  }
  const allowed = ['accessClass', 'availability', 'canonicalLocator', 'content', 'locatorId',
    'originalLocator', 'retrievedAt'];
  if (Object.keys(observation).some((key) => !allowed.includes(key))) {
    fail('RESEARCH_SOURCE_INVALID', 'Collector observation contains unknown authority fields.');
  }
  const normalized = validateObservation({
    locator: observation.originalLocator,
    accessClass: observation.accessClass,
    availability: observation.availability,
    retrievedAt: observation.retrievedAt,
    ...(observation.content === undefined ? {} : { content: observation.content }),
  }, limits, sourcePolicy);
  if (normalized.canonicalLocator !== observation.canonicalLocator
    || normalized.locatorId !== observation.locatorId) {
    fail('RESEARCH_SOURCE_INVALID', 'Collector locator identity is inconsistent.');
  }
  return normalized;
}

function resolveFixture(root, relative) {
  if (!path.isAbsolute(root)) fail('RESEARCH_INPUT_ROOT_INVALID', 'Input root must be absolute.');
  const selectedRoot = path.resolve(root);
  let cursor = path.parse(selectedRoot).root;
  for (const part of selectedRoot.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    const stat = fs.lstatSync(cursor);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      fail('RESEARCH_INPUT_ROOT_INVALID', 'Input root must have ordinary directory ancestry.');
    }
  }
  const resolved = path.resolve(selectedRoot, relative);
  const relation = path.relative(selectedRoot, resolved);
  if (!relation || relation === '..' || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
    fail('RESEARCH_FIXTURE_INVALID', 'Fixture path escapes or aliases the selected input root.');
  }
  cursor = selectedRoot;
  const parts = relation.split(path.sep);
  for (const [index, part] of parts.entries()) {
    cursor = path.join(cursor, part);
    const current = fs.lstatSync(cursor);
    if (current.isSymbolicLink() || (index < parts.length - 1 && !current.isDirectory())) {
      fail('RESEARCH_FIXTURE_INVALID', 'Fixture path contains a filesystem alias.');
    }
  }
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    fail('RESEARCH_FIXTURE_INVALID', 'Fixture must be a regular single-link file.');
  }
  return { file: resolved, stat };
}

function createFixtureCollector({ inputRoot, operation, limits, provider, sourcePolicy }) {
  return {
    async collect({ operationId, cursor = null, signal }) {
      if (operationId !== operation.operationId || cursor !== null || signal?.aborted) {
        fail('RESEARCH_COLLECTION_ABORTED', 'Collection was aborted or called with an invalid identity.');
      }
      if (provider.kind === 'unavailable') fail('PROVIDER_UNAVAILABLE', 'The selected local provider is unavailable.');
      const { file, stat } = resolveFixture(inputRoot, operation.fixture);
      if (stat.size > limits.maxInputBytes) fail('RESEARCH_FIXTURE_LIMIT', 'Fixture exceeds the input byte limit.');
      let fixture;
      try { fixture = JSON.parse(fs.readFileSync(file, 'utf8')); }
      catch (_error) { fail('RESEARCH_FIXTURE_INVALID', 'Fixture must contain valid JSON.'); }
      if (!fixture || Object.keys(fixture).some((key) => key !== 'observations')
        || !Array.isArray(fixture.observations)
        || fixture.observations.length > MAX_OBSERVATIONS_PER_BATCH) {
        fail('SOURCE_LIMIT', 'Fixture observation batch exceeds the bounded batch capacity.');
      }
      const observations = fixture.observations.map((item) => validateObservation(item, limits, sourcePolicy))
        .filter((item) => sourcePolicy.allowedAccessClasses.includes(item.accessClass)
          && (item.accessClass !== 'private' || sourcePolicy.privateHandling === 'metadata-only'));
      return { observations, cursor: null };
    },
  };
}

module.exports = {
  MAX_OBSERVATIONS_PER_BATCH,
  citationIdentity,
  createFixtureCollector,
  normalizeContent,
  safeLocator,
  sha256Text,
  validateCollectedObservation,
  validateObservation,
};
