# Emisión colectiva en Nexus

Estos scripts crean las copias `_nexus` de los SP colectivos que hizo Hamilton Leon. Los SP originales no cambian.

| Script | SP | Base |
|---|---|---|
| `01_sp_emision_personas_colectivo_nexus.sql` | `sp_emision_personas_colectivo_nexus` | `sp_emision_Personas_General_Colectivo`, `.80` 11-nov-2026 13:56 |
| `02_sp_pre_emision_personas_colectivo_nexus.sql` | `sp_pre_emision_personas_colectivo_nexus` | `sp_pre_emision_Personas_General_Colectivo`, `.80` 11-nov-2026 13:56 |

Hay que aplicarlos en este orden: primero 01 y después 02, porque la pre-emisión llama a la emisión. Las definiciones originales están en `respaldo/`: `80_2026-11-11_*` es la base actual (incluye los arreglos de Hamilton de ese día: titulares y cargas en dos inserciones por COT-2026-152, contrato de reaseguro en `adpolcob`, `USD` a `$`); `*.QA-2026-11-11.sql` es la versión anterior de `.67`.

## Flujo

La empresa es nueva: la emisión crea su póliza colectiva (`adpoliza` y `pcpoliza`). La estructura técnica sale de una **plantilla modelo por producto**, que define Técnica. El precio sale del **cotizador**.

## Cambios respecto al original

1. **Plantilla modelo explícita.** El SP recibe `@cpoliza_plantilla` (`pcplanes.cpoliza`) y `@cnpoliza_plantilla` (`adpoliza.cnpoliza` de esa misma póliza), por ejemplo `328` y `C-8-328`. Los dos son obligatorios y el cotizador los guarda por producto. El original elegía la plantilla solo por `cplan` con `TOP 1` por `fdesde`; en QA, el plan `001` del ramo 6 está en 241 plantillas vigentes de 87 pólizas, así que copiaba la de cualquier empresa.
2. **Estructura copiada.** De la plantilla se copian `pcplanes`, `pccoberturas`, `pctarifas` y, a diferencia del original, también `pcasegurados` (los rangos de edad).
3. **Prima del cotizador.** La prima anual llega en `@mprimaext`, en la moneda de la póliza, y es obligatoria. Se divide entre las cuotas, y cada cuota se reparte entre las coberturas en proporción a su suma asegurada en la plantilla (`msumaext`). Si ninguna cobertura tiene suma, se reparte en partes iguales. El último recibo y la última cobertura absorben el redondeo, así que el total emitido es igual al cotizado; está probado con 12, 4 y 1 cuota. El cálculo original siempre daba prima 0, por tres motivos:
   - En QA, las 286 plantillas vigentes tienen `pctarifas.mprimaext` en 0.
   - El JOIN no admitía `csexo = 'A'` (ambos sexos).
   - Comparaba `ctarifa` `'2   '` con `'0002'`.
4. **Edades.** La validación ahora acepta `csexo = 'A'`. En QA, 549 de las 551 filas de `pcasegurados` usan `'A'`, así que el original rechazaba casi todas las emisiones.
5. **Ramo.** Sale de la plantilla. Si el cliente envía un ramo distinto, el SP responde con un error.
6. **Tasa.** Sale de `mamonedas`, no del cliente. `BS` vale 1. Si la moneda no tiene tasa, la emisión se detiene; en QA, `EUR` tiene la tasa en NULL.
7. **Numeración.** Usa `sp_contador_nexus` en lugar de `spContador_v1`. El formato es `C-<ramo>-<últimos 5 dígitos de cpoliza>`, por ejemplo `C-8-33119`. Esos 5 dígitos se repiten cada 100.000 pólizas. Si el número ya existe en `adpoliza` o en `TMEMISION_PERSONAS_GENERAL`, el SP pide otro, con un máximo de 20 intentos. Esta serie convive con la del escritorio, que usa un número propio, por ejemplo `C-8-328`.
8. **Errores con código.** Los mensajes empiezan con el código; la API lo devuelve como `code` con estado 400.

| Código | Cuándo |
|---|---|
| `COLECTIVO_PLANTILLA_REQUERIDA` | Falta `cpoliza_plantilla` o `cnpoliza_plantilla` |
| `COLECTIVO_PLANTILLA_NO_EXISTE` | El `cnpoliza` no corresponde a ese `cpoliza` |
| `COLECTIVO_PLAN_NO_VIGENTE` | La plantilla no tiene ese plan vigente |
| `COLECTIVO_PLANTILLA_SIN_COBERTURAS` | La plantilla no tiene tarifas para ese plan |
| `COLECTIVO_RAMO_NO_COINCIDE` | El ramo enviado no es el de la plantilla |
| `COLECTIVO_RAMO_SIN_CONFIGURAR` | El ramo no tiene `cramoint` en `maramos` |
| `COLECTIVO_FECHAS_REQUERIDAS` | Falta `femision`, `fdesde` o `fhasta` |
| `COLECTIVO_MONEDA_REQUERIDA` | Falta `cmoneda` |
| `COLECTIVO_PRIMA_REQUERIDA` | Falta la prima cotizada o no es mayor que cero |
| `COLECTIVO_TASA_NO_DISPONIBLE` | La moneda no tiene tasa en `mamonedas` |
| `COLECTIVO_TITULARES_REQUERIDOS` | Faltan los titulares o el titular principal |
| `COLECTIVO_EDAD_FUERA_DE_RANGO` | Hay asegurados fuera de `pcasegurados` |
| `COLECTIVO_SIN_NUMERO_LIBRE` | No hubo número libre en 20 intentos |
| `COLECTIVO_SOLICITUD_NO_EXISTE` | No existe el `@id` de `TMEMISION_PERSONAS_GENERAL` |

## Dependencias `_nexus`

Los SP colectivos solo llaman a procedimientos `_nexus`. Todos existen en `.80`; en producción hay que confirmar que estén antes de aplicar estos scripts.

| Antes (original) | Ahora | Diferencia |
|---|---|---|
| `spContador_v1` | `sp_contador_nexus` | Guarda el contador; `spContador_v1` entrega `qcontador + 1` sin guardarlo |
| `spCreateMaclient` | `sp_create_maclient_nexus` | No tiene `@salida`; se llama con parámetros con nombre y recibe `@cprog`, `@npeso` y `@nestatura` |
| `spGeneraAdpolrea` | `sp_genera_adpolrea_nexus` | No pone `fcobro` ni `fpago_aseg` en un recibo pendiente; necesita que esas columnas de `adpolrea` acepten NULL |
| `spGeneraCoberturasSiniestroPersonas` | `sp_genera_coberturas_siniestro_personas_nexus` | Solo llena `tetitcer` |

Como la versión `_nexus` ya no llena `pepoltar_ind` ni `pepolcob_ind` (las coberturas por asegurado que usa Siniestros), la emisión colectiva los llena en cada recibo. Cada monto de `adpoltar` se reparte en partes iguales entre los asegurados de la póliza (`peasegurados`), y el último absorbe el redondeo. La suma asegurada de cada asegurado es la de la cobertura en la plantilla (`msumaext`); si la cobertura no trae suma, se usa la de la solicitud. El original copiaba el monto completo de cada cobertura a cada asegurado, así que con N asegurados la suma de esas filas era N veces la prima.

No se llama a `sp_registrar_proveedor_poliza_nexus`, que sí usa la emisión individual. Los planes de `MAPLPROV_PER` son de productos individuales; falta confirmar si aplican a los colectivos.

## Lo que no cambia

- `pctarifas` de la póliza nueva queda como en la plantilla, sin montos, igual que en el escritorio. El precio real queda en `adpoltar`, `adpolcob` y `adrecibos`.
- El recibo se sigue generando por la póliza completa, no por titular; el original ya lo marcaba como pendiente de negocio.

## Estado

- Aplicados en Sis2000_QA (`.80`) el 11-nov-2026 a las 14:51 (01) y 14:52 (02). Probados con una emisión completa y ROLLBACK: 2 titulares y 2 cargas, prima 1.200,50 mensual; los 12 recibos y las coberturas por asegurado suman la prima exacta. No están en producción.
- Técnica tiene que definir la plantilla modelo de cada producto del cotizador antes de la primera emisión.
- Falta una emisión real por la API.
