# Story CKP.3: Ingestão e busca local seguras

## Metadata

| Campo | Valor |
| --- | --- |
| Story ID | CKP.3 |
| Epic | CKP — Cerberus Knowledge Plane |
| Wave | 2A — local vertical slice |
| Status | Draft |
| Depends On | CKP.2 Done |
| Executor | @dev |
| Quality Gate | @qa |
| Quality Gate Tools | offline integration harness, malicious corpus, isolation and atomicity tests |

## Story

**As a** usuário de um projeto AEXOS,
**I want** ingerir e pesquisar documentos localmente com proveniência e isolamento,
**so that** meus agentes utilizem conhecimento verificável sem depender de API externa.

## Acceptance Criteria

1. Em perfil explicitamente local/offline, TXT, Markdown, PDF e DOCX suportados são ingeridos e pesquisados sem tráfego de rede, API key ou provider externo, comprovado por teste com rede bloqueada.
2. Antes da extração, a fonte passa por canonicalização de path, allowlist de origem, limite de tamanho, validação de MIME/extensão, hash e proteções contra traversal, symlink escape, SSRF e decompression bomb.
3. Cada chunk e resultado pesquisável mantém proveniência suficiente para identificar projeto, fonte, hash, tipo, localização interna como página/seção quando disponível, versão do extrator e instante de processamento.
4. O ledger só publica sucesso após extração, chunking e índice concluírem; falhas e cancelamentos não deixam fonte registrada como pronta nem índice parcial visível.
5. Reingestão do mesmo conteúdo é idempotente, mudança de conteúdo gera nova revisão rastreável e operações concorrentes não corrompem ledger ou índice.
6. Busca local retorna resultados determinísticos, limitados ao projeto e ao escopo autorizado, e não expõe chunks de outro projeto ou fonte não autorizada.
7. Logs, errors e receipts não contêm conteúdo integral, prompt, PII ou segredo por padrão, e os testes incluem entradas hostis e documentos malformados.

## Tasks / Subtasks

- [ ] Implementar preflight/quarentena de fontes (AC: 1, 2, 7).
- [ ] Implementar extractors curados para os quatro formatos com provenance (AC: 1, 3).
- [ ] Implementar chunking, índice lexical e query determinística (AC: 3, 6).
- [ ] Implementar ledger atômico, locks, revisions e receipts (AC: 4, 5).
- [ ] Implementar authorization scope e redaction (AC: 6, 7).
- [ ] Criar corpus offline normal, concorrente, cross-project, malformado e hostil (AC: 1–7).

## Dev Notes

- O primeiro slice usa busca local; embeddings não são requisito desta story.
- Registrar somente estado pronto após commit de ledger+índice; erro/cancel precisa compensar temporários.
- A URL remota é fora do slice inicial, salvo se o threat model aprovado definir fetcher separado; não permitir SSRF por conveniência.
- Proveniência deve sobreviver à query e permitir explicar a origem do resultado.
- Storage e paths finais dependem da arquitetura aprovada; todos devem ser resolvidos pelo escopo de projeto do AEXOS.
- Referência: `EPIC-CERBERUS-KNOWLEDGE-PLANE.md#ckp3--ingestão-e-busca-local-seguras`.

## Testing

- Unit: validators, hash, MIME, extractors, chunking, ranking, redaction e ledger transitions.
- Integration: ingest→search offline para quatro formatos, reingestão e revisão.
- Security: traversal, symlink, SSRF-shaped input, MIME spoof, malformed archive/document e secret fixtures.
- Concurrency/isolation: same-source races, crash injection e cross-project negative queries.
- Gates: lint, typecheck, focused tests, full tests e network-denied harness.

## 🤖 CodeRabbit Integration

- **Primary Type:** Security; **Secondary:** Integration, Data; **Complexity:** High.
- **Primary Agents:** @dev, @architect. **Supporting:** @data-engineer, @qa.
- [ ] Pre-Commit: validators, atomicity, deterministic query e redaction.
- [ ] Pre-PR: threat-model corpus e isolation.
- **Self-Healing:** @dev light, 2 iterations, 15 minutes, CRITICAL auto-fix; HIGH document-only.
- **Focus:** unsafe input, partial publication, races, provenance e cross-project leakage.

## Definition of Done

- [ ] Network-denied vertical slice passa para todos os formatos declarados.
- [ ] Nenhum estado parcial é observável após failure injection.
- [ ] Security/QA gates passam sem CRITICAL/HIGH aberto.
- [ ] Story checkboxes e File List estão atualizados.

## Story Draft Checklist Result

| Categoria | Status | Observação |
| --- | --- | --- |
| Goal & Context | PASS | Valor offline e escopo do slice claros. |
| Technical Guidance | PASS | Pipeline, ledger, provenance e segurança definidos. |
| References | PASS | ACs preservados e referência ao epic. |
| Self-Containment | PASS | Formatos, falhas e não objetivo de embeddings explícitos. |
| Testing | PASS | Corpus offline/hostil e atomicity definidos. |
| CodeRabbit | PASS | Security-first review configurado. |

**Final Assessment:** READY CONTENT / STATUS DRAFT — depende de CKP.2, arquitetura e threat model aprovados.

## Change Log

| Data | Versão | Descrição | Autor |
| --- | --- | --- | --- |
| 2026-08-17 | 0.1.0 | Draft criado a partir dos ACs preservados do epic. | Chronos (@sm) |

## Dev Agent Record

### File List

_A preencher por @dev._

## QA Results

_A preencher por @qa._

