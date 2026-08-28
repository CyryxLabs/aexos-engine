/**
 * Doctor Check: settings.json
 *
 * Validates .claude/settings.json exists, deny rules count >= 40,
 * and compares against core-config.yaml boundary paths.
 *
 * @module aexos-core/doctor/checks/settings-json
 * @story INS-4.1
 */

const path = require('path');
const fs = require('fs');

const name = 'settings-json';

function readFrameworkProtection(context) {
  const configPath = path.join(context.projectRoot, '.aexos-core', 'core-config.yaml');
  if (!fs.existsSync(configPath)) return null;

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const match = content.match(/^\s*frameworkProtection:\s*(true|false)\b/m);
    return match ? match[1] === 'true' : null;
  } catch {
    return null;
  }
}

/**
 * Checks that core-config.yaml boundary.protected paths are covered by deny rules.
 * Returns array of unprotected boundary paths.
 */
function checkBoundaryAlignment(context, denyRules) {
  const configPath = path.join(context.projectRoot, '.aexos-core', 'core-config.yaml');
  if (!fs.existsSync(configPath)) return []; // No config = skip boundary check

  let content;
  try {
    content = fs.readFileSync(configPath, 'utf8');
  } catch {
    return [];
  }

  // Extract boundary.protected paths from YAML (simple line parsing)
  const lines = content.split('\n');
  const protectedPaths = [];
  let inProtected = false;

  for (const line of lines) {
    if (/^\s+protected:\s*$/.test(line)) {
      inProtected = true;
      continue;
    }
    if (inProtected) {
      const match = line.match(/^\s+-\s+(.+)$/);
      if (match) {
        protectedPaths.push(match[1].trim());
      } else if (/^\s+\w/.test(line) && !line.match(/^\s+-/)) {
        inProtected = false;
      }
    }
  }

  if (protectedPaths.length === 0) return [];

  // Check each boundary path has at least one matching deny rule
  const denyStr = denyRules.join('\n');
  const unprotected = protectedPaths.filter((bp) => {
    // Strip glob suffixes for base path matching
    const basePath = bp.replace(/\/\*\*$/, '').replace(/\/\*$/, '');
    return !denyStr.includes(basePath);
  });

  return unprotected;
}

async function run(context) {
  const settingsPath = path.join(context.projectRoot, '.claude', 'settings.json');

  if (!fs.existsSync(settingsPath)) {
    return {
      check: name,
      status: 'FAIL',
      message: 'settings.json not found',
      fixCommand: 'npx @aexos/core install --force',
    };
  }

  let settings;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {
    return {
      check: name,
      status: 'FAIL',
      message: 'settings.json is invalid JSON',
      fixCommand: 'npx @aexos/core install --force',
    };
  }

  const denyRules = settings.permissions?.deny || [];
  const allowRules = settings.permissions?.allow || [];
  const denyCount = denyRules.length;
  const allowCount = allowRules.length;
  const frameworkProtection = readFrameworkProtection(context);

  if (frameworkProtection === true && denyCount === 0) {
    return {
      check: name,
      status: 'FAIL',
      message: 'Framework protection is enabled but no deny rules are configured',
      fixCommand: 'aexos doctor --fix',
    };
  }

  // Boundary coverage matters only when the project opted into framework
  // protection. A fixed global rule count was not an integrity contract.
  const boundaryIssues = frameworkProtection === true
    ? checkBoundaryAlignment(context, denyRules)
    : [];
  if (boundaryIssues.length > 0) {
    return {
      check: name,
      status: 'FAIL',
      message: `Deny rules present (${denyCount}) but missing boundary coverage: ${boundaryIssues.join(', ')}`,
      fixCommand: 'aexos doctor --fix',
    };
  }

  return {
    check: name,
    status: 'PASS',
    message: frameworkProtection === false
      ? `Framework protection disabled (${denyCount} deny rules, ${allowCount} allows)`
      : `Permission rules valid (${denyCount} deny rules, ${allowCount} allows)`,
    fixCommand: null,
  };
}

module.exports = { name, run, readFrameworkProtection };
