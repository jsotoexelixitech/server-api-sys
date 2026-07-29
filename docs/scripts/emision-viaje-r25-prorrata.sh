#!/usr/bin/env bash
# Emisión VIAJE ramo 25 (prorrata por días) — nest-api :3002
# Uso: ./emision-viaje-r25-prorrata.sh [NDAYS] [RIF]
# Ejemplo: ./emision-viaje-r25-prorrata.sh 5 28901456

set -euo pipefail

BASE="${BASE:-http://127.0.0.1:3002}"
NDAYS="${1:-5}"
RIF="${2:-28901456}"
FNAC="${FNAC:-1990-05-20}"
NOMBRE="${NOMBRE:-PEDRO}"
APELLIDO="${APELLIDO:-VIAJERO}"
TARIFA_DIA="${TARIFA_DIA:-0.75}"

FECHA="$(date +%F)"
FHASTA="$(date -d "$FECHA +$((NDAYS - 1)) days" +%F)"
PRIMA_USD="$(echo "$NDAYS * $TARIFA_DIA" | bc -l | xargs printf "%.2f")"

echo "=== VIAJE ramo 25 | ${NDAYS} días | prima ${PRIMA_USD} USD (${NDAYS}×${TARIFA_DIA}) | RIF ${RIF} ==="

echo "--- cotización ---"
COT=$(curl -s --max-time 30 -X POST "${BASE}/api/v1/personas/cotizacion" \
  -H "Content-Type: application/json" \
  -d "{
    \"cramo\": 25,
    \"cplan\": \"VIAJE\",
    \"ifrecuencia\": \"E\",
    \"fdesde\": \"${FECHA}\",
    \"fhasta\": \"${FHASTA}\",
    \"asegurados\": [{
      \"cparen\": 1,
      \"xrif_asegurado\": \"${RIF}\",
      \"nedad_asegurado\": 35
    }]
  }" || true)
if [ -z "$COT" ]; then
  echo "WARN: cotización sin respuesta (timeout); usando prima manual ${PRIMA_USD} USD"
else
  echo "$COT"
  PRIMA_COT=$(echo "$COT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('mprimaext',''))" 2>/dev/null || true)
  if [ -n "$PRIMA_COT" ] && [ "$PRIMA_COT" != "None" ]; then
    PRIMA_USD="$PRIMA_COT"
    echo "Prima desde cotización: $PRIMA_USD USD"
  fi
fi

echo "--- validación ---"
curl -s -X POST "${BASE}/api/v1/personas/validacion" \
  -H "Content-Type: application/json" \
  -d "{
    \"cramo\": 25,
    \"plan\": \"VIAJE\",
    \"femision\": \"${FECHA}\",
    \"rif_titular\": ${RIF},
    \"fnac_titular\": \"${FNAC}\"
  }"
echo

echo "--- emisión (prima USD=${PRIMA_USD}) ---"
python3 <<PY
import json, urllib.request
payload = {
  "cramo": 25,
  "plan": "VIAJE",
  "fecha_emision": "$FECHA",
  "fdesde": "$FECHA",
  "fhasta": "$FHASTA",
  "frecuencia": "E",
  "prima": float("$PRIMA_USD"),
  "cmoneda": "\$",
  "dec_term_y_cod": 1,
  "tipo_cedula_tomador": "V",
  "rif_tomador": int("$RIF"),
  "nombre_tomador": "$NOMBRE",
  "apellido_tomador": "$APELLIDO",
  "sexo_tomador": "M",
  "estado_civil_tomador": "S",
  "fnac_tomador": "$FNAC",
  "estado_tomador": 1,
  "ciudad_tomador": 128,
  "direccion_tomador": "Av. Principal",
  "telefono_tomador": "04141234567",
  "correo_tomador": "pedro@test.com",
  "tipo_cedula_titular": "V",
  "rif_titular": int("$RIF"),
  "nombre_titular": "$NOMBRE",
  "apellido_titular": "$APELLIDO",
  "sexo_titular": "M",
  "estado_civil_titular": "S",
  "fnac_titular": "$FNAC",
  "estado_titular": 1,
  "ciudad_titular": 128,
  "direccion_titular": "Av. Principal",
  "telefono_titular": "04241234567",
  "correo_titular": "pedro@test.com",
  "asegurados": [{
    "icedula_asegurado": "V",
    "xrif_asegurado": "$RIF",
    "xnombre_asegurado": "$NOMBRE",
    "xapellido_asegurado": "$APELLIDO",
    "isexo_asegurado": "M",
    "iestado_civil_asegurado": "S",
    "fnac_asegurado": "$FNAC",
    "nparentesco_asegurado": 1
  }],
  "beneficiarios": [{
    "icedula_beneficiario": "V",
    "xrif_beneficiario": "$RIF",
    "xnombre_beneficiario": "$NOMBRE",
    "xapellido_beneficiario": "$APELLIDO",
    "nparentesco_beneficiario": 1
  }]
}
req = urllib.request.Request(
  "$BASE/api/v1/personas/emision",
  data=json.dumps(payload).encode(),
  headers={"Content-Type": "application/json"},
  method="POST",
)
with urllib.request.urlopen(req) as r:
  print(r.read().decode())
PY
