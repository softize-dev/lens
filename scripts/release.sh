#!/usr/bin/env bash
# release.sh — Publica @softize/lens.
#
#   pnpm release             # patch bump
#   pnpm release minor       # minor
#   pnpm release 0.8.0       # versão explícita
#   pnpm release none        # publica sem bump (rota de recuperação, veja docs/releasing.md)
#   pnpm release --dry-run   # prepara e valida sem publicar, commitar ou empurrar
#   pnpm release --skip-checks   # pula os gates (use só quando acabou de rodá-los)
#
# As guardas são as mesmas do @softize/base e do @softize/opus: o que sai para o registry
# tem que existir em origin/main. Elas nasceram de casos reais na Base — uma versão publicada
# de branch local que nunca voltou para a main, e outra que saiu levando mudança commitada
# depois do próprio commit de release.
#
# O procedimento completo, e o que fazer quando algo falha no meio, está em docs/releasing.md.
#
# Auth: o publish exige o token do npm no ~/.npmrc global do dev
# (//registry.npmjs.org/:_authToken=...), que NÃO é commitado.
set -euo pipefail

# Diagnóstico vai para stderr: quem canaliza a saída do release quer o log do publish, não
# perder o motivo da recusa junto com ele.
erro() {
  printf '%s\n' "$@" >&2
  exit 1
}

SKIP_CHECKS=0
DRY_RUN=0
ARGS=()
for a in "$@"; do
  case "$a" in
    --skip-checks) SKIP_CHECKS=1 ;;
    --dry-run) DRY_RUN=1 ;;
    -*) erro "✗ opção desconhecida: $a. Use --dry-run ou --skip-checks." ;;
    *) ARGS+=("$a") ;;
  esac
done
if [ "${#ARGS[@]}" -gt 1 ]; then
  erro "✗ só um bump por vez; recebi: ${ARGS[*]}"
fi
BUMP="${ARGS[0]:-patch}"

# Valida a forma antes de tocar em qualquer coisa, e com diagnóstico específico: o `pnpm
# version` escreve o erro dele em stdout, que este script silencia, então o que escapar daqui
# morreria mudo.
case "$BUMP" in
  patch|minor|major|none) ;;
  premajor|preminor|prepatch|prerelease)
    erro "✗ '$BUMP' não é suportado aqui." \
         "  O publish não passa --tag, então um prerelease tomaria a dist-tag latest." ;;
  from-git)
    erro "✗ 'from-git' não é suportado aqui: este fluxo não cria a tag que ele lê." ;;
  *)
    if [[ "$BUMP" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      :
    elif [[ "$BUMP" =~ ^([0-9]+\.){3} ]]; then
      erro "✗ versão inválida: '$BUMP'. Use três números, como 0.8.0."
    elif [[ "$BUMP" =~ [-+] ]]; then
      erro "✗ prerelease ou build metadata não é suportado aqui: '$BUMP'." \
           "  O publish não passa --tag, então tomaria a dist-tag latest."
    else
      erro "✗ bump inválido: '$BUMP'. Use patch, minor, major, none ou uma versão como 0.8.0."
    fi ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
REGISTRY="https://registry.npmjs.org/"

# Guardas de procedência — vêm ANTES do bump, que suja a árvore de propósito.
echo "→ procedência: main limpa e em sincronia"
branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$branch" != "main" ]; then
  erro "  ✗ você está em '$branch'. O que vai pro registry tem que estar na main."
fi
# --porcelain enxerga NÃO-RASTREADO: arquivo novo que o tarball leva mas o repo não tem
# publica código que ninguém consegue reproduzir a partir da main.
dirty=$(git status --porcelain)
if [ -n "$dirty" ]; then
  printf '%s\n' "  ✗ árvore suja (inclui não-rastreados):" >&2
  printf '%s\n' "$dirty" | head -10 >&2
  exit 1
fi
git fetch -q origin main
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  erro "  ✗ main local ($(git rev-parse --short HEAD)) ≠ origin/main ($(git rev-parse --short origin/main)) — puxe/empurre antes."
fi
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
NEW="$OLD"

# Desfaz o bump em qualquer saída anterior ao commit: gate vermelho, Ctrl-C no meio dos gates
# ou dry-run concluído. A decisão sai do GIT, não de uma variável: se o HEAD já registra a
# versão nova, o bump está na história e restaurar desfaria o que foi commitado. Assim não há
# janela entre o commit e a marcação.
# Reescreve só o campo `version`: `git checkout package.json` descartaria edição de outra
# sessão na mesma árvore. INT e TERM entram porque bash NÃO roda o trap EXIT quando morre de
# SIGINT não tratado, e Ctrl-C durante os gates é justamente o caso provável.
restore_version() {
  local status=$?
  if git show HEAD:package.json 2>/dev/null | grep -q "\"version\": \"${NEW}\""; then
    return "$status"
  fi
  node -e "
    const fs = require('fs'); const p = 'package.json';
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (j.version !== '$OLD') {
      j.version = '$OLD';
      fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
      console.error('  ↩ versão restaurada para $OLD');
    }
  "
  return "$status"
}
trap restore_version EXIT INT TERM

if [ "$BUMP" != "none" ]; then
  echo ""
  echo "→ Bump ($BUMP)"
  # Sem `> /dev/null`: o pnpm escreve o erro dele em stdout, e silenciá-lo fazia uma falha
  # (pedir a versão corrente, por exemplo) morrer sem mensagem nenhuma.
  pnpm version "$BUMP" --no-git-tag-version
  NEW=$(node -e "console.log(require('./package.json').version)")
  echo "  $NAME  $OLD → $NEW   →   $REGISTRY"
else
  echo ""
  echo "→ Republicando sem bump"
  echo "  $NAME  $NEW   →   $REGISTRY"
fi

# Muro de CHANGELOG — cobra com o NEW REAL em mãos, porque o bump pode bater diferente do
# que se documentou. Exige algo depois da versão no heading; a convenção deste arquivo e do
# Opus é a data.
if ! grep -q "^## ${NEW} " CHANGELOG.md; then
  erro "  ✗ CHANGELOG.md não tem um heading que comece com '## ${NEW} ' (com algo depois —" \
       "    a convenção aqui é '## ${NEW} — <data>'). Um heading '## ${NEW}' sozinho não conta." \
       "    Se a entrada já existe, confira o formato; se o bump saiu diferente do que você" \
       "    documentou, ajuste a versão ou a entrada."
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
# O `pnpm publish` empacota a ÁRVORE, não o commit — foi assim que a 2.2.0 saiu levando uma
# frase commitada oito minutos depois do próprio commit de release (na Base). A árvore aqui
# tem que conter exatamente o que este script alterou, e nada mais. Vale para `none` também,
# que é a rota de recuperação recomendada quando um publish falha: é onde a pressa mora.
echo ""
echo "→ Conferindo a árvore depois dos gates"
expected=""
if [ "$BUMP" != "none" ]; then expected=" M package.json"; fi
changed=$(git status --porcelain)
if [ "$changed" != "$expected" ]; then
  printf '%s\n' "  ✗ a árvore não contém apenas o que esta release mudou:" >&2
  printf '%s\n' "$changed" | head -10 >&2
  printf '%s\n' "    Outra sessão pode ter salvo algo durante os gates. Reveja antes de publicar — o" \
                "    tarball levaria isso, e nem o commit nem a revisão o teriam visto." >&2
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
  if [ -n "$(git status --porcelain)" ]; then
    erro "  ✗ a árvore não ficou limpa depois do commit."
  fi
  echo "  ✓ commit reproduz o tarball da $NEW"

  # Empurrar ANTES de publicar. A ordem inversa é o incidente da 2.3.0: se o push falhasse
  # depois do publish, a versão ficaria imutável no registry sem existir em servidor nenhum.
  # Assim, um push recusado — por exemplo porque outra sessão empurrou durante os gates —
  # custa uma release não publicada, e nada irreversível.
  echo ""
  echo "→ Levando o bump pra main antes de publicar"
  if ! git push -q origin main; then
    erro "  ✗ push recusado (outra sessão empurrou durante os gates?). NADA foi publicado." \
         "    Reconcilie a main e rode de novo; o commit do bump já está local."
  fi
  echo "  ✓ origin/main tem a $NEW"
fi

# Chegar aqui significa, nos DOIS caminhos, que origin/main já declara a $NEW: com bump, pelo
# commit e push acima; com `none`, porque as guardas exigiram HEAD == origin/main e a versão
# publicada é a que está commitada. Por isso a falha abaixo nunca é benigna — é exatamente o
# estado que este script existe para tornar visível.
echo ""
echo "→ Publicando"
if ! pnpm publish --no-git-checks --access public; then
  if [ "$BUMP" != "none" ]; then
    revert="'git revert HEAD' (o commit do bump é o topo) e empurrar"
    dica=""
  else
    revert="reverter o commit que declarou a $NEW e empurrar"
    dica="         (ache-o com: git log -S'\"version\": \"$NEW\"' -- package.json)"
  fi
  printf '\n%s\n' "  ✗ O PUBLISH FALHOU." >&2
  printf '%s\n' "    origin/main declara a $NEW. O que fazer depende de a versão ter chegado ao" \
                "    registry ou não — o publish pode ter falhado DEPOIS de gravá-la. Confira:" \
                "      npm view $NAME@$NEW version" \
                "" \
                "    Se NÃO estiver publicada, é o descasamento que este script existe para não" \
                "    deixar passar. Duas saídas, nesta ordem de preferência:" \
                "      1. Resolver a causa (token em ~/.npmrc? rede? build?) e rodar" \
                "         'pnpm release none', que publica a $NEW sem bumpar de novo." \
                "      2. Se não for publicar agora, desfazer o anúncio: $revert," \
                "         para a main parar de declarar uma versão que não existe no registry." >&2
  if [ -n "$dica" ]; then printf '%s\n' "$dica" >&2; fi
  printf '%s\n' "" \
                "    Se JÁ estiver publicada, a falha foi no reenvio e a main está correta:" \
                "    não há o que desfazer." >&2
  exit 1
fi

echo ""
echo "✓ $NAME@$NEW publicado → $REGISTRY"
echo "  Conferir:  npm view $NAME version"
