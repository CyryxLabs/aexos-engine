# AEXOS Grok Integration

Optimized agents, skills, roles, personas, hooks, and project config for [Grok Build TUI](https://grok.x.ai).

## Layout

| Path | Purpose |
|------|---------|
| `agents/` | Native Grok agent profiles (session + spawnable types) |
| `skills/aexos-*/` | Slash skills to activate personas |
| `skills/aexos-sdc/`, `aexos-full-sdc/`, atomics | Workflow skills (lean SDC + gates + handoff) |
| `roles/` | Subagent capability defaults |
| `personas/` | Behavioral overlays for subagents |
| `rules/` | Always-on compact AEXOS rules |
| `hooks/` | Native authority, SYNAPSE, and precompact hooks |
| `config.toml` | Project harness notes |
| `aexos-managed.json` | Managed ownership and deterministic hashes |

## Authority and identity

Activation writes the active agent to `.aexos/active-agent`,
`.aexos/active-agent.json`, and `.synapse/sessions/_active-agent.json`, and
exports `AEXOS_ACTIVE_AGENT`. The native authority hook remains the final
enforcement boundary for remote Git operations.

## Activate an agent

```text
/aexos-dev
/aexos-qa
/aexos-devops
/aexos-squad-creator
```

Short aliases such as `/dev`, `/qa`, and `/devops` load the corresponding
`aexos-*` agent and establish the same identity bridge.

## Hooks

- `.grok/hooks/git-push-authority.json` — native remote-operation authority
- `.grok/hooks/synapse-prompt.json` — prompt/session context
- `.grok/hooks/precompact.json` — precompact session digest

Native and Claude-compatible registrations share canonical commands so Grok
can deduplicate discovery rather than execute the same hook twice.

Or ask in natural language ("implement this story", "create a PR") — skill descriptions drive auto-invocation.

## Regenerate

From repo root:

```bash
npm run sync:skills:grok
npm run validate:skills:grok
# or
node .aexos-core/infrastructure/scripts/grok-skills-sync/index.js
```

Dry-run:

```bash
npm run sync:skills:grok -- --dry-run
```

## Design principles

1. **Token-efficient** — condensed profiles; full YAML stays in `.aexos-core/development/agents/`
2. **Authority-safe** — devops-only push; story lifecycle ownership
3. **Task-first** — formal work loads `.aexos-core/development/tasks/*`
4. **Grok-native** — frontmatter `permission_mode`, roles, personas
5. **Brownfield-safe** — only AEXOS-managed rule sections are replaced

## Related

- Codex skills: `npm run sync:skills:codex`
- IDE sync: `npm run sync:ide`
- Constitution: `.aexos-core/constitution.md`
