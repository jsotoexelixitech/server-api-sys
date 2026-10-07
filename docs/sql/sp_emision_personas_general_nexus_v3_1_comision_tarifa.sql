-- =============================================================================
-- sp_emision_personas_general_nexus - v3.1: comisión también en la tarifa
-- Fecha: 2026-10-07 · Solicitado por: Graciela Idler (validación póliza 1-1-1000000948)
-- Base: v3 aplicada en Sis2000 QA (2026-10-05).
--
-- Observación de La Mundial: en adpoltar y pepoltar_ind la comisión quedaba en 0
-- (la v3 la ponía solo en la cobertura). Como en el SP original (sp_emision_Personas_General),
-- cada tarifa lleva pcomision del arancel y mcomision = mprimabruta * pcomision / 100.
--
-- Cambios (nada más cambia; pepolcob_ind, adpolcob, recibo y adpolrea quedan igual):
--   1. pepoltar_ind: pcomision / mcomision / mcomisionext por asegurado y tarifa
--      (mismo arancel que pepolcob_ind, aceptando también arancel por tarifa; 0 si productor 80080).
--   2. adpoltar: comisión = suma de pepoltar_ind de la tarifa.
--   3. adpoltar: precargo / pdescuento = el % del asegurado cuando todos tienen el mismo
--      (antes salía 20,12 por dividir montos redondeados); ponderado solo si difieren.
--
-- Cómo aplicar (DBA): "Modify" del SP en QA y hacer los 3 reemplazos de abajo. Buscar el
-- texto ANTES exacto (es único en el SP) y reemplazarlo por DESPUÉS. Luego ejecutar el ALTER.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) pepoltar_ind — columnas de comisión del INSERT
-- -----------------------------------------------------------------------------
-- ANTES:
                    b.mprimabruta, b.mprimabrutaext, 0, 0, 0, f.isuma, 'V', f.cramoint, f.ccoberturaint, f.ctarifaint,
-- DESPUÉS:
                    b.mprimabruta, b.mprimabrutaext, k.pcomision,
                    ROUND(b.mprimabruta * k.pcomision / 100, 2), ROUND(b.mprimabrutaext * k.pcomision / 100, 2),
                    f.isuma, 'V', f.cramoint, f.ccoberturaint, f.ctarifaint,


-- -----------------------------------------------------------------------------
-- 2) pepoltar_ind — agregar el arancel después del CROSS APPLY "fd" del mismo INSERT
--    (el bloque con "m.ctarifa = b.ctarifa ) fd"; es único: el de adpoltar usa "t.").
--    El comentario en el SP puede verse con acentos raros: no hace falta tocarlo.
-- -----------------------------------------------------------------------------
-- ANTES:
                CROSS APPLY (
                    SELECT TOP 1 m.pprima, m.bfraded, m.mdedu_fran, m.mdedu_franext, m.pdedu_fran
                    FROM matarifa_d m
                    WHERE m.ccober = b.ccober AND m.cramo = a.cramo AND m.ctarifa = b.ctarifa
                ) fd

-- DESPUÉS:
                CROSS APPLY (
                    SELECT TOP 1 m.pprima, m.bfraded, m.mdedu_fran, m.mdedu_franext, m.pdedu_fran
                    FROM matarifa_d m
                    WHERE m.ccober = b.ccober AND m.cramo = a.cramo AND m.ctarifa = b.ctarifa
                ) fd
                -- v3.1: comisión de la tarifa (mismo arancel que pepolcob_ind; 0 si productor directo).
                CROSS APPLY (
                    SELECT pcomision = CASE
                        WHEN @cproductor = 80080 OR @cproductor IS NULL THEN CAST(0 AS NUMERIC(9,2))
                        ELSE COALESCE((
                            SELECT TOP 1 d.pcomision
                            FROM maarancel d
                            WHERE d.cramo = a.cramo AND d.iestado = 'V'
                              AND (d.ctarifa = '0' OR d.ctarifa = b.ctarifa)
                              AND (d.ccober = '0' OR d.ccober = b.ccober)
                              AND (d.cproductor = 0 OR d.cproductor = a.cproductor)
                              AND (d.ctipoprod = 0)
                              AND (d.cplan = '0' OR d.cplan = a.cplan)
                            ORDER BY CASE WHEN d.ctarifa <> '0' THEN 0 ELSE 1 END,
                                     CASE WHEN d.ccober <> '0' THEN 0 ELSE 1 END,
                                     CASE WHEN d.cplan <> '0' THEN 0 ELSE 1 END,
                                     CASE WHEN d.cproductor <> 0 THEN 0 ELSE 1 END
                        ), 0)
                    END
                ) k



-- -----------------------------------------------------------------------------
-- 3) adpoltar — % efectivo, comisión y subconsulta de sumas
-- -----------------------------------------------------------------------------
-- 3a) ANTES:
                    t.mdescuento, t.mdescuentoext,
                    -- % efectivo de la tarifa (promedio ponderado por prima de los asegurados)
                    CASE WHEN t.mprimaext = 0 THEN 0 ELSE ROUND(t.mdescuentoext * 100.0 / t.mprimaext, 2) END,
                    t.mrecargo, t.mrecargoext,
                    CASE WHEN t.mprimaext = 0 THEN 0 ELSE ROUND(t.mrecargoext * 100.0 / t.mprimaext, 2) END,
                    t.mprimabruta, t.mprimabrutaext, 0,
                    0, 0, f.bprimarea, t.mprimabruta, t.mprimabrutaext, 'V', f.isuma, f.cramoint, f.ccoberturaint, f.ctarifaint,
-- 3a) DESPUÉS:
                    t.mdescuento, t.mdescuentoext,
                    -- % de la tarifa: el del asegurado si todos tienen el mismo; si difieren, ponderado por prima.
                    CASE WHEN t.pdescuento_min = t.pdescuento_max THEN t.pdescuento_max
                         WHEN t.mprimaext = 0 THEN 0 ELSE ROUND(t.mdescuentoext * 100.0 / t.mprimaext, 2) END,
                    t.mrecargo, t.mrecargoext,
                    CASE WHEN t.precargo_min = t.precargo_max THEN t.precargo_max
                         WHEN t.mprimaext = 0 THEN 0 ELSE ROUND(t.mrecargoext * 100.0 / t.mprimaext, 2) END,
                    t.mprimabruta, t.mprimabrutaext, t.pcomision,
                    t.mcomision, t.mcomisionext, f.bprimarea, t.mprimabruta, t.mprimabrutaext, 'V', f.isuma, f.cramoint, f.ccoberturaint, f.ctarifaint,

-- 3b) ANTES (subconsulta "t" del INSERT adpoltar):
                           SUM(mprimabruta) AS mprimabruta, SUM(mprimabrutaext) AS mprimabrutaext
                    FROM pepoltar_ind
                    WHERE crecibo = @crecibo
                    GROUP BY ccober, ctarifa
-- 3b) DESPUÉS:
                           SUM(mprimabruta) AS mprimabruta, SUM(mprimabrutaext) AS mprimabrutaext,
                           MAX(pcomision) AS pcomision, SUM(mcomision) AS mcomision, SUM(mcomisionext) AS mcomisionext,
                           MIN(precargo) AS precargo_min, MAX(precargo) AS precargo_max,
                           MIN(pdescuento) AS pdescuento_min, MAX(pdescuento) AS pdescuento_max
                    FROM pepoltar_ind
                    WHERE crecibo = @crecibo
                    GROUP BY ccober, ctarifa


-- =============================================================================
-- Verificación (solo lectura) con una póliza NUEVA emitida después del ALTER.
-- Reemplazar el número de póliza. Esperado (productor 348, 30 %, mensual, prima 4,00):
--   adpoltar y pepoltar_ind: pcomision 30, mcomisionext 1,20, precargo 20,00.
--   La comisión de las tarifas de una cobertura = la de pepolcob_ind / adpolcob.
-- =============================================================================
-- SELECT 'adpoltar' AS tabla, t.crecibo, NULL AS casegurado, t.ccober, t.ctarifa, t.mprimabrutaext, t.precargo, t.pcomision, t.mcomision, t.mcomisionext FROM adpoltar t INNER JOIN adpoliza p ON p.cpoliza = t.cpoliza WHERE p.cnpoliza = '1-1-XXXXXXXXXX' UNION ALL SELECT 'pepoltar_ind', i.crecibo, i.casegurado, i.ccober, i.ctarifa, i.mprimabrutaext, i.precargo, i.pcomision, i.mcomision, i.mcomisionext FROM pepoltar_ind i INNER JOIN adpoliza p ON p.cpoliza = i.cpoliza WHERE p.cnpoliza = '1-1-XXXXXXXXXX' UNION ALL SELECT 'adpolcob', c.crecibo, NULL, c.ccober, NULL, c.mprimabrutaext, NULL, c.pcomision, c.mcomision, c.mcomisionext FROM adpolcob c INNER JOIN adpoliza p ON p.cpoliza = c.cpoliza WHERE p.cnpoliza = '1-1-XXXXXXXXXX' ORDER BY 2, 1
