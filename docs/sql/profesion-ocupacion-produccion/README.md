# Producción: profesión, ocupación y actividad económica (RCV y personas)

**Para:** La Mundial (DBA) · **Ambiente:** Sis2000 **PRODUCCIÓN** · **Fecha:** 30-oct-2026

Probado en QA el 30-oct-2026: RCV 18-1-0130480959 y funerario 49-1-1100016154 guardan profesión y
ocupación de cada persona en su columna de `maclient_atr`. Detalle del cambio:
`rcv-profesion-ocupacion/README.md` y `personas-profesion-ocupacion/README.md`.

## Por qué hay dos fases

Los scripts de QA no se pueden aplicar tal cual en producción: modifican SP existentes con
`CREATE OR ALTER`, y la versión de producción de cada SP puede ser distinta a la de QA (por ejemplo
`sp_create_maclient_nexus`). Aplicar la de QA pisaría lo que producción tenga distinto. Por eso
primero se exporta lo que hay en producción y sobre eso se arman los cambios.

## Fase 1 · se puede aplicar ya

| Orden | Archivo | Qué hace |
|---|---|---|
| 0 | `00_verificar_produccion.sql` | **Solo lectura.** Versiones, parámetros, columnas y catálogos. Enviar el resultado. |
| 1 | `01_sp_get_profesiones_nexus.sql` | SP nuevo: catálogo de profesiones (`maprofes`). No existe en producción. |
| 2 | `02_alter_tmemision_personas_general.sql` | Columnas opcionales (NULL) en `TMEMISION_PERSONAS_GENERAL` y `_ASEG`. Los INSERT actuales no cambian. |
| 3 | `03_maprofes_catalogo_OPCIONAL.sql` | **Requiere aprobación del dueño del catálogo.** Agrega a `maprofes` las profesiones de QA que faltan (producción tiene 3; QA 36). Sin esto la profesión obligatoria solo ofrece Administrador, Contador e Ingeniero, y ningún menor de edad tiene opción válida (ESTUDIANTE es la 14). |

Exportar la definición vigente de los SP que se van a modificar (solo lectura), un archivo por SP:

```bash
for sp in sp_create_maclient_nexus sp_pre_emision_automovil_rcv_nexus sp_emision_automovil_rcv_nexus \
          sp_pre_emision_personas_general_nexus sp_emision_personas_general_nexus; do
  sqlcmd -S <servidor> -d <base> -U <usuario> -C -y 0 \
    -Q "SET NOCOUNT ON; SELECT OBJECT_DEFINITION(OBJECT_ID('dbo.$sp'))" -o "prod_$sp.sql"
done
```

`-y 0` evita que sqlcmd corte el texto (el SP de emisión de personas pasa de 60 000 caracteres).

## Fase 2 · con las definiciones de producción

Con esos 5 archivos se arman los scripts 04 → 08, aplicando sobre cada versión de producción
solo los cambios marcados en QA (`[ocupacion 29-oct-2026]` y `[personas-profesion 30-oct-2026]`):

| Orden | SP | Cambio |
|---|---|---|
| 04 | `sp_create_maclient_nexus` | `@cocupacion`, `@bocupacion_separada`: cada dato en su columna de `maclient_atr`. |
| 05 | `sp_emision_automovil_rcv_nexus` | Ocupación de tomador y titular hacia `sp_create_maclient_nexus`. |
| 06 | `sp_pre_emision_automovil_rcv_nexus` | Ocupación de tomador y titular; DDS acepta ocupación. |
| 07 | `sp_pre_emision_personas_general_nexus` | Profesión, ocupación y actividad de tomador, titular y asegurados (requiere 02). |
| 08 | `sp_emision_personas_general_nexus` | Los pasa a `sp_create_maclient_nexus` (requiere 02 y 04). |

Cada script sale con su respaldo (la definición exportada) para volver atrás.

## Orden del pase

1. BD: fase 1 (00 → 03) y fase 2 (04 → 08).
2. server-api-sys (`main`) y luego las variables `NEST_RCV_SEND_OCUPACION=1` y
   `NEST_PERSONAS_SEND_PROFESION=1`; reiniciar el proceso.
3. Formulario-modulo y Emision-Plan-modulo (`main`), en el mismo pase.

Mientras falte un paso la emisión sigue igual que hoy: los parámetros nuevos son opcionales y
nest-api no los envía sin las variables.

## Verificación después del pase

Emitir un RCV y un funerario de prueba y correr, con cada número de póliza, la consulta de
verificación de `rcv-profesion-ocupacion/README.md` y `personas-profesion-ocupacion/README.md`.
Está bien si `xprofesion` y `xocupacion` coinciden con lo elegido y `cprofesion` no es 0.

## Volver atrás

Apagar las dos variables en nest-api y aplicar los respaldos de la fase 2. Las columnas de la
fase 1 y el SP `sp_get_profesiones_nexus` pueden quedarse: nadie más los usa.
