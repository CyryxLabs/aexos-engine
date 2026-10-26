'use strict';

const contract = require('./contract');
const catalog = require('./catalog');
const { clone, stableStringify } = require('../execution/durable-evidence');
const { analyzeObservation, REPORT_SCHEMA_VERSION } = require('./audit');
const {
  AUDIT_ACTION,
  UNAVAILABLE_ADAPTER,
  assertPostgresAdapterAvailable,
  createPostgresAdapter,
  createScope,
  getPostgresAdapter,
  normalizeRegistration,
  useRequest,
  verifyHost,
} = require('./postgres-adapter');

async function auditDatabase(input, host = {}) {
  const identity = contract.resolveValidatedRequest(input);
  const startedAt = Date.now();
  let deadlineMs = startedAt + identity.request.limits.totalAuditTimeoutMs;
  const bounded = async (operation) => {
    const remaining = deadlineMs - Date.now();
    if (remaining <= 0) contract.fail('DATABASE_TOTAL_TIMEOUT', 'Database audit exceeded its total deadline.');
    let timer;
    const timeout = new Promise((_resolve, reject) => {
      timer = setTimeout(() => {
        const error = new contract.DatabaseReliabilityError(
          'DATABASE_TOTAL_TIMEOUT',
          'Database audit exceeded its total deadline.',
        );
        reject(error);
      }, remaining);
      timer.unref?.();
    });
    try {
      return await Promise.race([operation, timeout]);
    } finally {
      clearTimeout(timer);
    }
  };
  const adapterDescriptor = Object.getOwnPropertyDescriptor(host, 'adapter');
  if (!adapterDescriptor || !Object.prototype.hasOwnProperty.call(adapterDescriptor, 'value')
    || !adapterDescriptor.value) await assertPostgresAdapterAvailable();
  verifyHost(host);
  let resolved;
  try {
    resolved = await bounded(host.connectionRegistry.resolve(identity.request.connectionRef));
  } catch (error) {
    if (error?.code === 'DATABASE_TOTAL_TIMEOUT') throw error;
    contract.fail('DATABASE_CONNECTION_RESOLUTION_FAILED', 'Trusted connection resolution failed without exposing source details.');
  }
  const entry = normalizeRegistration(resolved, identity.request);
  deadlineMs = Math.min(deadlineMs, startedAt + entry.limits.totalAuditTimeoutMs);
  if (Buffer.byteLength(stableStringify(entry.expectedManifest)) > entry.limits.maxManifestBytes) {
    contract.fail('DATABASE_MANIFEST_LIMIT', 'Trusted expected manifest exceeds the effective policy.');
  }
  const effectiveIdentity = contract.validateRequest({
    ...clone(identity.request), limits: clone(entry.limits),
  });
  const catalogCount = catalog.buildCatalogChecks(effectiveIdentity).length;
  const planCount = catalog.buildFixturePlanChecks(effectiveIdentity).length;
  const controlCount = 5 + (identity.request.checks.includes('migration') ? 1 : 0)
    + (planCount && entry.planBaseline ? 1 : 0);
  if (controlCount + catalogCount + planCount > entry.limits.maxStatements) {
    contract.fail('DATABASE_STATEMENT_LIMIT', 'Audit controls and checks exceed the trusted statement budget.');
  }
  const runtimeHost = Object.freeze({ ...host, deadlineMs });
  runtimeHost.broker.verify(runtimeHost.leaseToken, useRequest(runtimeHost, identity, entry, AUDIT_ACTION));
  let operationStarted = false;
  const secretOperation = runtimeHost.broker.useSecret(
    runtimeHost.leaseToken,
    useRequest(runtimeHost, identity, entry, 'secret:read'),
    entry.secretRef,
    async (secret) => {
      operationStarted = true;
      if (Date.now() >= deadlineMs) {
        contract.fail('DATABASE_TOTAL_TIMEOUT', 'Database audit exceeded its total deadline.');
      }
      runtimeHost.broker.verify(runtimeHost.leaseToken, useRequest(runtimeHost, identity, entry, AUDIT_ACTION));
      return runtimeHost.adapter.audit(identity, runtimeHost, entry, secret);
    },
  );
  let timer;
  const secretDeadline = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      if (!operationStarted) reject(new contract.DatabaseReliabilityError(
        'DATABASE_TOTAL_TIMEOUT', 'Database audit exceeded its total deadline.',
      ));
    }, Math.max(1, deadlineMs - Date.now()));
  });
  try {
    return await Promise.race([secretOperation, secretDeadline]);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  CHECKS: contract.CHECKS,
  DatabaseReliabilityError: contract.DatabaseReliabilityError,
  LIMIT_MAXIMA: contract.LIMIT_MAXIMA,
  MAX_INPUT_BYTES: contract.MAX_INPUT_BYTES,
  OBSERVATION_SCHEMA_VERSION: contract.OBSERVATION_SCHEMA_VERSION,
  REPORT_SCHEMA_VERSION,
  REQUEST_SCHEMA_VERSION: contract.REQUEST_SCHEMA_VERSION,
  UNAVAILABLE_ADAPTER,
  analyzeObservation,
  auditDatabase,
  buildCatalogChecks: catalog.buildCatalogChecks,
  buildFixturePlanChecks: catalog.buildFixturePlanChecks,
  classifyGeneratedStatement: catalog.classifyGeneratedStatement,
  createPostgresAdapter,
  createPostgresScope: createScope,
  getPostgresAdapter,
  readJsonFile: contract.readJsonFile,
  validateObservation: contract.validateObservation,
  validateRequest: contract.validateRequest,
};
