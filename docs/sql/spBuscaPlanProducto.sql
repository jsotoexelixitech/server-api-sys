-- Author:	Andrés Quintero
-- Create date: 28/01/2026
-- Description:	Busqueda de planes por producto

CREATE   PROCEDURE [dbo].[spBuscaPlanProducto]
    @cproducto NVARCHAR(10),
    @citem NVARCHAR(20),
    @centidad CHAR(1),
    @mensaje NVARCHAR(60) OUTPUT
AS
BEGIN
    DECLARE @ccategoria NVARCHAR(4),@resultadoCount INT;

    IF @cproducto not in (select distinct(cproducto) from maproductos)
    BEGIN
		SET @mensaje = 'Ramo no coincide coincide con los asignados a la busqueda';
		RETURN;
    END

    CREATE TABLE #Resultados (
        cplan NVARCHAR(6) COLLATE SQL_Latin1_General_CP1_CI_AS,
        xplan NVARCHAR(100),
        xplan_c NVARCHAR(60),
        cramo INT,
		cproducto NVARCHAR(10),
        cproductor INT,
		cbeneficiario INT,
		ctenedor INT,
		msumaasegext numeric(18,2),
        iestado CHAR(1),
        cmoneda NVARCHAR(4),
    );
	IF @cproducto = '24' BEGIN
		INSERT INTO #Resultados
		SELECT
		TRIM(b.cplan) as cplan, TRIM(b.xplan) as xplan, b.xplan_c,
		b.cramo, b.cproducto, b.cproductor, b.cbeneficiario, b.ctenedor,
		COALESCE(
	        (SELECT MAX(maplantar.msumamax)
	        FROM maplanes INNER JOIN maplantar ON maplantar.cplan = maplanes.cplan AND maplantar.cramo = maplanes.cramo
	        WHERE maplanes.cplan=b.cplan and maplanes.cramo = b.cramo),
	        0) as mxumaasegext,
		b.iestado, TRIM(b.cmoneda) 'cmoneda'
	    FROM maplanes b
		where
		b.iestado = 'V'
		AND b.cramo = 18
		AND (
			(@citem IS NOT NULL AND EXISTS (
				SELECT 1 FROM mausuplan m
				WHERE m.centidad = @centidad
				  AND (m.citem = @citem OR m.citem IS NULL)
				  AND m.itipouso = 'A'
				  AND TRIM(m.cplan) = TRIM(b.cplan)
				  AND m.cramo = b.cramo
			))
		)
	END ELSE BEGIN
		INSERT INTO #Resultados
	    SELECT
		TRIM(b.cplan) as cplan, TRIM(b.xplan) as xplan, b.xplan_c,
		b.cramo, b.cproducto, b.cproductor, b.cbeneficiario, b.ctenedor,
		(select max(msuma) from mapltabedad_d WHERE ctablaedad in (SELECT ctablatar FROM mapltarifas_per WHERE cramo = b.cramo and cplan = b.cplan)) msumaasegext,
		b.iestado, TRIM(b.cmoneda) 'cmoneda'
	    FROM maplanes_per b
		where
		b.iestado = 'V'
		AND b.cproducto = @cproducto
		AND (
			(@citem IS NOT NULL AND EXISTS (
				SELECT 1 FROM mausuplan m
				WHERE m.centidad = @centidad
				  AND (m.citem = @citem OR m.citem IS NULL)
				  AND m.itipouso = 'A'
				  AND TRIM(m.cplan) = TRIM(b.cplan)
				  AND m.cramo = b.cramo
			))
		)

	    UNION

	    SELECT
		TRIM(b.cplan) as cplan, TRIM(b.xplan) as xplan, b.xplan_c,
		b.cramo, b.cproducto, b.cproductor, b.cbeneficiario, b.ctenedor,
		COALESCE(
	        (SELECT MAX(maplantar.msumamax)
	        FROM maplanes INNER JOIN maplantar ON maplantar.cplan = maplanes.cplan AND maplantar.cramo = maplanes.cramo
	        WHERE maplanes.cplan=b.cplan and maplanes.cramo = b.cramo),
	        0) as mxumaasegext,
		b.iestado, TRIM(b.cmoneda) 'cmoneda'
	    FROM maplanes b
		where
		b.iestado = 'V'
		AND (
			(@citem IS NOT NULL AND EXISTS (
				SELECT 1 FROM mausuplan m
				WHERE m.centidad = @centidad
				  AND (m.citem = @citem OR m.citem IS NULL)
				  AND m.itipouso = 'A'
				  AND TRIM(m.cplan) = TRIM(b.cplan)
				  AND m.cramo = b.cramo
			))
		)
	    AND b.cproducto = @cproducto
	END

	delete #Resultados from #Resultados a inner join mausuplan b on  a.cplan COLLATE SQL_Latin1_General_CP1_CI_AS = b.cplan where b.citem = @citem and b.centidad = @centidad and b.itipouso = 'E'

    SELECT @resultadoCount = COUNT(*) FROM #Resultados;

    IF @resultadoCount = 0
    BEGIN
        SET @mensaje = 'No se encuentra planes asociados';
    END
    ELSE
    BEGIN
        SET @mensaje = 'Planes encontrados';
    END

    SELECT * FROM #Resultados;

END;
