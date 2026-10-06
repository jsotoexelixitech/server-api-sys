# Conciliación de recibos: Sis2000 vs PG reportes

El reporte dinámico lee de PostgreSQL (`recibo`), que se llena por sync desde Sis2000. Si el
sync pierde filas, el reporte queda corto sin avisar. Este script lo detecta.

```bash
node scripts/reportes/reconcile-recibos.js --desde 2026-01-01 --hasta 2026-09-14 --umbral 0.5
```

- Solo lectura en ambos lados. Compara conteos por **estado y mes** con la misma fecha que usa
  `sp_rpt_recibos_v6` (Cobrado→pago, Anulado→anulación, Pendiente→vencimiento, Notificado→vigencia).
- `--json` imprime el detalle para integrarlo al monitor. Salida: `0` OK, `2` sobre el umbral, `1` error.
- Para producción apuntar el `.env` (o variables) a la base `Sis2000` (`RECONCILE_ORIGEN_DB`) y al
  PG de reportes productivo.
- Una brecha pequeña y estable es esperable (el extract usa INNER JOIN a póliza y tomador).
  Una brecha que crece mes a mes indica fallo del sync.

## Lectura de resultados (corrida del 2026-10-05, rango 01-01 a 14-09)

| Señal | Qué significa |
|---|---|
| Cobrado jul 7,7 % y ago 15,3 % | Recibos cobrados que no llegaron a PG (cobros anticipados de vigencia futura; ver fix de `dateColByEstado`). |
| Anulado 4,5 %–33 % | Anulaciones no reflejadas en PG. |
| Pendiente con **más** filas en PG que en origen | Recibos ya cobrados en Sis2000 que PG sigue mostrando como pendientes (estado desactualizado). |
| Notificado 0 en PG | Los recibos en estado N no se están sincronizando. |

Tras desplegar el fix y recargar el rango, la conciliación debe quedar dentro del umbral.

## Refresco programado (estados desactualizados)

El reporte solo se refrescaba cuando alguien lo ejecutaba. En la corrida del 2026-10-05 el último
sync de recibos era del 01-10 y había 3.282 recibos modificados en Sis2000 desde entonces; los
"pendientes" de más en PG eran cobros del 02-10 aún no reflejados.

`SyncSchedulerService` ([sync-scheduler.service.ts](../../src/modules/reportes-sync/sync-scheduler.service.ts))
refresca en segundo plano una ventana corta, en tres pasadas: vigencia (todos los estados),
cobrados (por fecha de cobro) y anulados (por fecha de anulación). Un recibo que pasa de
pendiente a cobrado se reemplaza por su `origen_clave`.

| Variable | Defecto | Notas |
|---|---|---|
| `REPORTES_SYNC_SCHEDULE_ENABLED` | `false` | Además requiere `REPORTES_SYNC_ENABLED=true`. |
| `REPORTES_SYNC_SCHEDULE_INTERVAL_MINUTES` | `30` | Mínimo 5. |
| `REPORTES_SYNC_SCHEDULE_WINDOW_DAYS` | `7` | Máximo 60. |

Con varias réplicas de la API cada una lanzaría su ronda; el advisory lock por
aseguradora/entidad impide que corran a la vez. Que la pasada de cobrados use la fecha de
cobro requiere `dateColByEstado` en `origen_config.recibos` (ver el fix de alcance del sync).

## Recibos sin póliza o sin tomador en el extract

El `querySql` de Mundial unía `adpoliza` y `maclient` con INNER JOIN y partía de `adpoliza`. Un
recibo cuya póliza no existe en `adpoliza` (p. ej. colectivos `C-43-1182`) o cuyo tomador no está
en `maclient` no llegaba a PG, aunque el reporte "Recibos" de SysIP (LEFT JOIN) sí lo mostraba.

Ahora la consulta parte de `adrecibos` con LEFT JOIN y usa como respaldo los datos del propio
recibo (`cnpoliza`, `cramo`, `cproductor`, `ccanalalt`, `ifrecuencia`, `ctenedor`).

Validado contra Sis2000 (2026-01-01 a 2026-10-05), consulta actual vs nueva:

| Pasada | Actual | Nueva | Perdidas | Nuevas |
|---|---|---|---|---|
| Anulados | 28.625 | 28.735 | 0 | 110 |
| Cobrados | 109.552 | 109.569 | 0 | 17 |
| Vigencia | 145.452 | 145.709 | 0 | 257 |

Ninguna fila actual se pierde. Cambian solo `id_frecuencia` e `id_canal` en filas donde la póliza
los traía en blanco: ahora toman el valor del recibo, igual que el reporte "Recibos".
Para aplicarlo en producción: actualizar `origen_config.recibos.querySql` desde el seed y
recargar el rango con `forceSync`.
