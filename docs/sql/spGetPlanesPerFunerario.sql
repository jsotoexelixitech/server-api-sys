-- Planes vigentes de personas (ramo funerario) con parentescos.
-- Desplegar en Sis2000 antes de usar GET /personas/planes vía nest-api.

CREATE OR ALTER PROCEDURE [dbo].[spGetPlanesPerFunerario]
    @cramo INT,
    @cplanes NVARCHAR(200) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    CREATE TABLE #planes (
        cplan NVARCHAR(10) COLLATE SQL_Latin1_General_CP1_CI_AS,
        xplan NVARCHAR(100),
        cramo INT,
        cmoneda NVARCHAR(4)
    );

    CREATE TABLE #whitelist (cplan NVARCHAR(10) COLLATE SQL_Latin1_General_CP1_CI_AS);

    IF @cplanes IS NOT NULL AND LEN(LTRIM(RTRIM(@cplanes))) > 0
    BEGIN
        INSERT INTO #whitelist (cplan)
        SELECT LTRIM(RTRIM(value))
        FROM STRING_SPLIT(@cplanes, ',')
        WHERE LEN(LTRIM(RTRIM(value))) > 0;
    END

    INSERT INTO #planes (cplan, xplan, cramo, cmoneda)
    SELECT TRIM(cplan), TRIM(xplan), cramo, TRIM(cmoneda)
    FROM maplanes_per
    WHERE iestado = 'V'
      AND cramo = @cramo
      AND (
          NOT EXISTS (SELECT 1 FROM #whitelist)
          OR TRIM(cplan) IN (SELECT cplan FROM #whitelist)
      );

    SELECT cplan, xplan, cramo, cmoneda FROM #planes ORDER BY cplan;

    SELECT
        p.cplan,
        A.cparen,
        TRIM(B.xparentesco) AS xparentesco,
        C.cemin_ase AS min_edad,
        C.cemax_ase AS max_edad
    FROM #planes p
    INNER JOIN mapltarifas_per A
        ON A.cramo = p.cramo AND TRIM(A.cplan) = p.cplan
    INNER JOIN maparent B ON B.cparentesco = A.cparen
    INNER JOIN mapledades_per C
        ON C.cparen = A.cparen AND C.cramo = A.cramo AND TRIM(C.cplan) = p.cplan
    GROUP BY p.cplan, A.cparen, B.xparentesco, C.cemin_ase, C.cemax_ase
    ORDER BY p.cplan, A.cparen;
END;
