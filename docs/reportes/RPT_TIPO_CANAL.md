# Canal y tipo de canal en los reportes dinámicos (recibos y siniestros)

## Problema
La columna **Canal** salía vacía cuando la póliza no tenía canal alterno: el 35 % de los recibos en PG
(93.057 de 265.624, 2026-10-06). En siniestros el canal no se traía en absoluto (la tabla `siniestro`
no tenía columna de canal).

## Regla (definida con el desarrollador de Sis2000)
`tipo_canal` se calcula en el extract, desde `adpoliza`:

1. Si `ctipocanal` tiene valor: `A` Alterno · `P` Punto de venta · `T` Tradicional · `D` Directo · otra letra → `Otro`.
2. Si no (≈ 57 pólizas): con productor **80080** y canal alterno > 0 → `Alterno`; productor 80080 sin canal → `Directo`;
   cualquier otro productor → `Tradicional`.

`ctipocanal` viene lleno en el 99,97 % de las pólizas; el punto 2 solo cubre los casos en blanco.
Diferencia con la consulta original: un `ccanalalt` de `0` (valor "sin canal") no cuenta como canal alterno.
La letra `E` (1 póliza) no tiene etiqueta definida: se muestra `Otro` hasta que se defina su nombre.
Para recibos sin póliza en `adpoliza` se usa el productor del propio recibo.

## Qué ve el usuario
* **Canal**: nombre del canal alterno (Farmatodo, Venapp…) y, si no tiene, el **tipo de canal**. Nunca en blanco.
* **Tipo de canal** (columna nueva): siempre lleno.
* "Mora por canal" ya no excluye los recibos sin canal alterno.

## Qué cambia
| Capa | Cambio |
|---|---|
| Extract Sis2000 | `tipo_canal` en `mundial_recibos_origen.json`; `id_canal` y `tipo_canal` en el nuevo `mundial_siniestros_origen.json` |
| Tablas PG | `recibo.tipo_canal`; `siniestro.id_canal`, `siniestro.tipo_canal` (y `cobertura_afectada`, que faltaba en producción) |
| Sync | `mundial.adapter` y `sync-upsert.repository` escriben las columnas nuevas |
| SP | `sp_rpt_recibos_v6` y `sp_rpt_siniestros_v2` devuelven `canal` (con respaldo) y `tipo_canal` |
| Backend / SPA | etiquetas y orden de columnas en recibos y siniestros |

## Orden de aplicación (importante)
El código nuevo escribe columnas que aún no existen en producción: **si se despliega antes del paso 1, el sync falla**.

1. **DDL** (aditivo, idempotente): `docs/sql/postgres/reportes/ddl_tipo_canal.sql`.
2. **Desplegar** el backend.
3. **SP**: `sp_rpt_recibos_v6_tipo_canal.sql` y `sp_rpt_siniestros_v2_tipo_canal.sql` (`CREATE OR REPLACE`, firma sin cambios).
   Parten de las definiciones de producción del 2026-10-06 (el `sp_rpt_recibos_v6_def.sql` de la raíz está desactualizado).
4. **Configuración del extract** (simulación por defecto; `--apply` escribe y deja respaldo):
   ```bash
   node scripts/reportes/patch-origen-config.js MUNDIAL recibos
   node scripts/reportes/patch-origen-config.js MUNDIAL siniestros
   # revisar el resumen y repetir con --apply
   ```
   Nota: en producción el `querySql` de recibos sigue siendo el anterior a los LEFT JOIN; este seed incluye ambos arreglos.
5. **Recargar** para llenar `tipo_canal` en las filas existentes (hoy quedan en NULL):
   recibos con `forceSync` del rango 2026 (pasadas de vigencia, cobrados y anulados) y siniestros con `forceSync` completo.
6. **Verificar**: `node scripts/reportes/reconcile-recibos.js` y que `canal` no venga vacío en el detalle.

Rollback: las columnas nuevas pueden quedar sin usar; restaurar el `querySql` desde el respaldo del paso 4 y recrear los SP anteriores.

## Tipo de vehículo (fuera de esta fase)
Se obtiene de **`matipos.xtipo`**, unido a `vhcerti.ctipo`:
```sql
LEFT JOIN vhcerti vh ON vh.cpoliza = rec.cpoliza AND vh.fanopol = rec.fanopol
                    AND vh.fmespol = rec.fmespol AND vh.ccerti = rec.ccerti
LEFT JOIN matipos tv ON tv.cramo = rec.cramo AND tv.ctipo = vh.ctipo   -- tv.xtipo = tipo de vehículo
```
Valores del ramo 18: PARTICULARES, RUSTICO, CARGA, MOTOCICLETA, REMOLQUE, AUTOBUS, N/D (`ctipo` 0 = TODOS).
El reporte legacy "Recibos" ya lo trae así (`SPReRecibos_v3`, `tv.xtipo AS tipo_vehiculo`). El extract de siniestros usa
`vhcerti` y `mavinma` (marca, modelo, versión) pero no `matipos`.
