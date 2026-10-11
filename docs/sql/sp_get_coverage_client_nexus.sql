/* 2026-10-11 — Copia "_nexus" de spGetCoverageClient (los SP existentes no se modifican; mismo criterio que RCV y funerario).
 * Cambio: @cpoliza y la tabla temporal #resultados pasan de numeric(18) a numeric(19,0) (EXE-63: 38 % de las pólizas 2026 tiene 19 dígitos).
 */
CREATE OR ALTER PROCEDURE [dbo].[sp_get_coverage_client_nexus]
	@cpoliza numeric(19,0) = 5000000000009806,
	@fanopol int = 2025,
	@fmespol int = 1

AS
BEGIN

    DECLARE @cnpoliza NVARCHAR(50), @crecibo NUMERIC,
    @cnrecibo NVARCHAR(30), @cmoneda varchar(4), @fcobro DATE, @cdoccob INT,
    @cramo INT, @xramo NVARCHAR(100), @cplan NVARCHAR(50), @xplan NVARCHAR(100),
    @iestadorec CHAR(1), @xestadorec NVARCHAR(20), @msumaaseg NUMERIC, @mprimabruta NUMERIC, @qcuotas INT,
    @fdesde DATE, @fhasta DATE, @iestadoven INT, @mmontorec NUMERIC, @ndiaspend INT,
    @mmontoapag NUMERIC, @nrecibosven INT, @fdesdeven DATE, @mensaje VARCHAR(250)
    ;

    DECLARE cur CURSOR FOR
    SELECT cpoliza, fanopol, fmespol, cramo, cplan 
    FROM adpoliza a
    WHERE cpoliza = @cpoliza and fanopol = @fanopol and fmespol = @fmespol

    OPEN cur;
    FETCH NEXT FROM cur INTO 
    @cpoliza, @fanopol, @fmespol, @cramo, @cplan


    -- Tabla temporal para resultados
    CREATE TABLE #resultados
    (
        cpoliza NUMERIC(19,0),
        fanopol INT,
        fmespol INT,
        cramo INT,
        cplan VARCHAR(6),
        xplan VARCHAR(250)
    );

    -- Tabla temporal para recibos
    CREATE TABLE #coberturas
    (
        cramo INT,
        cplan VARCHAR(6),
        ccobertura INT,
        xcobertura VARCHAR(250),
        msumaaseg NUMERIC
    );

    WHILE @@FETCH_STATUS = 0 BEGIN   
--         SET @mmontorec = 0
--         SET @ndiaspend = 0
-- 		
--         IF (@cmoneda != 'Bs') BEGIN
--             SELECT @msumaaseg = msumabrutaext FROM adrecibos WHERE crecibo = @crecibo
--             SELECT @mprimabruta = mprimabrutaext FROM adrecibos WHERE crecibo = @crecibo
--         END ELSE BEGIN 
--             SELECT @msumaaseg = msumabruta FROM adrecibos WHERE crecibo = @crecibo
--             SELECT @mprimabruta = mprimabruta FROM adrecibos WHERE crecibo = @crecibo
--         END
-- 
--         SET @iestadoven = 0
--         IF (@iestadorec = 'P' AND (@cdoccob IS NULL OR @cdoccob = 0) AND @fdesde <= GETDATE()) BEGIN 
--             SET @iestadoven = 1
--         END
-- 
--         IF (@iestadoven = 1) BEGIN 
--             SELECT @mmontorec = CASE WHEN cmoneda != 'Bs' THEN mmontorecext ELSE mmontorec END FROM adrecibos WHERE crecibo = @crecibo
--             SELECT @ndiaspend = DATEDIFF(day, fdesde, GETDATE()) FROM adrecibos where crecibo = @crecibo
--         END

        -- IF (@cramo = 18) BEGIN
            
        -- END ELSE 
        IF @cramo IN (1, 5, 7, 9) BEGIN
            SELECT @xplan = xplan FROM maplanes_per WHERE maplanes_per.cramo = @cramo AND maplanes_per.cplan = @cplan

            -- SELECT * FROM peasegurados WHERE cpoliza = @cpoliza and fanopol = @fanopol and fmespol = @fmespol 

            -- SELECT * 

            -- SELECT * FROM mapltabedad
            INSERT INTO #coberturas
            select DISTINCT @cramo, TRIM(@cplan), mapltarifas_per.ccobertura,
            TRIM(xtablaedad), mapltabedad_d.msuma [msumaaseg]--, mapltabedad_d.mprima 
            from mapltabedad_d 
            inner join mapltabedad on mapltabedad.ctablaedad = mapltabedad_d.ctablaedad 
            inner join mapltarifas_per ON mapltarifas_per.cramo = @cramo AND mapltarifas_per.cplan = @cplan AND mapltarifas_per.ctablatar = mapltabedad.ctablaedad
            WHERE mapltabedad_d.ctablaedad in (select ctablatar from mapltarifas_per WHERE cramo = @cramo AND cplan = @cplan)
        END ELSE BEGIN
            SELECT @xplan = xplan FROM maplanes WHERE maplanes.cramo = @cramo AND maplanes.cplan = @cplan

            INSERT INTO #coberturas
            SELECT @cramo, TRIM(@cplan), macoberturas.ccobertura, TRIM(macoberturas.xdescripcion_l) [xcobertura], 0 FROM maplanes 
            LEFT JOIN maplantar ON maplanes.cplan = maplantar.cplan AND maplantar.cramo = maplanes.cramo
            LEFT JOIN maarancel ON maplantar.ccober = maarancel.ccober AND maarancel.iestado = 'V' AND maarancel.cramo = maplantar.cramo
            LEFT JOIN macoberturas ON maplantar.ccober = macoberturas.ccobertura AND macoberturas.cramo = maplantar.cramo
            LEFT JOIN maplancob ON maplanes.cplan = maplancob.cplan AND maplancob.cramo = maplanes.cramo AND macoberturas.ccobertura = maplancob.ccobertura
            WHERE maplanes.cramo = @cramo AND maplanes.cplan = @cplan
        END


        INSERT INTO #resultados(
            cpoliza, fanopol, fmespol, cramo, cplan, xplan
        ) SELECT 
            cpoliza, fanopol, fmespol, @cramo, TRIM(@cplan), TRIM(@xplan)
        FROM adpoliza a
        WHERE cpoliza = @cpoliza and fanopol = @fanopol and fmespol = @fmespol

        FETCH NEXT FROM cur INTO 
        @cpoliza, @fanopol, @fmespol, @cramo, @cplan
    END

--     
--     SELECT @mmontoapag = SUM(mmontorec), @nrecibosven = SUM(iestadoven), @fdesdeven = (SELECT MIN(fdesde) FROM #resultados WHERE iestadoven = 1)
--     FROM #resultados
--     
-- 
--     INSERT INTO #coberturas
--     SELECT cpoliza, fanopol, fmespol, cmoneda, @mmontoapag, @nrecibosven, @fdesdeven, 
--     'Tienes una deuda pendiente de ' + cmoneda + ' ' + CONVERT(varchar, @mmontoapag) + ', que corresponde a ' + CONVERT(varchar, @nrecibosven) + 
--     ' cuotas, desde la fecha ' + CONVERT(varchar,@fdesdeven) +'. Usted debe pagar lo más pronto posible para acceder los servicios que se solicite.'
--     FROM #resultados GROUP BY cpoliza, fanopol, fmespol, cmoneda

    CLOSE cur;
    DEALLOCATE cur;

    SELECT * FROM #resultados;
    DROP TABLE #resultados;

    SELECT * FROM #coberturas;
    DROP TABLE #coberturas;

END