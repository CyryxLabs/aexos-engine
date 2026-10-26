'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  runParityValidation,
  diffCompatibilityContracts,
  formatHumanReport,
  normalizeResult,
} = require('../../.aexos-core/infrastructure/scripts/validate-parity');

const validGrok = () => ({
  schemaVersion: 1,
  valid: true,
  checked: 78,
  findings: [],
  evidenceLevel: 'generated-projection-comparison',
  hostRuntime: 'NOT_ASSESSED',
});

describe('validate-parity', () => {
  const roots = [];
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  function createMockProjectRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-parity-'));
    roots.push(root);
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'docs', 'ide-integration.md'),
      [
        '| IDE/CLI | Overall Status |',
        '| --- | --- |',
        '| Claude Code | Works |',
        '| Gemini CLI | Works |',
        '| Codex CLI | Limited |',
        '| Cursor | Limited |',
        '| GitHub Copilot | Limited |',
        '| AntiGravity | Limited |',
        '| Grok Build | Projection only |',
      ].join('\n'),
      'utf8',
    );
    return root;
  }

  function buildMockContract() {
    return {
      release: 'AEXOS 4.0.4',
      global_required_checks: ['paths'],
      ide_matrix: [
        { ide: 'claude-code', display_name: 'Claude Code', expected_status: 'Works', required_checks: ['claude-sync', 'claude-integration'] },
        { ide: 'gemini', display_name: 'Gemini CLI', expected_status: 'Works', required_checks: ['gemini-sync', 'gemini-integration'] },
        { ide: 'codex', display_name: 'Codex CLI', expected_status: 'Limited', required_checks: ['codex-sync', 'codex-integration', 'codex-skills'] },
        { ide: 'cursor', display_name: 'Cursor', expected_status: 'Limited', required_checks: ['cursor-sync'] },
        { ide: 'github-copilot', display_name: 'GitHub Copilot', expected_status: 'Limited', required_checks: ['github-copilot-sync'] },
        { ide: 'antigravity', display_name: 'AntiGravity', expected_status: 'Limited', required_checks: ['antigravity-sync'] },
        { ide: 'grok', display_name: 'Grok Build', expected_status: 'Projection only', required_checks: ['grok-projection'] },
      ],
    };
  }

  function runWithGrok(validateGrokProjection, contract = buildMockContract()) {
    const projectRoot = createMockProjectRoot();
    const ok = () => ({ ok: true, errors: [], warnings: [] });
    return runParityValidation({ projectRoot }, {
      runSyncValidate: ok,
      validateClaudeIntegration: ok,
      validateCodexIntegration: ok,
      validateGeminiIntegration: ok,
      validateCodexSkills: ok,
      validatePaths: ok,
      validateGrokProjection,
      loadCompatibilityContract: () => contract,
    });
  }

  it('reports Grok projection evidence and observed count without claiming host acceptance', () => {
    const result = runWithGrok(() => ({ ...validGrok(), checked: 83 }));
    expect(result.ok).toBe(true);
    expect(result.checks.find((check) => check.id === 'grok-projection')).toMatchObject({
      ok: true,
      metrics: { checked: 83 },
      evidenceLevel: 'generated-projection-comparison',
      hostRuntime: 'NOT_ASSESSED',
    });
    expect(formatHumanReport(result)).toContain('generated-projection-comparison');
    expect(formatHumanReport(result)).toContain('NOT_ASSESSED');
    expect(JSON.parse(JSON.stringify(result)).checks.some((check) => check.hostRuntime === 'NOT_ASSESSED')).toBe(true);
  });

  it.each(['missing', 'different', 'ownership-drift', 'stale-managed'])(
    'propagates Grok %s findings into aggregate and contract failure', (status) => {
      const result = runWithGrok(() => ({
        ...validGrok(), valid: false, findings: [{ path: 'agents/aexos-dev.md', status }],
      }));
      expect(result.ok).toBe(false);
      const grok = result.checks.find((check) => check.id === 'grok-projection');
      expect(grok.ok).toBe(false);
      expect(grok.errors.join(' ')).toContain(status);
      expect(grok.errors.join(' ')).toContain('agents/aexos-dev.md');
      expect(result.contractViolations.join(' ')).toContain('grok-projection');
    },
  );

  it.each([
    null, undefined, {},
    { ...validGrok(), valid: 'true' },
    { ...validGrok(), checked: 0 },
    { ...validGrok(), checked: -1 },
    { ...validGrok(), checked: 1.5 },
    { ...validGrok(), findings: null },
    { ...validGrok(), findings: [{ path: 'x', status: 'missing' }] },
    { ...validGrok(), evidenceLevel: 'native-runtime' },
    { ...validGrok(), hostRuntime: 'PASSED' },
    { ...validGrok(), skipped: true },
    { ...validGrok(), skipped: 'true' },
    { ...validGrok(), skipped: null },
  ])('rejects malformed or skipped Grok evidence %#', (value) => {
    const result = runWithGrok(() => value);
    expect(result.ok).toBe(false);
    expect(result.checks.find((check) => check.id === 'grok-projection').errors.length).toBeGreaterThan(0);
  });

  it('includes a thrown Grok validator error without dropping the other checks', () => {
    const result = runWithGrok(() => { throw new Error('broken Grok manifest'); });
    expect(result.ok).toBe(false);
    expect(result.checks).toHaveLength(12);
    expect(formatHumanReport(result)).toContain('broken Grok manifest');
    expect(result.checks.find((check) => check.id === 'paths').ok).toBe(true);
  });

  it('requires Grok projection in the actual default contract', () => {
    const yaml = require('js-yaml');
    const contract = yaml.load(fs.readFileSync(path.resolve(__dirname,
      '../../.aexos-core/infrastructure/contracts/compatibility/aexos-4.0.4.yaml'), 'utf8'));
    expect(contract.ide_matrix.find((ide) => ide.ide === 'grok').required_checks).toContain('grok-projection');
    expect(runWithGrok(validGrok, contract).ok).toBe(true);
    expect(runWithGrok(() => null, contract).ok).toBe(false);
  });

  it('does not omit Grok required by a custom contract or silently accept unknown checks', () => {
    const contract = {
      release: 'custom',
      ide_matrix: [{ ide: 'grok', display_name: 'Grok Build', expected_status: 'Projection only', required_checks: ['grok-projection'] }],
    };
    expect(runWithGrok(validGrok, contract).ok).toBe(true);
    expect(runWithGrok(() => null, contract).ok).toBe(false);
    contract.ide_matrix[0].required_checks.push('grok-native-hooks');
    expect(runWithGrok(validGrok, contract).contractViolations.join(' ')).toContain('grok-native-hooks');
  });

  it.each([null, [], { ok: 'true' }, { ok: true, skipped: true }, { ok: true, errors: ['failed'] },
    { ok: true, errors: 'actual failure' }, { ok: true, errors: null },
    { ok: true, errors: [null] }, { ok: true, skipped: 'true' }])(
    'rejects non-passing existing-host results %#', (value) => {
      expect(normalizeResult(value).ok).toBe(false);
    },
  );

  it.each([null, undefined, 'host failure'])('reports arbitrary thrown values without aborting other checks %#', (error) => {
    const projectRoot = createMockProjectRoot();
    const ok = () => ({ ok: true, errors: [], warnings: [] });
    const result = runParityValidation({ projectRoot }, {
      runSyncValidate: ok,
      validateClaudeIntegration: () => { throw error; },
      validateCodexIntegration: ok, validateGeminiIntegration: ok,
      validateCodexSkills: ok, validatePaths: ok,
      validateGrokProjection: () => { throw error; },
      loadCompatibilityContract: buildMockContract,
    });
    expect(result.ok).toBe(false);
    expect(result.checks).toHaveLength(12);
    expect(result.checks.find((check) => check.id === 'claude-integration').ok).toBe(false);
    expect(result.checks.find((check) => check.id === 'grok-projection').ok).toBe(false);
    expect(result.checks.find((check) => check.id === 'paths').ok).toBe(true);
    expect(formatHumanReport(result)).toContain(String(error));
  });

  it('passes when all checks return ok', () => {
    const projectRoot = createMockProjectRoot();
    const ok = { ok: true, errors: [], warnings: [] };
    const result = runParityValidation(
      { projectRoot },
      {
        runSyncValidate: () => ok,
        validateClaudeIntegration: () => ok,
        validateCodexIntegration: () => ok,
        validateGeminiIntegration: () => ok,
        validateCodexSkills: () => ok,
        validatePaths: () => ok,
        validateGrokProjection: validGrok,
        loadCompatibilityContract: () => buildMockContract(),
      },
    );

    expect(result.ok).toBe(true);
    expect(result.checks).toHaveLength(12);
    expect(result.checks.every((c) => c.ok)).toBe(true);
    expect(result.contractViolations).toHaveLength(0);
  });

  it('fails when any check fails', () => {
    const projectRoot = createMockProjectRoot();
    let count = 0;
    const result = runParityValidation(
      { projectRoot },
      {
        runSyncValidate: () => ({ ok: true, errors: [], warnings: [] }),
        validateClaudeIntegration: () => ({ ok: true, errors: [], warnings: [] }),
        validateCodexIntegration: () => {
          count += 1;
          return count === 1
            ? { ok: false, errors: ['broken codex integration'], warnings: [] }
            : { ok: true, errors: [], warnings: [] };
        },
        validateGeminiIntegration: () => ({ ok: true, errors: [], warnings: [] }),
        validateCodexSkills: () => ({ ok: true, errors: [], warnings: [] }),
        validatePaths: () => ({ ok: true, errors: [], warnings: [] }),
        validateGrokProjection: validGrok,
        loadCompatibilityContract: () => buildMockContract(),
      },
    );

    expect(result.ok).toBe(false);
    expect(result.checks.some((c) => c.id === 'codex-integration' && c.ok === false)).toBe(true);
  });

  it('fails when docs matrix claim diverges from contract', () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-parity-mismatch-'));
    roots.push(projectRoot);
    fs.mkdirSync(path.join(projectRoot, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'docs', 'ide-integration.md'), '| IDE/CLI | Overall Status |\n| --- | --- |\n| Codex CLI | Works |\n', 'utf8');

    const ok = { ok: true, errors: [], warnings: [] };
    const result = runParityValidation(
      { projectRoot },
      {
        runSyncValidate: () => ok,
        validateClaudeIntegration: () => ok,
        validateCodexIntegration: () => ok,
        validateGeminiIntegration: () => ok,
        validateCodexSkills: () => ok,
        validatePaths: () => ok,
        validateGrokProjection: validGrok,
        loadCompatibilityContract: () => buildMockContract(),
      },
    );

    expect(result.ok).toBe(false);
    expect(result.contractViolations.length).toBeGreaterThan(0);
  });

  it('generates diff between contract versions', () => {
    const previous = buildMockContract();
    const current = buildMockContract();
    current.release = 'AEXOS 4.1.0';
    current.global_required_checks = ['paths', 'codex-skills'];
    current.ide_matrix = current.ide_matrix.map((ide) => {
      if (ide.ide === 'codex') {
        return { ...ide, expected_status: 'Works' };
      }
      return ide;
    });

    const diff = diffCompatibilityContracts(current, previous);

    expect(diff).toBeDefined();
    expect(diff.release_changed).toBe(true);
    expect(diff.has_changes).toBe(true);
    expect(diff.global_required_checks.added).toContain('codex-skills');
    expect(diff.ide_changes.some((change) => change.ide === 'codex')).toBe(true);
  });

  it('includes contractDiff in parity result when --diff path is provided', () => {
    const projectRoot = createMockProjectRoot();
    const ok = { ok: true, errors: [], warnings: [] };
    const result = runParityValidation(
      { projectRoot, diffPath: '.aexos-core/infrastructure/contracts/compatibility/aexos-4.0.3.yaml' },
      {
        runSyncValidate: () => ok,
        validateClaudeIntegration: () => ok,
        validateCodexIntegration: () => ok,
        validateGeminiIntegration: () => ok,
        validateCodexSkills: () => ok,
        validatePaths: () => ok,
        validateGrokProjection: validGrok,
        loadCompatibilityContract: (contractPath) => {
          if (contractPath.endsWith('aexos-4.0.3.yaml')) {
            return {
              release: 'AEXOS 4.0.3',
              global_required_checks: ['paths'],
              ide_matrix: [
                { ide: 'codex', display_name: 'Codex CLI', expected_status: 'Experimental', required_checks: ['codex-sync'] },
              ],
            };
          }
          return buildMockContract();
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(result.contractDiff).toBeDefined();
    expect(result.contractDiff.from_release).toBe('AEXOS 4.0.3');
    expect(result.contractDiff.to_release).toBe('AEXOS 4.0.4');
    expect(result.contractDiff.has_changes).toBe(true);
  });
});
