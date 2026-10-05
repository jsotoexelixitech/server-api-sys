# Coberturas vacías en RPT_RECIBOS

La columna **Coberturas** del detalle sale de `recibo.coberturas` en PostgreSQL reportes. Ese campo se llena en el **sync** desde Sis2000 (`adpolcob` + `macoberturas`), no en el mapeo del SP ni solo en el frontend.

## Causas habituales

1. **`origen_config.recibos` en QA** sigue en `mode: view` o con un `querySql` sin el CTE `coberturas_agg`.
2. **`columnMap` parcial** en `origen_config`: antes del fix en `sync.service.ts`, solo se persistían las columnas listadas en `columnMap` (sin `coberturas` → siempre vacío).
3. **Datos locales en caché (TTL)** sin re-sync tras corregir config.

## Pasos en QA

1. Desplegar `server-api-sys` (rama `fb_reportes`) con el merge adapter + `columnMap` en sync (sin atajos en execute).
2. En PG reportes:
   ```bash
   node scripts/reportes/apply-recibos-coberturas-pg.js
   ```
3. Actualizar conexión Mundial:
   ```bash
   node scripts/reportes/patch-mundial-recibos-origen-config.js MUNDIAL
   ```
4. Forzar sync de recibos (rango de fechas del reporte) con `forceSync: true` en el body del execute o vía API de sync.
5. Volver a ejecutar el reporte en la SPA.

## Verificación rápida en PG

```sql
SELECT origen_clave, LEFT(coberturas, 80) AS coberturas
FROM recibo
WHERE coberturas IS NOT NULL AND BTRIM(coberturas) <> ''
LIMIT 10;
```

Si no hay filas tras el paso 4, revisar logs de sync y que el extract Sis2000 devuelva la columna `coberturas`.
