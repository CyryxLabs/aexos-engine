/**
 * Process-local least-privilege capability and secret-use broker.
 *
 * Leases are short-lived authorization artifacts. They are not license keys,
 * provider credentials, or durable cross-process grants.
 *
 * @module permissions/capability-broker
 */

'use strict';

const crypto = require('crypto');

const DEFAULT_LEASE_TTL_MS = 60_000;
const MAX_LEASE_TTL_MS = 5 * 60_000;

class CapabilityBrokerError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'CapabilityBrokerError';
    this.code = code;
    this.details = details;
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function normalizeSecret(secret) {
  const bytes = secret === undefined ? crypto.randomBytes(32) : Buffer.from(secret);
  if (bytes.length < 32) {
    throw new CapabilityBrokerError(
      'CAPABILITY_SIGNING_SECRET_INVALID',
      'Capability signing secret must contain at least 32 bytes.',
    );
  }
  return bytes;
}

function requireString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CapabilityBrokerError(
      'CAPABILITY_REQUEST_INVALID',
      `Capability request requires a non-empty ${field}.`,
      { field },
    );
  }
  return value.trim();
}

function normalizeActions(actions) {
  const list = Array.isArray(actions) ? actions : [actions];
  const normalized = [...new Set(list.map((action) => (
    typeof action === 'string' ? action.trim().toLowerCase() : ''
  )).filter(Boolean))].sort();
  if (normalized.length === 0) {
    throw new CapabilityBrokerError(
      'CAPABILITY_REQUEST_INVALID',
      'Capability grant requires at least one allowed action.',
      { field: 'actions' },
    );
  }
  return normalized;
}

function normalizeGrantRequest(request = {}) {
  return {
    agentId: requireString(request.agentId || request.agent, 'agentId'),
    task: requireString(request.task, 'task'),
    capability: requireString(request.capability, 'capability'),
    actions: normalizeActions(request.actions),
    resource: requireString(request.resource, 'resource'),
    scope: requireString(request.scope, 'scope'),
  };
}

function normalizeUseRequest(request = {}) {
  return {
    agentId: requireString(request.agentId || request.agent, 'agentId'),
    task: requireString(request.task, 'task'),
    capability: requireString(request.capability, 'capability'),
    action: requireString(request.action, 'action').toLowerCase(),
    resource: requireString(request.resource, 'resource'),
    scope: requireString(request.scope, 'scope'),
  };
}

function timingSafeHashEqual(left, right) {
  if (!/^[a-f0-9]{64}$/i.test(String(left)) || !/^[a-f0-9]{64}$/i.test(String(right))) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function publicLease(claims, status = 'active') {
  return {
    leaseId: claims.leaseId,
    agentId: claims.agentId,
    task: claims.task,
    capability: claims.capability,
    actions: [...claims.actions],
    resourceHash: claims.resourceHash,
    scopeHash: claims.scopeHash,
    issuedAt: new Date(claims.issuedAtMs).toISOString(),
    expiresAt: new Date(claims.expiresAtMs).toISOString(),
    status,
  };
}

class CapabilityBroker {
  constructor(options = {}) {
    if (options.policy !== undefined && typeof options.policy !== 'function') {
      throw new CapabilityBrokerError(
        'CAPABILITY_POLICY_INVALID',
        'Capability policy must be a function.',
      );
    }
    if (options.auditSink !== undefined && typeof options.auditSink !== 'function') {
      throw new CapabilityBrokerError(
        'CAPABILITY_AUDIT_SINK_INVALID',
        'Capability auditSink must be a function.',
      );
    }
    if (options.secretResolver !== undefined && typeof options.secretResolver !== 'function') {
      throw new CapabilityBrokerError(
        'CAPABILITY_SECRET_RESOLVER_INVALID',
        'Capability secretResolver must be a function.',
      );
    }
    if (options.clock !== undefined && typeof options.clock !== 'function') {
      throw new CapabilityBrokerError('CAPABILITY_CLOCK_INVALID', 'Capability clock must be a function.');
    }
    if (options.randomId !== undefined && typeof options.randomId !== 'function') {
      throw new CapabilityBrokerError(
        'CAPABILITY_LEASE_ID_INVALID',
        'Capability randomId must be a function.',
      );
    }

    this.policy = options.policy || (() => false);
    this.auditSink = options.auditSink || null;
    this.secretResolver = options.secretResolver || null;
    this.clock = options.clock || (() => new Date());
    this.randomId = options.randomId || (() => crypto.randomUUID());
    this.signingSecret = normalizeSecret(options.signingSecret);
    this.defaultTtlMs = options.defaultTtlMs ?? DEFAULT_LEASE_TTL_MS;
    this.active = new Map();
    this.revoked = new Map();
    this.lastAuditError = null;
    this._validateTtl(this.defaultTtlMs);
  }

  capabilities() {
    return {
      capabilityLeases: true,
      revocableCapabilities: true,
      justInTimeSecrets: Boolean(this.secretResolver),
      durableLeases: false,
    };
  }

  _nowMs() {
    const value = this.clock();
    const milliseconds = value instanceof Date ? value.getTime() : Number(value);
    if (!Number.isFinite(milliseconds)) {
      throw new CapabilityBrokerError(
        'CAPABILITY_CLOCK_INVALID',
        'Capability clock returned an invalid time.',
      );
    }
    return milliseconds;
  }

  _validateTtl(value) {
    if (!Number.isInteger(value) || value < 1 || value > MAX_LEASE_TTL_MS) {
      throw new CapabilityBrokerError(
        'CAPABILITY_TTL_INVALID',
        `Capability TTL must be an integer between 1 and ${MAX_LEASE_TTL_MS}ms.`,
      );
    }
    return value;
  }

  _cleanup(nowMs) {
    for (const [leaseId, claims] of this.active) {
      if (claims.expiresAtMs <= nowMs) this.active.delete(leaseId);
    }
    for (const [leaseId, claims] of this.revoked) {
      if (claims.expiresAtMs <= nowMs) this.revoked.delete(leaseId);
    }
  }

  _record(record) {
    if (!this.auditSink) return;
    try {
      this.auditSink(Object.freeze({ ...record }));
      this.lastAuditError = null;
    } catch (error) {
      this.lastAuditError = error;
      throw new CapabilityBrokerError(
        'CAPABILITY_AUDIT_FAILED',
        'Capability broker could not persist its sanitized audit record.',
      );
    }
  }

  _recordRejection(request, error, nowMs) {
    try {
      this._record({
        type: 'capability_rejected',
        agentId: request?.agentId || request?.agent || null,
        task: request?.task || null,
        capability: request?.capability || null,
        resourceHash: request?.resource ? sha256(request.resource) : null,
        scopeHash: request?.scope ? sha256(request.scope) : null,
        code: error.code || 'CAPABILITY_DENIED',
        decidedAt: new Date(nowMs).toISOString(),
      });
    } catch (auditError) {
      this.lastAuditError = auditError;
    }
  }

  _sign(payload) {
    return crypto.createHmac('sha256', this.signingSecret).update(payload).digest('base64url');
  }

  _encode(claims) {
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return `${payload}.${this._sign(payload)}`;
  }

  _decode(token) {
    if (!token || typeof token !== 'string') {
      throw new CapabilityBrokerError(
        'CAPABILITY_TOKEN_REQUIRED',
        'Capability use requires a lease token.',
      );
    }
    const parts = token.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new CapabilityBrokerError('CAPABILITY_TOKEN_INVALID', 'Capability lease is malformed.');
    }
    const expected = Buffer.from(this._sign(parts[0]), 'base64url');
    let actual;
    try {
      actual = Buffer.from(parts[1], 'base64url');
    } catch {
      actual = Buffer.alloc(0);
    }
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      throw new CapabilityBrokerError(
        'CAPABILITY_TOKEN_INVALID',
        'Capability lease signature is invalid.',
      );
    }
    try {
      const claims = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      if (
        !claims || claims.version !== 1 || !claims.leaseId
        || !Array.isArray(claims.actions) || !Number.isFinite(claims.expiresAtMs)
      ) {
        throw new Error('invalid claims');
      }
      return claims;
    } catch {
      throw new CapabilityBrokerError(
        'CAPABILITY_TOKEN_INVALID',
        'Capability lease payload is invalid.',
      );
    }
  }

  grant(request = {}) {
    const nowMs = this._nowMs();
    this._cleanup(nowMs);
    let claims;
    try {
      const normalized = normalizeGrantRequest(request);
      const decision = this.policy(Object.freeze({ ...normalized }));
      if (!(decision === true || decision?.allowed === true)) {
        throw new CapabilityBrokerError(
          'CAPABILITY_DENIED',
          'Capability request denied by policy.',
        );
      }
      const requestedTtlMs = this._validateTtl(request.ttlMs ?? this.defaultTtlMs);
      const policyTtlMs = this._validateTtl(decision?.ttlMs ?? requestedTtlMs);
      const ttlMs = Math.min(requestedTtlMs, policyTtlMs);
      const leaseId = String(this.randomId() || '');
      if (!leaseId || this.active.has(leaseId) || this.revoked.has(leaseId)) {
        throw new CapabilityBrokerError(
          'CAPABILITY_LEASE_ID_INVALID',
          'Capability broker could not allocate a unique lease id.',
        );
      }
      claims = {
        version: 1,
        leaseId,
        agentId: normalized.agentId,
        task: normalized.task,
        capability: normalized.capability,
        actions: normalized.actions,
        resourceHash: sha256(normalized.resource),
        scopeHash: sha256(normalized.scope),
        issuedAtMs: nowMs,
        expiresAtMs: nowMs + ttlMs,
      };
      const token = this._encode(claims);
      this.active.set(leaseId, claims);
      const lease = publicLease(claims);
      this._record({ type: 'capability_granted', ...lease, decidedAt: lease.issuedAt });
      return { ...lease, token };
    } catch (error) {
      if (claims?.leaseId) this.active.delete(claims.leaseId);
      this._recordRejection(request, error, nowMs);
      throw error;
    }
  }

  verify(token, request = {}) {
    const nowMs = this._nowMs();
    this._cleanup(nowMs);
    try {
      const claims = this._decode(token);
      if (claims.expiresAtMs <= nowMs) {
        throw new CapabilityBrokerError('CAPABILITY_EXPIRED', 'Capability lease has expired.');
      }
      if (this.revoked.has(claims.leaseId)) {
        throw new CapabilityBrokerError('CAPABILITY_REVOKED', 'Capability lease was revoked.');
      }
      if (!this.active.has(claims.leaseId)) {
        throw new CapabilityBrokerError(
          'CAPABILITY_TOKEN_INVALID',
          'Capability lease is not active in this process.',
        );
      }
      const use = normalizeUseRequest(request);
      if (
        claims.agentId !== use.agentId || claims.task !== use.task
        || claims.capability !== use.capability
        || !timingSafeHashEqual(claims.resourceHash, sha256(use.resource))
        || !timingSafeHashEqual(claims.scopeHash, sha256(use.scope))
      ) {
        throw new CapabilityBrokerError(
          'CAPABILITY_IDENTITY_MISMATCH',
          'Capability use does not match the granted lease identity.',
        );
      }
      if (!claims.actions.includes(use.action)) {
        throw new CapabilityBrokerError(
          'CAPABILITY_ACTION_DENIED',
          `Capability lease does not allow action ${use.action}.`,
        );
      }
      const lease = publicLease(claims);
      this._record({
        type: 'capability_verified',
        ...lease,
        action: use.action,
        decidedAt: new Date(nowMs).toISOString(),
      });
      return lease;
    } catch (error) {
      this._recordRejection(request, error, nowMs);
      throw error;
    }
  }

  inspect(tokenOrLeaseId) {
    const nowMs = this._nowMs();
    this._cleanup(nowMs);
    const claims = typeof tokenOrLeaseId === 'string' && tokenOrLeaseId.includes('.')
      ? this._decode(tokenOrLeaseId)
      : this.active.get(tokenOrLeaseId) || this.revoked.get(tokenOrLeaseId);
    if (!claims) {
      throw new CapabilityBrokerError('CAPABILITY_NOT_FOUND', 'Capability lease was not found.');
    }
    const status = this.revoked.has(claims.leaseId) ? 'revoked' : 'active';
    return publicLease(claims, status);
  }

  list() {
    const nowMs = this._nowMs();
    this._cleanup(nowMs);
    return [
      ...[...this.active.values()].map((claims) => publicLease(claims)),
      ...[...this.revoked.values()].map((claims) => publicLease(claims, 'revoked')),
    ].sort((left, right) => left.leaseId.localeCompare(right.leaseId));
  }

  revoke(tokenOrLeaseId, reason = 'revoked') {
    const nowMs = this._nowMs();
    this._cleanup(nowMs);
    const claims = typeof tokenOrLeaseId === 'string' && tokenOrLeaseId.includes('.')
      ? this._decode(tokenOrLeaseId)
      : this.active.get(tokenOrLeaseId);
    if (!claims || !this.active.has(claims.leaseId)) {
      throw new CapabilityBrokerError('CAPABILITY_NOT_FOUND', 'Active capability lease was not found.');
    }
    this.active.delete(claims.leaseId);
    this.revoked.set(claims.leaseId, claims);
    const lease = publicLease(claims, 'revoked');
    this._record({
      type: 'capability_revoked',
      ...lease,
      reasonCode: sha256(reason),
      decidedAt: new Date(nowMs).toISOString(),
    });
    return lease;
  }

  async useSecret(token, request, secretRef, operation) {
    const nowMs = this._nowMs();
    let verificationAttempted = false;
    let verified = false;
    try {
      if (!this.secretResolver) {
        throw new CapabilityBrokerError(
          'CAPABILITY_SECRET_RESOLVER_REQUIRED',
          'Secret use requires an injected resolver.',
        );
      }
      if (typeof secretRef !== 'string' || secretRef.trim() === '') {
        throw new CapabilityBrokerError(
          'CAPABILITY_SECRET_REF_REQUIRED',
          'Secret use requires a non-empty secret reference.',
        );
      }
      if (typeof operation !== 'function') {
        throw new CapabilityBrokerError(
          'CAPABILITY_SECRET_OPERATION_REQUIRED',
          'Secret use requires an in-process operation callback.',
        );
      }
      verificationAttempted = true;
      const lease = this.verify(token, { ...request, action: 'secret:read' });
      verified = true;
      let secret;
      try {
        secret = await this.secretResolver(secretRef, {
          leaseId: lease.leaseId,
          agentId: lease.agentId,
          task: lease.task,
          capability: lease.capability,
          resourceHash: lease.resourceHash,
          scopeHash: lease.scopeHash,
        });
      } catch {
        throw new CapabilityBrokerError(
          'CAPABILITY_SECRET_RESOLUTION_FAILED',
          'Secret resolver failed without exposing provider details.',
        );
      }
      if (secret === undefined || secret === null) {
        throw new CapabilityBrokerError(
          'CAPABILITY_SECRET_NOT_FOUND',
          'Secret resolver returned no value.',
        );
      }
      let result;
      try {
        result = await operation(secret);
      } catch {
        throw new CapabilityBrokerError(
          'CAPABILITY_SECRET_OPERATION_FAILED',
          'Secret-backed operation failed without exposing secret-bearing details.',
        );
      }
      const directStringLeak = typeof secret === 'string' && typeof result === 'string'
        && result.includes(secret);
      if (Object.is(result, secret) || directStringLeak) {
        throw new CapabilityBrokerError(
          'CAPABILITY_SECRET_EXFILTRATION',
          'Secret operation attempted to return the resolved secret.',
        );
      }
      this._record({
        type: 'capability_secret_used',
        ...lease,
        secretRefHash: sha256(secretRef),
        decidedAt: new Date(this._nowMs()).toISOString(),
      });
      return result;
    } catch (error) {
      if (!verificationAttempted || verified) this._recordRejection(request, error, nowMs);
      throw error;
    }
  }
}

function createCapabilityBroker(options = {}) {
  return new CapabilityBroker(options);
}

module.exports = {
  CapabilityBroker,
  CapabilityBrokerError,
  DEFAULT_LEASE_TTL_MS,
  MAX_LEASE_TTL_MS,
  createCapabilityBroker,
};
