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
| `REPORTES_SYNC_RECIBOS_ON_EXECUTE` | `true` | `false` = la consulta y exportación de recibos **no** sincronizan: responden de PG en 1-2 s y el refresco programado mantiene los datos. `forceSync` sigue funcionando. Cada entidad tiene su variable. |
| `REPORTES_SYNC_SINIESTROS_ON_EXECUTE` | `true` | Lo mismo para siniestros. |
| `REPORTES_SYNC_SCHEDULE_ENTIDADES` | `recibos,siniestros` | Entidades que refresca el proceso programado. |

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

### Configuración recomendada: datos con a lo sumo 5 minutos de atraso

```
REPORTES_SYNC_ENABLED=true
REPORTES_SYNC_SCHEDULE_ENABLED=true
REPORTES_SYNC_SCHEDULE_INTERVAL_MINUTES=5      # mínimo permitido
REPORTES_SYNC_SCHEDULE_WINDOW_DAYS=7
REPORTES_SYNC_RECIBOS_ON_EXECUTE=false
REPORTES_SYNC_SINIESTROS_ON_EXECUTE=false
REPORTES_SYNC_SCHEDULE_ENTIDADES=recibos,siniestros
```

Costo medido de una ronda (3 pasadas, ventana de 7 días, Sis2000 de producción, 2026-10-07): ~8.200 filas,
~3 s de extracción y ~5 s de escritura estimada, es decir unos 10 s de 300 s. Si una ronda no ha terminado cuando
vence la siguiente, esa se omite.

Límite a tener en cuenta: con la consulta sin sync, un rango **anterior** a lo ya cargado en PG (p. ej. 2024) no
se trae por sí solo. Los cambios de estado de recibos antiguos sí llegan, porque el cobro o la anulación llevan
fecha reciente y caen en la ventana de 7 días. Para cargar un rango histórico: `forceSync` de ese rango.

### Siniestros

El refresco de siniestros es un **reemplazo completo** (~3.000 filas; extracción de Sis2000 de 1 a 2 s), sin rango de
fechas, para que también lleguen los pagos, anulaciones y rechazos de siniestros antiguos. Se escribe en una sola
transacción: los lectores ven siempre la tabla completa, y si el origen devolviera menos de la mitad de lo que se va
a borrar (con más de 100 filas), el reemplazo se revierte y queda el estado anterior (`debeFrenarReemplazo`).

La escritura pasó de un `INSERT` por siniestro a lotes de 500 filas. Medido en PG de desarrollo, 3.200 filas:
**1,25 s por lotes contra ~6,5 s fila por fila**. Hizo falta corregir `buildNamedQuery` (búsqueda lineal por cada
parámetro con nombre): con 23.500 parámetros por lote el lote tardaba más que el método anterior.

## Sync al consultar por alcance (escritura por diferencias)

Con `REPORTES_SYNC_RECIBOS_ON_EXECUTE=true` (y `REPORTES_SYNC_SINIESTROS_ON_EXECUTE=true`) cada consulta o exportación
refresca primero **exactamente lo que el usuario pidió** (rango, estado, ramo, canal, productor, póliza, cliente...) y
responde desde PG. Cambios que lo hacen viable:

| Cambio | Qué resuelve |
|---|---|
| **Una transformación por fila.** `pick()` ya no reconstruye un mapa de columnas en cada llamada y la escritura de recibos transforma cada fila una sola vez (antes 4). | La preparación de 16.000 filas pasó de ~2 s (más repeticiones) a ~60 ms. Beneficia también a siniestros y pólizas. |
| **Escritura por diferencias** (`REPORTES_SYNC_RECIBOS_DELTA=true`). `INSERT ... ON CONFLICT DO UPDATE ... WHERE (fila actual) IS DISTINCT FROM (fila nueva)`: solo se escribe lo nuevo o modificado. Lo que ya no vino del origen dentro del alcance se borra (con freno de seguridad). | Menos escritura de tuplas e índices, y la transacción sigue siendo atómica. |
| **Vigencia por alcance** (`REPORTES_SYNC_SCOPE_TTL_SECONDS`, 30 s). La repetición de una misma consulta (paginación, gráficos) no vuelve al origen; otro rango sí. | Antes el TTL era por entidad: el sync de otro usuario o del refresco programado hacía que tu consulta se saltara el refresco. |
| **Espera del candado** (`REPORTES_SYNC_LOCK_WAIT_SECONDS`, 45 s). Si hay un sync en curso, la consulta espera y luego refresca su rango. | Antes respondía de inmediato con datos locales sin refrescar. |

### Medido en QA (Sis2000_QA → PG QA)
| Alcance | Antes | Ahora |
|---|---|---|
| Un mes (16.001 recibos) | ~11,9 s (origen 2,3 s + escritura 9,4 s) | ~3,9 s (origen 2,5 s + escritura 1,3 s) |
| 01/01 a 14/09/2026 (104.051 recibos) | ~75 s (estimado por proporción) | ~17 a 19 s (origen ~9 s + escritura ~7 s) |

Una segunda consulta del mismo alcance dentro de 30 s no toca el origen.

### Dónde se iba el tiempo de la lectura del origen (Sis2000)
Medido en Sis2000 con 40.000 recibos: la consulta de extracción, con todos sus joins, resuelve en **~0,25 s** en el
servidor cuando devuelve una sola fila agregada, y tarda **~3 s** cuando entrega las 40.000 filas. El resto es
transporte y procesamiento de filas en Node (esperas `ASYNC_NETWORK_IO`), no la consulta. Por eso optimizar el SQL no
ayuda (probado: tabla temporal, `OPTION (RECOMPILE)`) y `FOR JSON` es 3 veces más lento. Lo que sí ayudó:

| Cambio | Efecto medido |
|---|---|
| Lectura en paralelo por tramos de fechas (`REPORTES_SYNC_EXTRACT_PARALLEL=4`), solo recibos con rango ≥ 30 días | 95.000 filas: de ~17 s a ~9 s (2 veces) |
| Paquete TDS de 16.384 bytes (`REPORTES_SYNC_ORIGIN_PACKET_SIZE`, antes 4.096) | ~25 a 30 % menos en una prueba ruidosa |

Estos números se midieron desde un equipo remoto, con Sis2000 y PG por red. En el servidor de la API la escritura (PG en
la misma máquina) debería ser más rápida; el log del sync ahora informa el tiempo de origen y el de escritura por separado.

### Garantías y límites
- Si el origen devuelve menos de la mitad de lo que había en el alcance (más de 100 filas), la transacción se revierte.
- Con filtros distintos de fecha y estado (ramo, canal, productor, póliza...) se inserta y actualiza, pero no se borra lo
  que ya no existe en el origen (igual que antes).
- La vigencia por alcance es memoria del proceso: asume una sola instancia de la API (PM2 en modo fork).
- `REPORTES_SYNC_RECIBOS_DELTA=false` vuelve al comportamiento anterior (borrar el rango e insertar todo).
