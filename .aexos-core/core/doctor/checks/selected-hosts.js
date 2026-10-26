'use strict';

const { readSelection } = require('../host-selection');
const { inspectHostEvidence, isOrdinaryConfiguration } = require('../../execution/installed-capabilities');

const name = 'selected-hosts';
// ADAPT installer config/ide-configs.js paths. Core checks ship independently of installer.
const HOST_FILES = {
  grok: '.grok/rules/aexos-core.md',
  'claude-code': '.claude/CLAUDE.md',
  codex: 'AGENTS.md',
  gemini: '.gemini/rules.md',
  cursor: '.cursor/rules/aexos-global.mdc',
  'github-copilot': '.github/copilot-instructions.md',
  antigravity: '.antigravity/rules.md',
};

async function run(context) {
  try {
    const selected = readSelection(context);
    if (selected === null || selected.length === 0) {
      return { check: name, status: 'INFO', message: selected === null ? 'No explicit host selection recorded; legacy diagnostics apply' : 'No host integrations selected', fixCommand: null };
    }
    const missing = selected.filter((host) => HOST_FILES[host] && !isOrdinaryConfiguration(context.projectRoot, HOST_FILES[host]));
    const unknown = selected.filter((host) => !HOST_FILES[host]);
    if (missing.length) return { check: name, status: 'FAIL', message: `Selected hosts missing configuration: ${missing.map((host) => `${host} (${HOST_FILES[host]})`).join(', ')}`, fixCommand: `npx @aexos/core install --force --ide ${missing[0]}` };
    if (unknown.length) return { check: name, status: 'WARN', message: `Host configuration verification unavailable: ${unknown.join(', ')}. Review ide.selected in .aexos-core/core-config.yaml; supported installer hosts: ${Object.keys(HOST_FILES).join(', ')}.`, fixCommand: null };
    return { check: name, status: 'PASS', message: `Selected host configuration files present: ${selected.join(', ')} (connectivity not tested)`, fixCommand: null,
      hostEvidence: inspectHostEvidence(context.projectRoot).filter((host) => selected.includes(host.host)) };
  } catch (error) {
    return { check: name, status: 'FAIL', message: `Cannot validate selected hosts: ${error.message}`, fixCommand: null };
  }
}

module.exports = { name, run };
