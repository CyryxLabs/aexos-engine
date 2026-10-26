'use strict';

const { sha256, stableStringify } = require('./contract');
const { validateBrownfieldEvidence } = require('./evidence');

const MARKDOWN_PUNCTUATION = new Set('`*_{}[]()#+.!|~-');

function exportError(code, message) {
  return Object.assign(new Error(message), { code });
}

function escapeMarkdown(value) {
  const sanitized = String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\\/g, '\\\\');
  return [...sanitized].map((character) => (
    MARKDOWN_PUNCTUATION.has(character) ? `\\${character}` : character
  )).join('');
}

function exportJson(evidence) {
  return `${stableStringify(evidence)}\n`;
}

function exportMarkdown(evidence) {
  const lines = [
    '# Brownfield Evidence',
    '',
    `- Analysis: ${escapeMarkdown(evidence.analysisId)}`,
    `- Coverage: ${escapeMarkdown(evidence.coverage.status)}`,
    `- Input digest: \`${evidence.inputDigest}\``,
    `- Static only: ${evidence.scope.staticOnly ? 'yes' : 'no'}`,
    '',
    '## Views',
    '',
    '| View | Status | Findings |',
    '| --- | --- | ---: |',
    ...Object.keys(evidence.views).sort().map((view) => (
      `| ${escapeMarkdown(view)} | ${escapeMarkdown(evidence.views[view].status)} | ${evidence.views[view].findingIds.length} |`
    )),
    '',
    '## Findings',
    '',
    '| Kind | Name | Confidence | Source |',
    '| --- | --- | --- | --- |',
    ...evidence.findings.map((finding) => (
      `| ${escapeMarkdown(finding.kind)} | ${escapeMarkdown(finding.name)} | ${finding.confidence} | ${escapeMarkdown(finding.sourceRefs[0].path)}:${finding.sourceRefs[0].startLine} |`
    )),
    '',
    'Discovery performed static analysis only. No source, tests, dependencies, or publication target were executed.',
    '',
  ];
  return lines.join('\n');
}

function exportBrownfieldEvidence(evidence, format = 'json') {
  if (format === 'json') return exportJson(evidence);
  if (format === 'markdown') return exportMarkdown(evidence);
  throw exportError('BROWNFIELD_EXPORT_FORMAT', 'Export format must be json or markdown.');
}

function prepareBrownfieldEvidencePublication(evidence, snapshot) {
  validateBrownfieldEvidence(evidence, snapshot);
  const content = exportJson(evidence);
  const bytes = Buffer.from(content, 'utf8');
  return Object.freeze({
    protocol: 'aexos.brownfield-publication-input/v1',
    target: evidence.publication.target,
    encoding: 'base64',
    mediaType: 'application/json',
    contentBase64: bytes.toString('base64'),
    byteLength: bytes.length,
    sha256: sha256(bytes),
    evidenceHash: sha256(stableStringify(evidence)),
  });
}

module.exports = {
  exportBrownfieldEvidence,
  exportJson,
  exportMarkdown,
  prepareBrownfieldEvidencePublication,
};
