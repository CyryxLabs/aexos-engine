'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { loadTaskContract } = require('./task-contract');
const { resolveArtifact } = require('./outcome-verifier');

function discoverTasks(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => entry.isDirectory() ? discoverTasks(path.join(directory, entry.name))
      : entry.isFile() && entry.name.endsWith('.md') ? [path.join(directory, entry.name)] : []);
}

function inspectTasks(root, files) {
  return files.map((file) => {
    try {
      const resolved = resolveArtifact(root, file);
      if (!resolved.stat.isFile()) throw new Error('Task must be a regular file.');
      const result = loadTaskContract(resolved.absolute, { projectRoot: root });
      return { path: file, status: result.status, errors: result.errors };
    } catch (error) {
      return { path: file, status: 'invalid', errors: [{ code: error.code || 'TASK_READ_FAILED', message: error.message }] };
    }
  });
}

function summarize(name, tasks, errors = []) {
  const contracted = tasks.filter((task) => task.status === 'contracted').length;
  const invalid = tasks.filter((task) => task.status === 'invalid').length;
  return {
    name, total: tasks.length, contracted, invalid,
    uncontracted: tasks.length - contracted - invalid,
    coveragePercent: tasks.length ? Math.round(contracted / tasks.length * 10000) / 100 : null,
    runtimeReadiness: 'NOT_ASSESSED', errors, tasks,
  };
}

function inspectCapabilityCoverage(projectRoot = process.cwd()) {
  const root = fs.realpathSync(path.resolve(projectRoot));
  const coreRoot = resolveArtifact(root, '.aexos-core/development/tasks');
  const coreTasks = discoverTasks(coreRoot.absolute).map((file) => path.relative(root, file).split(path.sep).join('/'));
  const groups = [summarize('core', inspectTasks(root, coreTasks))];
  const registryPath = resolveArtifact(root, '.aexos-core/data/squad-registry.yaml');
  const registry = yaml.load(fs.readFileSync(registryPath.absolute, 'utf8'));
  if (!Array.isArray(registry?.squads)) throw new Error('Squad registry must declare a squads array.');
  const names = new Set();
  for (const squad of registry.squads) {
    if (!/^[a-z][a-z0-9-]*$/.test(squad?.name) || names.has(squad.name)) {
      throw new Error('Squad registry contains an invalid or duplicate squad identity.');
    }
    names.add(squad.name);
    try {
      const manifestPath = resolveArtifact(root, `squads/${squad.name}/squad.yaml`);
      const manifest = yaml.load(fs.readFileSync(manifestPath.absolute, 'utf8'));
      const definitions = manifest?.components?.tasks;
      if (!Array.isArray(definitions) || definitions.some((file) => typeof file !== 'string'
        || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.md$/.test(file)) || new Set(definitions).size !== definitions.length) {
        throw new Error('Squad must declare unique task filenames in components.tasks.');
      }
      const files = definitions.map((file) => `squads/${squad.name}/tasks/${file}`);
      groups.push(summarize(squad.name, inspectTasks(root, files)));
    } catch (error) {
      groups.push(summarize(squad.name, [], [{ code: error.code || 'SQUAD_MANIFEST_INVALID', message: error.message }]));
    }
  }
  return {
    schemaVersion: 1,
    evidenceLevel: 'structural-task-contract-coverage',
    runtimeReadiness: 'NOT_ASSESSED',
    total: groups.reduce((sum, group) => sum + group.total, 0),
    contracted: groups.reduce((sum, group) => sum + group.contracted, 0),
    hasErrors: groups.some((group) => group.invalid > 0 || group.errors.length > 0),
    groups,
  };
}

module.exports = { inspectCapabilityCoverage };
