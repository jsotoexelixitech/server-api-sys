-- =============================================================================
-- 1 de 3 — sp_registrar_proveedor_poliza_nexus (NUEVO) — versión 1.0 · 27-oct-2026
-- Registra en ADPROVEEDOR los proveedores configurados para el plan de la póliza
-- (MAPLPROV_PER), de forma automática al emitir una póliza de personas desde Nexus.
--
-- Criterio del DBA (La Mundial): el proveedor NO se elige a mano en la emisión; se
-- asigna según el plan. Se guardan fdesde / fhasta (vigencia de la póliza) y fingreso
-- para el histórico (bajas y reasignaciones futuras).
--
-- Misma forma que las filas que genera Sis2000 (cprog MAMPLPROV_PER V1.0):
--   · una fila por proveedor del plan vigente a la fecha de inicio de la póliza
--   · u_version '!', ccerti 0 (póliza individual), ccategoria 1
--   · mcostoext = costo del proveedor en USD (MAPLPROV_PER.mcostoext)
--   · mcosto    = mcostoext × tasa de la póliza (ADPOLIZA.ptasamon; si es Bs → tasa $ del día)
--   · cmoneda   = la del proveedor en MAPLPROV_PER (por defecto '$')
--
-- Idempotente: no duplica (NOT EXISTS sobre la clave adproveedor_pk).
-- Si el plan no tiene proveedores configurados, no inserta y no falla (@qregistrados = 0).
-- No crea ni modifica tablas. Se llama desde sp_emision_personas_general_nexus (archivo 02)
-- dentro de su misma transacción: si falla, la emisión hace rollback completo.
--
-- Ambiente: ejecutar en Sis2000_QA primero (cambiar el USE). En producción: USE Sis2000.
-- =============================================================================
USE Sis2000_QA;
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_registrar_proveedor_poliza_nexus]
    @cpoliza        NUMERIC(20,0),
    @fanopol        SMALLINT,
    @fmespol        TINYINT,
    @cramo          SMALLINT,
    @cplan          CHAR(6),
    @fdesde         DATETIME,
    @fhasta         DATETIME,
    @cusuario       NUMERIC(11,0) = NULL,
    @ifuente        CHAR(10)      = NULL,
    @ccerti         NUMERIC(10,0) = 0,
    @qregistrados   INT           = NULL OUTPUT,
    -- Fecha a la que el proveedor debe estar vigente en MAPLPROV_PER. Por defecto, el inicio
    -- de la póliza (emisión). La carga de pólizas ya emitidas (3 de 3) pasa la fecha de hoy.
    @fvigencia      DATETIME      = NULL,
    -- Identifica el origen de la fila: emisión ('NEXUS_PROV V1.0') o carga ('NEXUS_PROV CARGA').
    @cprog          CHAR(20)      = 'NEXUS_PROV V1.0'
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @tasa NUMERIC(13,6);
    DECLARE @fref DATETIME = ISNULL(@fvigencia, @fdesde);

    -- Tasa de la póliza; si la póliza está en Bs (ptasamon = 1) se usa la tasa $ del día,
    -- igual que hace Sis2000 para convertir el costo del proveedor (mcosto = mcostoext × tasa).
    SELECT @tasa = ptasamon
    FROM adpoliza
    WHERE cpoliza = @cpoliza AND fanopol = @fanopol AND fmespol = @fmespol;

    IF @tasa IS NULL OR @tasa <= 1
        SELECT @tasa = ptasamon FROM mamonedas WHERE cmoneda = '$';

    IF @tasa IS NULL SET @tasa = 1;

    INSERT INTO adproveedor
        (cpoliza, fanopol, fmespol, ccerti, cramo, cplan, cci_rif, cclave_num,
         u_version, fdesde, fhasta, itiposerv, mcosto, mcostoext, cmoneda, ptasamon,
         cprog, ifuente, bok, cerror, fingreso, cusuario, ccategoria)
    SELECT
        @cpoliza, @fanopol, @fmespol, @ccerti, p.cramo, p.cplan, p.cci_rif, p.cclave_num,
        '!',
        @fdesde,
        @fhasta,
        p.itiposerv,
        CASE WHEN ISNULL(p.mcostoext, 0) > 0 THEN ROUND(p.mcostoext * @tasa, 2) ELSE ISNULL(p.mcosto, 0) END,
        ISNULL(p.mcostoext, 0),
        ISNULL(NULLIF(RTRIM(p.cmoneda), ''), '$'),
        @tasa,
        ISNULL(@cprog, 'NEXUS_PROV V1.0'),
        ISNULL(@ifuente, 'NEXUS'),
        NULL, NULL,
        GETDATE(),
        ISNULL(@cusuario, 1422),
        1
    FROM maplprov_per p
    WHERE p.cramo = @cramo
      AND RTRIM(p.cplan) = RTRIM(@cplan)
      AND p.fdesde <= @fref
      AND (p.fhasta IS NULL OR p.fhasta >= @fref)
      AND NOT EXISTS (
            SELECT 1 FROM adproveedor a
            WHERE a.cpoliza = @cpoliza AND a.fanopol = @fanopol AND a.fmespol = @fmespol
              AND a.ccerti = @ccerti AND a.cramo = p.cramo AND a.cplan = p.cplan
              AND a.cci_rif = p.cci_rif AND a.cclave_num = p.cclave_num
      );

    SET @qregistrados = @@ROWCOUNT;
END;
GO
