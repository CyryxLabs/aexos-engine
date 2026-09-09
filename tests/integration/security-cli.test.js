'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { REQUIRED_DOMAINS } = require('../../.aexos-core/core/security/security-assessment');

describe('aexos security assess CLI', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-security-cli-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function run(input, json = false) {
    const file = path.join(tempDir, 'assessment.json');
    fs.writeFileSync(file, JSON.stringify(input));
    return spawnSync(process.execPath, [
      path.join(process.cwd(), 'bin', 'aexos.js'),
      'security',
      'assess',
      file,
      ...(json ? ['--json'] : []),
    ], { cwd: process.cwd(), encoding: 'utf8' });
  }

  const base = {
    assessmentId: 'CLI-SEC-001',
    domainsAssessed: [...REQUIRED_DOMAINS],
    findings: [],
  };

  it('uses stable verdict exit codes and JSON evidence', () => {
    const pass = run(base, true);
    expect(pass.status).toBe(0);
    expect(JSON.parse(pass.stdout)).toMatchObject({ verdict: 'PASS' });

    const concerns = run({
      ...base,
      findings: [{
        id: 'M-1', title: 'Medium issue', domain: 'appsec', severity: 'medium', status: 'open',
        evidence: 'fixture', owner: '@dev',
      }],
    });
    expect(concerns.status).toBe(2);
    expect(concerns.stdout).toContain('Security verdict: CONCERNS');

    const fail = run({
      ...base,
      findings: [{
        id: 'H-1', title: 'High issue', domain: 'platform', severity: 'high', status: 'open',
        evidence: 'fixture', owner: '@devops',
      }],
    });
    expect(fail.status).toBe(3);
    expect(fail.stdout).toContain('Security verdict: FAIL');
  });

  it('refuses empty evidence instead of passing a resolved critical finding', () => {
    const result = run({
      ...base,
      findings: [{
        id: 'C-1', title: 'Resolved issue without proof', domain: 'appsec', severity: 'critical',
        status: 'resolved', evidence: [], owner: '@dev',
      }],
    }, true);
    expect(result.status).toBe(4);
    expect(result.stderr).toContain('[SECURITY_FINDING_INVALID]');
    expect(result.stdout).not.toContain('PASS');
  });

  it('returns exit 4 for invalid input without a false verdict', () => {
    const invalid = run({ assessmentId: 'CLI-SEC-002', domainsAssessed: [], findings: [] });
    expect(invalid.status).toBe(4);
    expect(invalid.stderr).toContain('[SECURITY_DOMAIN_COVERAGE_REQUIRED]');
    expect(invalid.stdout).not.toContain('Security verdict: PASS');
  });
});
