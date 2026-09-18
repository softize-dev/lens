# Changelog

## 0.7.0

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

## 0.6.0

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

- O painel exige `base: '/'` no Vite do projeto. (Resolvido na 0.6.1.)
- Os peers do painel (`react`, `react-dom`, `@tanstack/react-query`, `lucide-react`, `vite`) são
  opcionais: sem eles a instalação passa e a falta aparece ao abrir `/lens`.

A migração está no [README](README.md#migração-a-partir-do-softizeopus-lens).
