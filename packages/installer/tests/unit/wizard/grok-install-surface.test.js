'use strict';

const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');
const { getIDEConfig, getIDEKeys } = require('../../../src/config/ide-configs');
const { generateCoreConfig } = require('../../../src/config/templates/core-config-template');
const { generateIDEConfigs, generateGrokSkills } = require('../../../src/wizard/ide-config-generator');
const { validateGrok } = require('../../../../../.aexos-core/infrastructure/scripts/grok-skills-sync/validate');

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');

describe('Grok installer surface', () => {
  let projectRoot;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-grok-install-'));
    for (const relative of [
      '.aexos-core/development/agents',
      '.aexos-core/development/skills',
      '.aexos-core/infrastructure/templates/grok-hooks',
      '.aexos-core/product/templates/ide-rules',
    ]) {
      fs.copySync(path.join(repoRoot, relative), path.join(projectRoot, relative));
    }
  });

  afterEach(() => fs.removeSync(projectRoot));

  test('exposes Grok as a selectable recommended IDE with its canonical rules template', () => {
    expect(getIDEKeys()).toContain('grok');
    expect(getIDEConfig('grok')).toMatchObject({
      name: 'Grok Build',
      configFile: path.join('.grok', 'rules', 'aexos-core.md'),
      template: 'ide-rules/grok-rules.md',
      recommended: true,
    });
  });

  test('records Grok in explicit and default core configuration', () => {
    const explicit = yaml.load(generateCoreConfig({ selectedIDEs: ['grok'] }));
    expect(explicit.ide.selected).toEqual(['grok']);
    expect(explicit.ide.configs.grok).toBe(true);

    const defaults = yaml.load(generateCoreConfig({ selectedIDEs: [] }));
    expect(defaults.ide.selected).toContain('grok');
    expect(defaults.ide.configs.grok).toBe(true);
  });

  test('generates and strictly validates the installed project-local surface', () => {
    const result = generateGrokSkills(projectRoot);
    expect(result.agents).toBeGreaterThan(0);
    expect(result.files).toBeGreaterThanOrEqual(85);
    expect(fs.pathExistsSync(path.join(projectRoot, '.grok', 'hooks', 'git-push-authority.json'))).toBe(true);
    expect(fs.pathExistsSync(path.join(projectRoot, '.grok', 'aexos-managed.json'))).toBe(true);
    expect(validateGrok({ projectRoot, strict: true, quiet: true }).ok).toBe(true);
  });

  test('wires Grok selection through IDE config generation', async () => {
    const result = await generateIDEConfigs(
      ['grok'],
      { projectName: 'grok-smoke', projectType: 'greenfield' },
      { projectRoot, ci: true, yes: true },
    );
    expect(result.success).toBe(true);
    expect(fs.pathExistsSync(path.join(projectRoot, '.grok', 'skills', 'aexos-dev', 'SKILL.md'))).toBe(true);
    expect(validateGrok({ projectRoot, strict: true, quiet: true }).ok).toBe(true);
  });
});
