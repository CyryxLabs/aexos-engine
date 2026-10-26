/**
 * Doctor Check: Agent Memory
 *
 * Validates MEMORY.md files exist for all 10 agents in development/agents/.
 *
 * @module aexos-core/doctor/checks/agent-memory
 * @story INS-4.1
 */

const path = require('path');
const fs = require('fs');

const name = 'agent-memory';

const EXPECTED_AGENTS = [
  'dev',
  'qa',
  'architect',
  'pm',
  'po',
  'sm',
  'analyst',
  'data-engineer',
  'ux',
  'devops',
];

function readInstalledAgents(projectRoot) {
  const directory = path.join(projectRoot, '.aexos-core', 'development', 'agents');
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name.slice(0, -3))
    .sort();
}

async function run(context) {
  const agentsDir = path.join(context.projectRoot, '.aexos-core', 'development', 'agents');

  if (!fs.existsSync(agentsDir)) {
    return {
      check: name,
      status: 'FAIL',
      message: 'Agents directory not found',
      fixCommand: 'aexos doctor --fix',
    };
  }

  const expected = readInstalledAgents(context.projectRoot);
  if (!expected.length) {
    return { check: name, status: 'FAIL', message: 'No installed agent definitions found; memory coverage cannot be verified', fixCommand: 'npx @aexos/core install --force' };
  }
  const missing = expected.filter(
    (agent) => !fs.existsSync(path.join(agentsDir, agent, 'MEMORY.md')),
  );

  if (missing.length === 0) {
    return {
      check: name,
      status: 'PASS',
      message: `${expected.length}/${expected.length} installed-agent MEMORY.md files present`,
      fixCommand: null,
    };
  }

  const present = expected.length - missing.length;

  return {
    check: name,
    status: 'WARN',
    message: `${present}/${expected.length} installed-agent MEMORY.md files present (missing: ${missing.join(', ')})`,
    fixCommand: 'aexos doctor --fix',
  };
}

module.exports = { name, run, EXPECTED_AGENTS, readInstalledAgents };
