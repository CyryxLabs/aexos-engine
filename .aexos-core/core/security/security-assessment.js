/** Deterministic Security squad assessment and release verdict engine. */

'use strict';

const crypto = require('crypto');

const REQUIRED_DOMAINS = Object.freeze([
  'threat-model',
  'appsec',
  'platform',
  'ai-security',
  'offensive',
]);
const SEVERITIES = Object.freeze(['critical', 'high', 'medium', 'low', 'info']);
const STATUSES = Object.freeze(['open', 'accepted', 'resolved']);
const SEVERITY_RANK = Object.freeze({ critical: 0, high: 1, medium: 2, low: 3, info: 4 });

class SecurityAssessmentError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'SecurityAssessmentError';
    this.code = code;
    this.details = details;
  }
}

function requiredText(value, field, findingId) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new SecurityAssessmentError(
      'SECURITY_FINDING_INVALID',
      `Finding ${findingId || '(unknown)'} requires non-empty ${field}.`,
      { findingId: findingId || null, field },
    );
  }
  return value.trim();
}

function evidenceDigest(evidence, findingId) {
  const values = Array.isArray(evidence) ? Array.from(evidence) : [evidence];
  if (values.length === 0) {
    throw new SecurityAssessmentError(
      'SECURITY_FINDING_INVALID',
      `Finding ${findingId} requires non-empty evidence.`,
      { findingId, field: 'evidence' },
    );
  }
  const normalized = values.map((value) => requiredText(value, 'evidence', findingId));
  return {
    evidenceCount: normalized.length,
    evidenceHash: crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex'),
  };
}

function normalizeFinding(finding, nowMs) {
  const id = requiredText(finding?.id, 'id');
  const severity = requiredText(finding.severity, 'severity', id).toLowerCase();
  const status = requiredText(finding.status, 'status', id).toLowerCase();
  const domain = requiredText(finding.domain, 'domain', id).toLowerCase();
  if (!SEVERITIES.includes(severity)) {
    throw new SecurityAssessmentError(
      'SECURITY_FINDING_INVALID',
      `Finding ${id} has unsupported severity ${severity}.`,
      { findingId: id, field: 'severity' },
    );
  }
  if (!STATUSES.includes(status)) {
    throw new SecurityAssessmentError(
      'SECURITY_FINDING_INVALID',
      `Finding ${id} has unsupported status ${status}.`,
      { findingId: id, field: 'status' },
    );
  }
  if (!REQUIRED_DOMAINS.includes(domain)) {
    throw new SecurityAssessmentError(
      'SECURITY_FINDING_INVALID',
      `Finding ${id} has unsupported domain ${domain}.`,
      { findingId: id, field: 'domain' },
    );
  }
  const normalized = {
    id,
    title: requiredText(finding.title, 'title', id),
    severity,
    status,
    domain,
    owner: requiredText(finding.owner, 'owner', id),
    ...evidenceDigest(finding.evidence, id),
  };
  if (status === 'accepted') {
    const acceptance = finding.acceptance || {};
    const expiresAt = Date.parse(requiredText(acceptance.expiresAt, 'acceptance.expiresAt', id));
    if (!Number.isFinite(expiresAt)) {
      throw new SecurityAssessmentError(
        'SECURITY_ACCEPTANCE_INVALID',
        `Finding ${id} has an invalid acceptance expiry.`,
        { findingId: id },
      );
    }
    if (expiresAt <= nowMs) {
      throw new SecurityAssessmentError(
        'SECURITY_ACCEPTANCE_EXPIRED',
        `Finding ${id} risk acceptance has expired.`,
        { findingId: id, expiresAt: new Date(expiresAt).toISOString() },
      );
    }
    normalized.acceptance = {
      owner: requiredText(acceptance.owner, 'acceptance.owner', id),
      rationaleHash: crypto.createHash('sha256')
        .update(requiredText(acceptance.rationale, 'acceptance.rationale', id))
        .digest('hex'),
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }
  return normalized;
}

function validateDomains(input) {
  if (!Array.isArray(input.domainsAssessed)) {
    throw new SecurityAssessmentError(
      'SECURITY_DOMAIN_COVERAGE_REQUIRED',
      'Assessment must explicitly declare every assessed security domain.',
    );
  }
  const declared = [...new Set(input.domainsAssessed.map((domain) => String(domain).toLowerCase()))]
    .sort();
  const missing = REQUIRED_DOMAINS.filter((domain) => !declared.includes(domain));
  if (missing.length > 0) {
    throw new SecurityAssessmentError(
      'SECURITY_DOMAIN_COVERAGE_REQUIRED',
      `Assessment is missing required domains: ${missing.join(', ')}.`,
      { missingDomains: missing },
    );
  }
  return declared;
}

function assessSecurity(input = {}, options = {}) {
  const nowValue = options.now ?? new Date();
  const nowMs = nowValue instanceof Date ? nowValue.getTime() : Number(nowValue);
  if (!Number.isFinite(nowMs)) {
    throw new SecurityAssessmentError('SECURITY_CLOCK_INVALID', 'Assessment clock is invalid.');
  }
  const assessmentId = requiredText(input.assessmentId, 'assessmentId');
  const domainsAssessed = validateDomains(input);
  if (!Array.isArray(input.findings)) {
    throw new SecurityAssessmentError(
      'SECURITY_FINDINGS_REQUIRED',
      'Assessment findings must be an array, including an empty array when no findings exist.',
    );
  }
  const ids = new Set();
  const findings = input.findings.map((finding) => {
    const normalized = normalizeFinding(finding, nowMs);
    if (ids.has(normalized.id)) {
      throw new SecurityAssessmentError(
        'SECURITY_FINDING_DUPLICATE',
        `Duplicate finding id ${normalized.id}.`,
        { findingId: normalized.id },
      );
    }
    ids.add(normalized.id);
    return normalized;
  }).sort((left, right) => (
    SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity]
    || left.id.localeCompare(right.id)
  ));

  const blocking = findings.filter((finding) => (
    finding.status === 'open' && ['critical', 'high'].includes(finding.severity)
  ));
  const concerns = findings.filter((finding) => (
    (finding.status === 'accepted' && ['critical', 'high', 'medium'].includes(finding.severity))
    || (finding.status === 'open' && finding.severity === 'medium')
  ));
  const verdict = blocking.length > 0 ? 'FAIL' : concerns.length > 0 ? 'CONCERNS' : 'PASS';
  const counts = Object.fromEntries(SEVERITIES.map((severity) => [
    severity,
    findings.filter((finding) => finding.severity === severity).length,
  ]));

  return {
    schemaVersion: 1,
    assessmentId,
    verdict,
    evaluatedAt: new Date(nowMs).toISOString(),
    domainsAssessed,
    summary: {
      total: findings.length,
      bySeverity: counts,
      blocking: blocking.length,
      concerns: concerns.length,
    },
    blockingFindingIds: blocking.map((finding) => finding.id),
    concernFindingIds: concerns.map((finding) => finding.id),
    findings,
  };
}

module.exports = {
  REQUIRED_DOMAINS,
  SEVERITIES,
  STATUSES,
  SecurityAssessmentError,
  assessSecurity,
};
