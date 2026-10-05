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
