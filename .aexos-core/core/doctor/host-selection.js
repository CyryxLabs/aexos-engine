'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

/** Read explicit install selection; absence retains legacy diagnostics. */
function readSelection(context) {
  const configPath = path.join(context.projectRoot, '.aexos-core', 'core-config.yaml');
  if (!fs.existsSync(configPath)) return null;
  const config = yaml.load(fs.readFileSync(configPath, 'utf8'));
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('core-config.yaml must contain a configuration object');
  }
  if (config.ide !== undefined && (!config.ide || typeof config.ide !== 'object' || Array.isArray(config.ide))) {
    throw new Error('core-config.yaml ide must be a configuration object');
  }
  const selected = config.ide?.selected;
  if (selected === undefined) return null;
  if (!Array.isArray(selected) || selected.some((id) => typeof id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(id)) || new Set(selected).size !== selected.length) {
    throw new Error('core-config.yaml ide.selected must be an array of host names');
  }
  return selected;
}

function claudeApplicability(context, check) {
  try {
    const selected = readSelection(context);
    if (selected !== null && !selected.includes('claude-code')) {
      return { check, status: 'INFO', message: 'Not applicable: Claude Code is not selected', fixCommand: null };
    }
    return null;
  } catch (error) {
    return { check, status: 'FAIL', message: `Cannot determine selected hosts: ${error.message}`, fixCommand: null };
  }
}

module.exports = { readSelection, claudeApplicability };
