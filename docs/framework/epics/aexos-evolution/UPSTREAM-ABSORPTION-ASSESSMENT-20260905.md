# AEXOS — avaliação e absorção dos quatro upstreams

Data: 2026-09-05. Story: AEX-4.1. Implementação local, sem publicação.

## Conclusão executiva

A evolução útil é tornar verificáveis os processos que o AEXOS já descreve.
O catálogo existente é amplo; duplicar squads, importar outra interface inteira
ou aumentar o número de personas não demonstra maior capacidade operacional.
Recomendação: preservar o núcleo, contratos, registry e CLI; ampliar execução
governada e comprovação de resultados antes de multiplicar superfícies.

Esta entrega inventaria todos os caminhos versionados dos quatro snapshots e
analisa semanticamente componentes selecionados de arquitetura, execução,
governança, squads, projeções e pesquisa. **Não equivale a uma revisão semântica
linha a linha de todos os arquivos**, auditoria de segurança completa ou teste
dos serviços upstream. Nenhum instalador upstream foi executado. Submódulos
privados não foram obtidos. Arquivos semelhantes não comprovam paridade.

## Fontes fixadas e método reproduzível

| Repositório | Commit | Caminhos versionados | Limite de reutilização observado |
| --- | --- | ---: | --- |
| SynkraAI/aiox-core | `4ef6530ff03b83aea953e4a426f95e012b8b70c5` | 3023 | LICENSE MIT com avisos existentes; Pro é submódulo separado |
| SynkraAI/aiox-squads | `66118db856ef655b8cf5ba44eda963ad4d0b1d78` | 1075 | Sem LICENSE na raiz; licença localizada em apex não abrange automaticamente os demais squads |
| SynkraAI/aiox-dashboard | `577a696a80321c7e325c2359a50ce7320563a2fe` | 1358 | Sem LICENSE na raiz; dois submódulos não inspecionados |
| oalanicolas/aiox-research | `271883ad76759d4351df1182406687fecc34710f` | 164 | Elastic License 2.0 e avisos de terceiros; modos completos dependem de artefatos adicionais |

O inventário `UPSTREAM-SNAPSHOTS-20260905.json` registra os 5.620 caminhos,
modo Git, blob, SHA-256 do arquivo, categoria e candidato de correspondência
local. A normalização de nomes AIOX/AIOS/Cyryx/AEXOS serve somente à comparação;
não modifica marcas, atribuições nem arquivos. Uma correspondência por caminho
não prova equivalência funcional. Ausência de caminho também não prova ausência
de capacidade, especialmente em aplicações com arquitetura diferente.

| Fonte | Idêntico em bytes | Idêntico normalizado | Diferente: revisar | Sem caminho equivalente | Submódulos |
| --- | ---: | ---: | ---: | ---: | ---: |
| core | 506 | 554 | 1430 | 532 | 1 |
| squads | 484 | 20 | 537 | 34 | 0 |
| dashboard | 0 | 0 | 12 | 1344 | 2 |
| research | 0 | 0 | 8 | 156 | 0 |

Esses números abrangem documentação, testes, imagens e histórico. No recorte
canônico core/development/infrastructure do core, há 875 caminhos: 353 iguais
após normalização, 515 diferentes e sete ausentes. Os sete são um sync específico
do fornecedor, um validador Grok e cinco templates de hooks Grok. No recorte de
squads, parte das ausências corresponde a renomeações, configurações consolidadas
em squad.yaml, relatórios históricos e documentação Pro.

Reproduzir sem instalar dependências upstream:

```powershell
node scripts/audit-upstream-snapshots.js --source-root=C:/tmp/aexos-upstream-review-20260905 --output=docs/framework/epics/aexos-evolution/UPSTREAM-SNAPSHOTS-20260905.json
```

O relatório reflete o checkout local observado durante a execução, incluindo
trabalho anterior não commitado. Não representa comparação com uma release
imutável do AEXOS. Reexecutar depois de mudanças produz outra fotografia.

## Mapeamento de arquitetura e decisões

| Origem / mecanismo examinado | Situação no AEXOS | Decisão desta entrega |
| --- | --- | --- |
| core: agents, tasks, workflows, registry e autoridade | Estrutura já presente; 12 agentes canônicos | REUTILIZAR; não duplicar framework |
| core: projeções multi-host e validador Grok | Gerador local existente; API do validador upstream difere | IMPLEMENTADO validador original que compara 61 projeções em diretório temporário |
| core: cinco templates de hooks Grok | Ausência de equivalentes naquele recorte | ADAPTAÇÃO PENDENTE de eventos/paths e testes do host; copiar hook não prova execução |
| core: sync Synkra e submódulo Pro | Dependência de fornecedor e fonte privada | EXCLUIR da integração |
| squads: dispatch, deep-research, kaizen, produtos e departamentos | Grande parte já registrada localmente | REUTILIZAR métodos; IMPLEMENTADO diagnóstico transversal de contratos |
| squads: histórico, renomeações e personas públicas | Nem toda diferença corresponde a feature | NÃO IMPORTAR em massa ou copiar identidades |
| dashboard: React/Vite, árvore Next legada e engine Bun/Hono | AEXOS já tem runtime e Virtual Office em desenvolvimento local | NÃO IMPORTAR uma segunda engine; considerar projeções da execução existente |
| dashboard: jobs, workflows, cron, webhooks, SQLite e websocket | Há fundações locais, sem equivalência demonstrada por este estudo | ADAPTAÇÃO PENDENTE por contrato e testes de recuperação/idempotência |
| dashboard: decisão por palavras em output | Pode aceitar texto não vazio como sucesso | REJEITAR; IMPLEMENTADA aceitação explícita por artefatos/checks |
| research: observatório, fontes, critérios e comparação | Não havia este avaliador determinístico no recorte local | IMPLEMENTADA rubrica original com pesos, fontes, mínimos, empates e insuficiência de evidência |
| research: perfis e níveis legacy/partial/rich/gold | Taxonomia de completude útil, não certificação | ADAPTAÇÃO PENDENTE para contratos próprios por perfil |
| research: execução local e modos Pro/Enterprise | Dependências e limites próprios | NÃO COPIAR executor nem contornar disponibilidade |

Referências concretas dos comportamentos rejeitados nos snapshots fixados:

- Dashboard `engine/src/core/authority-enforcer.ts`, linhas 61–72: ausência de
  regras permite execução e há bypass por superusuário. Não adotar esse default.
- Dashboard `engine/src/core/workflow-engine.ts`, linhas 387–400: heurística de
  palavras de aprovação e fallback de texto não vazio. Não usar como evidência
  suficiente de entrega.
- Research `src/lib/research-cli.server.ts`, linha 767: argumento
  `--permission-mode bypassPermissions`. Não transportar ao runtime AEXOS.
- Research `RESEARCH-OBSERVATORY-CONTRACT.md` e
  `DOCTRINE-decision-in-one-click.md`: completude de artefatos e decisão com
  pesos inspiram requisitos; a implementação entregue é original.

Não houve transplante de código de repositórios com licença indefinida nem
ingestão de fontes privadas. Esta constatação não certifica a situação jurídica
de todo o código preexistente do AEXOS.

## Capacidades implementadas nesta story

1. Inventário reproduzível com hashes e limites explícitos de comparação.
2. `aexos capabilities`: examina tasks core e componentes declarados dos squads
   registrados; distingue contrato V1, legado, definição ausente/inválida e
   erro de manifesto. Nunca converte cobertura em prontidão operacional.
3. `verifyTaskOutcome`: exige sucesso explícito, artefatos declarados reportados
   e existentes, tipo correto e paths internos sem symlinks/junctions.
   Checks de conteúdo/comando precisam de adaptador confiável que retorne
   exatamente `true`; nenhum texto de task executa shell automaticamente.
4. `AgentRuntime.execute({ requireAcceptance: true, contract, ... })`: captura
   o contrato antes de chamar o provider, verifica a entrega antes de retorná-la
   como aceita e preserva a liquidação de custo quando a aceitação falha.
   Execuções legadas continuam sem selo de aceitação.
5. Rubrica de decisão: pesos explícitos, overrides validados, referência de
   fonte por score, mínimos que não podem ser compensados, empates explícitos,
   ausência de evidência sem pontuação inventada. Não consulta/verifica fontes.
6. Comparação read-only das projeções Grok com o gerador AEXOS existente.

Não foram adicionadas dependências. As implementações anteriores de runtime,
broker, missões duráveis, Cerberus, segurança, workflow engineering e Virtual
Office não são creditadas a esta story.

## O que os mapas empresariais fornecidos realmente exigem

Os anexos apresentam CEO/humano, conselheiros, chiefs e especialistas; OPS faz
descoberta, mapeamento, arquitetura, executores, tasks, automação e QA. Vendas,
marketing, CS, produto e administração precisam de entradas, saídas, responsáveis,
handoffs e critérios de término, além de memória departamental e visão executiva.

Isso faz sentido como modelo de trabalho. Para ser software operacional, cada
processo precisa de contrato de dados, sistema de registro, integração, permissão,
execução e evidência. Nomear um agente financeiro não concede acesso ao ERP;
descrever um processo comercial não demonstra atendimento ao cliente em produção.
Duplicações de layout, resultados inconsistentes, notas universais acima de 70%,
personas de celebridades e promessas de compliance nos anexos não viram requisitos
automáticos. Qualidade mínima depende do risco e do resultado específico.

Priorizar fluxos completos e medidos:

| Fluxo | O que já é reutilizável | Trabalho operacional que ainda exige integração |
| --- | --- | --- |
| Requisito → software entregue | analyst/PM/PO/UX/architect/dev/QA/devops e SDC | Contratos reais por etapa, ambientes e aceitação do usuário |
| Processo empresarial → automação | ops e workflow-engineering locais | Dados reais, integração, exceções, compensações e resultado observado |
| Lead → proposta → onboarding | sales, marketing e customer-success | CRM, documentos, consentimentos/permissões e handoff comprovado |
| Pesquisa → decisão | deep-research, produtos e nova rubrica | Coleta verificável, atualização de fontes e teste das premissas |
| Operação administrativa | business-admin e controles de autoridade | Segregação de funções, sistemas de registro e adaptadores por operação |

O Master deve selecionar capacidades e acompanhar dependências, orçamento e
evidências. Autoridade executiva não deve equivaler a permissão técnica irrestrita.
Otimizar custo por resultado aceito, retrabalho, prazo, falhas e taxa de conclusão;
não prometer simultaneamente melhor qualidade e menor custo do mercado sem benchmark.

## Limites e próximos blocos necessários

- Migrar contratos gradualmente: a fotografia inicial contém 580 tasks declaradas
  entre core e 22 squads, apenas uma com contrato V1 válido. Oito tasks curator
  possuem frontmatter legado incompatível com o parser V1; isso não prova que
  sejam métodos inúteis, mas impede contabilizá-las como contratos executáveis.
- Cobrir toda rota de execução com o runtime: a opção de aceitação desta entrega
  é uma migração explícita, não enforcement universal; rotas antigas continuam
  precisando de integração. Provider bem-sucedido não implica resultado aceito.
- Verificação de arquivo é pontual. Não é sandbox do sistema operacional, não
  impede concorrência maliciosa/TOCTOU, não autentica artefatos após a verificação
  e não substitui política de escrita/exclusão. Exclusão segura de arquivos de
  sistema exige broker efetivo em todos os caminhos e isolamento no host.
- Adaptadores de conteúdo são código confiável do operador; precisam de limites
  de tempo/recursos, isolamento e critérios próprios. Os checks disponíveis não
  demonstram correção semântica genérica, segurança completa ou satisfação do cliente.
- Reusar missões duráveis para jobs, retomada, cancelamento e retry idempotente;
  conectar painel ao estado persistido, sem criar um segundo executor permissivo.
- Implementar conectores departamentais com identidade, escopo e auditoria por
  operação; provar fluxos reais antes de afirmar cobertura operacional da empresa.
- Certificar Codex, Claude, Gemini e Grok separadamente: projeções e prompts não
  garantem paridade de ferramentas, eventos, background, filesystem ou permissões.
  A nova CLI pode ser chamada por um host autorizado; não é uma nova GUI completa.
- Continuar revisão semântica das diferenças priorizadas, incluindo os cinco
  hooks Grok, observatório de pesquisa, engine de jobs e conectores. O inventário
  é a fila rastreável dessa análise, não uma declaração de que ela terminou.

Guia de uso: `docs/guides/capability-evidence.md`. Resultados de validação e lista
de arquivos desta entrega: story AEX-4.1.
