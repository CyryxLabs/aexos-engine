'use strict';

const zlib = require('zlib');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
// Frozen upstream source corpus; no external checkout or network needed in CI.
const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures/localization-upstream.json.gz'));
const FIXTURE_SHA256 = 'edd38be2844f81b69fac8421be83fc76a4dd0de49d11ddb08e45a61f6aa8d1ab';
const corpus = JSON.parse(zlib.gunzipSync(FIXTURE));
const sources = new Map(corpus.entries.map(entry => [entry.path, entry]));
const PROVENANCE_PATH = path.join(ROOT, 'docs', 'parity', 'localization-provenance.json');
const {
  IMPLEMENTATION_REPOSITORY,
  SOURCE_COMMIT,
  classifyBlocker,
  destinationPath,
  transformContent,
  renderLimitedFallback,
} = require('../../scripts/parity/restore-localized-docs');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

describe('localized documentation parity recovery', () => {
  test('maps only AEXOS-owned destination namespaces', () => {
    expect(destinationPath('docs/es/aiox-agent-flows/aiox-master-system.md'))
      .toBe('docs/es/aexos-agent-flows/aexos-master-system.md');
    expect(destinationPath('docs/zh/aiox-workflows/qa-loop-workflow.md'))
      .toBe('docs/zh/aexos-workflows/qa-loop-workflow.md');
    expect(destinationPath('docs/pt/guides/mcp/docker-gateway-tutorial.md'))
      .toBe('docs/pt/guides/mcp/docker-gateway-tutorial.md');
    expect(destinationPath('docs/es/aiox-nomenclature-specification.md'))
      .toBe('docs/es/aexos-nomenclature-specification.md');
    expect(destinationPath('docs/zh/architecture/AIOX-VISUAL-OVERVIEW.md'))
      .toBe('docs/zh/architecture/AEXOS-VISUAL-OVERVIEW.md');
  });

  test('adapts product commands, paths, links, and identity while preserving provider identifiers', () => {
    const source = [
      '# Synkra AIOX',
      'Run `npx aiox-core install` and edit `.aiox-core/core-config.yaml`.',
      'Legacy configuration remains in `.aiox/config.yaml`.',
      'Activate `@aiox-master` and read `docs/aiox-workflows/README.md`.',
      '[Core](https://github.com/SynkraAI/aiox-core/issues)',
      '[Community Discord](https://discord.gg/gk8jAdXWmj)',
      'Provider API: `https://api.openai.com/v1`; model: `claude-3-5-sonnet`.',
      '[Upstream squad source](https://github.com/SynkraAI/aiox-squads)',
    ].join('\n');

    const result = transformContent(source, 'docs/es/example.md').content;

    expect(result).toContain('# AEXOS (Cyryx)');
    expect(result).toContain('`npx @aexos/core install`');
    expect(result).toContain('`.aexos-core/core-config.yaml`');
    expect(result).toContain('`.aexos/config.yaml`');
    expect(result).toContain('`@aexos-master`');
    expect(result).toContain('`docs/aexos-workflows/README.md`');
    expect(result).toContain(`${IMPLEMENTATION_REPOSITORY}/issues`);
    expect(result).toContain('[Cyryx support](https://cyryxlabs.com/contact)');
    expect(result).toContain('https://api.openai.com/v1');
    expect(result).toContain('claude-3-5-sonnet');
    expect(result).toContain('https://github.com/SynkraAI/aiox-squads');
    expect(result).toContain(`${SOURCE_COMMIT}/docs/es/example.md`);
    expect(result).toContain(`${SOURCE_COMMIT}/LICENSE`);
  });

  test('routes repository commands and links to the verified AEXOS engine repository', () => {
    const source = [
      'git clone https://github.com/SynkraAI/aiox-core.git',
      '[Issues](https://github.com/SynkraAI/aiox-core/issues)',
      '[Docs](https://aiox-core.dev/getting-started)',
      'git clone https://github.com/YOUR_USERNAME/aiox-core.git',
    ].join('\n');

    const result = transformContent(source, 'docs/pt/repository-example.md').content;
    expect(result).toContain(`git clone ${IMPLEMENTATION_REPOSITORY}.git`);
    expect(result).toContain(`${IMPLEMENTATION_REPOSITORY}/issues`);
    expect(result).toContain(`[Docs](${IMPLEMENTATION_REPOSITORY})`);
    expect(result).toContain('git clone https://github.com/YOUR_USERNAME/aexos-engine.git');
    expect(result).not.toContain('https://github.com/CyryxLabs/AEXOS');
  });

  test.each([
    ['https://api.synkra.ai/api/squads', 'upstream-private-squads-api'],
    ['private repository aiox-pro', 'upstream-private-pro-runtime'],
    ['email security@synkra.ai', 'unverified-security-contact'],
    [
      'https://raw.githubusercontent.com/SynkraAI/aiox-core/main/tools/quick-diagnose.ps1',
      'unavailable-upstream-diagnostic-download',
    ],
    [
      'git submodule add https://github.com/SynkraAI/aiox-squads.git squads',
      'unresolved-upstream-submodule-install',
    ],
  ])('blocks an unsafe private mapping: %s', (content, blockerId) => {
    expect(classifyBlocker(content).map((blocker) => blocker.id)).toContain(blockerId);
  });

  test('records every upstream localized document and retains portable limited content', () => {
    const provenance = JSON.parse(fs.readFileSync(PROVENANCE_PATH, 'utf8'));
    expect(provenance.source).toEqual({
      repository: 'https://github.com/SynkraAI/aiox-core',
      commit: SOURCE_COMMIT,
      license: 'MIT',
    });
    expect(provenance.summary).toEqual({
      upstream_localized_documents: 394,
      adapted_not_behaviorally_verified: 382,
      adapted_with_explicit_limitations: 12,
      blocked_not_restored: 0,
      supplemental_canonical_adaptations: 1,
    });
    expect(provenance.policy.inaccessible_private_pro_content_is_excluded).toBe(true);
    expect(provenance.policy.limited_adaptations_remain_pending_capabilities).toBe(true);

    const limited = provenance.entries.filter((entry) => entry.status === 'ADAPTED_WITH_EXPLICIT_LIMITATIONS');
    expect(limited.map((entry) => entry.destination)).toEqual([
      'docs/es/api/squads-api.md',
      'docs/es/architecture/multi-repo-strategy.md',
      'docs/es/guides/installation-troubleshooting.md',
      'docs/pt/api/squads-api.md',
      'docs/pt/architecture/multi-repo-strategy.md',
      'docs/pt/guides/installation-troubleshooting.md',
      'docs/zh/api/squads-api.md',
      'docs/zh/guides/installation-troubleshooting.md',
      'docs/zh/guides/MEMORY-INTEGRATION.md',
      'docs/zh/guides/MEMORY-INTELLIGENCE-SYSTEM.md',
      'docs/zh/guides/security-hardening.md',
      'docs/zh/security.md',
    ]);

    for (const entry of provenance.entries) {
      const destination = path.join(ROOT, entry.destination);
      expect(entry.behavioral_verification).toBe('NOT_PERFORMED');
      const content = fs.readFileSync(destination, 'utf8').replace(/\r\n/g, '\n');
      expect(sha256(content)).toBe(entry.output_sha256);
      expect(content).toContain('AEXOS localization provenance:');
      expect(content).toContain('not behaviorally verified');
      if (entry.status === 'ADAPTED_WITH_EXPLICIT_LIMITATIONS') {
        expect(entry.limitations.length).toBeGreaterThan(0);
        expect(entry.content_recovery)
          .toBe('PORTABLE_SECTIONS_RETAINED_UNSUPPORTED_OPERATIONS_ANNOTATED');
        expect(entry.output_line_count).toBeGreaterThanOrEqual(entry.source_line_count);
        const source = sources.get(entry.source).content;
        expect(entry.source_line_count).toBe(source.split('\n').length);
        expect(content).toContain('availability boundary');
        expect(content).toContain('Unsupported prerequisite:');
        expect(content).toMatch(
          /AEXOS_HOSTED_SQUADS_ENDPOINT_UNAVAILABLE|UPSTREAM_SUBMODULE_REPOSITORY_UNAVAILABLE|UPSTREAM_DIAGNOSTIC_DOWNLOAD_UNAVAILABLE|AEXOS_PRO_PRIVATE_RUNTIME_UNAVAILABLE|UPSTREAM_SECURITY_CONTACT_UNAVAILABLE/,
        );
      }
      expect(content).not.toMatch(/api\.synkra\.ai|security@synkra\.ai|discord\.gg\/gk8jAdXWmj|\baiox-pro\b/i);
      expect(content).not.toMatch(/npx\s+aiox-core|\.aiox-core|@aiox-master|\.claude\/commands\/AIOX/i);
      expect(content).not.toMatch(/aiox-core\.dev|github\.com\/(?:SynkraAIinc|aiox-core)\/aiox-core/i);
      expect(content).not.toMatch(/raw\.githubusercontent\.com\/SynkraAI\/aiox-core\/main\/tools/i);
      expect(content).not.toContain('https://github.com/CyryxLabs/AEXOS');
    }

    expect(provenance.supplemental_entries).toHaveLength(1);
    const [idsGuide] = provenance.supplemental_entries;
    expect(idsGuide.destination).toBe('docs/guides/IDS-CONCEITOS-EXPLICADOS.md');
    const idsContent = fs.readFileSync(path.join(ROOT, idsGuide.destination), 'utf8').replace(/\r\n/g, '\n');
    expect(sha256(idsContent)).toBe(idsGuide.output_sha256);
    expect(idsContent).toContain('# IDS - Incremental Development System: Conceitos Explicados');
    expect(idsContent).toContain('aexos ids:query');
    expect(idsContent).toContain('aexos ids:check');
    expect(idsContent).toContain('aexos ids:impact');
    expect(idsContent).toContain('aexos ids:register');
    expect(idsContent).not.toMatch(/aexos ids:(?:backup|sync)/);
    expect(idsContent).not.toMatch(/\.aiox-core|\baiox ids:/i);
  });

  test('limited adaptations and their known incoming navigation links resolve locally', () => {
    const provenance = JSON.parse(fs.readFileSync(PROVENANCE_PATH, 'utf8'));
    const limited = provenance.entries.filter((entry) => entry.status === 'ADAPTED_WITH_EXPLICIT_LIMITATIONS');
    const incoming = [
      ['docs/es/guides/README.md', './installation-troubleshooting.md'],
      ['docs/pt/guides/README.md', './installation-troubleshooting.md'],
      ['docs/zh/guides/README.md', './installation-troubleshooting.md'],
      ['docs/es/guides/squads-guide.md', '../api/squads-api.md'],
      ['docs/pt/guides/squads-guide.md', '../api/squads-api.md'],
      ['docs/es/guides/user-guide.md', '../architecture/multi-repo-strategy.md'],
      ['docs/pt/guides/user-guide.md', '../architecture/multi-repo-strategy.md'],
    ];
    for (const entry of limited) {
      const absolute = path.join(ROOT, entry.destination);
      const content = fs.readFileSync(absolute, 'utf8');
      for (const match of content.matchAll(/\[[^\]]+\]\(([^)#]+)(?:#[^)]+)?\)/g)) {
        if (/^(?:https?:|mailto:)/i.test(match[1])) continue;
        const target = path.resolve(path.dirname(absolute), match[1]);
        expect(fs.existsSync(target)).toBe(true);
      }
    }
    for (const [source, href] of incoming) {
      expect(fs.readFileSync(path.join(ROOT, source), 'utf8')).toContain(`](${href})`);
      expect(fs.existsSync(path.resolve(path.dirname(path.join(ROOT, source)), href))).toBe(true);
    }
  });

  test('reproduces all 394 documents from the immutable pinned source corpus', () => {
    expect(sha256(FIXTURE)).toBe(FIXTURE_SHA256);
    expect(corpus.source_commit).toBe(SOURCE_COMMIT);
    expect(corpus.license).toBe('MIT');
    expect(corpus.entries).toHaveLength(394);
    expect(sources.size).toBe(394);
    const provenance = JSON.parse(fs.readFileSync(PROVENANCE_PATH, 'utf8'));
    expect(provenance.entries.map(entry => entry.source).sort()).toEqual([...sources.keys()].sort());
    for (const entry of provenance.entries) {
      const source = sources.get(entry.source);
      expect(sha256(source.content)).toBe(source.sha256);
      expect(source.sha256).toBe(entry.source_sha256);
      const blockers = classifyBlocker(source.content);
      const render = () => blockers.length
        ? renderLimitedFallback(source.content, entry.source, entry.destination, blockers)
        : transformContent(source.content, entry.source);
      const actual = render().content;
      expect(render().content).toBe(actual);
      expect(sha256(actual)).toBe(entry.output_sha256);
      expect(fs.readFileSync(path.join(ROOT, entry.destination), 'utf8').replace(/\r\n/g, '\n')).toBe(actual);
    }
  });
});
