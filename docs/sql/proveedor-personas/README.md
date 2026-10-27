# Proveedores del plan en la emisión de personas (ADPROVEEDOR)

**Para:** La Mundial (DBA) · **Ambiente:** Sis2000 **QA** primero · **Fecha:** 27-oct-2026

## Qué resuelve

Criterio del DBA: al asignar el plan a la póliza se consulta en `MAPLPROV_PER` el proveedor
correspondiente y, al generar la póliza, se registra en `ADPROVEEDOR` con `fdesde`, `fhasta` e
`fingreso` para el histórico. El proveedor **no se elige a mano** en la emisión: se asigna
automáticamente según el plan.

Hoy las emisiones de personas hechas desde Nexus no dejan filas en `ADPROVEEDOR`
(el flujo anterior de QA hacía un INSERT directo desde la API, con proveedor elegido a mano
y códigos distintos a los de Sis2000; se retira).

Aplica a **todas** las emisiones de personas de Nexus (Funerario, Combinado, AP, Vida, Viajero,
MarketPlace, tarjeta y autopago): todas usan `sp_emision_personas_general_nexus`.

## Qué se aplica (en orden)

| Orden | Archivo | Cambio |
|---|---|---|
| 1 | `1_sp_registrar_proveedor_poliza_nexus.sql` | **Nuevo.** Inserta en `ADPROVEEDOR` una fila por proveedor vigente del plan (`MAPLPROV_PER`), con la vigencia de la póliza, `fingreso = GETDATE()`, `mcostoext` del proveedor y `mcosto = mcostoext × tasa de la póliza`. Mismos códigos que Sis2000 (`u_version '!'`, `ccerti 0`, `ccategoria 1`). Idempotente. |
| 2 | `2_sp_emision_personas_general_nexus_v3_4_proveedor.sql` | v3.3 + una llamada al SP 1 dentro de la misma transacción, después de coberturas y recibos. Marcado `[proveedor 27-oct-2026]`. Cubre las emisiones **nuevas**. |
| 3 | `3_carga_proveedores_polizas_emitidas.sql` | **Carga única** para las pólizas de personas **ya emitidas** por Nexus (`ADPOLIZA.cprog = 'TEmision_Per_Ge'`), vigentes y sin proveedor: paso A de diagnóstico (solo lectura) y paso B de carga en transacción, que se confirma con `COMMIT` tras revisar. Usa los proveedores vigentes hoy en el plan. |

## Garantías

- No se crea ni modifica ninguna tabla.
- Si el plan no tiene proveedores en `MAPLPROV_PER`, no se inserta nada y la emisión queda igual que hoy.
- Si el registro falla, la emisión completa hace rollback (no quedan pólizas sin proveedor a medias).
- `cprog` identifica el origen de las filas: `NEXUS_PROV V1.0` (emisión) y `NEXUS_PROV CARGA` (carga del paso 3).

## Verificación en QA (tras una emisión de personas de prueba)

```sql
-- Filas creadas para la póliza (una por proveedor del plan)
SELECT cpoliza, cramo, cplan, cci_rif, cclave_num, fdesde, fhasta, mcosto, mcostoext, cmoneda, ptasamon, cprog, fingreso, cusuario
FROM Sis2000_QA.dbo.adproveedor
WHERE cprog IN ('NEXUS_PROV V1.0', 'NEXUS_PROV CARGA')
ORDER BY fingreso DESC;

-- Debe coincidir con la configuración del plan
SELECT cramo, cplan, cci_rif, cclave_num, fdesde, fhasta, itiposerv, mcosto, mcostoext, cmoneda
FROM Sis2000_QA.dbo.maplprov_per
WHERE cramo = <ramo> AND cplan = '<plan>';
```

## Pendiente de definir con La Mundial

- **Configuración:** en QA solo `49/MAP2` tiene proveedor en `MAPLPROV_PER`. Los planes que emite Nexus
  (`45/FUNESP`, `48/COMB`, `49/MAP1`, `47/1`) no tienen ninguno: sin esa configuración no se registra nada.
- `cusuario` por defecto cuando la emisión no trae usuario (hoy 1422).
- Códigos de estado: el paso 3 toma pólizas con `istatpol = 'V'`; confirmar si hay otros estados vigentes.
- Si un plan cambia de proveedor, el histórico se gestiona con `fhasta` en `ADPROVEEDOR` (baja) y una
  nueva fila (alta): queda fuera de este cambio.
