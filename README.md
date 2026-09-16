# Lens

> **Status:** v0.6 — leitura estática, Presentations, Produtos de Dados, telemetria local e painel
> no pacote. Uma versão, sem semver por módulo. Compatível com `@softize/opus` 18.

> **Veio do `@softize/opus-lens`?** O pacote mudou de nome na 0.6.0 e passou a trazer o painel.
> Veja [Migração a partir do `@softize/opus-lens`](#migração-a-partir-do-softizeopus-lens).

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

## Como as peças se encaixam

A lente tem três entradas, e cada uma roda num lugar:

| Entrada | Onde roda | Papel |
| --- | --- | --- |
| `@softize/lens` | serviço Node do projeto | coleta a execução, lê a declaração e responde as rotas de dados |
| `@softize/lens/ui` | navegador, compilado pelo Vite do projeto | o painel |
| `@softize/lens/vite` | dev server do projeto | serve o painel em `/lens` e encaminha as rotas de dados |

A entrada do plugin é JavaScript com tipos declarados, porque o `vite.config.ts` é carregado pelo
Node, que não remove tipos de arquivos dentro de `node_modules`. Painel e servidor são fonte
TypeScript, compilados pelo Vite e pelo carregador do serviço (`tsx`, por exemplo).

O painel é uma página separada da aplicação, servida só pelo dev server. Ele usa o CSS do projeto,
então herda o tema e a versão do Opus UI que o projeto já carrega.

## Montagem

### 1. No serviço: coleta e rotas de dados

```ts
import { createLens } from '@softize/lens'

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

As rotas do painel são um handler Fetch padrão: recebe um `Request` e devolve um `Response`, ou
`null` quando o pedido não é da lente. O host só adapta a entrada ao servidor que usa. Com Fastify:

```ts
if (lens.enabled) {
  app.route({
    method: ['GET', 'POST'],
    url: '/__lens/api/*',
    handler: async (request, reply) => {
      const response = await lens.handle(new Request(new URL(request.url, 'http://lens.local'), { method: request.method }))
      if (response === null) return reply.callNotFound()
      return reply.code(response.status).type('application/json').send(await response.text())
    },
  })
}
```

Desligada, `instrument` devolve os mesmos adapters, o `log` não grava e `handle` devolve `null` para
tudo: manter a montagem no código não muda o comportamento do serviço.

A ativação tem três degraus, nesta ordem: `createLens({ enabled })` explícito decide sozinho;
sem ele, `NODE_ENV=production` mantém a lente desligada mesmo com `LENS_ENABLED=true`; fora de
produção, vale o `LENS_ENABLED`. Um projeto que precise ligá-la em produção passa `enabled` e
assume a decisão.

### 2. No app: o painel

O painel usa a instalação do projeto, então ele precisa ter `react`, `react-dom`,
`@tanstack/react-query`, `lucide-react` e `vite`. Os cinco são peers opcionais, porque quem só
coleta telemetria no servidor não precisa de nenhum deles: a instalação passa em silêncio e a falta
apareceria ao abrir `/lens`.

```ts
// vite.config.ts
import { lens } from '@softize/lens/vite'

export default defineConfig({
  plugins: [react(), tailwindcss(), lens({ target: 'http://127.0.0.1:7012' })],
})
```

`target` é o endereço do serviço que monta o handler; o plugin encaminha `/__lens/api` para ele. Sem
`target`, o projeto configura o próprio proxy.

O Tailwind do projeto precisa enxergar as classes do painel, como já enxerga as do Opus UI. No CSS
de entrada:

```css
@source '../node_modules/@softize/lens/src/ui/**/*.{ts,tsx}';
```

O painel abre em `/lens`. Cada tela tem endereço próprio (`/lens/actions`, `/lens/r/<requestId>`),
para poder ser colada numa conversa ou num commit.

### Opções

| Onde | Opção | Padrão | Para quê |
| --- | --- | --- | --- |
| `lens()` e `createLens()` | `apiBase` | `/__lens/api` | prefixo das rotas de dados (na raiz, `/`, o que a lente não reconhece volta ao host) |
| `lens()` | `basePath` | `/lens` | prefixo da página, relativo ao `base` do projeto |
| `lens()` | `css` | `/src/index.css` | CSS de onde o painel herda tema e Tailwind |
| `createLens()` | `checkDir` | raiz do processo | pacote onde a régua do Opus roda |
| `createLens()` | `onError` | — | aviso quando uma leitura falha (a resposta segue como 503) |

O `basePath` é relativo ao `base` do Vite: com `base: '/app/'`, o painel abre em `/app/lens`. As
rotas de dados não recebem esse prefixo, porque pertencem ao servidor observado e não ao dev server.

Quem hospeda o painel fora de um dev server Vite — a cabine do Maestro, por exemplo — monta direto:

```ts
import { mountLens } from '@softize/lens/ui'

mountLens(document.getElementById('root')!, { basePath: '/maestro/lens', apiBase: '/maestro/__lens/api' })
```

### Inspeção sem processo em execução

Para inspecionar um diretório qualquer — um worktree, por exemplo:

```ts
const { structure, docs, ai, project, tests } = await inspect({ root, dirs })
```

## Migração a partir do `@softize/opus-lens`

A API do servidor não mudou. A migração troca o nome e remove o painel que o projeto mantinha:

1. Trocar a dependência `@softize/opus-lens` por `@softize/lens` e os imports correspondentes.
2. Apagar o painel local e a entrada HTML dele, e registrar o plugin `lens()` no `vite.config.ts`.
3. Substituir as rotas escritas à mão por `lens.handle`. Se a régua rodava num diretório diferente da
   raiz do processo, informar `checkDir`.
4. Acrescentar o `@source` do painel ao CSS de entrada.
5. Conferir que o projeto tem os peers do painel, listados acima.

`@softize/opus` passou a ser peer dependency: a lente usa a instalação do projeto em vez de trazer a
própria cópia.

## Fronteira

A lente **apresenta**; ela não é dona do vocabulário. Quem sabe o que é uma action é o Opus, e é
dele que vêm o manifest, a régua do `opus check` e a introspecção. A dependência aponta sempre para
fora: `@softize/lens` → `@softize/opus`, nunca o contrário.

Por isso ela também não mora dentro do Opus: o painel é ferramenta de desenvolvimento e não deve
viajar no pacote que os aplicativos carregam em produção.

Dentro do pacote há uma segunda fronteira, entre servidor e navegador: o painel conhece só os tipos
do servidor, e o servidor não importa o painel. As duas regras são verificadas por teste.

## Registro

O que a execução produz fica num buffer circular por contagem, em arquivos JSON num diretório
descartável. Sem tabela no banco da aplicação e sem rotina de expurgo: passou do limite, o registro
mais antigo sai na própria escrita.
