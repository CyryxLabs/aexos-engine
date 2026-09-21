const fs = require('fs');
const path = require('path');

const {
  parseAllAgents,
} = require('../../.aexos-core/infrastructure/scripts/ide-sync/agent-parser');

const coreRoot = path.resolve(__dirname, '../../.aexos-core');
const agentsRoot = path.join(coreRoot, 'development/agents');

const dependencyRoots = {
  tasks: ['development/tasks'],
  workflows: ['development/workflows'],
  templates: ['product/templates', 'development/templates'],
  checklists: ['product/checklists', 'development/checklists'],
  schemas: ['schemas'],
  scripts: [
    'infrastructure/scripts',
    'development/scripts',
    'core/execution',
    'core/memory',
  ],
  data: ['data', 'product/data'],
  utils: [
    'core/utils',
    'infrastructure/scripts',
    'scripts',
    'development/scripts',
  ],
};

const expectedCommandCounts = {
  'aexos-master.md': 40,
  'analyst.md': 14,
  'architect.md': 21,
  'data-engineer.md': 28,
  'dev.md': 35,
  'devops.md': 43,
  'pm.md': 16,
  'po.md': 18,
  'qa.md': 25,
  'sm.md': 7,
  'squad-creator.md': 14,
  'ux-design-expert.md': 27,
};

const expectedActivationInstructionCounts = {
  'aexos-master.md': 18,
  'analyst.md': 15,
  'architect.md': 16,
  'data-engineer.md': 17,
  'dev.md': 18,
  'devops.md': 15,
  'pm.md': 17,
  'po.md': 15,
  'qa.md': 15,
  'sm.md': 15,
  'squad-creator.md': 15,
  'ux-design-expert.md': 14,
};

function normalizedCommands(commands) {
  if (Array.isArray(commands)) {
    return commands.flatMap((command) => {
      if (command && command.name) return [command];
      if (!command || typeof command !== 'object') return [];
      return Object.entries(command).map(([name, description]) => ({ name, description }));
    });
  }

  return Object.entries(commands || {}).map(([name, description]) => ({ name, description }));
}

function resolveDependency(type, name) {
  const roots = dependencyRoots[type];
  if (!roots) return null;
  return roots
    .map((root) => path.join(coreRoot, root, name))
    .find((candidate) => {
      let directory = coreRoot;
      for (const part of path.relative(coreRoot, candidate).split(path.sep)) {
        if (!fs.existsSync(directory) || !fs.readdirSync(directory).includes(part)) return false;
        directory = path.join(directory, part);
      }
      return fs.existsSync(candidate);
    }) || null;
}

describe('canonical agent dependency resolution', () => {
  const agents = parseAllAgents(agentsRoot);

  test('advertises deterministic canonical roots and resolves every local dependency', () => {
    expect(agents).toHaveLength(12);

    for (const agent of agents) {
      const resolution = agent.yaml['IDE-FILE-RESOLUTION'];
      expect(resolution).toEqual(expect.arrayContaining([
        expect.stringContaining('tasks=.aexos-core/development/tasks'),
        expect.stringContaining('scripts=.aexos-core/infrastructure/scripts'),
        expect.stringContaining('Fail closed and report the unresolved dependency'),
        expect.stringContaining('tools entries are external runtime prerequisites'),
      ]));

      for (const [type, dependencies] of Object.entries(agent.dependencies || {})) {
        if (type === 'tools' || !Array.isArray(dependencies)) continue;
        expect(dependencyRoots[type]).toBeDefined();

        for (const dependency of dependencies) {
          expect({
            agent: agent.filename,
            type,
            dependency,
            resolved: resolveDependency(type, dependency),
          }).toEqual(expect.objectContaining({
            resolved: expect.any(String),
          }));
        }
      }
    }
  });

  test('maps the DevOps gitignore utility to the real preserving generator', () => {
    const devops = agents.find((agent) => agent.filename === 'devops.md');
    const dependency = 'documentation-integrity/gitignore-generator.js';
    expect(devops.dependencies.utils).toContain(dependency);
    expect(devops.dependencies.utils).not.toContain('gitignore-manager');

    const resolved = resolveDependency('utils', dependency);
    const generator = require(resolved);
    expect(generator.generateGitignore).toEqual(expect.any(Function));
    expect(generator.mergeGitignore).toEqual(expect.any(Function));

    const customized = '# custom\ncustom-cache/\n';
    const merged = generator.mergeGitignore(customized);
    expect(merged).toContain(customized.trim());
    expect(merged).toContain('AEXOS Integration Section');
  });

  test('wires squad distribution commands while retaining external prerequisites', () => {
    const squad = agents.find((agent) => agent.filename === 'squad-creator.md');
    const commands = normalizedCommands(squad.commands);
    const expectedTasks = {
      'download-squad': 'squad-creator-download.md',
      'publish-squad': 'squad-creator-publish.md',
      'sync-squad-cyryx': 'squad-creator-sync-aexos.md',
    };

    for (const [name, task] of Object.entries(expectedTasks)) {
      const command = commands.find((entry) => entry.name === name);
      expect(command).toEqual(expect.objectContaining({
        task,
        availability: 'external-prerequisites-required',
        prerequisites: expect.stringContaining('fail closed'),
      }));
      expect(command.status).toBeUndefined();
      expect(resolveDependency('tasks', task)).toEqual(expect.any(String));
    }
  });

  test('preserves all 288 commands and the activation instruction contract', () => {
    let commandTotal = 0;

    for (const agent of agents) {
      const commands = normalizedCommands(agent.commands);
      commandTotal += commands.length;
      expect(commands).toHaveLength(expectedCommandCounts[agent.filename]);
      expect(agent.yaml['activation-instructions']).toHaveLength(
        expectedActivationInstructionCounts[agent.filename],
      );

      const activationText = JSON.stringify(agent.yaml['activation-instructions']);
      expect(activationText).toMatch(/Read THIS ENTIRE FILE/);
      expect(activationText).toMatch(/HALT and await user input/);
      expect(activationText).toMatch(
        /executable workflows, not reference material|follow task instructions exactly as written/i,
      );
      expect(activationText).toMatch(/elicit=true require user interaction/i);
    }

    expect(commandTotal).toBe(288);
  });
});
