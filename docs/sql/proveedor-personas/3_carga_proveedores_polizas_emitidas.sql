-- =============================================================================
-- 3 de 3 — Carga de proveedores en pólizas de personas YA EMITIDAS por Nexus · 27-oct-2026
-- Asocia en ADPROVEEDOR los proveedores del plan (MAPLPROV_PER) a las pólizas de personas
-- emitidas por Nexus antes de la v3.4 (las nuevas ya los registran al emitir).
--
-- Requiere: 1_sp_registrar_proveedor_poliza_nexus.sql aplicado.
-- Alcance:  ADPOLIZA.cprog = 'TEmision_Per_Ge' (pólizas de personas emitidas por Nexus),
--           vigentes (istatpol 'V' y fhasta >= hoy), cuyo plan tiene hoy proveedores
--           vigentes en MAPLPROV_PER y que todavía no tienen filas en ADPROVEEDOR.
-- Filas:    mismas reglas del SP 1 (vigencia = la de la póliza, costo del proveedor,
--           u_version '!', ccerti 0) con cprog = 'NEXUS_PROV CARGA' para identificarlas.
--
-- Uso: ejecutar el PASO A (solo lectura) y revisar. Luego el PASO B, revisar el total y
--      confirmar con COMMIT (o deshacer con ROLLBACK). No dejar la transacción abierta.
-- Ambiente: Sis2000_QA primero. En producción: USE Sis2000.
-- =============================================================================
USE Sis2000_QA;
GO

-- -----------------------------------------------------------------------------
-- PASO A — Diagnóstico (solo lectura)
-- -----------------------------------------------------------------------------
DECLARE @hoy DATETIME = CAST(GETDATE() AS DATE);

-- A.1 Pólizas a completar, por plan
SELECT p.cramo, p.cplan, COUNT(*) AS polizas
FROM adpoliza p
WHERE RTRIM(p.cprog) = 'TEmision_Per_Ge'
  AND p.istatpol = 'V'
  AND p.fhasta >= @hoy
  AND EXISTS (SELECT 1 FROM maplprov_per m
              WHERE m.cramo = p.cramo AND RTRIM(m.cplan) = RTRIM(p.cplan)
                AND m.fdesde <= @hoy AND (m.fhasta IS NULL OR m.fhasta >= @hoy))
  AND NOT EXISTS (SELECT 1 FROM adproveedor a
                  WHERE a.cpoliza = p.cpoliza AND a.fanopol = p.fanopol AND a.fmespol = p.fmespol)
GROUP BY p.cramo, p.cplan
ORDER BY p.cramo, p.cplan;

-- A.2 Detalle de las pólizas
SELECT p.cpoliza, p.cnpoliza, p.fanopol, p.fmespol, p.cramo, p.cplan, p.fdesde, p.fhasta, p.ptasamon, p.cusuario
FROM adpoliza p
WHERE RTRIM(p.cprog) = 'TEmision_Per_Ge'
  AND p.istatpol = 'V'
  AND p.fhasta >= @hoy
  AND EXISTS (SELECT 1 FROM maplprov_per m
              WHERE m.cramo = p.cramo AND RTRIM(m.cplan) = RTRIM(p.cplan)
                AND m.fdesde <= @hoy AND (m.fhasta IS NULL OR m.fhasta >= @hoy))
  AND NOT EXISTS (SELECT 1 FROM adproveedor a
                  WHERE a.cpoliza = p.cpoliza AND a.fanopol = p.fanopol AND a.fmespol = p.fmespol)
ORDER BY p.fdesde;

-- A.3 Pólizas de personas Nexus vigentes cuyo plan NO tiene proveedores (no se cargará nada)
SELECT p.cramo, p.cplan, COUNT(*) AS polizas_sin_proveedor_configurado
FROM adpoliza p
WHERE RTRIM(p.cprog) = 'TEmision_Per_Ge'
  AND p.istatpol = 'V'
  AND p.fhasta >= @hoy
  AND NOT EXISTS (SELECT 1 FROM maplprov_per m
                  WHERE m.cramo = p.cramo AND RTRIM(m.cplan) = RTRIM(p.cplan)
                    AND m.fdesde <= @hoy AND (m.fhasta IS NULL OR m.fhasta >= @hoy))
GROUP BY p.cramo, p.cplan
ORDER BY p.cramo, p.cplan;
GO

-- -----------------------------------------------------------------------------
-- PASO B — Carga (escribe en ADPROVEEDOR). Ejecutar solo después de revisar el PASO A.
-- -----------------------------------------------------------------------------
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @hoy DATETIME = CAST(GETDATE() AS DATE), @total INT = 0, @polizas INT = 0, @q INT;
DECLARE @cpoliza NUMERIC(20,0), @fanopol SMALLINT, @fmespol TINYINT, @cramo SMALLINT, @cplan CHAR(6),
        @fdesde DATETIME, @fhasta DATETIME, @cusuario NUMERIC(11,0);

DECLARE polizas CURSOR LOCAL FAST_FORWARD FOR
    SELECT p.cpoliza, p.fanopol, p.fmespol, p.cramo, p.cplan, p.fdesde, p.fhasta, p.cusuario
    FROM adpoliza p
    WHERE RTRIM(p.cprog) = 'TEmision_Per_Ge'
      AND p.istatpol = 'V'
      AND p.fhasta >= @hoy
      AND NOT EXISTS (SELECT 1 FROM adproveedor a
                      WHERE a.cpoliza = p.cpoliza AND a.fanopol = p.fanopol AND a.fmespol = p.fmespol);

OPEN polizas;
FETCH NEXT FROM polizas INTO @cpoliza, @fanopol, @fmespol, @cramo, @cplan, @fdesde, @fhasta, @cusuario;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @q = 0;
    EXEC sp_registrar_proveedor_poliza_nexus
        @cpoliza      = @cpoliza,
        @fanopol      = @fanopol,
        @fmespol      = @fmespol,
        @cramo        = @cramo,
        @cplan        = @cplan,
        @fdesde       = @fdesde,
        @fhasta       = @fhasta,
        @cusuario     = @cusuario,
        @ifuente      = 'NEXUS',
        @ccerti       = 0,
        @qregistrados = @q OUTPUT,
        @fvigencia    = @hoy,               -- proveedores vigentes hoy en el plan
        @cprog        = 'NEXUS_PROV CARGA';
    SET @total = @total + ISNULL(@q, 0);
    IF ISNULL(@q, 0) > 0 SET @polizas = @polizas + 1;
    FETCH NEXT FROM polizas INTO @cpoliza, @fanopol, @fmespol, @cramo, @cplan, @fdesde, @fhasta, @cusuario;
END
CLOSE polizas;
DEALLOCATE polizas;

SELECT @polizas AS polizas_con_proveedor, @total AS filas_insertadas;

-- Revisión de lo cargado (debe coincidir con el PASO A.1)
SELECT a.cramo, a.cplan, COUNT(DISTINCT a.cpoliza) AS polizas, COUNT(*) AS filas
FROM adproveedor a
WHERE a.cprog = 'NEXUS_PROV CARGA'
GROUP BY a.cramo, a.cplan
ORDER BY a.cramo, a.cplan;

-- Si el resultado es el esperado:
-- COMMIT TRANSACTION;
-- Si no:
-- ROLLBACK TRANSACTION;
