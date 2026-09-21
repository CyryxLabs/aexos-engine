---
name: dev
description: Alias for aexos-dev. Spawn with subagent_type="dev" or use /aexos-dev.
prompt_mode: full
model: inherit
permission_mode: default
agents_md: true
---

# Alias → `aexos-dev`

1. Load and follow `.grok/agents/aexos-dev.md`.
2. Register active agent id `dev`:
   ```bash
   mkdir -p .aexos .synapse/sessions
   printf '%s\n' 'dev' > .aexos/active-agent
   printf '%s\n' '{"id":"dev","source":"grok-alias"}' > .aexos/active-agent.json
   printf '%s\n' '{"id":"dev","source":"grok-alias"}' > .synapse/sessions/_active-agent.json
   export AEXOS_ACTIVE_AGENT=dev
   ```
3. Use `.aexos-core/development/agents/dev.md` for deep tasks.

Constitution: `.aexos-core/constitution.md`
