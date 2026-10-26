/** AEXOS-owned, transport-neutral Cerberus gateway contract. */

'use strict';

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');

const PROTOCOL = 'aexos.cerberus/v1';
const OPERATIONS = Object.freeze(['ingest', 'query']);
const DEFAULT_MAX_PAYLOAD_BYTES = 1024 * 1024;
const schema = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '../../schemas/cerberus-gateway-v1.schema.json'),
  'utf8',
));
const ajv = new Ajv({ allErrors: true, strict: false });
const validateSchema = ajv.compile(schema);

class CerberusContractError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'CerberusContractError';
    this.code = code;
    this.details = details;
  }
}

function schemaErrors() {
  return (validateSchema.errors || []).map((error) => ({
    path: error.instancePath || '/',
    keyword: error.keyword,
    message: error.message,
  }));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function validateRequest(request, options = {}) {
  if (!validateSchema(request)) {
    throw new CerberusContractError(
      'CERBERUS_REQUEST_INVALID',
      'Cerberus request does not match aexos.cerberus/v1.',
      { errors: schemaErrors() },
    );
  }
  const maxPayloadBytes = options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;
  if (!Number.isInteger(maxPayloadBytes) || maxPayloadBytes < 1) {
    throw new CerberusContractError(
      'CERBERUS_LIMIT_INVALID',
      'Cerberus maxPayloadBytes must be a positive integer.',
    );
  }
  const payloadBytes = Buffer.byteLength(JSON.stringify(request.payload));
  if (payloadBytes > maxPayloadBytes) {
    throw new CerberusContractError(
      'CERBERUS_PAYLOAD_TOO_LARGE',
      `Cerberus payload exceeds the ${maxPayloadBytes} byte limit.`,
      { payloadBytes, maxPayloadBytes },
    );
  }
  return deepFreeze(JSON.parse(JSON.stringify(request)));
}

function validateProvenance(provenance) {
  if (
    !provenance || typeof provenance !== 'object'
    || typeof provenance.workerVersion !== 'string' || provenance.workerVersion.trim() === ''
    || !/^[a-f0-9]{64}$/.test(String(provenance.sourceHash || ''))
    || !Number.isFinite(Date.parse(provenance.processedAt))
  ) {
    throw new CerberusContractError(
      'CERBERUS_PROVENANCE_INVALID',
      'Cerberus response requires workerVersion, sourceHash and processedAt provenance.',
    );
  }
  return {
    workerVersion: provenance.workerVersion.trim(),
    sourceHash: provenance.sourceHash,
    processedAt: new Date(Date.parse(provenance.processedAt)).toISOString(),
  };
}

function validateResponse(response, request) {
  if (!response || typeof response !== 'object') {
    throw new CerberusContractError('CERBERUS_RESPONSE_INVALID', 'Cerberus response must be an object.');
  }
  if (
    response.protocol !== PROTOCOL
    || response.requestId !== request.requestId
    || response.operation !== request.operation
  ) {
    throw new CerberusContractError(
      'CERBERUS_CORRELATION_MISMATCH',
      'Cerberus response protocol or correlation does not match the request.',
    );
  }
  if (response.status === 'error') {
    const code = typeof response.error?.code === 'string'
      ? response.error.code
      : 'CERBERUS_WORKER_ERROR';
    throw new CerberusContractError(
      code,
      'Cerberus worker rejected the operation.',
      { retryable: response.error?.retryable === true },
    );
  }
  if (response.status !== 'success' || !Object.prototype.hasOwnProperty.call(response, 'data')) {
    throw new CerberusContractError(
      'CERBERUS_RESPONSE_INVALID',
      'Cerberus response must contain success data or a valid error envelope.',
    );
  }
  return {
    protocol: PROTOCOL,
    requestId: request.requestId,
    operation: request.operation,
    status: 'success',
    data: response.data,
    provenance: validateProvenance(response.provenance),
  };
}

module.exports = {
  PROTOCOL,
  OPERATIONS,
  DEFAULT_MAX_PAYLOAD_BYTES,
  CerberusContractError,
  validateRequest,
  validateResponse,
  deepFreeze,
};
