'use strict';

const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const { commandValidate } = require('../../.aexos-core/infrastructure/scripts/ide-sync/index');
const { parseAllAgents } = require('../../.aexos-core/infrastructure/scripts/ide-sync/agent-parser');
const claudeTransformer = require('../../.aexos-core/infrastructure/scripts/ide-sync/transformers/claude-code');
const { syncGeminiCommands } = require('../../.aexos-core/infrastructure/scripts/ide-sync/gemini-commands');

describe('ide-sync commandValidate --ide filter', () => {
  let tmpRoot;
  let previousCwd;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-sync-validate-filter-'));
    previousCwd = process.cwd();
    process.chdir(tmpRoot);

    await fs.ensureDir(path.join(tmpRoot, '.aexos-core'));
    await fs.writeFile(
      path.join(tmpRoot, '.aexos-core', 'core-config.yaml'),
      [
        'ideSync:',
        '  enabled: true',
        '  source: .aexos-core/development/agents',
        '  targets:',
        '    claude-code:',
        '      enabled: true',
        '      path: .claude/commands/AEXOS/agents',
        '      format: full-markdown-yaml',
        '    gemini:',
        '      enabled: true',
        '      path: .gemini/rules/AEXOS/agents',
        '      format: full-markdown-yaml',
        '  redirects: {}',
      ].join('\n'),
      'utf8',
    );

    await fs.copy(
      path.join(previousCwd, '.aexos-core', 'development', 'agents'),
      path.join(tmpRoot, '.aexos-core', 'development', 'agents'),
    );

    await fs.ensureDir(path.join(tmpRoot, '.gemini', 'rules', 'AEXOS', 'agents'));
    const agents = parseAllAgents(path.join(tmpRoot, '.aexos-core', 'development', 'agents'));
    for (const agent of agents) {
      const content = claudeTransformer.transform(agent);
      await fs.writeFile(
        path.join(tmpRoot, '.gemini', 'rules', 'AEXOS', 'agents', agent.filename),
        content,
        'utf8',
      );
    }
    syncGeminiCommands(agents, tmpRoot, { dryRun: false });
  });

  afterEach(async () => {
    process.chdir(previousCwd);
    await fs.remove(tmpRoot);
  });

  it('validates only requested IDE when --ide is provided', async () => {
    await expect(commandValidate({ ide: 'gemini', strict: true, verbose: false })).resolves.toMatchObject({ summary: { pass: true } });
  });

  it('leaves successful quiet validation to the calling installer summary', async () => {
    const output = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const result = await commandValidate({ ide: 'gemini', quiet: true });
      expect(result.summary.pass).toBe(true);
      expect(output).not.toHaveBeenCalled();
    } finally {
      output.mockRestore();
    }
  });

  it('retains failure details even when quiet was requested', async () => {
    await fs.remove(path.join(tmpRoot, '.gemini', 'rules', 'AEXOS', 'agents', 'dev.md'));
    const output = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const result = await commandValidate({ ide: 'gemini', quiet: true });
      expect(result.summary.pass).toBe(false);
      expect(output.mock.calls.flat().join('\n')).toContain('FAIL');
    } finally {
      output.mockRestore();
    }
  });
});
