/**
 * Doctor Check: Hooks Claude Count
 *
 * Counts .cjs files in .claude/hooks/ and verifies registration
 * in settings.local.json.
 * PASS: >=2 + all registered, WARN: files present but not registered or <2,
 * FAIL: 0 or directory missing.
 *
 * @module aexos-core/doctor/checks/hooks-claude-count
 * @story INS-4.8
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { getClaudeCodeApplicability, notApplicableResult } = require('../ide-applicability');

const name = 'hooks-claude-count';

// These reviewed wrappers delegate to one adjacent helper each. Bind delegation
// to the exact wrapper bytes so a comment or fake wrapper cannot hide an
// unregistered executable hook.
const CANONICAL_DELEGATIONS = {
  'synapse-wrapper.cjs': { helper: 'synapse-engine.cjs', sha256: '7ed83025a47f20f4e3e9adf2de1a3bbcf65045341a0ea1d0037e98f82eb31918' },
  'precompact-wrapper.cjs': { helper: 'precompact-session-digest.cjs', sha256: '4afa0eb6185874dd5467c85866266a27445fbe5fcd5977b52e407fc4c7c8875a' },
};

function countCoveredHooks(hookFiles, commands, hooksDir) {
  const covered = new Set(hookFiles.filter((file) => commands.some((command) => {
    const escaped = file.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[/\\\\\\s"'])${escaped}(?=$|[\\s"'])`).test(command);
  })).map((file) => file.name));
  for (const [wrapper, delegation] of Object.entries(CANONICAL_DELEGATIONS)) {
    if (!covered.has(wrapper)) continue;
    try {
      const source = fs.readFileSync(path.join(hooksDir, wrapper), 'utf8').replace(/\r\n/g, '\n');
      const digest = crypto.createHash('sha256').update(source).digest('hex');
      if (digest === delegation.sha256) covered.add(delegation.helper);
    } catch (_error) { /* Unreadable wrappers do not establish delegation. */ }
  }
  return hookFiles.filter((file) => covered.has(file.name)).length;
}

async function run(context) {
  const applicability = getClaudeCodeApplicability(context.projectRoot);
  if (!applicability.applicable) return notApplicableResult(name, applicability.selectedIDEs);
  const hooksDir = path.join(context.projectRoot, '.claude', 'hooks');

  if (!fs.existsSync(hooksDir)) {
    return {
      check: name,
      status: 'FAIL',
      message: 'Hooks directory not found (.claude/hooks/)',
      fixCommand: 'npx @aexos/core install --force',
    };
  }

  let entries;
  try {
    entries = fs.readdirSync(hooksDir, { withFileTypes: true });
  } catch {
    return {
      check: name,
      status: 'FAIL',
      message: 'Cannot read hooks directory',
      fixCommand: 'npx @aexos/core install --force',
    };
  }

  const hookFiles = entries.filter(
    (e) => e.isFile() && e.name.endsWith('.cjs'),
  );
  const hookCount = hookFiles.length;

  if (hookCount === 0) {
    return {
      check: name,
      status: 'FAIL',
      message: 'No hook files found (.cjs)',
      fixCommand: 'npx @aexos/core install --force',
    };
  }

  // Registration may be split across the shared and local Claude settings.
  const settingsPaths = ['settings.json', 'settings.local.json']
    .map((file) => path.join(context.projectRoot, '.claude', file));
  let registered = false;
  const allHookCommands = [];

  for (const settingsLocalPath of settingsPaths) {
    if (!fs.existsSync(settingsLocalPath)) continue;
    try {
      const settingsLocal = JSON.parse(fs.readFileSync(settingsLocalPath, 'utf8'));
      const hooks = settingsLocal.hooks || {};
      // Claude Code hooks schema: { EventName: [{ matcher, hooks: [{ type, command }] }] }
      for (const entries of Object.values(hooks)) {
        if (!Array.isArray(entries)) continue;
        for (const entry of entries) {
          if (entry && Array.isArray(entry.hooks)) {
            for (const h of entry.hooks) {
              if (h && h.command) allHookCommands.push(h.command);
            }
          }
          // Fallback: flat string or direct command
          if (typeof entry === 'string') allHookCommands.push(entry);
          if (entry && typeof entry.command === 'string') allHookCommands.push(entry.command);
        }
      }
      registered = countCoveredHooks(hookFiles, allHookCommands, hooksDir) === hookCount;
    } catch (error) {
      return { check: name, status: 'FAIL', message: `Cannot validate hook settings: ${error.message}`, fixCommand: null };
    }
  }

  if (hookCount >= 2 && registered) {
    return {
      check: name,
      status: 'PASS',
      message: `${hookCount} hook files registered directly or through verified canonical wrappers`,
      fixCommand: null,
    };
  }

  if (hookCount >= 2 && !registered) {
    return {
      check: name,
      status: 'WARN',
      message: `${hookCount} hook files found but some are not registered in settings.json/settings.local.json`,
      fixCommand: 'npx @aexos/core install --force',
    };
  }

  return {
    check: name,
    status: 'WARN',
    message: `Only ${hookCount}/2 hook files found`,
    fixCommand: 'npx @aexos/core install --force',
  };
}

module.exports = { name, run };
