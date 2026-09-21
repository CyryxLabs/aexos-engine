---
name: squad-creator
description: Alias for aexos-squad-creator. Spawn with subagent_type="squad-creator" or use /aexos-squad-creator.
prompt_mode: full
model: inherit
permission_mode: default
agents_md: true
---

# Alias → `aexos-squad-creator`

1. Load and follow `.grok/agents/aexos-squad-creator.md`.
2. Register active agent id `squad-creator`:
   ```bash
   mkdir -p .aexos .synapse/sessions
   printf '%s\n' 'squad-creator' > .aexos/active-agent
   printf '%s\n' '{"id":"squad-creator","source":"grok-alias"}' > .aexos/active-agent.json
   printf '%s\n' '{"id":"squad-creator","source":"grok-alias"}' > .synapse/sessions/_active-agent.json
   export AEXOS_ACTIVE_AGENT=squad-creator
   ```
3. Use `.aexos-core/development/agents/squad-creator.md` for deep tasks.

Constitution: `.aexos-core/constitution.md`
