# Proveedores del plan en la emisión de personas (ADPROVEEDOR)

**Para:** La Mundial (DBA) · **Ambiente:** Sis2000 **QA** primero · **Fecha:** 27-oct-2026

## Qué resuelve

Criterio del DBA: al asignar el plan a la póliza se consulta en `MAPLPROV_PER` el proveedor
correspondiente y, al generar la póliza, se registra en `ADPROVEEDOR` con `fdesde`, `fhasta` e
`fingreso` para el histórico. El proveedor **no se elige a mano** en la emisión: se asigna
automáticamente según el plan.

Aplica a **todas** las emisiones de personas de Nexus (Funerario, Combinado, AP, Vida, Viajero,
MarketPlace, tarjeta y autopago): todas usan `sp_emision_personas_general_nexus`.

## Archivos y versiones (ejecutar en orden)

| Orden | Archivo | Versión | Qué hace |
|---|---|---|---|
| 1 | `01_sp_registrar_proveedor_poliza_nexus_v1.0.sql` | **1.0** (nuevo) | Crea `sp_registrar_proveedor_poliza_nexus`: inserta en `ADPROVEEDOR` una fila por proveedor vigente del plan (`MAPLPROV_PER`), con la vigencia de la póliza, `fingreso = GETDATE()`, `mcostoext` del proveedor y `mcosto = mcostoext × tasa`. Códigos como Sis2000 (`u_version '!'`, `ccerti 0`, `ccategoria 1`). Idempotente. Es un objeto nuevo: no reemplaza nada. |
| 2 | `02_sp_emision_personas_general_nexus_v3.2.1_COMPLETO.sql` | **3.2.1** (= 3.2 vigente + proveedor) | SP de emisión **completo** (`CREATE OR ALTER`), armado sobre el que corre hoy en QA (v3.2 con ctitular, exportado el 28-oct). Único cambio: la llamada a `sp_registrar_proveedor_poliza_nexus` después de `sp_genera_coberturas_siniestro_personas_nexus`. Mismo nombre y parámetros: las APIs no cambian. Se ejecuta completo. |
| 3 | `03_carga_proveedores_polizas_emitidas_v1.0.sql` | **1.0** (carga única) | Asocia proveedores a las pólizas de personas **ya emitidas** por Nexus (`ADPOLIZA.cprog = 'TEmision_Per_Ge'`), vigentes y sin proveedor. Paso A: diagnóstico (solo lectura). Paso B: carga en transacción, se confirma con `COMMIT` tras revisar. |

> Se descartó la "v3.4" anterior (armada sobre la v3.3 de canal y subcanal, que no está en QA):
> se reemplaza por el archivo 02, armado sobre el SP vigente en QA para no introducir otros cambios.

**Respaldo:** `respaldo/sp_emision_personas_general_nexus_QA_v3.2_antes_proveedor.sql` es el SP de QA
tal como estaba antes del 02 (exportado de la BD el 28-oct-2026). Para volver atrás, ejecutarlo
cambiando `CREATE` por `CREATE OR ALTER`.

**Estado QA (28-oct-2026):** 01 y 02 aplicados por La Mundial. Prueba OK: póliza `49-1-1100016139` (MAP2)
registró el proveedor `311624457` con la vigencia de la póliza, `mcostoext 11.05`, `mcosto 9813.71` (× 888.1183),
`cprog NEXUS_PROV V1.0`. Pendiente: el 03.

Verificación tras ejecutar el 02 (esperado: modify_date de hoy, `tiene_ctitular = sí`, `tiene_proveedor = sí`):

```sql
SELECT o.name, o.modify_date, LEN(m.definition) AS largo,
  CASE WHEN m.definition LIKE '%ccerti, ctitular, cproces%'           THEN 'sí' ELSE 'no' END AS tiene_ctitular,
  CASE WHEN m.definition LIKE '%sp_registrar_proveedor_poliza_nexus%' THEN 'sí' ELSE 'no' END AS tiene_proveedor
FROM Sis2000_QA.sys.sql_modules m
JOIN Sis2000_QA.sys.objects o ON o.object_id = m.object_id
WHERE o.name IN ('sp_emision_personas_general_nexus', 'sp_registrar_proveedor_poliza_nexus');
```

## Garantías

- No se crea ni modifica ninguna tabla.
- Si el plan no tiene proveedores en `MAPLPROV_PER`, no se inserta nada y la emisión queda igual que hoy.
- Si el registro falla, la emisión completa hace rollback (no quedan pólizas sin proveedor a medias).
- `cprog` identifica el origen de las filas: `NEXUS_PROV V1.0` (emisión) y `NEXUS_PROV CARGA` (archivo 03).

## Verificación en QA (tras una emisión de personas de prueba)

```sql
SELECT cpoliza, cramo, cplan, cci_rif, cclave_num, fdesde, fhasta, mcosto, mcostoext, cmoneda, ptasamon, cprog, fingreso, cusuario
FROM Sis2000_QA.dbo.adproveedor
WHERE cprog IN ('NEXUS_PROV V1.0', 'NEXUS_PROV CARGA')
ORDER BY fingreso DESC;
```

Para la prueba se necesita un plan con proveedor configurado: hoy en QA solo `49/MAP2`.

## Pendiente de definir con La Mundial

- **Configuración:** los planes que emite Nexus (`45/FUNESP`, `48/COMB`, `49/MAP1`, `47/1`) no tienen
  proveedores en `MAPLPROV_PER`; sin esa configuración no se registra nada.
- `cusuario` por defecto cuando la emisión no trae usuario (hoy 1422).
- El archivo 03 toma pólizas con `istatpol = 'V'`; confirmar si hay otros estados vigentes.
- Si un plan cambia de proveedor, el histórico se gestiona con `fhasta` en `ADPROVEEDOR` (baja) y una
  nueva fila (alta): queda fuera de este cambio.
