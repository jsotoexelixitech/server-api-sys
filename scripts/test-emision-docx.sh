#!/usr/bin/env bash
# Prueba end-to-end del cuadro-poliza (.docx real -> PDF) contra los servicios
# YA corriendo en srv001 (producto-builder-api :3001, sysip-nest-api :3002).
# Correr directamente en el servidor: bash scripts/test-emision-docx.sh
set -euo pipefail

PB_URL="http://localhost:3001/api"
NEST_URL="http://localhost:3002/api/v1/product-emission"
SVC_EMAIL="nest-api@exelixitech.com"
SVC_PASSWORD="CambiarEstaClave123!"

echo "== 1) Login/signup cuenta de servicio en product-builder =="
TOKEN=$(curl -s -X POST "$PB_URL/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$SVC_EMAIL\",\"password\":\"$SVC_PASSWORD\"}" | node -pe "JSON.parse(require('fs').readFileSync(0)).accessToken" 2>/dev/null || true)

if [ -z "${TOKEN:-}" ] || [ "$TOKEN" = "undefined" ]; then
  echo "  (login fallo, probando signup...)"
  TOKEN=$(curl -s -X POST "$PB_URL/auth/signup" -H "Content-Type: application/json" \
    -d "{\"email\":\"$SVC_EMAIL\",\"password\":\"$SVC_PASSWORD\",\"fullName\":\"nest-api service account\"}" \
    | node -pe "JSON.parse(require('fs').readFileSync(0)).accessToken")
fi
echo "  token OK (${#TOKEN} chars)"

echo "== 2) Crear producto de prueba (ramo AUTOMOVIL) =="
PRODUCT_ID=$(curl -s -X POST "$PB_URL/products" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"commercialName":"Automovil Exelixi TEST","internalCode":"AUTOTEST'"$RANDOM"'","branch":"AUTOMOVIL","currency":"USD","emissionType":"EMISION_GARANTIZADA"}' \
  | node -pe "JSON.parse(require('fs').readFileSync(0)).id")
echo "  productId=$PRODUCT_ID"

echo "== 3) Cargar coberturas =="
COV_JSON=$(curl -s -X PUT "$PB_URL/products/$PRODUCT_ID/coverages" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"coverages":[
    {"name":"DAÑOS A PERSONAS","isBasicMandatory":true,"insuredSumFixed":5000,"tariffPremium":20,"sortOrder":0},
    {"name":"DAÑOS A COSAS","isBasicMandatory":true,"insuredSumFixed":4000,"tariffPremium":15,"sortOrder":1},
    {"name":"MUERTE DEL CONDUCTOR","isBasicMandatory":false,"insuredSumFixed":3000,"tariffPremium":10,"sortOrder":2}
  ]}')
COV_IDS=$(echo "$COV_JSON" | node -pe "JSON.parse(require('fs').readFileSync(0)).map(c=>'\"'+c.id+'\"').join(',')")
echo "  coverageIds=$COV_IDS"

echo "== 4) Cargar plan =="
curl -s -X PUT "$PB_URL/products/$PRODUCT_ID/plans" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d "{\"plans\":[{\"name\":\"Plan RCV Full TEST\",\"priceFactor\":45,\"isRecommended\":true,\"coverageIds\":[$COV_IDS],\"sortOrder\":0}]}" > /dev/null
echo "  plan OK"

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

echo "$RESPONSE" | node -pe "JSON.stringify(JSON.parse(require('fs').readFileSync(0)), null, 2)"
