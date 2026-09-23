#!/usr/bin/env bash
# Compara versión instalada vs última en GitHub Packages (partners).
#
# Uso (desde server-api-sys):
#   bash scripts/check-partner-versions.sh
#
# Tokens: ~/.config/exelixi-nest-partners/tokens.env

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TOKENS_FILE="${NEST_PARTNER_TOKENS_FILE:-$HOME/.config/exelixi-nest-partners/tokens.env}"
TMP_NPMRC="$(mktemp)"

cleanup() { rm -f "$TMP_NPMRC"; }
trap cleanup EXIT

if [[ ! -f "$TOKENS_FILE" ]]; then
  echo "Falta $TOKENS_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$TOKENS_FILE"

declare -A PKG_TOKEN_VAR=(
  ["@quand-mind/api_planes_v2"]="TOKEN_QUAND_MIND"
  ["@esanchez-exelixitech/partner-api-test"]="TOKEN_ESANCHEZ"
  ["@gestacio/sysip-nest-api"]="TOKEN_GESTACIO"
)

PACKAGES=(
  "@quand-mind/api_planes_v2"
  "@esanchez-exelixitech/partner-api-test"
  "@gestacio/sysip-nest-api"
)

resolve_token() {
  local pkg="$1"
  local var="${PKG_TOKEN_VAR[$pkg]:-}"
  local specific=""
  if [[ -n "$var" ]]; then
    specific="${!var:-}"
  fi
  if [[ -n "$specific" ]]; then
    echo "$specific"
    return
  fi
  echo "${TOKEN_DEFAULT:-}"
}

write_npmrc() {
  local token="$1"
  cat > "$TMP_NPMRC" <<EOF
@quand-mind:registry=https://npm.pkg.github.com
@esanchez-exelixitech:registry=https://npm.pkg.github.com
@gestacio:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${token}
EOF
}

printf '%-45s %-12s %-12s %s\n' "PACKAGE" "INSTALLED" "LATEST" "STATUS"
printf '%-45s %-12s %-12s %s\n' "-------" "---------" "------" "------"

outdated=0

for pkg in "${PACKAGES[@]}"; do
  token="$(resolve_token "$pkg")"
  if [[ -z "$token" ]]; then
    printf '%-45s %-12s %-12s %s\n' "$pkg" "?" "?" "SIN_TOKEN"
    outdated=1
    continue
  fi
  write_npmrc "$token"

  installed="$(npm ls "$pkg" --depth=0 --json 2>/dev/null \
    | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);const dps=j.dependencies||{};const n=Object.keys(dps)[0];console.log(n&&dps[n]?dps[n].version:'MISSING')}catch{console.log('MISSING')}}")"

  latest="$(npm view "$pkg" version --userconfig "$TMP_NPMRC" 2>/dev/null || echo "ERROR")"

  if [[ "$latest" == "ERROR" || -z "$latest" ]]; then
    status="VIEW_FAIL"
    outdated=1
  elif [[ "$installed" == "MISSING" ]]; then
    status="NO_INSTALADO"
    outdated=1
  elif [[ "$installed" == "$latest" ]]; then
    status="OK"
  else
    status="ACTUALIZAR"
    outdated=1
  fi

  printf '%-45s %-12s %-12s %s\n' "$pkg" "$installed" "$latest" "$status"
done

echo ""
if [[ "$outdated" -eq 0 ]]; then
  echo "Todos al día respecto al registry."
else
  echo "Hay diferencias. Para subir a latest:"
  echo "  bash scripts/install-partner-packages.sh --build --reload"
  echo "O versión fija:"
  echo "  npm install @org/paquete@x.y.z --save   # con auth del script / tokens.env"
fi
