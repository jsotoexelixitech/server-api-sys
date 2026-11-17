# Personas: profesión, ocupación y actividad económica

**Para:** La Mundial (DBA / Luis) · **Ambiente:** Sis2000 **QA** primero · **Fecha:** 30-oct-2026

## Qué resuelve

Las emisiones de personas (funerario, vida, accidentes personales, salud, viajero, 4 en 1) no
guardaban profesión, ocupación ni actividad económica de nadie. Ahora el tomador, el titular y cada
asegurado los traen, y la emisión los guarda en `maclient_atr` igual que RCV
(`rcv-profesion-ocupacion`):

| Dato | Catálogo | Columna en `maclient_atr` |
|---|---|---|
| Profesión | `maprofes` | `cprofesion` |
| Ocupación | `maocupac` | `cocupacion` |
| Actividad económica | `maactivi` | `cactividad` |

Los beneficiarios no cambian.

## Qué se cambia

| Orden | Archivo | Cambio |
|---|---|---|
| 0 | `0_alter_tmemision_personas_general.sql` | Columnas opcionales: `cprofesion_`, `cocupacion_`, `cactividad_` + `tomador`/`titular` en `TMEMISION_PERSONAS_GENERAL`; `cprofesion`, `cocupacion`, `cactividad` en `TMEMISION_PERSONAS_GENERAL_ASEG`. |
| 1 | `1_sp_pre_emision_personas_general_nexus.sql` | 6 parámetros opcionales al final (tomador y titular). Cada asegurado del JSON puede traer `cprofesion_asegurado`, `cocupacion_asegurado`, `cactividad_asegurado`. Si el titular es el tomador hereda sus datos; la fila del titular en `_ASEG` hereda los del titular. |
| 2 | `2_sp_emision_personas_general_nexus.sql` | Pasa los datos a `sp_create_maclient_nexus` con `@bocupacion_separada = 1` para titular, tomador y asegurados. |

Aplicar en orden **0 → 1 → 2**. El 1 y el 2 no compilan sin el 0 (usan las columnas nuevas).
Requiere que `sp_create_maclient_nexus` ya tenga `@cocupacion` y `@bocupacion_separada`
(`rcv-profesion-ocupacion/1_sp_create_maclient_nexus.sql`, aplicado en QA el 30-oct-2026).

## Garantía de no romper nada

- Las columnas nuevas aceptan NULL y los INSERT existentes nombran sus columnas.
- Los parámetros nuevos son opcionales y van al final: las llamadas de hoy siguen igual.
- Sin datos nuevos todo queda en NULL, y `sp_create_maclient_nexus` no toca `maclient_atr` cuando
  profesión, ocupación y actividad vienen en NULL. La emisión es la misma de hoy.
- Base de cada SP: la versión que corría en QA el 30-oct-2026 (copia en `respaldo/`). Los cambios
  están marcados con `[personas-profesion 30-oct-2026]`.
- nest-api no envía los datos nuevos hasta que se active `NEST_PERSONAS_SEND_PROFESION=1`.

## Orden de despliegue

1. Scripts 0 → 2 en Sis2000.
2. server-api-sys y luego `NEST_PERSONAS_SEND_PROFESION=1`.
3. Formulario-modulo y Emision-Plan-modulo, en el mismo pase.

## Antes de pasar a producción

1. **Catálogo de profesiones.** `maprofes` en producción tiene 3 profesiones; la profesión es
   obligatoria en el formulario.
2. **Versión de producción de los SP.** Estos scripts parten de QA. Hay que aplicar los cambios
   marcados sobre la versión de producción de cada SP, no copiar estos archivos tal cual.
3. **ADRECIBOS** sigue guardando `cprofesion = 0` y `cactividad = 0` (sin cambio).

## Verificación

```sql
-- Columnas nuevas
SELECT t.name, c.name FROM sys.columns c JOIN sys.tables t ON t.object_id = c.object_id
WHERE t.name LIKE 'TMEMISION_PERSONAS_GENERAL%'
  AND (c.name LIKE 'cprofesion%' OR c.name LIKE 'cocupacion%' OR c.name LIKE 'cactividad%');

-- Una emisión de prueba: lo que llegó y cómo quedó cada persona
DECLARE @pol VARCHAR(30) = '<cnpoliza>';
SELECT id, xrif_tomador, cprofesion_tomador, cocupacion_tomador, cactividad_tomador,
       xrif_titular, cprofesion_titular, cocupacion_titular, cactividad_titular
FROM TMEMISION_PERSONAS_GENERAL WHERE cnpoliza = @pol;

SELECT xrif_asegurado, cprofesion, cocupacion, cactividad
FROM TMEMISION_PERSONAS_GENERAL_ASEG WHERE cnpoliza = @pol;

SELECT a.cci_rif, a.cprofesion, p.xprofesion, a.cocupacion, o.xocupacion, a.cactividad
FROM maclient_atr a
LEFT JOIN maprofes p ON p.cprofesion = a.cprofesion
LEFT JOIN maocupac o ON o.cocupacion = a.cocupacion
WHERE a.cci_rif IN (SELECT xrif_asegurado FROM TMEMISION_PERSONAS_GENERAL_ASEG WHERE cnpoliza = @pol
                    UNION SELECT xrif_tomador FROM TMEMISION_PERSONAS_GENERAL WHERE cnpoliza = @pol);
```

## Volver atrás

Apagar `NEST_PERSONAS_SEND_PROFESION` y aplicar los archivos de `respaldo/`. Las columnas nuevas
pueden quedarse: nadie más las usa.
