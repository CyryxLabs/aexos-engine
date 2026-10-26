/** Capability-gated Cerberus gateway with timeout, retry and sanitized receipts. */

'use strict';

const crypto = require('crypto');
const { validateRequest, validateResponse } = require('./cerberus-contract');

const TRANSIENT_CODES = new Set(['CERBERUS_TIMEOUT', 'CERBERUS_UNAVAILABLE']);

class CerberusGatewayError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'CerberusGatewayError';
    this.code = code;
    this.details = details;
  }
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function normalizeInteger(value, fallback, field, minimum, maximum) {
  const candidate = value ?? fallback;
  if (!Number.isInteger(candidate) || candidate < minimum || candidate > maximum) {
    throw new CerberusGatewayError(
      'CERBERUS_LIMIT_INVALID',
      `${field} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return candidate;
}

class CerberusGateway {
  constructor(options = {}) {
    if (!options.capabilityBroker || typeof options.capabilityBroker.verify !== 'function') {
      throw new CerberusGatewayError(
        'CERBERUS_CAPABILITY_BROKER_REQUIRED',
        'Cerberus gateway requires the canonical capability broker.',
      );
    }
    if (typeof options.transport !== 'function') {
      throw new CerberusGatewayError(
        'CERBERUS_TRANSPORT_REQUIRED',
        'Cerberus gateway requires one injected transport.',
      );
    }
    if (options.auditSink !== undefined && typeof options.auditSink !== 'function') {
      throw new CerberusGatewayError(
        'CERBERUS_AUDIT_SINK_INVALID',
        'Cerberus gateway auditSink must be a function.',
      );
    }
    this.capabilityBroker = options.capabilityBroker;
    this.transport = options.transport;
    this.auditSink = options.auditSink || null;
    this.timeoutMs = normalizeInteger(options.timeoutMs, 30_000, 'timeoutMs', 1, 300_000);
    this.maxRetries = normalizeInteger(options.maxRetries, 1, 'maxRetries', 0, 3);
    this.maxPayloadBytes = normalizeInteger(
      options.maxPayloadBytes,
      1024 * 1024,
      'maxPayloadBytes',
      1,
      16 * 1024 * 1024,
    );
    this.maxResponseBytes = normalizeInteger(
      options.maxResponseBytes,
      1024 * 1024,
      'maxResponseBytes',
      1,
      16 * 1024 * 1024,
    );
  }

  async _attempt(request, signal) {
    if (signal?.aborted) {
      throw new CerberusGatewayError('CERBERUS_CANCELLED', 'Cerberus operation was cancelled.');
    }
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new CerberusGatewayError('CERBERUS_TIMEOUT', 'Cerberus operation timed out.'));
        controller.abort();
      }, this.timeoutMs);
    });
    try {
      const response = await Promise.race([
        Promise.resolve().then(() => this.transport(request, { signal: controller.signal })),
        timeout,
      ]);
      const responseBytes = Buffer.byteLength(JSON.stringify(response));
      if (responseBytes > this.maxResponseBytes) {
        throw new CerberusGatewayError(
          'CERBERUS_OUTPUT_LIMIT',
          'Cerberus response exceeded the bounded output limit.',
          { responseBytes, maxResponseBytes: this.maxResponseBytes },
        );
      }
      if (signal?.aborted) {
        throw new CerberusGatewayError('CERBERUS_CANCELLED', 'Cerberus operation was cancelled.');
      }
      return validateResponse(response, request);
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  }

  async execute(input = {}) {
    const request = validateRequest(input.request, { maxPayloadBytes: this.maxPayloadBytes });
    const idempotencyHash = digest(request.idempotencyKey);
    const projectIdHash = digest(request.projectId);
    const payloadHash = digest(request.payload);
    const identity = input.identity || {};
    this.capabilityBroker.verify(input.capabilityToken, {
      agentId: identity.agentId,
      task: identity.task,
      capability: 'cerberus.knowledge',
      action: request.operation,
      resource: identity.resource,
      scope: request.projectId,
    });

    let response;
    let attemptCount = 0;
    while (attemptCount <= this.maxRetries) {
      attemptCount += 1;
      try {
        response = await this._attempt(request, input.signal);
        break;
      } catch (error) {
        const retryable = TRANSIENT_CODES.has(error.code) || error.details?.retryable === true;
        if (!retryable || attemptCount > this.maxRetries || input.signal?.aborted) throw error;
      }
    }

    const receipt = Object.freeze({
      protocol: request.protocol,
      requestId: request.requestId,
      idempotencyHash,
      operation: request.operation,
      projectIdHash,
      payloadHash,
      attemptCount,
      status: response.status,
      provenance: response.provenance,
    });
    if (this.auditSink) {
      try {
        await this.auditSink(receipt);
      } catch {
        throw new CerberusGatewayError(
          'CERBERUS_AUDIT_FAILED',
          'Cerberus gateway could not persist its sanitized receipt.',
        );
      }
    }
    return { response, receipt };
  }
}

module.exports = { CerberusGateway, CerberusGatewayError, TRANSIENT_CODES };
