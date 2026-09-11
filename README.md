# Opus Lens

> A série 0.5 usa os contratos de Presentation e Produtos de Dados do `@softize/opus` 16.1.

> **Status:** v0.5 — leitura estática, Presentations, Produtos de Dados e telemetria local. Uma versão, sem semver por módulo.

A lente de desenvolvimento de um projeto Opus. Responde duas perguntas que costumam ficar sem
resposta enquanto se programa: **o que esta requisição fez** e **o que este projeto declara**.

Não é observabilidade de produção. Para isso o Opus já tem `ObservabilityAdapter` e o driver
OpenTelemetry, que exportam span para um APM. Aqui o problema é outro — inspecionar agora, no
próprio ambiente, com o projeto na mão. É o papel que o Clockwork e o Laravel Telescope cumprem no
ecossistema PHP.

## O que ela lê

**Da execução**, decorando os adapters que o app já registra — sem instrumentação nova no runtime:

- action e reaction, com duração, desfecho e a cadeia de proveniência até a origem humana;
- consultas ao banco, pelo `log` do Kysely, que é quem as enxerga;
- enfileiramentos, eventos de domínio e chamadas de modelo.

**Da declaração**, a partir do `.opus/manifest.json` que o `opus gen` publica:

- domínios, actions (com entrada, saída, permissão e o que emitem e invalidam), entidades e seus
  campos, Presentations, Produtos de Dados, dicionários, reactions e schedules;
- linhagem declarada entre Fontes, entities, Produtos de Dados e suas Actions de interface;
- cobertura de documentação, conformidade pela régua do Opus **do projeto observado**, inventário
  de testes e a configuração de agentes que o repositório carrega.

## Fronteira

A lente **apresenta**; ela não é dona do vocabulário. Quem sabe o que é uma action é o Opus, e é
dele que vêm o manifest, a régua do `opus check` e a introspecção. A dependência aponta sempre para
fora: `@softize/opus-lens` → `@softize/opus`, nunca o contrário.

Por isso ela também não mora dentro do Opus: o painel é ferramenta de desenvolvimento e não deve
viajar no pacote que os aplicativos carregam em produção.

## Montagem

```ts
import { createLens } from '@softize/opus-lens'

const lens = createLens()

const runtime = createRuntime({
  server,
  auth,
  ...lens.instrument({ observability, audit, queue, eventBus }),
  data: kyselyData({ db }),
})
```

Consultas entram na montagem da conexão:

```ts
new Kysely({ dialect, plugins, log: lens.kyselyLog() })
```

Desligada, `instrument` devolve os mesmos adapters e o `log` não grava: manter a montagem no código
não muda o comportamento do serviço. A ativação é explícita (`LENS_ENABLED=true`) e nunca vale em
produção.

Para inspecionar um diretório qualquer — um worktree, por exemplo — sem depender do processo em
execução:

```ts
const { structure, docs, ai, project, tests } = await inspect({ root, dirs })
```

## Registro

O que a execução produz fica num buffer circular por contagem, em arquivos JSON num diretório
descartável. Sem tabela no banco da aplicação e sem rotina de expurgo: passou do limite, o registro
mais antigo sai na própria escrita.
