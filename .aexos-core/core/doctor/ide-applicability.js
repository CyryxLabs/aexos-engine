'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

/**
 * Determine whether Claude Code-specific checks apply to this project.
 * Fail closed for unreadable or malformed selection metadata. A valid empty
 * selection represents CLI-only use, and a valid non-Claude selection does not
 * require legacy ide.configs entries to prove that Claude Code is unselected.
 */
function getClaudeCodeApplicability(projectRoot) {
  const configPath = path.join(projectRoot, '.aexos-core', 'core-config.yaml');
  try {
    const stat = fs.lstatSync(configPath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      return { applicable: true, reason: 'core config is not a regular file' };
    }
    const config = yaml.load(fs.readFileSync(configPath, 'utf8'));
    const selected = config?.ide?.selected;
    if (!Array.isArray(selected) ||
        !selected.every((value) => typeof value === 'string' && value.trim())) {
      return { applicable: true, reason: 'IDE metadata is missing or invalid' };
    }
    const selectedIDEs = [...new Set(selected.map((value) => value.trim().toLowerCase()))];
    if (config.ide.configs?.['claude-code'] === true && !selectedIDEs.includes('claude-code')) {
      return { applicable: true, selectedIDEs, reason: 'IDE metadata is contradictory: Claude Code is enabled but not selected' };
    }
    if (selectedIDEs.includes('claude-code')) {
      return { applicable: true, selectedIDEs };
    }
    return { applicable: false, selectedIDEs };
  } catch (error) {
    return {
      applicable: true,
      reason: error.code === 'ENOENT' ? 'core config is missing' : 'core config is invalid',
    };
  }
}

function notApplicableResult(check, selectedIDEs) {
  const selection = selectedIDEs.length ? selectedIDEs.join(', ') : 'CLI only';
  return {
    check,
    status: 'INFO',
    message: `Not applicable: Claude Code is not selected (selected IDEs: ${selection})`,
    fixCommand: null,
  };
}

module.exports = { getClaudeCodeApplicability, notApplicableResult };
