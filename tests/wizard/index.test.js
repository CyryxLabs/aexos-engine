'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const inquirer = require('inquirer');
const { runWizard } = require('../../packages/installer/src/wizard/index');
const feedback = require('../../packages/installer/src/wizard/feedback');
const core = require('../../packages/installer/src/installer/aexos-core-installer');
const dependencies = require('../../packages/installer/src/installer/dependency-installer');

jest.mock('inquirer');
jest.mock('../../packages/installer/src/wizard/feedback');
jest.mock('../../packages/installer/src/installer/aexos-core-installer');
jest.mock('../../packages/installer/src/installer/dependency-installer');

// Full install ordering and failure propagation live in integration.test.js.
// These previously disabled placeholder cases now exercise the real public
// preview/prompt API against an empty disposable consumer, without installs.
describe('Wizard public preview and prompt contract', () => {
  let root;
  let previousCwd;
  beforeEach(() => {
    jest.clearAllMocks();
    previousCwd = process.cwd();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-wizard-preview-'));
    process.chdir(root);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    inquirer.prompt.mockImplementation(async questions => {
      if (questions.some(question => question.name === 'language')) return { language: 'en' };
      if (questions.some(question => question.name === 'userProfile')) return { userProfile: 'advanced' };
      return { projectType: 'greenfield', selectedIDEs: ['claude-code'], selectedTechPreset: 'none' };
    });
  });
  afterEach(() => {
    process.chdir(previousCwd);
    fs.rmSync(root, { recursive: true, force: true });
    jest.restoreAllMocks();
  });
  test('shows welcome and asks language before project and IDE choices', async () => {
    await runWizard({ interactive: true, dryRun: true });
    expect(feedback.showWelcome).toHaveBeenCalledTimes(1);
    expect(inquirer.prompt.mock.calls[0][0][0].name).toBe('language');
    expect(inquirer.prompt.mock.calls.flatMap(call => call[0].map(question => question.name))).toEqual(expect.arrayContaining(['projectType', 'selectedIDEs']));
  });
  test('returns the concrete planned surfaces without writing or claiming installation completion', async () => {
    const result = await runWizard({ interactive: true, dryRun: true });
    expect(result).toMatchObject({ dryRun: true, projectType: 'greenfield', selectedIDEs: ['claude-code'], selectedTechPreset: 'none' });
    expect(result.steps).toContain('install-dependencies');
    expect(result.steps).toContain('validate-installation');
    expect(core.installCyryxCore).not.toHaveBeenCalled();
    expect(dependencies.installDependencies).not.toHaveBeenCalled();
    expect(feedback.showCompletion).not.toHaveBeenCalled();
    expect(fs.readdirSync(root)).toEqual([]);
  });
  test('non-interactive preview consumes explicit choices without opening prompts', async () => {
    const result = await runWizard({ interactive: false, quiet: true, dryRun: true, projectType: 'brownfield', ide: 'grok' });
    expect(result).toMatchObject({ projectType: 'brownfield', selectedIDEs: ['grok'] });
    expect(inquirer.prompt).not.toHaveBeenCalled();
    expect(fs.readdirSync(root)).toEqual([]);
  });
  test.each([false, true])('propagates prompt failure (TTY=%s) without starting an install', async isTtyError => {
    const error = Object.assign(new Error('Prompt unavailable'), { isTtyError });
    inquirer.prompt.mockRejectedValueOnce(error);
    await expect(runWizard({ interactive: true, dryRun: true })).rejects.toThrow('Prompt unavailable');
    expect(core.installCyryxCore).not.toHaveBeenCalled();
    expect(feedback.showCompletion).not.toHaveBeenCalled();
    expect(fs.readdirSync(root)).toEqual([]);
  });
  test('exports an awaited asynchronous API', async () => {
    expect(typeof runWizard).toBe('function');
    const result = runWizard({ interactive: false, quiet: true, dryRun: true });
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toHaveProperty('dryRun', true);
  });
});
