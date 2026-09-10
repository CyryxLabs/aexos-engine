# AEXOS

Agentic eXecution & Orchestration System, da Cyryx Labs. Instruções de agentes,
fluxos de desenvolvimento e ferramentas CLI no projeto para trabalhar com IA.

[English](README.md) · **Português** · [Español](README.es.md)

## Comece aqui

Você precisa de Node.js 18 ou superior, npm 9 ou superior, acesso à internet para
baixar o pacote e um ambiente de desenvolvimento com IA de sua escolha. Selecione
apenas o ambiente que utiliza; as outras integrações são opcionais. Acesso ao
repositório GitHub, instalação global e extensões pagas não são pré-requisitos
para começar com o Core.

Confira a versão pública:

```bash
npm view @aexos/core version
npx @aexos/core --version
```

Crie um projeto:

```bash
npx @aexos/core init my-project
cd my-project
npx @aexos/core doctor
```

Para um projeto existente, execute este comando dentro da pasta dele:

```bash
npx @aexos/core install
```

`init` exige o nome de uma pasta; `install` usa a pasta atual. Ambos utilizam o
mesmo pacote npm. Após instalar, reabra seu ambiente de IA no projeto. Ative um
agente Core pela interface de agentes ou skills do seu ambiente e peça:

```text
@aexos-master
*help
```

O objetivo é receber a apresentação do agente e seus comandos disponíveis.
Copiar os arquivos não comprova que o ambiente de IA os carregou; essa ativação
é uma etapa separada. Consulte o [guia de IDEs](docs/ide-integration.md).

## Versão pública e candidato local

Verificado em **2026-09-08**: a tag `latest` no npm apontava para **5.3.0**.
As correções de instalação estão em revisão no [PR #4](https://github.com/CyryxLabs/aexos-engine/pull/4).
Esta alteração de documentação não publica uma versão nem muda a versão do pacote.
O desenvolvimento mais amplo da versão 6.x é separado e não é instalado pelo comando npm.

Na verificação limpa do pacote público 5.3.0, `init` terminou com código 0 e
instalou 12 arquivos de agentes Core. O `doctor` terminou com código 1 e falhas
em `rules-files`, `claude-md`, `npm-packages` e `hooks-claude-count`; o banner
também marcou agentes como ausentes incorretamente. A ajuda de `init` ainda
mostra o comando antigo do GitHub. Esses defeitos observados foram corrigidos
no candidato local, cujas verificações de inicialização padrão passaram, mas
a versão npm corrigida ainda não foi publicada. Esse resultado do Doctor público,
sozinho, não prova que todos os arquivos estejam ausentes. As correções locais
ainda não estão disponíveis por `npx @aexos/core`.

## Core e extensões pagas opcionais

O Core continua gratuito para começar. A decisão de distribuição aceita mantém
o framework, os 12 agentes de desenvolvimento e o squad Security no pacote Core
público. Squads adicionais pagos são distribuídos privadamente, após autenticação
do direito de acesso e verificação do pacote assinado. Esse é o limite de conteúdo planejado
para a versão 6.x. Esta branch de documentação preserva a lista de arquivos do
pacote 5.3.0; ela não implementa esse limite.

A entrega paga ainda está em certificação de ponta a ponta. As verificações
locais não certificam uma jornada real de checkout, download e instalação paga.
Cada cópia publicada continua sujeita à licença que a acompanha. Esta
documentação não concede novos direitos nem impõe restrições retroativas.

## Próximos passos

- [Primeiros passos](docs/getting-started.md)
- [Guia de instalação](docs/installation/README.md)
- [Solução de problemas](docs/guides/installation-troubleshooting.md)
- [Decisão de distribuição](docs/framework/epics/aexos-evolution/adr/ADR-AEX-011-CORE-FREE-PAID-SQUAD-DISTRIBUTION.md)
- [Referência completa do checkout, em inglês](README.md#contents)

Esta é a entrada principal em português; os guias detalhados ainda podem estar
em inglês. A referência do checkout descreve o código atual. Confira a ajuda da
versão instalada antes de utilizar comandos além deste caminho inicial.
