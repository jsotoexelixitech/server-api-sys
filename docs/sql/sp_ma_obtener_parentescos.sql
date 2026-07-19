-- Catálogo de parentescos (maparent) para getLists PARENTESCOS.

CREATE OR ALTER PROCEDURE [dbo].[sp_ma_obtener_parentescos]
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        TRIM(CAST(cparentesco AS VARCHAR(10))) AS cvalor,
        TRIM(xparentesco) AS xdescripcion
    FROM maparent
    ORDER BY cparentesco;
END;
