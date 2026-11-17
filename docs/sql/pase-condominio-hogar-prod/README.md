# Pase a producción: Condominio (ramo 16) y Hogar (ramo 38)

Guía para llevar a PROD todo lo de Condominio y Hogar que está probado en QA (Sis2000 `.80` y panel MySQL `.121`).

Los scripts de esta carpeta se generaron leyendo QA el 2026-11-17 y se probaron en `.80` dentro de transacciones revertidas. Reemplazan a los scripts sueltos de `docs/sql/` de estos temas (`condominio-tasas-antiguedad.sql`, `hogar-tasas-rango.sql`, `condominio-reparto-opcional.sql`, `condominio-hogar-descuento-suma.sql`, `sp_emision_condominio_nexus-tasa-aplicada.sql`, `sp_pre_emision_condominio_nexus_portal_apto.sql`, `condominio-carga-cotizador-tecnica.sql`, `contador-cnpoliza-unico/`). **No correr esos sueltos en PROD.** `maplanes_frec-migracion-condominio-hogar.sql` es obsoleto.

Los scripts del panel (P1, P2 y P2R) no están en el repositorio: llevan los PDF de los anexos. Están en la carpeta de pase compartida por Luis.

## Orden

| Paso | Dónde | Qué | Reversa |
|---|---|---|---|
| 1 | Sis2000 PROD | `01_tablas_nexus.sql` | Las tablas nuevas quedan vacías si se revierte 03 |
| 2 | Sis2000 PROD | `02_procedimientos.sql` | `02R_procedimientos_reversa.sql` |
| 3 | Sis2000 PROD | `03_datos_configuracion.sql` con `@aplicar = 0`: revisar el resumen | — |
| 4 | Sis2000 PROD | `03_datos_configuracion.sql` con `@aplicar = 1` | `03R_datos_reversa.sql` |
| 5 | Core | Fusionar el PR de `release/condominio-hogar-prod` a main (despliega solo) | Revertir el merge |
| 6 | git-web-condominio | `.env` de PROD (abajo), luego fusionar el PR #91 `qa → main` (despliega solo) | Revertir el merge |
| 7 | Panel MySQL PROD | `P1_panel_respaldo.sql` | — |
| 8 | Panel MySQL PROD | `P2_panel_configuracion.sql` (después de que los backends arranquen: crean tablas y columnas) | `P2R_panel_reversa.sql` |
| 9 | Prueba | Cotizar y emitir una póliza de Condominio y una de Hogar en PROD | — |

## Qué hace cada script

**01_tablas_nexus.sql.** Crea con la estructura de QA las tablas que no existen en PROD:
- `MATARIFA_ANTIGUEDAD_NEXUS`: tasa global por antigüedad y uso.
- `MATARIFA_RANGO_NEXUS`: rango de tasa de Hogar.
- `MATARIFA_REPARTO_NEXUS`: reparto por cobertura, con opcionales, límite y montos fijos.
- `TMEMISION_CONDOMINIO_COB_NEXUS`: coberturas de la emisión.
- `MATARIFA_DESCUENTO_SUMA_NEXUS`: se crea vacía; sin tramos no cambia ninguna prima.

Si una tabla ya existe, solo agrega las columnas, restricciones CHECK e índices que falten.

**02_procedimientos.sql.** Instala la versión de QA de estos SP:

| SP | Cambio |
|---|---|
| `sp_contador_nexus` | No repite el `cproces` ni el `cnpoliza` (choque con Emi_Auto) |
| `sp_busca_frecuencia_plan_nexus` | Solo devuelve frecuencias vigentes (`iestado = 'V'`); el panel puede deshabilitar una |
| `sp_emision_condominio_nexus` | Tasa aplicada, deducibles, reparto y coberturas de la cotización |
| `sp_pre_emision_condominio_nexus` | Guarda las coberturas en `TMEMISION_CONDOMINIO_COB_NEXUS` |

**Guarda del 02:** el script compara cada SP de PROD con la versión que tenía PROD cuando se restauró la `.80` (02-nov):
- `sp_contador_nexus`, `sp_busca_frecuencia_plan_nexus` y `sp_pre_emision_condominio_nexus` se comparan por hash SHA2.
- `sp_emision_condominio_nexus` se compara por `modify_date` (2026-08-04 12:14).

Si alguno cambió, el script se detiene sin aplicar ninguno (`SET NOEXEC ON`). En ese caso hay que exportar la versión de PROD y fusionarla a mano.

`sp_contador_nexus` y `sp_busca_frecuencia_plan_nexus` también los usan RCV y los demás productos. Ambas versiones son las que corren en QA para todos los productos.

**03_datos_configuracion.sql.** Copia de QA la configuración de los ramos 16 y 38 en 25 tablas:

| Grupo | Tablas |
|---|---|
| Ramo | `maramos`, `raramos`, `insramo`, `maproductos` |
| Coberturas y tarifas | `macoberturas`, `matarifa`, `matarifa_d`, `inscobint`, `instarint` |
| Planes | `maplanes`, `maplanes_frec`, `mausuplan`, `maplancob`, `maplantar` |
| Descuentos y recargos | `madisseg`, `masustac` |
| Comisiones, bonos y gastos | `madetaincentivos`, `maarancel`, `mabonos`, `magastosramo` |
| Siniestros | `macausasin`, `macauscob` |
| Nexus | `MATARIFA_ANTIGUEDAD_NEXUS`, `MATARIFA_RANGO_NEXUS`, `MATARIFA_REPARTO_NEXUS` |

Cómo trabaja:
- Inserta las filas que faltan y actualiza las que difieren. La comparación ignora las columnas de auditoría.
- No borra filas de PROD.
- Antes de cambiar nada copia las filas actuales a `bk_pase_condo_20261117_<tabla>`.
- Con `@aplicar = 0` muestra el resumen por tabla y deshace todo.

**Columnas que no se copian:** `maplanes_frec.itipo` y `mabonos.bexcluye` existen en QA, no en PROD, y no las usa Condominio.

**Valores que esto lleva a PROD (decisión del 17-nov: va toda la configuración de QA):**
- Las tasas de Hogar de QA, que se copiaron de la `.67`.
- El plan 38/2 anulado.
- Las coberturas 49 a 53 del ramo 16.
- La carga del cotizador de Técnica (reparto, límites y deducibles).

## Variables de entorno de PROD (git-web-condominio)

En `condominioOne`, `residenteHogar` y `condominioMundial`, salvo donde se indica:

| Variable | Valor |
|---|---|
| `ACCESO_SOLICITUD_SECRET` y `ACCESO_SERVICIO_KEY` | Propios de PROD, distintos entre sí e iguales en los tres backends |
| `NEXUS_API_URL` | La nexus-api de PROD, en los tres |
| `ACCESO_MODO` | `observar` en el primer despliegue |
| `HOGAR_TOKEN_SECRET` | Igual en `residenteHogar` y `condominioMundial`. Definirla antes del primer correo: cambiarla invalida los enlaces |
| `CALL_CENTER_PHONE` | El número real, en `residenteHogar` y `condominioMundial` |
| `GEMINI_API_KEY` | Clave propia de PROD, en `residenteHogar` y `condominioOne`. La de QA salió en una captura y hay que rotarla |
| `EMISION_PENDIENTE` | `off` lo apaga. Sin la variable, cualquier cliente del portal puede emitir con pago pendiente |

**Base MySQL de PROD:**
- El usuario necesita permiso de `ALTER`.
- `max_allowed_packet` debe ser de 8 MB o más, por los anexos.

## Después del pase

- **Panel:** cargar los correos de Técnica en Notificaciones, porque no se copian.
- **Logs:** revisar `[acceso:observar]` con un pago real antes de pasar a `ACCESO_MODO=bloquear`.
