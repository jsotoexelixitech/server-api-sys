# sp_contador_nexus: número de póliza único

## Qué cambia

`01_sp_contador_nexus.sql` agrega una validación al armar `@cnpoliza`. Si el número ya existe en `adpoliza`, `TMEMISION_PERSONAS_GENERAL` o `TMEMISION_CONDOMINIO_NEXUS`, salta al siguiente número libre y deja el contador en el número entregado. Tras 1000 intentos sin encontrar un número libre, lanza el error `99150 CONTADOR_SIN_NUMERO_LIBRE`.

`adpoliza.cnpoliza` tiene índice (`adpolizaI2`), así que cada validación busca por índice. Las dos tablas de pre-emisión tienen 2.437 y 226 filas en QA.

Base: definición de Sis2000_QA modificada el 2026-10-27 15:48:37. El respaldo está en `respaldo/`.

## Por qué no basta

En QA hubo 3 duplicados de Personas después del cambio del 27/10:

| Número | Primera emisión (Nexus) | Segunda emisión |
|---|---|---|
| `5-1-1000000922` | 29/10 11:39 | 29/10 11:47 |
| `7-1-1000002487` | 29/10 11:06 | 29/10 11:13 |
| `7-1-1000002492` | 03/11 10:57 | 03/11 11:48 |

En los tres casos, Nexus emitió primero y otro flujo repitió el número después. Ese otro flujo:

- graba `cprog = 'TEMISION_PER_GE'` en mayúsculas;
- genera un `cpoliza` de 15 dígitos, en lugar de 19;
- registra como `cusuario` un número de cédula;
- deja en NULL el `cprog` de sus recibos.

Ningún SP de QA ni ninguno de nuestros repos escribe ese `cprog`. Probablemente es la aplicación Sis2000 de escritorio.

Ese flujo toma el valor del contador sin avanzarlo. Lo hace minutos antes de grabar, porque en el caso de `5-1-1000000922` Nexus ya había usado `5-1-1000000924`. Por eso, la validación de `sp_contador_nexus` protege a Nexus, pero no impide que el otro flujo repita un número. Para eso hay que corregir ese flujo o agregar una restricción en `adpoliza`.

## Alcance por llamador

| Llamador | Número que usa | Efecto del cambio |
|---|---|---|
| `sp_pre_emision_personas_general_nexus` | `@cnpoliza` devuelto | Queda protegido |
| `sp_pre_emision_condominio_nexus` | `@cnpoliza` devuelto | Queda protegido |
| `sp_pre_emision_automovil_rcv_nexus` | Lo arma con `SELECT qcontador FROM macontadores` después de la llamada | Sin efecto; ya valida y lanza `99001` |
| `sp_flota_crear_poliza_nexus` | Igual que Auto RCV | Sin efecto; ya valida y lanza error |
| `sp_emision_personas_general_nexus` (por cuota) | Descarta `@cnpoliza` | Sin efecto |

Auto RCV y Flota leen el contador fuera de la transacción del contador. Si dos emisiones coinciden, ambas pueden leer el mismo valor; la segunda falla con "Nro. de Póliza Rel ya existente", en lugar de duplicarse.

La autocorrección de `POL_VEH` no funciona: compara `RIGHT(cnpoliza, 6)` con un contador de 9 dígitos (130.481.070).

## Prueba en QA

La prueba se hizo con `BEGIN TRAN … ROLLBACK`, ejecutando el cuerpo del SP como lote:

1. Con `POLIZA` en 100016194, el número siguiente, `47-1-1100016195`, ya existía. El SP entregó `47-1-1100016196` y dejó el contador en 100016196.
2. En la llamada siguiente, sin choque, entregó `47-1-1100016197`.
3. Personas, ramo 5, `POL_ACC`, entregó `5-1-1000000939` sin cambios de comportamiento.
4. Después del `ROLLBACK`, los contadores quedaron como estaban.

El script compila con `NOEXEC`. No está aplicado en QA.

## cproces repetido (13-nov-2026)

Emisión de Condominio en QA (.80) falló con `Violation of PRIMARY KEY constraint 'sopoliza_pk' ... (202600309795)`.
Ese `cproces` lo había grabado 3 minutos antes la emisión de Auto de Sis2000 escritorio (`sopoliza.cprog = 'Emi_Auto'`,
`cpoliza = 0`, ramo 18), que no deja el número en `macontadores`. La autocuración existente solo mira `adpoliza` de los
ramos 4, 9, 18 y 27, y esas solicitudes viven solo en `sopoliza`.

Cambio: tras armar `@cproces`, si ya existe en `sopoliza` (PK por `cproces`) salta al siguiente libre (máx. 1000,
`THROW 99151`) y deja el contador ahí. Probado en .80 con ROLLBACK forzando el contador a 309794: entregó 309797.

Límite: no evita la carrera si el escritorio reservó un número y aún no lo grabó; eso solo se corrige en Sis2000.
Respaldo de la definición desplegada en .80: `respaldo/sp_contador_nexus.QA80-2026-11-13.sql`.
