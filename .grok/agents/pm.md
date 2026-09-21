---
name: pm
description: Alias for aexos-pm. Spawn with subagent_type="pm" or use /aexos-pm.
prompt_mode: full
model: inherit
permission_mode: default
agents_md: true
---

# Alias → `aexos-pm`

1. Load and follow `.grok/agents/aexos-pm.md`.
2. Register active agent id `pm`:
   ```bash
   mkdir -p .aexos .synapse/sessions
   printf '%s\n' 'pm' > .aexos/active-agent
   printf '%s\n' '{"id":"pm","source":"grok-alias"}' > .aexos/active-agent.json
   printf '%s\n' '{"id":"pm","source":"grok-alias"}' > .synapse/sessions/_active-agent.json
   export AEXOS_ACTIVE_AGENT=pm
   ```
3. Use `.aexos-core/development/agents/pm.md` for deep tasks.

Constitution: `.aexos-core/constitution.md`
