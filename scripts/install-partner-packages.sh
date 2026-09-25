#!/usr/bin/env bash
# Instala / actualiza paquetes partner de GitHub Packages sin editar ~/.npmrc a mano.
#
# Uso (desde la raíz de server-api-sys):
#   bash scripts/install-partner-packages.sh
#   bash scripts/install-partner-packages.sh --build --reload
#   bash scripts/install-partner-packages.sh @gestacio/sysip-nest-api
#   bash scripts/install-partner-packages.sh @gestacio/sysip-nest-api@1.7.0 --build --reload
#
# Tokens: ~/.config/exelixi-nest-partners/tokens.env  (chmod 600)
#   ver scripts/partner-tokens.env.example
#
# npm solo admite UN _authToken por npm.pkg.github.com; el script escribe
# un .npmrc temporal por paquete y lo borra al terminar.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TOKENS_FILE="${NEST_PARTNER_TOKENS_FILE:-$HOME/.config/exelixi-nest-partners/tokens.env}"
TMP_NPMRC="$(mktemp)"
DO_BUILD=0
DO_RELOAD=0
ONLY_PKG=()

cleanup() {
  rm -f "$TMP_NPMRC"
}
trap cleanup EXIT

usage() {
  sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage ;;
    --build) DO_BUILD=1; shift ;;
    --reload) DO_RELOAD=1; shift ;;
    --tokens)
      TOKENS_FILE="$2"
      shift 2
      ;;
    @*)
      ONLY_PKG+=("$1")
      shift
      ;;
    *)
      echo "Opción desconocida: $1" >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "$TOKENS_FILE" ]]; then
  echo "Falta archivo de tokens: $TOKENS_FILE" >&2
  echo "Copia: cp scripts/partner-tokens.env.example $TOKENS_FILE && chmod 600 $TOKENS_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$TOKENS_FILE"

# Paquete → variable de token (vacío = TOKEN_DEFAULT)
declare -A PKG_TOKEN_VAR=(
  ["@quand-mind/api_planes_v2"]="TOKEN_QUAND_MIND"
  ["@esanchez-exelixitech/partner-api-test"]="TOKEN_ESANCHEZ"
  ["@gestacio/sysip-nest-api"]="TOKEN_GESTACIO"
)

DEFAULT_PACKAGES=(
  "@quand-mind/api_planes_v2"
  "@esanchez-exelixitech/partner-api-test"
  "@gestacio/sysip-nest-api"
)

packages=()
if [[ ${#ONLY_PKG[@]} -gt 0 ]]; then
  packages=("${ONLY_PKG[@]}")
else
  packages=("${DEFAULT_PACKAGES[@]}")
fi

# @scope/name@version → @scope/name (el mapa de tokens no incluye versión)
pkg_name_only() {
  local spec="$1"
  if [[ "$spec" =~ ^(@[^/]+/[^@]+)@.+$ ]]; then
    echo "${BASH_REMATCH[1]}"
    return
  fi
  echo "$spec"
}

resolve_token() {
  local pkg
  pkg="$(pkg_name_only "$1")"
  local var="${PKG_TOKEN_VAR[$pkg]:-}"
  local specific=""
  if [[ -n "$var" ]]; then
    specific="${!var:-}"
  fi
  if [[ -n "$specific" ]]; then
    echo "$specific"
    return
  fi
  if [[ -n "${TOKEN_DEFAULT:-}" ]]; then
    echo "$TOKEN_DEFAULT"
    return
  fi
  echo ""
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

echo "==> Tokens: $TOKENS_FILE"
echo "==> Repo:   $ROOT"

for pkg in "${packages[@]}"; do
  token="$(resolve_token "$pkg")"
  if [[ -z "$token" ]]; then
    echo "ERROR: sin token para $pkg (rellena TOKEN_* o TOKEN_DEFAULT en $TOKENS_FILE)" >&2
    exit 1
  fi
  echo ""
  echo "==> npm install $pkg"
  write_npmrc "$token"
  npm install "$pkg" --save --userconfig "$TMP_NPMRC"
done

echo ""
echo "==> Instalados:"
npm ls --depth=0 2>/dev/null | grep -E 'quand-mind|esanchez|gestacio|partner-api-starter' || true

if [[ "$DO_BUILD" -eq 1 ]]; then
  echo ""
  echo "==> npm run build"
  unset NODE_ENV PORT VITE_APP_BASE DATABASE_URL || true
  npm run build
fi

if [[ "$DO_RELOAD" -eq 1 ]]; then
  echo ""
  echo "==> pm2 reload sysip-nest-api"
  pm2 reload sysip-nest-api
  sleep 3
  pm2 logs sysip-nest-api --lines 30 --nostream 2>/dev/null \
    | grep -E 'Partner modules loaded|Módulo partner|No se pudo cargar' || true
fi

echo ""
echo "Listo. Recuerda: PARTNER_PACKAGES en .env debe listar los mismos paquetes."
