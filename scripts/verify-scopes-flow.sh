#!/usr/bin/env bash
# Verificación E2E: permisos por endpoint (admin → key → guard → API)
# Uso en srv001:
#   cd ~/server-api-sys && bash scripts/verify-scopes-flow.sh
set -euo pipefail

BASE="${BASE:-http://127.0.0.1:3002}"
ENV_FILE="${ENV_FILE:-$HOME/server-api-sys/.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: no existe $ENV_FILE"
  exit 1
fi

ADMIN=$(grep -E '^NEST_ADMIN_TOKEN=' "$ENV_FILE" | cut -d= -f2- | tr -d ' "')
[ -z "$ADMIN" ] && echo "ERROR: NEST_ADMIN_TOKEN vacío" && exit 1

pass() { echo "  OK  $1"; }
fail() { echo "  FAIL $1"; exit 1; }

echo ""
echo "=== verify-scopes-flow ==="
echo "BASE=$BASE"
echo ""

echo "1) Catálogo admin (rutas 1x1)"
SCOPES_JSON=$(curl -s -H "X-Admin-Token: $ADMIN" "$BASE/api/v1/admin/scopes")
ROUTE_COUNT=$(python3 -c "import json,sys; r=json.loads(sys.argv[1]); print(len(r.get('routes',[])))" "$SCOPES_JSON")
echo "   Rutas indexadas: $ROUTE_COUNT"
[ "$ROUTE_COUNT" -lt 4 ] && fail "catálogo con pocas rutas ($ROUTE_COUNT)"
pass "catálogo con $ROUTE_COUNT endpoints"

PERSON_ROUTE=$(python3 -c "
import json,sys
routes=json.loads(sys.argv[1]).get('routes',[])
for r in routes:
    if r.get('routeId','').endswith('/personas/emision'):
        print(r['routeId']); break
" "$SCOPES_JSON")
[ -z "$PERSON_ROUTE" ] && fail "no se encontró POST .../personas/emision"
echo "   Ruta prueba: $PERSON_ROUTE"

echo ""
echo "2) Crear key temporal (solo 1 endpoint)"
CREATE_JSON=$(curl -s -X POST "$BASE/api/v1/admin/keys" \
  -H "X-Admin-Token: $ADMIN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"verify-scopes-flow-$(date +%s)\",\"scopes\":[\"$PERSON_ROUTE\"],\"cproductor\":80080}")

PLAIN=$(python3 -c "import json,sys; print(json.loads(sys.argv[1]).get('plainKey',''))" "$CREATE_JSON")
KEY_ID=$(python3 -c "import json,sys; print(json.loads(sys.argv[1]).get('key',{}).get('id',''))" "$CREATE_JSON")
DOCS=$(python3 -c "import json,sys; print(json.loads(sys.argv[1]).get('docsUrl',''))" "$CREATE_JSON")
[ -z "$PLAIN" ] && fail "crear key: $CREATE_JSON"
pass "key $KEY_ID creada"

echo ""
echo "3) Auth + catálogo (sin grant de negocio)"
HTTP_COT=$(curl -s -o /tmp/verify-cot.json -w "%{http_code}" -X POST "$BASE/api/v1/personas/cotizacion" \
  -H "Content-Type: application/json" \
  -H "apikey: $PLAIN" \
  -d '{"cramo":5,"cplan":"VIAJE5","ifrecuencia":"E","fdesde":"2026-07-31","fhasta":"2026-08-03","asegurados":[{"cparen":1,"xrif_asegurado":"28987654","nedad_asegurado":35}]}')
[ "$HTTP_COT" != "200" ] && fail "cotización HTTP $HTTP_COT"
pass "cotización HTTP 200"

echo ""
echo "4) Endpoint NO concedido → 403"
HTTP_AUTO=$(curl -s -o /tmp/verify-auto.json -w "%{http_code}" -X POST "$BASE/api/v1/external/createEmissionAuto" \
  -H "Content-Type: application/json" \
  -H "apikey: $PLAIN" \
  -d '{"cramo":18}')
[ "$HTTP_AUTO" != "403" ] && fail "createEmissionAuto esperaba 403, got $HTTP_AUTO"
pass "createEmissionAuto → 403"

echo ""
echo "5) Endpoint concedido → no 403 (puede ser 400 validación)"
HTTP_EM=$(curl -s -o /tmp/verify-em.json -w "%{http_code}" -X POST "$BASE/api/v1/personas/emision" \
  -H "Content-Type: application/json" \
  -H "apikey: $PLAIN" \
  -d '{"cramo":5,"plan":"VIAJE5","fecha_emision":"2026-07-31","frecuencia":"E","prima":3,"rif_tomador":1,"rif_titular":1}')
[ "$HTTP_EM" = "403" ] && fail "personas/emision no debe ser 403"
pass "personas/emision → HTTP $HTTP_EM (≠403)"

echo ""
echo "6) Detalle admin enriquecido"
DETAIL=$(curl -s -H "X-Admin-Token: $ADMIN" "$BASE/api/v1/admin/keys/$KEY_ID")
DET_ROUTES=$(python3 -c "import json,sys; r=json.loads(sys.argv[1]); print(len(r.get('routeDetails',[])))" "$DETAIL")
[ "$DET_ROUTES" -lt 1 ] && fail "routeDetails vacío"
pass "GET keys/:id → $DET_ROUTES ruta(s)"

echo ""
echo "7) Swagger filtrado por key"
if [ -n "$DOCS" ] && [ "$DOCS" != "None" ]; then
  HTTP_DOCS=$(curl -s -o /tmp/verify-docs.json -w "%{http_code}" "$DOCS")
  PATHS=$(python3 -c "import json,sys; d=json.load(open('/tmp/verify-docs.json')); print(len(d.get('paths',{})))" 2>/dev/null || echo 0)
  [ "$HTTP_DOCS" != "200" ] && fail "docs client HTTP $HTTP_DOCS"
  pass "Swagger filtrado HTTP 200 · $PATHS paths"
else
  echo "   SKIP (sin docsUrl)"
fi

echo ""
echo "8) Key legacy emision-api (scope emissions:person)"
LEGACY=$(grep -E '^NEST_API_KEY=' "$HOME/exelixi/Emision-Plan-modulo/server/.env" 2>/dev/null | cut -d= -f2- | tr -d ' "'\''')
if [ -n "$LEGACY" ]; then
  HTTP_LEGACY=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/v1/personas/emision" \
    -H "Content-Type: application/json" \
    -H "apikey: $LEGACY" \
    -d '{"cramo":5,"plan":"VIAJE5","fecha_emision":"2026-07-31","frecuencia":"E","prima":3,"rif_tomador":1,"rif_titular":1}')
  [ "$HTTP_LEGACY" = "403" ] && fail "legacy emissions:person bloqueado"
  pass "modulo-emision key → HTTP $HTTP_LEGACY (≠403)"
else
  echo "   SKIP (NEST_API_KEY emision no encontrada)"
fi

echo ""
echo "9) Revocar key temporal"
curl -s -X POST "$BASE/api/v1/admin/keys/$KEY_ID/revoke" -H "X-Admin-Token: $ADMIN" > /dev/null
pass "key revocada"

echo ""
echo "=== TODO OK — flujo scopes/rutas verificado ==="
echo ""
