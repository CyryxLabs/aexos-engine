/**
 * Project Domain Checks
 *
 * Checks for project configuration coherence and structure.
 * Domain: project
 *
 * @module aexos-core/health-check/checks/project
 * @version 1.0.0
 * @story HCS-2 - Health Check System Implementation
 */

const PackageJsonCheck = require('./package-json');
const DependenciesCheck = require('./dependencies');
const FrameworkConfigCheck = require('./framework-config');
const NodeVersionCheck = require('./node-version');
const AexosDirectoryCheck = require('./aexos-directory');
const AgentConfigCheck = require('./agent-config');
const TaskDefinitionsCheck = require('./task-definitions');
const WorkflowDependenciesCheck = require('./workflow-dependencies');

/**
 * All project domain checks
 */
const projectChecks = {
  PackageJsonCheck,
  DependenciesCheck,
  FrameworkConfigCheck,
  NodeVersionCheck,
  AexosDirectoryCheck,
  AgentConfigCheck,
  TaskDefinitionsCheck,
  WorkflowDependenciesCheck,
};

// Named-import compatibility without duplicating registration through
// Object.values(projectChecks) in the health-check registry.
Object.defineProperties(projectChecks, {
  AioxDirectoryCheck: { value: AexosDirectoryCheck, enumerable: false },
  CyryxDirectoryCheck: { value: AexosDirectoryCheck, enumerable: false },
});

module.exports = projectChecks;
