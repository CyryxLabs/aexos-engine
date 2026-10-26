'use strict';

const fs = require('fs');
const Ajv = require('ajv');
const { clone, digest, stableStringify } = require('../execution/durable-evidence');

const REQUEST_SCHEMA_VERSION = 'aexos.database-audit.request/v1';
const OBSERVATION_SCHEMA_VERSION = 'aexos.database-audit.fixture-observation/v1';
const MAX_INPUT_BYTES = 1024 * 1024;
const MAX_INPUT_DEPTH = 32;
const IDENTIFIER = '^[A-Za-z_][A-Za-z0-9_]{0,62}$';
const ID = '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$';
const HASH = '^[a-f0-9]{64}$';
const REASON_CODE = '^[A-Z][A-Z0-9_]{1,63}$';
const CHECKS = Object.freeze([
  'schema', 'indexes', 'migration', 'rls', 'privileges', 'plans', 'backup-readiness',
]);
const LIMIT_MAXIMA = Object.freeze({
  connectTimeoutMs: 5000,
  statementTimeoutMs: 2000,
  lockTimeoutMs: 250,
  idleTransactionTimeoutMs: 3000,
  totalAuditTimeoutMs: 30000,
  maxStatements: 64,
  maxRowsPerCheck: 1000,
  maxRowsTotal: 5000,
  maxMetadataBytes: 4 * 1024 * 1024,
  maxStringBytes: 16 * 1024,
  maxPlanBytes: 256 * 1024,
  maxPlanDepth: 32,
  maxPlanNodes: 1000,
  maxManifestBytes: 1024 * 1024,
});
const SECRET_KEY = /(?:password|passwd|secret|token|api[_-]?key|credential|connection(?:uri|string)|url|dsn|sslkey|private[_-]?key)/i;
// Recognizable-pattern policy adapted from the existing static snapshot provider.
// It deliberately does not claim detection of arbitrary unknown secrets.
const SECRET_VALUE = /(?:AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:https?|postgres(?:ql)?):\/\/[^\s/:@]+:[^\s/@]+@|\b(?:sk-(?:test-)?[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{8,}|(?:sk|pk)_(?:live|test)_[A-Za-z0-9_-]{8,})\b|\bBearer\s+[^\s,;]+|(?:api[_-]?key|access[_-]?(?:key|token)|token|secret|password|passwd|pwd)\s*[:=]\s*['"]?[^'"\s,;}]{8,})/i;
// Match quoted assignment keys and escaped quoted values before any hashing.
// The value is never captured in diagnostics or copied to a report.
const SECRET_ASSIGNMENT = /\b(?:api[_-]?key|access[_-]?(?:key|token)|auth[_-]?token|client[_-]?secret|credential|token|secret|password|passwd|pwd)["']?\s*[:=]\s*(?:"(?:\\.|[^"\\\r\n])+"|'(?:\\.|[^'\\\r\n])+'|[^\s,;"']+)/i;
const VALIDATED_REQUESTS = new WeakSet();
const VALIDATED_OBSERVATIONS = new WeakSet();
const OBSERVATION_REQUEST_HASHES = new WeakMap();

class DatabaseReliabilityError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'DatabaseReliabilityError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new DatabaseReliabilityError(code, message, details);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

const limitProperties = Object.fromEntries(Object.keys(LIMIT_MAXIMA).map((key) => [key, {
  type: 'integer', minimum: 1, maximum: LIMIT_MAXIMA[key],
}]));

const planRequestSchema = {
  type: 'object', additionalProperties: false,
  required: ['id', 'relation', 'projection', 'equalityPredicates', 'orderBy', 'limit'],
  properties: {
    id: { type: 'string', pattern: ID },
    relation: {
      type: 'object', additionalProperties: false, required: ['schema', 'name'],
      properties: { schema: { type: 'string', pattern: IDENTIFIER }, name: { type: 'string', pattern: IDENTIFIER } },
    },
    projection: { type: 'array', minItems: 1, maxItems: 8, uniqueItems: true,
      items: { type: 'string', pattern: IDENTIFIER } },
    equalityPredicates: { type: 'array', maxItems: 8, items: {
      type: 'object', additionalProperties: false, required: ['column', 'valueType', 'value'],
      properties: {
        column: { type: 'string', pattern: IDENTIFIER }, valueType: { const: 'int4' },
        value: { type: 'integer', minimum: -2147483648, maximum: 2147483647 },
      },
    } },
    orderBy: { type: 'array', maxItems: 4, uniqueItems: true, items: { type: 'string', pattern: IDENTIFIER } },
    limit: { type: 'integer', minimum: 1, maximum: 1000 },
  },
};

const requestSchema = {
  type: 'object', additionalProperties: false,
  required: ['schemaVersion', 'auditId', 'connectionRef', 'dialect', 'expectedMajor', 'capability',
    'schemas', 'checks', 'limits', 'planRequests', 'redaction'],
  properties: {
    schemaVersion: { const: REQUEST_SCHEMA_VERSION },
    auditId: { type: 'string', pattern: ID },
    connectionRef: { type: 'string', pattern: ID },
    dialect: { const: 'postgresql' },
    expectedMajor: { const: 16 },
    capability: { const: 'database:readonly-audit' },
    schemas: { type: 'array', minItems: 1, maxItems: 16, uniqueItems: true,
      items: { type: 'string', pattern: IDENTIFIER, not: { enum: ['pg_catalog', 'information_schema'] } } },
    checks: { type: 'array', minItems: 1, maxItems: 7, uniqueItems: true, items: { enum: CHECKS } },
    limits: { type: 'object', additionalProperties: false, required: Object.keys(LIMIT_MAXIMA), properties: limitProperties },
    planRequests: { type: 'array', maxItems: 32, items: planRequestSchema },
    migrationManifestRef: { type: 'string', pattern: ID },
    backupEvidenceRef: { type: 'string', pattern: ID },
    redaction: { type: 'object', additionalProperties: false, required: ['mode'], properties: { mode: { const: 'minimal' } } },
  },
};

const namedFact = {
  type: 'object', additionalProperties: false, required: ['id', 'type'],
  properties: {
    id: { type: 'string', maxLength: 256 },
    type: { type: 'string', enum: ['primary-key', 'foreign-key', 'unique', 'check', 'not-null'] },
    columns: { type: 'array', maxItems: 32, items: { type: 'string', maxLength: 256 } },
    referencedTable: { type: ['string', 'null'], maxLength: 256 },
    referencedColumns: { type: 'array', maxItems: 32, items: { type: 'string', maxLength: 256 } },
    validated: { type: 'boolean' },
  },
};
const indexFact = {
  type: 'object', additionalProperties: false, required: ['id', 'columns', 'unique'],
  properties: {
    id: { type: 'string', maxLength: 256 },
    columns: { type: 'array', minItems: 1, maxItems: 16, items: { type: 'string', maxLength: 256 } },
    includeColumns: { type: 'array', maxItems: 16, items: { type: 'string', maxLength: 256 } },
    unique: { type: 'boolean' }, valid: { type: 'boolean' }, ready: { type: 'boolean' },
    partial: { type: 'boolean' }, expression: { type: 'boolean' },
  },
};
const migrationFact = {
  type: 'object', additionalProperties: false, required: ['id', 'order', 'hash'],
  properties: { id: { type: 'string', maxLength: 256 }, order: { type: 'integer', minimum: 0, maximum: 1000000 }, hash: { type: 'string', pattern: HASH } },
};
const planNode = {
  $id: 'planNode', type: 'object', additionalProperties: false,
  required: ['nodeType', 'totalCost', 'planRows', 'planWidth', 'children'],
  properties: {
    nodeType: { enum: ['Seq Scan', 'Index Scan', 'Index Only Scan', 'Bitmap Heap Scan', 'Bitmap Index Scan', 'Limit', 'Sort'] },
    totalCost: { type: 'number', minimum: 0, maximum: 1e15 },
    planRows: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
    planWidth: { type: 'integer', minimum: 0, maximum: 1048576 },
    children: { type: 'array', maxItems: 1000, items: { $ref: 'planNode' } },
  },
};
const observationSchema = {
  type: 'object', additionalProperties: false,
  required: ['schemaVersion', 'sourceKind', 'adapter', 'databaseIdentity', 'observedAt', 'coverage',
    'schemaObjects', 'migrations', 'rls', 'privileges', 'backup', 'plans', 'limitations'],
  properties: {
    schemaVersion: { const: OBSERVATION_SCHEMA_VERSION }, sourceKind: { const: 'fixture' },
    adapter: { type: 'object', additionalProperties: false, required: ['id', 'version', 'verified'],
      properties: { id: { const: 'fixture' }, version: { type: 'string', pattern: ID }, verified: { const: false } } },
    databaseIdentity: { type: 'object', additionalProperties: false, required: ['fixtureId', 'postgresMajor'],
      properties: { fixtureId: { type: 'string', pattern: ID }, postgresMajor: { const: 16 } } },
    observedAt: { type: 'string', format: 'date-time' },
    coverage: { type: 'object', additionalProperties: false, required: ['catalogVisibility', 'roleGraph', 'coveredSchemas'], properties: {
      catalogVisibility: { enum: ['complete', 'partial', 'unavailable'] }, roleGraph: { enum: ['complete', 'partial', 'unavailable'] },
      coveredSchemas: { type: 'array', maxItems: 16, uniqueItems: true, items: { type: 'string', maxLength: 256 } },
    } },
    schemaObjects: { type: 'array', maxItems: 1000, items: {
      type: 'object', additionalProperties: false, required: ['schema', 'name', 'kind', 'constraints', 'indexes', 'expectedConstraints', 'expectedIndexes'],
      properties: {
        schema: { type: 'string', maxLength: 256 }, name: { type: 'string', maxLength: 256 }, kind: { const: 'table' },
        constraints: { type: 'array', maxItems: 64, items: namedFact }, expectedConstraints: { type: 'array', maxItems: 64, items: namedFact },
        indexes: { type: 'array', maxItems: 64, items: indexFact }, expectedIndexes: { type: 'array', maxItems: 64, items: indexFact },
      },
    } },
    migrations: { type: 'object', additionalProperties: false, required: ['status', 'expected', 'observed'], properties: {
      status: { enum: ['observed', 'partial', 'unavailable'] }, expected: { type: 'array', maxItems: 1000, items: migrationFact },
      observed: { type: 'array', maxItems: 1000, items: migrationFact },
    } },
    rls: { type: 'array', maxItems: 1000, items: {
      type: 'object', additionalProperties: false, required: ['schema', 'table', 'enabled', 'forced', 'policies', 'grants'], properties: {
        schema: { type: 'string', maxLength: 256 }, table: { type: 'string', maxLength: 256 }, enabled: { type: 'boolean' }, forced: { type: 'boolean' },
        policies: { type: 'array', maxItems: 64, items: { type: 'object', additionalProperties: false,
          required: ['id', 'command', 'roles', 'permissive', 'classification'], properties: {
            id: { type: 'string', maxLength: 256 }, command: { enum: ['ALL', 'SELECT', 'INSERT', 'UPDATE', 'DELETE'] },
            roles: { type: 'array', maxItems: 32, uniqueItems: true, items: { type: 'string', maxLength: 256 } }, permissive: { type: 'boolean' },
            classification: { enum: ['structural', 'seeded-always-true'] },
          } } },
        grants: { type: 'array', maxItems: 32, uniqueItems: true, items: { type: 'string', maxLength: 256 } },
      },
    } },
    privileges: { type: 'object', additionalProperties: false, required: ['status', 'roles', 'grants', 'graphTruncated'], properties: {
      status: { enum: ['observed', 'partial', 'unavailable'] }, graphTruncated: { type: 'boolean' },
      roles: { type: 'array', maxItems: 1000, items: { type: 'object', additionalProperties: false,
        required: ['id', 'superuser', 'bypassRls', 'canCreateDb', 'canCreateRole'], properties: {
          id: { type: 'string', maxLength: 256 }, superuser: { type: 'boolean' }, bypassRls: { type: 'boolean' },
          canCreateDb: { type: 'boolean' }, canCreateRole: { type: 'boolean' },
        } } },
      grants: { type: 'array', maxItems: 1000, items: { type: 'object', additionalProperties: false,
        required: ['schema', 'object', 'grantee', 'privilege'], properties: {
          schema: { type: 'string', maxLength: 256 }, object: { type: 'string', maxLength: 256 },
          grantee: { type: 'string', maxLength: 256 }, privilege: { enum: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'USAGE', 'CREATE'] },
        } } },
    } },
    backup: { type: 'object', additionalProperties: false,
      required: ['status', 'hasSchedule', 'hasRetention', 'hasEncryption', 'latestReceiptVerified'], properties: {
        status: { enum: ['declared', 'observed-setting', 'receipt-verified', 'partial', 'unavailable'] },
        hasSchedule: { type: ['boolean', 'null'] }, hasRetention: { type: ['boolean', 'null'] },
        hasEncryption: { type: ['boolean', 'null'] }, latestReceiptVerified: { type: ['boolean', 'null'] },
      } },
    plans: { type: 'array', maxItems: 32, items: { type: 'object', additionalProperties: false,
      required: ['requestId', 'status', 'plan'], properties: {
        requestId: { type: 'string', pattern: ID }, status: { enum: ['estimated', 'not-assessed', 'denied', 'unavailable'] },
        plan: { anyOf: [{ type: 'null' }, { $ref: 'planNode' }] },
      } } },
    limitations: { type: 'array', maxItems: 128, uniqueItems: true, items: { type: 'string', pattern: REASON_CODE } },
  },
};

const ajv = new Ajv({ allErrors: true, strict: false });
ajv.addFormat('date-time', { validate: (value) => Number.isFinite(Date.parse(value)) });
ajv.addSchema(planNode);
const validateRequestShape = ajv.compile(requestSchema);
const validateObservationShape = ajv.compile(observationSchema);

function assertSafeTree(value, limits = {}, label = 'input') {
  const seen = new Set();
  let entries = 0;
  function visit(item, depth, key) {
    if (depth > (limits.maxDepth || MAX_INPUT_DEPTH)) fail('DATABASE_INPUT_DEPTH', `${label} exceeds its depth bound.`);
    if (typeof item === 'string') {
      if (Buffer.byteLength(item) > (limits.maxStringBytes || LIMIT_MAXIMA.maxStringBytes)) fail('DATABASE_STRING_LIMIT', `${label} contains an oversized string.`);
      if (SECRET_VALUE.test(item) || SECRET_ASSIGNMENT.test(item)) fail('DATABASE_SECRET_VALUE_DENIED', `${label} contains credential-shaped text.`);
      return;
    }
    if (!item || typeof item !== 'object') return;
    if (seen.has(item)) fail('DATABASE_INPUT_CYCLE', `${label} must be acyclic.`);
    seen.add(item);
    for (const [childKey, child] of Object.entries(item)) {
      entries += 1;
      if (entries > (limits.maxEntries || 20000)) fail('DATABASE_ROW_LIMIT', `${label} exceeds its entry bound.`);
      if (SECRET_KEY.test(childKey)) fail('DATABASE_SECRET_FIELD_DENIED', `${label} contains a credential-bearing field.`);
      visit(child, depth + 1, childKey || key);
    }
    seen.delete(item);
  }
  visit(value, 0, '');
}

function schemaFailure(validate, input, code, label) {
  if (!validate(input)) fail(code, `${label} does not match the closed v1 schema.`, {
    errors: clone(validate.errors).map((error) => ({ keyword: error.keyword, instancePath: error.instancePath })),
  });
}

function assertUniquePlanIds(request) {
  const ids = request.planRequests.map((item) => item.id);
  if (new Set(ids).size !== ids.length) fail('DATABASE_PLAN_ID_DUPLICATE', 'Plan request ids must be unique.');
  if (request.planRequests.length && !request.checks.includes('plans')) fail('DATABASE_PLAN_CHECK_REQUIRED', 'Plan requests require the plans check.');
  if (request.checks.includes('plans') && !request.planRequests.length) fail('DATABASE_PLAN_SCOPE_MISSING', 'The plans check requires at least one fixture plan request.');
  if (request.checks.includes('migration') && !request.migrationManifestRef) fail('DATABASE_MIGRATION_MANIFEST_REQUIRED', 'Migration analysis requires an approved manifest reference.');
  if (request.checks.includes('backup-readiness') && !request.backupEvidenceRef) fail('DATABASE_BACKUP_EVIDENCE_REQUIRED', 'Backup readiness requires an approved metadata reference.');
  if (request.planRequests.some((item) => !request.schemas.includes(item.relation.schema))) {
    fail('DATABASE_PLAN_SCOPE_MISMATCH', 'Fixture plan relations must belong to the requested schema scope.');
  }
}

function validateRequest(input) {
  assertSafeTree(input, { maxDepth: MAX_INPUT_DEPTH, maxStringBytes: LIMIT_MAXIMA.maxStringBytes }, 'Database request');
  if (Buffer.byteLength(stableStringify(input)) > MAX_INPUT_BYTES) fail('DATABASE_REQUEST_LIMIT', 'Database request exceeds its byte bound.');
  schemaFailure(validateRequestShape, input, 'DATABASE_REQUEST_INVALID', 'Database request');
  assertUniquePlanIds(input);
  const request = clone(input);
  request.schemas.sort(); request.checks.sort(); request.planRequests.sort((a, b) => a.id.localeCompare(b.id));
  const identity = Object.freeze({ request: deepFreeze(request), requestHash: digest(request) });
  VALIDATED_REQUESTS.add(identity);
  return identity;
}

function resolveValidatedRequest(input) {
  if (input && typeof input === 'object' && VALIDATED_REQUESTS.has(input)) return input;
  return validateRequest(input?.request || input);
}

function countPlanNodes(node) {
  if (!node) return 0;
  return 1 + node.children.reduce((sum, child) => sum + countPlanNodes(child), 0);
}

function countObservationRows(observation, limits) {
  const schemaRows = observation.schemaObjects.reduce((sum, object) => sum + 1
    + object.constraints.length + object.expectedConstraints.length, 0);
  const indexRows = observation.schemaObjects.reduce((sum, object) => sum + 1
    + object.indexes.length + object.expectedIndexes.length, 0);
  const migrationRows = observation.migrations.expected.length + observation.migrations.observed.length;
  const rlsRows = observation.rls.reduce((sum, table) => sum + 1 + table.grants.length
    + table.policies.reduce((policySum, policy) => policySum + 1 + policy.roles.length, 0), 0);
  const privilegeRows = observation.privileges.roles.length + observation.privileges.grants.length;
  const backupRows = 1;
  const planRows = observation.plans.reduce((sum, plan) => sum + 1 + countPlanNodes(plan.plan), 0);
  const byCheck = { schema: schemaRows, indexes: indexRows, migration: migrationRows, rls: rlsRows,
    privileges: privilegeRows, 'backup-readiness': backupRows, plans: planRows };
  if (Object.values(byCheck).some((count) => count > limits.maxRowsPerCheck)) {
    fail('DATABASE_ROW_LIMIT', 'Fixture observation exceeds a per-check fact-row bound.');
  }
  const total = observation.schemaObjects.length
    + observation.schemaObjects.reduce((sum, object) => sum + object.constraints.length
      + object.expectedConstraints.length + object.indexes.length + object.expectedIndexes.length, 0)
    + migrationRows + rlsRows + privilegeRows + backupRows + planRows;
  if (total > limits.maxRowsTotal) fail('DATABASE_ROW_LIMIT', 'Fixture observation exceeds the total row bound.');
}

function assertUnique(items, identity, code) {
  const seen = new Set();
  for (const item of items) {
    const key = stableStringify(identity(item));
    if (seen.has(key)) fail(code, 'Fixture observation contains a duplicate natural identity.');
    seen.add(key);
  }
}

function assertNaturalIdentities(observation) {
  assertUnique(observation.schemaObjects, (item) => [item.schema, item.name], 'DATABASE_OBJECT_ID_DUPLICATE');
  for (const object of observation.schemaObjects) {
    assertUnique(object.constraints, (item) => item.id, 'DATABASE_CONSTRAINT_ID_DUPLICATE');
    assertUnique(object.expectedConstraints, (item) => item.id, 'DATABASE_EXPECTED_CONSTRAINT_ID_DUPLICATE');
    assertUnique(object.indexes, (item) => item.id, 'DATABASE_INDEX_ID_DUPLICATE');
    assertUnique(object.expectedIndexes, (item) => item.id, 'DATABASE_EXPECTED_INDEX_ID_DUPLICATE');
  }
  assertUnique(observation.migrations.expected, (item) => item.id, 'DATABASE_EXPECTED_MIGRATION_ID_DUPLICATE');
  assertUnique(observation.migrations.observed, (item) => item.id, 'DATABASE_MIGRATION_ID_DUPLICATE');
  assertUnique(observation.rls, (item) => [item.schema, item.table], 'DATABASE_RLS_TABLE_DUPLICATE');
  observation.rls.forEach((table) => assertUnique(table.policies, (item) => item.id, 'DATABASE_POLICY_ID_DUPLICATE'));
  assertUnique(observation.privileges.roles, (item) => item.id, 'DATABASE_ROLE_ID_DUPLICATE');
  assertUnique(observation.privileges.grants, (item) => [item.schema, item.object, item.grantee, item.privilege], 'DATABASE_GRANT_DUPLICATE');
}

function assertObservationScope(observation, request) {
  const requested = new Set(request.schemas);
  const referencedSchemas = [
    ...observation.coverage.coveredSchemas,
    ...observation.schemaObjects.map((item) => item.schema),
    ...observation.rls.map((item) => item.schema),
    ...observation.privileges.grants.map((item) => item.schema),
  ];
  if (referencedSchemas.some((schema) => !requested.has(schema))) {
    fail('DATABASE_OBSERVATION_SCOPE_MISMATCH', 'Fixture observation contains facts outside the requested schema scope.');
  }
  if (observation.coverage.catalogVisibility === 'complete'
    && request.schemas.some((schema) => !observation.coverage.coveredSchemas.includes(schema))) {
    fail('DATABASE_OBSERVATION_SCOPE_MISSING', 'Complete fixture coverage must name every requested schema.');
  }
  if (observation.coverage.catalogVisibility === 'unavailable' && observation.coverage.coveredSchemas.length) {
    fail('DATABASE_OBSERVATION_SCOPE_INVALID', 'Unavailable fixture coverage cannot claim covered schemas.');
  }
}

function assertObservationSemantics(observation) {
  if (observation.plans.some((plan) => (plan.status === 'estimated') !== Boolean(plan.plan))) {
    fail('DATABASE_PLAN_OBSERVATION_INVALID', 'Estimated fixture plans require a tree and non-estimated plans require null.');
  }
}

function inspectPlan(node, state, limits, depth = 1) {
  if (!node) return;
  state.nodes += 1;
  if (depth > limits.maxPlanDepth) fail('DATABASE_PLAN_DEPTH_LIMIT', 'Fixture plan exceeds its depth bound.');
  if (state.nodes > limits.maxPlanNodes) fail('DATABASE_PLAN_NODE_LIMIT', 'Fixture plan exceeds its node bound.');
  node.children.forEach((child) => inspectPlan(child, state, limits, depth + 1));
}

function validateObservation(input, validatedRequest) {
  const identity = resolveValidatedRequest(validatedRequest);
  const limits = identity.request.limits;
  assertSafeTree(input, { maxDepth: Math.max(MAX_INPUT_DEPTH, limits.maxPlanDepth + 8), maxStringBytes: limits.maxStringBytes }, 'Fixture observation');
  const bytes = Buffer.byteLength(stableStringify(input));
  if (bytes > limits.maxMetadataBytes) fail('DATABASE_METADATA_LIMIT', 'Fixture observation exceeds the metadata byte bound.');
  schemaFailure(validateObservationShape, input, 'DATABASE_OBSERVATION_INVALID', 'Fixture observation');
  if (input.databaseIdentity.postgresMajor !== identity.request.expectedMajor) fail('DATABASE_MAJOR_UNSUPPORTED', 'Fixture major does not match the request.');
  assertObservationScope(input, identity.request);
  assertObservationSemantics(input);
  assertNaturalIdentities(input);
  countObservationRows(input, limits);
  const planIds = new Set(identity.request.planRequests.map((item) => item.id));
  if (input.plans.some((item) => !planIds.has(item.requestId)) || new Set(input.plans.map((item) => item.requestId)).size !== input.plans.length) {
    fail('DATABASE_PLAN_OBSERVATION_INVALID', 'Fixture plans must uniquely bind requested plan ids.');
  }
  let planBytes = 0;
  for (const plan of input.plans) {
    if (plan.plan) {
      planBytes += Buffer.byteLength(stableStringify(plan.plan));
      inspectPlan(plan.plan, { nodes: 0 }, limits);
    }
  }
  if (planBytes > limits.maxPlanBytes) fail('DATABASE_PLAN_BYTE_LIMIT', 'Fixture plans exceed their byte bound.');
  const result = Object.freeze({ observation: deepFreeze(clone(input)), observationHash: digest(input) });
  VALIDATED_OBSERVATIONS.add(result);
  OBSERVATION_REQUEST_HASHES.set(result, identity.requestHash);
  return result;
}

function resolveValidatedObservation(input, validatedRequest) {
  const requestIdentity = resolveValidatedRequest(validatedRequest);
  if (input && typeof input === 'object' && VALIDATED_OBSERVATIONS.has(input)
    && OBSERVATION_REQUEST_HASHES.get(input) === requestIdentity.requestHash) return input;
  return validateObservation(input?.observation || input, requestIdentity);
}

function readJsonFile(filePath, label = 'Database input') {
  const descriptor = fs.openSync(filePath, 'r');
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.size < 2 || stat.size > MAX_INPUT_BYTES) fail('DATABASE_INPUT_FILE_LIMIT', `${label} file is unavailable or outside its byte bound.`);
    const bytes = Buffer.alloc(stat.size);
    const read = fs.readSync(descriptor, bytes, 0, stat.size, 0);
    if (read !== stat.size) fail('DATABASE_INPUT_FILE_CHANGED', `${label} file changed during the bounded read.`);
    try { return JSON.parse(bytes.toString('utf8')); } catch (_error) { fail('DATABASE_INPUT_JSON_INVALID', `${label} file is not valid JSON.`); }
  } finally { fs.closeSync(descriptor); }
}

module.exports = {
  CHECKS, DatabaseReliabilityError, LIMIT_MAXIMA, MAX_INPUT_BYTES, OBSERVATION_SCHEMA_VERSION,
  REQUEST_SCHEMA_VERSION, assertSafeTree, deepFreeze, fail, readJsonFile, requestSchema, observationSchema,
  resolveValidatedObservation, resolveValidatedRequest, validateObservation, validateRequest,
};
