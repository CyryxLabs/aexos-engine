---
name: architect
description: Alias for aexos-architect. Spawn with subagent_type="architect" or use /aexos-architect.
prompt_mode: full
model: inherit
permission_mode: default
agents_md: true
---

# Alias → `aexos-architect`

1. Load and follow `.grok/agents/aexos-architect.md`.
2. Register active agent id `architect`:
   ```bash
   mkdir -p .aexos .synapse/sessions
   printf '%s\n' 'architect' > .aexos/active-agent
   printf '%s\n' '{"id":"architect","source":"grok-alias"}' > .aexos/active-agent.json
   printf '%s\n' '{"id":"architect","source":"grok-alias"}' > .synapse/sessions/_active-agent.json
   export AEXOS_ACTIVE_AGENT=architect
   ```
3. Use `.aexos-core/development/agents/architect.md` for deep tasks.

Constitution: `.aexos-core/constitution.md`
