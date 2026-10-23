# RCV placa extranjera — país de la dirección del tomador y del titular

**Para:** La Mundial (DBA / Luis) · **Ambiente:** Sis2000 **QA** primero · **Fecha:** 23-oct-2026

## Qué resuelve

Hoy la emisión RCV graba la dirección del tomador y del titular con país **58 (Venezuela) fijo**
(`sp_emision_automovil_rcv_nexus` → `sp_create_maclient_nexus`). Un cliente con placa extranjera y
dirección en Colombia (país 57) quedaría guardado como Venezuela, y los códigos de estado de Colombia
se cruzan con los de Venezuela (ej. 5 = Antioquia).

## Garantía de no romper nada

- Todo es **opcional**: columnas `NULL`, parámetros con `= NULL` al final.
- Si no se envía país (todas las emisiones actuales), el resultado es **idéntico al de hoy** (58).
- Los SP son la **versión exacta que corre hoy en QA** (copiada el 23-oct-2026) con cambios mínimos,
  marcados en el código con `[cpais 23-oct-2026]`.
- Conductor y beneficiario no cambian (siguen con 58).
- `sp_create_maclient_nexus` y `sp_genera_coberturas_recibos_auto_rcv_nexus` **no se modifican**.
- nest-api no enviará el país hasta que se confirme que esto está aplicado.

## Antes de aplicar (1 consulta)

`sp_create_maclient_nexus` recibe `@cestado` y `@cciudad` como `SMALLINT` (máx. 32.767).
Confirmar que los códigos de Colombia caben:

```sql
SELECT MAX(cestado) AS max_estado, MAX(cciudad) AS max_ciudad, COUNT(*) AS ciudades
FROM Sis2000.dbo.maciudades WHERE cpais = 57;
```

Si `max_ciudad` > 32.767, avisar antes de aplicar (habría que ampliar ese SP).

## Orden de aplicación (en Sis2000 QA)

| Paso | Archivo | Qué hace |
|---|---|---|
| 1 | `01_tmemision_automovil_rcv2_cpais.sql` | Agrega `cpais_tomador` y `cpais_titular` (NULL) a `TMEMISION_AUTOMOVIL_RCV2`. Idempotente. |
| 2 | `02_sp_pre_emision_automovil_rcv_nexus.sql` | Recibe `@cpais_tomador` / `@cpais_titular` y los guarda en la fila (UPDATE después del INSERT). |
| 3 | `03_sp_emision_automovil_rcv_nexus.sql` | Lee el país y lo pasa a `sp_create_maclient_nexus` en lugar del 58 fijo (titular y tomador). |

El paso 1 debe ir primero (los SP 2 y 3 referencian las columnas nuevas).

## Verificación

```sql
-- Parámetros nuevos
SELECT name FROM Sis2000.sys.parameters
WHERE object_id = OBJECT_ID('Sis2000.dbo.sp_pre_emision_automovil_rcv_nexus') AND name LIKE '@cpais%';

-- Emisión normal (sin país) sigue igual: cpais 58 en la dirección
-- Emisión con dirección en Colombia (cuando nest-api envíe el país):
SELECT t.cnpoliza, t.cpais_tomador, t.cestado_tomador, t.cciudad_tomador, d.cpais, d.cestado, d.cciudad
FROM Sis2000.dbo.TMEMISION_AUTOMOVIL_RCV2 t
JOIN Sis2000.dbo.maclient_dir d ON d.cci_rif = t.xrif_tomador
WHERE RTRIM(t.cnpoliza) = '18-1-XXXXXXXXXX';
```

## Volver atrás

Ejecutar los archivos de `respaldo/` (versión de QA del 23-oct-2026, con `CREATE OR ALTER`).
Las columnas nuevas pueden quedarse: son NULL y nadie más las usa.

## Observación aparte (no es parte de este cambio)

En `sp_create_maclient_nexus`, paso **3 (MACLIENT_DIR)**: el `IF @xdireccion IS NOT NULL ...`
solo aplica al `DECLARE`; el bloque `BEGIN ... END` del insert/update de `maclient_dir` se ejecuta
aunque la dirección venga vacía. No se modificó; queda para revisión de La Mundial.
