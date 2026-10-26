/** Deterministic safe export for validated research snapshots. */
'use strict';

const { stableStringify } = require('../execution/durable-evidence');
const { validateArtifact } = require('./contract');

function escapeMarkdown(value) {
  const sanitized = Array.from(String(value), (character) => {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127) return ' ';
    return '\\`*_{}[]()#+.!|~-'.includes(character) ? `\\${character}` : character;
  }).join('');
  return sanitized
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r?\n/g, ' ');
}

function safeLink(locator) {
  try {
    const parsed = new URL(locator);
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password
      ? encodeURI(parsed.toString()).replace(/\(/g, '%28').replace(/\)/g, '%29')
      : null;
  } catch (_error) { return null; }
}

function exportJson(artifact) {
  validateArtifact(artifact);
  return `${stableStringify(artifact)}\n`;
}

function exportMarkdown(artifact) {
  validateArtifact(artifact);
  const lines = [
    `# Research ${escapeMarkdown(artifact.runId)}`,
    '',
    `- Status: ${escapeMarkdown(artifact.status)}`,
    `- Lineage: ${escapeMarkdown(artifact.lineageStatus)}`,
    `- Provider verification: ${escapeMarkdown(artifact.providerVerification)}`,
    `- Recommendation verification: ${escapeMarkdown(artifact.recommendationVerification)}`,
    '',
    '## Sources',
    '',
  ];
  for (const source of [...artifact.sources].sort((a, b) => a.citationId.localeCompare(b.citationId))) {
    lines.push(`### ${escapeMarkdown(source.citationId)}`, '');
    lines.push(`- Access: ${escapeMarkdown(source.accessClass)}`);
    lines.push(`- Content hash: ${escapeMarkdown(source.contentHash || 'unavailable')}`);
    lines.push(`- Availability: ${source.inaccessible ? 'inaccessible' : 'accessible'}`);
    for (const observation of [...source.observations]
      .sort((a, b) => a.observationIndex - b.observationIndex)) {
      const link = safeLink(observation.originalLocator);
      lines.push(`- Locator: ${link ? `[source](${link})` : 'redacted or invalid'}`);
      if (observation.previousCitationId) {
        lines.push(`  - Previous citation: ${escapeMarkdown(observation.previousCitationId)}`);
      }
    }
    if (source.retainedContent) {
      lines.push('', '> ' + escapeMarkdown(source.retainedContent).replace(/\n/g, '\n> '));
    }
    lines.push('');
  }
  lines.push('## Claims', '');
  for (const claim of [...artifact.claims].sort((a, b) => a.id.localeCompare(b.id))) {
    lines.push(`- **${escapeMarkdown(claim.id)}** [${escapeMarkdown(claim.support)}]: ${escapeMarkdown(claim.text)}`);
    if (claim.uncertainty) lines.push(`  - Uncertainty: ${escapeMarkdown(claim.uncertainty)}`);
    for (const citation of claim.citations) lines.push(`  - Citation: ${escapeMarkdown(citation.sourceId)}`);
  }
  lines.push('', '## Decisions', '');
  for (const decision of [...artifact.decisions].sort((a, b) => a.id.localeCompare(b.id))) {
    lines.push(`- **${escapeMarkdown(decision.id)}**: winner ${escapeMarkdown(decision.result.winner || 'none')}`);
    lines.push(`  - Evidence: ${escapeMarkdown(decision.result.evidenceLevel)}`);
    lines.push(`  - Verification: ${escapeMarkdown(decision.recommendationVerification)}`);
  }
  lines.push('', '## Open questions', '');
  for (const question of artifact.openQuestions) lines.push(`- ${escapeMarkdown(question)}`);
  return `${lines.join('\n')}\n`;
}

module.exports = { escapeMarkdown, exportJson, exportMarkdown };
