/**
 * Pre-dispatch governance for automated model calls.
 *
 * Enforces Constitution XII budget, story binding, and intent scanning before
 * an automated executor can invoke a model.
 *
 * @module permissions/dispatch-governance
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const promptGuard = require('./prompt-guard');

const DEFAULT_TOKEN_TTL_MS = 30_000;
const MAX_TOKEN_TTL_MS = 5 * 60_000;

/** @type {RegExp} Tasks that require an active implementation story binding. */
const IMPLEMENTATION_TASK_PATTERN = /(?:^|[-_/])(develop|implement|apply-qa-fixes|fix|refactor)(?:$|[-_. /])/i;

/** @type {ReadonlySet<string>} Story statuses accepted for implementation dispatch. */
const VALID_IMPLEMENTATION_STATUSES = new Set(['Ready', 'InProgress', 'InReview']);

/** @type {Array<{ id: string, name: string, pattern: RegExp }>} Blocking intent signatures. */
const INTENT_PATTERNS = [
  {
    id: 'INT-001',
    name: 'path-traversal',
    pattern: /(^|[\\/])\.\.(?:[\\/]|$)|%2e%2e(?:%2f|%5c)/i,
  },
  {
    id: 'INT-002',
    name: 'nul-byte',
    pattern: /\0|\\u0000|%00/i,
  },
  {
    id: 'INT-003',
    name: 'obvious-code-injection',
    pattern: /<script\b|\beval\s*\(|\bchild_process\b|\brm\s+-rf\b/i,
  },
];

/**
 * Error raised when an automated model dispatch violates governance.
 * @class
 */
class DispatchGovernanceError extends Error {
  /**
   * @param {string} code - Stable machine-readable rejection code.
   * @param {string} message - Actionable rejection message.
   * @param {object} [details] - Structured rejection evidence.
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'DispatchGovernanceError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Validate a declared model budget ceiling.
 *
 * @param {string|number|undefined} value - Declared ceiling in USD.
 * @returns {number} Positive finite ceiling.
 * @throws {DispatchGovernanceError} When the ceiling is absent or invalid.
 */
function validateBudgetCeiling(value) {
  const ceiling = Number(value);
  if (!Number.isFinite(ceiling) || ceiling <= 0) {
    throw new DispatchGovernanceError(
      'DISPATCH_BUDGET_REQUIRED',
      'Automated dispatch blocked: declare a positive AEXOS_MODEL_BUDGET_CEILING_USD.',
    );
  }
  return ceiling;
}

/**
 * Scan an automated intent for prompt injection and dangerous payloads.
 *
 * Shell metacharacters alone are not rejected because callers must preserve
 * argv literally; only instruction and executable-payload signatures block.
 *
 * @param {string} input - Combined task, parameters, and context.
 * @returns {{ safe: boolean, threats: Array<object> }} Scan result.
 */
function scanAutomatedIntent(input) {
  const text = String(input || '');
  const promptResult = promptGuard.scan(text);
  const threats = [...promptResult.threats];
  for (const definition of INTENT_PATTERNS) {
    const match = definition.pattern.exec(text);
    if (match) {
      threats.push({
        id: definition.id,
        name: definition.name,
        severity: 'CRITICAL',
        matchedText: match[0].slice(0, 100),
      });
    }
  }
  return { safe: threats.length === 0, threats };
}

function normalizeStatus(raw) {
  const status = String(raw || '').trim().toLowerCase().replace(/\s+/g, '');
  if (status === 'ready') return 'Ready';
  if (status === 'inprogress') return 'InProgress';
  if (status === 'inreview' || status === 'readyforreview') return 'InReview';
  if (status === 'done' || status === 'complete') return 'Done';
  if (status === 'draft') return 'Draft';
  return raw ? String(raw).trim() : 'Unknown';
}

function parseStory(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const idMatch =
    text.match(/^\|\s*Story ID\s*\|\s*([^|]+)\|/im) ||
    text.match(/^\*\*Story ID:\*\*\s*(.+)$/im) ||
    text.match(/^#\s+Story\s+([A-Za-z0-9._-]+)/im);
  const statusMatch =
    text.match(/^\|\s*Status\s*\|\s*([^|]+)\|/im) ||
    text.match(/^##\s+Status\s*\n+\s*([^\n]+)/im) ||
    text.match(/^\*\*Status:\*\*\s*(.+)$/im);
  return {
    storyId: idMatch ? idMatch[1].trim() : path.basename(filePath, path.extname(filePath)),
    status: normalizeStatus(statusMatch && statusMatch[1]),
    path: filePath,
  };
}

function walkMarkdownFiles(root, files = []) {
  if (!fs.existsSync(root)) return files;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) walkMarkdownFiles(full, files);
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(full);
  }
  return files;
}

function resolveStoryFile(binding, projectRoot) {
  if (!binding) return null;
  const raw = typeof binding === 'object'
    ? binding.storyPath || binding.path || binding.story || binding.storyId || binding.id
    : binding;
  if (!raw || typeof raw !== 'string') return null;

  const direct = path.resolve(projectRoot, raw);
  const relative = path.relative(projectRoot, direct);
  if (!relative.startsWith('..') && !path.isAbsolute(relative) && fs.existsSync(direct)) {
    return direct;
  }

  const target = raw.trim().toLowerCase();
  const roots = [
    path.join(projectRoot, 'docs', 'framework', 'epics'),
    path.join(projectRoot, 'docs', 'stories'),
  ];
  for (const root of roots) {
    for (const file of walkMarkdownFiles(root)) {
      const basename = path.basename(file, '.md').replace(/^story-/i, '').toLowerCase();
      if (basename === target) return file;
      const story = parseStory(file);
      if (story.storyId.toLowerCase() === target) return file;
    }
  }
  return null;
}

/**
 * Validate a story binding for automated implementation work.
 *
 * @param {string|object} binding - Story path, id, or story descriptor.
 * @param {object} [options]
 * @param {string} [options.projectRoot] - Repository root.
 * @returns {{ storyId: string, status: string, path: string }} Validated story.
 * @throws {DispatchGovernanceError} When no active valid story can be resolved.
 */
function validateStoryBinding(binding, options = {}) {
  const projectRoot = path.resolve(options.projectRoot || process.cwd());
  const file = resolveStoryFile(binding, projectRoot);
  if (!file) {
    throw new DispatchGovernanceError(
      'DISPATCH_STORY_REQUIRED',
      'Automated implementation dispatch blocked: bind an existing story id/path.',
    );
  }
  const story = parseStory(file);
  if (!VALID_IMPLEMENTATION_STATUSES.has(story.status)) {
    throw new DispatchGovernanceError(
      'DISPATCH_STORY_STATUS',
      `Automated implementation dispatch blocked: story ${story.storyId} is ${story.status}; expected Ready, InProgress, or InReview.`,
      story,
    );
  }
  return story;
}

/**
 * Enforce all pre-dispatch controls for an automated model intent.
 *
 * @param {object} options
 * @param {string|number} [options.budgetCeilingUsd] - Explicit USD ceiling.
 * @param {string} [options.task] - Agent task name.
 * @param {string} [options.intent] - Prompt/context payload to scan.
 * @param {string|object} [options.story] - Story binding.
 * @param {boolean} [options.requiresStory] - Override implementation detection.
 * @param {string} [options.projectRoot] - Repository root.
 * @returns {{ budgetCeilingUsd: number, story: object|null, scan: object }} Evidence.
 * @throws {DispatchGovernanceError} On any governance failure.
 */
function assertDispatchGovernance(options = {}) {
  const budgetCeilingUsd = validateBudgetCeiling(
    options.budgetCeilingUsd ?? process.env.AEXOS_MODEL_BUDGET_CEILING_USD,
  );
  const scan = scanAutomatedIntent(options.intent || '');
  if (!scan.safe) {
    throw new DispatchGovernanceError(
      'DISPATCH_INTENT_REJECTED',
      `Automated dispatch blocked: unsafe intent (${scan.threats.map((t) => t.id).join(', ')}).`,
      { threats: scan.threats },
    );
  }
  const requiresStory = options.requiresStory === true
    || IMPLEMENTATION_TASK_PATTERN.test(options.task || '');
  const story = requiresStory
    ? validateStoryBinding(options.story, { projectRoot: options.projectRoot })
    : null;
  return { budgetCeilingUsd, story, scan };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map((entry) => stableValue(entry));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
  );
}

/**
 * Hash the exact identity authorized for an automated dispatch.
 *
 * @param {object} request - Dispatch request or runtime governance request.
 * @returns {string} SHA-256 hex digest with no raw intent material.
 */
function hashDispatchIntent(request = {}) {
  const capabilityRequirements = Array.isArray(request.requiredCapabilities)
    ? request.requiredCapabilities.map((requirement) => ({
      capability: requirement?.capability || '',
      action: requirement?.action || '',
      resource: requirement?.resource || '',
      scope: requirement?.scope || '',
      tokenHash: requirement?.token ? hashValue(requirement.token) : null,
    }))
    : [];
  const payload = stableValue({
    agentId: request.agentId || request.agent || '',
    task: request.task || '',
    intent: request.intent ?? request.prompt ?? '',
    story: request.story || null,
    budgetCeilingUsd: request.budgetCeilingUsd ?? null,
    budgetScope: request.budgetScope || null,
    estimatedCostUsd: request.estimatedCostUsd ?? null,
    projectRoot: path.resolve(request.projectRoot || process.cwd()),
    requiresStory: request.requiresStory ?? null,
    capabilityRequirements,
  });
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function normalizeNonNegativeCost(value, code) {
  if (value === undefined || value === null || value === '') return 0;
  const cost = Number(value);
  if (!Number.isFinite(cost) || cost < 0) {
    throw new DispatchGovernanceError(code, 'Dispatch cost must be a non-negative number.');
  }
  return cost;
}

function timingSafeHexEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function normalizeSigningSecret(secret) {
  const bytes = secret === undefined
    ? crypto.randomBytes(32)
    : Buffer.from(secret);
  if (bytes.length < 32) {
    throw new DispatchGovernanceError(
      'DISPATCH_TOKEN_SECRET_INVALID',
      'Dispatch token signing secret must contain at least 32 bytes.',
    );
  }
  return bytes;
}

/**
 * Remove the bearer token and path-bearing story data from a governance decision.
 *
 * @param {object} decision - Token-bearing evaluator decision.
 * @returns {object} Safe evidence suitable for CLI output and receipts.
 */
function redactGovernanceDecision(decision = {}) {
  const story = decision.story
    ? { storyId: decision.story.storyId, status: decision.story.status }
    : null;
  const threats = (decision.scan?.threats || []).map((threat) => ({
    id: threat.id,
    name: threat.name,
    severity: threat.severity,
  }));
  return {
    approved: decision.approved === true,
    intentHash: decision.intentHash,
    agentId: decision.agentId || null,
    task: decision.task || null,
    story,
    budgetCeilingUsd: decision.budgetCeilingUsd,
    budget: decision.budget ? { ...decision.budget } : null,
    scan: decision.scan ? { safe: decision.scan.safe === true, threats } : null,
    issuedAt: decision.issuedAt,
    expiresAt: decision.expiresAt,
  };
}

class DispatchGovernance {
  constructor(options = {}) {
    const ttl = options.tokenTtlMs ?? DEFAULT_TOKEN_TTL_MS;
    if (!Number.isInteger(ttl) || ttl < 1 || ttl > MAX_TOKEN_TTL_MS) {
      throw new DispatchGovernanceError(
        'DISPATCH_TOKEN_TTL_INVALID',
        `Dispatch token TTL must be an integer between 1 and ${MAX_TOKEN_TTL_MS}ms.`,
      );
    }
    if (options.policy !== undefined && typeof options.policy !== 'function') {
      throw new DispatchGovernanceError(
        'DISPATCH_POLICY_INVALID',
        'Dispatch governance policy must be a function.',
      );
    }
    if (options.decisionSink !== undefined && typeof options.decisionSink !== 'function') {
      throw new DispatchGovernanceError(
        'DISPATCH_DECISION_SINK_INVALID',
        'Dispatch governance decisionSink must be a function.',
      );
    }
    if (options.budgetSink !== undefined && typeof options.budgetSink !== 'function') {
      throw new DispatchGovernanceError(
        'DISPATCH_BUDGET_SINK_INVALID',
        'Dispatch governance budgetSink must be a function.',
      );
    }
    if (options.clock !== undefined && typeof options.clock !== 'function') {
      throw new DispatchGovernanceError(
        'DISPATCH_CLOCK_INVALID',
        'Dispatch governance clock must be a function.',
      );
    }
    if (options.randomId !== undefined && typeof options.randomId !== 'function') {
      throw new DispatchGovernanceError(
        'DISPATCH_TOKEN_NONCE_INVALID',
        'Dispatch governance randomId must be a function.',
      );
    }
    const flushIntervalMs = options.flushIntervalMs ?? 1_000;
    if (!Number.isInteger(flushIntervalMs) || flushIntervalMs < 1) {
      throw new DispatchGovernanceError(
        'DISPATCH_BUDGET_FLUSH_INTERVAL_INVALID',
        'Dispatch budget flush interval must be a positive integer.',
      );
    }

    this.policy = options.policy || assertDispatchGovernance;
    this.legacyPolicy = options.policy !== undefined;
    this.clock = options.clock || (() => new Date());
    this.randomId = options.randomId || (() => crypto.randomUUID());
    this.signingSecret = normalizeSigningSecret(options.tokenSecret);
    this.tokenTtlMs = ttl;
    this.decisionSink = options.decisionSink || null;
    this.budgetSink = options.budgetSink || null;
    this.flushIntervalMs = flushIntervalMs;
    this.budgets = new Map();
    this.pending = new Map();
    this.usedNonces = new Map();
    this.flushTimer = null;
    this.lastFlushError = null;
    this.lastDecisionSinkError = null;
  }

  capabilities() {
    return {
      signedDispatchTokens: true,
      singleUseTokens: true,
      inProcessBudgetCache: true,
      legacyPolicyAdapter: this.legacyPolicy,
    };
  }

  _nowMs() {
    const value = this.clock();
    const milliseconds = value instanceof Date ? value.getTime() : Number(value);
    if (!Number.isFinite(milliseconds)) {
      throw new DispatchGovernanceError(
        'DISPATCH_CLOCK_INVALID',
        'Dispatch governance clock returned an invalid time.',
      );
    }
    return milliseconds;
  }

  _record(record) {
    if (!this.decisionSink) return;
    try {
      this.decisionSink(Object.freeze({ ...record }));
      this.lastDecisionSinkError = null;
    } catch (error) {
      this.lastDecisionSinkError = error;
      throw new DispatchGovernanceError(
        'DISPATCH_DECISION_SINK_FAILED',
        'Dispatch governance could not persist its sanitized decision record.',
      );
    }
  }

  _recordRejection(request, error, nowMs) {
    try {
      this._record({
        type: 'governance_rejected',
        intentHash: hashDispatchIntent(request),
        agentId: request.agentId || request.agent || null,
        task: request.task || null,
        code: error.code || 'DISPATCH_GOVERNANCE_REJECTED',
        decidedAt: new Date(nowMs).toISOString(),
      });
    } catch (sinkError) {
      this.lastDecisionSinkError = sinkError;
    }
  }

  _releasePending(nonce) {
    if (!nonce) return;
    const pending = this.pending.get(nonce);
    if (!pending) return;
    const entry = this.budgets.get(pending.scopeHash);
    if (entry) {
      entry.reservedUsd = Math.max(0, entry.reservedUsd - pending.reservationUsd);
      entry.dirty = true;
    }
    this.pending.delete(nonce);
    this.usedNonces.delete(nonce);
  }

  _scope(request, story) {
    const projectRoot = path.resolve(request.projectRoot || process.cwd());
    const raw = request.budgetScope
      || `${projectRoot}::${story?.storyId || request.agentId || request.agent || 'unbound'}`;
    return { raw, hash: hashValue(raw) };
  }

  _budgetEntry(scopeHash, ceiling) {
    const existing = this.budgets.get(scopeHash);
    if (existing) {
      if (existing.ceilingUsd !== ceiling) {
        throw new DispatchGovernanceError(
          'DISPATCH_BUDGET_CEILING_CHANGED',
          'Budget ceiling cannot change inside an active dispatch scope.',
          { scopeHash, existingCeilingUsd: existing.ceilingUsd, requestedCeilingUsd: ceiling },
        );
      }
      return existing;
    }
    const entry = { ceilingUsd: ceiling, spentUsd: 0, reservedUsd: 0, dirty: false };
    this.budgets.set(scopeHash, entry);
    return entry;
  }

  _pressure(entry) {
    return entry.ceilingUsd > 0
      ? (entry.spentUsd + entry.reservedUsd) / entry.ceilingUsd
      : 1;
  }

  _cleanupExpired(nowMs) {
    for (const [nonce, pending] of this.pending) {
      if (pending.expiresAtMs > nowMs) continue;
      const entry = this.budgets.get(pending.scopeHash);
      if (entry) {
        entry.reservedUsd = Math.max(0, entry.reservedUsd - pending.reservationUsd);
        entry.dirty = true;
      }
      this.pending.delete(nonce);
      this.usedNonces.delete(nonce);
    }
    for (const [nonce, expiresAtMs] of this.usedNonces) {
      if (expiresAtMs <= nowMs) this.usedNonces.delete(nonce);
    }
  }

  _sign(encodedPayload) {
    return crypto.createHmac('sha256', this.signingSecret)
      .update(encodedPayload)
      .digest('base64url');
  }

  _createToken(claims) {
    const encodedPayload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return `${encodedPayload}.${this._sign(encodedPayload)}`;
  }

  _decodeAndAuthenticate(token) {
    if (!token || typeof token !== 'string') {
      throw new DispatchGovernanceError(
        'DISPATCH_TOKEN_REQUIRED',
        'Automated dispatch requires a governance token.',
      );
    }
    const parts = token.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new DispatchGovernanceError(
        'DISPATCH_TOKEN_INVALID',
        'Dispatch governance token is malformed.',
      );
    }
    const expected = Buffer.from(this._sign(parts[0]), 'base64url');
    let actual;
    try {
      actual = Buffer.from(parts[1], 'base64url');
    } catch {
      actual = Buffer.alloc(0);
    }
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      throw new DispatchGovernanceError(
        'DISPATCH_TOKEN_INVALID',
        'Dispatch governance token signature is invalid.',
      );
    }
    try {
      const claims = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      if (!claims || typeof claims !== 'object') throw new Error('invalid claims');
      return claims;
    } catch {
      throw new DispatchGovernanceError(
        'DISPATCH_TOKEN_INVALID',
        'Dispatch governance token payload is invalid.',
      );
    }
  }

  /**
   * Evaluate policy, reserve known budget and issue a short-lived token.
   *
   * @param {object} request - Exact automated dispatch identity.
   * @returns {object} Token-bearing approval decision.
   */
  evaluate(request = {}) {
    const nowMs = this._nowMs();
    this._cleanupExpired(nowMs);
    const intentHash = hashDispatchIntent(request);
    let pendingNonce = null;

    try {
      const policyDecision = this.policy({
        ...request,
        intent: request.intent ?? request.prompt ?? '',
      });
      const ceiling = policyDecision.budgetCeilingUsd;
      const story = policyDecision.story || null;
      const scope = this._scope(request, story);
      const entry = this._budgetEntry(scope.hash, ceiling);
      const reservationUsd = normalizeNonNegativeCost(
        request.estimatedCostUsd,
        'DISPATCH_BUDGET_ESTIMATE_INVALID',
      );
      const committed = entry.spentUsd + entry.reservedUsd;
      if (committed >= ceiling || committed + reservationUsd > ceiling) {
        throw new DispatchGovernanceError(
          'DISPATCH_BUDGET_EXHAUSTED',
          'Automated dispatch blocked: budget ceiling reached; human escalation required.',
          {
            scopeHash: scope.hash,
            ceilingUsd: ceiling,
            spentUsd: entry.spentUsd,
            reservedUsd: entry.reservedUsd,
            requestedReservationUsd: reservationUsd,
          },
        );
      }

      entry.reservedUsd += reservationUsd;
      entry.dirty = entry.dirty || reservationUsd > 0;
      const issuedAtMs = nowMs;
      const expiresAtMs = nowMs + this.tokenTtlMs;
      const nonce = String(this.randomId() || '');
      if (!nonce || this.pending.has(nonce) || this.usedNonces.has(nonce)) {
        entry.reservedUsd = Math.max(0, entry.reservedUsd - reservationUsd);
        throw new DispatchGovernanceError(
          'DISPATCH_TOKEN_NONCE_INVALID',
          'Dispatch governance could not allocate a unique token nonce.',
        );
      }
      const claims = {
        version: 1,
        nonce,
        intentHash,
        agentId: request.agentId || request.agent || '',
        task: request.task || '',
        storyId: story?.storyId || null,
        budgetCeilingUsd: ceiling,
        budgetScopeHash: scope.hash,
        reservationUsd,
        issuedAtMs,
        expiresAtMs,
      };
      const token = this._createToken(claims);
      this.pending.set(nonce, {
        scopeHash: scope.hash,
        reservationUsd,
        expiresAtMs,
      });
      pendingNonce = nonce;
      const decision = {
        ...policyDecision,
        approved: true,
        agentId: claims.agentId,
        task: claims.task,
        intentHash,
        token,
        issuedAt: new Date(issuedAtMs).toISOString(),
        expiresAt: new Date(expiresAtMs).toISOString(),
        budget: {
          scopeHash: scope.hash,
          ceilingUsd: ceiling,
          spentUsd: entry.spentUsd,
          reservedUsd: entry.reservedUsd,
          pressure: this._pressure(entry),
        },
      };
      this._record({ type: 'governance_approved', ...redactGovernanceDecision(decision) });
      return decision;
    } catch (error) {
      this._releasePending(pendingNonce);
      this._recordRejection(request, error, nowMs);
      throw error;
    }
  }

  /**
   * Authenticate and consume a token for the exact current request.
   *
   * @param {string} token - Token returned by evaluate().
   * @param {object} request - Current request immediately before execution.
   * @returns {object} Authenticated claims used for settlement.
   */
  verify(token, request = {}) {
    const nowMs = this._nowMs();
    this._cleanupExpired(nowMs);
    let claims;
    try {
      claims = this._decodeAndAuthenticate(token);
    } catch (error) {
      this._recordRejection(request, error, nowMs);
      throw error;
    }
    if (claims.expiresAtMs <= nowMs) {
      const error = new DispatchGovernanceError(
        'DISPATCH_TOKEN_EXPIRED',
        'Dispatch governance token has expired.',
      );
      this._recordRejection(request, error, nowMs);
      throw error;
    }
    if (this.usedNonces.has(claims.nonce)) {
      const error = new DispatchGovernanceError(
        'DISPATCH_TOKEN_REPLAYED',
        'Dispatch governance token has already been consumed.',
      );
      this._recordRejection(request, error, nowMs);
      throw error;
    }
    if (!this.pending.has(claims.nonce)) {
      const error = new DispatchGovernanceError(
        'DISPATCH_TOKEN_INVALID',
        'Dispatch governance token is not active in this process.',
      );
      this._recordRejection(request, error, nowMs);
      throw error;
    }
    const currentHash = hashDispatchIntent(request);
    if (!timingSafeHexEqual(claims.intentHash, currentHash)) {
      const error = new DispatchGovernanceError(
        'DISPATCH_TOKEN_INTENT_MISMATCH',
        'Dispatch request changed after governance approval.',
        { approvedIntentHash: claims.intentHash, currentIntentHash: currentHash },
      );
      this._recordRejection(request, error, nowMs);
      throw error;
    }
    this.usedNonces.set(claims.nonce, claims.expiresAtMs);
    return claims;
  }

  /** Revalidate an active, already consumed phase without reserving or settling again. */
  revalidate(token, request = {}) {
    const claims = this._decodeAndAuthenticate(token);
    if (claims.expiresAtMs <= this._nowMs()) {
      throw new DispatchGovernanceError('DISPATCH_TOKEN_EXPIRED', 'Dispatch governance token has expired.');
    }
    if (!this.usedNonces.has(claims.nonce) || !this.pending.has(claims.nonce)) {
      throw new DispatchGovernanceError('DISPATCH_TOKEN_INVALID', 'Dispatch phase is not active.');
    }
    if (!timingSafeHexEqual(claims.intentHash, hashDispatchIntent(request))) {
      throw new DispatchGovernanceError('DISPATCH_TOKEN_INTENT_MISMATCH', 'Dispatch intent changed.');
    }
    if (request.requiresStory === true) validateStoryBinding(request.story, { projectRoot: request.projectRoot });
    return claims;
  }

  /**
   * Settle one verified dispatch into the in-process budget cache.
   *
   * @param {object} claims - Claims returned by verify().
   * @param {number|null|undefined} actualCostUsd - Provider-reported cost.
   * @returns {object} Sanitized budget state after settlement.
   */
  settle(claims, actualCostUsd) {
    if (!claims || !claims.nonce || !this.usedNonces.has(claims.nonce)) {
      throw new DispatchGovernanceError(
        'DISPATCH_TOKEN_INVALID',
        'Only a verified dispatch token can settle budget state.',
      );
    }
    const pending = this.pending.get(claims.nonce);
    if (!pending) {
      throw new DispatchGovernanceError(
        'DISPATCH_TOKEN_REPLAYED',
        'Dispatch budget has already been settled.',
      );
    }
    const entry = this.budgets.get(pending.scopeHash);
    const cost = actualCostUsd === undefined || actualCostUsd === null
      ? pending.reservationUsd
      : normalizeNonNegativeCost(actualCostUsd, 'DISPATCH_BUDGET_COST_INVALID');
    entry.reservedUsd = Math.max(0, entry.reservedUsd - pending.reservationUsd);
    entry.spentUsd += cost;
    entry.dirty = true;
    this.pending.delete(claims.nonce);
    this._scheduleFlush();
    return {
      scopeHash: pending.scopeHash,
      ceilingUsd: entry.ceilingUsd,
      spentUsd: entry.spentUsd,
      reservedUsd: entry.reservedUsd,
      pressure: this._pressure(entry),
    };
  }

  getBudgetState(scope) {
    const scopeHash = /^[a-f0-9]{64}$/i.test(String(scope || ''))
      ? String(scope)
      : hashValue(scope);
    const entry = this.budgets.get(scopeHash);
    if (!entry) return null;
    return {
      scopeHash,
      ceilingUsd: entry.ceilingUsd,
      spentUsd: entry.spentUsd,
      reservedUsd: entry.reservedUsd,
      pressure: this._pressure(entry),
    };
  }

  _scheduleFlush() {
    if (!this.budgetSink || this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      Promise.resolve(this.flush()).catch((error) => {
        this.lastFlushError = error;
      });
    }, this.flushIntervalMs);
    this.flushTimer.unref?.();
  }

  async flush() {
    if (!this.budgetSink) return [];
    const snapshot = [...this.budgets.entries()].map(([scopeHash, entry]) => ({
      scopeHash,
      ceilingUsd: entry.ceilingUsd,
      spentUsd: entry.spentUsd,
      reservedUsd: entry.reservedUsd,
      pressure: this._pressure(entry),
    }));
    await this.budgetSink(snapshot);
    for (const entry of this.budgets.values()) entry.dirty = false;
    this.lastFlushError = null;
    return snapshot;
  }

  close() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
  }
}

let defaultDispatchGovernance;

/**
 * Create an isolated governance evaluator and budget cache.
 *
 * @param {object} [options] - Evaluator configuration and test seams.
 * @returns {DispatchGovernance} Governance evaluator.
 */
function createDispatchGovernance(options = {}) {
  return new DispatchGovernance(options);
}

/**
 * Return the process-wide evaluator used by thin CLI surfaces.
 *
 * @returns {DispatchGovernance} Shared process-local evaluator.
 */
function getDefaultDispatchGovernance() {
  if (!defaultDispatchGovernance) defaultDispatchGovernance = createDispatchGovernance();
  return defaultDispatchGovernance;
}

module.exports = {
  DispatchGovernanceError,
  IMPLEMENTATION_TASK_PATTERN,
  INTENT_PATTERNS,
  validateBudgetCeiling,
  scanAutomatedIntent,
  validateStoryBinding,
  assertDispatchGovernance,
  DispatchGovernance,
  createDispatchGovernance,
  getDefaultDispatchGovernance,
  hashDispatchIntent,
  redactGovernanceDecision,
};
