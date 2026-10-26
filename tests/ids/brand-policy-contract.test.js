'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '../..');
const SOURCE = path.join(ROOT, 'squads/brand');
const POLICY = 'config/brand-runtime.yaml';
const AGENTS = fs.readdirSync(path.join(SOURCE, 'agents')).filter(file => file.endsWith('.md'));
let fixture;
let brand;

function runCli() {
  const result = spawnSync(process.execPath, [path.join(fixture, 'scripts/validate-squads.js')], {
    cwd: fixture, encoding: 'utf8', timeout: 15000,
    env: { ...process.env, NODE_PATH: path.join(ROOT, 'node_modules') },
  });
  if (result.error) throw result.error;
  return { status: result.status, output: result.stdout + result.stderr };
}

function change(file, mutate) {
  const target = path.join(brand, file);
  fs.writeFileSync(target, mutate(fs.readFileSync(target, 'utf8')));
}

function changeYaml(file, mutate) {
  change(file, text => {
    const value = yaml.load(text);
    mutate(value);
    return yaml.dump(value);
  });
}

function reject(expected) {
  const result = runCli();
  expect(result.status).toBe(1);
  expect(result.output).toContain('BRAND_POLICY_INVALID');
  expect(result.output).toContain(expected);
  expect(result.output).not.toContain('validator threw');
}

beforeAll(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'aex-brand-policy-'));
  brand = path.join(fixture, 'squads/brand');
  // Exercise the actual CLI + actual framework validator, never a mocked result.
  for (const file of [
    'scripts/validate-squads.js', 'scripts/lib/validate-brand-policy.js',
    'scripts/lib/validate-command-dependencies.js',
    '.aexos-core/development/scripts/squad/squad-validator.js',
    '.aexos-core/development/scripts/workflow-validator.js',
    '.aexos-core/schemas/squad-schema.json',
  ]) {
    const target = path.join(fixture, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(ROOT, file), target);
  }
});

beforeEach(() => {
  fs.rmSync(brand, { recursive: true, force: true });
  fs.cpSync(SOURCE, brand, { recursive: true });
});

afterAll(() => {
  if (fixture) fs.rmSync(fixture, { recursive: true, force: true });
});

describe('Brand policy through the real squad validation CLI', () => {
  test('accepts canonical content, legacy task name, Agent case and symbolic identifiers', () => {
    const result = runCli();
    expect(result).toEqual({ status: 0, output: expect.stringContaining('0 error(s), 0 warning(s)') });
    const text = fs.readFileSync(path.join(brand, 'tasks/coherence-check.md'), 'utf8');
    const task = yaml.load(text.match(/```yaml\r?\n([\s\S]*?)\r?\n```/)[1]).task;
    expect(task.task_name).toBe(task.name);
    expect(task.execution_type).toBe('Agent');
    const policy = yaml.load(fs.readFileSync(path.join(brand, POLICY), 'utf8'));
    expect(policy.task_standards.validator).toBe('BR-TP-001');
    expect(policy.pattern_library.patterns).toEqual([]);
  });

  test.each(['task_name', 'status', 'responsible_executor', 'execution_type',
    'input', 'output', 'action_items', 'acceptance_criteria'])('rejects missing task.%s', field => {
    change('tasks/coherence-check.md', text => text.replace(/```yaml\r?\n([\s\S]*?)\r?\n```/, (_, block) => {
      const value = yaml.load(block);
      delete value.task[field];
      return '```yaml\n' + yaml.dump(value) + '```';
    }));
    reject(`task.${field}`);
  });

  test('rejects unknown execution category', () => {
    change('tasks/brand-audit.md', text => text.replace('execution_type: Agent', 'execution_type: autonomous-provider'));
    reject('task.execution_type');
  });
  test('rejects unknown executor', () => {
    change('tasks/brand-audit.md', text => text.replace('responsible_executor: brand-chief', 'responsible_executor: nonexistent'));
    reject('task.responsible_executor');
  });
  test('rejects an executor whose file is absent', () => {
    fs.unlinkSync(path.join(brand, 'agents/brand-chief.md'));
    reject('brand/agents/brand-chief.md');
  });
  test('rejects an unknown selection category', () => {
    changeYaml(POLICY, value => { value.executor_selection.requires_speed = ['agent', 'remote']; });
    reject('executor_selection.requires_speed');
  });
  test('rejects an unknown tier member', () => {
    changeYaml(POLICY, value => { value.tier_system.tier_1.agents.push('missing-agent'); });
    reject('unknown agent missing-agent');
  });
  test('rejects duplicate tier membership', () => {
    changeYaml(POLICY, value => { value.tier_system.tier_1.agents.push('brand-chief'); });
    reject('duplicate agent brand-chief');
  });
  test('rejects manifest tier disagreement', () => {
    changeYaml('squad.yaml', value => { value.agents['brand-chief'].tier = 2; });
    reject('agent.tier');
  });
  test.each(AGENTS)('rejects missing direct-entry policy dependency in %s', file => {
    change(`agents/${file}`, text => text.replace('    - brand-runtime.yaml', '    - wrong-policy.yaml'));
    reject('dependencies.config');
  });
  test.each(AGENTS)('rejects missing command guidance in %s', file => {
    change(`agents/${file}`, text => text.replace(/command-instructions:\n(?: {2}- .*\n)+/, ''));
    reject('command-instructions');
  });
  test('rejects chief work loader bypass', () => {
    change('agents/brand-chief.md', text => text.replace('      - config/brand-runtime.yaml\n', ''));
    reject('command_loader.*brand-from-zero.requires');
  });
  test('rejects an advertised chief command whose loader was deleted', () => {
    change('agents/brand-chief.md', text => text.replace(/ {2}'\*brand-from-zero':[\s\S]*?(?= {2}'\*brand-audit':)/, ''));
    reject('missing advertised command *brand-from-zero');
  });
  test('rejects malformed chief command keys', () => {
    change('agents/brand-chief.md', text => text.replace("  '*brand-from-zero':", '  brand-from-zero:'));
    reject('invalid chief command key');
  });
  test('rejects unrostered direct agent entry points', () => {
    fs.writeFileSync(path.join(brand, 'agents/direct-extra.md'), '```yaml\nagent:\n  id: direct-extra\n  name: Extra\n```\n');
    reject('on-disk direct entry is absent from canonical roster');
  });
  test('rejects task policy drift', () => {
    change('tasks/brand-audit.md', text => text.replace('policy: config/brand-runtime.yaml', 'policy: config/other.yaml'));
    reject('brand/tasks/brand-audit.md');
  });
  test('rejects workflow policy drift', () => {
    change('workflows/wf-brand-audit.yaml', text => text.replace('policy: config/brand-runtime.yaml', 'policy: config/other.yaml'));
    reject('brand/workflows/wf-brand-audit.yaml');
  });
  test('rejects missing policy', () => {
    fs.unlinkSync(path.join(brand, POLICY));
    reject(POLICY);
  });
  test.each(['[broken:', 'null', '[]', 'task_standards: false'])('rejects malformed policy %s', text => {
    fs.writeFileSync(path.join(brand, POLICY), text);
    reject(POLICY);
  });
  test('rejects policy that weakens required anatomy', () => {
    changeYaml(POLICY, value => { value.task_standards.required_fields = []; });
    reject('task_standards.required_fields');
  });
  test.each([
    ['executor_types.agent', value => { value.executor_types.agent = {}; }],
    ['executor_types.remote', value => {
      value.executor_types.remote = false;
      value.executor_selection.requires_speed = ['remote'];
    }],
    ['workflow_config', value => { value.workflow_config.checkpoint_modes = []; }],
    ['pattern_library', value => { value.pattern_library.patterns = false; }],
    ['settings', value => { value.settings.max_context_files = 'unlimited'; }],
    ['task_standards', value => { value.task_standards.enforce_anatomy = false; }],
  ])('rejects corrupt nested policy %s', (field, mutate) => {
    changeYaml(POLICY, mutate);
    reject(field);
  });
  test('rejects a task field with the wrong shape', () => {
    change('tasks/coherence-check.md', text => text.replace(/```yaml\r?\n([\s\S]*?)\r?\n```/, (_, block) => {
      const value = yaml.load(block);
      value.task.input = {};
      return '```yaml\n' + yaml.dump(value) + '```';
    }));
    reject('task.input');
  });
  test('does not mistake outer task frontmatter for the required task definition', () => {
    change('tasks/coherence-check.md', text => text.replace(/```yaml\r?\n[\s\S]*?\r?\n```/, ''));
    reject('expected one fenced task mapping');
  });
});
