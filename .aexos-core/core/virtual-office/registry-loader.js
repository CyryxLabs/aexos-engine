'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const FRAMEWORK_ROOT = path.resolve(__dirname, '..', '..', '..');

function findRegistryPath(projectRoot) {
  const localPath = path.join(projectRoot, '.aexos-core', 'data', 'squad-registry.yaml');
  if (fs.existsSync(localPath)) return localPath;

  const frameworkPath = path.join(FRAMEWORK_ROOT, '.aexos-core', 'data', 'squad-registry.yaml');
  const projectCore = path.join(projectRoot, '.aexos-core');
  if (fs.existsSync(projectCore) && fs.existsSync(frameworkPath)) return frameworkPath;

  throw new Error(
    `AEXOS squad registry not found under ${path.resolve(projectRoot)} or the installed framework`,
  );
}

function findCoreAgentsDirectory(projectRoot) {
  const localDirectory = path.join(projectRoot, '.aexos-core', 'development', 'agents');
  if (fs.existsSync(localDirectory)) return localDirectory;
  const frameworkDirectory = path.join(
    FRAMEWORK_ROOT,
    '.aexos-core',
    'development',
    'agents',
  );
  return fs.existsSync(frameworkDirectory) ? frameworkDirectory : null;
}

function loadCoreAgentSquad(projectRoot) {
  const agentsDirectory = findCoreAgentsDirectory(projectRoot);
  if (!agentsDirectory) return null;

  const agents = fs.readdirSync(agentsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      const content = fs.readFileSync(path.join(agentsDirectory, entry.name), 'utf8');
      const yamlBlock = content.match(/```yaml\s*([\s\S]*?)```/i);
      if (!yamlBlock) return null;
      const definition = yaml.load(yamlBlock[1]) || {};
      const sourceAgent = definition.agent || {};
      const agentId = String(sourceAgent.id || path.basename(entry.name, '.md'))
        .trim()
        .replace(/^@/, '');
      if (!agentId) return null;
      return {
        key: `aexos-core/${agentId}`,
        id: agentId,
        name: String(sourceAgent.name || agentId),
        title: String(sourceAgent.title || 'AEXOS Core Agent'),
        squadId: 'aexos-core',
      };
    })
    .filter(Boolean);

  if (!agents.length) return null;
  return {
    id: 'aexos-core',
    name: 'AEXOS Core',
    domain: 'Framework orchestration and governance',
    description: 'Canonical framework agents that coordinate AEXOS execution and quality.',
    entryAgent: 'aexos-master',
    agents,
  };
}

function loadRegistry(projectRoot = process.cwd()) {
  const registryPath = findRegistryPath(path.resolve(projectRoot));
  const document = yaml.load(fs.readFileSync(registryPath, 'utf8')) || {};

  if (!Array.isArray(document.squads)) {
    throw new Error(`Invalid squad registry: "squads" must be an array (${registryPath})`);
  }

  const seenSquads = new Set();
  const seenAgentKeys = new Set();
  const registrySquads = document.squads.map((sourceSquad) => {
    const id = String(sourceSquad.name || '').trim();
    if (!id || seenSquads.has(id)) {
      throw new Error(`Invalid or duplicate squad id in ${registryPath}: ${id || '<empty>'}`);
    }
    seenSquads.add(id);

    if (!Array.isArray(sourceSquad.agents)) {
      throw new Error(`Squad ${id} has no valid agents array`);
    }

    const agents = sourceSquad.agents.map((sourceAgent) => {
      const agentId = String(sourceAgent.id || '').trim().replace(/^@/, '');
      const key = `${id}/${agentId}`;
      if (!agentId || seenAgentKeys.has(key)) {
        throw new Error(`Invalid or duplicate agent key in ${registryPath}: ${key}`);
      }
      seenAgentKeys.add(key);
      return {
        key,
        id: agentId,
        name: String(sourceAgent.name || agentId),
        title: String(sourceAgent.title || 'AEXOS Agent'),
        squadId: id,
      };
    });

    return {
      id,
      name: String(sourceSquad.display_name || id),
      domain: String(sourceSquad.domain || id),
      description: String(sourceSquad.description || ''),
      entryAgent: String(sourceSquad.entry_agent || ''),
      agents,
    };
  });

  const coreSquad = loadCoreAgentSquad(projectRoot);
  const squads = coreSquad ? [coreSquad, ...registrySquads] : registrySquads;
  const agentCount = squads.reduce((total, squad) => total + squad.agents.length, 0);
  const registryAgentCount = registrySquads.reduce(
    (total, squad) => total + squad.agents.length,
    0,
  );
  const declaredCount = Number(document.registry?.squad_count);
  if (Number.isFinite(declaredCount) && declaredCount !== registrySquads.length) {
    throw new Error(
      `Squad registry count mismatch: declared ${declaredCount}, loaded ${registrySquads.length}`,
    );
  }

  return {
    version: String(document.registry?.version || 'unknown'),
    registryPath,
    sourceScope: registryPath.startsWith(path.resolve(projectRoot) + path.sep) ? 'project' : 'framework-catalog',
    squadCount: squads.length,
    agentCount,
    registrySquadCount: registrySquads.length,
    registryAgentCount,
    coreAgentCount: coreSquad?.agents.length || 0,
    squads,
  };
}

module.exports = {
  FRAMEWORK_ROOT,
  findCoreAgentsDirectory,
  findRegistryPath,
  loadCoreAgentSquad,
  loadRegistry,
};
