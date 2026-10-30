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

- **Fase 1:** scripts listos. `03` parte de una versión de producción conocida (29-oct) y solo se
  aplica si la exportación confirma que producción no cambió desde entonces.
- **Fase 2:** los SP de emisión, que se arman sobre la exportación.

## Fase 1 · scripts listos

| Orden | Archivo | Qué hace |
|---|---|---|
| 00 | `00_verificar_produccion.sql` | **Solo lectura.** Versiones, parámetros, columnas y catálogos. Enviar el resultado. |
| 01 | `01_sp_get_profesiones_nexus.sql` | SP nuevo: catálogo de profesiones (`maprofes`). No existe en producción. |
| 02 | `02_alter_tmemision_personas_general.sql` | Columnas opcionales (NULL) en `TMEMISION_PERSONAS_GENERAL` y `_ASEG`. Los INSERT actuales no cambian. |
| 03 | `03_sp_create_maclient_nexus.sql` | Cada dato en su columna de `maclient_atr` (`@cocupacion`, `@bocupacion_separada`). Incluye el parche de la incidencia de profesiones del 29-oct (la ocupación va a `cocupacion`; `cprog` = `NEXUS`). Base: la versión de producción del 29-oct (`respaldo/`). **Antes de aplicar, comparar con la definición exportada:** fuera de los bloques marcados debe ser idéntica. |
| 04 | `04_corregir_maclient_atr_ocupacion.sql` | **Datos.** Mueve a `cocupacion` los códigos de ocupación que Nexus grabó en `cprofesion` desde el 20-ago (96 clientes en producción al 29-oct). Respaldo en `bk_maclient_atr_profesion_20261029`. Correr primero con `@aplicar = 0`; si cuadra, con `@aplicar = 1`. **Después de 03 y antes de 05.** |
| 05 | `05_maprofes_catalogo_OPCIONAL.sql` | **Requiere aprobación del dueño del catálogo.** Agrega a `maprofes` las profesiones de QA que faltan (producción tiene 3; QA 36). Sin esto la profesión obligatoria solo ofrece Administrador, Contador e Ingeniero, y ningún menor de edad tiene opción válida (ESTUDIANTE es la 14). |

### Por qué este orden

- **03 antes que 04:** sin 03, Nexus vuelve a grabar la ocupación en `cprofesion`. Además, 03 marca
  `cprog = 'NEXUS'`, y 04 solo toca filas con `cprog` NULL: así nunca mueve una profesión real
  grabada por la versión nueva (los códigos se repiten entre catálogos: 29 es CARPINTERO en
  `maprofes` y también existe en `maocupac`).
- **04 antes que 05:** con el catálogo completo, un código de ocupación mal grabado (p. ej. 29) pasa a
  parecer una profesión válida y la verificación final de 04 ya no lo detecta.

Exportar la definición vigente de los SP (solo lectura), un archivo por SP:

```bash
for sp in sp_create_maclient_nexus sp_pre_emision_automovil_rcv_nexus sp_emision_automovil_rcv_nexus \
          sp_pre_emision_personas_general_nexus sp_emision_personas_general_nexus; do
  sqlcmd -S <servidor> -d <base> -U <usuario> -C -y 0 \
    -Q "SET NOCOUNT ON; SELECT OBJECT_DEFINITION(OBJECT_ID('dbo.$sp'))" -o "prod_$sp.sql"
done
```

`-y 0` evita que sqlcmd corte el texto (el SP de emisión de personas pasa de 60 000 caracteres).

## Fase 2 · con las definiciones de producción

Con esos archivos se arman los scripts 06 → 09, aplicando sobre cada versión de producción solo los
cambios marcados en QA (`[ocupacion 29-oct-2026]` y `[personas-profesion 30-oct-2026]`):

| Orden | SP | Cambio |
|---|---|---|
| 06 | `sp_emision_automovil_rcv_nexus` | Ocupación de tomador y titular hacia `sp_create_maclient_nexus` (requiere 03). |
| 07 | `sp_pre_emision_automovil_rcv_nexus` | Ocupación de tomador y titular; la diligencia simplificada acepta la ocupación. |
| 08 | `sp_pre_emision_personas_general_nexus` | Profesión, ocupación y actividad de tomador, titular y asegurados (requiere 02). |
| 09 | `sp_emision_personas_general_nexus` | Los pasa a `sp_create_maclient_nexus` (requiere 02 y 03). |

Cada script sale con su respaldo (la definición exportada) para volver atrás. 06 y 07 dependen de los
parámetros de diligencia (`@itipo_diligencia`, `@cprofesion_tomador`) y, si existen, de los de país
(`rcv-cpais-extranjero`); `00` dice cuáles hay. Si falta el país, 06 y 07 se arman sin esa parte.

## Orden del pase

1. BD: fase 1 (00 → 05) y fase 2 (06 → 09).
2. server-api-sys (`main`) y luego las variables `NEST_RCV_SEND_OCUPACION=1` y
   `NEST_PERSONAS_SEND_PROFESION=1`; reiniciar el proceso.
3. Formulario-modulo y Emision-Plan-modulo (`main`), en el mismo pase, al final: piden la profesión
   como obligatoria.

Mientras falte un paso la emisión sigue igual que hoy: los parámetros nuevos son opcionales y
nest-api no los envía sin las variables.

## Verificación después del pase

Emitir un RCV y un funerario de prueba y correr, con cada número de póliza, la consulta de
verificación de `rcv-profesion-ocupacion/README.md` y `personas-profesion-ocupacion/README.md`.
Está bien si `xprofesion` y `xocupacion` coinciden con lo elegido y `cprofesion` no es 0.

## Volver atrás

Apagar las dos variables en nest-api y aplicar los respaldos (03 y fase 2). Para 04, la reversa está al final del script. Las columnas de la
fase 1 y el SP `sp_get_profesiones_nexus` pueden quedarse: nadie más los usa.
