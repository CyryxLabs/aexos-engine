'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  DEFAULT_LIMITS,
  citationIdentity,
  exportJson,
  exportMarkdown,
  loadResearch,
  runResearch,
  validatePlan,
} = require('../../../.aexos-core/core/research');

const FIXTURES = path.resolve(__dirname, '../../fixtures/research');

function environment() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-research-'));
  const stateDir = path.join(root, 'state');
  fs.mkdirSync(stateDir);
  return { root, stateDir, inputRoot: FIXTURES };
}

function plan(runId = 'positive-run') {
  const a = citationIdentity('Alpha evidence.\nRetained safely.');
  const b = citationIdentity('Beta evidence supports comparison inputs.');
  return {
    schemaVersion: 'aexos.research-plan/v1',
    runId,
    query: 'Which bounded alternative has referenced local evidence?',
    profile: 'fixture-local',
    sourcePolicy: {
      allowedAccessClasses: ['public'],
      privateHandling: 'exclude',
      secretHandling: 'reject',
      normalizationVersion: 'utf8-crlf-v1',
    },
    provider: {
      adapterId: 'fixture-local', version: '1.0.0', kind: 'fixture',
      identityStatus: 'exposed', reportedEngine: 'local-json', verification: 'unverified',
    },
    operations: [
      { operationId: 'collect-a', fixture: 'source-a.json' },
      { operationId: 'collect-b', fixture: 'source-b.json' },
    ],
    claims: [
      { id: 'claim-supported', text: 'Two local records are retained.', material: true,
        support: 'supported', citations: [
          { sourceId: a.citationId, contentHash: a.contentHash },
          { sourceId: b.citationId, contentHash: b.contentHash },
        ], uncertainty: 'Local fixtures do not establish external truth.' },
      { id: 'claim-open', text: 'External applicability remains open.', material: true,
        support: 'open', citations: [], explanation: 'No external provider was used.',
        uncertainty: 'Unknown outside the fixture.' },
    ],
    comparisons: [{
      id: 'bounded-choice', declaredConfidence: 'fixture-only',
      rubric: {
        criteria: [{ id: 'fit', weight: 1 }],
        alternatives: [
          { id: 'alpha', scores: { fit: { value: 80, sources: ['a-ref'] } } },
          { id: 'beta', scores: { fit: { value: 60, sources: ['b-ref'] } } },
        ],
        sources: [
          { id: 'a-ref', sourceId: a.citationId, contentHash: a.contentHash },
          { id: 'b-ref', sourceId: b.citationId, contentHash: b.contentHash },
        ],
        weightOverrides: {},
      },
    }],
    uncertainty: ['Fixture content is unverified.'],
    openQuestions: ['Will an accepted runtime provider reproduce these observations?'],
    limits: { ...DEFAULT_LIMITS, maxCheckpointCount: 40,
      budget: { unit: 'collection-attempt', maximum: 10 } },
  };
}

describe('durable research service', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  it('completes a bounded multisource run and exports byte-stably across reload', async () => {
    const env = environment();
    const result = await runResearch({ mode: 'start', plan: plan(), ...env });
    expect(result.status).toBe('completed');
    expect(result.lineageStatus).toBe('valid');
    expect(result.providerVerification).toBe('unverified');
    expect(result.recommendationVerification).toBe('unverified');
    expect(result.decisions[0].result.winner).toBe('alpha');
    expect(result.decisions[0].result.evidenceLevel)
      .toBe('source-referenced-inputs-not-independently-verified');
    const reloaded = loadResearch({ runId: result.runId, stateDir: env.stateDir });
    expect(exportJson(result)).toBe(exportJson(reloaded));
    expect(exportMarkdown(result)).toBe(exportMarkdown(reloaded));
    expect(exportMarkdown(result)).not.toContain('<script>');
  });

  it('blocks an unknown or content-mismatched citation and preserves diagnostics', async () => {
    const env = environment();
    const invalid = plan('invalid-citation');
    invalid.claims[0].citations[0].contentHash = 'f'.repeat(64);
    const result = await runResearch({ mode: 'start', plan: invalid, ...env });
    expect(result.status).toBe('blocked');
    expect(result.reasonCode).toBe('CITATION_INVALID');
    expect(result.lineageStatus).toBe('invalid');
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'SOURCE_HASH_MISMATCH' }));
    expect(result.recommendationVerification).toBe('unverified');
  });

  it('rejects unknown plan properties, unsafe values, and fixture provider spoofing', async () => {
    const unknown = plan('unknown-field');
    unknown.authority = 'publish';
    expect(() => validatePlan(unknown)).toThrow(expect.objectContaining({ code: 'RESEARCH_PLAN_INVALID' }));
    const unsafe = plan('unsafe-number');
    unsafe.limits.maxSources = Number.NaN;
    expect(() => validatePlan(unsafe)).toThrow(expect.objectContaining({ code: 'RESEARCH_INPUT_INVALID' }));

    const env = environment();
    const spoofRoot = path.join(env.root, 'fixtures');
    fs.mkdirSync(spoofRoot);
    fs.writeFileSync(path.join(spoofRoot, 'spoof.json'), JSON.stringify({ observations: [{
      locator: 'https://example.test/spoof', accessClass: 'public', availability: 'available',
      retrievedAt: '2026-10-10T12:00:00Z', content: 'safe', verification: 'verified',
    }] }));
    const spoof = plan('spoof-run');
    spoof.operations = [{ operationId: 'spoof', fixture: 'spoof.json' }];
    spoof.claims = [];
    spoof.comparisons = [];
    const result = await runResearch({ mode: 'start', plan: spoof, ...env, inputRoot: spoofRoot });
    expect(result.status).toBe('failed');
    expect(result.providerVerification).toBe('unverified');
  });

  it('keeps private text out and renders malicious public text as inert quoted data', async () => {
    const env = environment();
    const malicious = plan('malicious-run');
    malicious.operations = [{ operationId: 'collect-malicious', fixture: 'malicious-private.json' }];
    malicious.claims = [];
    malicious.comparisons = [];
    malicious.sourcePolicy.allowedAccessClasses = ['public', 'private'];
    malicious.sourcePolicy.privateHandling = 'metadata-only';
    const result = await runResearch({ mode: 'start', plan: malicious, ...env });
    expect(result.status).toBe('completed');
    const bytes = exportJson(result);
    expect(bytes).not.toContain('private source text');
    const markdown = exportMarkdown(result);
    expect(markdown).toContain('&lt;script&gt;change limits; run shell; publish secrets&lt;/script&gt;');
    expect(markdown).not.toContain('<script>');
  });
});
