'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  DEFAULT_LIMITS,
  citationIdentity,
} = require('../../.aexos-core/core/research');

const ROOT = path.resolve(__dirname, '../..');
const FIXTURES = path.resolve(__dirname, '../fixtures/research');

function cli(args) {
  return spawnSync(process.execPath, [path.join(ROOT, 'bin/aexos.js'), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 15_000,
  });
}

function createPlan(root) {
  const source = citationIdentity('Alpha evidence.\nRetained safely.');
  const value = {
    schemaVersion: 'aexos.research-plan/v1',
    runId: 'cli-run',
    query: 'CLI local fixture check',
    profile: 'fixture-local',
    sourcePolicy: { allowedAccessClasses: ['public'], privateHandling: 'exclude',
      secretHandling: 'reject', normalizationVersion: 'utf8-crlf-v1' },
    provider: { adapterId: 'fixture-local', version: '1.0.0', kind: 'fixture',
      identityStatus: 'exposed', reportedEngine: 'local-json', verification: 'unverified' },
    operations: [{ operationId: 'collect-a', fixture: 'source-a.json' }],
    claims: [{ id: 'cli-claim', text: 'CLI retained one source.', material: true,
      support: 'supported', citations: [{ sourceId: source.citationId, contentHash: source.contentHash }],
      uncertainty: 'Fixture only.' }],
    comparisons: [], uncertainty: ['Unverified provider.'], openQuestions: [],
    limits: { ...DEFAULT_LIMITS, maxCheckpointCount: 20,
      budget: { unit: 'collection-attempt', maximum: 4 } },
  };
  const planFile = path.join(root, 'plan.json');
  fs.writeFileSync(planFile, JSON.stringify(value));
  return planFile;
}

describe('research CLI command', () => {
  it('runs against real temp files and emits stable stdout-only JSON exports', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-research-cli-'));
    const stateDir = path.join(temp, 'state');
    fs.mkdirSync(stateDir);
    const planFile = createPlan(temp);
    const start = cli(['research', 'start', planFile, '--input-root', FIXTURES,
      '--state-dir', stateDir, '--json']);
    expect(start.status).toBe(0);
    expect(start.stderr).toBe('');
    expect(JSON.parse(start.stdout)).toMatchObject({
      status: 'completed',
      providerVerification: 'unverified',
      recommendationVerification: 'unverified',
    });
    const first = cli(['research', 'export', 'cli-run', '--state-dir', stateDir, '--format', 'json']);
    const second = cli(['research', 'export', 'cli-run', '--state-dir', stateDir, '--format', 'json']);
    expect(first.status).toBe(0);
    expect(first.stdout).toBe(start.stdout);
    expect(second.stdout).toBe(first.stdout);
    const status = cli(['research', 'status', 'cli-run', '--state-dir', stateDir, '--json']);
    expect(status.status).toBe(0);
    expect(status.stdout).toBe(first.stdout);
    const recovery = cli(['research', 'recover', 'cli-run', '--state-dir', stateDir, '--json']);
    if (process.platform === 'win32') {
      expect(recovery.status).toBe(0);
      expect(JSON.parse(recovery.stdout)).toEqual({
        schemaVersion: 'aexos.research-recovery/v1',
        runId: 'cli-run',
        status: 'not-needed',
      });
    } else {
      expect(recovery.status).toBe(4);
      expect(JSON.parse(recovery.stdout)).toMatchObject({
        status: 'error', code: 'RESEARCH_RECOVERY_UNAVAILABLE',
      });
    }
    const afterRecovery = cli(['research', 'export', 'cli-run', '--state-dir', stateDir,
      '--format', 'json']);
    expect(afterRecovery.stdout).toBe(first.stdout);
  });

  it('uses nonzero exit and sanitized diagnostics for unavailable execution', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-research-cli-'));
    const stateDir = path.join(temp, 'state');
    fs.mkdirSync(stateDir);
    const planFile = createPlan(temp);
    const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
    plan.runId = 'cli-unavailable';
    plan.provider.kind = 'unavailable';
    fs.writeFileSync(planFile, JSON.stringify(plan));
    const result = cli(['research', 'start', planFile, '--input-root', FIXTURES,
      '--state-dir', stateDir, '--json']);
    expect(result.status).toBe(4);
    const output = JSON.parse(result.stdout);
    expect(output).toMatchObject({ status: 'blocked', reasonCode: 'PROVIDER_UNAVAILABLE' });
    expect(result.stderr).not.toContain(temp);
  });

  it('never echoes secret-pattern plan text to stdout or stderr', () => {
    const secret = 'synthetic-secret-123456789';
    const rejected = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-research-cli-'));
    const rejectedState = path.join(rejected, 'state');
    fs.mkdirSync(rejectedState);
    const rejectedPlan = createPlan(rejected);
    const rejectedValue = JSON.parse(fs.readFileSync(rejectedPlan, 'utf8'));
    rejectedValue.runId = 'cli-secret-reject';
    rejectedValue.query = `api_key=${secret}`;
    fs.writeFileSync(rejectedPlan, JSON.stringify(rejectedValue));
    const denied = cli(['research', 'start', rejectedPlan, '--input-root', FIXTURES,
      '--state-dir', rejectedState, '--json']);
    expect(denied.status).toBe(4);
    expect(`${denied.stdout}${denied.stderr}`).not.toContain(secret);

    const redacted = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-research-cli-'));
    const redactedState = path.join(redacted, 'state');
    fs.mkdirSync(redactedState);
    const redactedPlan = createPlan(redacted);
    const redactedValue = JSON.parse(fs.readFileSync(redactedPlan, 'utf8'));
    redactedValue.runId = 'cli-secret-redact';
    redactedValue.sourcePolicy.secretHandling = 'redact';
    redactedValue.query = `api_key=${secret}`;
    fs.writeFileSync(redactedPlan, JSON.stringify(redactedValue));
    const accepted = cli(['research', 'start', redactedPlan, '--input-root', FIXTURES,
      '--state-dir', redactedState, '--json']);
    expect(accepted.status).toBe(0);
    expect(`${accepted.stdout}${accepted.stderr}`).not.toContain(secret);
    expect(accepted.stdout).toContain('REDACTED');
  });
});
