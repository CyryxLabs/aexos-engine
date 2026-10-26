# Story CKP.1: Capability admission e contrato versionado

## Metadata

| Campo | Valor |
| --- | --- |
| Story ID | CKP.1 |
| Epic | CKP — Cerberus Knowledge Plane |
| Wave | 0 — admission boundary |
| Status | Ready |
| Executor | @dev |
| Quality Gate | @architect |
| Quality Gate Tools | contract tests, schema validation, admission inventory, denylist tests |

## Story

**As a** maintainer do AEXOS,
**I want** admitir capacidades Cerberus somente por um contrato versionado e uma allowlist reproduzível,
**so that** nenhuma autoridade, superfície incompatível ou artefato não classificado entre no AEXOS.

## Contexto

Esta é a fronteira de segurança e compatibilidade do epic. O checkout upstream foi classificado como inadequado para cópia direta. A story cria a linguagem de integração e o gate que todas as waves posteriores devem obedecer; ela não habilita o knowledge plane nem implementa ingestão.

## Acceptance Criteria

1. Existe um contrato versionado `aexos.cerberus/v1` que define operações, envelopes de request/response/error, correlação, cancelamento, limites e regras de compatibilidade, validado por schema e testes de contrato.
2. A admissão é deny-by-default e contém uma allowlist explícita das capacidades inicialmente aceitas; CLI, installer, hooks, registries, routers, agents, squads e projeções de IDE do Cerberus são rejeitados por testes automatizados.
3. Um inventário reproduzível classifica cada artefato upstream como `admit`, `adapt`, `quarantine` ou `reject`, registra hash/proveniência e falha quando conteúdo não classificado entra no pacote curado.
4. O contrato preserva o AEXOS como autoridade exclusiva de identidade, lifecycle, provider routing, orçamento, story binding, intent scan, eventos e release, sem caminho alternativo de execução.
5. Fixtures cobrindo versão suportada, versão incompatível, operação desconhecida, payload inválido, timeout, cancelamento e erro do worker passam sem rede ou credenciais reais.
6. Nenhuma mudança desta story habilita o knowledge plane por padrão ou modifica a instalação e os fluxos existentes do AEXOS.

## Tasks / Subtasks

- [ ] Definir o contrato `aexos.cerberus/v1` e seus schemas (AC: 1, 4)
  - [ ] Modelar request, response, error, correlation, cancellation e limits.
  - [ ] Tornar versão/operação desconhecida um erro fail-closed e estável.
- [ ] Implementar o admission inventory reproduzível (AC: 2, 3)
  - [ ] Classificar por capability e hash, nunca por cópia implícita de diretório.
  - [ ] Rejeitar conteúdo ausente do inventário e as superfícies proibidas do epic.
- [ ] Criar fixtures e contract/admission tests isolados (AC: 1–6)
  - [ ] Cobrir happy path, incompatibilidade, payload hostil, timeout, cancelamento e worker failure.
  - [ ] Provar zero rede, zero credenciais e feature desabilitada após a story.
- [ ] Atualizar documentação e File List com decisões realmente implementadas (AC: 4, 6).

## Dev Notes

- AEXOS permanece a única fonte de verdade; o worker é um detalhe substituível.
- O contrato deve ser transport-neutral. Esta story não autoriza MCP direto, daemon público ou SDK de provider dentro do worker.
- A classificação `adapt` exige código AEXOS próprio na fronteira; `quarantine` não pode ser carregado pelo runtime; `reject` não pode entrar no pacote.
- Não importar `.claude`, `.codex`, `.gemini`, `.grok`, hooks, agents, squads, registries, installer ou package roots do Cerberus.
- O inventário precisa produzir ordem/bytes estáveis para o mesmo input e falhar em artefato desconhecido.
- Pontos existentes a preservar: `.aexos-core/core/sdc/dispatch-adapter.js`, `.aexos-core/core/events/` e `.aexos-core/infrastructure/integrations/ai-providers/`.
- Referência normativa: `EPIC-CERBERUS-KNOWLEDGE-PLANE.md#princípios-e-invariantes` e `#ckp1--capability-admission-e-contrato-versionado`.
- Documentos de arquitetura/ADR/threat model desta pasta devem ser revisados antes do gate arquitetural; divergência bloqueia conclusão.

## Testing

- Unit: schema validation, version negotiation, canonical serialization, classification e hash.
- Contract: envelopes válidos/inválidos, error codes, timeout e cancellation.
- Security: denylist das superfícies proibidas, traversal em caminhos de inventário e artefato desconhecido.
- Regression: CLI/installer/registry/sync atuais permanecem inalterados e a feature continua disabled.
- Gates: `npm run lint`, `npm run typecheck`, testes focados, `npm test` e validações de manifest/parity aplicáveis.

## 🤖 CodeRabbit Integration

### Story Type Analysis

**Primary Type:** Architecture  
**Secondary Type(s):** Integration, Security  
**Complexity:** High

### Specialized Agent Assignment

**Primary Agents:** @dev, @architect  
**Supporting Agents:** @qa, @devops

### Quality Gate Tasks

- [ ] Pre-Commit (@dev): contrato, determinismo, denylist e regressão.
- [ ] Pre-PR (@devops): manifest, compatibilidade e ausência de artefatos proibidos.
- [ ] Pre-Deployment (@devops): N/A nesta story; ela não publica release.

### Self-Healing Configuration

- Primary Agent: @dev (light mode)
- Max Iterations: 2
- Timeout: 15 minutes
- Severity Filter: CRITICAL
- CRITICAL: auto_fix; HIGH: document_only; MEDIUM/LOW: ignore durante o loop e encaminhar para QA.

### CodeRabbit Focus Areas

- Backward compatibility e única autoridade AEXOS.
- Fail-closed versioning/schema validation.
- Reprodutibilidade e ausência de wholesale copy.
- Nenhuma credencial, rede ou habilitação implícita.

## Definition of Done

- [ ] Todos os ACs possuem teste automatizado e evidência.
- [ ] Inventário não contém artefato não classificado.
- [ ] Architecture gate aprovado para o snapshot exato.
- [ ] Story atualizada com checkboxes e File List reais.
- [ ] Nenhum commit, push ou release é atribuído ao Scrum Master.

## Story Draft Checklist Result

| Categoria | Status | Observação |
| --- | --- | --- |
| Goal & Context | PASS | Fronteira e não objetivos explícitos. |
| Technical Guidance | PASS | Contrato, inventário, integrações e erros definidos. |
| References | PASS | Epic e pontos canônicos específicos. |
| Self-Containment | PASS | Invariantes e edge cases incluídos. |
| Testing | PASS | Unit, contract, security e regression mensuráveis. |
| CodeRabbit | PASS | Tipo, agentes, gates, self-healing e foco presentes. |

**Final Assessment:** READY — autorizado como primeira story executável; conclusão continua sujeita ao gate independente de arquitetura.

## Change Log

| Data | Versão | Descrição | Autor |
| --- | --- | --- | --- |
| 2026-08-17 | 0.1.0 | Story criada e validada a partir do epic CKP. | Chronos (@sm) |

## Dev Agent Record

### Agent Model Used

_A preencher por @dev._

### Debug Log References

_A preencher por @dev._

### Completion Notes List

_A preencher por @dev._

### File List

_A preencher por @dev com todos os arquivos criados, modificados ou afetados._

## QA Results

_A preencher por @qa após implementação._

