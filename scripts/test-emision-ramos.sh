#!/usr/bin/env bash
# Emite cuadros-póliza de prueba: funerario y accidentes personales.
# Requiere nest-api + product-builder corriendo (mismo .env que test-emision-docx.sh).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
if [ -f "$ENV_FILE" ]; then
  PB_BASE=$(grep -E '^PRODUCT_BUILDER_API_URL=' "$ENV_FILE" | tail -1 | cut -d '=' -f2- | tr -d '\r')
  NEST_PORT=$(grep -E '^PORT=' "$ENV_FILE" | tail -1 | cut -d '=' -f2- | tr -d '\r')
  CONFIGURED_EMAIL=$(grep -E '^PRODUCT_BUILDER_API_EMAIL=' "$ENV_FILE" | tail -1 | cut -d '=' -f2- | tr -d '\r')
  CONFIGURED_PASSWORD=$(grep -E '^PRODUCT_BUILDER_API_PASSWORD=' "$ENV_FILE" | tail -1 | cut -d '=' -f2- | tr -d '\r')
  ADMIN_TOKEN=$(grep -E '^NEST_ADMIN_TOKEN=' "$ENV_FILE" | tail -1 | cut -d '=' -f2- | tr -d '\r')
fi
PB_URL="${PB_BASE:-http://localhost:3001}/api"
NEST_PORT="${NEST_PORT:-3002}"
NEST_BASE="http://localhost:${NEST_PORT}"
NEST_URL="${NEST_BASE}/api/v1/product-emission"
STAMP=$(date +%s)
SVC_EMAIL="${CONFIGURED_EMAIL:-nest-ramos-${STAMP}@exelixitech.com}"
SVC_PASSWORD="${CONFIGURED_PASSWORD:-CambiarEstaClave123!}"

get_field() {
  node -e "
    let raw = '';
    process.stdin.on('data', d => raw += d);
    process.stdin.on('end', () => {
      const obj = JSON.parse(raw);
      const v = obj['$2'];
      process.stdout.write(v === undefined || v === null ? '' : String(v));
    });
  " <<< "$1"
}

echo "== Login product-builder =="
LOGIN_JSON=$(curl -s -X POST "$PB_URL/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$SVC_EMAIL\",\"password\":\"$SVC_PASSWORD\"}")
TOKEN=$(get_field "$LOGIN_JSON" "accessToken" || true)
if [ -z "${TOKEN:-}" ]; then
  SIGNUP_JSON=$(curl -s -X POST "$PB_URL/auth/signup" -H "Content-Type: application/json" \
    -d "{\"email\":\"$SVC_EMAIL\",\"password\":\"$SVC_PASSWORD\",\"fullName\":\"test ramos\"}")
  TOKEN=$(get_field "$SIGNUP_JSON" "accessToken" || true)
fi
[ -n "${TOKEN:-}" ] || { echo "ERROR login PB"; exit 1; }

APIKEY=""
if [ -n "${ADMIN_TOKEN:-}" ]; then
  KEY_JSON=$(curl -s -X POST "${NEST_BASE}/api/v1/admin/keys" \
    -H "Content-Type: application/json" -H "X-Admin-Token: $ADMIN_TOKEN" \
    -d "{\"name\":\"test-ramos-${STAMP}\",\"scopes\":[\"product-emission:write\"]}")
  APIKEY=$(get_field "$KEY_JSON" "plainKey" || true)
fi
AUTH=()
[ -n "${APIKEY:-}" ] && AUTH=(-H "apikey: $APIKEY")

emit_ramo() {
  local LABEL="$1" BRANCH="$2" CODE="$3" TEMPLATE="$4" RISK="$5"
  echo ""
  echo "== $LABEL (branch=$BRANCH template=$TEMPLATE) =="
  PRODUCT_JSON=$(curl -s -X POST "$PB_URL/products" \
    -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
    -d "{\"commercialName\":\"$LABEL\",\"internalCode\":\"$CODE\",\"branch\":\"$BRANCH\",\"currency\":\"USD\",\"emissionType\":\"EMISION_GARANTIZADA\"}")
  PID=$(get_field "$PRODUCT_JSON" "id")
  [ -n "${PID:-}" ] || { echo "ERROR creando producto: $PRODUCT_JSON"; exit 1; }
  curl -s -X PUT "$PB_URL/products/$PID/coverages" \
    -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
    -d '{"coverages":[{"name":"COBERTURA PRINCIPAL","isBasicMandatory":true,"insuredSumFixed":10000,"tariffPremium":50,"sortOrder":0},{"name":"COBERTURA ADICIONAL","isBasicMandatory":false,"insuredSumFixed":5000,"tariffPremium":25,"sortOrder":1}]}' >/dev/null
  COV_JSON=$(curl -s -X GET "$PB_URL/products/$PID/coverages" -H "Authorization: Bearer $TOKEN")
  COV_IDS=$(node -e "const a=JSON.parse(process.argv[1]);process.stdout.write(a.map(c=> '\"'+c.id+'\"').join(','))" "$COV_JSON")
  curl -s -X PUT "$PB_URL/products/$PID/plans" \
    -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
    -d "{\"plans\":[{\"name\":\"Plan $LABEL\",\"priceFactor\":75,\"isRecommended\":true,\"coverageIds\":[$COV_IDS],\"sortOrder\":0}]}" >/dev/null
  RESP=$(curl -s -X POST "$NEST_URL/emit" -H "Content-Type: application/json" "${AUTH[@]}" -d "{
    \"productId\": \"$PID\",
    \"policyTemplate\": \"$TEMPLATE\",
    \"tomador\": { \"nombre\": \"MARIA FERNANDA RIVAS\", \"identificacion\": \"V-18234567\", \"direccion\": \"Av. Bolivar, Valencia\", \"email\": \"maria@example.com\", \"ciudad\": \"Valencia\", \"estado\": \"Carabobo\", \"zonaPostal\": \"2001\", \"telefono\": \"0414-5551234\" },
    \"asegurado\": { \"nombre\": \"MARIA FERNANDA RIVAS\", \"identificacion\": \"V-18234567\", \"direccion\": \"Av. Bolivar, Valencia\", \"email\": \"maria@example.com\", \"ciudad\": \"Valencia\", \"estado\": \"Carabobo\", \"zonaPostal\": \"2001\", \"telefono\": \"0414-5551234\" },
    \"beneficiarios\": [{ \"nombre\": \"PEDRO RIVAS\", \"identificacion\": \"V-20123456\", \"parentesco\": \"CONYUGE\" }],
    \"estatus\": \"PAGADO\",
    \"riskData\": $RISK
  }")
  echo "$RESP"
}

emit_ramo "Gastos Funerarios Exelixi TEST" "VIDA" "FUNER${STAMP}" "funerario" \
  '{"edad":"55","sexo":"Femenino","fechaNacimiento":"15/03/1971","ocupacion":"Jubilado"}'

emit_ramo "Accidentes Personales Exelixi TEST" "VIDA" "APTEST${STAMP}" "personas" \
  '{"edad":"38","sexo":"Masculino","fechaNacimiento":"22/07/1988","ocupacion":"Profesional"}'

echo ""
echo "== Fin. Abre documentUrl de cada emisión para comparar plantillas. =="
