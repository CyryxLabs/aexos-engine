#!/usr/bin/env node
'use strict';

/**
 * Purpose: Generate optimized AEXOS agents, skills, roles, and personas for Grok Build TUI.
 *
 * Grok Skills/Agents Sync
 *
 * Generates optimized AEXOS agent definitions for Grok Build TUI:
 *   - .grok/agents/*.md           (native Grok agent profiles for session/subagent)
 *   - .grok/skills/aexos-<id>/     (slash skills that activate personas)
 *   - .grok/roles/*.toml          (subagent capability defaults)
 *   - .grok/personas/*.toml       (behavioral overlays)
 *   - .grok/rules/*.md            (compact always-on project rules)
 *
 * Design goals vs Codex dump:
 *   1. Token-efficient — condensed prompts, not full YAML agent copies
 *   2. Grok-native frontmatter (prompt_mode, permission_mode, agents_md)
 *   3. Rich skill descriptions for auto-invocation
 *   4. Source of truth remains .aexos-core/development/agents/
 *   5. Authority matrix enforced (devops-only push, story lifecycle, etc.)
 *
 * CLI: npm run sync:skills:grok
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Keep this generator usable in clean package/install smoke tests before
// third-party dependencies are installed.
fs.ensureDirSync = (dirPath) => fs.mkdirSync(dirPath, { recursive: true });
fs.removeSync = (targetPath) => fs.rmSync(targetPath, { recursive: true, force: true });

const {
  parseAllAgents,
  normalizeCommands,
  getVisibleCommands,
} = require('../ide-sync/agent-parser');

const MANAGED_MANIFEST_FILENAME = 'aexos-managed.json';
const MANAGED_MANIFEST_GENERATOR = 'aexos-grok-skills-sync';
const GROK_RULES_TEMPLATE = path.join(
  '.aexos-core',
  'product',
  'templates',
  'ide-rules',
  'grok-rules.md',
);
const GROK_HOOK_SOURCE_FILES = [
  'enforce-git-push-authority.cjs',
  'synapse-wrapper.cjs',
  'synapse-engine.cjs',
  'precompact-wrapper.cjs',
  'precompact-session-digest.cjs',
];

// ─── Agent profiles (Grok-optimized overlays) ───────────────────────────────

const AGENT_PROFILES = {
  'aexos-master': {
    skillName: 'aexos-master',
    permission_mode: 'default',
    capability_mode: 'all',
    reasoning_effort: 'high',
    roleLabel: 'Master Orchestrator',
    exclusive: ['framework governance', 'override agent boundaries when required'],
    blocked: [],
    loadAlways: [],
    workflow: [
      'Diagnose which specialized agent should own the work.',
      'Prefer delegating via spawn_subagent with the matching aexos-* type when tasks are isolated.',
      'Only execute tasks yourself when cross-domain or framework-level.',
      'Never invent requirements — trace to story/PRD/research.',
    ],
    triggers: [
      'orchestrate',
      'aexos-master',
      '@aexos-master',
      'framework governance',
      'create component',
      'modify agent',
      'run workflow',
    ],
  },
  analyst: {
    skillName: 'aexos-analyst',
    permission_mode: 'default',
    capability_mode: 'all',
    reasoning_effort: 'high',
    roleLabel: 'Business Analyst',
    exclusive: ['market research', 'competitive analysis', 'brainstorm facilitation'],
    blocked: ['git push', 'PR creation', 'architecture final decisions'],
    loadAlways: [],
    workflow: [
      'Clarify research question and success criteria first.',
      'Prefer primary sources; cite paths and external findings.',
      'Write research artifacts under docs/ when requested.',
      'Hand off insights to @pm / @architect — do not invent product scope.',
    ],
    triggers: [
      'market research',
      'competitive analysis',
      'brainstorm',
      'analyst',
      '@analyst',
      'feasibility',
      'project brief',
    ],
  },
  architect: {
    skillName: 'aexos-architect',
    permission_mode: 'default',
    capability_mode: 'all',
    reasoning_effort: 'high',
    roleLabel: 'System Architect',
    exclusive: ['system architecture', 'tech stack selection', 'API design authority'],
    blocked: ['git push', 'detailed DDL (delegate to data-engineer)', 'story implementation'],
    loadAlways: ['docs/framework/tech-stack.md', 'docs/framework/source-tree.md'],
    workflow: [
      'Explore existing architecture before proposing new structure.',
      'Prefer REUSE > ADAPT > CREATE (IDS).',
      'Document decisions with trade-offs; no invention beyond requirements.',
      'Delegate schema DDL to @data-engineer; UI polish to @ux-design-expert.',
    ],
    triggers: [
      'architecture',
      'architect',
      '@architect',
      'tech stack',
      'API design',
      'system design',
      'impact analysis',
      'ADR',
    ],
  },
  'data-engineer': {
    skillName: 'aexos-data-engineer',
    permission_mode: 'default',
    capability_mode: 'all',
    reasoning_effort: 'high',
    roleLabel: 'Database Architect',
    exclusive: ['schema design', 'migrations', 'RLS policies', 'query optimization'],
    blocked: ['git push', 'app business logic outside data layer', 'PR creation'],
    loadAlways: [],
    workflow: [
      'Inspect existing schema/migrations before writing new ones.',
      'Always consider RLS, indexes, and rollback safety.',
      'Keep migrations reversible when possible.',
      'Do not invent tables/columns not justified by story/PRD.',
    ],
    triggers: [
      'database',
      'migration',
      'RLS',
      'schema',
      'Supabase',
      'data-engineer',
      '@data-engineer',
      'query optimization',
    ],
  },
  dev: {
    skillName: 'aexos-dev',
    permission_mode: 'default',
    capability_mode: 'all',
    reasoning_effort: 'high',
    roleLabel: 'Full Stack Developer',
    exclusive: ['story implementation', 'local commits', 'tests for own code'],
    blocked: ['git push', 'gh pr create/merge', 'editing story AC/title/scope (PO owns)'],
    loadAlways: [
      'docs/framework/coding-standards.md',
      'docs/framework/tech-stack.md',
      'docs/framework/source-tree.md',
    ],
    workflow: [
      'Work from a Ready story under docs/framework/epics/ (framework OSS) or docs/stories/ (project L4) — never invent AC.',
      'Update only Dev Agent Record: checkboxes, File List, Debug Log, Change Log.',
      'Implement smallest correct change; follow absolute imports and coding standards.',
      'Run quality gates before done: npm run lint && npm run typecheck && npm test.',
      'Local git commit OK. NEVER git push — hand off to @devops.',
    ],
    triggers: [
      'implement',
      'develop',
      'code',
      'fix bug',
      'refactor',
      'dev',
      '@dev',
      'story development',
    ],
  },
  devops: {
    skillName: 'aexos-devops',
    permission_mode: 'default',
    capability_mode: 'all',
    reasoning_effort: 'high',
    roleLabel: 'DevOps & Git Master',
    exclusive: [
      'git push',
      'PR create/merge',
      'releases/tags',
      'CI/CD management',
      'MCP infrastructure admin',
    ],
    blocked: [],
    loadAlways: [],
    workflow: [
      'ALWAYS run pre-push quality gates before push: lint, typecheck, test.',
      'Only push when story QA gate allows (PASS/CONCERNS/WAIVED).',
      'Create PRs with conventional titles referencing story IDs.',
      'You are the ONLY agent allowed to push or open PRs.',
    ],
    triggers: [
      'git push',
      'create PR',
      'pull request',
      'release',
      'CI/CD',
      'devops',
      '@devops',
      'pre-push',
      'deploy',
    ],
  },
  pm: {
    skillName: 'aexos-pm',
    permission_mode: 'default',
    capability_mode: 'all',
    reasoning_effort: 'high',
    roleLabel: 'Product Manager',
    exclusive: ['PRDs', 'epics', 'execute-epic', 'product strategy', 'spec pipeline'],
    blocked: ['git push', 'implementing code', 'QA gate verdicts'],
    loadAlways: [],
    workflow: [
      'Every statement in PRD/spec must trace to FR/NFR/CON or research (No Invention).',
      'Prefer epic → stories via @sm; do not skip validation.',
      'For *execute-epic, maintain EPIC execution state files.',
      'Coordinate specialists; do not steal exclusive authorities.',
    ],
    triggers: [
      'PRD',
      'create epic',
      'execute-epic',
      'roadmap',
      'product strategy',
      'pm',
      '@pm',
      'requirements',
      'write-spec',
    ],
  },
  po: {
    skillName: 'aexos-po',
    permission_mode: 'default',
    capability_mode: 'all',
    reasoning_effort: 'high',
    roleLabel: 'Product Owner',
    exclusive: [
      'validate-story-draft',
      'story AC/title/scope edits',
      'backlog prioritization',
      'close-story coordination',
    ],
    blocked: ['git push', 'implementing code', 'creating stories from scratch (@sm drafts)'],
    loadAlways: [],
    workflow: [
      'Validate stories with the 10-point checklist; GO ≥7 or NO-GO with fixes.',
      'On GO: MUST set Status Draft → Ready and log Change Log.',
      'Own AC quality; reject vague criteria.',
      'Close stories only when DoD + QA allow.',
    ],
    triggers: [
      'validate story',
      'backlog',
      'acceptance criteria',
      'close story',
      'po',
      '@po',
      'prioritize',
      'story draft',
    ],
  },
  qa: {
    skillName: 'aexos-qa',
    permission_mode: 'default',
    capability_mode: 'all',
    reasoning_effort: 'high',
    roleLabel: 'Test Architect & Quality Guardian',
    exclusive: ['QA gate verdicts', 'qa-gate files', 'quality advisory decisions'],
    blocked: ['git push', 'implementing feature code (return to @dev)', 'changing story AC'],
    loadAlways: [],
    workflow: [
      'Review against story AC + 7 quality checks.',
      'Verdicts: PASS | CONCERNS | FAIL | WAIVED — write gate artifact under docs/qa/.',
      'Advisory but decisive: FAIL blocks merge path.',
      'Never self-approve code you wrote in the same session as implementer.',
    ],
    triggers: [
      'qa gate',
      'quality gate',
      'code review',
      'qa',
      '@qa',
      'test strategy',
      'security check',
      'nfr',
    ],
  },
  sm: {
    skillName: 'aexos-sm',
    permission_mode: 'default',
    capability_mode: 'all',
    reasoning_effort: 'high',
    roleLabel: 'Scrum Master',
    exclusive: ['draft / create-story', 'story template selection', 'sprint facilitation'],
    blocked: ['git push', 'implementing code', 'final GO on story validation (@po)'],
    loadAlways: [],
    workflow: [
      'Draft stories from epic/PRD using AEXOS story templates.',
      'Stories start as Draft; never mark Ready (PO validates).',
      'NEVER implement code — hand off to @dev after PO GO.',
      'Keep stories small, testable, and AC-driven (Given/When/Then preferred).',
    ],
    triggers: [
      'create story',
      'draft story',
      'sprint planning',
      'scrum',
      'sm',
      '@sm',
      'backlog grooming',
    ],
  },
  'squad-creator': {
    skillName: 'aexos-squad-creator',
    permission_mode: 'default',
    capability_mode: 'all',
    reasoning_effort: 'high',
    roleLabel: 'Squad Creator',
    exclusive: ['squad design/create/validate/publish structure'],
    blocked: ['git push'],
    loadAlways: [],
    workflow: [
      'Task-first architecture for all squads.',
      'Validate against JSON Schema and AEXOS standards before distribution.',
      'Integrate with squad-loader / squad-validator patterns.',
      'Prefer extending existing squads over duplicating agents/tasks.',
    ],
    triggers: [
      'create squad',
      'design squad',
      'validate squad',
      'squad-creator',
      '@squad-creator',
      'expansion pack',
      'task-first',
    ],
  },
  'ux-design-expert': {
    skillName: 'aexos-ux-design-expert',
    permission_mode: 'default',
    capability_mode: 'all',
    reasoning_effort: 'high',
    roleLabel: 'UX/UI Design Expert',
    exclusive: ['UX flows', 'wireframes', 'design system guidance', 'accessibility review'],
    blocked: ['git push', 'backend schema ownership', 'QA gate verdicts'],
    loadAlways: [],
    // Agent YAML uses map-style commands (not list) — parser may return empty
    starterCommands: [
      { name: 'help', description: 'Show all available commands with descriptions' },
      { name: 'research', description: 'User research and persona synthesis' },
      { name: 'wireframe', description: 'Create wireframes and interaction flows' },
      { name: 'generate-ui-prompt', description: 'Generate UI generation prompts' },
      { name: 'setup', description: 'Initialize design system structure' },
      { name: 'tokenize', description: 'Extract design tokens from patterns' },
      { name: 'build', description: 'Build design-system component' },
      { name: 'a11y-check', description: 'Accessibility review (WCAG)' },
      { name: 'document', description: 'Document design system / components' },
      { name: 'exit', description: 'Exit UX design expert mode' },
    ],
    workflow: [
      'Design from user goals; prefer existing design-system tokens/components.',
      'Document accessibility (WCAG) requirements with UI proposals.',
      'Do not invent product features — derive from story/PRD.',
      'Hand off build-ready specs to @dev.',
    ],
    triggers: [
      'UX',
      'UI design',
      'wireframe',
      'design system',
      'accessibility',
      'ux-design-expert',
      '@ux-design-expert',
      'component design',
    ],
  },
};

/**
 * Lean SDC + misc workflow skills under .aexos-core/development/skills/.
 * Synced to .grok/skills/aexos-<name>/ (name already aexos-* stays as-is).
 * SOT = those SKILL.md files — prefer editing them, not inline bodies here.
 */
const DEVELOPMENT_WORKFLOW_SKILLS = [
  'validate-story-draft',
  'develop-story',
  'review-story',
  'apply-qa-fixes',
  'close-story',
  'full-sdc',
  'wave-execute',
  'aexos-commit',
];

const WORKFLOW_SKILLS = [
  {
    name: 'aexos-sdc',
    description:
      'Run the AEXOS Story Development Cycle. Prefer /aexos-full-sdc (lean orchestrator). Slash: /aexos-sdc',
    body: `# AEXOS Story Development Cycle (SDC)

Primary development workflow. **Task-first.** Prefer the lean orchestrator skill:

\`.aexos-core/development/skills/full-sdc/SKILL.md\` → Grok: \`/aexos-full-sdc\`

## Phases

| Phase | Skill | Agent | Task SOT |
|-------|-------|-------|----------|
| 1 Create | (sm create) | @sm | \`create-next-story.md\` |
| 2 Validate | \`validate-story-draft\` | @po | \`validate-next-story.md\` → Ready on GO |
| 3 Develop | \`develop-story\` | @dev | \`dev-develop-story.md\` |
| 4 Review | \`review-story\` | @qa | \`qa-gate.md\` — approved → **Done** |
| 4b Fix | \`apply-qa-fixes\` | @dev | \`apply-qa-fixes.md\` (QG loop ≤3) |
| 5 Close | \`close-story\` | @po | \`po-close-story.md\` — administrative |
| 6 Push | @devops | @devops | pre-push + push/PR |

## Rules

1. Never skip Validate for non-trivial work.
2. @dev must not edit AC/title/scope.
3. Only @devops may \`git push\` / create PRs.
4. Only QA review sets Status Done; close-story never changes lifecycle status.
5. Quality gates: \`npm run lint && npm run typecheck && npm test\`.
6. Constitution: \`.aexos-core/constitution.md\`
7. No product harvest trees (ARCH-A denylist).
`,
  },
  {
    name: 'aexos-quality-gates',
    description:
      'Run AEXOS quality gates (lint, typecheck, test, pre-push). Use before commit/push, when checking work quality, or /aexos-quality-gates.',
    body: `# AEXOS Quality Gates

## Required local gates

\`\`\`bash
npm run lint
npm run typecheck
npm test
\`\`\`

Optional / pre-push:

\`\`\`bash
npm run build
# CodeRabbit when available (see coderabbit skill / WSL notes)
\`\`\`

## Agent rules

- @dev: run gates before marking story ready for review.
- @qa: gates are necessary but not sufficient — still do AC + architecture review.
- @devops: MUST run pre-push gate before any push/PR.

## Failures

Fix root cause. Do not use \`--no-verify\` or skip hooks to force green.
`,
  },
  {
    name: 'aexos-handoff',
    description:
      'Create an AEXOS agent handoff artifact when switching personas. Use on agent switch, handoff, or /aexos-handoff.',
    body: `# AEXOS Agent Handoff

When switching agents (\`/aexos-*\` skills), compact context into a handoff artifact.

## Write

Path: \`.aexos/handoffs/handoff-{from}-to-{to}-{timestamp}.yaml\`

\`\`\`yaml
handoff:
  from_agent: "{id}"
  to_agent: "{id}"
  story_context:
    story_id: ""
    story_path: ""
    story_status: ""
    current_task: ""
    branch: ""
  decisions: []
  files_modified: []
  blockers: []
  next_action: ""
\`\`\`

## Limits

- Max ~500 tokens, ≤5 decisions, ≤10 files, ≤3 blockers
- Discard previous agent full persona; keep only this artifact + new agent definition

Template: \`.aexos-core/development/templates/agent-handoff-tmpl.yaml\`
`,
  },
];

function grokSkillIdFromDevSkill(dirName) {
  return dirName.startsWith('aexos-') ? dirName : `aexos-${dirName}`;
}

/**
 * Copy lean SDC skills from development/skills → .grok/skills/aexos-*
 * Rewrites frontmatter name to the Grok skill id when needed.
 */
function syncDevelopmentWorkflowSkills(repoRoot, targets, options = {}) {
  const written = [];
  const skillsRoot = path.join(repoRoot, '.aexos-core', 'development', 'skills');
  for (const dirName of DEVELOPMENT_WORKFLOW_SKILLS) {
    const src = path.join(skillsRoot, dirName, 'SKILL.md');
    if (!fs.existsSync(src)) {
      if (!options.quiet) {
        console.warn(`⚠️  Missing development skill ${dirName} — skipped`);
      }
      continue;
    }
    const skillId = grokSkillIdFromDevSkill(dirName);
    if (!SAFE_SKILL_ID_RE.test(skillId)) {
      if (!options.quiet) {
        console.warn(`⚠️  Invalid skill id ${JSON.stringify(skillId)} — skipped`);
      }
      continue;
    }
    let content = fs.readFileSync(src, 'utf8');
    // Ensure Grok-facing name matches directory skill id
    content = content.replace(/^name:\s*.+$/m, `name: ${skillId}`);
    if (!content.includes('metadata:')) {
      content = content.replace(
        /^---\n/,
        `---\nmetadata:\n  short-description: ${yamlDoubleQuoted(`AEXOS workflow: ${skillId}`)}\n`,
      );
    }
    const dest = resolveUnder(targets.skills, skillId, 'SKILL.md');
    if (!options.dryRun) {
      fs.ensureDirSync(path.dirname(dest));
      fs.writeFileSync(dest, content, 'utf8');
    }
    written.push(dest);
  }
  return written;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function trimText(text, max = 220) {
  const normalized = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 3).trim()}...`;
}

/** Safe skill/agent id: lowercase alnum + hyphens only (path-safe). */
const SAFE_SKILL_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function getSkillId(agentId) {
  const id = String(agentId || '').trim();
  const skillId = id.startsWith('aexos-') ? id : `aexos-${id}`;
  if (!SAFE_SKILL_ID_RE.test(skillId)) {
    throw new Error(
      `Invalid agent id for Grok skill path: ${JSON.stringify(agentId)} → ${JSON.stringify(skillId)}`,
    );
  }
  return skillId;
}

/** Escape a value for YAML double-quoted scalars. */
function yamlDoubleQuoted(value) {
  return `"${String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')}"`;
}

/** Escape a value for TOML basic strings ("..."). */
function tomlBasicString(value) {
  return `"${String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')}"`;
}

/**
 * Flatten text for YAML folded (`>`) blocks — no raw newlines that would break structure.
 */
function yamlFoldedSafe(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

/**
 * Resolve path under baseDir; reject traversal outside the tree.
 * @param {string} baseDir
 * @param {...string} segments
 * @returns {string} absolute path contained under baseDir
 */
function resolveUnder(baseDir, ...segments) {
  const baseResolved = path.resolve(baseDir);
  const target = path.resolve(baseDir, ...segments);
  const rel = path.relative(baseResolved, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(
      `Refusing write outside Grok output tree: ${target} (base ${baseResolved})`,
    );
  }
  return target;
}

function isPathInside(baseDir, targetPath) {
  const rel = path.relative(path.resolve(baseDir), path.resolve(targetPath));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function getDefaultOptions() {
  const projectRoot = process.cwd();
  return {
    projectRoot,
    sourceDir: path.join(projectRoot, '.aexos-core', 'development', 'agents'),
    grokRoot: path.join(projectRoot, '.grok'),
    dryRun: false,
    quiet: false,
  };
}

function resolveOptions(options = {}) {
  const defaults = getDefaultOptions();
  const resolved = { ...defaults, ...options };
  if (options.projectRoot && !options.sourceDir) {
    resolved.sourceDir = path.join(options.projectRoot, '.aexos-core', 'development', 'agents');
  }
  if (options.projectRoot && !options.grokRoot) {
    resolved.grokRoot = path.join(options.projectRoot, '.grok');
  }
  return resolved;
}

function pickCommands(agentData, profile = {}) {
  const all = normalizeCommands(agentData.commands || []);
  const quick = getVisibleCommands(all, 'quick');
  const key = getVisibleCommands(all, 'key');
  const full = getVisibleCommands(all, 'full');
  const merged = [];
  for (const list of [key, quick, full]) {
    for (const c of list) {
      if (!merged.some((m) => m.name === c.name)) merged.push(c);
    }
  }
  if (merged.length === 0 && all.length > 0) {
    return all.slice(0, 10);
  }
  if (merged.length === 0 && Array.isArray(profile.starterCommands)) {
    return profile.starterCommands.slice(0, 10);
  }
  return merged.slice(0, 10);
}

function greetingBits(agentData) {
  const pp = agentData.persona_profile || {};
  const comm = pp.communication || {};
  const levels = comm.greeting_levels || {};
  return {
    greeting: levels.archetypal || levels.named || levels.minimal || `${agentData.id} ready`,
    closing: comm.signature_closing || `— ${agentData.agent?.name || agentData.id}`,
    tone: comm.tone || 'professional',
  };
}

// ─── Builders ───────────────────────────────────────────────────────────────

function buildAgentMarkdown(agentData, profile) {
  const agent = agentData.agent || {};
  const persona = agentData.persona || {};
  const cmds = pickCommands(agentData, profile);
  const { greeting, closing, tone } = greetingBits(agentData);
  const whenToUse = trimText(
    agent.whenToUse || profile.triggers.join(', '),
    280,
  );
  const skillId = getSkillId(agentData.id);
  const icon = agent.icon || '🤖';
  const name = agent.name || agentData.id;
  const title = agent.title || profile.roleLabel;

  const cmdList = cmds
    .map((c) => `- \`*${c.name}\` — ${c.description || 'No description'}`)
    .join('\n');

  const exclusive = profile.exclusive.map((e) => `- ${e}`).join('\n') || '- (see constitution)';
  const blocked =
    profile.blocked.map((b) => `- ${b}`).join('\n') || '- (none beyond constitution)';
  const workflow = profile.workflow.map((w, i) => `${i + 1}. ${w}`).join('\n');
  const loadAlways =
    profile.loadAlways.length > 0
      ? profile.loadAlways.map((f) => `- \`${f}\``).join('\n')
      : '- (none required at activation)';

  const descriptionBody = yamlFoldedSafe(
    `${icon} ${title} (${name}). ${whenToUse} Activate with /${skillId} or spawn_subagent subagent_type="${skillId}".`,
  );

  return `---
name: ${skillId}
description: >
  ${descriptionBody}
prompt_mode: full
model: inherit
permission_mode: ${profile.permission_mode}
agents_md: true
---

# ${icon} ${name} — ${title}

You are **${name}**, AEXOS ${profile.roleLabel}. Tone: ${tone}.

## Activation

On user activation (skill \`/${skillId}\` or explicit request):

1. **Register active agent** for authority hooks:
   \`\`\`bash
   mkdir -p .aexos .synapse/sessions
   printf '%s\\n' '${agentData.id}' > .aexos/active-agent
   printf '%s\\n' '{"id":"${agentData.id}","source":"grok-agent"}' > .aexos/active-agent.json
   printf '%s\\n' '{"id":"${agentData.id}","source":"grok-agent"}' > .synapse/sessions/_active-agent.json
   export AEXOS_ACTIVE_AGENT=${agentData.id}
   \`\`\`
2. Read source of truth if deep task execution is needed: \`.aexos-core/development/agents/${agentData.filename}\`
3. Greet briefly:
   - ${greeting}
   - **Role:** ${persona.role || title}
   - List 4–6 starter commands below
   - ${closing}
4. HALT for user direction unless a command was already given.

Optional greeting script:
\`\`\`bash
node .aexos-core/development/scripts/generate-greeting.js ${agentData.id}
\`\`\`

## Mission

${whenToUse}
${persona.style ? `\n**Style:** ${persona.style}` : ''}${persona.focus ? `\n**Focus:** ${persona.focus}` : ''}

## Exclusive authority

${exclusive}

## Blocked / must delegate

${blocked}

## Operating workflow

${workflow}

## Load when implementing

${loadAlways}

## Starter commands (\`*\` prefix)

${cmdList || '- `*help` — list commands from source agent file'}

For full command list and task bindings, load the source agent file and run the referenced task under \`.aexos-core/development/tasks/\`.

## Non-negotiables (Constitution)

1. **CLI First** — features work via CLI before UI.
2. **Agent Authority** — never steal another agent's exclusive ops (especially git push → @devops only).
3. **Story-Driven** — implementation tracks a story in \`docs/framework/epics/\` (framework) or \`docs/stories/\` (project L4).
4. **No Invention** — no requirements not in story/PRD/research.
5. **Quality First** — lint, typecheck, tests before done/push.
6. **Task-first** — when a task file is selected, follow it exactly (including elicit=true).

Constitution: \`.aexos-core/constitution.md\`

## Tooling notes (Grok)

- Prefer \${{ tools.by_kind.read }} / search / list over shell for file ops.
- Use shell for git, npm, and project scripts.
- Dependencies map: \`.aexos-core/development/{tasks|templates|checklists|workflows}/...\`
- Stay in character until user exits or switches agent (\`/aexos-*\` or \`*exit\`).
`;
}

function buildSkillMarkdown(agentData, profile) {
  const agent = agentData.agent || {};
  const cmds = pickCommands(agentData, profile).slice(0, 8);
  const skillId = getSkillId(agentData.id);
  const name = agent.name || agentData.id;
  const title = agent.title || profile.roleLabel;
  const whenToUse = trimText(agent.whenToUse || profile.roleLabel, 200);
  const triggers = profile.triggers.join(', ');
  const cmdList = cmds
    .map((c) => `- \`*${c.name}\` — ${c.description || ''}`)
    .join('\n');

  const description = trimText(
    `${title} (${name}). ${whenToUse} Triggers: ${triggers}. Use when the user runs /${skillId} or @${agentData.id}.`,
    320,
  );

  const shortDescription = `${agent.icon || '🤖'} ${title}`;
  const sourcePath = `.aexos-core/development/agents/${agentData.filename}`;

  return `---
name: ${skillId}
description: >
  ${yamlFoldedSafe(description)}
when-to-use: >
  ${yamlFoldedSafe(triggers)}
user-invocable: true
metadata:
  short-description: ${yamlDoubleQuoted(shortDescription)}
  aexos-agent-id: ${yamlDoubleQuoted(agentData.id)}
  aexos-source: ${yamlDoubleQuoted(sourcePath)}
---

# Activate AEXOS ${title}

## Protocol

1. **Register active agent** before authority-sensitive commands:
   \`\`\`bash
   mkdir -p .aexos .synapse/sessions
   printf '%s\\n' '${agentData.id}' > .aexos/active-agent
   printf '%s\\n' '{"id":"${agentData.id}","source":"grok-skill"}' > .aexos/active-agent.json
   printf '%s\\n' '{"id":"${agentData.id}","source":"grok-skill"}' > .synapse/sessions/_active-agent.json
   export AEXOS_ACTIVE_AGENT=${agentData.id}
   \`\`\`
2. **Load persona** from \`.grok/agents/${skillId}.md\` (session agent profile).
3. **Source of truth** for full commands/tasks: \`.aexos-core/development/agents/${agentData.filename}\`
   - Fallback only if missing: \`.codex/agents/${agentData.filename}\`
4. **Adopt** persona, authorities, and blocked operations from the agent profile.
5. **Greet** (compact):
   - Name/title/icon
   - Role one-liner
   - 4–6 starter commands
   - Optional: \`node .aexos-core/development/scripts/generate-greeting.js ${agentData.id}\`
6. If switching from another AEXOS agent, write a handoff via skill \`/aexos-handoff\`.
7. **Stay in persona** until \`*exit\` or another \`/aexos-*\` skill.

## Starter commands

${cmdList || '- `*help` — show commands from source agent'}

## Authority snapshot

**Exclusive:**
${profile.exclusive.map((e) => `- ${e}`).join('\n') || '- (see agent profile)'}

**Blocked:**
${profile.blocked.map((b) => `- ${b}`).join('\n') || '- (none beyond constitution)'}

## Non-negotiables

- Constitution: \`.aexos-core/constitution.md\`
- Task files under \`.aexos-core/development/tasks/\` are executable workflows — follow exactly when invoked.
- No invention of requirements outside story/PRD/research.
- Only \`/aexos-devops\` may push or open PRs.
`;
}

function buildRoleToml(agentData, profile) {
  const skillId = getSkillId(agentData.id);
  const agent = agentData.agent || {};
  const title = agent.title || profile.roleLabel;
  const description = `${title} (${agent.name || agentData.id})`;
  return `# AEXOS ${skillId} — subagent role defaults
description = ${tomlBasicString(description)}
default_capability_mode = ${tomlBasicString(profile.capability_mode)}
reasoning_effort = ${tomlBasicString(profile.reasoning_effort)}
default_fork_context = true
prompt_file = ${tomlBasicString(`.grok/agents/${skillId}.md`)}
`;
}

function buildPersonaToml(agentData, profile) {
  const skillId = getSkillId(agentData.id);
  const agent = agentData.agent || {};
  const name = agent.name || agentData.id;
  const title = agent.title || profile.roleLabel;
  const whenToUse = trimText(agent.whenToUse || profile.roleLabel, 180);
  // TOML multiline string — use """ with real newlines
  const instructionsBlock = [
    `You are ${name}, AEXOS ${title}.`,
    whenToUse,
    '',
    'Exclusive authority:',
    ...profile.exclusive.map((e) => `- ${e}`),
    '',
    'Blocked / delegate:',
    ...(profile.blocked.length
      ? profile.blocked.map((b) => `- ${b}`)
      : ['- Follow constitution only']),
    '',
    'Workflow:',
    ...profile.workflow.map((w, i) => `${i + 1}. ${w}`),
    '',
    `Load deep definition from .aexos-core/development/agents/${agentData.filename} when executing formal tasks.`,
    'Never git push unless you are aexos-devops.',
    'No invention of requirements. Quality gates before done.',
  ].join('\n');

  // Escape """ sequences inside multiline TOML strings
  const safeInstructions = instructionsBlock.replace(/"""/g, "''\"");

  return `# AEXOS persona: ${skillId}
description = ${tomlBasicString(`${title} — ${trimText(whenToUse, 100)}`)}
instructions = """
${safeInstructions}
"""

default_fork_context = true
default_capability_mode = ${tomlBasicString(profile.capability_mode)}
reasoning_effort = ${tomlBasicString(profile.reasoning_effort)}
`;
}

function getManagedRuleSections(content) {
  const sections = new Map();
  const pattern = /<!-- AEXOS-MANAGED-START:\s*([a-z0-9-]+)\s*-->[\s\S]*?<!-- AEXOS-MANAGED-END:\s*\1\s*-->/gi;
  for (const match of String(content || '').matchAll(pattern)) sections.set(match[1], match[0]);
  return sections;
}

function mergeGrokRules(existingContent, generatedContent) {
  const generated = getManagedRuleSections(generatedContent);
  if (generated.size === 0) throw new Error('Canonical Grok rules template has no AEXOS-MANAGED sections');
  if (!existingContent) return generatedContent;
  const existing = getManagedRuleSections(existingContent);
  let merged = existingContent;
  for (const [name, section] of generated) {
    if (existing.has(name)) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      merged = merged.replace(
        new RegExp(`<!-- AEXOS-MANAGED-START:\\s*${escaped}\\s*-->[\\s\\S]*?<!-- AEXOS-MANAGED-END:\\s*${escaped}\\s*-->`, 'i'),
        section,
      );
    } else {
      merged = `${merged.trimEnd()}\n\n${section}\n`;
    }
  }
  return merged;
}

function buildRulesMarkdown(projectRoot = process.cwd()) {
  const template = path.join(projectRoot, GROK_RULES_TEMPLATE);
  if (!fs.existsSync(template)) {
    throw new Error(`Canonical Grok rules template not found: ${template}`);
  }
  const content = fs.readFileSync(template, 'utf8');
  if (getManagedRuleSections(content).size === 0) {
    throw new Error(`Canonical Grok rules template has no AEXOS-MANAGED sections: ${template}`);
  }
  return content;
}

function serializeManagedRuleSections(content) {
  return [...getManagedRuleSections(content).entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, block]) => `${name}\0${block}`)
    .join('\0');
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function normalizeManagedPath(grokRoot, filePath) {
  if (!isPathInside(grokRoot, filePath)) throw new Error(`Managed path escapes .grok: ${filePath}`);
  return path.relative(grokRoot, filePath).split(path.sep).join('/');
}

function buildManagedManifest(grokRoot, written) {
  const files = [...new Set(written)]
    .filter((filePath) => path.basename(filePath) !== MANAGED_MANIFEST_FILENAME)
    .map((filePath) => {
      const relativePath = normalizeManagedPath(grokRoot, filePath);
      const content = fs.readFileSync(filePath);
      return {
        path: relativePath,
        mode: relativePath === 'rules/aexos-core.md' ? 'managed-sections' : relativePath === 'config.toml' ? 'managed-config' : 'full',
        sha256: relativePath === 'rules/aexos-core.md'
          ? sha256(serializeManagedRuleSections(content.toString('utf8')))
          : relativePath === 'config.toml' ? sha256(serializeManagedConfig(content.toString('utf8'))) : sha256(content),
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
  return { schemaVersion: 1, generatedBy: MANAGED_MANIFEST_GENERATOR, files };
}

function readManagedManifest(manifestPath, options = {}) {
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (
      manifest?.schemaVersion !== 1 ||
      manifest?.generatedBy !== MANAGED_MANIFEST_GENERATOR ||
      !Array.isArray(manifest?.files)
    ) return null;
    return manifest;
  } catch (error) {
    if (!options.quiet) console.warn(`⚠️  Corrupt Grok managed manifest (rebuilding): ${error.message}`);
    return null;
  }
}

function removeStaleManagedFiles(grokRoot, previousManifest, currentManifest, preserved = []) {
  if (!previousManifest) return [];
  const current = new Set(currentManifest.files.map(({ path: filePath }) => filePath));
  const removed = [];
  for (const entry of previousManifest.files) {
    if (!entry?.path || current.has(entry.path)) continue;
    const target = path.resolve(grokRoot, entry.path);
    if (!isPathInside(grokRoot, target) || !fs.existsSync(target)) continue;
    const stat = fs.lstatSync(target);
    // Retirement never removes custom edits, partial ownership, or link targets.
    if (!stat.isFile() || stat.isSymbolicLink() || entry.mode !== 'full'
      || !isPathInside(fs.realpathSync(grokRoot), fs.realpathSync(target))
      || sha256(fs.readFileSync(target)) !== entry.sha256) {
      preserved.push(target);
      continue;
    }
    fs.unlinkSync(target);
    removed.push(target);
    let parent = path.dirname(target);
    while (isPathInside(grokRoot, parent) && parent !== path.resolve(grokRoot)) {
      if (fs.readdirSync(parent).length > 0) break;
      fs.rmdirSync(parent);
      parent = path.dirname(parent);
    }
  }
  return removed;
}

function buildReadme() {
  return `# AEXOS Grok Integration

Optimized agents, skills, roles, personas, hooks, and project config for [Grok Build TUI](https://grok.x.ai).

## Layout

| Path | Purpose |
|------|---------|
| \`agents/\` | Native Grok agent profiles (session + spawnable types) |
| \`skills/aexos-*/\` | Slash skills to activate personas |
| \`skills/aexos-sdc/\`, \`aexos-full-sdc/\`, atomics | Workflow skills (lean SDC + gates + handoff) |
| \`roles/\` | Subagent capability defaults |
| \`personas/\` | Behavioral overlays for subagents |
| \`rules/\` | Always-on compact AEXOS rules |
| \`hooks/\` | Native authority, SYNAPSE, and precompact hooks |
| \`config.toml\` | Project harness notes |
| \`aexos-managed.json\` | Managed ownership and deterministic hashes |

## Authority and identity

Activation writes the active agent to \`.aexos/active-agent\`,
\`.aexos/active-agent.json\`, and \`.synapse/sessions/_active-agent.json\`, and
exports \`AEXOS_ACTIVE_AGENT\`. The native authority hook remains the final
enforcement boundary for remote Git operations.

## Activate an agent

\`\`\`text
/aexos-dev
/aexos-qa
/aexos-devops
/aexos-squad-creator
\`\`\`

Short aliases such as \`/dev\`, \`/qa\`, and \`/devops\` load the corresponding
\`aexos-*\` agent and establish the same identity bridge.

## Hooks

- \`.grok/hooks/git-push-authority.json\` — native remote-operation authority
- \`.grok/hooks/synapse-prompt.json\` — prompt/session context
- \`.grok/hooks/precompact.json\` — precompact session digest

Native and Claude-compatible registrations share canonical commands so Grok
can deduplicate discovery rather than execute the same hook twice.

Or ask in natural language ("implement this story", "create a PR") — skill descriptions drive auto-invocation.

## Regenerate

From repo root:

\`\`\`bash
npm run sync:skills:grok
npm run validate:skills:grok
# or
node .aexos-core/infrastructure/scripts/grok-skills-sync/index.js
\`\`\`

Dry-run:

\`\`\`bash
npm run sync:skills:grok -- --dry-run
\`\`\`

## Design principles

1. **Token-efficient** — condensed profiles; full YAML stays in \`.aexos-core/development/agents/\`
2. **Authority-safe** — devops-only push; story lifecycle ownership
3. **Task-first** — formal work loads \`.aexos-core/development/tasks/*\`
4. **Grok-native** — frontmatter \`permission_mode\`, roles, personas
5. **Brownfield-safe** — only AEXOS-managed rule sections are replaced

## Related

- Codex skills: \`npm run sync:skills:codex\`
- IDE sync: \`npm run sync:ide\`
- Constitution: \`.aexos-core/constitution.md\`
`;
}

const SHORT_WORKFLOW_ALIASES = [
  ['develop-story', 'aexos-develop-story'],
  ['validate-story-draft', 'aexos-validate-story-draft'],
  ['review-story', 'aexos-review-story'],
  ['apply-qa-fixes', 'aexos-apply-qa-fixes'],
  ['close-story', 'aexos-close-story'],
  ['full-sdc', 'aexos-full-sdc'],
  ['wave-execute', 'aexos-wave-execute'],
  ['commit', 'aexos-commit'],
].map(([name, target]) => ({ name, target }));

const SHORT_AGENT_ALIASES = [
  ['dev', 'aexos-dev', 'dev'],
  ['qa', 'aexos-qa', 'qa'],
  ['po', 'aexos-po', 'po'],
  ['pm', 'aexos-pm', 'pm'],
  ['sm', 'aexos-sm', 'sm'],
  ['devops', 'aexos-devops', 'devops'],
  ['architect', 'aexos-architect', 'architect'],
  ['analyst', 'aexos-analyst', 'analyst'],
  ['data-engineer', 'aexos-data-engineer', 'data-engineer'],
  ['squad-creator', 'aexos-squad-creator', 'squad-creator'],
  ['ux-design-expert', 'aexos-ux-design-expert', 'ux-design-expert'],
  ['aexos-ux', 'aexos-ux-design-expert', 'ux-design-expert'],
  ['master', 'aexos-master', 'aexos-master'],
].map(([alias, target, agentId]) => ({ alias, target, agentId }));

function buildShortAliasSkill(name, target) {
  return `---
name: ${name}
description: Alias for /${target}. Use when the user runs /${name}.
user-invocable: true
metadata:
  short-description: ${yamlDoubleQuoted(`Alias → /${target}`)}
  aexos-alias-of: ${yamlDoubleQuoted(target)}
---

# ${name} (alias)

Load and follow \`.grok/skills/${target}/SKILL.md\` exactly. If it is missing, run
\`npm run sync:skills:grok\`. Do not create a parallel workflow.
`;
}

function syncShortWorkflowAliases(targets, options = {}) {
  const written = [];
  for (const { name, target } of SHORT_WORKFLOW_ALIASES) {
    if (options.availableTargets && !options.availableTargets.has(target)) continue;
    const destination = resolveUnder(targets.skills, name, 'SKILL.md');
    if (!options.dryRun) {
      fs.ensureDirSync(path.dirname(destination));
      fs.writeFileSync(destination, buildShortAliasSkill(name, target), 'utf8');
    }
    written.push(destination);
  }
  return written;
}

function buildShortAgentAliasMarkdown(alias, target, agentId) {
  return `---
name: ${alias}
description: Alias for ${target}. Spawn with subagent_type="${alias}" or use /${target}.
prompt_mode: full
model: inherit
permission_mode: default
agents_md: true
---

# Alias → \`${target}\`

1. Load and follow \`.grok/agents/${target}.md\`.
2. Register active agent id \`${agentId}\`:
   \`\`\`bash
   mkdir -p .aexos .synapse/sessions
   printf '%s\\n' '${agentId}' > .aexos/active-agent
   printf '%s\\n' '{"id":"${agentId}","source":"grok-alias"}' > .aexos/active-agent.json
   printf '%s\\n' '{"id":"${agentId}","source":"grok-alias"}' > .synapse/sessions/_active-agent.json
   export AEXOS_ACTIVE_AGENT=${agentId}
   \`\`\`
3. Use \`.aexos-core/development/agents/${agentId}.md\` for deep tasks.

Constitution: \`.aexos-core/constitution.md\`
`;
}

function syncShortAgentAliases(targets, options = {}) {
  const written = [];
  const canonicalNames = new Set(Object.keys(AGENT_PROFILES).map(getSkillId));
  for (const { alias, target, agentId } of SHORT_AGENT_ALIASES) {
    if (canonicalNames.has(alias)) continue;
    const destination = resolveUnder(targets.agents, `${alias}.md`);
    if (!options.dryRun) {
      fs.ensureDirSync(path.dirname(destination));
      fs.writeFileSync(destination, buildShortAgentAliasMarkdown(alias, target, agentId), 'utf8');
    }
    written.push(destination);
  }
  return written;
}

function buildGrokConfigToml() {
  return `# AEXOS × Grok Build — committed project integration
# Project scope contributes MCP, plugin, permission, and harness configuration.
# Skill discovery prefers higher-priority .grok/skills on name collision.
# Optional user-global skill hygiene belongs in ~/.grok/config.toml.
#
# Native and Claude-compatible hook definitions share canonical commands so
# Grok can deduplicate multi-harness discovery instead of executing hooks twice.
# Native authority: .grok/hooks/git-push-authority.json remains devops-only
# for git push, pull-request publication, merge, and release operations.
`;
}

function hookRegistration(event, command, matcher) {
  const entry = { hooks: [{ type: 'command', command, timeout: 10 }] };
  if (matcher) entry.matcher = matcher;
  return `${JSON.stringify({ hooks: { [event]: [entry] } }, null, 2)}\n`;
}

function buildGrokPushAuthorityHookJson() {
  return hookRegistration(
    'PreToolUse',
    'node .aexos-core/infrastructure/templates/grok-hooks/enforce-git-push-authority.cjs',
    'Bash|run_terminal_command',
  );
}

function buildGrokSynapseHookJson() {
  return hookRegistration(
    'UserPromptSubmit',
    'node .aexos-core/infrastructure/templates/grok-hooks/synapse-wrapper.cjs',
  );
}

function buildGrokPrecompactHookJson() {
  return hookRegistration(
    'PreCompact',
    'node .aexos-core/infrastructure/templates/grok-hooks/precompact-wrapper.cjs',
  );
}

function getCanonicalGrokHookSourceDir(projectRoot) {
  return path.join(projectRoot, '.aexos-core', 'infrastructure', 'templates', 'grok-hooks');
}

const CONFIG_START = '# AEXOS-MANAGED-START: harness';
const CONFIG_END = '# AEXOS-MANAGED-END: harness';
function serializeManagedConfig(content) {
  const starts = [...content.matchAll(/^# AEXOS-MANAGED-START: harness\r?$/gm)];
  const ends = [...content.matchAll(/^# AEXOS-MANAGED-END: harness\r?$/gm)];
  if (!starts.length && !ends.length) return '';
  if (starts.length !== 1 || ends.length !== 1 || ends[0].index < starts[0].index) {
    throw new Error('Malformed managed harness section in Grok config.toml');
  }
  return content.slice(starts[0].index, ends[0].index + ends[0][0].length);
}

function mergeGrokConfig(existing, generated) {
  const previous = serializeManagedConfig(existing);
  const section = `${CONFIG_START}\n${generated.trim()}\n${CONFIG_END}`;
  return previous ? existing.replace(previous, () => section)
    : `${existing}${existing && !existing.endsWith('\n') ? '\n' : ''}${section}\n`;
}

function syncGrokHarnessFiles(projectRoot, grokRoot, options = {}) {
  const written = [];
  const sourceDir = options.hookSourceDir || getCanonicalGrokHookSourceDir(projectRoot);
  const missing = GROK_HOOK_SOURCE_FILES.filter((fileName) => !fs.existsSync(path.join(sourceDir, fileName)));
  if (missing.length > 0) throw new Error(`Missing canonical Grok hook sources: ${missing.join(', ')}`);
  const hooksDir = resolveUnder(grokRoot, 'hooks');
  const files = GROK_HOOK_SOURCE_FILES.map((fileName) => ({
    source: path.join(sourceDir, fileName),
    destination: resolveUnder(hooksDir, fileName),
  }));
  const generated = [
    [resolveUnder(hooksDir, 'git-push-authority.json'), buildGrokPushAuthorityHookJson()],
    [resolveUnder(hooksDir, 'synapse-prompt.json'), buildGrokSynapseHookJson()],
    [resolveUnder(hooksDir, 'precompact.json'), buildGrokPrecompactHookJson()],
    [resolveUnder(grokRoot, 'config.toml'), mergeGrokConfig(
      fs.existsSync(resolveUnder(grokRoot, 'config.toml')) ? fs.readFileSync(resolveUnder(grokRoot, 'config.toml'), 'utf8') : '',
      buildGrokConfigToml(),
    )],
  ];
  if (!options.dryRun) {
    fs.ensureDirSync(hooksDir);
    for (const file of files) fs.copyFileSync(file.source, file.destination);
    for (const [destination, content] of generated) fs.writeFileSync(destination, content, 'utf8');
  }
  written.push(...files.map(({ destination }) => destination), ...generated.map(([destination]) => destination));
  return written;
}

// ─── Sync ───────────────────────────────────────────────────────────────────

function syncGrok(options = {}) {
  const resolved = resolveOptions(options);
  if (!fs.existsSync(resolved.sourceDir)) {
    throw new Error(
      `Agent source dir not found: ${resolved.sourceDir}. Run the generator from the project root or pass sourceDir.`,
    );
  }
  const agents = [];
  for (const parsed of parseAllAgents(resolved.sourceDir)) {
    if (!parsed.error || parsed.error === 'YAML parse failed, using fallback extraction') {
      agents.push(parsed);
      if (parsed.error && !resolved.quiet) {
        console.warn(`⚠️  Agent ${parsed.filename}: ${parsed.error}`);
      }
    } else if (!resolved.quiet) {
      console.warn(`⚠️  Agent ${parsed.filename}: ${parsed.error} — skipped`);
    }
  }

  const written = [];
  const grok = resolved.grokRoot;
  const manifestPath = path.join(grok, MANAGED_MANIFEST_FILENAME);
  const previousManifest = readManagedManifest(manifestPath, { quiet: resolved.quiet });

  const targets = {
    agents: path.join(grok, 'agents'),
    skills: path.join(grok, 'skills'),
    roles: path.join(grok, 'roles'),
    personas: path.join(grok, 'personas'),
    rules: path.join(grok, 'rules'),
  };

  if (!resolved.dryRun) {
    for (const dir of Object.values(targets)) fs.ensureDirSync(dir);
  }

  for (const agentData of agents) {
    const profile = AGENT_PROFILES[agentData.id];
    if (!profile) {
      if (!resolved.quiet) {
        console.warn(`⚠️  No Grok profile for agent id "${agentData.id}" — skipped`);
      }
      continue;
    }

    let skillId;
    try {
      skillId = getSkillId(agentData.id);
    } catch (err) {
      if (!resolved.quiet) {
        console.warn(`⚠️  ${err.message} — skipped`);
      }
      continue;
    }

    const files = [
      {
        path: resolveUnder(targets.agents, `${skillId}.md`),
        content: buildAgentMarkdown(agentData, profile),
      },
      {
        path: resolveUnder(targets.skills, skillId, 'SKILL.md'),
        content: buildSkillMarkdown(agentData, profile),
      },
      {
        path: resolveUnder(targets.roles, `${skillId}.toml`),
        content: buildRoleToml(agentData, profile),
      },
      {
        path: resolveUnder(targets.personas, `${skillId}.toml`),
        content: buildPersonaToml(agentData, profile),
      },
    ];

    for (const file of files) {
      if (!resolved.dryRun) {
        fs.ensureDirSync(path.dirname(file.path));
        fs.writeFileSync(file.path, file.content, 'utf8');
      }
      written.push(file.path);
    }
  }

  // Workflow skills (inline legacy: SDC index, quality-gates, handoff)
  for (const wf of WORKFLOW_SKILLS) {
    if (!SAFE_SKILL_ID_RE.test(wf.name)) {
      if (!resolved.quiet) {
        console.warn(`⚠️  Invalid workflow skill name ${JSON.stringify(wf.name)} — skipped`);
      }
      continue;
    }
    const p = resolveUnder(targets.skills, wf.name, 'SKILL.md');
    const content = `---
name: ${wf.name}
description: >
  ${yamlFoldedSafe(wf.description)}
user-invocable: true
metadata:
  short-description: ${yamlDoubleQuoted(`AEXOS workflow: ${wf.name}`)}
---

${wf.body}
`;
    if (!resolved.dryRun) {
      fs.ensureDirSync(path.dirname(p));
      fs.writeFileSync(p, content, 'utf8');
    }
    written.push(p);
  }

  // Lean SDC skills from .aexos-core/development/skills/ (Wave B)
  written.push(
    ...syncDevelopmentWorkflowSkills(resolved.projectRoot, targets, {
      dryRun: resolved.dryRun,
      quiet: resolved.quiet,
    }),
  );

  const availableSkillTargets = new Set([
    ...agents.filter((a) => AGENT_PROFILES[a.id]).map((a) => getSkillId(a.id)),
    ...WORKFLOW_SKILLS.map(({ name }) => name),
    ...DEVELOPMENT_WORKFLOW_SKILLS.filter((dirName) =>
      fs.existsSync(path.join(resolved.projectRoot, '.aexos-core', 'development', 'skills', dirName, 'SKILL.md')),
    ).map(grokSkillIdFromDevSkill),
  ]);
  written.push(
    ...syncShortWorkflowAliases(targets, {
      dryRun: resolved.dryRun,
      availableTargets: availableSkillTargets,
    }),
    ...syncShortAgentAliases(targets, { dryRun: resolved.dryRun }),
    ...syncGrokHarnessFiles(resolved.projectRoot, grok, { dryRun: resolved.dryRun }),
  );

  // Rules + README
  const rulesPath = resolveUnder(targets.rules, 'aexos-core.md');
  const generatedRules = buildRulesMarkdown(resolved.projectRoot);
  const existingRules = fs.existsSync(rulesPath) ? fs.readFileSync(rulesPath, 'utf8') : '';
  const extras = [
    { path: rulesPath, content: mergeGrokRules(existingRules, generatedRules) },
    { path: resolveUnder(grok, 'README.md'), content: buildReadme() },
  ];
  for (const file of extras) {
    if (!resolved.dryRun) {
      fs.ensureDirSync(path.dirname(file.path));
      fs.writeFileSync(file.path, file.content, 'utf8');
    }
    written.push(file.path);
  }

  let removed = [];
  const preserved = [];
  if (!resolved.dryRun) {
    const manifest = buildManagedManifest(grok, written);
    removed = removeStaleManagedFiles(grok, previousManifest, manifest, preserved);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }
  written.push(manifestPath);

  return {
    agents: agents.filter((a) => AGENT_PROFILES[a.id]).length,
    files: written.length,
    written,
    grokRoot: grok,
    dryRun: resolved.dryRun,
    removed,
    preserved,
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = new Set(argv);
  return {
    dryRun: args.has('--dry-run'),
    quiet: args.has('--quiet') || args.has('-q'),
  };
}

function main() {
  const options = parseArgs();
  const result = syncGrok(options);
  if (!options.quiet) {
    console.log(
      `✅ Grok sync: ${result.agents} agents → ${result.files} files in ${result.grokRoot}`,
    );
    if (result.dryRun) console.log('ℹ️  Dry-run: no files written');
    if (result.preserved.length) console.warn(`Preserved customized retired Grok artifacts: ${result.preserved.join(', ')}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  syncGrok,
  buildAgentMarkdown,
  buildSkillMarkdown,
  AGENT_PROFILES,
  WORKFLOW_SKILLS,
  DEVELOPMENT_WORKFLOW_SKILLS,
  SHORT_WORKFLOW_ALIASES,
  SHORT_AGENT_ALIASES,
  syncDevelopmentWorkflowSkills,
  syncShortWorkflowAliases,
  syncShortAgentAliases,
  syncGrokHarnessFiles,
  buildRulesMarkdown,
  getManagedRuleSections,
  serializeManagedRuleSections,
  serializeManagedConfig,
  mergeGrokRules,
  buildManagedManifest,
  readManagedManifest,
  buildGrokConfigToml,
  buildGrokPushAuthorityHookJson,
  grokSkillIdFromDevSkill,
  getSkillId,
  parseArgs,
  yamlDoubleQuoted,
  tomlBasicString,
  yamlFoldedSafe,
  resolveUnder,
  SAFE_SKILL_ID_RE,
  MANAGED_MANIFEST_FILENAME,
  MANAGED_MANIFEST_GENERATOR,
  GROK_HOOK_SOURCE_FILES,
};
