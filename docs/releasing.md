# Publicar o @softize/lens

O comando é `pnpm release`. As guardas e a ordem das etapas são as mesmas do `@softize/base` e do
`@softize/opus` — este documento registra o que é específico daqui.

## O comando

```sh
pnpm release              # patch
pnpm release minor
pnpm release 0.8.0        # versão explícita
pnpm release none         # publica a versão atual, sem bumpar
pnpm release --dry-run    # valida tudo e desfaz o bump; não publica, commita nem empurra
pnpm release --skip-checks    # pula typecheck e testes
```

Antes de publicar, escreva a entrada no `CHANGELOG.md` com o heading no formato
`## <versão> — <AAAA-MM-DD>`. O muro é literal: exige um espaço e algo depois da versão, então
`## 0.8.0` sozinho não passa. A data é a convenção da casa; o muro não a valida.

## O que é específico deste pacote

**Publica `src` sem build.** O `files` inclui `src` e exclui os testes; não há passo de compilação.
Um `tsc` vermelho vai direto para o tarball e quebra o consumidor no import, não num passo de build
que alguém veria antes. Por isso o gate é `typecheck` **e** `test`, e o `typecheck` roda duas vezes
(`tsconfig.json` e `tsconfig.ui.json`, porque o painel tem configuração própria).

**A faixa de versão é `0.x`.** Enquanto o pacote estiver em zero major, uma mudança incompatível
sobe o **minor** — foi o caso da 0.7.0, que mudou o significado de `basePath` e a cadência das
grades. Diga isso na entrada do changelog em vez de confiar no número: em `0.x`, o número não avisa.

**O Opus é peer.** O `peerDependencies` aponta uma faixa de `@softize/opus`; quando a plataforma
adotar um major novo do Opus, a faixa aqui precisa acompanhar antes de publicar, senão o consumidor
resolve a lente contra um Opus que ela nunca viu. O muro de manifesto do script confere `file:` e
`link:` em dependências **e** peers, mas não julga a faixa — isso é leitura humana.

## Quando algo falha no meio

**O push foi recusado.** Nada foi publicado. Reconcilie a `main` — o commit do bump já está local —
e rode de novo.

**O publish falhou depois do push.** A `main` declara uma versão que o registry não tem. Resolva a
causa e rode `pnpm release none`, que publica sem bumpar outra vez; ou desfaça o anúncio com
`git revert HEAD` e empurre.

**Um gate falhou, ou você interrompeu com Ctrl-C.** O script restaura o `package.json` sozinho em
qualquer saída anterior ao commit — no dry-run e na release real. Ele reescreve apenas o campo
`version`, preservando outras edições: não use `git checkout package.json` numa árvore
compartilhada. Depois do commit a restauração para de valer, porque aí o bump já está na história.

## Depois de publicar

Nos consumidores, atualize a dependência e rode `pnpm install`. A lente entra pelo plugin do Vite
(`@softize/lens/vite`) e pelo handler (`createLensHandler`); não há materialização de artefatos,
então não existe passo de `setup` como no Opus e na Base.
