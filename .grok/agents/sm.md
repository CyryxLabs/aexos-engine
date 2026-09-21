---
name: sm
description: Alias for aexos-sm. Spawn with subagent_type="sm" or use /aexos-sm.
prompt_mode: full
model: inherit
permission_mode: default
agents_md: true
---

# Alias → `aexos-sm`

1. Load and follow `.grok/agents/aexos-sm.md`.
2. Register active agent id `sm`:
   ```bash
   mkdir -p .aexos .synapse/sessions
   printf '%s\n' 'sm' > .aexos/active-agent
   printf '%s\n' '{"id":"sm","source":"grok-alias"}' > .aexos/active-agent.json
   printf '%s\n' '{"id":"sm","source":"grok-alias"}' > .synapse/sessions/_active-agent.json
   export AEXOS_ACTIVE_AGENT=sm
   ```
3. Use `.aexos-core/development/agents/sm.md` for deep tasks.

Constitution: `.aexos-core/constitution.md`
