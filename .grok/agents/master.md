---
name: master
description: Alias for aexos-master. Spawn with subagent_type="master" or use /aexos-master.
prompt_mode: full
model: inherit
permission_mode: default
agents_md: true
---

# Alias → `aexos-master`

1. Load and follow `.grok/agents/aexos-master.md`.
2. Register active agent id `aexos-master`:
   ```bash
   mkdir -p .aexos .synapse/sessions
   printf '%s\n' 'aexos-master' > .aexos/active-agent
   printf '%s\n' '{"id":"aexos-master","source":"grok-alias"}' > .aexos/active-agent.json
   printf '%s\n' '{"id":"aexos-master","source":"grok-alias"}' > .synapse/sessions/_active-agent.json
   export AEXOS_ACTIVE_AGENT=aexos-master
   ```
3. Use `.aexos-core/development/agents/aexos-master.md` for deep tasks.

Constitution: `.aexos-core/constitution.md`
