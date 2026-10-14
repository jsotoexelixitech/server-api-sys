-- ============================================================================
-- Procedimiento: dbo.sp_ma_obtener_productores_nexus
-- Objetivo:      Catálogo de productores/brokers activos para selección en Backoffice.
-- Fuente:        dbo.maproduc
-- Usado por:     server-api-sys (nest-api) -> GET/POST /api/v1/valrep/brokers
-- ============================================================================

CREATE OR ALTER PROCEDURE dbo.sp_ma_obtener_productores_nexus
AS
BEGIN
    SET NOCOUNT ON;

    SELECT 
        cproductor,
        LTRIM(RTRIM(xproductor)) AS xproductor
    FROM dbo.maproduc WITH (NOLOCK)
    WHERE xproductor IS NOT NULL
      AND LTRIM(RTRIM(xproductor)) <> ''
    ORDER BY LTRIM(RTRIM(xproductor)) ASC;
END
GO
