/**
 * Wizard Questions Definitions
 *
 * Modular question system for AEXOS installation wizard
 * Questions from Stories 1.3-1.6 will be added here
 *
 * @module wizard/questions
 */

const { colors } = require('../utils/aexos-colors');
const { createInquirerValidator, validateProjectType } = require('./validators');

/**
 * Get user profile question (Story 10.2 - Epic 10: User Profile System)
 * Asks user about their ability to detect AI-generated code errors
 * PRD: CYRYX v2.0 "Projeto Bob" - Seção 2.4
 *
 * @returns {Object} Inquirer question object
 */
function getUserProfileQuestion() {
  return {
    type: 'list',
    name: 'userProfile',
    message: 'How do you want to work?',
    choices: [
      {
        name: 'Assisted - Bob guides the workflow',
        short: 'Assisted',
        description: 'Bob guides planning and execution step by step.',
        value: 'bob',
      },
      {
        name: 'Advanced - control agents directly',
        short: 'Advanced',
        description: 'Choose agents and control the workflow directly.',
        value: 'advanced',
      },
    ],
    default: 1, // Default to 'advanced' for backward compatibility
  };
}

/**
 * Get project type question (Story 1.3)
 * Uses i18n for translation
 *
 * @returns {Object} Inquirer question object
 */
function getProjectTypeQuestion() {
  return {
    type: 'list',
    name: 'projectType',
    message: 'What are you setting up?',
    choices: [
      {
        name: 'New project - start from scratch',
        short: 'New project',
        description: 'Set up AEXOS for a project you are starting.',
        value: 'greenfield',
      },
      {
        name: 'Existing project - preserve context',
        short: 'Existing project',
        description: 'Add AEXOS to an existing codebase and review configuration changes.',
        value: 'brownfield',
      },
    ],
    default: 0,
    validate: createInquirerValidator(validateProjectType),
  };
}

/**
 * Get IDE selection questions (Story 1.4)
 *
 * @returns {Object[]} Array of inquirer question objects
 */
function getIDEQuestions() {
  const { getIDESelectionQuestion } = require('./ide-selector');
  return [getIDESelectionQuestion()];
}

/**
 * Get package manager selection question (Story 1.7)
 *
 * @param {string} detectedPM - Auto-detected package manager
 * @returns {Object} Inquirer question object
 */
function getPackageManagerQuestion(detectedPM = 'npm') {
  return {
    type: 'list',
    name: 'packageManager',
    message: colors.primary('Which package manager should be used?'),
    choices: [
      {
        name: detectedPM === 'npm' ? colors.highlight('npm') + colors.dim(' (detected)') : 'npm',
        value: 'npm',
      },
      {
        name: detectedPM === 'yarn' ? colors.highlight('yarn') + colors.dim(' (detected)') : 'yarn',
        value: 'yarn',
      },
      {
        name: detectedPM === 'pnpm' ? colors.highlight('pnpm') + colors.dim(' (detected)') : 'pnpm',
        value: 'pnpm',
      },
      {
        name: detectedPM === 'bun' ? colors.highlight('bun') + colors.dim(' (detected)') : 'bun',
        value: 'bun',
      },
    ],
    default: ['npm', 'yarn', 'pnpm', 'bun'].indexOf(detectedPM) || 0,
  };
}

/**
 * Get MCP selection questions (Story 1.5 / 1.8 Integration)
 *
 * @returns {Object[]} Array of inquirer question objects
 */
function getMCPQuestions() {
  return [
    {
      type: 'checkbox',
      name: 'selectedMCPs',
      message: colors.primary('Select MCPs to install (project-level):'),
      choices: [
        {
          name:
            colors.highlight('Browser (Puppeteer)') + colors.dim(' - Web automation and testing'),
          value: 'browser',
          checked: true,
        },
        {
          name: colors.highlight('Context7') + colors.dim(' - Library documentation search'),
          value: 'context7',
          checked: true,
        },
        {
          name: colors.highlight('Exa') + colors.dim(' - Advanced web search'),
          value: 'exa',
          checked: true,
        },
        {
          name: colors.highlight('Desktop Commander') + colors.dim(' - File system access'),
          value: 'desktop-commander',
          checked: true,
        },
      ],
      validate: () => {
        // Allow empty selection (user can skip MCP installation)
        return true;
      },
    },
    // Note: API keys are configured later via aexos-master or directly in .env
  ];
}

/**
 * Get environment configuration questions (Story 1.6)
 *
 * DESIGN NOTE: Environment configuration uses its own prompt system
 * via @clack/prompts in packages/installer/src/config/configure-environment.js
 *
 * API key prompts are NOT part of wizard questions to keep the
 * environment module self-contained and testable independently.
 *
 * The wizard calls configureEnvironment() directly after IDE selection
 * in src/wizard/index.js (Task 1.6.7)
 *
 * @returns {Object[]} Empty array - prompts handled in environment module
 */
function getEnvironmentQuestions() {
  // Environment config prompts handled in configure-environment.js
  // No wizard questions needed for this story
  return [];
}

/**
 * Get Squad selection questions
 *
 * Available squads for v4.0:
 * - squad-creator: Tools to create custom squads
 * - etl: ETL pipeline for knowledge base creation
 *
 * Note: This function is currently DISABLED. Squad selection is handled
 * directly in aexos-init.js using the squads/ directory.
 *
 * @returns {Object[]} Array of inquirer question objects
 * @deprecated Use squads/ directory directly in aexos-init.js
 */
function getSquadQuestions() {
  return [
    {
      type: 'checkbox',
      name: 'selectedSquads',
      message: colors.primary('Select Squads to install (optional):'),
      choices: [
        {
          name:
            colors.highlight('squad-creator') +
            colors.dim(' - Tools to create custom squads'),
          value: 'squad-creator',
          checked: false,
        },
        {
          name: colors.highlight('etl') + colors.dim(' - ETL pipeline for knowledge base creation'),
          value: 'etl',
          checked: false,
        },
      ],
      validate: () => {
        // Allow empty selection (user can skip squad installation)
        return true;
      },
    },
  ];
}

/**
 * Get Tech Preset selection question
 *
 * Tech presets provide pre-configured architecture patterns and standards
 * for different technology stacks.
 *
 * @returns {Object[]} Array of inquirer question objects
 */
function getTechPresetQuestion() {
  return [
    {
      type: 'list',
      name: 'selectedTechPreset',
      message: 'Which architecture preset?',
      choices: [
        {
          name: 'Next.js / React / TypeScript',
          description: 'Architecture guidance for a Next.js and React project.',
          value: 'nextjs-react',
        },
        {
          name: 'Angular / NestJS / TypeScript',
          description: 'Architecture guidance for Angular and NestJS.',
          value: 'angular-nestjs',
        },
        {
          name: 'Go services',
          description: 'Architecture guidance for services written in Go.',
          value: 'go',
        },
        {
          name: 'Java / Spring Boot',
          description: 'Architecture guidance for Java and Spring Boot.',
          value: 'java',
        },
        {
          name: 'Rust services',
          description: 'Architecture guidance for services written in Rust.',
          value: 'rust',
        },
        {
          name: 'C# / ASP.NET Core',
          description: 'Architecture guidance for C# and ASP.NET Core.',
          value: 'csharp',
        },
        {
          name: 'PHP / Laravel',
          description: 'Architecture guidance for PHP and Laravel.',
          value: 'php',
        },
        {
          name: 'None - keep project defaults',
          short: 'None · keep project defaults',
          description: 'Keep your current architecture without adding a preset.',
          value: 'none',
        },
      ],
      default: 0,
    },
  ];
}

function getReviewQuestion() {
  return {
    type: 'list', name: 'reviewAction', message: 'Ready to install?',
    choices: [
      { name: 'Install with these choices', value: 'install', description: 'Apply the configuration shown in the review above.' },
      { name: 'Edit choices', value: 'edit', description: 'Return to the choices; your current selections are retained.' },
      { name: 'Cancel', value: 'cancel', description: 'Exit before writing framework or host configuration files.' },
    ], default: 'install',
  };
}

/** Preserve explicit empty checkboxes as well as ordinary list defaults. */
function withQuestionDefaults(questions, previous = {}) {
  return questions.map((question) => {
    if (!Object.prototype.hasOwnProperty.call(previous, question.name)) return question;
    const value = previous[question.name];
    return {
      ...question,
      default: value,
      ...(question.type === 'checkbox' ? { choices: question.choices.map((choice) => ({ ...choice, checked: value.includes(choice.value) })) } : {}),
    };
  });
}

/**
 * Build complete question sequence
 * Allows conditional questions based on previous answers
 *
 * @param {Object} context - Context with previous answers
 * @returns {Object[]} Array of questions
 */
function buildQuestionSequence(_context = {}) {
  const questions = [];
  // Story 1.2: Foundation (project type only)
  questions.push(getProjectTypeQuestion());

  // Story 1.4: IDE Selection
  questions.push(...getIDEQuestions());

  // Story 1.5/1.8: MCP Selection
  // DISABLED: MCPs are advanced config that can confuse beginners
  // TODO: Remove entirely in future version - each project has unique MCP needs
  // questions.push(...getMCPQuestions());

  // Squad Selection - DISABLED: Handled directly in aexos-init.js
  // TODO: Consider removing getSquadQuestions() entirely in future version
  // questions.push(...getSquadQuestions());

  // Tech Preset Selection
  questions.push(...getTechPresetQuestion());

  // Story 1.7: Package Manager - Auto-detected (no question needed)
  // The wizard will auto-detect and use the appropriate package manager
  // See detectPackageManager() in dependency-installer.js

  // Story 1.6: Environment Configuration
  // Note: Env config prompts handled directly in configureEnvironment()
  // See src/wizard/index.js integration (after IDE config step)

  // Future: Conditional questions based on projectType
  // if (context.projectType === 'greenfield') { ... }

  return questions;
}

/**
 * Get question by ID
 * Useful for testing individual questions
 *
 * @param {string} questionId - Question identifier
 * @returns {Object|null} Question object or null if not found
 */
function getQuestionById(questionId) {
  const questionMap = {
    projectType: getProjectTypeQuestion(),
    // Future questions will be added here
  };

  return questionMap[questionId] || null;
}

module.exports = {
  getUserProfileQuestion,
  getProjectTypeQuestion,
  getIDEQuestions,
  getMCPQuestions,
  getSquadQuestions,
  // Backward compat alias (deprecated)
  getExpansionPackQuestions: getSquadQuestions,
  getTechPresetQuestion,
  getEnvironmentQuestions,
  getPackageManagerQuestion,
  buildQuestionSequence,
  getQuestionById,
  getReviewQuestion,
  withQuestionDefaults,
};
