'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const settingsJson = require('../../../.aexos-core/core/doctor/checks/settings-json');
const rulesFiles = require('../../../.aexos-core/core/doctor/checks/rules-files');
const claudeMd = require('../../../.aexos-core/core/doctor/checks/claude-md');
const npmPackages = require('../../../.aexos-core/core/doctor/checks/npm-packages');
const hooksClaude = require('../../../.aexos-core/core/doctor/checks/hooks-claude-count');

describe('doctor contract for a default fresh-init fixture', () => {
  let projectRoot;
  let context;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-fresh-init-doctor-'));
    context = { projectRoot, options: {} };

    fs.mkdirSync(path.join(projectRoot, '.claude'), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, '.claude', 'settings.json'),
      JSON.stringify({ language: 'english' }),
      'utf8',
    );

    const coreRoot = path.join(projectRoot, '.aexos-core');
    fs.mkdirSync(path.join(coreRoot, 'node_modules', 'fixture-dependency'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(coreRoot, 'package.json'),
      JSON.stringify({ dependencies: { 'fixture-dependency': '1.0.0' } }),
      'utf8',
    );
    fs.writeFileSync(
      path.join(coreRoot, 'core-config.yaml'),
      [
        'project:',
        '  type: greenfield',
        'ide:',
        '  selected: []',
        'boundary:',
        '  frameworkProtection: false',
        '  protected: []',
      ].join('\n'),
      'utf8',
    );
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it('has no FAIL for expected-absent project dependencies or Claude files', async () => {
    const results = await Promise.all([
      settingsJson.run(context),
      rulesFiles.run(context),
      claudeMd.run(context),
      npmPackages.run(context),
      hooksClaude.run(context),
    ]);

    expect(results.map((result) => result.check)).toEqual([
      'settings-json',
      'rules-files',
      'claude-md',
      'npm-packages',
      'hooks-claude-count',
    ]);
    expect(results.filter((result) => result.status === 'FAIL')).toEqual([]);
  });

  it('still FAILs for missing declared framework dependencies', async () => {
    fs.rmSync(path.join(projectRoot, '.aexos-core', 'node_modules'), {
      recursive: true,
      force: true,
    });

    const result = await npmPackages.run(context);
    expect(result.status).toBe('FAIL');
    expect(result.message).toContain('.aexos-core dependencies are declared');
  });

  it('still FAILs when an installed Claude surface is present but empty', async () => {
    fs.mkdirSync(path.join(projectRoot, '.claude', 'hooks'), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, '.claude', 'rules'), { recursive: true });

    const hookResult = await hooksClaude.run(context);
    const rulesResult = await rulesFiles.run(context);

    expect(hookResult.status).toBe('FAIL');
    expect(rulesResult.status).toBe('FAIL');
  });
});
