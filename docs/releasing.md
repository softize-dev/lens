# Publicar o @softize/lens

O comando é `pnpm release`. Assim como na Base e no Opus, a publicação pública exige uma
`main` limpa e sincronizada, changelog e gates. O commit da versão chega ao remoto antes do
pacote chegar ao registry. Este documento registra os gates e a recuperação específicos daqui.

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

**O publish falhou.** O commit que declara a versão já está em `origin/main`. Confira a
versão exata com `npm view @softize/lens@<versão> version`: a falha pode ter ocorrido depois
de o registry aceitar o pacote. Se estiver ausente, corrija a causa e rode `pnpm release none`.
Se abandonar a publicação, identifique e reverta o commit que declarou a versão; não presuma
que ainda seja `HEAD`.

**Um gate falhou, ou você interrompeu com Ctrl-C.** O script restaura o `package.json` sozinho em
qualquer saída anterior ao commit — no dry-run e na release real. Ele reescreve apenas o campo
`version`, preservando outras edições: não use `git checkout package.json` numa árvore
compartilhada. Depois do commit a restauração para de valer, porque aí o bump já está na história.

## Depois de publicar

Nos consumidores, atualize a dependência e rode `pnpm install`. A lente entra pelo plugin do Vite
(`@softize/lens/vite`) e pelo handler (`createLensHandler`); não há materialização de artefatos,
então não existe passo de `setup` como no Opus e na Base.

## Notas da versão no GitHub

A [página de releases](https://github.com/softize-dev/lens/releases) apresenta a seção da
versão em `CHANGELOG.md`. Escreva a mudança uma única vez no changelog existente;
o GitHub recebe esse texto, sem um segundo resumo ou um novo formato de autoria.

Depois da publicação autorizada do pacote:

1. Confirme a versão exata no npm e o SHA que a publicou em `origin/main`. Leia o manifesto e
   o changelog **nesse SHA**, pois a ponta de `main` pode já conter a próxima entrega.
2. Separe somente a seção `## <versão> — <AAAA-MM-DD>`, até o próximo título de nível 2,
   em um arquivo temporário. Preserve orientações de migração e converta links relativos em
   links para os arquivos no mesmo SHA, sem reescrever o conteúdo. Não use a lista automática
   de commits como substituto das notas.
3. Confira se a tag `v<versão>` no remoto aponta para esse SHA, inclusive quando for anotada.
   Se faltar, crie e envie a tag somente com autorização para essa entrega. Se apontar para
   outro commit, interrompa e investigue; não mova uma tag publicada.
4. Prepare a release com esse arquivo e confira a prévia. O
   [GitHub CLI](https://cli.github.com/manual/gh_release_create) aceita `--notes-file`,
   `--draft` e `--verify-tag`; esta última opção exige a tag remota, mas não confere seu SHA.
   Uma release já existente deve ser conferida antes de qualquer tentativa de criação.
5. Publique as notas após confirmar versão, SHA, texto e destino. A publicação da release
   no GitHub não publica o pacote no npm nem implanta sites ou consumidores.

O script `pnpm release` continua responsável pelo pacote; ele não cria tags nem releases
no GitHub. Essa etapa usa as ferramentas existentes, sem dependência nova de automação.
Um rascunho antecipado pode guardar evidências, mas não comprova publicação: enquanto o
candidato não estiver no remoto, registre seu SHA e a pendência e não o promova. Não gere
releases históricas atribuindo tags a commits sem evidência da versão publicada.
