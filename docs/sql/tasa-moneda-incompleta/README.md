# Tasa de cambio incompleta

El 05/11/2026 la tasa EUR se cargó en `NULL` a las 04:01. `sp_calculo_auto_nexus` calcula el TCR con
`MAX(ptasamon)`, así que TCR quedó igual al dólar y la prima RCV en TCR salió sin el ajuste euro/dólar.

| Script | Uso |
|---|---|
| `1_cargar_tasa_faltante.sql` | Contingencia: completa una tasa vacía sin sobrescribir una válida |
| `2_sp_calculo_auto_nexus_QA.sql` | Agrega la validación en QA |
| `3_sp_calculo_auto_nexus_PROD.sql` | Agrega la validación en producción, después de probar en QA |

Aplicar 2 y 3 con `sqlcmd -I -b`. Los respaldos para revertir están en `respaldo/`.

Con la validación, si falta una tasa la cotización falla en vez de dar una prima incorrecta. La alerta
`moneda.tasa.incompleta` de server-api-sys avisa al monitor en un máximo de 15 minutos. Los SP legados
(`spCalculoAuto*`, `adCalculo_Auto_Total`) calculan igual y no tienen esta validación.
