# Epic CKP: Cerberus Knowledge Plane nativo do AEXOS

## Status

Draft

## Objetivo

Integrar as capacidades aproveitáveis do Cerberus ao AEXOS como um subsistema nativo, opcional e isolado de conhecimento, preservando o AEXOS como única autoridade sobre CLI, governança, agentes, squads, instalação, providers, eventos e release.

O epic não autoriza copiar o repositório Cerberus integralmente nem instalar seu CLI, roteador, hooks, projeções de IDE, registries ou superfícies concorrentes. A integração deve admitir somente capacidades explicitamente aprovadas por contrato e deve funcionar em modo local sem exigir API de IA.

## Resultado esperado

- O AEXOS oferece ingestão e busca local de conteúdo com proveniência, isolamento por projeto, rollback e operação determinística.
- Recursos de vídeo, providers externos e Conclave permanecem opcionais, governados e degradáveis.
- Não existe um segundo Master, registry, instalador, provider router, agente ou squad canônico.
- A instalação básica do AEXOS continua funcionando sem Python, credenciais externas ou download de modelos pesados.
- O Virtual Office observa eventos sanitizados emitidos pelo AEXOS; não controla o Cerberus nem recebe conteúdo privado por padrão.
- A promoção de release ocorre somente após evidência reproduzível de compatibilidade, segurança, idempotência, rollback e qualidade nas plataformas suportadas.

## Contexto e evidência de admissão

A auditoria inicial classificou o checkout atual do Cerberus como **NO-GO para incorporação direta**. Entre os bloqueadores observados estão imports Python ausentes, suíte de testes declarada mas inexistente, instalador e `postinstall` capazes de colidir com superfícies do AEXOS, pressupostos Unix incompatíveis com Windows, ausência de autorização/tenancy no MCP, ledger de ingestão não atômico, divergência de dimensão de embeddings e dependências incompletas.

Esses achados não impedem o reaproveitamento de capacidades; eles determinam uma fronteira de admissão fail-closed. O código upstream é material de origem, não uma segunda fonte de verdade executável.

## Princípios e invariantes

1. **CLI First:** toda capacidade deve funcionar pela CLI antes de qualquer projeção no Virtual Office.
2. **Autoridade única:** AEXOS Master, registry, lifecycle, provider routing, installer e release permanecem canônicos.
3. **Opt-in:** o knowledge plane nasce desabilitado e não altera o comportamento de instalações existentes.
4. **Local-first:** ingestão e busca básicas não requerem API externa nem conexão de rede.
5. **Fail-closed:** entrada inválida, autorização ausente, escopo desconhecido, integridade divergente ou dependência incompatível bloqueia a operação sem publicar estado parcial.
6. **Project isolation:** artefatos, índices, receipts e credenciais nunca atravessam projetos.
7. **No wholesale copy:** `.claude`, `.codex`, `.gemini`, `.grok`, hooks, agents, squads, package roots e instalador do Cerberus não entram no AEXOS por cópia direta.
8. **Provider governance:** todo provider melhorado passa pela factory e pelas políticas de orçamento, story binding e intent scan do AEXOS.
9. **Observabilidade sanitizada:** eventos carregam identidade e correlação, mas não conteúdo privado, prompts, PII ou segredos por padrão.
10. **Release evidence:** nenhum green parcial, commit ou publicação substitui o gate independente de QA.

## Escopo funcional

### Incluído

- Contrato versionado de capability admission e gateway AEXOS→Cerberus.
- Doctor/preflight cross-platform e resolução segura do runtime opcional.
- Ingestão local inicial de TXT, Markdown, PDF e DOCX.
- Hash, proveniência, chunking, busca lexical local, ledger transacional e rollback.
- Instalação/upgrade/desativação/reinstalação idempotentes e armazenamento por projeto.
- Vídeo/transcrição local como pacote opcional e isolado.
- Providers externos opcionais exclusivamente por governança AEXOS.
- Conclave governado e eventos sanitizados para observabilidade.
- Certificação de release, rollback e compatibilidade multi-plataforma.

### Fora do escopo

- Substituir o AEXOS, o AEXOS Master ou qualquer autoridade constitucional.
- Publicar Cerberus como produto ou instalador independente dentro deste epic.
- Importar o `orquestrador-global`, hooks ou registries do checkout upstream.
- Exigir API de IA, Python ou modelos de vídeo na instalação básica.
- Expor conteúdo integral de reuniões, fontes ou prompts ao Virtual Office sem política e consentimento explícitos.
- Declarar suporte a tipos de arquivo, providers ou plataformas sem testes de contrato e release.

## Requisitos rastreáveis

| ID | Requisito |
| --- | --- |
| CKP-FR-001 | O AEXOS deve admitir capacidades Cerberus por contrato versionado e deny-by-default. |
| CKP-FR-002 | O AEXOS deve expor um único gateway governado para operações do knowledge plane. |
| CKP-FR-003 | O modo local deve ingerir TXT, Markdown, PDF e DOCX e pesquisar conteúdo sem API externa. |
| CKP-FR-004 | Cada projeto deve possuir storage, índice, ledger e receipts isolados. |
| CKP-FR-005 | Instalação, upgrade, reinstalação, desativação e rollback devem ser idempotentes. |
| CKP-FR-006 | Vídeo/transcrição deve ser um recurso opcional separado da instalação básica. |
| CKP-FR-007 | Providers externos devem usar somente a autoridade e as políticas do AEXOS. |
| CKP-FR-008 | Conclave deve operar sob lifecycle AEXOS e emitir eventos sanitizados correlacionáveis. |
| CKP-NFR-001 | Nenhuma operação pode criar agentes, squads, skills ou comandos duplicados. |
| CKP-NFR-002 | Entradas devem ser validadas contra traversal, symlinks inseguros, SSRF, MIME spoofing e decompression bombs. |
| CKP-NFR-003 | Publicação de ledger e índice deve ser atômica ou compensável, sem sucesso parcial observável. |
| CKP-NFR-004 | A instalação básica deve permanecer funcional sem Python, rede ou credenciais externas. |
| CKP-NFR-005 | O release deve ser reproduzível e verificável em Windows, macOS e Linux. |

## Arquitetura-alvo resumida

```text
AEXOS CLI / Squads
        |
        v
AEXOS Governance + Knowledge Gateway
        |                         |
        v                         v
Cerberus Worker curado       AEXOS Event Bus
        |                         |
        v                         v
Project-scoped Knowledge     Virtual Office (read-only)
```

O worker é detalhe de implementação substituível. Ele não tem autoridade para registrar entidades, selecionar providers, alterar stories, instalar hooks ou publicar releases.

## DAG e waves

```text
CKP.1 Admission + Contract
  └─> CKP.2 Gateway + Doctor
        └─> CKP.3 Local Ingest + Search
              ├─> CKP.4 Installer + Storage + Rollback
              │     ├─> CKP.5 Optional Video
              │     └─> CKP.6 Enhanced Providers
              └─> CKP.7 Conclave + Events

CKP.1..CKP.7 ─> CKP.8 Release Certification
```

| Wave | Stories | Condição de entrada | Condição de saída |
| --- | --- | --- | --- |
| 0 | CKP.1 | Arquitetura, ADR e threat model revisáveis | Contrato e admission suite fail-closed |
| 1 | CKP.2 | CKP.1 Done | Gateway governado e doctor cross-platform |
| 2 | CKP.3 → CKP.4 | CKP.2 Done | Vertical slice local e lifecycle instalável/rollbackável |
| 3 | CKP.5 + CKP.6 | CKP.4 Done | Recursos opcionais não contaminam o core |
| 4 | CKP.7 | CKP.3 Done | Conclave governado e observabilidade sanitizada |
| 5 | CKP.8 | CKP.1–CKP.7 Done | Evidência de release e decisão independente de QA |

## Stories e Acceptance Criteria preservados

### CKP.1 — Capability admission e contrato versionado

1. Existe um contrato versionado `aexos.cerberus/v1` que define operações, envelopes de request/response/error, correlação, cancelamento, limites e regras de compatibilidade, validado por schema e testes de contrato.
2. A admissão é deny-by-default e contém uma allowlist explícita das capacidades inicialmente aceitas; CLI, installer, hooks, registries, routers, agents, squads e projeções de IDE do Cerberus são rejeitados por testes automatizados.
3. Um inventário reproduzível classifica cada artefato upstream como `admit`, `adapt`, `quarantine` ou `reject`, registra hash/proveniência e falha quando conteúdo não classificado entra no pacote curado.
4. O contrato preserva o AEXOS como autoridade exclusiva de identidade, lifecycle, provider routing, orçamento, story binding, intent scan, eventos e release, sem caminho alternativo de execução.
5. Fixtures cobrindo versão suportada, versão incompatível, operação desconhecida, payload inválido, timeout, cancelamento e erro do worker passam sem rede ou credenciais reais.
6. Nenhuma mudança desta story habilita o knowledge plane por padrão ou modifica a instalação e os fluxos existentes do AEXOS.

### CKP.2 — Gateway governado e doctor cross-platform

1. Todas as operações do knowledge plane atravessam um único gateway do AEXOS que exige projeto, identidade, capability, correlação e contexto de autorização válidos antes de iniciar o worker.
2. Intents automatizados exigem story binding, budget ceiling quando houver modelo e intent/injection scan; qualquer falha bloqueia a execução antes de spawn, leitura de fonte ou chamada de provider.
3. O doctor reporta separadamente estado `disabled`, `ready`, `degraded` ou `blocked`, com diagnósticos acionáveis para runtime, dependências, permissões, storage e versão de contrato.
4. A instalação básica e o doctor do AEXOS continuam passando quando Python e Cerberus não estão presentes; ausência de componente opcional não é falha do core.
5. A resolução de executável e paths funciona em Windows, macOS e Linux sem `python3`, `venv/bin`, separador de PATH, symlink ou shell script assumidos de forma fixa.
6. Testes provam timeout, cancelamento, cleanup do processo filho, propagação estável de exit code e ausência de processo órfão ou escrita parcial.

### CKP.3 — Ingestão e busca local seguras

1. Em perfil explicitamente local/offline, TXT, Markdown, PDF e DOCX suportados são ingeridos e pesquisados sem tráfego de rede, API key ou provider externo, comprovado por teste com rede bloqueada.
2. Antes da extração, a fonte passa por canonicalização de path, allowlist de origem, limite de tamanho, validação de MIME/extensão, hash e proteções contra traversal, symlink escape, SSRF e decompression bomb.
3. Cada chunk e resultado pesquisável mantém proveniência suficiente para identificar projeto, fonte, hash, tipo, localização interna como página/seção quando disponível, versão do extrator e instante de processamento.
4. O ledger só publica sucesso após extração, chunking e índice concluírem; falhas e cancelamentos não deixam fonte registrada como pronta nem índice parcial visível.
5. Reingestão do mesmo conteúdo é idempotente, mudança de conteúdo gera nova revisão rastreável e operações concorrentes não corrompem ledger ou índice.
6. Busca local retorna resultados determinísticos, limitados ao projeto e ao escopo autorizado, e não expõe chunks de outro projeto ou fonte não autorizada.
7. Logs, errors e receipts não contêm conteúdo integral, prompt, PII ou segredo por padrão, e os testes incluem entradas hostis e documentos malformados.

### CKP.4 — Installer, storage lifecycle e rollback

1. O instalador oferece o knowledge plane como feature opt-in desabilitada por padrão e não copia nem sobrescreve `.claude`, `.codex`, `.gemini`, `.grok`, hooks, agents, squads, registries ou package roots do Cerberus.
2. Instalação básica sem a feature mantém contagens, hashes e comportamento canônico do AEXOS, sem exigir Python, rede, credenciais ou downloads adicionais.
3. Instalar, reinstalar e executar upgrade da feature é idempotente: não duplica entidades, comandos, skills, hooks, configuração ou dados e preserva arquivos não pertencentes ao AEXOS.
4. Storage, ledger, índices, receipts e locks são resolvidos dentro do escopo do projeto, com canonicalização e bloqueio de path traversal, symlink escape e compartilhamento cross-project.
5. Desativação preserva dados por padrão, remoção destrutiva exige ação explícita e escopo confirmado, e rollback restaura a configuração e os artefatos gerenciados sem apagar conteúdo alheio.
6. Falhas injetadas em cada fase de install/upgrade deixam receipt verificável e convergem por rollback ou nova execução para um estado consistente.
7. Testes cobrem instalação limpa, brownfield, segunda instalação, upgrade, downgrade bloqueado, desativação, rollback e Windows/macOS/Linux.

### CKP.5 — Vídeo e transcrição local opcionais

1. Vídeo/transcrição é distribuído como recurso opcional separado e sua ausência não altera install, doctor, ingestão documental, busca ou testes obrigatórios do AEXOS Core.
2. A ativação apresenta previamente plataforma suportada, espaço estimado, dependências e downloads; nenhuma dependência pesada ou modelo é baixado sem opt-in explícito.
3. O pipeline valida fonte, container, MIME, duração/tamanho configurados e executáveis antes do processamento, aplicando as mesmas regras de isolamento, proveniência e rollback da ingestão documental.
4. Transcrição local funciona sem API externa em todas as plataformas declaradas como suportadas; plataforma não suportada falha antes do download com diagnóstico acionável.
5. Cancelamento, timeout ou falha removem temporários gerenciados e não publicam ledger/índice parcial, preservando evidência sanitizada da falha.
6. Testes usam fixtures pequenas e determinísticas, não exigem download de modelo ou acesso à rede no gate padrão e mantêm uma suíte opcional claramente separada para validação real do modelo.

### CKP.6 — Providers melhorados sob governança AEXOS

1. Embeddings, transcrição ou síntese por provider externo são acessados somente pela provider factory e pelas políticas do AEXOS, sem leitura direta de `.env`, SDK ou credencial pelo worker curado.
2. Cada operação que usa modelo declara provider/capability, orçamento aplicável, projeto, story/run correlation e política de dados antes da primeira chamada; ausência ou divergência bloqueia a operação.
3. O perfil local permanece a alternativa funcional e o provider externo pode ser desabilitado ou falhar sem impedir a instalação básica, o doctor e a busca lexical local.
4. Contratos de embedding registram provider, modelo e dimensão; dimensão incompatível bloqueia escrita/query com diagnóstico e sem coerção ou rebuild implícito.
5. Segredos nunca entram em argv, logs, receipts, eventos ou storage do projeto e testes com provider fake comprovam redaction, timeout, rate limit, retry limitado e circuit breaker.
6. Nenhum provider, modelo ou endpoint é habilitado por padrão, e testes provam que o perfil offline produz zero tráfego externo.

### CKP.7 — Conclave governado e eventos sanitizados

1. Conclave é iniciado somente pelo AEXOS com projeto, story/run, participantes canônicos, objetivo, autorização e budget ceiling válidos; o worker não cria ou promove agentes/squads.
2. Participantes são resolvidos exclusivamente pelo registry AEXOS e IDs desconhecidos, duplicados ou pertencentes a outro projeto são rejeitados antes da execução.
3. Cada sessão possui lifecycle determinístico com start, message-summary, decision, error/cancel e complete, incluindo correlação e ordem monotônica verificáveis.
4. Eventos para o Virtual Office usam o envelope canônico do AEXOS e contêm apenas estado e resumo sanitizado por padrão; conteúdo integral, prompts, fontes, PII e segredos não são transmitidos.
5. Persistência de transcrição integral é opt-in, escopada ao projeto, protegida pela política de acesso e independente da projeção visual read-only.
6. Testes cobrem colaboração paralela, cancelamento, participante indisponível, provider degradado, budget esgotado, ordem de eventos, redaction e ausência de vazamento cross-project.
7. A indisponibilidade do Virtual Office não bloqueia nem altera o resultado do Conclave, e a UI não consegue iniciar, autorizar ou modificar a sessão.

### CKP.8 — Certificação, versionamento e release seguro

1. O release candidate contém somente artefatos intencionais e classificados, possui manifest/hash/SBOM verificáveis e não inclui checkout upstream, segredos, caches, modelos, dados de projeto ou superfícies Cerberus rejeitadas.
2. CI executa lint, typecheck, testes AEXOS, contract/admission, segurança, installer lifecycle, suíte Python curada, sync/parity aplicáveis e tarball smoke tests em Windows, macOS e Linux.
3. Uma matriz de compatibilidade comprova instalação básica sem Python/rede, feature local, recursos opcionais, upgrade desde a versão suportada, segunda instalação, desativação e rollback.
4. Testes de segurança cobrem traversal, symlink escape, SSRF, MIME spoofing, decompression bomb, prompt injection, secret leakage, autorização e isolamento cross-project, sem findings CRITICAL ou HIGH abertos.
5. O soak test comprova ausência de processo órfão, lock abandonado, corrupção de ledger/índice, crescimento temporário não limitado e duplicação de agentes, squads, skills, comandos ou hooks.
6. A versão é calculada pela política semântica do AEXOS, a provenance/tag-base é reconciliada e somente @devops pode criar tag, publicar pacote ou promover release.
7. Rollback ensaiado restaura a versão anterior e mantém dados compatíveis ou bloqueia downgrade destrutivo com instrução explícita, receipt e caminho de recuperação.
8. @qa emite verdict independente `PASS`; qualquer evidência ausente, gate parcial ou waiver não autorizado mantém o release bloqueado.

## Critérios globais de conclusão

- [ ] CKP.1–CKP.8 estão `Done` com File Lists e evidências atualizadas.
- [ ] ADR, arquitetura, threat model e plano de QA estão aprovados por suas autoridades.
- [ ] Não há duplicidade de agentes, squads, skills, comandos, hooks ou registries após reinstalação e upgrade.
- [ ] O modo local funciona com rede bloqueada e sem credenciais.
- [ ] Instalação básica funciona sem Python e sem o knowledge plane.
- [ ] Rollback foi ensaiado em matriz cross-platform.
- [ ] QA independente emitiu `PASS` para o snapshot exato.
- [ ] DevOps validou provenance e executou exclusivamente o fluxo de release.

## Riscos e mitigação

| Risco | Mitigação obrigatória |
| --- | --- |
| Segunda fonte de autoridade | Gateway único, admission denylist e testes contra superfícies rejeitadas |
| Duplicidade após instalação | IDs canônicos, manifest ownership e testes de reinstalação/upgrade |
| Vazamento entre projetos | Storage/authorization scope obrigatório e testes negativos cross-project |
| Dependências Python frágeis | Runtime opcional, doctor e resolução cross-platform sem afetar o core |
| Conteúdo hostil | Quarentena, validação pré-extração e threat-model suite |
| Estado parcial/corrompido | Ledger transacional, locks, receipts e rollback por fase |
| Custo ou exfiltração por provider | Provider factory AEXOS, budget, opt-in, redaction e offline default |
| Observabilidade invasiva | Eventos mínimos/sanitizados e transcrição integral opt-in |
| Release falso-positivo | CI multi-plataforma, tarball real, soak e QA independente |

## Referências

- `.aexos-core/constitution.md` — CLI First, Agent Authority, Story-Driven Development, Quality First, Squad-First Portability e Model Governance.
- `.aexos-core/core/sdc/dispatch-adapter.js` — fronteira existente de governança para dispatch automatizado.
- `.aexos-core/infrastructure/integrations/ai-providers/ai-provider-factory.js` — autoridade existente de providers.
- `.aexos-core/core/events/` — envelope/eventos canônicos a preservar.
- `.aexos-core/core/doctor/` — padrão de diagnostics do framework.
- `packages/installer/src/` — lifecycle e ownership de instalação existentes.
- `docs/framework/epics/aexos-evolution/adr/ADR-AEX-004-DISTRIBUTION-PLUGIN-MCP.md` — contexto de distribuição/MCP ainda sujeito à autoridade constitucional.
- Documentos `ARCHITECTURE*`, `ADR*`, `THREAT*` e `QA*` desta pasta, quando aprovados, serão referências normativas complementares; divergências devem bloquear a transição das stories para `Ready`.

## Change Log

| Data | Versão | Descrição | Autor |
| --- | --- | --- | --- |
| 2026-08-17 | 0.1.0 | Epic e DAG inicial derivados da auditoria multidisciplinar e da decisão de integração nativa segura. | Chronos (@sm) |

