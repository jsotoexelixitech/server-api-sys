#!/usr/bin/env bash
# Prueba end-to-end del cuadro-poliza (.docx real -> PDF) contra los servicios
# YA corriendo en srv001 (producto-builder-api :3001, sysip-nest-api :3002).
# Correr directamente en el servidor: bash scripts/test-emision-docx.sh
set -euo pipefail

PB_URL="http://localhost:3001/api"
NEST_URL="http://localhost:3002/api/v1/product-emission"
STAMP=$(date +%s)
SVC_EMAIL="nest-api-test-${STAMP}@exelixitech.com"
SVC_PASSWORD="CambiarEstaClave123!"

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

echo "== 1) Crear cuenta de servicio de prueba en product-builder ($SVC_EMAIL) =="
SIGNUP_JSON=$(curl -s -X POST "$PB_URL/auth/signup" -H "Content-Type: application/json" \
  -d "{\"email\":\"$SVC_EMAIL\",\"password\":\"$SVC_PASSWORD\",\"fullName\":\"nest-api test account\"}")
TOKEN=$(get_field "$SIGNUP_JSON" "accessToken" || true)

if [ -z "${TOKEN:-}" ]; then
  echo "  ERROR creando cuenta de servicio. Respuesta de product-builder:"
  echo "  $SIGNUP_JSON"
  exit 1
fi
echo "  token OK (${#TOKEN} chars)"

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

echo "== 5) Emitir poliza (llena la plantilla .docx real -> PDF) =="
RESPONSE=$(curl -s -X POST "$NEST_URL/emit" -H "Content-Type: application/json" -d "{
  \"productId\": \"$PRODUCT_ID\",
  \"tomador\": { \"nombre\": \"CARLOS EDUARDO PEREZ MATA\", \"identificacion\": \"V-14567890\", \"direccion\": \"Av. Libertador, Edif. Centro, Piso 4\", \"email\": \"carlos.perez@example.com\", \"ciudad\": \"Valencia\", \"estado\": \"Carabobo\", \"zonaPostal\": \"2001\", \"telefono\": \"0414-1234567\" },
  \"asegurado\": { \"nombre\": \"CARLOS EDUARDO PEREZ MATA\", \"identificacion\": \"V-14567890\", \"direccion\": \"Av. Libertador, Edif. Centro, Piso 4\", \"email\": \"carlos.perez@example.com\", \"ciudad\": \"Valencia\", \"estado\": \"Carabobo\", \"zonaPostal\": \"2001\", \"telefono\": \"0414-1234567\" },
  \"riskData\": { \"Marca\": \"Chevrolet\", \"Modelo\": \"Aveo\", \"Version\": \"LS\", \"Anio\": \"2022\", \"Placa\": \"AC123BC\", \"Color\": \"Blanco\", \"Uso\": \"Particular\", \"Puestos\": \"5\" },
  \"estatus\": \"PAGADO\",
  \"canalVenta\": \"AGENTE EXCLUSIVO\",
  \"intermediario\": \"EXELIXI TECHNOLOGY\"
}")

echo "$RESPONSE"
echo ""
echo "== Fin. Si ves \"documentUrl\" arriba, abrelo en el navegador para ver el PDF. =="
