# Emisión sin bloqueos en Sis2000 (pase a Producción)

## Qué resuelve

El 20-nov-2026 las emisiones de Nexus en Producción se quedaron esperando hasta 5 minutos y hubo deadlocks.
Esto pasó mientras corría una renovación masiva (`cprog = 'SQL_DBA'`).

La causa está en `sp_contador_nexus`:

1. Toma los contadores globales (`macontadores`), que también usa Sis2000 escritorio.
2. Sin soltarlos, recorre completas `adpoliza`, `adrecibos` y `TMEMISION_PERSONAS_GENERAL` con bloqueos de lectura.
3. Si otro proceso tiene una póliza, un recibo o una pre-emisión sin confirmar, el contador espera.
4. Mientras espera, todas las demás emisiones hacen fila detrás de él.

Lo mismo pasaba con otras lecturas de la cadena RCV que corren con los contadores tomados.
Esas lecturas no tienen índice para su filtro: `adpoliza` por `cproces` y `vhcerti` por `cnpoliza` o por placa.

## Qué cambia

Los scripts solo agregan `WITH (NOLOCK)` a esas lecturas.
En `sp_contador_nexus`, además, los máximos de autocuración se leen antes de tomar los contadores.
La numeración entregada no cambia.

| Script | Objeto |
|---|---|
| `10_sp_contador_nexus.sql` | Contador de Nexus (todas las emisiones: RCV, personas, condominio). |
| `11_sp_genera_coberturas_recibos_auto_rcv_nexus.sql` | Búsqueda de la póliza por `cproces`. |
| `12_sp_emision_automovil_rcv_nexus.sql` | Suma asegurada desde `vhcerti` (filtro por `cnpoliza`). |
| `13_sp_pre_emision_automovil_rcv_nexus.sql` | Verificación del `cproces` de la cotización. |
| `14_spee_validate_automovil_general_nexus.sql` | Validación de placa y serial vigentes. |

Los scripts parten de las definiciones de **Producción** (.67) al 20-nov-2026, no de las de QA.
Los SP de QA tienen cambios que aún no están en Producción.

## Cómo aplicar

- **Pase:** ejecutar `00_pase_completo.sql` en la BD `Sis2000` de Producción. Contiene los scripts 10 a 14 en orden.
- **Reversa:** ejecutar `reversa/00_reversa_completa.sql`. Devuelve las 5 definiciones de Producción previas al pase.

## Pruebas hechas en QA (.80)

Se aplicó la versión equivalente sobre las definiciones de QA.

| Prueba | Antes | Después |
|---|---|---|
| Contador con una póliza o recibo de otra sesión sin confirmar | Espera hasta cortarse (60 s) | 0,17 s |
| RCV + Funerario simultáneos con póliza, recibo, certificado, cobertura y pre-emisión de otra sesión sin confirmar (30 s) | 30 s cada una | 1,4 s y 0,5 s |
| 4 RCV + 3 Funerario simultáneos | — | 2,9 s en total |

- En la prueba simultánea no hubo deadlocks ni números de póliza, recibo o `cproces` repetidos.
- La placa repetida se sigue rechazando.

## Requiere también el cambio de la API

Va en este mismo PR.
Después de cada emisión RCV, la API registra la membresía Arys.
La consulta de esa membresía unía `vhcerti` por `cnpoliza` con bloqueos.
Una fila de `vhcerti` sin confirmar la dejaba esperando, y las emisiones RCV siguientes hacían fila detrás.
En QA eso llegó a 60 s; con el cambio, 0,9 s.
