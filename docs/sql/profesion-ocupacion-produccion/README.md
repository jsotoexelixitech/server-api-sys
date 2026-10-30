# Producción: profesión, ocupación y actividad económica (RCV y personas)

**Para:** La Mundial (DBA) · **Ambiente:** Sis2000 **PRODUCCIÓN** · **Fecha:** 30-oct-2026

Probado en QA el 30-oct-2026: RCV 18-1-0130480959 y funerario 49-1-1100016154 guardan profesión y
ocupación de cada persona en su columna de `maclient_atr`. Detalle del cambio:
`rcv-profesion-ocupacion/README.md` y `personas-profesion-ocupacion/README.md`.

## Cómo se armaron

Cada SP parte de su **definición de producción exportada el 30-oct-2026** (copia en `respaldo/`), no
de la de QA. Sobre ella se aplicaron solo los bloques marcados `[ocupacion 29-oct-2026]` y
`[personas-profesion 30-oct-2026]`, y se verificó con un diff que el cambio es idéntico línea por
línea al que funciona en QA. Los 7 scripts pasan `SET PARSEONLY ON`.

Por qué importa: el `sp_emision_personas_general_nexus` de QA llama a
`sp_registrar_proveedor_poliza_nexus` (proveedores del plan, otro proyecto). Ese SP no existe en
producción: con la versión de QA fallarían todas las emisiones de personas. Esta versión no lo trae.

## Estado de producción al 30-oct-2026 (`00_verificar_produccion.sql`)

- Ya existen: parámetros de país (`@cpais_*`), de debida diligencia (`@itipo_diligencia`,
  `@cprofesion_tomador`, `@cactividad_*`) y la v3 de personas (recargo/descuento por asegurado).
- `sp_create_maclient_nexus` ya tiene el parche de la incidencia de profesiones del 29-oct.
- `maprofes` ya tiene las 36 profesiones (incluida ESTUDIANTE). No hace falta cargar el catálogo.
- No queda ningún cliente con un código de ocupación grabado en `cprofesion`: la corrección de datos
  de la incidencia ya se corrió. No hace falta repetirla.
- No existen todavía: `sp_get_profesiones_nexus` ni las columnas de profesión en las tablas de personas.

## Qué aplicar, en orden

| Orden | Archivo | Qué hace |
|---|---|---|
| 00 | `00_verificar_produccion.sql` | **Solo lectura.** Volver a correrlo el día del pase: si algún SP tiene `modify_date` posterior al 30-oct-2026, avisar antes de seguir (hay que rearmar ese script). |
| 01 | `01_sp_get_profesiones_nexus.sql` | SP nuevo: catálogo de profesiones (`maprofes`). |
| 02 | `02_alter_tmemision_personas_general.sql` | Columnas opcionales (NULL) en `TMEMISION_PERSONAS_GENERAL` y `_ASEG`. Los INSERT actuales no cambian. |
| 03 | `03_sp_create_maclient_nexus.sql` | `@cocupacion`, `@bocupacion_separada`: cada dato en su columna de `maclient_atr`. |
| 04 | `04_sp_emision_automovil_rcv_nexus.sql` | Ocupación de tomador y titular hacia `sp_create_maclient_nexus` (requiere 03). |
| 05 | `05_sp_pre_emision_automovil_rcv_nexus.sql` | Ocupación de tomador y titular; la diligencia simplificada acepta la ocupación (requiere 04). |
| 06 | `06_sp_pre_emision_personas_general_nexus.sql` | Profesión, ocupación y actividad de tomador, titular y asegurados (requiere 02). |
| 07 | `07_sp_emision_personas_general_nexus.sql` | Los pasa a `sp_create_maclient_nexus` (requiere 02 y 03). |

Aplicar con `sqlcmd -I -b -f 65001` (UTF-8; los comentarios llevan acentos).

## Orden del pase

1. BD: 00 → 07.
2. server-api-sys (`main`) y luego las variables `NEST_RCV_SEND_OCUPACION=1` y
   `NEST_PERSONAS_SEND_PROFESION=1`; reiniciar el proceso.
3. Formulario-modulo y Emision-Plan-modulo (`main`), al final: piden la profesión como obligatoria.

Mientras falte un paso la emisión sigue igual que hoy: los parámetros nuevos son opcionales y
nest-api no los envía sin las variables.

## Verificación después del pase

Emitir un RCV y un funerario de prueba y correr, con cada número de póliza, la consulta de
verificación de `rcv-profesion-ocupacion/README.md` y `personas-profesion-ocupacion/README.md`.
Está bien si `xprofesion` y `xocupacion` coinciden con lo elegido y `cprofesion` no es 0.

## Volver atrás

Apagar las dos variables en nest-api y aplicar los archivos de `respaldo/` (definiciones de
producción del 30-oct-2026) en orden inverso: 07, 06, 05, 04, 03. Las columnas de 02 y el SP de 01
pueden quedarse: nadie más los usa.
