/**
 * Wizard Integration Tests
 *
 * Story 1.7: Dependency Installation Integration
 * Tests the full wizard flow including dependency installation
 */

const inquirer = require('inquirer');
const fse = require('fs-extra');
const { runWizard } = require('../../packages/installer/src/wizard/index');
const {
  installDependencies,
  detectPackageManager,
} = require('../../packages/installer/src/installer/dependency-installer');
const {
  configureEnvironment,
} = require('../../packages/installer/src/config/configure-environment');
const { generateIDEConfigs } = require('../../packages/installer/src/wizard/ide-config-generator');
const { installCyryxCore, hasPackageJson } = require('../../packages/installer/src/installer/aexos-core-installer');

// Mock dependencies
jest.mock('inquirer');
jest.mock('../../packages/installer/src/wizard/visual-selectors', () => ({
  createVisualPrompt: () => require('inquirer').prompt,
}));
jest.mock('../../.aexos-core/infrastructure/scripts/ide-sync/index', () => ({ commandSync: jest.fn(() => ({ success: true })), commandValidate: jest.fn(() => ({ summary: { pass: true } })) }));
jest.mock('../../.aexos-core/infrastructure/scripts/codex-skills-sync/index', () => ({ syncSkills: jest.fn(() => ({ generated: 12 })) }));
jest.mock('../../.aexos-core/infrastructure/scripts/generate-settings-json', () => ({ generate: jest.fn() }));
jest.mock('fs-extra');
jest.mock('../../packages/installer/src/installer/dependency-installer');
jest.mock('../../packages/installer/src/config/configure-environment');
jest.mock('../../packages/installer/src/wizard/ide-config-generator');
jest.mock('../../packages/installer/src/installer/aexos-core-installer');
jest.mock('../../packages/installer/src/installer/install-footprint', () => ({
  findLegacyInstalls: jest.fn(() => ({ items: [], brands: [] })),
  removeFootprint: jest.fn(() => ({ removed: [], failed: [] })),
}));
jest.mock('../../bin/modules/mcp-installer', () => ({
  installProjectMCPs: jest.fn().mockResolvedValue({
    success: true,
    installedMCPs: {},
    configPath: '.mcp.json',
    errors: [],
  }),
}));
jest.mock('../../packages/installer/src/wizard/validation', () => ({
  validateInstallation: jest.fn().mockResolvedValue({
    overallStatus: 'success',
    valid: true,
    errors: [],
    warnings: [],
  }),
  displayValidationReport: jest.fn().mockResolvedValue(),
  provideTroubleshooting: jest.fn().mockResolvedValue(),
}));
jest.mock('../../packages/installer/src/wizard/feedback', () => ({
  showWelcome: jest.fn(),
  showCompletion: jest.fn(),
  showCancellation: jest.fn(),
}));

describe('Wizard Integration - Story 1.7', () => {
  let consoleLogSpy, consoleErrorSpy;
  const originalNoColor = process.env.NO_COLOR;
  const originalTerm = process.env.TERM;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // These tests drive the interactive path with a mocked inquirer, so they
    // are simulating a terminal session. Say so: under Jest there is no TTY,
    // and the wizard now refuses to prompt without one rather than dying on a
    // closed readline.
    process.stdin.isTTY = true;
    process.stdout.isTTY = true;
    delete process.env.NO_COLOR;
    process.env.TERM = 'xterm';

    // Default mocks for successful flow
    inquirer.prompt.mockResolvedValue({
      reviewAction: 'install',
      projectType: 'greenfield',
      selectedIDEs: ['vscode'],
    });

    generateIDEConfigs.mockResolvedValue({
      success: true,
      configs: [{ ide: 'vscode', path: '.vscode/settings.json' }],
    });

    configureEnvironment.mockResolvedValue({
      envCreated: true,
      envExampleCreated: true,
      coreConfigCreated: true,
      gitignoreUpdated: true,
      errors: [],
    });

    // Mock AEXOS core installer
    installCyryxCore.mockResolvedValue({
      success: true,
      installedFiles: ['agents/dev.md', 'tasks/create-story.yaml'],
      installedFolders: ['agents', 'tasks', 'workflows', 'templates'],
      errors: [],
    });

    // Mock hasPackageJson - default to true (brownfield project)
    hasPackageJson.mockResolvedValue(true);

    // Mock detectPackageManager
    detectPackageManager.mockReturnValue('npm');

    installDependencies.mockResolvedValue({
      success: true,
      packageManager: 'npm',
    });

    // Mock fs-extra for getExistingUserProfile() - Story 10.2
    // Default: no existing core-config.yaml (forces user profile prompt)
    fse.pathExists.mockResolvedValue(false);
    fse.existsSync.mockReturnValue(false);
    fse.ensureDir.mockResolvedValue();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();

    // Leave the process as it was found: these flags are global, and a suite
    // that runs after this one would inherit a terminal that is not there.
    delete process.stdin.isTTY;
    delete process.stdout.isTTY;
    if (originalNoColor === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = originalNoColor;
    if (originalTerm === undefined) delete process.env.TERM;
    else process.env.TERM = originalTerm;
  });

  describe('Full Wizard Flow (AC Integration)', () => {
    it('reviews before writes, preserves empty hosts on edit, then installs reviewed values', async () => {
      inquirer.prompt.mockReset().mockImplementation(async (questions) => {
        const name = questions[0].name;
        if (name === 'reviewAction') {
          expect(installCyryxCore).not.toHaveBeenCalled();
          expect(configureEnvironment).not.toHaveBeenCalled();
          expect(installDependencies).not.toHaveBeenCalled();
          expect(require('../../packages/installer/src/installer/install-footprint').findLegacyInstalls).not.toHaveBeenCalled();
          return { reviewAction: reviewCount++ === 0 ? 'edit' : 'install' };
        }
        if (questions.length === 4) {
          expect(questions.find((q) => q.name === 'userProfile').default).toBe('bob');
          expect(questions.find((q) => q.name === 'selectedIDEs').default).toEqual([]);
          expect(questions.find((q) => q.name === 'selectedIDEs').choices.every((c) => !c.checked)).toBe(true);
          return { userProfile: 'advanced', projectType: 'brownfield', selectedIDEs: [], selectedTechPreset: 'none' };
        }
        return name === 'userProfile' ? { userProfile: 'bob' } : { projectType: 'greenfield', selectedIDEs: [], selectedTechPreset: 'none' };
      });
      let reviewCount = 0;
      const result = await runWizard({ skipPro: true });
      expect(reviewCount).toBe(2);
      expect(result).toMatchObject({ userProfile: 'advanced', projectType: 'brownfield', selectedIDEs: [] });
      expect(configureEnvironment).toHaveBeenCalledWith(expect.objectContaining({ userProfile: 'advanced', projectType: 'brownfield', selectedIDEs: [] }));
    });

    it('review cancellation leaves installation untouched and removes its signal listener', async () => {
      const listeners = process.listenerCount('SIGINT');
      inquirer.prompt.mockImplementation(async (questions) => questions[0].name === 'reviewAction'
        ? { reviewAction: 'cancel' } : { userProfile: 'advanced', projectType: 'greenfield', selectedIDEs: [] });
      await expect(runWizard({ createdDirectory: true })).rejects.toMatchObject({ code: 'AEXOS_INSTALL_CANCELLED', exitCode: 130 });
      expect(installCyryxCore).not.toHaveBeenCalled();
      expect(configureEnvironment).not.toHaveBeenCalled();
      expect(installDependencies).not.toHaveBeenCalled();
      expect(require('../../packages/installer/src/wizard/feedback').showCompletion).not.toHaveBeenCalled();
      expect(require('../../packages/installer/src/wizard/feedback').showCancellation).toHaveBeenCalledWith({ createdDirectory: true, installationStarted: false });
      expect(process.listenerCount('SIGINT')).toBe(listeners);
    });

    it.each([{ ci: true }, { yes: true }, { quiet: true }, { interactive: false }])('never prompts on dependency failure in %j mode', async (options) => {
      installDependencies.mockResolvedValue({ success: false, errorMessage: 'network unavailable' });
      await expect(runWizard({ ...options, skipPro: true })).rejects.toThrow('Dependencies');
      expect(inquirer.prompt).not.toHaveBeenCalled();
      expect(configureEnvironment).toHaveBeenCalledWith(expect.objectContaining({ skipPrompts: true }));
      expect(installDependencies).toHaveBeenCalledTimes(1);
    });

    it('skips project dependencies only when --skip-install is supplied', async () => {
      const result = await runWizard({ quiet: true, skipInstall: true, skipPro: true });
      expect(installCyryxCore).toHaveBeenCalled();
      expect(installDependencies).not.toHaveBeenCalled();
      expect(result.depsResult).toMatchObject({ success: true, skipped: true, reason: 'skip-install' });
    });

    it('does not invoke any host writer or sync for explicit empty hosts', async () => {
      inquirer.prompt.mockResolvedValue({ reviewAction: 'install', projectType: 'greenfield', selectedIDEs: [] });
      const ide = require('../../packages/installer/src/wizard/ide-config-generator');
      const sync = require('../../.aexos-core/infrastructure/scripts/ide-sync/index');
      const codex = require('../../.aexos-core/infrastructure/scripts/codex-skills-sync/index');
      const result = await runWizard();
      expect(result.ideSyncStatus).toBe('not-applicable');
      expect(generateIDEConfigs).not.toHaveBeenCalled();
      for (const writer of ['copySkillFiles', 'copyExtraCommandFiles', 'generateCodexSkills']) {
        expect(ide[writer]).not.toHaveBeenCalled();
      }
      expect(sync.commandSync).not.toHaveBeenCalled();
      expect(sync.commandValidate).not.toHaveBeenCalled();
      expect(codex.syncSkills).not.toHaveBeenCalled();
    });

    it('generates selected Claude protection from the final configured target', async () => {
      const settings = require('../../.aexos-core/infrastructure/scripts/generate-settings-json');
      const ide = require('../../packages/installer/src/wizard/ide-config-generator');
      ide.copySkillFiles.mockResolvedValueOnce({ count: 12, skipped: false });
      ide.copyExtraCommandFiles.mockResolvedValueOnce({ count: 12, skipped: false });
      fse.readFile.mockResolvedValue('{}');
      const result = await runWizard({ quiet: true, ide: 'claude-code', skipPro: true });
      expect(settings.generate).toHaveBeenCalledTimes(1);
      expect(settings.generate).toHaveBeenCalledWith(process.cwd());
      expect(settings.generate.mock.invocationCallOrder[0]).toBeGreaterThan(configureEnvironment.mock.invocationCallOrder[0]);
      expect(result.settingsGenerated).toBe(true);
    });

    it('limits sync to selected host and fails completion on reported drift', async () => {
      inquirer.prompt.mockResolvedValue({ reviewAction: 'install', projectType: 'greenfield', selectedIDEs: ['gemini'] });
      const sync = require('../../.aexos-core/infrastructure/scripts/ide-sync/index');
      sync.commandValidate.mockReturnValueOnce({ summary: { pass: false } });
      await expect(runWizard()).rejects.toThrow('Host projection sync');
      expect(sync.commandSync).toHaveBeenCalledTimes(1);
      expect(sync.commandSync).toHaveBeenCalledWith({ quiet: true, ide: 'gemini' });
    });

    it('fails completion when selected Codex skills sync throws', async () => {
      inquirer.prompt.mockResolvedValue({ reviewAction: 'install', projectType: 'greenfield', selectedIDEs: ['codex'] });
      const ide = require('../../packages/installer/src/wizard/ide-config-generator');
      ide.generateCodexSkills.mockReturnValueOnce({ count: 12, skipped: false });
      const codex = require('../../.aexos-core/infrastructure/scripts/codex-skills-sync/index');
      codex.syncSkills.mockImplementationOnce(() => { throw new Error('disk write rejected'); });
      await expect(runWizard()).rejects.toThrow('Codex skills');
    });

    it('should complete full wizard with dependency installation', async () => {
      const answers = await runWizard();

      expect(answers.projectType).toBe('greenfield');
      expect(answers.selectedIDEs).toContain('vscode');
      expect(answers.packageManager).toBe('npm'); // Auto-detected
      expect(answers.envConfigured).toBe(true);
      expect(answers.depsInstalled).toBe(true);
      expect(answers.depsResult.success).toBe(true);
    });

    it('should install AEXOS core before IDE configs', async () => {
      await runWizard();

      // Verify AEXOS core was installed
      expect(installCyryxCore).toHaveBeenCalled();

      // Verify order: AEXOS core before IDE configs
      const cyryxCoreCallOrder = installCyryxCore.mock.invocationCallOrder[0];
      const ideConfigCallOrder = generateIDEConfigs.mock.invocationCallOrder[0];

      expect(cyryxCoreCallOrder).toBeLessThan(ideConfigCallOrder);
    });

    it('should install dependencies after env configuration', async () => {
      await runWizard();

      // Verify order of operations
      const envCallOrder = configureEnvironment.mock.invocationCallOrder[0];
      const depsCallOrder = installDependencies.mock.invocationCallOrder[0];

      expect(envCallOrder).toBeLessThan(depsCallOrder);
    });

    it('should use auto-detected package manager for installDependencies', async () => {
      detectPackageManager.mockReturnValue('yarn');

      await runWizard();

      expect(installDependencies).toHaveBeenCalledWith({
        packageManager: 'yarn',
        projectPath: process.cwd(),
      });
    });

    it('should short-circuit in dry-run mode before any filesystem writes', async () => {
      const preview = await runWizard({ dryRun: true, quiet: true });

      expect(preview).toEqual(
        expect.objectContaining({
          dryRun: true,
          projectType: 'brownfield',
          steps: expect.arrayContaining(['install-aexos-core', 'configure-environment']),
        }),
      );
      expect(installCyryxCore).not.toHaveBeenCalled();
      expect(generateIDEConfigs).not.toHaveBeenCalled();
      expect(configureEnvironment).not.toHaveBeenCalled();
      expect(installDependencies).not.toHaveBeenCalled();
    });
  });

  describe('Package Manager Auto-Detection (AC1)', () => {
    it('should auto-detect npm', async () => {
      detectPackageManager.mockReturnValue('npm');

      const answers = await runWizard();
      expect(answers.packageManager).toBe('npm');
    });

    it('should auto-detect yarn', async () => {
      detectPackageManager.mockReturnValue('yarn');

      const answers = await runWizard();
      expect(answers.packageManager).toBe('yarn');
    });

    it('should auto-detect pnpm', async () => {
      detectPackageManager.mockReturnValue('pnpm');

      const answers = await runWizard();
      expect(answers.packageManager).toBe('pnpm');
    });

    it('should auto-detect bun', async () => {
      detectPackageManager.mockReturnValue('bun');

      const answers = await runWizard();
      expect(answers.packageManager).toBe('bun');
    });
  });

  describe('Greenfield Projects (No package.json)', () => {
    it('should skip dependency installation when no package.json exists', async () => {
      hasPackageJson.mockResolvedValue(false);

      const answers = await runWizard();

      expect(installDependencies).not.toHaveBeenCalled();
      expect(answers.depsInstalled).toBe(true);
      expect(answers.depsResult.skipped).toBe(true);
      expect(answers.depsResult.reason).toBe('no-package-json');
    });

    it('should still set packageManager when skipping dependencies', async () => {
      hasPackageJson.mockResolvedValue(false);
      detectPackageManager.mockReturnValue('pnpm');

      const answers = await runWizard();

      expect(answers.packageManager).toBe('pnpm');
    });
  });

  describe('User Profile Selection (Story 10.2)', () => {
    it('should include userProfile in wizard answers', async () => {
      inquirer.prompt
        .mockResolvedValueOnce({ userProfile: 'advanced' })
        .mockResolvedValueOnce({
          projectType: 'greenfield',
          selectedIDEs: ['vscode'],
          selectedTechPreset: 'none',
        });

      const answers = await runWizard();

      expect(answers.userProfile).toBeDefined();
      expect(['bob', 'advanced']).toContain(answers.userProfile);
    });

    it('should pass userProfile to configureEnvironment', async () => {
      inquirer.prompt
        .mockResolvedValueOnce({ userProfile: 'bob' })
        .mockResolvedValueOnce({
          projectType: 'greenfield',
          selectedIDEs: ['vscode'],
          selectedTechPreset: 'none',
        });

      await runWizard();

      expect(configureEnvironment).toHaveBeenCalledWith(
        expect.objectContaining({
          userProfile: 'bob',
        }),
      );
    });

    it('should use existing profile when core-config.yaml exists (idempotency)', async () => {
      // Mock existing core-config.yaml with user_profile
      fse.pathExists.mockResolvedValue(true);
      fse.readFile.mockResolvedValue('user_profile: bob\nmarkdownExploder: true');

      // Only 2 prompts needed: language + remaining questions (no user profile prompt)
      inquirer.prompt
        .mockResolvedValueOnce({
          projectType: 'greenfield',
          selectedIDEs: ['vscode'],
          selectedTechPreset: 'none',
        });

      const answers = await runWizard();

      // Should use existing profile without prompting
      expect(answers.userProfile).toBe('bob');
      // Console should show skipped message
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('bob'));
    });

    it('should default to advanced when user_profile is missing from existing config', async () => {
      // Mock existing core-config.yaml WITHOUT user_profile
      fse.pathExists.mockResolvedValue(true);
      fse.readFile.mockResolvedValue('markdownExploder: true\nproject:\n  type: GREENFIELD');

      // Need all 3 prompts since user_profile doesn't exist
      inquirer.prompt
        .mockResolvedValueOnce({ userProfile: 'advanced' })
        .mockResolvedValueOnce({
          projectType: 'greenfield',
          selectedIDEs: ['vscode'],
          selectedTechPreset: 'none',
        });

      const answers = await runWizard();

      expect(answers.userProfile).toBe('advanced');
    });

    it('should handle invalid user_profile in existing config gracefully', async () => {
      // Mock existing core-config.yaml with INVALID user_profile
      fse.pathExists.mockResolvedValue(true);
      fse.readFile.mockResolvedValue('user_profile: invalid_value\nmarkdownExploder: true');

      // Need all 3 prompts since user_profile is invalid
      inquirer.prompt
        .mockResolvedValueOnce({ userProfile: 'advanced' })
        .mockResolvedValueOnce({
          projectType: 'greenfield',
          selectedIDEs: ['vscode'],
          selectedTechPreset: 'none',
        });

      const answers = await runWizard();

      // Should prompt for new profile since existing is invalid
      expect(answers.userProfile).toBe('advanced');
    });
  });

  describe('Offline Mode (AC6)', () => {
    it('should handle offline mode gracefully', async () => {
      installDependencies.mockResolvedValue({
        success: true,
        offlineMode: true,
        packageManager: 'npm',
      });

      const answers = await runWizard();

      expect(answers.depsInstalled).toBe(true);
      expect(answers.depsResult.offlineMode).toBe(true);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('offline mode'));
    });
  });

  describe('Error Handling (AC4, AC5)', () => {
    it('should offer retry on installation failure', async () => {
      installDependencies
        .mockResolvedValueOnce({
          success: false,
          errorMessage: 'Network connection failed',
          solution: 'Check your internet connection',
          errorCategory: 'network',
        })
        .mockResolvedValueOnce({
          success: true,
          packageManager: 'npm',
        });

      // Mock prompt sequence: 1) user profile, 2) project type + IDEs + tech preset, 3) retryDeps
      // The wizard no longer asks for a language — AEXOS is English-only.
      inquirer.prompt
        .mockResolvedValueOnce({ userProfile: 'advanced' }) // Story 10.2: User Profile
        .mockResolvedValueOnce({
          projectType: 'greenfield',
          selectedIDEs: [],
          selectedTechPreset: 'none',
        })
        .mockResolvedValueOnce({ reviewAction: 'install' })
        .mockResolvedValueOnce({
          retryDeps: true,
        });

      const answers = await runWizard();

      expect(installDependencies).toHaveBeenCalledTimes(2);
      expect(answers.depsInstalled).toBe(true);
    });

    it('should report incomplete installation when dependency retry is skipped', async () => {
      installDependencies.mockResolvedValue({
        success: false,
        errorMessage: 'Network connection failed',
        solution: 'Check your internet connection',
      });

      // Mock prompt sequence: 1) user profile, 2) project type + IDEs + tech preset, 3) retryDeps
      // The wizard no longer asks for a language — AEXOS is English-only.
      inquirer.prompt
        .mockResolvedValueOnce({ userProfile: 'advanced' }) // Story 10.2: User Profile
        .mockResolvedValueOnce({
          projectType: 'greenfield',
          selectedIDEs: [],
          selectedTechPreset: 'none',
        })
        .mockResolvedValueOnce({ reviewAction: 'install' })
        .mockResolvedValueOnce({
          retryDeps: false,
        });

      await expect(runWizard()).rejects.toThrow('Installation incomplete: Dependencies');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('manually'));
    });

    it('should display clear error messages', async () => {
      installDependencies.mockResolvedValue({
        success: false,
        errorMessage: 'Permission denied',
        solution: 'Try running with elevated permissions',
        errorCategory: 'permission',
      });

      inquirer.prompt
        .mockResolvedValueOnce({
          userProfile: 'advanced',
        })
        .mockResolvedValueOnce({ projectType: 'greenfield', selectedIDEs: [] })
        .mockResolvedValueOnce({ reviewAction: 'install' })
        .mockResolvedValueOnce({
          retryDeps: false,
        });

      await expect(runWizard()).rejects.toThrow('Installation incomplete');

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Permission denied'));
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('elevated permissions'));
    });
  });

  describe('Progress Feedback (AC3)', () => {
    it('should show installation progress messages', async () => {
      await runWizard();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Installing dependencies'),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('installed'));
    });
  });

  describe('Wizard State Flow', () => {
    it('should maintain correct state through all steps', async () => {
      const answers = await runWizard();

      // Verify all story steps completed
      expect(answers.projectType).toBeDefined(); // Story 1.3
      expect(answers.selectedIDEs).toBeDefined(); // Story 1.4
      expect(answers.envConfigured).toBeDefined(); // Story 1.6
      expect(answers.packageManager).toBeDefined(); // Story 1.7 (auto-detected)
      expect(answers.depsInstalled).toBeDefined(); // Story 1.7
      expect(answers.cyryxCoreInstalled).toBeDefined(); // Story 1.4 - AEXOS core
    });

    it('should handle environment config failure gracefully', async () => {
      configureEnvironment.mockRejectedValue(new Error('Env config failed'));

      // Mock prompt sequence: 1) language, 2) user profile (Story 10.2), 3) project type + IDEs + tech preset, 4) continueWithoutEnv
      inquirer.prompt
        .mockResolvedValueOnce({ userProfile: 'advanced' }) // Story 10.2: User Profile
        .mockResolvedValueOnce({
          projectType: 'greenfield',
          selectedIDEs: [],
          selectedTechPreset: 'none',
        })
        .mockResolvedValueOnce({ reviewAction: 'install' })
        .mockResolvedValueOnce({
          continueWithoutEnv: true,
        });

      await expect(runWizard()).rejects.toThrow('Installation incomplete: Project configuration');
      // Should still proceed to dependency installation
      expect(installDependencies).toHaveBeenCalled();
    });

    it('should handle AEXOS core installation failure gracefully', async () => {
      installCyryxCore.mockRejectedValue(new Error('CYRYX core installation failed'));

      await expect(runWizard()).rejects.toThrow('Installation incomplete: Framework files');
      // Should still proceed to other steps
      expect(configureEnvironment).toHaveBeenCalled();
    });
  });
});
