'use strict';

const { Command } = require('commander');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createBrownfieldCommand } = require('../../.aexos-core/cli/commands/brownfield');
const { DEFAULT_LIMITS } = require('../../.aexos-core/core/code-intel/brownfield');

describe('brownfield CLI command', () => {
  let stdout;
  let write;
  let priorExitCode;

  beforeEach(() => {
    stdout = '';
    write = jest.spyOn(process.stdout, 'write').mockImplementation((value) => { stdout += value; return true; });
    priorExitCode = process.exitCode;
    process.exitCode = undefined;
  });

  afterEach(() => {
    write.mockRestore();
    process.exitCode = priorExitCode;
  });

  test('analyze prints returned evidence and does not invoke a writer', async () => {
    const root = path.resolve(__dirname, '../fixtures/brownfield/greenfield');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-brownfield-cli-'));
    const requestFile = path.join(temp, 'request.json');
    fs.writeFileSync(requestFile, JSON.stringify({
      protocol: 'aexos.brownfield-analysis/v1',
      analysisId: 'cli-control',
      projectRoot: root,
      allowedPaths: ['.'],
      exclusions: [],
      requestedViews: ['architecture', 'api'],
      limits: { ...DEFAULT_LIMITS },
      output: { mode: 'return', path: 'evidence/cli.json' },
      verification: { mode: 'static-only', requireSourceHashes: true, requireNoMutation: true },
    }));
    try {
      const command = new Command();
      command.exitOverride();
      command.addCommand(createBrownfieldCommand());
      await command.parseAsync([
        'node',
        'aexos',
        'brownfield',
        'analyze',
        requestFile,
        '--project-root',
        root,
      ]);
      expect(JSON.parse(stdout)).toMatchObject({
        protocol: 'aexos.brownfield-evidence/v1',
        analysisId: 'cli-control',
        findings: [],
        publication: { status: 'not-requested', target: 'evidence/cli.json' },
      });
      expect(fs.existsSync(path.join(root, 'evidence', 'cli.json'))).toBe(false);
      expect(process.exitCode).toBe(0);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });

  test('unknown format fails closed with a sanitized diagnostic', async () => {
    const root = path.resolve(__dirname, '../fixtures/brownfield/greenfield');
    const command = new Command();
    command.exitOverride();
    command.addCommand(createBrownfieldCommand());
    await command.parseAsync([
      'node',
      'aexos',
      'brownfield',
      'analyze',
      'missing.json',
      '--project-root',
      root,
      '--format',
      'yaml',
    ]);
    expect(JSON.parse(stdout)).toEqual({
      protocol: 'aexos.brownfield-diagnostic/v1',
      status: 'error',
      code: 'BROWNFIELD_EXPORT_FORMAT',
    });
  });
});
