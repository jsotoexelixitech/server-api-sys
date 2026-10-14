# Rutas del Core para el Motor de Endosos (centralizadas en server-api-sys)

El backend de Endosos (`git-web-endosos-backend`) consume 13 llamadas al Core. Antes estaban repartidas
entre SysIP-backend (rama `fb_endosos`, rutas `/api/v1/...`) y server-api-sys. Ahora **todas viven en
server-api-sys**. Las 8 que solo existían en SysIP-backend se portaron al módulo `endosos`
(`src/modules/endosos/core/`) con el **mismo contrato de petición/respuesta** y consultas parametrizadas.

## Configuración del tenant (Parametrización → Rutas de Integración)

`baseUrl` = URL del Core (server-api-sys). `apiKey` con los scopes `endosos:write` y `collection:write`.

| Clave del configurador | Método | Path |
|---|---|---|
| `searchPolicies` | POST | `/api/endosos/core/policies-info` |
| `getPolicyById` | POST | `/api/endosos/core/poliza` (alternativa liviana: `/api/endosos/core/poliza-only`) |
| `getPolicyDetails` | POST | `/api/endosos/core/poliza-recibos` |
| `getPolicyReceipts` | — | vacío (los recibos ya vienen en el detalle; marcar "Los recibos ya vienen en el detalle") |
| `calculatePlan` | POST | `/api/endosos/core/calcular-plan-sis` |
| `planesSolicitud` | POST | `/api/endosos/core/planes-solicitud` |
| `planCoverages` | POST | `/api/endosos/core/plan-coberturas` |
| `planesCatalog` | POST | `/api/v1/valrep/planes/v2` *(ya existía)* |
| `planFrequencies` | POST | `/api/v1/valrep/frecuencia` *(ya existía)* |
| `createReceipt` | POST | `/api/endoso-recibos/crearRecibo` *(ya existía)* |
| `voidReceipts` | POST | `/api/endosos/core/anular-recibos` |
| `reportPayment` | POST | `/api/v1/external/collection/collect` *(ya existía; mismo cuerpo: `cnrecibo`, `mpago`, `xreferencia`, `fpago`)* |
| `getClientByDocument` | GET | `/api/v1/client/search/{cci_rif}` *(ya existía)* |

## Equivalencia con el legado (SysIP-backend `fb_endosos`)

| Legado | Nest |
|---|---|
| `POST /api/v1/client/search/policies-info` | `POST /api/endosos/core/policies-info` |
| `POST /api/v1/poliza/searchPoliza` | `POST /api/endosos/core/poliza` |
| `POST /api/v1/poliza/searchPolizaOnly` | `POST /api/endosos/core/poliza-only` |
| `POST /api/v1/poliza/search-polizaRecibos` | `POST /api/endosos/core/poliza-recibos` |
| `POST /api/v1/poliza/plan-coberturas` | `POST /api/endosos/core/plan-coberturas` |
| `POST /api/v1/emissions/calculatePlanSis` | `POST /api/endosos/core/calcular-plan-sis` |
| `POST /api/v1/emissions/planesSolicitud` | `POST /api/endosos/core/planes-solicitud` |
| `POST /api/v1/changes/anularRecibos` | `POST /api/endosos/core/anular-recibos` |
| `POST /api/v1/collection-automatic/collect` | `POST /api/v1/external/collection/collect` |

## Diferencias respecto al legado

- Consultas **parametrizadas** (el legado concatenaba strings en el SQL).
- `poliza-only`: solo acepta filtros sobre columnas conocidas de `adpoliza`.
- `anular-recibos`: una sola transacción (recibo, cobertura y recibo del contrato) con bitácora en
  `auoperaciones`; el legado actualizaba `SURECIBO` con una lista de `cnrecibo` en vez de `crecibo`.
- `poliza-recibos`: las fechas de los recibos se formatean en UTC (no dependen de la zona del servidor).
- `coberturasReal` sale ordenado por código de cobertura.

## Verificación

Contra Sis2000 QA se comparó la respuesta con la del servicio legado (`cierrelmds`) para las mismas entradas:
`poliza`, `policies-info` y `poliza-recibos` son idénticos en valores.
