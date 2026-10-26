# Story CKP.2: Gateway governado e doctor cross-platform

## Metadata

| Campo | Valor |
| --- | --- |
| Story ID | CKP.2 |
| Epic | CKP — Cerberus Knowledge Plane |
| Wave | 1 — governed runtime boundary |
| Status | Draft |
| Depends On | CKP.1 Done |
| Executor | @dev |
| Quality Gate | @architect |
| Quality Gate Tools | gateway integration tests, doctor fixtures, process lifecycle tests |

## Story

**As a** operador do AEXOS,
**I want** acessar o knowledge plane por um gateway governado com diagnostics cross-platform,
**so that** o componente opcional falhe com segurança sem afetar o core.

## Acceptance Criteria

1. Todas as operações do knowledge plane atravessam um único gateway do AEXOS que exige projeto, identidade, capability, correlação e contexto de autorização válidos antes de iniciar o worker.
2. Intents automatizados exigem story binding, budget ceiling quando houver modelo e intent/injection scan; qualquer falha bloqueia a execução antes de spawn, leitura de fonte ou chamada de provider.
3. O doctor reporta separadamente estado `disabled`, `ready`, `degraded` ou `blocked`, com diagnósticos acionáveis para runtime, dependências, permissões, storage e versão de contrato.
4. A instalação básica e o doctor do AEXOS continuam passando quando Python e Cerberus não estão presentes; ausência de componente opcional não é falha do core.
5. A resolução de executável e paths funciona em Windows, macOS e Linux sem `python3`, `venv/bin`, separador de PATH, symlink ou shell script assumidos de forma fixa.
6. Testes provam timeout, cancelamento, cleanup do processo filho, propagação estável de exit code e ausência de processo órfão ou escrita parcial.

## Tasks / Subtasks

- [ ] Implementar o gateway como única porta de entrada (AC: 1, 2)
  - [ ] Validar contexto e governança antes de qualquer side effect.
  - [ ] Adaptar o contrato CKP.1 sem criar rota alternativa.
- [ ] Implementar doctor/preflight e estados acionáveis (AC: 3, 4, 5)
  - [ ] Detectar feature disabled sem transformar opção ausente em erro do core.
  - [ ] Resolver runtime e paths por plataforma, sem constantes Unix.
- [ ] Implementar lifecycle do processo filho (AC: 6)
  - [ ] Timeout, cancellation, bounded output, cleanup e stable error mapping.
- [ ] Cobrir integração e regressão em fixtures Windows/macOS/Linux (AC: 1–6).

## Dev Notes

- Reutilizar os guards canônicos em `.aexos-core/core/sdc/dispatch-adapter.js`; não duplicar validação de story, budget ou intent.
- Estender o padrão de `.aexos-core/core/doctor/` e seus formatters; não criar um doctor independente.
- O gateway não lê `.env`, não seleciona providers e não inicia UI.
- O modo disabled precisa ser determinístico e silencioso para fluxos não relacionados.
- O stdout/stderr do worker é dado não confiável; limitar, mapear e sanitizar antes de logs.
- Referências: `EPIC-CERBERUS-KNOWLEDGE-PLANE.md#ckp2--gateway-governado-e-doctor-cross-platform` e CKP.1.

## Testing

- Unit: context validation, runtime resolver, doctor states e error mapping.
- Integration: fake worker para success/error/timeout/cancel e ausência de orphan.
- Cross-platform: fixtures de paths/executables Windows, macOS e Linux.
- Regression: doctor/core install sem Python e feature disabled.
- Gates: lint, typecheck, focused tests, full tests e `git diff --check`.

## 🤖 CodeRabbit Integration

- **Primary Type:** Integration; **Secondary:** Security, Architecture; **Complexity:** High.
- **Primary Agents:** @dev, @architect. **Supporting:** @qa, @devops.
- [ ] Pre-Commit: guards, process cleanup e doctor regression.
- [ ] Pre-PR: cross-platform e backward compatibility.
- **Self-Healing:** @dev light, 2 iterations, 15 minutes, CRITICAL auto-fix; HIGH document-only.
- **Focus:** pre-side-effect governance, command/path safety, bounded subprocess e optional degradation.

## Definition of Done

- [ ] CKP.1 está Done e o contrato permanece compatível.
- [ ] ACs e tasks possuem evidência automatizada.
- [ ] Architecture e QA gates aprovam o snapshot.
- [ ] Checkboxes e File List refletem somente trabalho real.

## Story Draft Checklist Result

| Categoria | Status | Observação |
| --- | --- | --- |
| Goal & Context | PASS | Gateway e degradação opcional claros. |
| Technical Guidance | PASS | Guards, doctor e processo filho definidos. |
| References | PASS | Epic, CKP.1 e seams existentes. |
| Self-Containment | PASS | Estados e edge cases incluídos. |
| Testing | PASS | Cross-platform e failure lifecycle mensuráveis. |
| CodeRabbit | PASS | Seção completa em formato condensado. |

**Final Assessment:** READY CONTENT / STATUS DRAFT — aguarda CKP.1 Done e validação do PO.

## Change Log

| Data | Versão | Descrição | Autor |
| --- | --- | --- | --- |
| 2026-08-17 | 0.1.0 | Draft criado a partir dos ACs preservados do epic. | Chronos (@sm) |

## Dev Agent Record

### File List

_A preencher por @dev._

## QA Results

_A preencher por @qa._

