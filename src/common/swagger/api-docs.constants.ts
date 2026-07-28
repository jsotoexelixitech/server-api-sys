import { SWAGGER_TAG_ORDER } from './swagger-tags.constants';

export { SWAGGER_TAG_ORDER };

export const SWAGGER_API_DESCRIPTION = `
Bienvenido a la **documentación oficial de la API** de La Mundial de Seguros.

Referencia técnica para catálogo vehicular, cotización, emisión, cobranza, personas y consulta de clientes.

---

### Inicio rápido

1. Seleccione el entorno **QA** en el desplegable de servidores (arriba).
2. Explore los módulos en el menú lateral o use **Try it out** en cada endpoint.
3. Catálogo y cotización se pueden probar **sin credenciales**. Para emisión, cobranza o documentos, use **Authorize** solo si dispone de clave de acceso.

**Descargas:** [OpenAPI JSON](./docs-json) · [OpenAPI YAML](./docs-yaml)

---

### Autenticación (solo operaciones protegidas)

La mayoría de endpoints (catálogo, estados, planes, cotización, consultas) **no requieren** credenciales en entorno de pruebas.

| Header | Uso | Endpoints |
|--------|-----|-----------|
| \`apikey\` | Clave de acceso a la API | Emisión, cobranza y generación de documentos |

En QA interno puede omitirse para pruebas. En entornos públicos, La Mundial entrega la clave a integradores autorizados.

---

### Contrato de respuesta

Respuesta exitosa (HTTP 2xx):

\`\`\`json
{ "status": true, "result": { ... } }
\`\`\`

Algunos endpoints de catálogo/cotización usan \`data\` en lugar de \`result\`:

\`\`\`json
{ "status": true, "data": { ... } }
\`\`\`

Error de validación o negocio (HTTP 4xx):

\`\`\`json
{ "status": false, "message": "Descripción del error" }
\`\`\`

---

### Flujo recomendado — automóvil (RCV)

| # | Acción | Endpoint |
|---|--------|----------|
| 1 | Catálogo del vehículo | \`GET /inma/anios\` → marcas → modelo → versión |
| 2 | Ubicación y listas | \`GET /valrep/states\` → \`cities\` → \`getLists\` |
| 3 | Planes y prima | \`POST /valrep/planes/v2\` → \`POST /valrep/cotizacion\` |
| 4 | Validar placa/serial | \`POST /external/validateEmissionAuto\` |
| 5 | Emitir póliza | \`POST /external/createEmissionAuto\` |
| 6 | Cobrar recibo | \`POST /external/collection/activate\` |
| 7 | Documento anexo (opcional) | \`POST /documents/conductor-habitual\` |

> **Pruebas QA:** use placa y serial únicos en cada emisión. No envíe \`mprima\` en \`0\`; omita el campo o copie los totales de la cotización.

---

### Glosario

| Término | Descripción |
|---------|-------------|
| \`cnpoliza\` | Número de póliza emitida |
| \`cnrecibo\` | Número de recibo a cobrar |
| \`placa\` | Placa del vehículo asegurado |
| \`serial_carroceria\` | Serial de carrocería (carnet) |
| \`plan\` | Código del plan contratado (ej. \`RCVBAS\`) |
| \`frecuencia\` | Periodicidad de pago (\`A\` anual, \`E\` única, etc.) |

---

### Soporte

| | |
|---|---|
| **Entorno QA** | Servidor HTTPS seleccionable arriba |
| **Versión API** | Ver badge en el menú lateral |
| **Contacto** | integraciones@lamundialdeseguros.com |

*Documentación sujeta a cambios. Consulte el changelog antes de desplegar en producción.*
`.trim();

export const APIKEY_HEADER = {
  name: 'apikey',
  description:
    'Clave de acceso a la API (header opcional en pruebas). Requerida en emisión, cobranza y documentos en entornos públicos.',
  required: false,
  example: 'su-clave-api',
};

/** Caso real validado en QA (jul 2026). */
export const RCV_EMISSION_EXAMPLE = {
  cnpoliza: '18-1-0000078926',
  cnrecibo: '18-100272044',
  fanopol: 2026,
  fmespol: 7,
  urlpoliza: 'https://qaapi.lamundialdeseguros.com/poliza/18-1-0000078926/2026/7/',
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

/** Validación temprana en formulario — carnet: placa + serial carrocería (sin plan ni motor). */
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
 * No incluir `poliza`/`cnpoliza_rel` (el sistema genera `cnpoliza`).
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
