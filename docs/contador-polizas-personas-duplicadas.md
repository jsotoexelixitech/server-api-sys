# Números de póliza repetidos en ramos de personas

**Para:** DBA y equipo técnico de La Mundial · **De:** Exelixi · **Fecha:** 27/10/2026

## Resumen

`spContador_v1` incrementa el contador del ramo, pero arma el `cnpoliza` con `qcontador + 1`. Entrega un número por delante del valor que deja guardado en `macontadores`.

Mientras solo lo use `spContador_v1`, no se notan choques: solo se saltan números. Cuando se alterna con otro camino que sí usa el valor guardado (`sp_contador_nexus`, el de las emisiones vía Nexus), ese otro camino recibe el número que `spContador_v1` ya entregó, y la póliza queda repetida.

## Evidencia

**Código de `spContador_v1`, en `sis2000_qa` y en `Sis2000`:**

```sql
UPDATE macontadores WITH (UPDLOCK)
SET @q_pol_type = qcontador = qcontador + 1 WHERE ccontador = @pol_type;     -- contador C -> C+1
...
SELECT @cnpoliza = CONCAT(..., qcontador + 1) FROM macontadores               -- entrega C+2
WHERE ccontador = @pol_type
```

El mismo patrón (`qcontador + 1` después del incremento) aparece en `cpoliza`, `cproces` y `crecibo`.

**Secuencia en QA, ramo 5 (contador `POL_ACC`):**

| Fecha | Camino | Contador | `cnpoliza` |
|---|---|---|---|
| 26/10 09:40 | Flujo Sis2000 (`spContador_v1`) | 910 → 911 | 5-1-1000000912 |
| 26/10 09:47 | Nexus (`sp_contador_nexus`) | 911 → 912 | 5-1-1000000912 (repetida) |
| 26/10 10:18 | Flujo Sis2000 | 912 → 913 | 5-1-1000000914 (el 913 queda sin usar) |
| 26/10 11:00 | Flujo Sis2000 | 913 → 914 | 5-1-1000000915 |
| 27/10 10:55 | Nexus | 914 → 915 | 5-1-1000000915 (repetida) |

**Producción (`Sis2000`), consulta del 27/10:**

- Desde julio de 2026 hay `cnpoliza` repetidos con la misma vigencia: 20 en el ramo 7, 4 en el 9 y 5 en el 18. En el ramo 5 está el 5-1-1000000902, emitido el 14/10 y el 26/10. No se revisó uno por uno si todos vienen de este cruce.
- Hoy los contadores `POL_VIDA` (1483) y `POL_ACC` (910) están uno por detrás del último número usado (1484 y 911). Sin la corrección, la próxima emisión de esos ramos por Nexus repite número.

**Quién usa cada contador:**

- **`spContador_v1`:** `sp_pre_emision_Personas_General`, `sp_emision_Personas_General`, `spSoliPerson`, `spEmiAuto`, `spRenovAuto`, `spSoliAuto`, `SpEmision_Riesgos`, `sp_emi_json`, `sp_pre_emision_Automovil_RCV2` y los triggers `TEmision_Salud`, `TEmision_Flota_Auto`, `Emision_Automovil_General` y `Emision_Personas_General_copy1`.
- **`sp_contador_nexus`:** `sp_pre_emision_personas_general_nexus`, `sp_emision_personas_general_nexus`, `sp_pre_emision_automovil_rcv_nexus` y `sp_pre_emision_condominio_nexus`.

## Qué hace Exelixi (SP `_nexus`, scripts en `docs/sql/`)

1. **`sp_contador_nexus`**, en `sp_contador_nexus_autocorreccion_personas_{qa,sis2000}.sql`. Antes de entregar un número de `POL_ACC`, `POL_FUN`, `POL_SALUD` o `POL_VIDA`, toma el mayor número ya usado en el ramo, tanto en `adpoliza` como en `TMEMISION_PERSONAS_GENERAL` (pre-emisiones sin póliza todavía). Si el contador quedó atrás, lo adelanta. RCV (`POL_VEH`) ya tenía esta corrección.
   - Solo cuenta los números con el formato de estos contadores (14 caracteres, `<ramo>-<suc>-<suc><contador>`) y dentro de una ventana de 1000 sobre el contador. Así, un número aislado fuera de serie no hace saltar toda la numeración.
2. **`sp_pre_emision_personas_general_nexus`**, en `sp_pre_emision_personas_general_nexus_cnpoliza_unico_{qa,sis2000}.sql`. Antes de registrar la solicitud, verifica que el `cnpoliza` no exista en `adpoliza` ni en `TMEMISION_PERSONAS_GENERAL`. Si existe, pide otro número (hasta 3 intentos) y, si sigue repetido, rechaza la emisión.

Esto evita que Nexus repita números, pero no corrige la causa. Además, entre la asignación de un número en `spContador_v1` y el registro de la solicitud queda una ventana breve que ninguna verificación posterior cubre por completo.

## Qué recomendamos a La Mundial

1. **Corregir `spContador_v1`** para que use el valor incrementado (`@q_pol_type`, `@q_poliza`, `@q_proces`, `@q_crecibo`) en lugar de `qcontador + 1`.
2. **Al aplicar ese cambio, sincronizar en el mismo despliegue cada contador que usa `spContador_v1`** con el mayor número ya entregado. Si no, la primera emisión con el SP corregido repite el último número que entregó la versión anterior.
3. **Revisar las pólizas repetidas de producción** listadas arriba y decidir cuál conserva el número y a cuál se le asigna uno nuevo.

Consulta para listar los repetidos (solo lectura):

```sql
SELECT cramo, RTRIM(cnpoliza) AS cnpoliza, cpoliza, cproductor, cusuario, fingreso, fdesde
FROM adpoliza
WHERE cnpoliza IN (
    SELECT cnpoliza FROM adpoliza
    WHERE fingreso >= '2026-07-01' AND cnpoliza LIKE '%-1-1%'
    GROUP BY cramo, cnpoliza
    HAVING COUNT(DISTINCT cpoliza) > 1 AND MIN(fdesde) = MAX(fdesde)
)
ORDER BY cramo, cnpoliza, fingreso;
```
