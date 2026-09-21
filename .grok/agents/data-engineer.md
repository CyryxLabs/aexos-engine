---
name: data-engineer
description: Alias for aexos-data-engineer. Spawn with subagent_type="data-engineer" or use /aexos-data-engineer.
prompt_mode: full
model: inherit
permission_mode: default
agents_md: true
---

# Alias → `aexos-data-engineer`

1. Load and follow `.grok/agents/aexos-data-engineer.md`.
2. Register active agent id `data-engineer`:
   ```bash
   mkdir -p .aexos .synapse/sessions
   printf '%s\n' 'data-engineer' > .aexos/active-agent
   printf '%s\n' '{"id":"data-engineer","source":"grok-alias"}' > .aexos/active-agent.json
   printf '%s\n' '{"id":"data-engineer","source":"grok-alias"}' > .synapse/sessions/_active-agent.json
   export AEXOS_ACTIVE_AGENT=data-engineer
   ```
3. Use `.aexos-core/development/agents/data-engineer.md` for deep tasks.

Constitution: `.aexos-core/constitution.md`
