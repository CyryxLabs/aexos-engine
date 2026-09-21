# Grok Skills/Agents Sync

Gera artefatos otimizados do AEXOS para o **Grok Build TUI**.

## Usage

```bash
# From repo root
npm run sync:skills:grok
npm run sync:skills:grok:dry
npm run validate:skills:grok
```

## Outputs

| Path | Content |
|------|---------|
| `.grok/agents/*.md` | Agent profiles nativos (frontmatter Grok) |
| `.grok/skills/aexos-*/SKILL.md` | Skills de ativação de persona |
| `.grok/skills/aexos-sdc/` etc. | Skills de workflow |
| `.grok/roles/*.toml` | Defaults de capability para subagents |
| `.grok/personas/*.toml` | Overlays comportamentais |
| `.grok/rules/aexos-core.md` | Regras compactas always-on |
| `.grok/hooks/` | Hooks nativos de autoridade, SYNAPSE e precompact |
| `.grok/config.toml` | Registro e notas do harness do projeto |
| `.grok/aexos-managed.json` | Ownership e hashes determinísticos do gerador |
| `.grok/README.md` | Documentação da integração |

## Design

- **Token-efficient:** prompts condensados; YAML completo fica em `.aexos-core/development/agents/`
- **Authority-safe:** matriz de autoridades AEXOS embutida (ex.: só devops faz push)
- **Brownfield-safe:** preserva conteúdo custom fora das seções AEXOS gerenciadas
- **Regenerável:** remove apenas artefatos anteriormente gerenciados que ficaram obsoletos
- **Identidade consistente:** skills e aliases registram os três bridges de agente ativo antes de operações com autoridade
- **Validável:** detecta arquivos ausentes, semântica quebrada em agents/roles/personas/aliases/hooks, drift e corrupção deliberada

## Runtime contract

- Skills longas e workflows são explicitamente `user-invocable`.
- Aliases curtos carregam o perfil canônico e registram `.aexos/active-agent`,
  `.aexos/active-agent.json` e `.synapse/sessions/_active-agent.json`.
- Hooks nativos em `.grok/hooks/*.json` usam os mesmos entrypoints canônicos da
  compatibilidade Claude, permitindo deduplicação pelo Grok.
- O gerador falha quando agents, regras ou hooks canônicos não estão disponíveis;
  não publica uma projeção parcial silenciosamente.

## Source

Lê agents via `ide-sync/agent-parser` a partir de `.aexos-core/development/agents/`.
Overlays de perfil Grok: `AGENT_PROFILES` em `index.js`.
