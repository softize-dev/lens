#!/usr/bin/env bash
# release.sh — Publica @softize/lens.
#
#   pnpm release             # patch bump
#   pnpm release minor       # minor
#   pnpm release 0.8.0       # versão explícita
#   pnpm release none        # publica sem bump
#   pnpm release --dry-run   # prepara e valida sem publicar, commitar ou empurrar
#   pnpm release --skip-checks   # pula os gates (use só quando acabou de rodá-los)
#
# As guardas são as mesmas do @softize/base e do @softize/opus: o que sai para o registry
# tem que existir em origin/main. Elas nasceram de um caso real na Base — a 2.3.0 foi
# publicada de uma branch local que nunca voltou para a main, e por treze dias o código
# que governava a conduta dos agentes não existiu em servidor nenhum.
#
# O procedimento completo, e o que fazer quando algo falha no meio, está em docs/releasing.md.
#
# Auth: o publish exige o token do npm no ~/.npmrc global do dev
# (//registry.npmjs.org/:_authToken=...), que NÃO é commitado.
set -euo pipefail

SKIP_CHECKS=0
DRY_RUN=0
ARGS=()
for a in "$@"; do
  case "$a" in
    --skip-checks) SKIP_CHECKS=1 ;;
    --dry-run) DRY_RUN=1 ;;
    -*) echo "✗ opção desconhecida: $a. Use --dry-run ou --skip-checks."; exit 1 ;;
    *) ARGS+=("$a") ;;
  esac
done
[ "${#ARGS[@]}" -le 1 ] || { echo "✗ só um bump por vez; recebi: ${ARGS[*]}"; exit 1; }
BUMP="${ARGS[0]:-patch}"
# Valida antes de tocar em qualquer coisa: um typo viraria BUMP e só morreria dentro do
# `pnpm version`, com a mensagem dele em vez da nossa.
case "$BUMP" in
  patch|minor|major|none) ;;
  *-*|*+*)
    echo "✗ prerelease não é suportado aqui: '$BUMP'."
    echo "  Este script publica sempre sem --tag, então um prerelease tomaria a dist-tag latest."
    exit 1 ;;
  *.*.*.*) echo "✗ versão inválida: '$BUMP'. Use três números, como 0.8.0."; exit 1 ;;
  [0-9]*.[0-9]*.[0-9]*) ;;
  *) echo "✗ bump inválido: '$BUMP'. Use patch, minor, major, none ou uma versão como 0.8.0."; exit 1 ;;
esac
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
REGISTRY="https://registry.npmjs.org/"

# Guardas de procedência — vêm ANTES do bump, que suja a árvore de propósito.
echo "→ procedência: main limpa e em sincronia"
branch=$(git rev-parse --abbrev-ref HEAD)
[ "$branch" = "main" ] || { echo "  ✗ você está em '$branch'. O que vai pro registry tem que estar na main."; exit 1; }
# --porcelain enxerga NÃO-RASTREADO: arquivo novo que o tarball leva mas o repo não tem
# publica código que ninguém consegue reproduzir a partir da main.
dirty=$(git status --porcelain)
[ -z "$dirty" ] || { echo "  ✗ árvore suja (inclui não-rastreados):"; printf '%s\n' "$dirty" | head -10; exit 1; }
git fetch -q origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || {
  echo "  ✗ main local ($(git rev-parse --short HEAD)) ≠ origin/main ($(git rev-parse --short origin/main)) — puxe/empurre antes."
  exit 1
}
echo "  ✓ $(git rev-parse --short HEAD)"

# Muro de manifesto (supply-chain) — SEMPRE, nem --skip-checks pula. Uma dependência
# `file:`/`link:` ou uma auto-referência vaza caminho local pro tarball e quebra todo
# consumidor no install.
echo "→ manifesto: sem file:/link:/auto-dependência"
node -e "
  const pkg = require('./package.json');
  const all = { ...(pkg.dependencies || {}), ...(pkg.peerDependencies || {}) };
  const bad = Object.entries(all).filter(([k, v]) => k === '@softize/lens' || String(v).startsWith('file:') || String(v).startsWith('link:'));
  if (bad.length) { console.error('  ✗ dependência inválida (file:/link:/auto): ' + JSON.stringify(bad) + ' — remova antes de publicar.'); process.exit(1); }
  console.log('  ✓ limpo');
"

NAME=$(node -e "console.log(require('./package.json').name)")
OLD=$(node -e "console.log(require('./package.json').version)")

# Desfaz o próprio bump em qualquer saída anterior ao commit: gate vermelho, Ctrl-C no meio
# dos gates ou dry-run concluído. Depois do commit o bump já está na história, e restaurar
# seria desfazer o que foi registrado — daí o BUMP_COMMITTED.
# Reescreve só o campo `version`: `git checkout package.json` descartaria edição de outra
# sessão na mesma árvore. INT e TERM entram porque bash NÃO roda o trap EXIT quando morre
# de SIGINT não tratado, e Ctrl-C durante os gates é justamente o caso provável.
BUMP_COMMITTED=0
restore_version() {
  [ "$BUMP_COMMITTED" = "1" ] && return 0
  node -e "
    const fs = require('fs'); const p = 'package.json';
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (j.version !== '$OLD') {
      j.version = '$OLD';
      fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
      console.error('  ↩ versão restaurada para $OLD');
    }
  "
}
trap restore_version EXIT INT TERM

if [ "$BUMP" != "none" ]; then
  echo ""
  echo "→ Bump ($BUMP)"
  pnpm version "$BUMP" --no-git-tag-version > /dev/null
fi
NEW=$(node -e "console.log(require('./package.json').version)")
echo "  $NAME  $OLD → $NEW   →   $REGISTRY"

# Muro de CHANGELOG — cobra com o NEW REAL em mãos, porque o bump pode bater diferente do
# que se documentou. Exige algo depois da versão no heading; a convenção deste arquivo e do
# Opus é a data.
if ! grep -q "^## ${NEW} " CHANGELOG.md; then
  echo "  ✗ CHANGELOG.md não tem um heading que comece com '## ${NEW} ' (com algo depois —"
  echo "    a convenção aqui é '## ${NEW} — <data>'). Um heading '## ${NEW}' sozinho não conta."
  echo "    Se a entrada já existe, confira o formato; se o bump saiu diferente do que você"
  echo "    documentou, ajuste a versão ou a entrada."
  exit 1
fi
echo "  ✓ CHANGELOG documenta a ${NEW}"

# Gate de qualidade — o pacote publica `src` sem build: um tsc vermelho iria direto pro
# tarball, e o consumidor quebraria em tempo de import, não num passo de build que alguém veria.
if [ "$SKIP_CHECKS" = "1" ]; then
  echo ""
  echo "→ Gates: PULADOS (--skip-checks)"
else
  echo ""
  echo "→ Gates: typecheck e testes"
  pnpm typecheck
  pnpm test
fi

# Os gates levam mais de um minuto, e esta máquina roda várias sessões no mesmo repositório.
# O `pnpm publish` empacota a ÁRVORE, não o commit — na Base isso fez a 2.2.0 sair levando uma
# mudança commitada oito minutos depois do seu próprio commit de release. Então a árvore aqui
# tem que conter exatamente o que este script alterou, e nada mais. Vale para `none` também,
# que é a rota de recuperação recomendada quando um publish falha: é onde a pressa mora.
echo ""
echo "→ Conferindo a árvore depois dos gates"
expected=""
[ "$BUMP" != "none" ] && expected=" M package.json"
changed=$(git status --porcelain)
if [ "$changed" != "$expected" ]; then
  echo "  ✗ a árvore não contém apenas o que esta release mudou:"
  printf '%s\n' "$changed" | head -10
  echo "    Outra sessão pode ter salvo algo durante os gates. Reveja antes de publicar — o"
  echo "    tarball levaria isso, e nem o commit nem a revisão o teriam visto."
  exit 1
fi
echo "  ✓ só o esperado"

if [ "$DRY_RUN" = "1" ]; then
  echo ""
  echo "✓ dry-run concluído: ${NAME}@${NEW} preparado. Nada foi publicado, commitado ou enviado."
  exit 0
fi

if [ "$BUMP" != "none" ]; then
  echo ""
  echo "→ Commitando o bump"
  git add package.json
  git commit -q -m "chore: bump $NEW"
  BUMP_COMMITTED=1
  [ -z "$(git status --porcelain)" ] || { echo "  ✗ a árvore não ficou limpa depois do commit."; exit 1; }
  echo "  ✓ commit reproduz o tarball da $NEW"

  # Empurrar ANTES de publicar. A ordem inversa é o incidente da 2.3.0: se o push falhasse
  # depois do publish, a versão ficaria imutável no registry sem existir em servidor nenhum.
  # Assim, um push recusado — por exemplo porque outra sessão empurrou durante os gates —
  # custa uma release não publicada, e nada irreversível.
  echo ""
  echo "→ Levando o bump pra main antes de publicar"
  if ! git push -q origin main; then
    echo "  ✗ push recusado (outra sessão empurrou durante os gates?). NADA foi publicado."
    echo "    Reconcilie a main e rode de novo; o commit do bump já está local."
    exit 1
  fi
  echo "  ✓ origin/main tem a $NEW"
fi

echo ""
echo "→ Publicando"
if ! pnpm publish --no-git-checks --access public; then
  echo ""
  if [ "$BUMP_COMMITTED" = "1" ]; then
    echo "  ✗ O PUBLISH FALHOU. origin/main já declara a $NEW, e o registry não a tem."
    echo "    Duas saídas, nesta ordem de preferência:"
    echo "      1. Resolver a causa (token em ~/.npmrc? versão já publicada?) e rodar"
    echo "         'pnpm release none', que publica a $NEW sem bumpar de novo."
    echo "      2. Desfazer o anúncio: 'git revert HEAD' e empurrar, para a main parar de"
    echo "         declarar uma versão que não existe no registry."
  else
    echo "  ✗ O PUBLISH FALHOU. Nada foi commitado nem empurrado; a árvore está como estava."
    echo "    Resolva a causa (token em ~/.npmrc? versão já publicada?) e rode de novo."
  fi
  exit 1
fi

echo ""
echo "✓ $NAME@$NEW publicado → $REGISTRY"
echo "  Conferir:  npm view $NAME version"
echo "  Lembre: o consumidor precisa de 'pnpm install' — a lente entra pelo plugin do Vite."
