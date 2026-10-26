'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const { performance } = require('perf_hooks');
const { projectCorrelation, PHASES, LIMITS, correlationGraph, readCorrelationFile } = require('../../../.aexos-core/core/virtual-office/correlation');
const { projectIdentity } = require('../../../.aexos-core/core/virtual-office/host-bridge');
const { run } = require('../../../.aexos-core/core/virtual-office/cli');

const NOW = Date.parse('2026-10-10T12:00:00Z');
const H = 'a'.repeat(64);
const input = (receipts = [], events = []) => ({ protocol: 'aexos.correlation-input/v1', receipts, events });
function receipt(projectId) {
  return { receiptVersion: 1, status: 'ACCEPTED', runHash: H, policyHash: H, workflowHash: H,
    workflowId: 'story-development-cycle', correlation: { protocol: 'aexos.workflow-correlation/v1',
      projectId, runId: randomUUID(), storyId: 'AEX-TEST', storyHash: H,
      startedAt: new Date(NOW - 1000).toISOString(), finishedAt: new Date(NOW).toISOString(),
      requiredPhases: PHASES.map(([phaseId, task, owner]) => ({ phaseId, task, owner })) },
    executor: { kind: 'deterministic-local' },
    workflowOutcome: { status: 'completed', confidenceGatePassed: true, failedPhases: [] },
    bindings: PHASES.map(([phaseId, task, agentId]) => ({ phaseId, task, agentId, requireAcceptance: true, resolvedContractHash: H })),
    completed: PHASES.map(([phaseId, task]) => ({ phaseId, task, produced: [`${phaseId}.json`], acceptance: {
      contractHash: H, verdict: 'ACCEPTED', evidenceLevel: 'declared-checks-passed', checks: [{ passed: true }],
      artifacts: [{ path: `${phaseId}.json`, bytes: 1 }] } })),
    observations: PHASES.map(([phaseId]) => ({ phaseId, stage: 'after', target: `${phaseId}.json`, sha256: H, passed: true })),
  };
}

describe('read-only exact-evidence correlation', () => {
  let root, options, pid;
  beforeAll(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-correlation-')); pid = projectIdentity(root); options = { projectRoot: root, now: NOW }; });
  afterAll(() => {
    if (path.dirname(root) === fs.realpathSync(os.tmpdir()) && path.basename(root).startsWith('aexos-correlation-')) fs.rmSync(root, { recursive: true, force: true });
  });
  test('complete imported evidence remains unaccepted and traces exact artifact pointers', () => {
    const source = receipt(pid), model = projectCorrelation(input([source]), options);
    expect(model.readOnly).toBe(true); expect(model.controls).toEqual([]);
    expect(model.rows[0]).toMatchObject({ status: 'completed-unaccepted', acceptance: 'declared-only', assurance: 'unverified-import' });
    expect(model.rows[0].artifacts).toHaveLength(6);
    for (const artifact of model.rows[0].artifacts) {
      const original = artifact.sourcePointer.split('/').slice(1).reduce((value, key) => value[key], source);
      expect(original.path).toBe(artifact.path);
    }
    expect(correlationGraph(model).edges).toHaveLength(6);
  });
  test.each(['artifact', 'binding', 'gate', 'hash', 'duplicate-phase'])(
    'removing or corrupting %s evidence cannot leave a completed result', (variant) => {
      const source = receipt(pid);
      if (variant === 'artifact') source.completed[0].acceptance.artifacts = [];
      if (variant === 'binding') source.bindings[0].resolvedContractHash = 'b'.repeat(64);
      if (variant === 'gate') source.workflowOutcome.confidenceGatePassed = false;
      if (variant === 'hash') source.observations[0].sha256 = 'bad';
      if (variant === 'duplicate-phase') source.completed[1] = source.completed[0];
      expect(projectCorrelation(input([source]), options).rows[0].status).toBe('partial');
    });
  test('fixture, simulated, blocked, missing, legacy and stale evidence remain distinct', () => {
    const source = receipt(pid);
    source.executor.kind = 'fixture'; expect(projectCorrelation(input([source]), options).rows[0].status).toBe('fixture');
    source.executor.kind = 'simulated'; expect(projectCorrelation(input([source]), options).rows[0].status).toBe('simulated');
    source.executor.kind = 'deterministic-local'; source.status = 'BLOCKED'; source.completed = [];
    const blocked = projectCorrelation(input([source]), options).rows[0];
    expect(blocked.status).toBe('blocked'); expect(blocked.phases.every((phase) => phase.status === 'missing')).toBe(true);
    expect(blocked.recovery).toBe('not-observed');
    expect(projectCorrelation(input([{ receiptVersion: 1, status: 'ACCEPTED' }]), options).rows[0].status).toBe('legacy');
    expect(projectCorrelation(input([receipt(pid)]), { ...options, now: NOW + 90000000 }).rows[0].status).toBe('stale');
    expect(projectCorrelation(input(), options).rows).toEqual([]);
  });
  test('deduplicates and orders deterministically; conflicting run receipts downgrade both', () => {
    const one = receipt(pid), two = receipt(pid);
    const a = projectCorrelation(input([one, two, one]), options);
    const b = projectCorrelation(input([two, one, one]), options);
    expect(a).toEqual(b); expect(a.counts.duplicates).toBe(1);
    const conflicting = JSON.parse(JSON.stringify(one)); conflicting.status = 'BLOCKED';
    expect(projectCorrelation(input([one, conflicting]), options).rows.every((row) => row.status === 'error')).toBe(true);
  });
  test('fails contradictory after-checks and conflicting canonical event identities', () => {
    const source = receipt(pid); source.observations.push({ ...source.observations[0], passed: false });
    expect(projectCorrelation(input([source]), options).rows[0]).toMatchObject({ status: 'partial', acceptance: 'not-established' });
    const event = { projectId: pid, id: 'one', type: 'CommandComplete', state: 'completed', timestamp: NOW };
    const rows = projectCorrelation(input([], [event, { ...event, state: 'failed' }]), options).rows;
    expect(rows).toHaveLength(2); expect(rows.every((row) => row.status === 'error' && row.unresolved.includes('EVENT_IDENTITY_CONFLICT'))).toBe(true);
  });
  test('rejects recognizable credential IDs and excludes foreign legacy scope before fallback', () => {
    const event = { projectId: pid, id: 'AKIA1234567890ABCDEF', type: 'CommandComplete', state: 'completed', timestamp: NOW };
    const model = projectCorrelation(input([{ receiptVersion: 1, correlation: { protocol: 'legacy/v0', projectId: 'outside' } }], [event]), options);
    expect(model.counts.excluded).toBe(1); expect(model.rows[0].eventId).toBeNull();
    expect(JSON.stringify(model)).not.toContain('AKIA1234567890ABCDEF');
    const unknown = projectCorrelation(input([{ receiptVersion: 1 }]), options).rows[0];
    expect(unknown.projectId).toBeNull(); expect(unknown.unresolved).toContain('PROJECT_IDENTITY_UNAVAILABLE');
  });
  test('excludes other projects and never exports payloads, unsafe identifiers or control declarations', () => {
    const malicious = receipt(pid);
    malicious.prompt = 'password="synthetic-secret"'; malicious.runtimeEvents = [{ raw: '<script>alert(1)</script>' }];
    malicious.completed[0].acceptance.artifacts[0].path = '../secret/token.txt';
    const events = [{ projectId: pid, id: 'event-one', type: 'CommandComplete', state: 'completed', timestamp: NOW,
      data: { prompt: 'synthetic-secret', approve: true }, storyId: '<img>' },
    { projectId: 'outside-project', id: 'private-story', type: 'CommandComplete', timestamp: NOW }];
    const model = projectCorrelation(input([malicious, receipt('outside-project')], events), options);
    expect(model.counts.excluded).toBe(2);
    const serialized = JSON.stringify(model);
    for (const value of ['synthetic-secret', '<script>', '<img>', '../secret', 'private-story', 'approve']) expect(serialized).not.toContain(value);
    expect(model.rows.find((row) => row.sourceKind === 'office-event').status).toBe('completed-unaccepted');
  });
  test('bounded histories filter deterministically within measured execution time', () => {
    const events = Array.from({ length: LIMITS.events }, (_, index) => ({ projectId: pid, id: `e-${index}`,
      type: 'AgentStateChange', timestamp: NOW - index, state: 'running' }));
    const started = performance.now();
    const model = projectCorrelation(input([], events), { ...options, limit: 20 });
    const elapsed = performance.now() - started;
    expect(model.rows).toHaveLength(20); expect(model.counts.omitted).toBe(4980); expect(elapsed).toBeLessThan(5000);
    expect(() => projectCorrelation(input([], [...events, events[0]]), options)).toThrow('CORRELATION_INPUT_INVALID');
    expect(() => projectCorrelation(input(), { ...options, limit: 1000 })).toThrow('CORRELATION_OPTIONS_INVALID');
  });
  test('maximum artifact set preserves evidence links within measured projection and graph bounds', () => {
    const source = receipt(pid);
    source.observations = [];
    for (const [phaseIndex, phase] of source.completed.entries()) {
      const count = Math.floor(LIMITS.artifacts / PHASES.length)
        + (phaseIndex < LIMITS.artifacts % PHASES.length ? 1 : 0);
      phase.acceptance.artifacts = Array.from({ length: count }, (_, index) => ({
        path: `artifacts/${phase.phaseId}/item-${index}.json`, bytes: index + 1,
      }));
      phase.produced = phase.acceptance.artifacts.map((artifact) => artifact.path);
      source.observations.push(...phase.acceptance.artifacts.map((artifact) => ({
        phaseId: phase.phaseId, stage: 'after', target: artifact.path, sha256: H, passed: true,
      })));
    }
    const before = JSON.stringify(source);
    const started = performance.now();
    const model = projectCorrelation(input([source]), options);
    const graph = correlationGraph(model);
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(5000);
    console.info('Correlation artifact-bound benchmark:', JSON.stringify({
      artifacts: LIMITS.artifacts, nodes: graph.nodes.length, edges: graph.edges.length, elapsedMs: elapsed,
    }));
    expect(model.rows[0]).toMatchObject({
      status: 'completed-unaccepted', acceptance: 'declared-only', assurance: 'unverified-import',
    });
    expect(model.rows[0].artifacts).toHaveLength(LIMITS.artifacts);
    expect(graph.nodes).toHaveLength(LIMITS.artifacts + 1);
    expect(graph.edges).toHaveLength(LIMITS.artifacts);
    for (const artifact of model.rows[0].artifacts) {
      const original = artifact.sourcePointer.split('/').slice(1).reduce((value, key) => value[key], source);
      expect(original).toMatchObject({ path: artifact.path, bytes: artifact.bytes });
      for (const pointer of artifact.observationPointers) {
        const check = pointer.split('/').slice(1).reduce((value, key) => value[key], source);
        expect(check).toMatchObject({ target: artifact.path, sha256: artifact.sha256, passed: true });
      }
    }
    expect(projectCorrelation(input([source]), options)).toEqual(model);
    expect(JSON.stringify(source)).toBe(before);
    const first = source.completed[0], extra = { path: 'artifacts/one-too-many.json', bytes: 1 };
    first.acceptance.artifacts.push(extra); first.produced.push(extra.path);
    source.observations.push({ phaseId: first.phaseId, stage: 'after', target: extra.path, sha256: H, passed: true });
    // The extra observation exceeds the receipt contract before projection.
    const overflow = projectCorrelation(input([source]), options);
    expect(overflow.rows[0]).toMatchObject({
      status: 'error', acceptance: 'not-established', artifacts: [], unresolved: ['RECEIPT_CONTRACT_INVALID'],
    });
  });
  test('existing Office CLI reads only confined explicit files and rejects all control options', async () => {
    const file = path.join(root, 'receipts.json'); fs.writeFileSync(file, JSON.stringify(input([receipt(pid)])));
    const output = { log: jest.fn() }, before = fs.readFileSync(file);
    const model = await run(['correlate', '--file', 'receipts.json', '--project-root', root], { output });
    expect(model.controls).toEqual([]); expect(output.log).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync(file)).toEqual(before);
    for (const action of ['--launch', '--cancel', '--retry', '--approve', '--merge', '--publish', '--grant', '--install']) {
      await expect(run(['correlate', '--file', 'receipts.json', action, 'yes'], { output })).rejects.toMatchObject({ code: 'CORRELATION_OPTION_DENIED' });
    }
    await expect(readCorrelationFile('../outside.json', options)).rejects.toMatchObject({ code: 'CORRELATION_READ_DENIED' });
  });
});
