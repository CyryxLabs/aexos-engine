#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  syncGrok,
  AGENT_PROFILES,
  WORKFLOW_SKILLS,
  DEVELOPMENT_WORKFLOW_SKILLS,
  SHORT_WORKFLOW_ALIASES,
  SHORT_AGENT_ALIASES,
  getSkillId,
  grokSkillIdFromDevSkill,
  serializeManagedRuleSections,
  serializeManagedConfig,
  MANAGED_MANIFEST_FILENAME,
  MANAGED_MANIFEST_GENERATOR,
  GROK_HOOK_SOURCE_FILES,
} = require('./index');

function sha256(content) { return crypto.createHash('sha256').update(content).digest('hex'); }
function read(filePath) { return fs.readFileSync(filePath, 'utf8'); }
function exists(filePath) { return fs.existsSync(filePath); }
function frontmatterName(content, name) {
  return new RegExp(`^name:\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm').test(content);
}

function manifest(projectRoot, grokRoot, errors) {
  const filePath = path.join(grokRoot, MANAGED_MANIFEST_FILENAME);
  if (!exists(filePath)) { errors.push(`Missing managed manifest: .grok/${MANAGED_MANIFEST_FILENAME}`); return null; }
  let value;
  try { value = JSON.parse(read(filePath)); } catch (error) {
    errors.push(`Invalid managed manifest JSON: ${error.message}`); return null;
  }
  if (value.schemaVersion !== 1 || value.generatedBy !== MANAGED_MANIFEST_GENERATOR || !Array.isArray(value.files)) {
    errors.push('Unrecognized managed manifest contract'); return null;
  }
  for (const entry of value.files) {
    const target = path.resolve(grokRoot, entry.path || '');
    const relative = path.relative(path.resolve(grokRoot), target);
    if (!entry.path || relative.startsWith('..') || path.isAbsolute(relative)) {
      errors.push(`Managed manifest path escapes .grok: ${entry.path}`); continue;
    }
    if (!exists(target)) { errors.push(`Managed file missing: ${entry.path}`); continue; }
    try {
      const actual = entry.mode === 'managed-sections'
        ? sha256(serializeManagedRuleSections(read(target)))
        : entry.mode === 'managed-config' ? sha256(serializeManagedConfig(read(target))) : sha256(fs.readFileSync(target));
      if (actual !== entry.sha256) errors.push(`Managed content drift: ${entry.path}`);
    } catch (error) {
      errors.push(`Invalid managed content ${entry.path}: ${error.message}`);
    }
  }
  return value;
}

function validateDeterministicProjection(projectRoot, grokRoot, errors) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aexos-grok-validate-'));
  try {
    const tempGrok = path.join(tempRoot, '.grok');
    syncGrok({ projectRoot, grokRoot: tempGrok, quiet: true });
    const expected = JSON.parse(read(path.join(tempGrok, MANAGED_MANIFEST_FILENAME)));
    const actual = manifest(projectRoot, grokRoot, errors);
    if (!actual) return;
    const expectedByPath = new Map(expected.files.map((entry) => [entry.path, entry]));
    const actualByPath = new Map(actual.files.map((entry) => [entry.path, entry]));
    for (const entry of expected.files) {
      const found = actualByPath.get(entry.path);
      if (!found) errors.push(`Managed manifest missing expected path: ${entry.path}`);
      else if (found.sha256 !== entry.sha256 || found.mode !== entry.mode) errors.push(`Managed manifest drift: ${entry.path}`);
    }
    for (const entry of actual.files) {
      if (!expectedByPath.has(entry.path)) errors.push(`Stale managed Grok artifact: ${entry.path}`);
    }
  } catch (error) {
    errors.push(`Deterministic Grok validation failed: ${error.message}`);
  } finally { fs.rmSync(tempRoot, { recursive: true, force: true }); }
}

function collectSkillNames(root) {
  const names = new Map();
  if (!exists(root)) return names;
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && entry.name === 'SKILL.md') {
        const match = read(absolute).match(/^name:\s*([^\s]+)\s*$/m);
        if (match) names.set(match[1], absolute);
      }
    }
  };
  visit(root);
  return names;
}

function runtimeDiagnostics(projectRoot, grokRoot) {
  const diagnostics = [];
  const grokSkills = collectSkillNames(path.join(grokRoot, 'skills'));
  const universalSkills = collectSkillNames(path.join(projectRoot, '.agents', 'skills'));
  const collisions = [...grokSkills.keys()].filter((name) => universalSkills.has(name)).sort();
  if (collisions.length > 0) {
    diagnostics.push(
      `Grok runtime skill collision (${collisions.length}): ${collisions.join(', ')}. ` +
      'Configure user-global skills.ignore if Grok does not deduplicate the external .agents tree.',
    );
  }
  const claudeSettings = path.join(projectRoot, '.claude', 'settings.local.json');
  if (
    exists(claudeSettings) &&
    read(claudeSettings).includes('enforce-git-push-authority.cjs') &&
    exists(path.join(grokRoot, 'hooks', 'git-push-authority.json'))
  ) {
    diagnostics.push(
      'Grok can discover native and Claude-compatible authority registrations; canonical commands permit deduplication.',
    );
  }
  return diagnostics;
}

function getDefaultOptions() {
  const projectRoot = process.cwd();
  return {
    projectRoot,
    grokRoot: path.join(projectRoot, '.grok'),
    strict: false,
    quiet: false,
    json: false,
  };
}

function validateHookRegistration(filePath, event, commandName, errors, matcher) {
  if (!exists(filePath)) return;
  try {
    const value = JSON.parse(read(filePath));
    const entries = value?.hooks?.[event];
    const blob = JSON.stringify(entries || []);
    if (!Array.isArray(entries) || !blob.includes(commandName)) {
      errors.push(`${path.basename(filePath)} does not register ${commandName} for ${event}`);
    }
    if (matcher && !matcher.some((value) => blob.includes(value))) {
      errors.push(`${path.basename(filePath)} matcher must cover ${matcher.join('/')}`);
    }
  } catch (error) {
    errors.push(`Invalid ${path.basename(filePath)}: ${error.message}`);
  }
}

function validateAuthorityHook(hookPath, errors) {
  const cases = [
    [{ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git push origin main' } }, 'dev', 2],
    [{ hookEventName: 'pre_tool_use', toolName: 'run_terminal_command', toolInput: { command: 'git push origin main' } }, 'dev', 2],
    [{ toolInput: { command: 'git push origin main' } }, 'devops', 0],
  ];
  for (const [input, agent, status] of cases) {
    const result = spawnSync(process.execPath, [hookPath], {
      input: JSON.stringify(input), encoding: 'utf8', timeout: 5000,
      env: { ...process.env, AEXOS_ACTIVE_AGENT: agent },
    });
    if (result.error || result.status !== status) errors.push(`Authority hook expected exit ${status} for ${agent}, got ${result.status}`);
    if (status === 2) {
      try {
        const output = JSON.parse((result.stdout || '').trim());
        if (output.decision !== 'deny' || output?.hookSpecificOutput?.permissionDecision !== 'deny') throw new Error('missing deny');
      } catch (_) { errors.push(`Authority hook emitted invalid deny payload for ${agent}`); }
    }
  }
}

function validateGrok(options = {}) {
  const resolved = { ...getDefaultOptions(), ...options };
  if (options.projectRoot && !options.grokRoot) resolved.grokRoot = path.join(options.projectRoot, '.grok');
  const projectRoot = path.resolve(resolved.projectRoot);
  const grokRoot = path.resolve(resolved.grokRoot);
  const errors = [];
  const warnings = [];
  const diagnostics = [];
  if (!exists(grokRoot)) return { ok: false, errors: [`Missing .grok root at ${grokRoot}`], warnings, diagnostics, counts: {} };

  for (const id of Object.keys(AGENT_PROFILES)) {
    const skillId = getSkillId(id);
    for (const [kind, target] of [
      ['agent', path.join(grokRoot, 'agents', `${skillId}.md`)],
      ['skill', path.join(grokRoot, 'skills', skillId, 'SKILL.md')],
      ['role', path.join(grokRoot, 'roles', `${skillId}.toml`)],
      ['persona', path.join(grokRoot, 'personas', `${skillId}.toml`)],
    ]) {
      if (!exists(target)) errors.push(`Missing ${kind} for ${skillId}`);
      else {
        const content = read(target);
        if ((kind === 'agent' || kind === 'skill') && !frontmatterName(content, skillId)) {
          errors.push(`${kind} ${skillId} has invalid name`);
        }
        if (kind === 'skill' && !content.includes(`.grok/agents/${skillId}.md`)) {
          errors.push(`skill ${skillId} does not load .grok/agents/${skillId}.md`);
        }
        if (kind === 'skill') {
          if (!/^user-invocable:\s*true\s*$/m.test(content)) {
            errors.push(`skill ${skillId} is not user-invocable`);
          }
          for (const bridge of ['.aexos/active-agent', '.aexos/active-agent.json', '.synapse/sessions/_active-agent.json']) {
            if (!content.includes(`> ${bridge}`)) errors.push(`skill ${skillId} missing identity bridge: ${bridge}`);
          }
        }
        if (kind === 'role' && !content.includes(`prompt_file = ".grok/agents/${skillId}.md"`)) {
          warnings.push(`role ${skillId} missing prompt_file to agent profile`);
        }
        if (kind === 'persona' && !content.includes('instructions')) {
          errors.push(`persona ${skillId} missing instructions`);
        }
      }
    }
  }
  for (const { name } of WORKFLOW_SKILLS) {
    const target = path.join(grokRoot, 'skills', name, 'SKILL.md');
    if (!exists(target)) errors.push(`Missing workflow skill: ${name}`);
    else {
      const content = read(target);
      if (!frontmatterName(content, name)) errors.push(`Workflow skill ${name} has invalid name`);
      if (!/^user-invocable:\s*true\s*$/m.test(content)) errors.push(`Workflow skill ${name} is not user-invocable`);
    }
  }
  for (const dirName of DEVELOPMENT_WORKFLOW_SKILLS) {
    const source = path.join(projectRoot, '.aexos-core', 'development', 'skills', dirName, 'SKILL.md');
    const skillId = grokSkillIdFromDevSkill(dirName);
    const target = path.join(grokRoot, 'skills', skillId, 'SKILL.md');
    if (!exists(source)) warnings.push(`Development skill source missing (skipped at sync): ${dirName}`);
    else if (!exists(target)) errors.push(`Missing development skill: ${dirName}`);
    else if (!frontmatterName(read(target), skillId)) errors.push(`Development skill ${skillId} has invalid name`);
  }
  for (const { name, target } of SHORT_WORKFLOW_ALIASES) {
    const alias = path.join(grokRoot, 'skills', name, 'SKILL.md');
    const targetFile = path.join(grokRoot, 'skills', target, 'SKILL.md');
    if (!exists(alias)) errors.push(`Missing short alias: ${name} → ${target}`);
    else {
      const content = read(alias);
      if (!frontmatterName(content, name)) errors.push(`Short alias ${name} has invalid name`);
      if (!exists(targetFile)) errors.push(`Short alias ${name} targets missing skill: ${target}`);
      if (!content.includes(`.grok/skills/${target}/SKILL.md`)) errors.push(`Invalid short alias: ${name} → ${target}`);
    }
  }
  for (const { alias, target } of SHORT_AGENT_ALIASES) {
    const filePath = path.join(grokRoot, 'agents', `${alias}.md`);
    const targetFile = path.join(grokRoot, 'agents', `${target}.md`);
    if (!exists(filePath)) errors.push(`Missing agent alias: ${alias} → ${target}`);
    else {
      const content = read(filePath);
      if (!frontmatterName(content, alias)) errors.push(`Agent alias ${alias} has invalid name`);
      if (!exists(targetFile)) errors.push(`Agent alias ${alias} targets missing agent: ${target}`);
      if (!content.includes(`.grok/agents/${target}.md`)) errors.push(`Invalid agent alias: ${alias} → ${target}`);
      for (const bridge of ['.aexos/active-agent', '.aexos/active-agent.json', '.synapse/sessions/_active-agent.json']) {
        if (!content.includes(`> ${bridge}`)) errors.push(`Agent alias ${alias} missing identity bridge: ${bridge}`);
      }
    }
  }
  for (const relative of [
    'config.toml', 'hooks/git-push-authority.json', 'hooks/synapse-prompt.json', 'hooks/precompact.json',
    ...GROK_HOOK_SOURCE_FILES.map((name) => `hooks/${name}`), 'rules/aexos-core.md', 'README.md', MANAGED_MANIFEST_FILENAME,
  ]) if (!exists(path.join(grokRoot, relative))) errors.push(`Missing Grok harness file: ${relative}`);

  const canonicalHookDir = path.join(projectRoot, '.aexos-core', 'infrastructure', 'templates', 'grok-hooks');
  for (const name of GROK_HOOK_SOURCE_FILES) {
    if (!exists(path.join(canonicalHookDir, name))) errors.push(`Missing canonical Grok hook: ${name}`);
  }

  validateHookRegistration(
    path.join(grokRoot, 'hooks', 'git-push-authority.json'),
    'PreToolUse',
    'enforce-git-push-authority.cjs',
    errors,
    ['Bash', 'run_terminal_command'],
  );
  validateHookRegistration(path.join(grokRoot, 'hooks', 'synapse-prompt.json'), 'UserPromptSubmit', 'synapse-wrapper.cjs', errors);
  validateHookRegistration(path.join(grokRoot, 'hooks', 'precompact.json'), 'PreCompact', 'precompact-wrapper.cjs', errors);

  const configPath = path.join(grokRoot, 'config.toml');
  if (exists(configPath) && !/git-push-authority|Native authority/.test(read(configPath))) {
    warnings.push('.grok/config.toml should document native authority hook');
  }

  const authority = path.join(grokRoot, 'hooks', 'enforce-git-push-authority.cjs');
  if (exists(authority)) validateAuthorityHook(authority, errors);
  validateDeterministicProjection(projectRoot, grokRoot, errors);
  diagnostics.push(...runtimeDiagnostics(projectRoot, grokRoot));
  return {
    ok: errors.length === 0 && (!resolved.strict || warnings.length === 0), errors, warnings, diagnostics,
    counts: { agents: Object.keys(AGENT_PROFILES).length, workflows: WORKFLOW_SKILLS.length, aliases: SHORT_WORKFLOW_ALIASES.length, agentAliases: SHORT_AGENT_ALIASES.length },
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = new Set(argv);
  return { strict: args.has('--strict'), quiet: args.has('--quiet') || args.has('-q'), json: args.has('--json') };
}

if (require.main === module) {
  const options = parseArgs();
  const result = validateGrok(options);
  if (options.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else if (!options.quiet) {
    for (const warning of result.warnings) console.warn(`⚠️  ${warning}`);
    for (const error of result.errors) console.error(`❌ ${error}`);
    console.log(result.ok ? '✅ Grok validation passed' : '❌ Grok validation failed');
  }
  process.exitCode = result.ok ? 0 : 1;
}

module.exports = { validateGrok, validateDeterministicProjection, parseArgs, getDefaultOptions };
