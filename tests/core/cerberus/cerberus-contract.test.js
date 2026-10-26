'use strict';

const crypto = require('crypto');
const {
  PROTOCOL,
  validateRequest,
  validateResponse,
} = require('../../../.aexos-core/core/cerberus/cerberus-contract');

function request(operation = 'ingest') {
  return {
    protocol: PROTOCOL,
    requestId: 'req-001',
    idempotencyKey: 'idem-0001',
    operation,
    projectId: 'project-one',
    payload: operation === 'ingest' ? {
      source: { id: 'doc-1', type: 'markdown', sha256: 'a'.repeat(64) },
      document: { encoding: 'utf8', data: '# fixture' },
    } : { text: 'fixture query', limit: 5 },
  };
}

function response(input) {
  return {
    protocol: PROTOCOL,
    requestId: input.requestId,
    operation: input.operation,
    status: 'success',
    data: { ok: true },
    provenance: {
      workerVersion: '1.0.0',
      sourceHash: crypto.createHash('sha256').update('source').digest('hex'),
      processedAt: '2026-09-04T00:00:00Z',
    },
  };
}

describe('aexos.cerberus/v1 contract', () => {
  it.each(['ingest', 'query'])('accepts a valid %s request and response', (operation) => {
    const input = validateRequest(request(operation));
    expect(Object.isFrozen(input)).toBe(true);
    expect(Object.isFrozen(input.payload)).toBe(true);
    if (operation === 'ingest') expect(Object.isFrozen(input.payload.source)).toBe(true);
    expect(validateResponse(response(input), input)).toMatchObject({
      protocol: PROTOCOL, operation, status: 'success',
    });
  });

  it.each([
    ['version', (input) => { input.protocol = 'cerberus/v2'; }],
    ['operation', (input) => { input.operation = 'install'; }],
    ['project', (input) => { delete input.projectId; }],
    ['payload', (input) => { input.payload = {}; }],
  ])('rejects unsupported or malformed %s', (_label, mutate) => {
    const input = request();
    mutate(input);
    expect(() => validateRequest(input)).toThrow(expect.objectContaining({
      code: 'CERBERUS_REQUEST_INVALID',
    }));
  });

  it('rejects oversized payloads before transport', () => {
    expect(() => validateRequest(request(), { maxPayloadBytes: 8 })).toThrow(
      expect.objectContaining({ code: 'CERBERUS_PAYLOAD_TOO_LARGE' }),
    );
  });

  it('rejects spoofed correlation and invalid provenance', () => {
    const input = request();
    const spoofed = response(input);
    spoofed.requestId = 'req-other';
    expect(() => validateResponse(spoofed, input)).toThrow(expect.objectContaining({
      code: 'CERBERUS_CORRELATION_MISMATCH',
    }));
    const invalid = response(input);
    invalid.provenance.sourceHash = 'not-a-hash';
    expect(() => validateResponse(invalid, input)).toThrow(expect.objectContaining({
      code: 'CERBERUS_PROVENANCE_INVALID',
    }));
  });

  it('maps error envelopes without exposing worker text', () => {
    const input = request();
    expect(() => validateResponse({
      protocol: PROTOCOL,
      requestId: input.requestId,
      operation: input.operation,
      status: 'error',
      error: { code: 'CERBERUS_UNAVAILABLE', message: 'secret content', retryable: true },
    }, input)).toThrow(expect.objectContaining({
      code: 'CERBERUS_UNAVAILABLE',
      message: 'Cerberus worker rejected the operation.',
      details: { retryable: true },
    }));
  });
});
