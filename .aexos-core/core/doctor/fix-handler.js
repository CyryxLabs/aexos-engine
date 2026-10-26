/**
 * Doctor Fix Handler
 *
 * Maps check names to fix functions. Supports --fix and --dry-run modes.
 * All fix operations are idempotent.
 *
 * @module aexos-core/doctor/fix-handler
 * @story INS-4.1
 */

const path = require('path');
const fs = require('fs');

const { EXPECTED_RULES } = require('./checks/rules-files');
const { readInstalledAgents } = require('./checks/agent-memory');

/**
 * Apply fixes for WARN/FAIL results
 *
 * @param {Array} results - Check results
 * @param {Object} context - Doctor context
 * @returns {Array} Fix results
 */
async function applyFixes(results, context) {
  const { projectRoot, frameworkRoot, options } = context;
  const { dryRun = false } = options;
  const fixResults = [];

  for (const result of results) {
    if (result.status !== 'WARN' && result.status !== 'FAIL') {
      continue;
    }

    if (result.autoFixable === false) {
      fixResults.push({
        check: result.check,
        applied: false,
        message: 'Auto-fix skipped because the controlling configuration requires an explicit user change',
      });
      continue;
    }

    const fixer = FIX_MAP[result.check];
    if (!fixer) {
      fixResults.push({
        check: result.check,
        applied: false,
        message: 'No auto-fix available',
      });
      continue;
    }

    try {
      if (dryRun) {
        const description = fixer.describe(result, { projectRoot, frameworkRoot });
        fixResults.push({
          check: result.check,
          applied: false,
          message: `[DRY RUN] Would: ${description}`,
        });
      } else {
        const fixMessage = await fixer.apply(result, { projectRoot, frameworkRoot });
        fixResults.push({
          check: result.check,
          applied: true,
          message: fixMessage,
        });
      }
    } catch (error) {
      fixResults.push({
        check: result.check,
        applied: false,
        message: `Fix failed: ${error.message}`,
      });
    }
  }

  return fixResults;
}

const FIX_MAP = {
  'rules-files': {
    describe(result, { projectRoot, frameworkRoot }) {
      const rulesSource = path.join(frameworkRoot, '.claude', 'rules');
      const rulesTarget = path.join(projectRoot, '.claude', 'rules');
      return `Copy missing rules from ${rulesSource} to ${rulesTarget}`;
    },
    async apply(result, { projectRoot, frameworkRoot }) {
      const rulesSource = path.join(frameworkRoot, '.claude', 'rules');
      const rulesTarget = path.join(projectRoot, '.claude', 'rules');

      if (!fs.existsSync(rulesTarget)) {
        fs.mkdirSync(rulesTarget, { recursive: true });
      }

      let copied = 0;
      for (const file of EXPECTED_RULES) {
        const targetFile = path.join(rulesTarget, file);
        const sourceFile = path.join(rulesSource, file);

        if (!fs.existsSync(targetFile) && fs.existsSync(sourceFile)) {
          fs.copyFileSync(sourceFile, targetFile);
          copied++;
        }
      }

      const remaining = EXPECTED_RULES.filter((file) => !fs.existsSync(path.join(rulesTarget, file)));
      if (remaining.length) throw new Error(`Rules still missing after copy: ${remaining.join(', ')}. Reinstall Claude Code integration from a complete package.`);
      return `Copied ${copied} missing rules files`;
    },
  },

  'agent-memory': {
    describe() {
      return 'Create missing MEMORY.md stubs for agents';
    },
    async apply(result, { projectRoot }) {
      const agentsDir = path.join(projectRoot, '.aexos-core', 'development', 'agents');
      let created = 0;

      const expected = readInstalledAgents(projectRoot);
      if (!expected.length) throw new Error('No installed agent definitions found; reinstall before creating memory stubs');
      for (const agent of expected) {
        const memoryPath = path.join(agentsDir, agent, 'MEMORY.md');
        const agentDir = path.join(agentsDir, agent);

        if (!fs.existsSync(memoryPath)) {
          if (!fs.existsSync(agentDir)) {
            fs.mkdirSync(agentDir, { recursive: true });
          }
          fs.writeFileSync(memoryPath, `# ${agent} Agent Memory\n\n_Created by aexos doctor --fix_\n`);
          created++;
        }
      }

      return `Created ${created} MEMORY.md stubs`;
    },
  },

  'claude-md': {
    describe() {
      return 'Regenerate CLAUDE.md with missing sections';
    },
    async apply() {
      throw new Error('Manual remediation required: npx @aexos/core install --force --ide claude-code');
    },
  },

  'settings-json': {
    describe() {
      return 'Regenerate settings.json with boundary deny rules';
    },
    async apply() {
      throw new Error('Manual remediation required: npx @aexos/core install --force --ide claude-code');
    },
  },
};

module.exports = { applyFixes };
