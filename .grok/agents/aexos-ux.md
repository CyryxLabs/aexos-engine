---
name: aexos-ux
description: Alias for aexos-ux-design-expert. Spawn with subagent_type="aexos-ux" or use /aexos-ux-design-expert.
prompt_mode: full
model: inherit
permission_mode: default
agents_md: true
---

# Alias → `aexos-ux-design-expert`

1. Load and follow `.grok/agents/aexos-ux-design-expert.md`.
2. Register active agent id `ux-design-expert`:
   ```bash
   mkdir -p .aexos .synapse/sessions
   printf '%s\n' 'ux-design-expert' > .aexos/active-agent
   printf '%s\n' '{"id":"ux-design-expert","source":"grok-alias"}' > .aexos/active-agent.json
   printf '%s\n' '{"id":"ux-design-expert","source":"grok-alias"}' > .synapse/sessions/_active-agent.json
   export AEXOS_ACTIVE_AGENT=ux-design-expert
   ```
3. Use `.aexos-core/development/agents/ux-design-expert.md` for deep tasks.

Constitution: `.aexos-core/constitution.md`
