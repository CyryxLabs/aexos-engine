/**
 * AEXOS-FullStack Validation System
 *
 * Provides multi-layer validation:
 * - ESLint code quality
 * - TypeScript type checking
 * - Story file structure validation
 *
 * Refactored to use execa for cross-platform compatibility
 */

const { sync: execaSync } = require('execa');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Terminal colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function printHeader(message) {
  console.log(`\n${colors.cyan}${colors.bold}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}${message}${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}${'='.repeat(60)}${colors.reset}\n`);
}

function printSuccess(message) {
  console.log(`${colors.green}✓ ${message}${colors.reset}`);
}

function printError(message) {
  console.log(`${colors.red}✗ ${message}${colors.reset}`);
}

function _printWarning(message) {
  console.log(`${colors.yellow}⚠ ${message}${colors.reset}`);
}

function printInfo(message) {
  console.log(`${colors.blue}ℹ ${message}${colors.reset}`);
}

/**
 * Validate story file structure
 */
async function validateStoryFile(storyPath) {
  printHeader('Story File Validation');

  const errors = [];

  try {
    if (!fs.existsSync(storyPath)) {
      printError(`Story file not found: ${storyPath}`);
      return { success: false, errors: [`File not found: ${storyPath}`] };
    }

    const content = fs.readFileSync(storyPath, 'utf-8');

    // Check for required sections
    const requiredSections = [
      '# Story',
      '## Problem Statement',
      '## Proposed Solution',
      '## Acceptance Criteria',
    ];

    for (const section of requiredSections) {
      if (!content.includes(section)) {
        errors.push(`Missing required section: ${section}`);
      }
    }

    if (errors.length > 0) {
      printError('Story file validation failed:');
      errors.forEach(err => console.log(`  - ${err}`));
      return { success: false, errors };
    }

    printSuccess('Story file structure is valid');
    return { success: true, errors: [] };

  } catch (error) {
    printError(`Story file validation error: ${error.message}`);
    return { success: false, errors: [`Validation error: ${error.message}`] };
  }
}

function validateStoryCheckboxes(inputs = []) {
  const roots = inputs.length ? inputs : ['docs/stories', 'docs/framework/epics'].filter(file => fs.existsSync(file));
  const files = [];
  const errors = [];
  function visit(file) {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw new Error(`Story path must not be a link: ${file}`);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(file).sort()) visit(path.join(file, name));
    } else if (stat.isFile() && /\.md$/i.test(file)) files.push(file);
  }
  try {
    roots.forEach(visit);
    if (!files.length) errors.push('No story Markdown files found');
    let checkboxes = 0;
    for (const file of files) {
      let fence = null;
      for (const [index, line] of fs.readFileSync(file, 'utf8').split(/\r?\n/).entries()) {
        const delimiter = /^\s*(`{3,}|~{3,})/.exec(line);
        if (delimiter) {
          if (!fence) fence = delimiter[1][0];
          else if (delimiter[1][0] === fence) fence = null;
          continue;
        }
        if (fence) continue;
        const checkbox = /^\s*[-*+]\s+\[([^\]]*)\](?!\s*\()/.exec(line);
        if (!checkbox) continue;
        checkboxes += 1;
        if (!/^[ xX]$/.test(checkbox[1])) {
          errors.push(`${file}:${index + 1}: Invalid checkbox state [${checkbox[1]}]`);
        }
      }
    }
    return { success: errors.length === 0, errors, filesChecked: files.length, checkboxes };
  } catch (error) {
    return { success: false, errors: [error.message], filesChecked: files.length };
  }
}

/**
 * Run ESLint validation
 */
async function runESLint(files = []) {
  printHeader('ESLint Validation');

  const errors = [];

  try {
    // ESLint 9.x: removed compact formatter from core, using default (stylish)

    execaSync('npx', ['eslint', ...(files.length > 0 ? files : ['.']), '--cache', '--cache-location', '.eslintcache'], {
      stdio: 'pipe',
      encoding: 'utf8',
    });

    printSuccess('ESLint validation passed');
    return { success: true, errors: [] };

  } catch (error) {
    const output = error.stdout || error.stderr || '';

    if (output) {
      printError('ESLint found issues:');
      console.log('\n' + output);
      errors.push('ESLint validation failed');
    } else {
      printError(`ESLint execution error: ${error.message}`);
      errors.push(`ESLint error: ${error.message}`);
    }

    return { success: false, errors };
  }
}

/**
 * Run TypeScript type checking
 */
async function runTypeScript() {
  printHeader('TypeScript Type Checking');

  const errors = [];

  try {
    execaSync('npx', ['tsc', '--noEmit'], {
      stdio: 'pipe',
      encoding: 'utf8',
    });

    printSuccess('TypeScript validation passed');
    return { success: true, errors: [] };

  } catch (error) {
    const output = error.stdout || error.stderr || '';

    if (output) {
      printError('TypeScript found type errors:');
      console.log('\n' + output);
      errors.push('TypeScript validation failed');
    } else {
      printError(`TypeScript execution error: ${error.message}`);
      errors.push(`TypeScript error: ${error.message}`);
    }

    return { success: false, errors };
  }
}

/**
 * Validate YAML files
 */
async function validateYAML(files = []) {
  printHeader('YAML Validation');

  const errors = [];
  const yamlFiles = files.length > 0
    ? files.filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
    : [];

  if (yamlFiles.length === 0) {
    printInfo('No YAML files to validate');
    return { success: true, errors: [] };
  }

  for (const file of yamlFiles) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      yaml.load(content);
      printSuccess(`Valid YAML: ${file}`);
    } catch (error) {
      printError(`Invalid YAML in ${file}: ${error.message}`);
      errors.push(`YAML error in ${file}: ${error.message}`);
    }
  }

  return { success: errors.length === 0, errors };
}

/**
 * Main validation orchestrator
 */
async function validate(options = {}) {
  const {
    type = 'all',
    files = [],
    storyPath = null,
  } = options;

  printHeader(`AEXOS-FullStack Validation: ${type}`);

  const results = {
    success: true,
    errors: [],
  };

  try {
    const supported = ['story', 'stories', 'eslint', 'typescript', 'typecheck', 'yaml', 'all', 'pre-commit', 'pre-push'];
    if (!supported.includes(type)) throw new Error(`Unknown validation type: ${type}`);
    if (type === 'story' && !storyPath) throw new Error('story requires a Markdown file path');
    if (type === 'stories') {
      const storyResult = validateStoryCheckboxes(files);
      results.success = storyResult.success;
      results.errors.push(...storyResult.errors);
      results.stories = storyResult;
      printInfo(`Checked ${storyResult.filesChecked} Markdown files and ${storyResult.checkboxes || 0} checkboxes`);
    }
    // Story validation
    if (type === 'story' || type === 'all') {
      if (storyPath) {
        const storyResult = await validateStoryFile(storyPath);
        if (!storyResult.success) {
          results.success = false;
          results.errors.push(...storyResult.errors);
        }
      }
    }

    // ESLint validation
    if (type === 'eslint' || type === 'all' || type === 'pre-commit') {
      const eslintResult = await runESLint(files);
      if (!eslintResult.success) {
        results.success = false;
        results.errors.push(...eslintResult.errors);
      }
    }

    // TypeScript validation
    if (type === 'typescript' || type === 'typecheck' || type === 'all' || type === 'pre-push') {
      const tsResult = await runTypeScript();
      if (!tsResult.success) {
        results.success = false;
        results.errors.push(...tsResult.errors);
      }
    }

    // YAML validation
    if (type === 'yaml' || type === 'all') {
      const yamlResult = await validateYAML(files);
      if (!yamlResult.success) {
        results.success = false;
        results.errors.push(...yamlResult.errors);
      }
    }

    // Final summary
    console.log('\n' + '='.repeat(60));
    if (results.success) {
      printSuccess('All validations passed!');
    } else {
      printError(`Validation failed with ${results.errors.length} error(s)`);
      console.log('\nErrors:');
      results.errors.forEach(err => console.log(`  - ${err}`));
    }
    console.log('='.repeat(60) + '\n');

    return results;

  } catch (error) {
    printError(`Validation system error: ${error.message}`);
    return {
      success: false,
      errors: [`System error: ${error.message}`],
    };
  }
}

// CLI execution
async function main(args = process.argv.slice(2)) {
  const type = args[0] || 'all';
  const files = args.slice(1);
  const results = await validate({ type, files, storyPath: type === 'story' ? files[0] : undefined });
  process.exitCode = results.success ? 0 : 1;
  return results;
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });

module.exports = {
  validate,
  validateStoryFile,
  validateStoryCheckboxes,
  main,
  runESLint,
  runTypeScript,
  validateYAML,
};
