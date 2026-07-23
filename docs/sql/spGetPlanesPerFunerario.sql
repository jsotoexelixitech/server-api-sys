-- Planes vigentes de personas (ramo funerario) con parentescos.
-- Desplegar en Sis2000 antes de usar POST /personas/planes vía nest-api.
-- Sin STRING_SPLIT (compatible SQL Server 2012+).

CREATE OR ALTER PROCEDURE [dbo].[spGetPlanesPerFunerario]
    @cramo INT,
    @cplanes NVARCHAR(200) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    CREATE TABLE #planes (
        cplan NVARCHAR(10) COLLATE DATABASE_DEFAULT,
        xplan NVARCHAR(100) COLLATE DATABASE_DEFAULT,
        cramo INT,
        cmoneda NVARCHAR(4) COLLATE DATABASE_DEFAULT
    );

    CREATE TABLE #whitelist (cplan NVARCHAR(10) COLLATE DATABASE_DEFAULT);

    IF @cplanes IS NOT NULL AND LEN(LTRIM(RTRIM(@cplanes))) > 0
    BEGIN
        DECLARE @rest NVARCHAR(200) = LTRIM(RTRIM(@cplanes)) + ',';
        DECLARE @pos INT;
        DECLARE @code NVARCHAR(10);

        WHILE LEN(@rest) > 0
        BEGIN
            SET @pos = CHARINDEX(',', @rest);
            IF @pos = 0 BREAK;

            SET @code = LTRIM(RTRIM(LEFT(@rest, @pos - 1)));
            SET @rest = SUBSTRING(@rest, @pos + 1, LEN(@rest));

            IF LEN(@code) > 0
                INSERT INTO #whitelist (cplan) VALUES (@code COLLATE DATABASE_DEFAULT);
        END
    END

    INSERT INTO #planes (cplan, xplan, cramo, cmoneda)
    SELECT
        LTRIM(RTRIM(p.cplan)) COLLATE DATABASE_DEFAULT,
        LTRIM(RTRIM(p.xplan)) COLLATE DATABASE_DEFAULT,
        p.cramo,
        LTRIM(RTRIM(p.cmoneda)) COLLATE DATABASE_DEFAULT
    FROM maplanes_per p
    WHERE p.iestado = 'V'
      AND p.cramo = @cramo
      AND (
          NOT EXISTS (SELECT 1 FROM #whitelist)
          OR LTRIM(RTRIM(p.cplan)) COLLATE DATABASE_DEFAULT IN (SELECT cplan FROM #whitelist)
      );

    SELECT cplan, xplan, cramo, cmoneda FROM #planes ORDER BY cplan;

    SELECT
        p.cplan,
        A.cparen,
        LTRIM(RTRIM(B.xparentesco)) AS xparentesco,
        C.cemin_ase AS min_edad,
        C.cemax_ase AS max_edad
    FROM #planes p
    INNER JOIN mapltarifas_per A
        ON A.cramo = p.cramo
        AND LTRIM(RTRIM(A.cplan)) COLLATE DATABASE_DEFAULT = p.cplan
    INNER JOIN maparent B ON B.cparentesco = A.cparen
    INNER JOIN mapledades_per C
        ON C.cparen = A.cparen
        AND C.cramo = A.cramo
        AND LTRIM(RTRIM(C.cplan)) COLLATE DATABASE_DEFAULT = p.cplan
    GROUP BY p.cplan, A.cparen, B.xparentesco, C.cemin_ase, C.cemax_ase
    ORDER BY p.cplan, A.cparen;
END;
