/** Orden de secciones Swagger — solo flujo RCV Exélixi → Sis2000. */
export const SWAGGER_TAG_ORDER = [
  '1. Catálogo vehículo (inma)',
  '2. Catálogos y cotización (valrep)',
  '3. Emisión RCV',
  '4. Cobranza RCV',
  '5. Documentos (post-emisión)',
  '6. Emisión Funerario (personas)',
] as const;

export const SWAGGER_API_DESCRIPTION = `
**La Mundial de Seguros · RCV → Sis2000** (catálogo, cotización, emisión y cobranza).

Integración técnica del flujo RCV. Todos los endpoints ejecutan SP o SQL directo contra Sis2000.

---

### Flujo Exélixi (wizard)

| Paso wizard | Módulo | Acción | Endpoint nest-api |
|-------------|--------|--------|-------------------|
| 3 | Formulario | Validar placa/serial **antes de elegir plan** | \`POST /external/validateEmissionAuto\` (sin \`plan\` → \`RCVBAS\`) |
| 4 | Emisión | Planes + cotización | \`POST /valrep/planes/v2\` → \`POST /valrep/cotizacion\` |
| 5 | Pagos | Emitir + cobrar | \`POST /external/createEmissionAuto\` → \`POST /external/collection/activate\` |

### Referencia técnica (Sis2000)

| Paso | Endpoint | Sis2000 |
|------|----------|---------|
| 1 | \`GET /inma/anios\` → \`POST /inma/marcas\` → \`modelo\` → \`version\` → \`categorias-uso\` | \`VInma\` |
| 2 | \`GET /valrep/states\` → \`cities\` → \`POST /valrep/getLists\` | \`maestados\`, \`maciudades\`, \`maparent\` |
| 3 | \`POST /valrep/planes/v2\` | \`spBuscaPlan\` |
| 4 | \`POST /valrep/cotizacion\` | \`spCalculoAuto\` |
| 5a | \`POST /external/validateEmissionAuto\` **sin plan** (Formulario, pre-plan) | \`speeValidateAutomovilGeneral\` |
| 5b | \`POST /external/validateEmissionAuto\` **con plan** (re-validación opcional) | \`speeValidateAutomovilGeneral\` |
| 6 | \`POST /external/createEmissionAuto\` | \`sp_pre_emision_automovil_rcv_nexus\` → \`sp_emision_automovil_rcv_nexus\` |
| 7 | \`POST /external/collection/activate\` | \`spCobroSis_Ad\` + \`cbreporte_pago\` |
| 8 | \`POST /documents/conductor-habitual\` | PDF anexo (post-emisión) |

**Auth:** header \`apikey\` (\`maclient_api.xtoken\`) en pasos 6, 7 y 8.

**Probar validación pre-plan (Swagger o curl):** body solo con \`placa\` y \`serial_carroceria\` (carnet). No envíes \`plan\` ni serial de motor.

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

/** Validación temprana Formulario Exélixi — carnet: placa + serial carrocería (sin plan ni motor). */
export const RCV_VALIDATE_PRE_PLAN_BODY = {
  placa: 'AE886C',
  serial_carroceria: 'SC1S6ZMV3024323',
};

/** Re-validación con plan ya elegido (opcional, antes de emitir). */
export const RCV_VALIDATE_WITH_PLAN_BODY = {
  plan: 'RCVBAS',
  placa: 'AE886C',
  serial_carroceria: 'SC1S6ZMV3024323',
};

/**
 * Body ejemplo Swagger — emisión nueva RCV.
 * No incluir `poliza`/`cnpoliza_rel` (Sis2000 genera `cnpoliza`).
 * No enviar `prima`/`mprima` en 0: omitir o usar totales de `POST /valrep/cotizacion`.
 * `placa` y `serial_carroceria` deben ser únicos en QA (vhcerti vigente); cambiar en cada prueba.
 */
export const RCV_CREATE_EMISSION_AUTO_BODY: Record<string, unknown> = {
  cramo: 18,
  plan: 'Moto1',
  tipo_cedula_tomador: 'V',
  rif_tomador: 29640210,
  nombre_tomador: 'TEST',
  apellido_tomador: 'EJEMPLO',
  telefono_tomador: '04240000000',
  correo_tomador: 'test@ejemplo.com',
  sexo_tomador: 'M',
  fnac_tomador: '1990-01-01',
  estado_tomador: 1,
  ciudad_tomador: 128,
  direccion_tomador: 'Dirección de prueba QA',
  tipo_cedula_titular: 'V',
  rif_titular: 29640210,
  nombre_titular: 'TEST',
  apellido_titular: 'EJEMPLO',
  telefono_titular: '04240000000',
  correo_titular: 'test@ejemplo.com',
  sexo_titular: 'M',
  fnac_titular: '1990-01-01',
  estado_titular: 1,
  ciudad_titular: 128,
  direccion_titular: 'Dirección de prueba QA',
  marca: '582',
  modelo: '001',
  version: '17',
  fano: 2024,
  color: 'Negro',
  placa: 'NXSWG01',
  serial_carroceria: 'NXSWG0158220240017',
  ccategoria_uso: 20,
  npuestos: 2,
  iplaca: 'N',
  dec_persona_politica: '0',
  dec_term_y_cod: '1',
  frecuencia: 'A',
  fecha_emision: '2026-07-20',
  fdesde: '2026-07-20',
  fhasta: '2027-07-19',
};

/** Mismo flujo con prima tomada de cotización (opcional). */
export const RCV_CREATE_EMISSION_AUTO_BODY_WITH_PRIMA: Record<string, unknown> = {
  ...RCV_CREATE_EMISSION_AUTO_BODY,
  placa: 'NXSWG02',
  serial_carroceria: 'NXSWG0258220240017',
  rif_tomador: 29640211,
  rif_titular: 29640211,
  mprimaext: 23.15,
  mprima: 17069.13,
  ptasa: 737.23,
};
