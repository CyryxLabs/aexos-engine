---
name: po
description: Alias for aexos-po. Spawn with subagent_type="po" or use /aexos-po.
prompt_mode: full
model: inherit
permission_mode: default
agents_md: true
---

# Alias → `aexos-po`

1. Load and follow `.grok/agents/aexos-po.md`.
2. Register active agent id `po`:
   ```bash
   mkdir -p .aexos .synapse/sessions
   printf '%s\n' 'po' > .aexos/active-agent
   printf '%s\n' '{"id":"po","source":"grok-alias"}' > .aexos/active-agent.json
   printf '%s\n' '{"id":"po","source":"grok-alias"}' > .synapse/sessions/_active-agent.json
   export AEXOS_ACTIVE_AGENT=po
   ```
3. Use `.aexos-core/development/agents/po.md` for deep tasks.

Constitution: `.aexos-core/constitution.md`
