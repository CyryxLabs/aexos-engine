'use strict';

const {
  REQUIRED_DOMAINS,
  SecurityAssessmentError,
  assessSecurity,
} = require('../../../.aexos-core/core/security/security-assessment');

describe('security assessment verdict engine', () => {
  const now = new Date('2026-09-04T22:00:00.000Z');
  const base = {
    assessmentId: 'SEC-001',
    domainsAssessed: [...REQUIRED_DOMAINS],
    findings: [],
  };
  const finding = {
    id: 'SEC-10',
    title: 'Authorization bypass',
    domain: 'appsec',
    severity: 'high',
    status: 'open',
    evidence: ['tests/security/authz-repro.test.js'],
    owner: '@dev',
  };

  it('passes an explicitly complete assessment with no material findings', () => {
    expect(assessSecurity(base, { now })).toMatchObject({
      verdict: 'PASS',
      summary: { total: 0, blocking: 0, concerns: 0 },
    });
    expect(assessSecurity({
      ...base,
      findings: [
        { ...finding, severity: 'low', status: 'open' },
        { ...finding, id: 'SEC-11', severity: 'critical', status: 'resolved' },
      ],
    }, { now }).verdict).toBe('PASS');
  });

  it('fails on any open critical or high finding', () => {
    const result = assessSecurity({ ...base, findings: [finding] }, { now });
    expect(result.verdict).toBe('FAIL');
    expect(result.blockingFindingIds).toEqual(['SEC-10']);
  });

  it('returns concerns for accepted high or unresolved medium findings', () => {
    const accepted = {
      ...finding,
      status: 'accepted',
      acceptance: {
        owner: 'CEO',
        rationale: 'Temporary operational exception',
        expiresAt: '2026-09-10T00:00:00.000Z',
      },
    };
    expect(assessSecurity({ ...base, findings: [accepted] }, { now }).verdict)
      .toBe('CONCERNS');
    expect(assessSecurity({
      ...base,
      findings: [{ ...finding, severity: 'medium' }],
    }, { now }).verdict).toBe('CONCERNS');
  });

  it('rejects expired or incomplete risk acceptance', () => {
    expect(() => assessSecurity({
      ...base,
      findings: [{
        ...finding,
        status: 'accepted',
        acceptance: { owner: 'CEO', rationale: 'temporary', expiresAt: '2026-09-01' },
      }],
    }, { now })).toThrow(expect.objectContaining({ code: 'SECURITY_ACCEPTANCE_EXPIRED' }));
    expect(() => assessSecurity({
      ...base,
      findings: [{ ...finding, status: 'accepted', acceptance: {} }],
    }, { now })).toThrow(expect.objectContaining({ code: 'SECURITY_FINDING_INVALID' }));
  });

  it('requires explicit complete domain coverage even for an empty assessment', () => {
    expect(() => assessSecurity({ ...base, domainsAssessed: ['appsec'] }, { now }))
      .toThrow(expect.objectContaining({ code: 'SECURITY_DOMAIN_COVERAGE_REQUIRED' }));
    expect(() => assessSecurity({ assessmentId: 'SEC-001', findings: [] }, { now }))
      .toThrow(expect.objectContaining({ code: 'SECURITY_DOMAIN_COVERAGE_REQUIRED' }));
  });

  it.each([['empty', []], ['sparse', new Array(1)]])('rejects %s evidence on a resolved critical finding', (_name, evidence) => {
    expect(() => assessSecurity({
      ...base,
      findings: [{ ...finding, severity: 'critical', status: 'resolved', evidence }],
    }, { now })).toThrow(expect.objectContaining({
      code: 'SECURITY_FINDING_INVALID', details: { findingId: finding.id, field: 'evidence' },
    }));
  });

  it('validates finding fields, duplicate ids and supported domains', () => {
    expect(() => assessSecurity({
      ...base,
      findings: [{ ...finding, evidence: '' }],
    }, { now })).toThrow(expect.objectContaining({ code: 'SECURITY_FINDING_INVALID' }));
    expect(() => assessSecurity({
      ...base,
      findings: [{ ...finding }, { ...finding }],
    }, { now })).toThrow(expect.objectContaining({ code: 'SECURITY_FINDING_DUPLICATE' }));
    expect(() => assessSecurity({
      ...base,
      findings: [{ ...finding, domain: 'generic' }],
    }, { now })).toThrow(expect.objectContaining({ code: 'SECURITY_FINDING_INVALID' }));
    expect(new SecurityAssessmentError('X', 'x')).toBeInstanceOf(Error);
  });

  it('sorts findings deterministically and hashes raw evidence', () => {
    const result = assessSecurity({
      ...base,
      findings: [
        { ...finding, id: 'SEC-20', severity: 'medium', status: 'resolved' },
        { ...finding, id: 'SEC-02', severity: 'critical', status: 'resolved' },
        { ...finding, id: 'SEC-01', severity: 'critical', status: 'resolved' },
      ],
    }, { now });
    expect(result.findings.map((item) => item.id)).toEqual(['SEC-01', 'SEC-02', 'SEC-20']);
    expect(result.findings[0]).not.toHaveProperty('evidence');
    expect(result.findings[0].evidenceHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
