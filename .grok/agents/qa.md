---
name: qa
description: Alias for aexos-qa. Spawn with subagent_type="qa" or use /aexos-qa.
prompt_mode: full
model: inherit
permission_mode: default
agents_md: true
---

# Alias → `aexos-qa`

1. Load and follow `.grok/agents/aexos-qa.md`.
2. Register active agent id `qa`:
   ```bash
   mkdir -p .aexos .synapse/sessions
   printf '%s\n' 'qa' > .aexos/active-agent
   printf '%s\n' '{"id":"qa","source":"grok-alias"}' > .aexos/active-agent.json
   printf '%s\n' '{"id":"qa","source":"grok-alias"}' > .synapse/sessions/_active-agent.json
   export AEXOS_ACTIVE_AGENT=qa
   ```
3. Use `.aexos-core/development/agents/qa.md` for deep tasks.

Constitution: `.aexos-core/constitution.md`
