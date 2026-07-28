#!/usr/bin/env bash
# Emisión viajero QA — nest-api :3002
# Uso: ./emision-viajero-qa.sh [CPLAN] [RIF_ASEGURADO] [RIF_TOMADOR]
# Ejemplo: ./emision-viajero-qa.sh VIAJE4 24176543 28450123

set -euo pipefail

BASE="${BASE:-http://127.0.0.1:3002}"
CPLAN="${1:-VIAJE4}"
RIF_ASEG="${2:-24176543}"
RIF_TOM="${3:-28450123}"
FNAC_ASEG="${FNAC_ASEG:-1991-03-15}"
FNAC_TOM="${FNAC_TOM:-1985-06-20}"

FECHA="$(date +%F)"

# ndias por plan (QA)
case "$CPLAN" in
  VIAJE4) NDAYS=3 ;;
  VIAJE5) NDAYS=4 ;;
  VIAJE6) NDAYS=5 ;;
  VIAJE7) NDAYS=6 ;;
  VIAJE8) NDAYS=7 ;;
  VIAJE9) NDAYS=8 ;;
  VIAJ10) NDAYS=15 ;;
  *) echo "Plan desconocido: $CPLAN"; exit 1 ;;
esac

FHASTA="$(date -d "$FECHA +$((NDAYS - 1)) days" +%F)"

echo "=== Plan $CPLAN | $NDAYS días | asegurado V-$RIF_ASEG | tomador V-$RIF_TOM ==="

echo "--- frecuencia/detalle ---"
curl -s -X POST "$BASE/api/v1/valrep/frecuencia/detalle" \
  -H "Content-Type: application/json" \
  -d "{\"cplan\":\"$CPLAN\",\"cramo\":5}"
echo

echo "--- cotización ---"
COT=$(curl -s -X POST "$BASE/api/v1/personas/cotizacion" \
  -H "Content-Type: application/json" \
  -d "{
    \"cramo\": 5,
    \"cplan\": \"$CPLAN\",
    \"ifrecuencia\": \"E\",
    \"asegurados\": [{
      \"cparen\": 1,
      \"xrif_asegurado\": \"$RIF_ASEG\",
      \"nedad_asegurado\": 35
    }]
  }")
echo "$COT"
PRIMA_USD=$(echo "$COT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('mprimaext',''))" 2>/dev/null || echo "2.25")
if [ -z "$PRIMA_USD" ] || [ "$PRIMA_USD" = "None" ]; then
  echo "ERROR: cotización falló"; exit 1
fi

echo "--- validación ---"
curl -s -X POST "$BASE/api/v1/personas/validacion" \
  -H "Content-Type: application/json" \
  -d "{
    \"cramo\": 5,
    \"plan\": \"$CPLAN\",
    \"femision\": \"$FECHA\",
    \"rif_titular\": $RIF_ASEG,
    \"fnac_titular\": \"$FNAC_ASEG\"
  }"
echo

echo "--- emisión (prima USD=$PRIMA_USD) ---"
python3 <<PY
import json, urllib.request
payload = {
  "cramo": 5,
  "plan": "$CPLAN",
  "fecha_emision": "$FECHA",
  "fdesde": "$FECHA",
  "fhasta": "$FHASTA",
  "frecuencia": "E",
  "prima": float("$PRIMA_USD"),
  "cmoneda": "\$",
  "dec_term_y_cod": 1,
  "tipo_cedula_tomador": "V",
  "rif_tomador": int("$RIF_TOM"),
  "nombre_tomador": "MARIA",
  "apellido_tomador": "GOMEZ",
  "sexo_tomador": "F",
  "estado_civil_tomador": "C",
  "fnac_tomador": "$FNAC_TOM",
  "estado_tomador": 1,
  "ciudad_tomador": 128,
  "direccion_tomador": "Av. Libertador",
  "telefono_tomador": "04141234567",
  "correo_tomador": "maria@test.com",
  "tipo_cedula_titular": "V",
  "rif_titular": int("$RIF_ASEG"),
  "nombre_titular": "PEDRO",
  "apellido_titular": "VIAJERO",
  "sexo_titular": "M",
  "estado_civil_titular": "S",
  "fnac_titular": "$FNAC_ASEG",
  "estado_titular": 1,
  "ciudad_titular": 128,
  "direccion_titular": "Av. Principal",
  "telefono_titular": "04241234567",
  "correo_titular": "pedro@test.com",
  "asegurados": [{
    "icedula_asegurado": "V",
    "xrif_asegurado": "$RIF_ASEG",
    "xnombre_asegurado": "PEDRO",
    "xapellido_asegurado": "VIAJERO",
    "isexo_asegurado": "M",
    "iestado_civil_asegurado": "S",
    "fnac_asegurado": "$FNAC_ASEG",
    "nparentesco_asegurado": 1
  }],
  "beneficiarios": []
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
