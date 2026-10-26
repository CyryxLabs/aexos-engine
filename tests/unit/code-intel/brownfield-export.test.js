'use strict';

const fs = require('fs');
const path = require('path');
const { ConfinedFilesystem } = require('../../../.aexos-core/core/permissions/confined-filesystem');
const {
  DEFAULT_LIMITS,
  analyzeBrownfield,
  exportBrownfieldEvidence,
  prepareBrownfieldEvidencePublication,
  validateBrownfieldEvidence,
} = require('../../../.aexos-core/core/code-intel/brownfield');
const { exportMarkdown } = require('../../../.aexos-core/core/code-intel/brownfield/export');

const ROOT = path.resolve(__dirname, '../../fixtures/brownfield/greenfield');

function request() {
  return {
    protocol: 'aexos.brownfield-analysis/v1',
    analysisId: 'greenfield-control',
    projectRoot: ROOT,
    allowedPaths: ['.'],
    exclusions: [],
    requestedViews: ['architecture', 'api', 'data', 'dependencies', 'tests', 'risks'],
    limits: { ...DEFAULT_LIMITS },
    output: { mode: 'return', path: 'evidence/greenfield.json' },
    verification: { mode: 'static-only', requireSourceHashes: true, requireNoMutation: true },
  };
}

describe('brownfield evidence export', () => {
  test('empty control has no fabricated findings and produces a publication input without writing', async () => {
    const before = fs.readdirSync(ROOT);
    const result = await analyzeBrownfield(request(), {
      authorizedProjectRoot: ROOT,
      readBoundary: new ConfinedFilesystem({ projectRoot: ROOT }),
    });
    expect(result.canonicalEvidence.findings).toEqual([]);
    expect(validateBrownfieldEvidence(result.canonicalEvidence, result.snapshot)).toBe(result.canonicalEvidence);
    const prepared = prepareBrownfieldEvidencePublication(result.canonicalEvidence, result.snapshot);
    expect(prepared).toMatchObject({
      protocol: 'aexos.brownfield-publication-input/v1',
      target: 'evidence/greenfield.json',
      encoding: 'base64',
      mediaType: 'application/json',
    });
    expect(Buffer.from(prepared.contentBase64, 'base64').toString('utf8'))
      .toBe(exportBrownfieldEvidence(result.canonicalEvidence));
    expect(fs.readdirSync(ROOT)).toEqual(before);
  });

  test('rejects a forged span hash before export preparation', async () => {
    const root = path.resolve(__dirname, '../../fixtures/brownfield/monorepo');
    const monorepoRequest = { ...request(), analysisId: 'forge-control', projectRoot: root,
      output: { mode: 'return', path: 'evidence/forge.json' } };
    const result = await analyzeBrownfield(monorepoRequest, {
      authorizedProjectRoot: root,
      readBoundary: new ConfinedFilesystem({ projectRoot: root }),
    });
    const forged = JSON.parse(JSON.stringify(result.canonicalEvidence));
    forged.findings[0].sourceRefs[0].spanHash = '0'.repeat(64);
    expect(() => prepareBrownfieldEvidencePublication(forged, result.snapshot))
      .toThrow(expect.objectContaining({ code: 'BROWNFIELD_SOURCE_SPAN_MISMATCH' }));
  });

  test('renders hostile symbols and paths as inert Markdown text', () => {
    const markdown = exportMarkdown({
      analysisId: '<img src=x onerror=alert(1)>',
      coverage: { status: 'partial' },
      inputDigest: 'a'.repeat(64),
      scope: { staticOnly: true },
      views: { api: { status: 'partial', findingIds: ['finding-a'] } },
      findings: [{
        kind: 'api.http-route',
        name: '[click](javascript:alert(1)) `code` <script>',
        confidence: 'low',
        sourceRefs: [{ path: '[source](javascript:alert(2))', startLine: 1 }],
      }],
    });
    expect(markdown).not.toContain('<img');
    expect(markdown).not.toContain('<script>');
    expect(markdown).not.toContain('](javascript:');
    expect(markdown).toContain('&lt;script&gt;');
  });
});
