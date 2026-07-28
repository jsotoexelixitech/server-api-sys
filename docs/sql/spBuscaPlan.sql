--  ˚☽˚. ‧₊˚✩₊˚.⋆☾⋆⁺₊✧⋆⁺₊⋆ ☀ ⋆⁺₊⋆
-- Author:	Franjhely Araujo <3
-- Create date: 25/3/2025
-- Description:	Busqueda de planes
--  ˚☽˚. ‧₊˚✩₊˚.⋆☾⋆⁺₊✧⋆⁺₊⋆ ☀ ⋆⁺₊⋆

CREATE PROCEDURE [dbo].[spBuscaPlan]
    @cramo Int,
    @cproductor NUMERIC(17) = null,
    @ctipo NUMERIC(4),
    @cusuario NUMERIC(11),
    @bnacional bit,
    @citem VARCHAR(50),
    @centidad CHAR(1),
    @mensaje NVARCHAR(MAX) OUTPUT,
    @status bit = 1 OUTPUT
AS
BEGIN
    DECLARE @ccategoria NVARCHAR(4),@resultadoCount INT;

    IF @cramo in (18, 28)
    BEGIN
        IF @ctipo IS NULL
        BEGIN
            SET @status = 0;
            SET @mensaje = 'Es necesario especificar un tipo de vehiculo';
            RETURN;
        END
    END

    IF @cramo NOT IN (18, 28)
    BEGIN
        IF @ctipo IS NOT NULL 
        BEGIN
            SET @status = 0;
            SET @mensaje = 'El campo tipo solo se espera en ramo automóvil';
            RETURN;
        END
    END
    IF @centidad NOT IN ('P', 'C', 'G') BEGIN
        SET @status = 0;
        SET @mensaje = 'Tipo de entidad no encontrada';
        RETURN;
    END

    IF @centidad = 'P' BEGIN
        IF NOT EXISTS (SELECT 1 FROM maproduc WHERE cproductor = @citem)
        BEGIN
            SET @status = 0;
            SET @mensaje = 'Item para la entidad descrita no encontrado. No se encontró productor.';
            RETURN;
        END
    END ELSE IF @centidad = 'C' BEGIN
        IF NOT EXISTS (SELECT 1 FROM macanalalt WHERE ccanalalt = @citem)
        BEGIN
            SET @status = 0;
            SET @mensaje = 'Item para la entidad descrita no encontrado. No se encontró canal.';
            RETURN;
        END
    END ELSE IF @centidad = 'G' BEGIN
        IF NOT EXISTS (SELECT 1 FROM magestor WHERE cgestor = @citem)
        BEGIN
            SET @status = 0;
            SET @mensaje = 'Item para la entidad descrita no encontrado. No se encontró gestor.';
            RETURN;
        END
    ELSE 
    BEGIN
        SET @status = 0;
        SET @mensaje = 'Tipo de entidad no encontrada';
            RETURN;
        END
    END


    CREATE TABLE #Resultados (
        cplan NVARCHAR(6) COLLATE SQL_Latin1_General_CP1_CI_AS,
        xplan NVARCHAR(100),
        xplan_c NVARCHAR(100),
        cramo SMALLINT,
        ctipo NUMERIC(4),
        cproductor NUMERIC(17),
        cproducto varchar(10),
		cbeneficiario NUMERIC(17),
		ctenedor NUMERIC(17),
        iestado CHAR(1),
        cmoneda NVARCHAR(4),
        xcobertura1 NVARCHAR(100),
        xcobertura2 NVARCHAR(100),
        xcobertura3 NVARCHAR(100),
        xcobertura4 NVARCHAR(100),
        bcober NVARCHAR(10)
    );

    INSERT INTO #Resultados
    SELECT
		ltrim(rtrim(b.cplan)) as cplan, 
		ltrim(rtrim(b.xplan)) as xplan, 
		b.xplan_c, b.cramo, 
		NULL AS ctipo,
		b.cproductor, 
		trim(b.cproducto) cproducto, 
		b.cbeneficiario, 
		b.ctenedor, 
		b.iestado, 
		trim(b.cmoneda) 'cmoneda',
		'cober' , 'cober', 'cober','cober',
		dbo.fn_validateCoberAccess(@cusuario,b.cproducto,'CA') 
    FROM maplanes_per b
    left join mausuplan a on b.cramo = a.cramo and b.cplan = a.cplan
	where
	b.cramo = ISNULL(@cramo, a.cramo) AND
    b.iestado = 'V' AND
	(b.cproducto is not null) AND (
		(@centidad not in ('C') AND (
			(a.centidad = 'P' AND a.citem = CONVERT(varchar(10),@citem)) OR (a.centidad = 'P' AND a.citem is null)
		)) OR (
			@centidad IS NOT NULL AND (a.centidad = @centidad AND a.cramo = @cramo AND (a.citem = @citem OR a.citem IS NULL))
		)
	)
    UNION
    SELECT
		ltrim(rtrim(b.cplan)) as cplan, 
		ltrim(rtrim(b.xplan)) as xplan, 
		b.xplan_c,
		b.cramo, 
		b.ctipo,
		b.cproductor,
		trim(b.cproducto) cproducto, 
		b.cbeneficiario, 
		b.ctenedor,
		b.iestado,
		trim(b.cmoneda) 'cmoneda',
	    (
	    	SELECT
			CASE
				WHEN ccober = 1 THEN (SELECT 'CA' as id, trim(xdescripcion_l) as value FROM macoberturas WHERE ccobertura = 1 and cramo = 18 and iestado = 'V' FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
		        ELSE NULL
		    END as cobertura_json
		    FROM maplantar
		    WHERE cplan = B.cplan and ccober = 1 and @ctipo <> 8) as 'cober',
		(
			SELECT
				CASE 
					WHEN ccober = 2 THEN  (SELECT 'PT' as id, trim(xdescripcion_l) as value   FROM macoberturas  WHERE ccobertura = 2 and cramo = 18 and iestado = 'V'   FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
		        ELSE
	            NULL
	        END as cobertura_json
		    FROM maplantar 
		    WHERE cplan = B.cplan and ccober = 2) as 'cober',
	    (
	    	SELECT 
	    	CASE 
		    	WHEN ccober = 69 THEN  (SELECT 'AP' as id, 'APOV' as value   FROM macoberturas  WHERE ccobertura = 69 and cramo = 28 and iestado = 'V'   FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
		        ELSE NULL 
		    END as cobertura_json
		    FROM maplantar 
		    WHERE cplan = B.cplan and ccober = 69 ) as 'cober',
    
	    (
	    	SELECT  CASE WHEN ccober = 28 THEN  (SELECT 'PP' as id, trim(xdescripcion_l) as value   FROM macoberturas  WHERE ccobertura = 28 and cramo = 18 and iestado = 'V'   FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
	        ELSE 
    	        NULL 
        	END as cobertura_json
		    FROM maplantar 
		    WHERE cplan = B.cplan and ccober = 28) as 'cober',
	    dbo.fn_validateCoberAccess(@cusuario,b.cproducto,'CA') 
    FROM maplanes b 
    left join mausuplan a on b.cramo = a.cramo and b.cplan = a.cplan
	where
	b.cramo = @cramo AND
    b.iestado = 'V' AND
    --AND (ctipo = @ctipo OR ctipo = 0)
    b.bnacional = @bnacional AND
    --AND ((@ctipo IN (5,6) AND b.cplan = 'BINAC') OR (@ctipo NOT IN (5,6) ))
    (
		(@ctipo = 4 AND (b.ctipo = 4 or b.cplan = 'rcvbas' )) OR -- Solo aplica si @ctipo es 4
		(@ctipo <> 4 AND @ctipo <> 1 AND (b.ctipo in (6,8) OR b.ctipo = 0 )) OR  -- Caso normal
		(
			@ctipo in (
				select t.ctipo
				from macatvalores v 
				cross apply openjson(v.xdescripcion) with (ctipo varchar(3) '$') as t
				where v.cdominio = 'PLANTIPOVEH'
				and v.cvalor = b.cplan
			)
			and b.ctipo = 99
		) OR
		(@ctipo <> 4 AND (b.ctipo = @ctipo OR b.ctipo = 0) )  -- Caso normal
	) AND (
		((@centidad IS NULL OR @centidad not in ('C')) AND (
			(a.centidad = 'P' AND a.citem = CONVERT(varchar(10),@citem)) OR (a.centidad = 'P' AND a.citem is null)
		)) OR (
			@centidad IS NOT NULL AND (a.centidad = @centidad AND a.cramo = @cramo AND (a.citem = @citem OR a.citem IS NULL))
		)
	)
	/*((cproductor = @cproductor OR cproductor = 80080)) OR*/


    IF (@bnacional = 1 and (@ctipo IN (5,6))) BEGIN
        delete #Resultados where cplan not in ('binac')
	END

	--Filtrar exclusiones
   
	delete #Resultados from #Resultados a inner join mausuplan b on  a.cplan COLLATE SQL_Latin1_General_CP1_CI_AS = b.cplan where b.citem = @citem and b.centidad = @centidad and b.itipouso = 'E'

    UPDATE #Resultados  SET xcobertura1 = null where bcober = 0
    UPDATE #Resultados  SET xcobertura2 = null where bcober = 0
    UPDATE #Resultados  SET xcobertura3 = null where bcober = 0
    UPDATE #Resultados  SET xcobertura4 = null where bcober = 0
   

    ALTER TABLE #Resultados DROP COLUMN bcober;

    -- Contar los resultados
    SELECT @resultadoCount = COUNT(*) FROM #Resultados;

    IF @resultadoCount = 0
    BEGIN
        SET @status = 0;
        SET @mensaje = 'No se encuentra planes asociados';
    END
    ELSE
    BEGIN
        SET @status = 1;
        SET @mensaje = 'Planes encontrados'; -- O cualquier otro mensaje que desees
    END

    -- Devolver los resultados
    SELECT xcobertura1 'xcober', xcobertura2 'xcober',xcobertura3 'xcober', xcobertura4 'xcober', xcobertura4 'cober', * FROM #Resultados ORDER BY xplan ASC;

END;
