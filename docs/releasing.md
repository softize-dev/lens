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

**O push foi recusado.** Nada foi publicado. Reconcilie a `main`, confira a versão e o
changelog, revise e envie o commit da versão para `origin/main`, passando pelos hooks habituais.
Com a `main` limpa e sincronizada, retome com `pnpm release none`, sem outro incremento. Se
outra entrega já ocupou a versão, prepare uma versão disponível e atualize as notas antes de seguir.

**O publish falhou.** O commit já está em `origin/main`. Consulte a versão exata com
`npm view @softize/lens@<versão> version --registry https://registry.npmjs.org/`. A falha pode
ocorrer depois de o registry aceitar o pacote, e a consulta pode demorar a refletir a publicação.
Aguarde a propagação e consulte novamente; uma resposta vazia ou erro de rede não comprova ausência.
Para retomar depois de resolver a causa, use `pnpm release none`. Uma recusa explícita por versão
já publicada indica que ela existe: confira a publicação em vez de incrementar outra vez.

Não reverta o commit com base apenas numa consulta sem resultado. Se decidir abandonar a
publicação, confirme primeiro a ausência no registry após a propagação e, persistindo a dúvida,
investigue a publicação antes de alterar o histórico. Identifique o commit correto; não presuma
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

Nas próximas entregas, publique na [página de releases](https://github.com/softize-dev/lens/releases)
a seção correspondente de `CHANGELOG.md`. O changelog continua sendo a fonte completa do
histórico; não se pressupõe que as versões antigas tenham release no GitHub. Escreva a mudança
uma única vez: o GitHub recebe esse texto, sem segundo resumo ou novo formato de autoria.
O acesso à página e aos anexos depende das permissões do repositório.

Depois da publicação autorizada do pacote:

1. Guarde o log da execução bem-sucedida e registre `git rev-parse HEAD` imediatamente após
   a publicação, no checkout exclusivo usado para publicar. Esse é o SHA de origem do pacote,
   que deve existir em `origin/main`. Não o confunda com o commit que incrementou a versão: uma recuperação com `none` pode publicar uma correção posterior.
   Confirme a versão exata no npm e leia `package.json` e `CHANGELOG.md` nesse SHA. Confira que
   as notas incluem as correções da recuperação; a versão sozinha não prova essa correspondência.
2. Separe somente a seção `## <versão> — <AAAA-MM-DD>`, até o próximo título de nível 2,
   em um arquivo temporário. Preserve orientações de migração e converta links relativos em
   links para os arquivos no mesmo SHA, resolvidos a partir da raiz do repositório, sem reescrever
   o conteúdo. Não use a lista automática de commits como substituto das notas.
3. Confira se a tag `v<versão>` no remoto aponta para esse SHA, inclusive quando for anotada.
   Se faltar, crie e envie a tag somente com autorização para essa entrega. Se apontar para
   outro commit, interrompa e investigue; não mova uma tag publicada.
4. Prepare a release com esse arquivo e confira a prévia. O
   [GitHub CLI](https://cli.github.com/manual/gh_release_create) aceita `--notes-file`,
   `--draft` e `--verify-tag`; esta última opção exige a tag remota, mas não confere seu SHA.
   Se a release já existir, confira sua tag e seu destino; não crie outra.
5. Antes de promover um rascunho existente, repita a conferência da tag remota do passo 3,
   mesmo que o texto e os anexos já tenham sido revisados. Confira `tag_name` e
   `target_commitish` do rascunho; ajuste o destino ao SHA da publicação. Não promova enquanto
   a tag remota estiver ausente ou apontar para outro SHA. Publique depois de conferir o texto.
   A publicação no GitHub não publica o pacote no npm nem implanta sites ou consumidores.

O script `pnpm release` continua responsável pelo pacote; ele não cria tags nem releases
no GitHub. Essa etapa usa as ferramentas existentes, sem dependência nova de automação.
Um rascunho criado antes da publicação pode guardar evidências, mas não comprova entrega.
Enquanto o commit testado não estiver no remoto, registre seu SHA e a pendência e não o promova.
Não gere releases históricas atribuindo tags a commits sem evidência da versão publicada.
