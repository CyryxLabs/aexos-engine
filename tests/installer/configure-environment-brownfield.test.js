const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const yaml = require('js-yaml');

const { configureEnvironment } = require('../../packages/installer/src/config/configure-environment');

describe('configureEnvironment brownfield merge behavior', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aexos-config-brownfield-'));
    await fs.ensureDir(path.join(tempDir, '.aexos-core'));
  });

  afterEach(async () => {
    if (tempDir && await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  it('replaces a just-copied framework template with the reviewed project values', async () => {
    const configPath = path.join(tempDir, '.aexos-core', 'core-config.yaml');
    await fs.writeFile(configPath, yaml.dump({ user_profile: 'bob', project: { type: 'EXISTING_CYRYX' }, authorOnly: true }));
    const result = await configureEnvironment({ targetDir: tempDir, projectType: 'brownfield', userProfile: 'advanced', selectedIDEs: [], skipPrompts: true, coreConfigCreatedByInstaller: true });
    expect(result.coreConfigCreated).toBe(true);
    const config = yaml.load(await fs.readFile(configPath, 'utf8'));
    expect(config.user_profile).toBe('advanced');
    expect(config).not.toHaveProperty('authorOnly');
    expect(config.ide.selected).toEqual([]);
  });

  it('applies an explicitly reviewed profile change while preserving other project settings', async () => {
    const configPath = path.join(tempDir, '.aexos-core', 'core-config.yaml');
    await fs.writeFile(configPath, yaml.dump({ user_profile: 'bob', metrics: { custom: true } }));
    await configureEnvironment({ targetDir: tempDir, projectType: 'brownfield', userProfile: 'advanced', skipPrompts: true, userProfileChangedByReview: true });
    const config = yaml.load(await fs.readFile(configPath, 'utf8'));
    expect(config.user_profile).toBe('advanced');
    expect(config.metrics).toEqual({ custom: true });
  });

  it('should merge .env.example and core-config.yaml for lowercase brownfield projectType', async () => {
    await fs.writeFile(
      path.join(tempDir, '.env.example'),
      'CUSTOM_ONLY=keep-me\nCIRCLE_TOKEN=\n',
      'utf8',
    );
    await fs.writeFile(
      path.join(tempDir, '.aexos-core', 'core-config.yaml'),
      yaml.dump({
        user_profile: 'bob',
        ide: { selected: ['claude-code', 'cursor'], customOption: 'keep' },
        metrics: {
          custom: true,
        },
      }),
      'utf8',
    );

    const result = await configureEnvironment({
      targetDir: tempDir,
      projectType: 'brownfield',
      userProfile: 'advanced',
      skipPrompts: true,
    });

    expect(result.envExampleCreated).toBe(true);
    expect(result.coreConfigCreated).toBe(true);

    const envExample = await fs.readFile(path.join(tempDir, '.env.example'), 'utf8');
    expect(envExample).toContain('CUSTOM_ONLY=keep-me');
    expect(envExample).toContain('OPENAI_API_KEY=');

    const coreConfig = yaml.load(
      await fs.readFile(path.join(tempDir, '.aexos-core', 'core-config.yaml'), 'utf8'),
    );
    expect(coreConfig.user_profile).toBe('bob');
    expect(coreConfig.metrics).toEqual({ custom: true });
    expect(coreConfig.boundary.frameworkProtection).toBe(true);
    expect(coreConfig.ide.selected).toEqual([]);
    expect(coreConfig.ide.configs['claude-code']).toBe(false);
    expect(coreConfig.ide.customOption).toBe('keep');
  });
});
