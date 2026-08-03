#!/usr/bin/env bash
# Prueba end-to-end del cuadro-poliza (.docx real -> PDF) contra los servicios
# YA corriendo en srv001 (URLs se detectan del .env real de nest-api).
# Correr directamente en el servidor: bash scripts/test-emision-docx.sh
set -euo pipefail

# Lee PRODUCT_BUILDER_API_URL del .env real de nest-api (evita asumir puerto
# fijo: en srv001 el 3001 lo usa pagos-api, no producto-builder-api).
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
echo "== 0) URLs detectadas: PB_URL=$PB_URL  NEST_URL=$NEST_URL =="

wait_for_nest() {
  local tries="${1:-30}"
  echo "  Esperando nest-api en ${NEST_BASE} (max ${tries}s)..."
  for i in $(seq 1 "$tries"); do
    if curl -s -o /dev/null --connect-timeout 2 "${NEST_BASE}/api/v1/admin/keys" 2>/dev/null; then
      echo "  nest-api listo (${i}s)"
      return 0
    fi
    sleep 1
  done
  echo "  ERROR: nest-api no respondio tras ${tries}s (¿pm2 restart reciente?)"
  return 1
}
STAMP=$(date +%s)
SVC_EMAIL="${CONFIGURED_EMAIL:-nest-api-test-${STAMP}@exelixitech.com}"
SVC_PASSWORD="${CONFIGURED_PASSWORD:-CambiarEstaClave123!}"

get_field() {
  # $1 = json string, $2 = ruta de campo (ej. accessToken, id)
  node -e "
    let raw = '';
    process.stdin.on('data', d => raw += d);
    process.stdin.on('end', () => {
      try {
        const obj = JSON.parse(raw);
        const v = obj['$2'];
        process.stdout.write(v === undefined || v === null ? '' : String(v));
      } catch (e) {
        process.stderr.write('JSON invalido: ' + raw.slice(0, 300));
        process.exit(1);
      }
    });
  " <<< "$1"
}

echo "== 1) Autenticar en product-builder ($SVC_EMAIL) =="
LOGIN_JSON=$(curl -s -X POST "$PB_URL/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$SVC_EMAIL\",\"password\":\"$SVC_PASSWORD\"}")
TOKEN=$(get_field "$LOGIN_JSON" "accessToken" || true)

if [ -z "${TOKEN:-}" ]; then
  echo "  (login fallo, creando cuenta nueva...)"
  SVC_EMAIL="nest-api-test-${STAMP}@exelixitech.com"
  SIGNUP_JSON=$(curl -s -X POST "$PB_URL/auth/signup" -H "Content-Type: application/json" \
    -d "{\"email\":\"$SVC_EMAIL\",\"password\":\"$SVC_PASSWORD\",\"fullName\":\"nest-api test account\"}")
  TOKEN=$(get_field "$SIGNUP_JSON" "accessToken" || true)
  if [ -z "${TOKEN:-}" ]; then
    echo "  ERROR autenticando/creando cuenta de servicio. Respuestas de product-builder:"
    echo "  login:  $LOGIN_JSON"
    echo "  signup: $SIGNUP_JSON"
    exit 1
  fi
fi
echo "  token OK (${#TOKEN} chars) via $SVC_EMAIL"

echo "== 2) Crear producto de prueba (ramo AUTOMOVIL) =="
PRODUCT_JSON=$(curl -s -X POST "$PB_URL/products" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d "{\"commercialName\":\"Automovil Exelixi TEST\",\"internalCode\":\"AUTOTEST${STAMP}\",\"branch\":\"AUTOMOVIL\",\"currency\":\"USD\",\"emissionType\":\"EMISION_GARANTIZADA\"}")
PRODUCT_ID=$(get_field "$PRODUCT_JSON" "id" || true)
if [ -z "${PRODUCT_ID:-}" ]; then
  echo "  ERROR creando producto. Respuesta de product-builder:"
  echo "  $PRODUCT_JSON"
  exit 1
fi
echo "  productId=$PRODUCT_ID"

echo "== 3) Cargar coberturas =="
COV_JSON=$(curl -s -X PUT "$PB_URL/products/$PRODUCT_ID/coverages" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"coverages":[
    {"name":"DAÑOS A PERSONAS","isBasicMandatory":true,"insuredSumFixed":5000,"tariffPremium":20,"sortOrder":0},
    {"name":"DAÑOS A COSAS","isBasicMandatory":true,"insuredSumFixed":4000,"tariffPremium":15,"sortOrder":1},
    {"name":"MUERTE DEL CONDUCTOR","isBasicMandatory":false,"insuredSumFixed":3000,"tariffPremium":10,"sortOrder":2}
  ]}')
COV_IDS=$(node -e "
  let raw = '';
  process.stdin.on('data', d => raw += d);
  process.stdin.on('end', () => {
    try {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) throw new Error('no es array');
      process.stdout.write(arr.map(c => '\"' + c.id + '\"').join(','));
    } catch (e) {
      process.stderr.write('Respuesta inesperada al cargar coberturas: ' + raw.slice(0, 300));
      process.exit(1);
    }
  });
" <<< "$COV_JSON")
if [ -z "${COV_IDS:-}" ]; then
  echo "  ERROR cargando coberturas. Respuesta de product-builder:"
  echo "  $COV_JSON"
  exit 1
fi
echo "  coverageIds=$COV_IDS"

echo "== 4) Cargar plan =="
PLAN_JSON=$(curl -s -X PUT "$PB_URL/products/$PRODUCT_ID/plans" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d "{\"plans\":[{\"name\":\"Plan RCV Full TEST\",\"priceFactor\":45,\"isRecommended\":true,\"coverageIds\":[$COV_IDS],\"sortOrder\":0}]}")
echo "  $PLAN_JSON" | head -c 300
echo ""

echo "== 5) Generar apikey de prueba con scope product-emission:write =="
wait_for_nest 30
APIKEY=""
if [ -n "${ADMIN_TOKEN:-}" ]; then
  KEY_JSON=$(curl -s -X POST "${NEST_BASE}/api/v1/admin/keys" \
    -H "Content-Type: application/json" -H "X-Admin-Token: $ADMIN_TOKEN" \
    -d "{\"name\":\"test-emision-docx-${STAMP}\",\"scopes\":[\"product-emission:write\"]}" \
    || echo '{"error":"curl fallo al crear apikey"}')
  APIKEY=$(get_field "$KEY_JSON" "plainKey" || true)
  if [ -z "${APIKEY:-}" ]; then
    echo "  ERROR creando apikey. Respuesta:"
    echo "  $KEY_JSON"
  else
    echo "  apikey OK (${#APIKEY} chars)"
  fi
else
  echo "  NEST_ADMIN_TOKEN no encontrado en .env — se intentará /emit sin apikey."
fi

echo "== 6) Emitir poliza (llena la plantilla .docx real -> PDF) =="
AUTH_HEADER=()
if [ -n "${APIKEY:-}" ]; then
  AUTH_HEADER=(-H "apikey: $APIKEY")
fi
RESPONSE=$(curl -s -X POST "$NEST_URL/emit" -H "Content-Type: application/json" "${AUTH_HEADER[@]}" -d "{
  \"productId\": \"$PRODUCT_ID\",
  \"tomador\": { \"nombre\": \"CARLOS EDUARDO PEREZ MATA\", \"identificacion\": \"V-14567890\", \"direccion\": \"Av. Libertador, Edif. Centro, Piso 4\", \"email\": \"carlos.perez@example.com\", \"ciudad\": \"Valencia\", \"estado\": \"Carabobo\", \"zonaPostal\": \"2001\", \"telefono\": \"0414-1234567\" },
  \"asegurado\": { \"nombre\": \"CARLOS EDUARDO PEREZ MATA\", \"identificacion\": \"V-14567890\", \"direccion\": \"Av. Libertador, Edif. Centro, Piso 4\", \"email\": \"carlos.perez@example.com\", \"ciudad\": \"Valencia\", \"estado\": \"Carabobo\", \"zonaPostal\": \"2001\", \"telefono\": \"0414-1234567\" },
  \"riskData\": { \"Marca\": \"Chevrolet\", \"Modelo\": \"Aveo\", \"Version\": \"LS\", \"Anio\": \"2022\", \"Placa\": \"AC123BC\", \"Color\": \"Blanco\", \"Uso\": \"Particular\", \"Puestos\": \"5\" },
  \"estatus\": \"PAGADO\",
  \"canalVenta\": \"AGENTE EXCLUSIVO\",
  \"intermediario\": \"EXELIXI TECHNOLOGY\"
}" || echo '{"error":"curl fallo en /emit"}')

echo "$RESPONSE"
echo ""
echo "== Fin. Si ves \"documentUrl\" arriba, abrelo en el navegador para ver el PDF. =="
echo "Nota: si no hay NEST_ADMIN_TOKEN en el .env y /emit sigue dando 401, genera"
echo "la key manualmente en el panel /admin/ (header X-Admin-Token) con el scope"
echo "product-emission:write."
