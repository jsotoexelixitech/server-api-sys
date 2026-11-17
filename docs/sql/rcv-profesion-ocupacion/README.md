# RCV: profesión y ocupación del cliente por separado

**Para:** La Mundial (DBA / Luis) · **Ambiente:** Sis2000 **QA** primero · **Fecha:** 29-oct-2026

## Qué resuelve

El formulario RCV pedía un solo dato. Primero se llamó "Profesión" y después "Ocupación", pero
siempre usó el catálogo de ocupaciones (`maocupac`). Desde hoy `sp_create_maclient_nexus` lo guarda
en `maclient_atr.cocupacion` (`sp_create_maclient_nexus-ocupacion-qa.sql`).

Ahora el formulario pide los dos datos, y cada uno se guarda en su campo:

| Campo del formulario | Catálogo | Columna en `maclient_atr` |
|---|---|---|
| Profesión (obligatoria) | `maprofes` (`sp_get_profesiones_nexus`, nuevo) | `cprofesion` |
| Ocupación | `maocupac` (`sp_get_ocupaciones_nexus`) | `cocupacion` |
| Actividad económica | `maactivi` (`sp_get_actividades_nexus`) | `cactividad` |

## Qué se cambia

| Orden | Archivo | Cambio |
|---|---|---|
| 0 | `0_sp_get_profesiones_nexus.sql` | SP nuevo: catálogo de profesiones vigentes (`maprofes`). |
| 1 | `1_sp_create_maclient_nexus.sql` | 2 parámetros opcionales: `@cocupacion` y `@bocupacion_separada`. Con el flag en 1, `@cprofesion` va a `cprofesion` (validado contra `maprofes`) y `@cocupacion` va a `cocupacion` (validado contra `maocupac`). |
| 2 | `2_sp_emision_automovil_rcv_nexus.sql` | 3 parámetros opcionales: `@cocupacion_tomador`, `@cocupacion_titular` y `@bocupacion_separada`. Se pasan al crear el titular y el tomador. |
| 3 | `3_sp_pre_emision_automovil_rcv_nexus.sql` | Los mismos 3 parámetros, la herencia tomador ↔ titular de la ocupación, y el envío a `sp_emision_automovil_rcv_nexus`. |

Aplicar en orden **0 → 1 → 2 → 3**. Cada SP acepta las llamadas actuales, así que se pueden aplicar
uno por uno sin cortar la emisión.

## Garantía de no romper nada

- **No se toca ninguna tabla** (tampoco `TMEMISION_AUTOMOVIL_RCV2`). La ocupación viaja como parámetro,
  igual que el país (`rcv-cpais-extranjero`).
- Los parámetros nuevos son **opcionales y van al final**. Sin ellos (`@bocupacion_separada = 0`) el
  resultado es **idéntico al de hoy**: lo que llega en `@cprofesion` se guarda como ocupación.
- `sp_emision_personas_general_nexus`, `sp_emision_condominio_nexus` y `sp_orden_pago_siniestro_nexus`
  no envían profesión y no cambian.
- Base de cada script: la versión que corría en QA el 29-oct-2026 (copia en `respaldo/`). Los cambios
  están marcados en el código con `[ocupacion 29-oct-2026]`.
- nest-api no envía los parámetros nuevos hasta que se active `NEST_RCV_SEND_OCUPACION=1`.

## Orden de despliegue

1. Scripts 0 → 3 en Sis2000.
2. server-api-sys (endpoint `GET /valrep/profesiones`) y luego `NEST_RCV_SEND_OCUPACION=1`.
3. Formulario-modulo y Emision-Plan-modulo, en el mismo pase.

Si los frentes salen antes que la variable, la ocupación se sigue guardando bien y la profesión no se
guarda hasta que se active la variable. Nunca se guarda una ocupación como profesión.

## Antes de pasar a producción

1. **Catálogo de profesiones.** Según `corregir-maclient-atr-ocupacion-nexus.sql`, `maprofes` en
   producción tiene 3 profesiones (Administrador, Contador, Ingeniero); en QA hay 36. Con la profesión
   obligatoria, el catálogo de producción tiene que estar completo antes del pase:

   ```sql
   SELECT iestado, COUNT(*) FROM Sis2000.dbo.maprofes GROUP BY iestado;
   ```

2. **Versión de producción de los SP.** Estos scripts parten de QA. En producción
   `sp_create_maclient_nexus` es otra versión (ver `sp_create_maclient_nexus-ocupacion-produccion.sql`;
   no tiene el bloque de CID duplicado). Hay que aplicar los mismos cambios marcados sobre la versión
   de producción de cada SP, no copiar estos archivos tal cual.

## Verificación

```sql
-- Parámetros nuevos
SELECT OBJECT_NAME(p.object_id) AS sp, p.name
FROM sys.parameters p
WHERE OBJECT_NAME(p.object_id) IN ('sp_create_maclient_nexus', 'sp_emision_automovil_rcv_nexus',
                                   'sp_pre_emision_automovil_rcv_nexus')
  AND (p.name LIKE '@cocupacion%' OR p.name = '@bocupacion_separada');

-- Catálogo
EXEC sp_get_profesiones_nexus;

-- Cliente de una emisión de prueba: profesión y ocupación en su columna
SELECT a.cci_rif, a.cprofesion, p.xprofesion, a.cocupacion, o.xocupacion, a.cactividad
FROM maclient_atr a
LEFT JOIN maprofes p ON p.cprofesion = a.cprofesion
LEFT JOIN maocupac o ON o.cocupacion = a.cocupacion
WHERE a.cci_rif = <cédula del tomador>;
```

## Volver atrás

Aplicar los archivos de `respaldo/` (versión de QA del 29-oct-2026). Antes, apagar
`NEST_RCV_SEND_OCUPACION` en nest-api para que no envíe parámetros que el SP anterior no conoce.
Los comentarios con flechas (→, ↔) de los respaldos se perdieron al exportarlos, pero el código está
completo.
