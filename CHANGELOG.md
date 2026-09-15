# Changelog

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

A migração está no [README](README.md#migração-a-partir-do-softizeopus-lens).
