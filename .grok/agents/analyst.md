---
name: analyst
description: Alias for aexos-analyst. Spawn with subagent_type="analyst" or use /aexos-analyst.
prompt_mode: full
model: inherit
permission_mode: default
agents_md: true
---

# Alias → `aexos-analyst`

1. Load and follow `.grok/agents/aexos-analyst.md`.
2. Register active agent id `analyst`:
   ```bash
   mkdir -p .aexos .synapse/sessions
   printf '%s\n' 'analyst' > .aexos/active-agent
   printf '%s\n' '{"id":"analyst","source":"grok-alias"}' > .aexos/active-agent.json
   printf '%s\n' '{"id":"analyst","source":"grok-alias"}' > .synapse/sessions/_active-agent.json
   export AEXOS_ACTIVE_AGENT=analyst
   ```
3. Use `.aexos-core/development/agents/analyst.md` for deep tasks.

Constitution: `.aexos-core/constitution.md`
