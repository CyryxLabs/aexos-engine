'use strict';

// Content validation only: these checks do not execute policies or dispatch agents.
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const POLICY = 'config/brand-runtime.yaml';
const BLOCKS = ['pattern_library', 'task_standards', 'executor_types',
  'executor_selection', 'workflow_config', 'tier_system', 'settings'];
const REQUIRED_FIELDS = ['task_name', 'status', 'responsible_executor',
  'execution_type', 'input', 'output', 'action_items', 'acceptance_criteria'];
const isMap = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = value => typeof value === 'string' && value.trim().length > 0;
const isTextList = value => Array.isArray(value) && value.length > 0 && value.every(isText);
const hasValue = value => value !== undefined && value !== null &&
  (typeof value !== 'string' || value.trim().length > 0) &&
  (!Array.isArray(value) || value.length > 0);

function validateBrandPolicy(squadPath) {
  const errors = [];
  const fail = (file, field, message) => errors.push({
    code: 'BRAND_POLICY_INVALID', file: `brand/${file}`, message: `${field}: ${message}`,
  });
  const readYaml = file => {
    try {
      const value = yaml.load(fs.readFileSync(path.join(squadPath, file), 'utf8'));
      if (!isMap(value)) throw new Error('expected a YAML mapping');
      return value;
    } catch (error) {
      fail(file, 'YAML', error.reason || error.message);
      return null;
    }
  };
  const readBlock = (file, task = false) => {
    try {
      const text = fs.readFileSync(path.join(squadPath, file), 'utf8');
      const blocks = [...text.matchAll(/^```yaml\r?\n([\s\S]*?)^```/gm)];
      const values = (task ? blocks : blocks.slice(0, 1)).map(block => yaml.load(block[1]));
      const matches = task ? values.filter(value => isMap(value) && isMap(value.task)) : values;
      if (matches.length !== 1 || !isMap(matches[0])) {
        throw new Error(`expected one fenced ${task ? 'task mapping' : 'agent definition'}`);
      }
      return task ? matches[0].task : matches[0];
    } catch (error) {
      fail(file, 'YAML', error.reason || error.message);
      return null;
    }
  };
  const policy = readYaml(POLICY);
  const manifest = readYaml('squad.yaml');
  if (!policy || !manifest) return errors;
  for (const block of BLOCKS) {
    if (!isMap(policy[block]) || Object.keys(policy[block]).length === 0) {
      fail(POLICY, block, 'expected a nonempty policy mapping');
    }
  }
  if (errors.length) return errors;

  const patterns = policy.pattern_library;
  if (!isText(patterns.prefix) || !isMap(patterns.naming_convention) ||
      !isText(patterns.naming_convention.format) || !isText(patterns.naming_convention.example) ||
      !Array.isArray(patterns.categories) || !patterns.categories.length ||
      !patterns.categories.every(item => isMap(item) && isText(item.id) && isText(item.name) && isText(item.description)) ||
      !Array.isArray(patterns.patterns) || !patterns.patterns.every(isMap)) {
    fail(POLICY, 'pattern_library', 'expected naming convention, category specifications and a patterns array');
  }
  const workflow = policy.workflow_config;
  if (!isMap(workflow.checkpoint_modes) || !Object.keys(workflow.checkpoint_modes).length ||
      !Object.values(workflow.checkpoint_modes).every(isText) || !isText(workflow.checkpoint_policy) ||
      !Object.hasOwn(workflow.checkpoint_modes, workflow.checkpoint_policy) ||
      typeof workflow.fail_fast !== 'boolean' || typeof workflow.allow_manual_override !== 'boolean') {
    fail(POLICY, 'workflow_config', 'expected declared checkpoint mode and boolean fail_fast/allow_manual_override');
  }
  const settings = policy.settings;
  if (!isText(settings.greeting) || !isText(settings.language) ||
      !Number.isInteger(settings.max_context_files) || settings.max_context_files < 1) {
    fail(POLICY, 'settings', 'expected greeting, language and a positive integer max_context_files');
  }
  if (policy.task_standards.enforce_anatomy !== true || !isText(policy.task_standards.validator) ||
      !isTextList(policy.task_standards.optional_fields)) {
    fail(POLICY, 'task_standards', 'expected enforced anatomy, a symbolic validator id and optional field names');
  }

  const required = policy.task_standards.required_fields;
  if (!isTextList(required) || new Set(required).size !== required.length ||
      !REQUIRED_FIELDS.every(field => required.includes(field))) {
    fail(POLICY, 'task_standards.required_fields', `must include ${REQUIRED_FIELDS.join(', ')}`);
    return errors;
  }
  const categories = Object.keys(policy.executor_types);
  for (const category of ['human', 'agent', 'hybrid', 'worker']) {
    if (!isMap(policy.executor_types[category])) {
      fail(POLICY, `executor_types.${category}`, 'expected an executor specification');
    }
  }
  for (const [category, spec] of Object.entries(policy.executor_types)) {
    if (!/^[a-z][a-z0-9_-]*$/.test(category) || !isMap(spec) || !isText(spec.id) ||
        !isText(spec.name) || !isTextList(spec.use_for)) {
      fail(POLICY, `executor_types.${category}`, 'expected symbolic id, name and nonempty use_for string array');
    }
  }
  for (const [criterion, selection] of Object.entries(policy.executor_selection)) {
    const choices = Array.isArray(selection) ? selection : [selection];
    if (!choices.length || choices.some(choice => typeof choice !== 'string' ||
        !categories.includes(choice.trim().toLowerCase()))) {
      fail(POLICY, `executor_selection.${criterion}`, 'unknown or empty executor category');
    }
  }
  if (!isMap(manifest.agents) || !Object.keys(manifest.agents).length) {
    fail('squad.yaml', 'agents', 'expected a nonempty canonical roster');
    return errors;
  }
  const roster = manifest.agents;
  const declaredAgents = manifest.components?.agents;
  const agentsDir = path.join(squadPath, 'agents');
  if (fs.existsSync(agentsDir)) {
    for (const file of fs.readdirSync(agentsDir).filter(name => name.endsWith('.md'))) {
      if (!Object.hasOwn(roster, file.slice(0, -3))) {
        fail(`agents/${file}`, 'agent', 'on-disk direct entry is absent from canonical roster');
      }
    }
  }
  const tiers = new Map();
  for (const [tier, entry] of Object.entries(policy.tier_system)) {
    if (!/^tier_\d+$/.test(tier) || !isMap(entry) || !isText(entry.name) || !Array.isArray(entry.agents) || !entry.agents.length) {
      fail(POLICY, `tier_system.${tier}`, 'expected tier_N with a nonempty agents array');
      continue;
    }
    for (const id of entry.agents) {
      if (typeof id !== 'string' || !Object.hasOwn(roster, id)) {
        fail(POLICY, `tier_system.${tier}`, `unknown agent ${String(id)}`);
      } else if (tiers.has(id)) {
        fail(POLICY, `tier_system.${tier}`, `duplicate agent ${id}`);
      } else {
        tiers.set(id, Number(tier.slice(5)));
      }
    }
  }
  for (const [id, entry] of Object.entries(roster)) {
    // Exact canonical paths exclude traversal and aliases to unrelated agents.
    if (!/^[a-z0-9-]+$/.test(id) || !isMap(entry) || entry.file !== `agents/${id}.md` || entry.id !== id) {
      fail('squad.yaml', `agents.${id}`, 'expected matching id and canonical agents/<id>.md file');
      continue;
    }
    if (!Array.isArray(declaredAgents) || !declaredAgents.includes(`${id}.md`)) {
      fail('squad.yaml', 'components.agents', `missing ${id}.md`);
    }
    const agent = readBlock(entry.file);
    if (!agent) continue;
    if (!tiers.has(id) || tiers.get(id) !== entry.tier || agent.agent?.tier !== entry.tier ||
        agent.agent?.id !== id || (agent.metadata?.tier !== undefined && agent.metadata.tier !== entry.tier)) {
      fail(entry.file, 'agent.tier', 'must agree with tier_system and canonical manifest id/tier');
    }
    if (!Array.isArray(agent.dependencies?.config) || !agent.dependencies.config.includes('brand-runtime.yaml')) {
      fail(entry.file, 'dependencies.config', 'must include brand-runtime.yaml for direct entry');
    }
    const instructions = agent['command-instructions'];
    if (!Array.isArray(instructions) || !instructions.every(item => typeof item === 'string') ||
        !instructions.some(item => item.includes(`squads/brand/${POLICY}`))) {
      fail(entry.file, 'command-instructions', `must require squads/brand/${POLICY} at command time`);
    }
    if (id === manifest.squad?.entry_agent) {
      const loader = agent.command_loader;
      if (!isMap(loader) || !Object.keys(loader).some(key => key.startsWith('*'))) {
        fail(entry.file, 'command_loader', 'missing chief work commands');
      } else {
        if (!Array.isArray(agent.commands) || !agent.commands.length) {
          fail(entry.file, 'commands', 'expected advertised chief commands');
        } else {
          for (const command of agent.commands) {
            if (!isMap(command) || !isText(command.name) || !Object.hasOwn(loader, `*${command.name}`)) {
              fail(entry.file, 'command_loader', `missing advertised command *${command?.name}`);
            }
          }
        }
        for (const [command, definition] of Object.entries(loader)) {
          if (!command.startsWith('*')) {
            fail(entry.file, 'command_loader', `invalid chief command key ${command}; expected * prefix`);
            continue;
          }
          if (['*help', '*exit', '*chat-mode'].includes(command)) continue;
          if (!Array.isArray(definition?.requires) || !definition.requires.includes(POLICY)) {
            fail(entry.file, `command_loader.${command}.requires`, `must include ${POLICY}`);
          }
        }
      }
    }
  }
  if (!Object.hasOwn(roster, manifest.squad?.entry_agent || '')) {
    fail('squad.yaml', 'squad.entry_agent', 'must resolve to the canonical roster');
  }
  if (Array.isArray(declaredAgents)) {
    for (const file of declaredAgents) {
      if (typeof file !== 'string' || !Object.hasOwn(roster, file.replace(/\.md$/, ''))) {
        fail('squad.yaml', 'components.agents', `not in canonical roster: ${String(file)}`);
      }
    }
  }
  for (const folder of ['tasks', 'workflows']) {
    const dir = path.join(squadPath, folder);
    if (!fs.existsSync(dir)) {
      fail(folder, 'directory', 'required Brand content missing');
      continue;
    }
    for (const name of fs.readdirSync(dir).filter(file => folder === 'tasks' ? file.endsWith('.md') : /\.ya?ml$/.test(file))) {
      const file = `${folder}/${name}`;
      const value = folder === 'tasks' ? readBlock(file, true) : readYaml(file);
      if (!value) continue;
      if (value.policy !== POLICY || typeof value.policy_instructions !== 'string' ||
          !value.policy_instructions.includes(`squads/brand/${POLICY}`)) {
        fail(file, 'policy', `must reference ${POLICY} with command-time instructions`);
      }
      if (folder !== 'tasks') continue;
      for (const field of required) {
        if (!Object.hasOwn(value, field) || !hasValue(value[field])) {
          fail(file, `task.${field}`, 'required field missing or empty');
        }
      }
      for (const field of ['task_name', 'status', 'responsible_executor', 'execution_type']) {
        if (!isText(value[field])) fail(file, `task.${field}`, 'expected a nonempty string');
      }
      for (const field of ['input', 'output', 'action_items', 'acceptance_criteria']) {
        if (!Array.isArray(value[field]) || !value[field].length ||
            value[field].some(item => !isText(item) && (!isMap(item) || !Object.keys(item).length))) {
          fail(file, `task.${field}`, 'expected a nonempty array of text or structured items');
        }
      }
      if (typeof value.execution_type !== 'string' || !categories.includes(value.execution_type.trim().toLowerCase())) {
        fail(file, 'task.execution_type', 'unknown executor category');
      }
      if (typeof value.responsible_executor !== 'string' || !Object.hasOwn(roster, value.responsible_executor)) {
        fail(file, 'task.responsible_executor', 'must name a canonical Brand agent with an existing file');
      }
    }
  }
  return errors;
}

module.exports = { validateBrandPolicy };
