'use strict';

const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const SubagentPromptBuilder = require(path.resolve(
  __dirname,
  '../../../.aexos-core/core/orchestration/subagent-prompt-builder',
));
const ChecklistRunner = require(path.resolve(
  __dirname,
  '../../../.aexos-core/core/orchestration/checklist-runner',
));

describe('framework definition confinement', () => {
  let projectRoot;
  let frameworkRoot;
  let promptBuilder;
  let checklistRunner;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aexos-definition-project-'));
    frameworkRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aexos-definition-framework-'));
    await Promise.all([
      fs.ensureDir(path.join(frameworkRoot, '.aexos-core', 'development', 'agents')),
      fs.ensureDir(path.join(frameworkRoot, '.aexos-core', 'development', 'tasks')),
      fs.ensureDir(path.join(frameworkRoot, '.aexos-core', 'product', 'checklists')),
      fs.ensureDir(path.join(frameworkRoot, '.aexos-core', 'product', 'templates')),
    ]);
    promptBuilder = new SubagentPromptBuilder(projectRoot, { frameworkRoot });
    checklistRunner = new ChecklistRunner(projectRoot, { frameworkRoot });
  });

  afterEach(async () => {
    await fs.remove(projectRoot);
    await fs.remove(frameworkRoot);
  });

  it.each([
    ['task', () => promptBuilder.loadTaskDefinition('../../constitution'), 'WORKFLOW_TASK_ID_INVALID'],
    ['agent', () => promptBuilder.loadAgentDefinition('../dev'), 'WORKFLOW_AGENT_ID_INVALID'],
    ['checklist prompt', () => promptBuilder.loadChecklist('../story-dod'), 'WORKFLOW_CHECKLIST_ID_INVALID'],
    ['template', () => promptBuilder.loadTemplate('../story'), 'WORKFLOW_TEMPLATE_ID_INVALID'],
    ['checklist runner', () => checklistRunner.loadChecklist('../story-dod'), 'WORKFLOW_CHECKLIST_ID_INVALID'],
  ])('rejects %s traversal before filesystem reads', async (_label, load, code) => {
    await expect(load()).rejects.toMatchObject({ code });
  });

  it('loads valid framework definitions from the external framework root', async () => {
    await fs.writeFile(
      path.join(frameworkRoot, '.aexos-core', 'development', 'tasks', 'safe-task.md'),
      '# Safe task\n',
    );

    await expect(promptBuilder.loadTaskDefinition('safe-task')).resolves.toBe('# Safe task\n');
  });
});
