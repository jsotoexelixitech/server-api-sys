#!/usr/bin/env bash
# Consulta ramos + planes en Sis2000 (maramos, matiporamo, insramo, maplanes*, maplanes_per).
# Uso:
#   ./scripts/consulta-ramos-planes.sh          # todos los ramos
#   ./scripts/consulta-ramos-planes.sh 5        # solo ramo 5 (viajero)
#   ./scripts/consulta-ramos-planes.sh 18       # solo ramo 18 (RCV)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"
CRAMO="${1:-}"

strip_env_val() {
  local v="${1:-}"
  v="${v#"${v%%[![:space:]]*}"}"
  v="${v%"${v##*[![:space:]]}"}"
  v="${v%\"}"; v="${v#\"}"
  v="${v%\'}"; v="${v#\'}"
  printf '%s' "$v"
}

if [[ ! -f "$ENV_FILE" ]]; then
  echo "No se encontró .env en $ENV_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

SERVER_BD="$(strip_env_val "${SERVER_BD:-}")"
NAME_BD="$(strip_env_val "${NAME_BD:-}")"
USER_BD="$(strip_env_val "${USER_BD:-}")"
PASSWORD_BD="$(strip_env_val "${PASSWORD_BD:-}")"

for var in SERVER_BD NAME_BD USER_BD PASSWORD_BD; do
  if [[ -z "${!var:-}" ]]; then
    echo "Falta $var en $ENV_FILE" >&2
    exit 1
  fi
done

SQL="$ROOT/docs/sql/consulta-ramos-planes.sql"
if [[ ! -f "$SQL" ]]; then
  echo "No se encontró $SQL" >&2
  exit 1
fi

CMD=(sqlcmd -S "$SERVER_BD" -d "$NAME_BD" -U "$USER_BD" -P "$PASSWORD_BD" -W -s "|" -i "$SQL")
if [[ -n "$CRAMO" ]]; then
  # Reemplazo inline del filtro @cramo en el script
  TMP="$(mktemp)"
  sed "s/DECLARE @cramo INT = NULL;/DECLARE @cramo INT = ${CRAMO};/" "$SQL" > "$TMP"
  CMD=(-S "$SERVER_BD" -d "$NAME_BD" -U "$USER_BD" -P "$PASSWORD_BD" -W -s "|" -i "$TMP")
  trap 'rm -f "$TMP"' EXIT
  sqlcmd "${CMD[@]}"
else
  sqlcmd "${CMD[@]}"
fi
