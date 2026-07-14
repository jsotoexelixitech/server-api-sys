/** Orden de secciones en Swagger UI (flujo RCV de arriba hacia abajo). */
export const SWAGGER_TAG_ORDER = [
  '1. Catálogo vehículo (inma)',
  '2. Catálogos y cotización (valrep)',
  '3. Emisión Automóvil (RCV)',
  '4. Cobranza (Collection)',
  'personas',
  'Emisión Personas (Funerario)',
  'Documentos',
  'app',
  'client',
] as const;

export const SWAGGER_API_DESCRIPTION = `
API NestJS sobre **Sis2000** para el flujo RCV Exélixi (OCR → Formulario → Emisión → Pagos).

---

### Flujo RCV recomendado

| Paso | Endpoint | Descripción |
|------|----------|-------------|
| 1 | \`GET /inma/anios\` → \`POST /inma/marcas\` → \`modelo\` → \`version\` | Catálogo del vehículo |
| 2 | \`GET /valrep/states\` → \`GET /valrep/cities\` | Ubicación tomador |
| 3 | \`POST /valrep/planes/v2\` | Planes RCV (\`spBuscaPlan\`) |
| 4 | \`POST /valrep/cotizacion\` | Prima (\`spCalculoAuto\`) |
| 5 | \`POST /external/validateEmissionAuto\` | Validar placa/serial |
| 6 | \`POST /external/createEmissionAuto\` | Emitir (\`sp_pre_emision_Automovil_RCV2\`) |
| 7 | \`POST /external/collection/activate\` | Cobrar + ingreso de caja |

---

### Autenticación

Header \`apikey\`: token del canal en \`maclient_api.xtoken\`. Requerido en emisión y cobro.

### Cobro (validado QA ingreso #183034)

\`spCobroSis_Ad\` + UPSERT en \`cbreporte_pago\` — igual que SysIP \`collectReceip\`.
PDF: \`/sis2000/ingreso_caja/{transaccion}/\`
`.trim();

export const APIKEY_HEADER = {
  name: 'apikey',
  description:
    'Token del canal (`maclient_api.xtoken`). Obligatorio en producción; en QA interno puede omitirse.',
  required: false,
  example: 'tu-token-canal-exelixi',
};

/** Caso real validado en QA (jul 2026). */
export const RCV_EMISSION_EXAMPLE = {
  cnpoliza: '18-1-0000078926',
  cnrecibo: '18-100272044',
  fanopol: 2026,
  fmespol: 7,
  urlpoliza: 'https://qaapi.lamundialdeseguros.com/sis2000/poliza/18-1-0000078926/2026/7/',
};

export const RCV_COLLECTION_ACTIVATE_BODY = {
  cnrecibo: '18-100272044',
  mpago: 7.24,
  xreferencia: '219551279300',
  fpago: '2026-07-14',
  cbanco_ref: '0134',
};

export const RCV_COLLECTION_ACTIVATE_RESPONSE = {
  status: true,
  result: {
    message: 'Recibo cobrado exitosamente.',
    cobro: {
      transaccion: 183034,
      cnpoliza: '18-1-0000078926',
      fanopol: 2026,
      fmespol: 7,
      mensaje: 'Cobro realizado.',
    },
  },
};

export const RCV_COTIZACION_EXAMPLE = {
  mprimaext: 0.01,
  mprima: 7.24,
  ptasa: 723.999,
};
