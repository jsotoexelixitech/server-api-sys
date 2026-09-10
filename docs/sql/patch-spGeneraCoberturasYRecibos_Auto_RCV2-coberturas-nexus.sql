-- Parche spGeneraCoberturasYRecibos_Auto_RCV2 — planes premium (Auto) con CA/PT/PP.
-- Síntoma: PDF PENDIENTE, coberturas vacías, prima 0 pese a cotización OK.
--
-- Requiere: alter-tmemision-rcv2-coberturas-nexus.sql + sp_pre_emision v2 (persiste cober/tasas).
--
-- Cambios en spGeneraCoberturasYRecibos_Auto_RCV2 (aprox. líneas 108-187):

-- 1) Reemplazar hardcode:
--      SELECT @coberAdicional = 'R'
--    Por lectura desde TMEMISION:
/*
    SELECT TOP 1
        @coberAdicional = NULLIF(RTRIM(t.coberAdicional), ''),
        @tasaPt = ISNULL(t.tasaPt, 0),
        @tasaCa = ISNULL(t.tasaCa, 0),
        @tasaPp = ISNULL(t.tasaPp, 0)
    FROM TMEMISION_AUTOMOVIL_RCV2 t
    WHERE t.cpoliza = @cpoliza
    ORDER BY t.id DESC;

    IF @coberAdicional IS NULL OR @coberAdicional IN ('', 'R')
        SET @coberAdicional = 'RC';
*/

-- 2) En EXEC spCalculoAuto reemplazar:
--      @sumaAseg = 0,
--    Por:
--      @sumaAseg = ISNULL(@msumaasegext, 0),

-- 3) En el mismo EXEC spCalculoAuto reemplazar:
--      @tasaPt = 0, @tasaCa = 0, @tasaPp = 0,
--      @cusuario = null, @coberAdicional = null,
--    Por:
--      @tasaPt = @tasaPt, @tasaCa = @tasaCa, @tasaPp = @tasaPp,
--      @cusuario = @cusuario, @coberAdicional = @coberAdicional,

-- Verificación:
--   EXEC sp_repair_rcv_coberturas_nexus @cnpoliza = '18-1-0000080778';
--   SELECT c.ccober, c.mprimabrutaext FROM adpolcob c
--   JOIN adrecibos r ON r.crecibo = c.crecibo
--   WHERE RTRIM(r.cnpoliza) = '18-1-0000080778';

GO
