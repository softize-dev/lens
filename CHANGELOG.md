# Changelog

## 0.9.0 — 2026-10-03

A lente passa a mostrar o que a IA alcança em cada action e o que cada assistente de recurso entrega
ao modelo, lendo o manifest como antes (ADR 0053 do Opus).

- A lente **Ações** ganha as colunas **Efeito** (leitura ou escrita), **Dado pessoal**, **IA**
  (publicada ou não, e se é destrutiva ou pede confirmação) e **Assistente** (o tipo de recurso de
  que a action é dona).
- A lente nova **Assistentes** lista, por tipo de recurso, a action dona, o nome do assistente, a
  Habilidade que a IA segue, o campo do título, os campos enviados ao modelo, o teto e se a action
  devolve dado pessoal.
- A estrutura publicada por `readStructure` ganha, em cada action, `effect`, `personalData`, `ai` e
  `assistant`. Um campo que o manifest não traz fica ausente, e o painel mostra "Não declarado" ou
  "O manifesto não informa" em vez de um "não" que ninguém declarou.
- A publicação para a IA e os assistentes chegam ao manifest a partir do Opus 25.2. Com um manifest
  anterior, as colunas novas, inclusive **Assistente**, mostram que o manifesto não informa, e a lente
  **Assistentes** pede para atualizar o Opus e rodar `opus gen`. Um manifesto sem nenhuma action não
  é tratado como antigo.
- O peer de `@softize/opus` passa a aceitar a linha 25 (`^24.0.0 || ^25.0.0`). Sem isso, só um
  projeto fora da faixa declarada veria os assistentes. Typecheck e testes passaram contra o Opus
  25.1.0 instalado do npm; o repositório continua testando contra a 24.0.0, o piso da faixa.

## 0.8.0 — 2026-10-01

- O painel adota o `Surface` do Opus 24 no lugar do `Card`, removido nessa versão.
- O menu lateral passa a compor cabeçalho e corpo rolável com elementos estruturais próprios; `Pane`
  fica restrito ao papel de casca redimensionável e não fornece mais `PaneHeader` nem `PaneBody`.
- O peer de `@softize/opus` passa a exigir a linha 24. A mudança é incompatível de propósito: versões
  anteriores do design system ainda expõem a composição removida e devem continuar na Lens 0.7.

## 0.7.1 — 2026-09-26

- A faixa de `@softize/opus` nos `peerDependencies` passa a aceitar a 19: era `^18.0.1`, e a
  plataforma que consome a lente adotou o Opus 19.0.0 em 24/09. A declaração estava simplesmente
  falsa, e o `pnpm install` avisava em cada execução.
- Nada mudou no código do painel. O `PaneHeader` da 19.0.0 aceita conteúdo livre e não exige
  título (`titleRequired={false}`), que é como a lente o usa, e o divisor inferior já existia
  antes — só passou a ser derivado do layout em vez de fixo.

**Verificado:** o `PaneHeader` da 19.0.0 traz altura fixa de `3.75rem` e `flex items-center`, que o
anterior não tinha, e a marca da lente empilha duas linhas num espaço que antes crescia com o
conteúdo. A captura do painel em 25/09 mostra o par título/subtítulo inteiro, com respiro acima e
abaixo e o divisor alinhado — a altura fixa não apertou nada.

## 0.7.0 — 2026-09-19

Versão menor, e não correção: a faixa `^0.6.0` segura esta atualização de propósito. Quem
contornava o `base` passando o prefixo dentro do `basePath` precisa retirá-lo, e tanto a coluna de
corpo das Presentations quanto a cadência das grades mudam o que a tela mostra.

- O painel deixa de usar breakpoints de viewport: desde o Opus 18.1 a interface assume largura
  mínima de desktop, e a lente passa a seguir a mesma régua do projeto que observa. As três grades
  com prefixo responsivo passam a ter cadência fixa.
- A coluna de corpo das Presentations volta a dizer o que ocupa o recurso. Uma Presentation declara
  uma action **ou** um componente no corpo, e a lente lia só a action: telas que declaram componente
  — a maioria das de configuração — apareciam como um traço. O campo novo `body` da projeção traz
  um ou outro, e `bodyAction` segue sendo a action quando existe.

- O plugin Vite funciona sob qualquer `base` do projeto: `basePath` passa a ser relativo ao `base`,
  e o painel lê o endereço do navegador já com o prefixo. Com `base: '/app/'`, o painel abre em
  `/app/lens`.
- **Se você contornava isso na 0.6.0**, passando o `base` dentro do `basePath` (`basePath:
  '/app/lens'` com `base: '/app/'`), retire o prefixo: agora ele seria somado duas vezes, e a URL
  de sempre passaria a servir o app hospedeiro em vez do painel, sem erro nenhum.
- Um teste passa a subir um dev server Vite de verdade. Foi o que mostrou que prefixar as URLs do
  HTML no plugin somava ao prefixo que o próprio Vite aplica, e deixava o painel em branco.
- A ativação (explícito vence produção, que vence `LENS_ENABLED`) passa a ter teste.
- O código publicado não cita mais uma ADR que vive no repositório de um consumidor.

## 0.6.0 — 2026-09-16

O pacote passa a se chamar `@softize/lens` e traz o painel, que antes cada projeto mantinha no
próprio código.

### Mudanças que exigem ação

- **Novo nome.** `@softize/opus-lens` vira `@softize/lens`. O nome antigo fica descontinuado na
  0.5.x e não recebe versões novas.
- **`@softize/opus` virou peer dependency** (`^18.0.1`). A lente usa a instalação do projeto em vez
  de trazer uma cópia fixa, que duplicava o Opus na árvore quando o projeto estava numa versão
  diferente.

### Novidades

- `@softize/lens/ui`: o painel (requisições, código, IA e projeto), com `mountLens` e `LensRoot`.
  Os prefixos da página e dos dados são configuráveis.
- `@softize/lens/vite`: o plugin `lens()`, que serve o painel no dev server e encaminha as rotas de
  dados. Não participa do build de produção.
- `lens.handle(request)` e `createLensHandler`: as rotas de dados como handler Fetch padrão.
- `lens.conformity()` e a opção `checkDir`, para a régua rodar no pacote certo.

### Limitações conhecidas

- O painel exige `base: '/'` no Vite do projeto. (Resolvido na 0.7.0.)
- Os peers do painel (`react`, `react-dom`, `@tanstack/react-query`, `lucide-react`, `vite`) são
  opcionais: sem eles a instalação passa e a falta aparece ao abrir `/lens`.

A migração está no [README](README.md#migração-a-partir-do-softizeopus-lens).
