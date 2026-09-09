/**
 * AEXOS Interactive Wizard - Main Entry Point
 *
 * Story 1.2: Interactive Wizard Foundation
 * Provides core wizard functionality with visual feedback and navigation
 *
 * @module wizard
 */

const inquirer = require('inquirer');
const path = require('path');
const { createVisualPrompt } = require(path.join(__dirname, 'visual-selectors'));
const fse = require('fs-extra');
const { execSync } = require('child_process');
const { colors } = require('../utils/aexos-colors');
const {
  getUserProfileQuestion,
  getProjectTypeQuestion,
  getIDEQuestions,
  getTechPresetQuestion,
  getReviewQuestion,
  withQuestionDefaults,
} = require('./questions');
const { setLanguage, t } = require('./i18n');
const yaml = require('js-yaml');
const { showWelcome, showCompletion, showCancellation, stopTerminalActivity } = require('./feedback');
const { showInstallStep, readInstalledCounts, getInstallOutcome, getTerminalCapabilities, renderInstallPlan, promptPlainQuestions, createCancellationError } = require('./install-experience');
const { requireCyryxCoreModule } = require('../utils/package-paths');
const {
  generateIDEConfigs,
  showSuccessSummary,
  copySkillFiles,
  generateCodexSkills,
  copyExtraCommandFiles,
} = require('./ide-config-generator');
const { configureEnvironment } = require('../config/configure-environment');
const { installDependencies } = require('../installer/dependency-installer');
const { installCyryxCore, hasPackageJson } = require('../installer/aexos-core-installer');
const { scaffoldCoreSquads, regenerateSquadRegistry } = require('../installer/squad-scaffolder');
const { findLegacyInstalls, removeFootprint } = require('../installer/install-footprint');
const { enforceCommercialInstallGate } = require('../licensing/commercial-license-gate');
const {
  validateInstallation,
  provideTroubleshooting,
} = require('./validation');

function loadIdeSync() {
  return requireCyryxCoreModule('.aexos-core', 'infrastructure', 'scripts', 'ide-sync', 'index');
}

function loadCodexSkillsSync() {
  return requireCyryxCoreModule(
    '.aexos-core',
    'infrastructure',
    'scripts',
    'codex-skills-sync',
    'index',
  );
}

function loadLLMRoutingInstaller() {
  return requireCyryxCoreModule(
    '.aexos-core',
    'infrastructure',
    'scripts',
    'llm-routing',
    'install-llm-routing',
  );
}

// DISABLED: Legacy installation block superseded by squads flow (OSR-8)
// /**
//  * Generate AntiGravity workflow content for squad agents
//  * @param {string} agentName - Agent name (e.g., 'data-collector')
//  * @param {string} packName - Starter squad name (e.g., 'etl')
//  * @returns {string} Workflow file content
//  */
// function generateExpansionPackWorkflow(agentName, packName) {
//   const displayName = agentName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
//
//   return `---
// description: Ativa o agente ${displayName} (${packName})
// ---
//
// # Ativação do Agente ${displayName}
//
// **Squad:** ${packName}
//
// **INSTRUÇÕES CRÍTICAS PARA O ANTIGRAVITY:**
//
// 1. Leia COMPLETAMENTE o arquivo \`.antigravity/agents/${packName}/${agentName}.md\`
// 2. Siga EXATAMENTE as \`activation-instructions\` definidas no bloco YAML do agente
// 3. Adote a persona conforme definido no agente
// 4. Execute a saudação conforme \`greeting_levels\` definido no agente
// 5. **MANTENHA esta persona até receber o comando \`*exit\`**
// 6. Responda aos comandos com prefixo \`*\` conforme definido no agente
// 7. Siga as regras globais do projeto em \`.antigravity/rules.md\`
//
// **Comandos disponíveis:** Use \`*help\` para ver todos os comandos do agente.
// `;
// }

/**
 * Check for existing user_profile in core-config.yaml (Story 10.2 - Idempotency)
 * Returns the existing profile if found, null otherwise
 *
 * @param {string} targetDir - Target directory to check
 * @returns {Promise<string|null>} Existing user profile or null
 */
async function getExistingUserProfile(targetDir = process.cwd()) {
  const coreConfigPath = path.join(targetDir, '.aexos-core', 'core-config.yaml');

  try {
    if (await fse.pathExists(coreConfigPath)) {
      const content = await fse.readFile(coreConfigPath, 'utf8');
      const config = yaml.load(content);

      if (config && config.user_profile) {
        // Validate the value
        const validProfiles = ['bob', 'advanced'];
        const normalizedProfile = String(config.user_profile).toLowerCase().trim();

        if (validProfiles.includes(normalizedProfile)) {
          return normalizedProfile;
        }
      }
    }
  } catch {
    // Config doesn't exist or is invalid - will ask for profile
  }

  return null;
}

/**
 * Map wizard language code to Claude Code settings.json language name (Story ACT-12)
 * Claude Code uses full language names, not ISO codes.
 */
const LANGUAGE_MAP = {
  en: 'english',
  pt: 'portuguese',
  es: 'spanish',
};

/**
 * Write language preference to Claude Code's native settings.json (Story ACT-12)
 * Replaces the old approach of storing language in core-config.yaml.
 * Claude Code v4.0.4+ natively supports a `language` field in settings.json
 * that is automatically injected into the system prompt.
 *
 * @param {string} language - Language code from wizard (en|pt|es)
 * @param {string} [projectDir] - Project directory (default: process.cwd())
 * @returns {Promise<boolean>} true if written successfully
 */
async function writeClaudeSettings(language, projectDir = process.cwd()) {
  const claudeDir = path.join(projectDir, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');

  try {
    await fse.ensureDir(claudeDir);

    let settings = {};
    if (await fse.pathExists(settingsPath)) {
      const content = await fse.readFile(settingsPath, 'utf8');
      settings = JSON.parse(content);
    }

    const claudeLanguage = LANGUAGE_MAP[language] || language;
    settings.language = claudeLanguage;

    await fse.writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
    return true;
  } catch {
    // Non-blocking: language is a preference, not critical
    return false;
  }
}

/**
 * Get existing language from Claude Code settings.json (Story ACT-12 - Idempotency)
 * Returns the existing language code if found, null otherwise.
 *
 * @param {string} [projectDir] - Project directory to check
 * @returns {Promise<string|null>} Existing language code or null
 */
async function getExistingLanguage(projectDir = process.cwd()) {
  const settingsPath = path.join(projectDir, '.claude', 'settings.json');

  try {
    if (await fse.pathExists(settingsPath)) {
      const content = await fse.readFile(settingsPath, 'utf8');
      const settings = JSON.parse(content);

      if (settings && settings.language) {
        // Reverse map: Claude Code language name → wizard code
        const reverseMap = Object.fromEntries(Object.entries(LANGUAGE_MAP).map(([k, v]) => [v, k]));
        const langValue = String(settings.language).toLowerCase().trim();
        return reverseMap[langValue] || null;
      }
    }
  } catch {
    // Settings don't exist or invalid JSON
  }

  return null;
}

/**
 * One cancellation path, with no second prompt on a closing input stream.
 */
function setupCancellationHandler(context) {
  const handleSigint = () => {
    showCancellation(context);
    process.exit(130);
  };
  process.on('SIGINT', handleSigint);
  return () => process.removeListener('SIGINT', handleSigint);
}

/**
 * Main wizard execution function
 *
 * @returns {Promise<Object>} Wizard answers object
 *
 * @example
 * const { runWizard } = require('./src/wizard');
 * const answers = await runWizard();
 * console.log(answers.projectType); // 'greenfield' or 'brownfield'
 */
async function runWizard(options = {}) {
  const cancellationContext = { createdDirectory: options.createdDirectory, installationStarted: false };
  const cleanupCancellation = setupCancellationHandler(cancellationContext);
  const canPrompt = options.interactive !== undefined ? Boolean(options.interactive) : Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const nonInteractive = Boolean(options.quiet || options.ci || options.yes || !canPrompt);
  const plain = getTerminalCapabilities().plain;
  const visualPrompt = !plain && !nonInteractive ? createVisualPrompt(inquirer) : inquirer.prompt;
  const prompt = (questions) => {
    if (plain && !nonInteractive) return promptPlainQuestions(questions);
    const pending = visualPrompt(questions);
    // Inquirer normally re-sends SIGINT via process.kill, which exits with 1
    // on Windows before our handler can report it. Close the UI and reject.
    const ui = pending.ui;
    if (!ui?.rl) return pending;
    ui.rl.removeListener('SIGINT', ui.onForceClose);
    return new Promise((resolve, reject) => {
      const cancel = () => { ui.close(); reject(createCancellationError()); };
      ui.rl.once('SIGINT', cancel);
      pending.then((value) => { ui.rl.removeListener('SIGINT', cancel); resolve(value); },
        (error) => { ui.rl.removeListener('SIGINT', cancel); reject(error); });
    });
  };
  try {
    // Show welcome message with AEXOS branding
    if (!options.quiet) {
      showWelcome();
    }

    // Start i18n with default or detected language
    setLanguage(options.language || 'en');

    // Paid-only candidates prove entitlement before the installer writes any
    // framework, squad, IDE or configuration files. Historical packages use
    // legacy mode and preserve the terms under which they were distributed.
    const commercialLicense = await enforceCommercialInstallGate({
      targetDir: process.cwd(),
      licenseKey: options.licenseKey,
      licenseEmail: options.licenseEmail,
      licensePassword: options.licensePassword,
      quiet: options.quiet || options.ci,
      force: options.force,
      config: options.commercialLicenseConfig,
      runLicenseWizard: options.runLicenseWizard,
      env: options.env,
    });

    let answers = {};
    if (!options.quiet) showInstallStep(0, plain ? ['Select how this workspace will run.'] : []);

    // A terminal that cannot be prompted is not a reason to crash. Without this
    // the wizard reached inquirer, the closed stdin tore the readline down
    // mid-question, and the install died on an ERR_USE_AFTER_CLOSE stack trace
    // — which is what anyone piping `npx @aexos/core install` into a
    // log or running it from a script saw first.
    // `options.interactive` lets a caller state the answer outright — an
    // embedder driving the wizard programmatically should not have to fake a
    // terminal. Absent that, detect one.
    if (nonInteractive && !options.quiet) {
      // Say so. Silent defaults are worse than no defaults: the user gets a
      // configured project and never learns which choices were made for them.
      console.log('\n  Using safe defaults and supplied options; no prompts.\n');
    }

    if (nonInteractive) {
      // Quiet mode: Skip all prompts, use defaults
      // Story 10.2: Check for existing user_profile (idempotency)
      // Story ACT-12: Language delegated to Claude Code settings.json
      const existingProfile = await getExistingUserProfile();
      const existingLang = await getExistingLanguage();
      answers = {
        language: options.language || existingLang || 'en',
        userProfile: options.userProfile || existingProfile || 'advanced', // Story 10.2
        projectType: options.projectType || 'brownfield', // Default to brownfield for safety
        selectedIDEs: options.ide ? [options.ide] : [], // Support single IDE flag if added later
        selectedTechPreset: 'none',
        ...options, // Merge any other options
      };
    } else {
      // Interactive mode
      //
      // The wizard used to open by asking for a language and carried Portuguese
      // and Spanish string tables. AEXOS is English-only, so there is nothing
      // to choose: asking would offer a setting that changes nothing.
      //
      // An existing preference in Claude Code's settings.json is still read and
      // left alone — that field is the editor's, not ours, and a user who set
      // their editor to Portuguese did not ask us to change it.
      const languageAnswer = { language: 'en' };
      setLanguage('en');

      // Phase 1.5: User Profile selection (Story 10.2 - Epic 10)
      // Check for idempotency - if user_profile already exists, skip question
      let userProfileAnswer = {};
      const existingProfile = await getExistingUserProfile();

      if (existingProfile) {
        // Idempotent: Use existing profile, don't re-ask
        console.log(`\nPASS ${t('userProfileSkipped')}: ${existingProfile}\n`);
        userProfileAnswer = { userProfile: existingProfile };
      } else {
        // New installation: Ask for user profile
        userProfileAnswer = await prompt(withQuestionDefaults([getUserProfileQuestion()], options));
      }

      // Phase 2: Build remaining questions with i18n applied
      if (plain) {
        console.log('  Hosts receive local files only. Leave all unchecked for CLI only.');
        console.log('  Enter host numbers, or 0 for none. Presets guide architecture.');
      }
      const remainingQuestions = withQuestionDefaults([
        getProjectTypeQuestion(),
        ...getIDEQuestions(),
        ...getTechPresetQuestion(),
      ], { ...options, ...(options.ide ? { selectedIDEs: [options.ide] } : {}) });

      // Run wizard with remaining questions
      const remainingAnswers = await prompt(remainingQuestions);

      // Merge all answers (including user profile from Story 10.2)
      answers = { ...options, ...languageAnswer, ...userProfileAnswer, ...remainingAnswers };

      // Human response time is not a rendering-performance measurement.
    }

    answers.commercialLicense = commercialLicense;
    answers.projectRoot = process.cwd();
    answers.nonInteractive = nonInteractive;

    if (!options.dryRun && !nonInteractive) {
      for (;;) {
        console.log(`\n${renderInstallPlan(answers)}\n`);
        const { reviewAction } = await prompt([getReviewQuestion()]);
        if (reviewAction === 'cancel') throw createCancellationError();
        if (reviewAction === 'install') break;
        if (reviewAction !== 'edit') throw new Error('Installation was not confirmed. Run the command again.');
        const edited = await prompt(withQuestionDefaults([
          getUserProfileQuestion(), getProjectTypeQuestion(), ...getIDEQuestions(), ...getTechPresetQuestion(),
        ], answers));
        if (edited.userProfile !== answers.userProfile) answers.userProfileChangedByReview = true;
        answers = { ...answers, ...edited };
      }
    }

    if (options.dryRun) {
      const preview = {
        dryRun: true,
        projectType: answers.projectType,
        selectedIDEs: answers.selectedIDEs || [],
        selectedTechPreset: answers.selectedTechPreset || 'none',
        steps: [
          'install-aexos-core',
          'generate-ide-configs',
          'generate-boundary-rules',
          'copy-skills-and-commands',
          'run-ide-sync',
          'bootstrap-entity-registry',
          'configure-environment',
          'install-dependencies',
          'validate-installation',
        ],
      };

      if (!options.quiet) {
        console.log(`\n${renderInstallPlan(answers, { dryRun: true })}`);
        console.log('\nDry run complete. No installation files were modified.');
      }

      return preview;
    }

    cancellationContext.installationStarted = true;
    const coreConfigExisted = await fse.pathExists(path.join(process.cwd(), '.aexos-core', 'core-config.yaml'));
    // Story 1.4: Install AEXOS core framework (agents, tasks, workflows, templates)
    // An install from an earlier generation of this framework stays exactly
    // where it is unless something removes it, and the editors keep reading it.
    // The symptom is that the old framework's slash commands are the ones that
    // show up, which reads as "the new install did not work".
    try {
      const legacy = findLegacyInstalls(process.cwd());
      if (legacy.items.length) {
        console.log(
          `\nWARN Found a previous ${legacy.brands.join(' and ')} installation ` +
            `(${legacy.items.length} item${legacy.items.length === 1 ? '' : 's'}).`,
        );
        console.log('   Your editor reads both, so its commands will appear alongside AEXOS.\n');
        for (const item of legacy.items.slice(0, 8)) {
          console.log(`     ${item.path}`);
        }
        if (legacy.items.length > 8) {
          console.log(`     … and ${legacy.items.length - 8} more`);
        }

        // Removing another framework's files is not a decision to make on
        // someone's behalf without asking — they may have edited them.
        let remove = false;
        if (nonInteractive) {
          console.log('\n   Left in place. Remove them with: aexos uninstall --legacy\n');
        } else {
          ({ remove } = await prompt([
            {
              type: 'confirm',
              name: 'remove',
              message: `Remove the previous ${legacy.brands.join('/')} installation?`,
              default: true,
            },
          ]));
        }

        if (remove) {
          const { removed, failed } = removeFootprint(process.cwd(), legacy.items);
          console.log(`   PASS Removed ${removed.length} item(s)`);
          for (const f of failed) console.warn(`   WARN ${f.path}: ${f.message}`);
        }
      }
    } catch (error) {

      if (error.code === 'AEXOS_INSTALL_CANCELLED') throw error;
      // Never block the install on this — it is housekeeping, not a step.
      console.warn(`\nWARN Could not check for a previous installation: ${error.message}`);
    }

    if (!options.quiet) showInstallStep(1, [
      `Target: ${process.cwd()}`,
      `Hosts: ${answers.selectedIDEs?.join(', ') || 'CLI only'}`,
    ]);
    console.log('\nInstalling AEXOS core framework...');
    let cyryxCoreResult = null;
    try {
      cyryxCoreResult = await installCyryxCore({
        targetDir: process.cwd(),
        projectType: answers.projectType || 'greenfield',
        onProgress: (_status) => {
          // Silent progress - spinner handles feedback
        },
      });

      if (cyryxCoreResult.success) {
        console.log(`PASS AEXOS core installed (${cyryxCoreResult.installedFolders.length} folders)`);
        answers.installedCounts = readInstalledCounts(process.cwd());
        for (const [name, count] of Object.entries(answers.installedCounts)) {
          console.log(`   ${name}: ${count === null ? 'missing' : count}`);
        }
      }
      answers.cyryxCoreInstalled = cyryxCoreResult.success === true;
      answers.cyryxCoreResult = cyryxCoreResult;
    } catch (error) {

      if (error.code === 'AEXOS_INSTALL_CANCELLED') throw error;
      console.error('\nWARN AEXOS core installation failed:', error.message);
      answers.cyryxCoreInstalled = false;
    }

    // Squads live at the package root, outside `.aexos-core`, so the core
    // installer above never reaches them. Without this step the squads AEXOS
    // ships exist only in the framework repository and no installed project
    // can see them.
    console.log('\nInstalling AEXOS squads...');
    try {
      const squadResult = await scaffoldCoreSquads(process.cwd());

      if (squadResult.copied.length) {
        console.log(`PASS ${squadResult.copied.length} squad(s) installed`);
      }
      if (squadResult.skipped.length) {
        // Existing squads are never overwritten: `squads/` also holds the
        // user's own, and a shipped one may have been edited on purpose.
        console.log(
          `   ${squadResult.skipped.length} already present, left untouched: ` +
            squadResult.skipped.join(', '),
        );
      }
      for (const err of squadResult.errors) {
        console.warn(`   WARN ${err.squad}: ${err.message}`);
      }

      // Copying is not enough — @aexos-master routes by reading the registry.
      const registry = await regenerateSquadRegistry(process.cwd());
      if (registry.success) {
        console.log(`   Registry: ${registry.count} squad(s) routable via @aexos-master`);
      } else {
        console.warn(`   WARN Squad registry not generated: ${registry.error}`);
        console.warn('      Squads are installed but the orchestrator cannot route to them.');
        console.warn('      Fix with: node scripts/generate-squad-registry.js');
      }

      answers.squadsInstalled = squadResult.copied.length;
    } catch (error) {

      if (error.code === 'AEXOS_INSTALL_CANCELLED') throw error;
      // Never fatal: a project without squads is still a working AEXOS install.
      console.warn('\nWARN Squad installation failed:', error.message);
      answers.squadsInstalled = 0;
    }

    // Install Tech Preset if selected
    if (answers.selectedTechPreset && answers.selectedTechPreset !== 'none') {
      console.log('\nConfiguring Tech Preset...');

      try {
        // Find tech-presets source directory
        const possiblePresetDirs = [
          path.join(__dirname, '..', '..', '.aexos-core', 'data', 'tech-presets'),
          path.join(process.cwd(), '.aexos-core', 'data', 'tech-presets'),
        ];

        let sourcePresetDir = null;
        for (const dir of possiblePresetDirs) {
          if (fse.existsSync(dir)) {
            sourcePresetDir = dir;
            break;
          }
        }

        if (sourcePresetDir) {
          const presetFile = path.join(sourcePresetDir, `${answers.selectedTechPreset}.md`);

          if (fse.existsSync(presetFile)) {
            // Copy preset to project's .aexos-core/data/tech-presets/
            const targetPresetDir = path.join(process.cwd(), '.aexos-core', 'data', 'tech-presets');
            await fse.ensureDir(targetPresetDir);

            // BUG-5 fix (INS-1): Guard against source === dest (e.g., running inside aexos-core repo)
            const targetPresetFile = path.join(targetPresetDir, `${answers.selectedTechPreset}.md`);
            const sourceResolved = path.resolve(presetFile);
            const targetResolved = path.resolve(targetPresetFile);

            if (sourceResolved === targetResolved) {
              console.log('   INFO Tech preset already in place (framework-dev mode)');
            } else {
              // Copy the selected preset
              await fse.copy(presetFile, targetPresetFile);

              // Copy the template too
              const templateFile = path.join(sourcePresetDir, '_template.md');
              if (fse.existsSync(templateFile)) {
                const targetTemplate = path.join(targetPresetDir, '_template.md');
                if (path.resolve(templateFile) !== path.resolve(targetTemplate)) {
                  await fse.copy(templateFile, targetTemplate);
                }
              }

              // Update technical-preferences.md to mark the selected preset
              const techPrefsFile = path.join(
                process.cwd(),
                '.aexos-core',
                'data',
                'technical-preferences.md',
              );
              const techPrefsSource = path.join(sourcePresetDir, '..', 'technical-preferences.md');

              if (fse.existsSync(techPrefsSource)) {
                const techPrefsSourceResolved = path.resolve(techPrefsSource);
                const techPrefsTargetResolved = path.resolve(techPrefsFile);

                if (techPrefsSourceResolved !== techPrefsTargetResolved) {
                  // Prefer existing target file to preserve user customizations
                  const baseFile = fse.existsSync(techPrefsFile) ? techPrefsFile : techPrefsSource;
                  let techPrefsContent = await fse.readFile(baseFile, 'utf8');

                  // Add active preset marker only if not already present
                  const activePresetSection = `\n## Active Preset\n\n**Selected:** \`${answers.selectedTechPreset}\`\n\nThis preset was selected during installation. The @architect and @dev agents will use these patterns by default.\n`;

                  if (!techPrefsContent.includes('## Active Preset')) {
                    // Insert after the first heading
                    techPrefsContent = techPrefsContent.replace(
                      '# User-Defined Preferred Patterns and Preferences',
                      '# User-Defined Preferred Patterns and Preferences' + activePresetSection,
                    );
                    await fse.writeFile(techPrefsFile, techPrefsContent, 'utf8');
                  }
                }
              }
            }

            console.log(`   PASS Tech Preset: ${answers.selectedTechPreset}`);
            console.log(
              `   📁 Location: .aexos-core/data/tech-presets/${answers.selectedTechPreset}.md`,
            );
            answers.techPresetInstalled = true;
            answers.techPresetResult = { preset: answers.selectedTechPreset, success: true };
          } else {
            console.log(`   WARN Preset file not found: ${answers.selectedTechPreset}`);
            answers.techPresetInstalled = false;
          }
        } else {
          console.log('   WARN Tech presets directory not found');
          answers.techPresetInstalled = false;
        }
      } catch (error) {

        if (error.code === 'AEXOS_INSTALL_CANCELLED') throw error;
        console.error(`   WARN Tech Preset error: ${error.message}`);
        answers.techPresetInstalled = false;
      }
    } else {
      answers.techPresetInstalled = false;
      answers.techPresetResult = { preset: 'none', success: true };
    }

    // Legacy squad installation path removed; unified squads flow is now the only supported path.

    // Story 1.4: Generate IDE configs if IDEs were selected
    let ideConfigResult = null;
    if (!options.quiet) showInstallStep(2, ['Configure selected hosts and project settings.']);
    if (answers.selectedIDEs && answers.selectedIDEs.length > 0) {
      // generateIDEConfigs signature: (selectedIDEs, wizardState, options)
      // - wizardState: answers from the wizard (templateVars source)
      // - options: CLI flags (forceMerge/noMerge from Story 9.4 + ci/yes/skipPrompts
      //   for #739 Bug 1 — so the merge prompt auto-accepts defaults instead of
      //   hanging on keyboard input in CI/CD pipelines)
      const ideOptions = {
        forceMerge: options.forceMerge,
        noMerge: options.noMerge,
        ci: options.ci,
        yes: options.yes,
        skipPrompts: nonInteractive || options.skipPrompts,
        prompt,
      };
      ideConfigResult = await generateIDEConfigs(answers.selectedIDEs, answers, ideOptions);

      if (ideConfigResult.success) {
        showSuccessSummary(ideConfigResult, { compact: true });
      } else {
        console.error('\nWARN Some IDE configurations could not be created:');
        if (ideConfigResult.errors) {
          ideConfigResult.errors.forEach((err) => {
            console.error(`  - ${err.ide || 'Unknown'}: ${err.error}`);
          });
        }
      }

      // Legacy per-squad IDE copy path removed; sync pipeline handles IDE propagation.
    }

    if ((answers.selectedIDEs || []).includes('claude-code')) {
      // Story INS-4.3: Copy skills (Gap #11)
      console.log('\nCopying skills...');
      try {
        const skillsResult = await copySkillFiles(process.cwd());
        if (skillsResult.skipped) {
          console.log('   INFO Skills: source not found (skipped)');
        } else {
          console.log(`PASS Skills: ${skillsResult.count} copied`);
        }
        answers.skillsCopied = skillsResult.count;
        answers.skillsSkipped = skillsResult.skipped;
      } catch (error) {

        if (error.code === 'AEXOS_INSTALL_CANCELLED') throw error;
        console.warn(`WARN Skills copy failed: ${error.message}`);
        answers.skillsCopied = 0;
        answers.settingsGenerated = false;
      }
    }

    // Local-first Codex flow: generate project-local /skills activators automatically
    if ((answers.selectedIDEs || []).includes('codex')) {
      console.log('\nGenerating Codex skills...');
      try {
        const codexSkillsResult = generateCodexSkills(process.cwd());
        if (codexSkillsResult.skipped) {
          console.log('   INFO Codex skills: canonical agent source not found (skipped)');
        } else {
          console.log(`PASS Codex skills: ${codexSkillsResult.count} generated`);
        }
        answers.codexSkillsGenerated = codexSkillsResult.count;
        answers.codexSkillsSkipped = codexSkillsResult.skipped;

      } catch (error) {

        if (error.code === 'AEXOS_INSTALL_CANCELLED') throw error;
        console.warn(`WARN Codex skills generation failed: ${error.message}`);
        answers.codexSkillsSkipped = true;
        answers.codexSkillsGenerated = 0;
      }
    }

    if ((answers.selectedIDEs || []).includes('claude-code')) {
      // Story INS-4.3: Copy extra commands (Gap #12)
      console.log('\nCopying extra commands...');
      try {
        const commandsResult = await copyExtraCommandFiles(process.cwd());
        if (commandsResult.skipped) {
          console.log('   INFO Extra commands: source not found (skipped)');
        } else {
          console.log(`PASS Commands: ${commandsResult.count} extras copied`);
        }
        answers.extraCommandsCopied = commandsResult.count;
        answers.extraCommandsSkipped = commandsResult.skipped;
      } catch (error) {

        if (error.code === 'AEXOS_INSTALL_CANCELLED') throw error;
        console.warn(`WARN Extra commands copy failed: ${error.message}`);
        answers.extraCommandsCopied = 0;
        answers.settingsGenerated = false;
      }
    }

    // Sync only explicitly selected hosts, never the source package defaults.
    const targetProjectRoot = process.cwd();
    answers.ideSyncStatus = 'not-applicable';
    answers.ideSyncValidation = 'not-applicable';
    if ((answers.selectedIDEs || []).length > 0) {
      console.log('\n🔄 Running selected IDE sync...');
      const savedCwd = process.cwd();
      try {
        const { commandSync, commandValidate } = loadIdeSync();
        process.chdir(targetProjectRoot);
        for (const ide of answers.selectedIDEs) {
          const syncResult = await commandSync({ quiet: true, ide });
          if (syncResult?.success !== true) throw new Error(`${ide} projection sync failed`);
          const validation = await commandValidate({ quiet: true, ide });
          if (validation?.summary?.pass !== true) {
            throw new Error(`${ide} projection validation failed`);
          }
        }
        answers.ideSyncStatus = 'synced';
        answers.ideSyncValidation = 'pass';
        console.log('PASS Selected IDE sync: verified');
      } catch (syncError) {
        console.warn(`WARN Selected IDE sync failed: ${syncError.message}`);
        answers.ideSyncStatus = 'failed';
        answers.ideSyncValidation = 'failed';
      } finally {
        process.chdir(savedCwd);
      }
    }
    if ((answers.selectedIDEs || []).includes('codex')) {
      // ACORE-SKILLS.7: Generate Codex local skills in installed projects.
      console.log('\n🧩 Running Codex skills sync...');
      try {
        const { syncSkills: syncCodexSkills } = loadCodexSkillsSync();
        const codexSkillsResult = syncCodexSkills({
          sourceDir: path.join(targetProjectRoot, '.aexos-core', 'development', 'agents'),
          localSkillsDir: path.join(targetProjectRoot, '.codex', 'skills'),
          dryRun: false,
        });
        answers.codexSkillsStatus = 'synced';
        answers.codexSkillsGenerated = codexSkillsResult.generated;
        console.log(`PASS Codex skills: ${codexSkillsResult.generated} generated`);

      } catch (codexSkillsError) {
        console.warn(
          `WARN Codex skills sync failed: ${codexSkillsError.message} — run 'npm run sync:skills:codex' post-install`,
        );
        answers.codexSkillsStatus = 'failed';
        answers.codexSkillsGenerated = 0;
        answers.codexSkillsSkipped = true;
      }
    }

    // Story INS-4.6: Entity Registry Bootstrap — populate entity-registry.yaml on install
    // Story INS-4.12: Fix module resolution + bootstrap timing
    // Bootstrap runs AFTER .aexos-core deps are installed (aexos-core-installer.js:324-345)
    // NODE_PATH ensures spawned scripts can resolve packages from .aexos-core/node_modules/
    console.log('\n📇 Bootstrapping entity registry...');
    try {
      const registryScript = path.join(
        process.cwd(),
        '.aexos-core',
        'development',
        'scripts',
        'populate-entity-registry.js',
      );
      if (fse.existsSync(registryScript)) {
        // INS-4.12 AC3: Guard — skip bootstrap if .aexos-core deps are not installed
        const cyryxCoreNodeModules = path.join(process.cwd(), '.aexos-core', 'node_modules');
        if (!fse.existsSync(cyryxCoreNodeModules)) {
          console.warn(
            'WARN .aexos-core/node_modules/ not found — skipping entity registry bootstrap',
          );
          console.warn('   Run: cd .aexos-core && npm install --production');
          answers.entityRegistryStatus = 'skipped-no-deps';
        } else {
          // INS-4.12 AC2: Set NODE_PATH so spawned scripts resolve deps from .aexos-core/node_modules/
          const parentNodeModules = path.join(process.cwd(), 'node_modules');
          const nodePath = [cyryxCoreNodeModules, parentNodeModules].join(path.delimiter);
          const startMs = Date.now();
          execSync(`node "${registryScript}"`, {
            cwd: process.cwd(),
            encoding: 'utf8',
            timeout: 30000,
            stdio: 'pipe',
            env: { ...process.env, NODE_PATH: nodePath },
          });
          const elapsedMs = Date.now() - startMs;

          // Read entity count from generated registry
          const registryPath = path.join(
            process.cwd(),
            '.aexos-core',
            'data',
            'entity-registry.yaml',
          );
          let entityCount = 0;
          if (fse.existsSync(registryPath)) {
            const registryContent = fse.readFileSync(registryPath, 'utf8');
            const countMatch = registryContent.match(/entityCount:\s*(\d+)/);
            entityCount = countMatch ? parseInt(countMatch[1], 10) : 0;
          }

          console.log(
            `PASS Entity registry: populated (${entityCount} entities, ${(elapsedMs / 1000).toFixed(1)}s)`,
          );
          answers.entityRegistryStatus = 'populated';
          answers.entityRegistryCount = entityCount;
          answers.entityRegistryMs = elapsedMs;
        } // end else (deps exist)
      } else {
        console.log('   INFO Entity registry script not found (skipped)');
        answers.entityRegistryStatus = 'skipped';
      }
    } catch (error) {

      if (error.code === 'AEXOS_INSTALL_CANCELLED') throw error;
      console.warn(
        `WARN Entity registry bootstrap failed: ${error.message} — run 'aexos doctor' post-install`,
      );
      answers.entityRegistryStatus = 'failed';
    }

    // Story 1.6: Environment Configuration
    console.log('\nConfiguring environment...');

    try {
      const envResult = await configureEnvironment({
        targetDir: process.cwd(),
        projectType: answers.projectType || 'greenfield',
        selectedIDEs: answers.selectedIDEs || [],
        mcpServers: answers.mcpServers || [],
        userProfile: answers.userProfile || 'advanced', // Story 10.2: User Profile
        skipPrompts: nonInteractive, // One prompt policy for every installation phase
        coreConfigCreatedByInstaller: !coreConfigExisted && answers.cyryxCoreInstalled === true,
        userProfileChangedByReview: answers.userProfileChangedByReview === true,
        forceMerge: options.forceMerge, // Story 9.4: Smart Merge support
        noMerge: options.noMerge, // Story 9.4: Smart Merge support
      });

      // Story ACT-12: Write language to Claude Code settings.json
      if (answers.language && answers.selectedIDEs?.includes('claude-code')) {
        const langWritten = await writeClaudeSettings(answers.language);
        if (langWritten) {
          console.log('  - Language written to .claude/settings.json');
        } else {
          console.warn('  - Failed to write language to .claude/settings.json');
        }
      }

      if (envResult.envCreated && envResult.coreConfigCreated) {
        console.log('\nPASS Environment configuration complete!');
        console.log('  - .env file created');
        console.log('  - .env.example file created');
        console.log('  - .aexos-core/core-config.yaml created');
        if (envResult.gitignoreUpdated) {
          console.log('  - .gitignore updated');
        }
      }

      // Store env config result for downstream stories
      answers.envConfigured = true;
      answers.envResult = envResult;
    } catch (error) {

      if (error.code === 'AEXOS_INSTALL_CANCELLED') throw error;
      console.error('\nWARN Environment configuration failed:');
      console.error(`  ${error.message}`);
      if (nonInteractive) throw new Error(`Environment configuration failed: ${error.message}`);

      // Ask user if they want to continue without env config
      const { continueWithoutEnv } = await prompt([
        {
          type: 'confirm',
          name: 'continueWithoutEnv',
          message: 'Continue installation without environment configuration?',
          default: false,
        },
      ]);

      if (!continueWithoutEnv) {
        throw new Error('Installation cancelled - environment configuration required');
      }

      answers.envConfigured = false;
      console.log('\nWARN Continuing without environment configuration...');
    }

    // Generate rules from the final target configuration, after review/merge.
    if ((answers.selectedIDEs || []).includes('claude-code')) {
      // Story INS-4.3: Wire settings.json boundary generator after .aexos-core/ copy
      console.log('\nGenerating boundary rules...');
      try {
        const settingsGenerator = requireCyryxCoreModule(
          '.aexos-core',
          'infrastructure',
          'scripts',
          'generate-settings-json',
        );
        settingsGenerator.generate(process.cwd());
        const settingsContent = await fse
          .readFile(path.join(process.cwd(), '.claude', 'settings.json'), 'utf8')
          .catch(() => '{}');
        const settingsParsed = JSON.parse(settingsContent);
        const denyCount =
          settingsParsed.permissions && settingsParsed.permissions.deny
            ? settingsParsed.permissions.deny.length
            : 0;
        console.log(`PASS settings.json: generated (${denyCount} deny rules)`);
        answers.settingsGenerated = true;
        answers.settingsDenyCount = denyCount;
      } catch (error) {

        if (error.code === 'AEXOS_INSTALL_CANCELLED') throw error;
        console.warn(
          `WARN settings.json generation failed: ${error.message} — run 'aexos doctor --fix' post-install`,
        );
        answers.settingsGenerated = false;
      }

    }

    // Story 1.7: Dependency Installation
    // Check if package.json exists first (greenfield projects won't have one)
    const { detectPackageManager } = require('../installer/dependency-installer');
    const projectPath = process.cwd();
    const packageJsonExists = await hasPackageJson(projectPath);

    if (options.skipInstall) {
      console.log('\n  INFO Project dependency installation skipped (--skip-install).');
      answers.depsInstalled = true;
      answers.depsResult = { success: true, skipped: true, reason: 'skip-install' };
      answers.packageManager = detectPackageManager();
    } else if (!packageJsonExists) {
      // Greenfield project - no package.json, skip dependency installation
      console.log('\nDependency installation...');
      console.log('   INFO No package.json found (greenfield project)');
      console.log('   Dependencies will be installed when you add a package.json');
      answers.depsInstalled = true; // Mark as success since there's nothing to install
      answers.depsResult = { success: true, skipped: true, reason: 'no-package-json' };
      answers.packageManager = detectPackageManager();
    } else {
      // Brownfield project or existing project - has package.json
      console.log('\nInstalling dependencies...');

      // Auto-detect package manager (no longer asked as question)
      const detectedPM = detectPackageManager();
      answers.packageManager = detectedPM;

      try {
        const depsResult = await installDependencies({
          packageManager: detectedPM,
          projectPath: projectPath,
        });

        if (depsResult.success) {
          if (depsResult.offlineMode) {
            console.log('PASS Using existing dependencies (offline mode)');
          } else {
            console.log(`PASS Dependencies installed with ${depsResult.packageManager}!`);
          }
          answers.depsInstalled = true;
          answers.depsResult = depsResult;
        } else {
          console.error('\nWARN Dependency installation failed:');
          console.error(`  ${depsResult.errorMessage}`);
          console.error(`  Solution: ${depsResult.solution}`);

          if (nonInteractive || process.env.CI === '1') {
            answers.depsInstalled = false;
            answers.depsResult = depsResult;
            console.log('\nWARN Skipping dependency retry in non-interactive mode.');
          } else {
            // Ask user if they want to retry
            const { retryDeps } = await prompt([
              {
                type: 'confirm',
                name: 'retryDeps',
                message: 'Retry dependency installation?',
                default: true,
              },
            ]);

            if (retryDeps) {
              // Recursive retry with exponential backoff (built into installDependencies)
              const retryResult = await installDependencies({
                packageManager: answers.packageManager,
                projectPath: projectPath,
              });

              if (retryResult.success) {
                console.log(`\nPASS Dependencies installed with ${retryResult.packageManager}!`);
                answers.depsInstalled = true;
                answers.depsResult = retryResult;
              } else {
                console.log(
                  '\nWARN Installation still failed. You can run `npm install` manually later.',
                );
                answers.depsInstalled = false;
                answers.depsResult = retryResult;
              }
            } else {
              console.log(
                '\nWARN Skipping dependency installation. Run manually with `npm install`.',
              );
              answers.depsInstalled = false;
              answers.depsResult = depsResult;
            }
          }
        }
      } catch (error) {

        if (error.code === 'AEXOS_INSTALL_CANCELLED') throw error;
        console.error('\nWARN Dependency installation error:', error.message);
        answers.depsInstalled = false;
      }
    }

    // DISABLED: MCPs are advanced config that can confuse beginners
    // TODO: Remove entirely in future version - each project has unique MCP needs
    // Story 1.5/1.8: MCP Installation
    // if (answers.selectedMCPs && answers.selectedMCPs.length > 0) {
    //   console.log('\n🔌 Installing MCPs...');
    //
    //   try {
    //     const mcpResult = await installProjectMCPs({
    //       selectedMCPs: answers.selectedMCPs,
    //       projectPath: process.cwd(),
    //       apiKeys: answers.exaApiKey ? { EXA_API_KEY: answers.exaApiKey } : {},
    //       onProgress: (status) => {
    //         if (status.mcp) {
    //           console.log(`  [${status.mcp}] ${status.message}`);
    //         } else {
    //           console.log(`  ${status.message}`);
    //         }
    //       },
    //     });
    //
    //     if (mcpResult.success) {
    //       const successCount = Object.values(mcpResult.installedMCPs).filter(r => r.status === 'success').length;
    //       console.log(`\nPASS MCPs installed successfully! (${successCount}/${answers.selectedMCPs.length})`);
    //       console.log(`   Configuration: ${mcpResult.configPath}`);
    //     } else {
    //       console.error('\nWARN Some MCPs failed to install:');
    //       mcpResult.errors.forEach(err => console.error(`  - ${err}`));
    //       console.log('\nCheck .aexos/install-errors.log for details');
    //     }
    //
    //     // Store MCP result for validation
    //     answers.mcpsInstalled = mcpResult.success;
    //     answers.mcpResult = mcpResult;
    //
    //   } catch (error) {

    //     console.error('\nWARN MCP installation error:', error.message);
    //     answers.mcpsInstalled = false;
    //   }
    // }

    // Story 6.7: LLM Routing Installation
    console.log('\nInstalling LLM Routing commands...');
    try {
      const { installLLMRouting, isLLMRoutingInstalled } = loadLLMRoutingInstaller();

      // Check if already installed
      if (isLLMRoutingInstalled()) {
        console.log('   INFO LLM Routing already installed');
        answers.llmRoutingInstalled = true;
        answers.llmRoutingResult = { success: true, alreadyInstalled: true };
      } else {
        const llmResult = installLLMRouting({
          projectRoot: process.cwd(),
          onProgress: (msg) => console.log(`   ${msg}`),
          onError: (msg) => console.error(`   ${msg}`),
        });

        if (llmResult.success) {
          console.log('\nPASS LLM Routing installed!');
          console.log('   • claude-max  → Uses Claude Max subscription');
          console.log('   • claude-free → Uses a configured DeepSeek API key');
          console.log('\n   For claude-free, add DEEPSEEK_API_KEY to your .env');
          answers.llmRoutingInstalled = true;
          answers.llmRoutingResult = llmResult;
        } else {
          console.error('\nWARN LLM Routing installation had errors:');
          llmResult.errors.forEach((err) => console.error(`   - ${err}`));
          answers.llmRoutingInstalled = false;
          answers.llmRoutingResult = llmResult;
        }
      }
    } catch (error) {

      if (error.code === 'AEXOS_INSTALL_CANCELLED') throw error;
      console.error('\nWARN LLM Routing error:', error.message);
      answers.llmRoutingInstalled = false;
    }

    // A paid-only candidate already acquired and verified its private artifact
    // at the pre-install boundary. Historical packages retain the optional Pro
    // flow associated with their original release terms.
    if (commercialLicense.required) {
      answers.proInstalled = true;
      answers.proResult = commercialLicense.result;
    } else if (!options.skipPro) {
      try {
        const { runProWizard } = require('./pro-setup');
        const isCI = nonInteractive || process.env.CI === 'true';
        const hasProKey = !!process.env.AEXOS_PRO_KEY;

        const proOptions = { targetDir: process.cwd() };

        if (isCI && hasProKey) {
          // CI mode: auto-run if AEXOS_PRO_KEY is set
          console.log('\nPro license key detected, running Pro setup...');
          const proResult = await runProWizard({ ...proOptions, quiet: true });
          answers.proInstalled = proResult.success;
          answers.proResult = proResult;
        } else if (!isCI && !options.quiet) {
          // Interactive mode: ask which edition to install
          const { edition } = await prompt([
            {
              type: 'list',
              name: 'edition',
              message: colors.primary('Which edition do you want to install?'),
              choices: [
                {
                  name: 'Community (free) — agents, workflows, squads, full CLI',
                  short: 'Community · free',
                  description: 'Use the free agents, workflows and CLI included in this package.',
                  value: 'community',
                },
                {
                  name: 'Pro (requires account) — premium squads, minds, priority support',
                  short: 'Pro · account required',
                  description: 'Continue to the existing Pro account setup.',
                  value: 'pro',
                },
              ],
              default: 'community',
            },
          ]);

          if (edition === 'pro') {
            const proResult = await runProWizard(proOptions);
            answers.proInstalled = proResult.success;
            answers.proResult = proResult;

            if (!proResult.success && proResult.error) {
              console.error(`\nWARN Pro activation failed: ${proResult.error}`);

              const { fallback } = await prompt([
                {
                  type: 'confirm',
                  name: 'fallback',
                  message: colors.primary('Continue with Community (free) edition instead?'),
                  default: true,
                },
              ]);

              if (!fallback) {
                throw createCancellationError();
              }

              console.log('\nContinuing with Community edition...\n');
            }
          } else {
            answers.proInstalled = false;
          }
        }
      } catch (error) {

        if (error.code === 'AEXOS_INSTALL_CANCELLED') throw error;
        console.error(`\nWARN Pro setup error: ${error.message}`);
        answers.proInstalled = false;
      }
    }

    // Story 1.8: Installation Validation
    if (!options.quiet) showInstallStep(3, ['Check installed files, configuration and dependencies.']);
    console.log('\nValidating installation...\n');

    try {
      const expectedSkillDirs = [];
      if ((answers.selectedIDEs || []).includes('claude-code')) {
        expectedSkillDirs.push('.claude/skills');
      }
      if ((answers.selectedIDEs || []).includes('codex')) {
        expectedSkillDirs.push(path.join('.codex', 'skills'));
      }

      const validation = await validateInstallation(
        {
          files: {
            ideConfigs: ideConfigResult?.files || [],
            env: '.env',
            coreConfig: '.aexos-core/core-config.yaml',
            mcpConfig: '.mcp.json',
            skillDirs: expectedSkillDirs,
          },
          configs: {
            env: answers.envResult,
            mcps: answers.mcpResult,
            coreConfig: '.aexos-core/core-config.yaml',
          },
          mcps: answers.mcpResult,
          dependencies: answers.depsResult,
        },
        (status) => {
          console.log(`  [${status.step}] ${status.message}`);
        },
      );

      // A single outcome follows the phase; preserve errors without competing banners.
      for (const error of validation.errors || []) {
        console.error(`  FAIL ${error.component || 'Verification'}: ${error.message}`);
        if (error.solution) console.error(`  Recovery: ${error.solution}`);
      }

      // Offer troubleshooting if there are errors
      if (!nonInteractive && !plain && validation.errors && validation.errors.length > 0) {
        await provideTroubleshooting(validation.errors);
      }

      // Store validation result
      answers.validationResult = validation;
    } catch (error) {

      if (error.code === 'AEXOS_INSTALL_CANCELLED') throw error;
      console.error('\nWARN Validation failed:', error.message);
      console.log('Installation may be incomplete. Check logs in .aexos/ directory.');
    }

    // Show completion
    answers.ideConfigResult = ideConfigResult;
    answers.installOutcome = getInstallOutcome(answers);
    showCompletion(answers);
    if (!answers.installOutcome.success) {
      throw new Error(`Installation incomplete: ${answers.installOutcome.failures.join(', ')}. Run npx @aexos/core doctor for repair guidance.`);
    }

    return answers;
  } catch (error) {
    if (error.code === 'AEXOS_INSTALL_CANCELLED') {
      showCancellation(cancellationContext);
      throw error;
    }
    if (error.isTtyError) {
      console.error("Error: Prompt couldn't be rendered in the current environment");
    } else {
      console.error('Wizard error:', error.message);
    }
    throw error;
  } finally {
    cleanupCancellation();
    stopTerminalActivity?.();
  }
}

/**
 * Answer object schema (for integration documentation)
 *
 * @typedef {Object} WizardAnswers
 * @property {string} projectType - 'greenfield' or 'brownfield' (Story 1.3)
 * @property {string[]} [selectedIDEs] - Selected IDEs array (Story 1.4)
 * @property {string[]} [mcpServers] - Selected MCP servers (Story 1.5)
 * @property {boolean} [envConfigured] - Whether env config succeeded (Story 1.6)
 * @property {Object} [envResult] - Environment configuration result (Story 1.6)
 * @property {boolean} envResult.envCreated - .env file created
 * @property {boolean} envResult.envExampleCreated - .env.example file created
 * @property {boolean} envResult.coreConfigCreated - core-config.yaml created
 * @property {boolean} envResult.gitignoreUpdated - .gitignore updated
 * @property {Array<string>} envResult.errors - Any errors encountered
 * @property {string} packageManager - Selected package manager (Story 1.7)
 * @property {boolean} [depsInstalled] - Whether dependencies installed successfully (Story 1.7)
 * @property {Object} [depsResult] - Dependency installation result (Story 1.7)
 * @property {boolean} depsResult.success - Installation succeeded
 * @property {boolean} [depsResult.offlineMode] - Used existing node_modules
 * @property {string} depsResult.packageManager - Package manager used
 * @property {string} [depsResult.error] - Error message if failed
 */

module.exports = {
  runWizard,
  // ACT-12: Exported for testing
  _testing: {
    writeClaudeSettings,
    getExistingLanguage,
    LANGUAGE_MAP,
  },
};
