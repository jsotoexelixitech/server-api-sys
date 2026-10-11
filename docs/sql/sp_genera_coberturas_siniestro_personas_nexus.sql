-- =============================================================================
-- sp_genera_coberturas_siniestro_personas_nexus - v3
-- Fecha: 2026-10-05 · Solicitado por: Exélixi (emisión personas vía nest-api)
--
-- Único cambio respecto a la versión vigente en QA:
--   Se quitan los dos INSERT (pepolcob_ind y pepoltar_ind). Ahora los llena
--   sp_emision_personas_general_nexus v3 con el monto de cada asegurado, por cobertura y
--   por tarifa. Si se dejaran, duplicarían las filas (PK por recibo/asegurado/cobertura).
--   Se mantiene el insert de tetitcer.
--
-- Aplicar junto con sp_emision_personas_general_nexus v3.
-- =============================================================================
CREATE OR ALTER PROCEDURE [dbo].[sp_genera_coberturas_siniestro_personas_nexus]
    @cpoliza NUMERIC(19, 0),
    @fanopol INT,
    @fmespol INT
AS
BEGIN
    SET NOCOUNT ON;

    -- pepolcob_ind y pepoltar_ind: los genera sp_emision_personas_general_nexus (v3).

    -- Validar y asegurar el registro de tetitcer para control de certificados (Sintaxis original compatible)
    IF NOT EXISTS (SELECT 1 FROM tetitcer WHERE cpoliza = @cpoliza AND fanopol = @fanopol AND fmespol = @fmespol AND ccerti = 0)
    BEGIN
        INSERT INTO tetitcer
        SELECT
            a.cpoliza, a.fanopol, a.fmespol, 0, a.u_version, a.cramo, itipoprod, cproces, a.casegurado, a.ctenedor, 0, a.cacreedor,
            cbeneficiario, a.cproductor, itiporen, iestadoren, 'V', a.fdesde, a.fhasta, forigen, cprog, ifuente, bok, cerror, a.fingreso,
            a.cusuario, a.ccategoria, a.cusuarioauto, a.ccategoriaauto, a.fultmod, a.cusuariomod, a.ccategoriamod
        FROM adpoliza a WITH (NOLOCK)
        WHERE A.cpoliza = @cpoliza AND A.fanopol = @fanopol AND a.fmespol = @fmespol;
    END

END;
