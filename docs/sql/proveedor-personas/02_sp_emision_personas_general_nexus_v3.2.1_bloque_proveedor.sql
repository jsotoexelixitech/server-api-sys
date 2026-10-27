-- =============================================================================
-- 2 de 3 — sp_emision_personas_general_nexus — versión 3.2.1 (v3.2 vigente + proveedor) · 27-oct-2026
--
-- Qué cambia: SOLO se agrega una llamada a sp_registrar_proveedor_poliza_nexus (archivo 01)
-- para registrar en ADPROVEEDOR los proveedores del plan al emitir. Ninguna otra línea del SP
-- cambia. Va dentro de la misma transacción: si el registro falla, la emisión hace rollback.
--
-- Por qué es un bloque y no el SP completo: el SP que corre hoy en Sis2000 QA (v3.2 con
-- ctitular, modificado el 21-oct-2026 16:45, 67.088 caracteres) no coincide al 100 % con
-- nuestros archivos. Para no pisar ningún ajuste hecho en QA, el bloque se inserta sobre el
-- SP actual.
--
-- Requiere: 01_sp_registrar_proveedor_poliza_nexus_v1.0.sql aplicado antes.
-- Ambiente: Sis2000_QA primero. En producción, el mismo procedimiento sobre el SP de producción.
-- =============================================================================
--
-- PASOS
-- 1. Respaldo: en SSMS, Sis2000_QA > Programmability > Stored Procedures >
--    dbo.sp_emision_personas_general_nexus > clic derecho > Script Stored Procedure as >
--    ALTER To > File... (guardar la versión actual por si hay que restaurarla).
-- 2. Clic derecho sobre el mismo SP > Modify (abre el ALTER con el SP actual).
-- 3. Ubicar, cerca del final y antes del COMMIT TRANSACTION, estas líneas:
--
--            EXEC sp_genera_coberturas_siniestro_personas_nexus @cpoliza, @fano, @fmes
--        END
--
--        SELECT cpoliza, cnpoliza, cnrecibo, cproces, qcuotas, fanopol, fmespol FROM adrecibos WHERE cpoliza = @cpoliza and qcuotas = 1
--
-- 4. Pegar el BLOQUE de abajo entre el END y el SELECT cpoliza..., sin tocar nada más.
-- 5. Ejecutar (Execute) y correr la VERIFICACIÓN del final.
--
-- -----------------------------------------------------------------------------
-- BLOQUE A INSERTAR (copiar desde la línea [proveedor ...] hasta OUTPUT;)
-- -----------------------------------------------------------------------------

        -- [proveedor 27-oct-2026] Proveedores del plan (MAPLPROV_PER) -> ADPROVEEDOR, automático.
        -- Misma transacción: si falla, la emisión completa hace rollback.
        DECLARE @qproveedores INT = 0;
        EXEC sp_registrar_proveedor_poliza_nexus
            @cpoliza      = @cpoliza,
            @fanopol      = @fano,
            @fmespol      = @fmes,
            @cramo        = @cramo,
            @cplan        = @cplan,
            @fdesde       = @fdesde,
            @fhasta       = @fhasta,
            @cusuario     = @cusuario,
            @ifuente      = @ifuente,
            @ccerti       = 0,
            @qregistrados = @qproveedores OUTPUT;

-- -----------------------------------------------------------------------------
-- VERIFICACIÓN (después de ejecutar el ALTER)
-- Esperado: 2 filas; en sp_emision_personas_general_nexus tiene_ctitular = sí,
-- tiene_proveedor = sí y largo ≈ 67.700 (67.088 + el bloque).
-- -----------------------------------------------------------------------------
/*
SELECT o.name, o.modify_date, LEN(m.definition) AS largo,
  CASE WHEN m.definition LIKE '%ccerti, ctitular, cproces%'           THEN 'sí' ELSE 'no' END AS tiene_ctitular,
  CASE WHEN m.definition LIKE '%sp_registrar_proveedor_poliza_nexus%' THEN 'sí' ELSE 'no' END AS tiene_proveedor
FROM Sis2000_QA.sys.sql_modules m
JOIN Sis2000_QA.sys.objects o ON o.object_id = m.object_id
WHERE o.name IN ('sp_emision_personas_general_nexus', 'sp_registrar_proveedor_poliza_nexus');
*/
