# Story CKP.4: Installer, storage lifecycle e rollback

## Metadata

| Campo | Valor |
| --- | --- |
| Story ID | CKP.4 |
| Epic | CKP — Cerberus Knowledge Plane |
| Wave | 2B — managed lifecycle |
| Status | Draft |
| Depends On | CKP.3 Done |
| Executor | @dev |
| Quality Gate | @devops |
| Quality Gate Tools | installer matrix, manifest diff, failure injection, rollback receipts |

## Story

**As a** mantenedor de instalações AEXOS,
**I want** gerenciar o knowledge plane como feature opt-in idempotente e rollbackável,
**so that** nenhum projeto, artefato alheio ou instalação existente seja danificado.

## Acceptance Criteria

1. O instalador oferece o knowledge plane como feature opt-in desabilitada por padrão e não copia nem sobrescreve `.claude`, `.codex`, `.gemini`, `.grok`, hooks, agents, squads, registries ou package roots do Cerberus.
2. Instalação básica sem a feature mantém contagens, hashes e comportamento canônico do AEXOS, sem exigir Python, rede, credenciais ou downloads adicionais.
3. Instalar, reinstalar e executar upgrade da feature é idempotente: não duplica entidades, comandos, skills, hooks, configuração ou dados e preserva arquivos não pertencentes ao AEXOS.
4. Storage, ledger, índices, receipts e locks são resolvidos dentro do escopo do projeto, com canonicalização e bloqueio de path traversal, symlink escape e compartilhamento cross-project.
5. Desativação preserva dados por padrão, remoção destrutiva exige ação explícita e escopo confirmado, e rollback restaura a configuração e os artefatos gerenciados sem apagar conteúdo alheio.
6. Falhas injetadas em cada fase de install/upgrade deixam receipt verificável e convergem por rollback ou nova execução para um estado consistente.
7. Testes cobrem instalação limpa, brownfield, segunda instalação, upgrade, downgrade bloqueado, desativação, rollback e Windows/macOS/Linux.

## Tasks / Subtasks

- [ ] Adicionar feature profile disabled-by-default ao installer canônico (AC: 1, 2).
- [ ] Definir ownership manifest e storage resolver por projeto (AC: 3, 4).
- [ ] Implementar install/reinstall/upgrade/disable/remove/rollback semantics (AC: 3, 5, 6).
- [ ] Integrar receipts e failure injection por fase (AC: 5, 6).
- [ ] Criar matriz clean/brownfield/cross-platform e assertions de não duplicidade (AC: 1–7).

## Dev Notes

- Estender `packages/installer/src/`; nunca executar o installer/postinstall upstream.
- O manifest deve distinguir artefatos gerenciados de conteúdo do usuário e impedir delete fora do root resolvido.
- Desativar não significa apagar dados. Purge é fluxo destrutivo separado e explicitamente autorizado.
- Segunda execução deve convergir para o mesmo estado e contagens canônicas.
- Não instalar runtime pesado aqui; CKP.5 é feature opcional separada.
- Referência: `EPIC-CERBERUS-KNOWLEDGE-PLANE.md#ckp4--installer-storage-lifecycle-e-rollback`.

## Testing

- Unit: feature flags, manifest ownership, path resolver e rollback planner.
- Integration: clean/brownfield/reinstall/upgrade/disable/remove/rollback.
- Failure injection: cada fase antes/depois de escrita e receipt.
- Security: traversal, symlink escape, unrelated file preservation e cross-project scope.
- Cross-platform: Windows/macOS/Linux installer fixtures e tarball smoke.

## 🤖 CodeRabbit Integration

- **Primary Type:** Deployment; **Secondary:** Security, Integration; **Complexity:** High.
- **Primary Agents:** @dev, @devops. **Supporting:** @architect, @qa.
- [ ] Pre-Commit: manifest, path safety e idempotência.
- [ ] Pre-PR: installer matrix e tarball smoke.
- [ ] Pre-Deployment: rollback rehearsal e package-content verification.
- **Self-Healing:** @dev light, 2 iterations, 15 minutes, CRITICAL auto-fix; HIGH document-only.
- **Focus:** preservation, reversibility, no duplicates, no implicit dependency e platform parity.

## Definition of Done

- [ ] Instalação básica permanece byte/count compatible nas superfícies canônicas.
- [ ] Reinstalação e rollback passam em todas as plataformas suportadas.
- [ ] DevOps/QA gates aprovam os receipts e o tarball real.
- [ ] Checkboxes e File List estão completos.

## Story Draft Checklist Result

| Categoria | Status | Observação |
| --- | --- | --- |
| Goal & Context | PASS | Lifecycle seguro e opt-in explícitos. |
| Technical Guidance | PASS | Installer, manifest, storage e rollback definidos. |
| References | PASS | Seam e epic específicos. |
| Self-Containment | PASS | Semântica destrutiva e preservation explícitas. |
| Testing | PASS | Matriz/failure injection mensuráveis. |
| CodeRabbit | PASS | Deployment/security gates completos. |

**Final Assessment:** READY CONTENT / STATUS DRAFT — depende do vertical slice CKP.3 e validação DevOps/PO.

## Change Log

| Data | Versão | Descrição | Autor |
| --- | --- | --- | --- |
| 2026-08-17 | 0.1.0 | Draft criado a partir dos ACs preservados do epic. | Chronos (@sm) |

## Dev Agent Record

### File List

_A preencher por @dev._

## QA Results

_A preencher por @qa._

