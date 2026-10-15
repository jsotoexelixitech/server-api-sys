# Reporte de pólizas · migración a Producción (2026-10-15)

## Qué se aplicó en PG reportes de Producción (172.30.149.75)
| Elemento | Detalle |
|---|---|
| `sp_rpt_polizas` | `docs/sql/postgres/reportes/sp_rpt_polizas_produccion.sql`: igual al de QA con `id_aseguradora` en los cruces de catálogos |
| Configuración del reporte | Esquema `RPT_POLIZAS` con 8 campos, 22 KPIs y 6 gráficos, copiados de QA (121) |
| Consulta de extracción | `origen_config.polizas.querySql` corregida (seed `docs/reportes/seed/mundial_polizas_origen.json`) |
| Datos | Pólizas emitidas en 2026 cargadas desde Sis2000 (mismo alcance que QA) |

## Por qué se reescribió la consulta de extracción
La consulta anterior nunca corría contra Sis2000 (ni Sis2000_QA): usaba `AS plan` sin corchetes (palabra reservada) y
las columnas `adpoliza.iestatopol` y `adpoliza.mprima`, que no existen. El sync de pólizas de QA estaba con error desde el
2026-09-28; los datos de QA venían de una carga anterior.

La consulta nueva reproduce los valores que ya tenía QA:

| Campo | Regla | Coincidencia con los datos de QA |
|---|---|---|
| `estado` | `NO VIGENTE` si `adpoliza.iestado = 'N'`, si no `VIGENTE` | 99 % |
| `estatus_poliza` | `ANULADO` si `istatpol = 'A'` o todos sus recibos están anulados; `PENDIENTE` si tiene algún recibo pendiente; si no `PAGADO` | 97 % |
| `prima_total` | suma de `mprimabrutaext` (USD) de los recibos no anulados de la póliza | 97 % |
| `plan` | alias entre corchetes | n/a |

La diferencia restante se debe a que la carga de QA es anterior a los datos actuales de Sis2000_QA. La **regla de estatus y la
fórmula de prima son una reconstrucción** a partir de los datos de QA: conviene validarlas con el dueño del reporte.

El filtro por estatus del reporte (`@iestatopol`) usa la misma expresión que la columna, así que filtra exactamente lo que muestra.

## Cómo reaplicar la consulta
```
node scripts/reportes/patch-origen-config.js MUNDIAL polizas          # simula
node scripts/reportes/patch-origen-config.js MUNDIAL polizas --apply  # aplica con respaldo
```
