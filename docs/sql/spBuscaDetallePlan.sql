-- Author:	Gabriel Estacio
-- Create date: 02/03/2026
-- Description:	Busqueda de Detalles del Plan (Personas)

CREATE   PROCEDURE [dbo].[spBuscaDetallePlan]
    @cramo INT,
    @cplan CHAR(6),
		@berror bit OUTPUT,
    @mensaje NVARCHAR(60) OUTPUT
AS
BEGIN
    DECLARE @ccategoria NVARCHAR(4),@resultadoCount INT;

    CREATE TABLE #Resultados (
        cramo INT,
        cplan NVARCHAR(6) COLLATE SQL_Latin1_General_CP1_CI_AS,
        xplan NVARCHAR(100),
        xplan_c NVARCHAR(60),
        cproducto NVARCHAR(10),
        cproductor INT,
        cbeneficiario INT,
        ctenedor INT,
        msumaaseg numeric(18,2),
        cmoneda NVARCHAR(4),
        iestado CHAR(1),
        itarifa CHAR(1),
        nmax_dep INT,
				ctipo INT,
        bnacional INT,
        itiporen CHAR(1)
				);
		
		CREATE TABLE #Parentescos (
        cparen INT,
				xparentesco VARCHAR(60),
				min_edad INT,
				max_edad INT
    );
		
		CREATE TABLE #Coberturas (
        ccobertura VARCHAR(4),
				xcobertura VARCHAR(60)
    );

    INSERT INTO #Resultados
    SELECT 
    b.cramo, TRIM(b.cplan) as cplan, TRIM(b.xplan) xplan, b.xplan_c,
    TRIM(b.cproducto) cproducto, b.cproductor, b.cbeneficiario, b.ctenedor,
    (select CASE WHEN MAX(msumamax) > 0 THEN MAX(msumamax) ELSE MAX(msuma) END from mapltabedad_d WHERE ctablaedad in (SELECT ctablatar FROM mapltarifas_per WHERE cramo = b.cramo and cplan = b.cplan)) msumaasegext,
    trim(b.cmoneda) 'cmoneda',
    b.iestado,  itarifa, nmax_dep, null, null, itiporen
    FROM maplanes_per b
    where b.cramo = @cramo and b.cplan = @cplan
		UNION
		SELECT 
    b.cramo, TRIM(b.cplan) as cplan, TRIM(b.xplan) xplan, b.xplan_c,
    TRIM(b.cproducto) cproducto, b.cproductor, b.cbeneficiario, b.ctenedor,
    COALESCE(
        (SELECT MAX(maplantar.msumamax)
        FROM maplanes INNER JOIN maplantar ON maplantar.cplan = maplanes.cplan AND maplantar.cramo = maplanes.cramo
        WHERE maplanes.cplan=b.cplan and maplanes.cramo = b.cramo),
        0) as mxumaasegext,
    trim(b.cmoneda) 'cmoneda',
    b.iestado,  null, null, ctipo, bnacional, itiporen
    FROM maplanes b
    where b.cramo = @cramo and b.cplan = @cplan

    SELECT @resultadoCount = COUNT(*) FROM #Resultados;

    IF @resultadoCount = 0 BEGIN
				SET @berror = 1
        SET @mensaje = 'No se encuentra planes asociados';
    END ELSE BEGIN
				SET @berror = 0
        SET @mensaje = 'Planes encontrados';
    END
		
		INSERT INTO #Parentescos
		SELECT A.cparen, TRIM(xparentesco) [xparentesco], cemin_ase [min_edad], cemax_ase [max_edad]
		from mapltarifas_per A 
		INNER JOIN maparent B ON B.cparentesco = A.cparen 
		INNER JOIN mapledades_per C on C.cparen = A.cparen and C.cramo = A.cramo and C.cplan = A.cplan
		WHERE A.cramo = @cramo and A.cplan = @cplan
		GROUP BY A.cparen, B.xparentesco, cemin_ase, cemax_ase;
		
		INSERT INTO #Coberturas
		SELECT b.ccobertura,TRIM(b.xdescripcion_l) [xcobertura] from maplcober_per a 
		INNER JOIN macoberturas b on a.cramo = b.cramo and a.ccobertura = b.ccobertura
		WHERE A.cramo = @cramo and A.cplan = @cplan
		UNION
		SELECT b.ccobertura,TRIM(b.xdescripcion_l) [xcobertura] from maplancob a 
		INNER JOIN macoberturas b on a.cramo = b.cramo and a.ccobertura = b.ccobertura
		WHERE A.cramo = @cramo and A.cplan = @cplan

    SELECT * FROM #Resultados;
		SELECT * FROM #Parentescos;
		SELECT * FROM #Coberturas;

END
