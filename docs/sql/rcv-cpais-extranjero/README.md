# RCV placa extranjera — país de la dirección del tomador y del titular

**Para:** La Mundial (DBA / Luis) · **Ambiente:** Sis2000 **QA** primero · **Fecha:** 23-oct-2026

## Qué resuelve

Hoy la emisión RCV graba la dirección del tomador y del titular con país **58 (Venezuela) fijo**
(`sp_emision_automovil_rcv_nexus` → `sp_create_maclient_nexus`). Un cliente con placa extranjera y
dirección en Colombia (país 57) quedaría guardado como Venezuela, y los códigos de estado de Colombia
se cruzan con los de Venezuela (ej. 5 = Antioquia).

## Qué se cambia (solo 2 SP)

| Orden | Archivo | Cambio |
|---|---|---|
| 1 | `1_sp_emision_automovil_rcv_nexus.sql` | 2 parámetros opcionales `@cpais_tomador` / `@cpais_titular` (NULL → 58) y se usan al crear el cliente titular y tomador en lugar del 58 fijo. |
| 2 | `2_sp_pre_emision_automovil_rcv_nexus.sql` | Los mismos 2 parámetros opcionales, herencia tomador ↔ titular, y se pasan a `sp_emision_automovil_rcv_nexus` en el `EXEC`. |

Aplicar **primero el 1** y **después el 2** (el 2 envía los parámetros que el 1 debe aceptar).

## Garantía de no romper nada

- **No se toca ninguna tabla** (tampoco `TMEMISION_AUTOMOVIL_RCV2`).
- Parámetros nuevos **opcionales y al final** (`= NULL`): cualquier llamada actual sigue igual.
- Sin país enviado (todas las emisiones actuales) el resultado es **idéntico al de hoy** (58).
- Son la **versión exacta que corre hoy en QA** (copiada el 23-oct-2026) con cambios mínimos,
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

Si `max_ciudad` > 32.767, avisar antes de aplicar.

## Verificación

```sql
-- Parámetros nuevos (2 filas en cada SP)
SELECT OBJECT_NAME(p.object_id, DB_ID('Sis2000')) AS sp, p.name
FROM Sis2000.sys.parameters p
WHERE OBJECT_NAME(p.object_id, DB_ID('Sis2000')) IN ('sp_pre_emision_automovil_rcv_nexus', 'sp_emision_automovil_rcv_nexus')
  AND p.name LIKE '@cpais%';

-- Emisión con dirección en Colombia (cuando nest-api envíe el país): país en la dirección del tomador
SELECT t.cnpoliza, t.xrif_tomador, d.cpais, d.cestado, d.cciudad
FROM Sis2000.dbo.TMEMISION_AUTOMOVIL_RCV2 t
JOIN Sis2000.dbo.maclient_dir d ON d.cci_rif = t.xrif_tomador
WHERE RTRIM(t.cnpoliza) = '18-1-XXXXXXXXXX';
```

## Volver atrás

Exelixi conserva la versión actual de QA de ambos SP (respaldo del 23-oct-2026); se puede enviar
si hiciera falta revertir.

## Observación aparte (no es parte de este cambio)

En `sp_create_maclient_nexus`, paso **3 (MACLIENT_DIR)**: el `IF @xdireccion IS NOT NULL ...`
solo aplica al `DECLARE`; el bloque `BEGIN ... END` del insert/update de `maclient_dir` se ejecuta
aunque la dirección venga vacía. No se modificó; queda para revisión de La Mundial.
