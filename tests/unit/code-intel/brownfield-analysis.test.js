'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ConfinedFilesystem } = require('../../../.aexos-core/core/permissions/confined-filesystem');
const {
  DEFAULT_LIMITS,
  analyzeBrownfield,
  exportBrownfieldEvidence,
} = require('../../../.aexos-core/core/code-intel/brownfield');

const FIXTURE = path.resolve(__dirname, '../../fixtures/brownfield/monorepo');

function digestTree(root) {
  const entries = [];
  const visit = (directory) => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, item.name);
      if (item.isDirectory()) visit(absolute);
      else entries.push(`${path.relative(root, absolute).replace(/\\/g, '/')}:${crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex')}`);
    }
  };
  visit(root);
  return crypto.createHash('sha256').update(entries.join('\n')).digest('hex');
}

function contract(root, overrides = {}) {
  return {
    protocol: 'aexos.brownfield-analysis/v1',
    analysisId: 'fixture-analysis',
    projectRoot: root,
    allowedPaths: ['.'],
    exclusions: [],
    requestedViews: ['architecture', 'domain', 'api', 'data', 'dependencies', 'tests', 'risks'],
    limits: { ...DEFAULT_LIMITS },
    output: { mode: 'return', path: 'evidence/brownfield.json' },
    verification: { mode: 'static-only', requireSourceHashes: true, requireNoMutation: true },
    ...overrides,
  };
}

async function analyze(root, overrides = {}, options = {}) {
  return analyzeBrownfield(contract(root, overrides), {
    authorizedProjectRoot: root,
    readBoundary: new ConfinedFilesystem({ projectRoot: root }),
    ...options,
  });
}

describe('bounded brownfield analysis', () => {
  test('extracts conservative source-linked views without mutating fixture bytes', async () => {
    const before = digestTree(FIXTURE);
    const result = await analyze(FIXTURE);
    const evidence = result.canonicalEvidence;
    expect(digestTree(FIXTURE)).toBe(before);
    expect(evidence.coverage.status).toBe('partial');
    expect(evidence.coverage.byLanguage.python).toBe(1);
    expect(evidence.views.tests.testExecution).toBe('not-run');
    expect(evidence.views.tests.coveragePercent).toBeNull();

    const kinds = evidence.findings.map((finding) => finding.kind);
    expect(kinds).toContain('architecture.package-manifest');
    expect(kinds).toContain('domain.guard-clause');
    expect(kinds).toContain('api.http-route');
    expect(kinds).toContain('data.interface-declaration');
    expect(kinds).toContain('data.json-schema-declaration');
    expect(kinds).toContain('tests.test-file-present');
    expect(kinds).toContain('risk.duplicate-symbol');

    const routes = evidence.findings.filter((finding) => finding.kind === 'api.http-route');
    expect(routes.map((finding) => finding.name)).toEqual(['GET /accounts/:id']);
    const dependencies = evidence.findings.filter((finding) => finding.kind === 'dependency.static-specifier');
    expect(dependencies.map((finding) => finding.name)).not.toContain('comment-only');
    expect(dependencies.map((finding) => finding.name)).not.toContain('string-only');
    expect(exportBrownfieldEvidence(evidence)).not.toContain('fixture-private-marker-must-not-appear');
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'DYNAMIC_IMPORT_UNRESOLVED' }),
      expect.objectContaining({ code: 'DYNAMIC_ROUTE_UNRESOLVED' }),
    ]));
  });

  test('every concrete source span resolves to exact captured UTF-8 bytes', async () => {
    const result = await analyze(FIXTURE);
    for (const finding of result.canonicalEvidence.findings) {
      for (const reference of finding.sourceRefs) {
        const entry = result.snapshot.entries.get(reference.path);
        const span = Buffer.from(entry.text.slice(reference.startOffset, reference.endOffset), 'utf8');
        expect(crypto.createHash('sha256').update(span).digest('hex')).toBe(reference.spanHash);
        expect(reference.sha256).toBe(entry.sha256);
      }
    }
  });

  test('produces identical canonical evidence for equivalent roots and shuffled enumeration', async () => {
    const firstRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-brownfield-a-'));
    const secondRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-brownfield-b-'));
    fs.cpSync(FIXTURE, firstRoot, { recursive: true });
    fs.cpSync(FIXTURE, secondRoot, { recursive: true });
    try {
      const first = await analyze(firstRoot);
      const second = await analyze(secondRoot);
      expect(exportBrownfieldEvidence(first.canonicalEvidence)).toBe(exportBrownfieldEvidence(second.canonicalEvidence));
    } finally {
      fs.rmSync(firstRoot, { recursive: true, force: true });
      fs.rmSync(secondRoot, { recursive: true, force: true });
    }
  });

  test('reports syntax views unavailable when the trusted parser is absent', async () => {
    const result = await analyze(FIXTURE, {}, { typescript: null });
    expect(result.canonicalEvidence.views.api).toMatchObject({
      status: 'unavailable',
      reason: 'TYPESCRIPT_ANALYZER_UNAVAILABLE',
    });
    expect(result.canonicalEvidence.findings).toHaveLength(0);
  });

  test('binds controlling ignore rules into the input digest', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-brownfield-ignore-'));
    fs.cpSync(FIXTURE, root, { recursive: true });
    try {
      const first = await analyze(root);
      fs.appendFileSync(path.join(root, '.gitignore'), '\n# changed policy identity\n');
      const second = await analyze(root);
      expect(second.canonicalEvidence.inputDigest).not.toBe(first.canonicalEvidence.inputDigest);
      expect(second.canonicalEvidence.sources).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: '.gitignore', status: 'metadata-only', language: 'ignore' }),
      ]));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
