/**
 * Doctor Check: Core Config
 *
 * Validates core-config.yaml exists and has required keys:
 * boundary, project, ide.
 *
 * @module aexos-core/doctor/checks/core-config
 * @story INS-4.1
 */

const path = require('path');
const fs = require('fs');

const yaml = require('js-yaml');
const { readSelection } = require('../host-selection');

const name = 'core-config';

const REQUIRED_SECTIONS = ['boundary', 'project', 'ide'];

async function run(context) {
  const configPath = path.join(context.projectRoot, '.aexos-core', 'core-config.yaml');

  if (!fs.existsSync(configPath)) {
    return {
      check: name,
      status: 'FAIL',
      message: 'core-config.yaml not found',
      fixCommand: 'npx @aexos/core install --force',
    };
  }

  const content = fs.readFileSync(configPath, 'utf8');

  let config;
  try {
    config = yaml.load(content);
    readSelection(context);
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('expected an object');
  } catch (error) {
    return { check: name, status: 'FAIL', message: `Invalid core-config.yaml: ${error.message}`, fixCommand: null };
  }
  const missingSections = REQUIRED_SECTIONS.filter((section) => !Object.hasOwn(config, section));
  const invalidSections = REQUIRED_SECTIONS.filter((section) => Object.hasOwn(config, section) &&
    (!config[section] || typeof config[section] !== 'object' || Array.isArray(config[section])));
  if (invalidSections.length) {
    return { check: name, status: 'FAIL', message: `Invalid configuration sections (expected objects): ${invalidSections.join(', ')}`, fixCommand: null };
  }

  if (missingSections.length === 0) {
    return {
      check: name,
      status: 'PASS',
      message: 'Required configuration sections and host selection valid',
      fixCommand: null,
    };
  }

  return {
    check: name,
    status: 'FAIL',
    message: `Missing sections: ${missingSections.join(', ')}`,
    fixCommand: 'npx @aexos/core install --force',
  };
}

module.exports = { name, run };
