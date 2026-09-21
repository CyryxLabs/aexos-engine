'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

/**
 * Determine whether Claude Code-specific checks apply to this project.
 * Fail closed: only a valid canonical configuration that explicitly disables
 * Claude Code and selects at least one other IDE can suppress the checks.
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
    const configs = config?.ide?.configs;
    if (!Array.isArray(selected) || selected.length === 0 ||
        !selected.every((value) => typeof value === 'string' && value.trim()) ||
        !configs || typeof configs !== 'object' || Array.isArray(configs) ||
        typeof configs['claude-code'] !== 'boolean') {
      return { applicable: true, reason: 'IDE metadata is missing or invalid' };
    }
    const selectedIDEs = [...new Set(selected.map((value) => value.trim().toLowerCase()))];
    if (selectedIDEs.includes('claude-code') || configs['claude-code'] !== false) {
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
  return {
    check,
    status: 'INFO',
    message: `Not applicable: Claude Code is explicitly disabled (selected IDEs: ${selectedIDEs.join(', ')})`,
    fixCommand: null,
  };
}

module.exports = { getClaudeCodeApplicability, notApplicableResult };
