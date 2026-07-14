/** Orden de secciones Swagger — solo flujo RCV Exélixi → Sis2000. */
export const SWAGGER_TAG_ORDER = [
  '1. Catálogo vehículo (inma)',
  '2. Catálogos y cotización (valrep)',
  '3. Emisión RCV',
  '4. Cobranza RCV',
  '5. Documentos (post-emisión)',
] as const;

export const SWAGGER_API_DESCRIPTION = `
**RCV Exélixi → Sis2000** (OCR → Formulario → Emisión → Pagos).

Solo endpoints del flujo RCV en producción. Todos ejecutan SP o SQL directo contra Sis2000.

---

| Paso | Endpoint | Sis2000 |
|------|----------|---------|
| 1 | \`GET /inma/anios\` → \`POST /inma/marcas\` → \`modelo\` → \`version\` → \`categorias-uso\` | \`VInma\` |
| 2 | \`GET /valrep/states\` → \`cities\` → \`POST /valrep/getLists\` | \`maestados\`, \`maciudades\`, \`maparent\` |
| 3 | \`POST /valrep/planes/v2\` | \`spBuscaPlan\` |
| 4 | \`POST /valrep/cotizacion\` | \`spCalculoAuto\` |
| 5 | \`POST /external/validateEmissionAuto\` | \`speeValidateAutomovilGeneral\` |
| 6 | \`POST /external/createEmissionAuto\` | \`sp_pre_emision_Automovil_RCV2\` |
| 7 | \`POST /external/collection/activate\` | \`spCobroSis_Ad\` + \`cbreporte_pago\` |
| 8 | \`POST /documents/conductor-habitual\` | PDF anexo (post-emisión) |

**Auth:** header \`apikey\` (\`maclient_api.xtoken\`) en pasos 6, 7 y 8.

**Cobro validado QA:** ingreso #183034 · póliza \`18-1-0000078926\`
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
