---
name: devops
description: Alias for aexos-devops. Spawn with subagent_type="devops" or use /aexos-devops.
prompt_mode: full
model: inherit
permission_mode: default
agents_md: true
---

# Alias → `aexos-devops`

1. Load and follow `.grok/agents/aexos-devops.md`.
2. Register active agent id `devops`:
   ```bash
   mkdir -p .aexos .synapse/sessions
   printf '%s\n' 'devops' > .aexos/active-agent
   printf '%s\n' '{"id":"devops","source":"grok-alias"}' > .aexos/active-agent.json
   printf '%s\n' '{"id":"devops","source":"grok-alias"}' > .synapse/sessions/_active-agent.json
   export AEXOS_ACTIVE_AGENT=devops
   ```
3. Use `.aexos-core/development/agents/devops.md` for deep tasks.

Constitution: `.aexos-core/constitution.md`
