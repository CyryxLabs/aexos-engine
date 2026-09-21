# AEXOS × Grok Build — Project Rules

These rules apply to Grok Build sessions in this repository.
Full constitution: `.aexos-core/constitution.md`.

<!-- AEXOS-MANAGED-START: core -->
## Core rules

1. Follow `.aexos-core/constitution.md`.
2. Prioritize `CLI First → Observability Second → UI Third`.
3. Work from a story under `docs/framework/epics/` or `docs/stories/`.
4. Do not invent requirements outside the story, PRD, or verified research.
<!-- AEXOS-MANAGED-END: core -->

<!-- AEXOS-MANAGED-START: authority -->
## Authority

| Operation | Exclusive agent | Skill |
|-----------|-----------------|-------|
| `git push`, PR create/merge, releases | devops (Polaris) | `/aexos-devops` |
| Story draft/create | sm (Chronos) | `/aexos-sm` |
| Story validate → Ready | po (Themis) | `/aexos-po` |
| Implementation | dev (Vulcan) | `/aexos-dev` |
| QA gate verdict | qa (Argus) | `/aexos-qa` |

Agent activation registers `.aexos/active-agent` and `AEXOS_ACTIVE_AGENT` for
authority-sensitive commands.
<!-- AEXOS-MANAGED-END: authority -->

<!-- AEXOS-MANAGED-START: quality -->
## Quality gates

```bash
npm run lint && npm run typecheck && npm test
```
<!-- AEXOS-MANAGED-END: quality -->

<!-- AEXOS-MANAGED-START: entrypoints -->
## Grok entry points

- Agents: `.grok/agents/`
- Skills: `/aexos-*` and short aliases under `.grok/skills/`
- Hooks: `.grok/hooks/`
- Source agents: `.aexos-core/development/agents/`

```bash
npm run sync:skills:grok
npm run validate:skills:grok
```
<!-- AEXOS-MANAGED-END: entrypoints -->
