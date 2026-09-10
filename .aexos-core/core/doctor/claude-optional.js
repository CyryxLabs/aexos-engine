'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Absence is optional only when the installed profile explicitly excludes Claude.
// A missing or malformed profile cannot establish that an integration is optional.
function missingClaudeArtifact(context, check, artifact) {
  try {
    const config = yaml.load(fs.readFileSync(path.join(context.projectRoot, '.aexos-core/core-config.yaml'), 'utf8'));
    const selected = config?.ide?.selected;
    if (!Array.isArray(selected) || selected.some((host) => typeof host !== 'string' || !/^[a-z][a-z0-9-]*$/.test(host))) {
      throw new Error('Invalid IDE selection');
    }
    if (!selected.includes('claude-code')) {
      return { check, status: 'INFO', message: `${artifact} absent: optional IDE integration; Claude Code is not selected`, fixCommand: null };
    }
    return { check, status: 'FAIL', message: `${artifact} missing for selected Claude Code integration`, fixCommand: 'npx @aexos/core install --force' };
  } catch (_error) {
    return { check, status: 'FAIL', message: `${artifact} missing; cannot establish optional integration from core-config.yaml`, fixCommand: 'npx @aexos/core install --force' };
  }
}

module.exports = { missingClaudeArtifact };
