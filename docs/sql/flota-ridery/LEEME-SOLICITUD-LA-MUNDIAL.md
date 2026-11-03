# Solicitud a La Mundial: póliza de flota Ridery con certificados y sin recibo

> Exélixi, 3-nov-2026. Propuesta para revisar y crear en Sis2000_QA y, cuando se apruebe, en producción.
> Exélixi no crea ni modifica SP en Sis2000. Los scripts propuestos están en esta misma carpeta:
> `02-PROPUESTA-sp_flota_poliza_y_certificados.sql` (póliza y certificados) y
> `01-PROPUESTA-sp_crear_recibo_certificado_nexus.sql` (recibo por viaje).

## Qué pedimos y por qué

Ridery es una flota de conductores. La prima no se cobra por cuotas: **cada viaje genera un recibo** sobre el
certificado del conductor que lo hizo.

El proceso de flota que existe hoy no sirve para este caso, porque **siempre** crea un recibo por certificado al
cargar el vehículo y después lo repite según la frecuencia (por ejemplo, 12 si es mensual). No tiene una opción
para no crearlo.

Pedimos tres SP para emitir la póliza colectiva y manejar sus certificados **sin generar ningún recibo**. Los
recibos los crea después `sp_crear_recibo_certificado_nexus`, uno por viaje.

## SP solicitados

Los tres devuelven `@pSuccess` (1 = correcto) y `@pErrorMessage`. Cuando una llamada se repite con los mismos
datos (idempotencia), el SP devuelve `@pSuccess = 1` con un mensaje del tipo "ya existía" y no crea nada nuevo.
Cada uno trabaja dentro de su propia transacción: si algo falla, no queda nada a medias.

| SP | Parámetros de entrada | Salidas | Qué hace |
|---|---|---|---|
| `sp_flota_crear_poliza_nexus` | `@cramo`, `@cplan`, `@cid_tomador`, `@cproductor`, `@csucur`, `@cmoneda`, `@fdesde`, `@fhasta`, `@cusuario` | `@pCnpoliza`, `@pCpoliza`, `@pSuccess`, `@pErrorMessage` | Crea la cabecera de la póliza colectiva (`itipopol` C), vigente y sin recibos. La numera igual que la emisión RCV Nexus (`sp_contador_nexus`, POL_VEH). Si se repite con el mismo tomador, plan y vigencia, devuelve la póliza que ya existe. |
| `sp_flota_incluir_certificado_nexus` | `@cnpoliza`, `@xplaca`, `@xsercar`, `@xsermot`, `@cano`, `@cmarca`, `@cmodelo`, `@cversion`, `@xcolor`, `@cid_conductor`, `@xconductor`, `@fdesde`, `@generarRecibo` (= 0), `@cusuario` | `@pCcerti`, `@pSuccess`, `@pErrorMessage` | Agrega un vehículo y su conductor como certificado vigente y crea al conductor en maclient si no existe. Guarda las coberturas del plan para ese certificado sin recibo. El número de certificado se calcula como hoy: el último más uno. Si la misma placa ya está vigente con el mismo conductor, devuelve ese certificado. |
| `sp_flota_excluir_certificado_nexus` | `@cnpoliza`, `@ccerti`, `@fexclusion`, `@cusuario` | `@pSuccess`, `@pErrorMessage` | Excluye el certificado desde la fecha indicada (estado N y fecha de anulación) y deja sus coberturas inactivas. No anula los recibos de viajes ya generados. Rechaza la exclusión si hay recibos con fecha igual o posterior. |
| `sp_crear_recibo_certificado_nexus` (archivo 01) | `@cnpoliza`, `@ccerti`, `@mprima`, `@cmoneda`, `@fdesde`, `@fhasta`, `@creferencia`, `@xobservacion`, `@cusuario` | `@pCnrecibo`, `@pCrecibo`, `@pYaExistia`, `@pSuccess`, `@pErrorMessage` | Crea un recibo pendiente por viaje sobre el certificado y le copia las coberturas del certificado con la prima del viaje. No toca otros recibos ni la póliza. Una misma referencia de viaje nunca crea dos recibos. |

Nuestro sistema (nest-api) ya llama a estos SP con estos nombres y estos parámetros. Mientras no existan,
responde "no disponible".

## Diferencias frente al proceso de flota actual

En los scripts, cada punto donde el proceso actual crearía un recibo está marcado con
`DIFERENCIA FLOTA RIDERY: sin recibo`.

| Proceso actual (carga y aceptación de flota) | Propuesta Ridery |
|---|---|
| Cabecera por la tabla de emisión de flota y su trigger | SP directo que devuelve el número de póliza |
| Vehículo primero en `vhofcert` (pendiente) y después en `vhcerti` | Directo a `vhcerti` como vigente |
| Un `sorecibos` por certificado, luego `adrecibos` | **No se crea recibo** |
| `adBRecibo_Frecuencia_Colectivo` repite el recibo según la frecuencia | No se usa, porque no hay cuotas |
| `spCorrigeCertificadoFlota` y `SP_CalculoAltas` (reparto de la prima y prorrateo) | No se usan: la prima la ponen los viajes |
| Coberturas en `adpolcob` / `adpoltar` atadas al recibo del certificado | Coberturas del certificado en `sopolcob` / `sopoltar`, sin recibo. Cada recibo de viaje las copia a `adpolcob` / `adpoltar` con su número de recibo |
| La frecuencia de la póliza define las cuotas | Frecuencia `E` y cero cuotas (por confirmar) |

## Qué validar en Sis2000_QA cuando los creen

1. Al crear una póliza, queda colectiva y vigente, sin ningún recibo, y el número sigue la serie de autos.
2. Al repetir la creación con los mismos datos, devuelve la misma póliza y no crea otra.
3. Al incluir dos conductores, quedan los certificados 1 y 2 vigentes, sin recibos, y cada uno con las coberturas del plan.
4. Al repetir una inclusión con la misma placa y el mismo conductor, devuelve el mismo certificado.
5. Una misma placa vigente con otro conductor se rechaza.
6. Un recibo de viaje sobre el certificado 1 queda pendiente, con sus coberturas, y no cambia nada del certificado 2 ni de la póliza.
7. Al excluir el certificado 1, sus recibos anteriores siguen intactos y un viaje con fecha posterior se rechaza.
8. Ninguno de estos pasos avanza ni crea cuotas de la póliza.

## Preguntas abiertas

En los scripts aparecen marcadas como `PREGUNTA LM:`.

1. **Plan** de la flota Ridery: RIDERY, RIDER1 o RIDER2. ¿Tiene ya sus coberturas y tarifas cargadas?
2. **Sucursal, productor, canal y gestor** con que debe quedar la póliza. La propuesta usa la sucursal 1 y el productor directo 80080.
3. **Frecuencia y cuotas** de una póliza sin cuotas: ¿frecuencia `E` y cuotas 0 o 1?
4. ¿La póliza necesita además una fila en la tabla de solicitud de póliza (`sopoliza`), como la crea hoy el trigger de flota?
5. El contador de pólizas que usa la emisión Nexus también avanza el de recibos. ¿Aceptan ese salto o prefieren una variante que solo numere la póliza?
6. **Coberturas sin recibo:** `adpolcob` y `adpoltar` exigen número de recibo. ¿Aprueban guardar las coberturas del certificado en `sopolcob` / `sopoltar`? Las alternativas son una tabla propia o un recibo técnico. En ese caso no debe correr el prorrateo de altas sobre esa póliza.
7. **Suma asegurada** por cobertura del plan Ridery: hoy la propuesta la deja en 0. ¿Sale del plan o del cálculo de auto?
8. **Reaseguro:** ¿qué contrato y ramo de reaseguro llevan las coberturas? ¿El recibo por viaje genera cesión?
9. **Conductor:** ¿qué datos mínimos se exigen para crearlo como cliente? ¿El campo de conductor del certificado guarda el nombre o la cédula?
10. **Vehículo:** ¿marca, modelo, versión y año son obligatorios? ¿Qué uso se registra para transporte por aplicación?
11. ¿Una placa vigente con otro conductor se rechaza o se cambia el conductor? ¿Un conductor puede tener más de un vehículo vigente?
12. **Exclusión:** ¿qué código de causa y qué estado usar, N o A?
13. ¿Se lleva un título técnico (`tetitcer`) por certificado o solo el de la póliza?
14. **Recibo por viaje:** tipo de recibo (P o A), tasa del día del viaje o de la emisión, y si es válido un recibo de un solo día. ¿Nace pendiente o cobrado? ¿La comisión es la del ramo o la del productor?
15. **Volumen:** un recibo por viaje puede sumar miles al mes. ¿Lo aceptan en recibos o prefieren agrupar por día o semana por certificado?
