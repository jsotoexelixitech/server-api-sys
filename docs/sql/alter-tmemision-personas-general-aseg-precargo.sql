-- =============================================================================
-- TMEMISION_PERSONAS_GENERAL_ASEG: % de recargo y descuento por asegurado
-- Fecha: 2026-10-05 · Solicitado por: Exélixi (emisión personas vía nest-api)
--
-- precargo / pdescuento: porcentaje (no monto) de cada asegurado. Los llena
-- sp_pre_emision_personas_general_nexus v3 y los usa sp_emision_personas_general_nexus v3.
-- NULL = 0 (filas anteriores). Idempotente.
-- =============================================================================
IF COL_LENGTH('dbo.TMEMISION_PERSONAS_GENERAL_ASEG', 'precargo') IS NULL
    ALTER TABLE dbo.TMEMISION_PERSONAS_GENERAL_ASEG ADD precargo NUMERIC(13,2) NULL;
GO
IF COL_LENGTH('dbo.TMEMISION_PERSONAS_GENERAL_ASEG', 'pdescuento') IS NULL
    ALTER TABLE dbo.TMEMISION_PERSONAS_GENERAL_ASEG ADD pdescuento NUMERIC(13,2) NULL;
GO
