CREATE PROCEDURE [dbo].[spGetPolizasAsegurado]
    @casegurado numeric(13)
-- 	@LinkedServer NVARCHAR(100) 


AS
BEGIN
    
    DECLARE @cpoliza NUMERIC(19,0), @fanopol INT, @fmespol INT, @cnpoliza NVARCHAR(50), @istatpol CHAR(1),
        @xstatpol NVARCHAR(20), @cramo INT, @xramo NVARCHAR(100), @cplan NVARCHAR(50), @xplan NVARCHAR(100),
        @iestadorec CHAR(1), @xestadorec NVARCHAR(20), @iestadoven INT, @nrecibosven INT, @fdesdeven DATE;

    DECLARE cur CURSOR FOR
    SELECT 
        a.cpoliza, 
        a.fanopol, 
        a.fmespol, 
        TRIM(a.cnpoliza), 
        a.istatpol, 
        a.cramo, 
        TRIM(c.xdescripcion_l) [xramo],
        a.cplan
    FROM adpoliza a
        INNER JOIN adrecibos b ON b.cpoliza = a.cpoliza and b.fanopol = a.fanopol and b.fmespol = a.fmespol
        INNER JOIN maramos c ON c.cramo = a.cramo
    WHERE a.casegurado = @casegurado;

    OPEN cur;
    FETCH NEXT FROM cur INTO @cpoliza, @fanopol, @fmespol, @cnpoliza, @istatpol, @cramo, @xramo, @cplan;

    CREATE TABLE #resultados
    (
        cpoliza NUMERIC(19,0),
        fanopol INT,
        fmespol INT,
        cnpoliza NVARCHAR(50),
        istatpol CHAR(1),
        xstatpol NVARCHAR(20),
        cramo INT,
        xramo NVARCHAR(100),
        cplan NVARCHAR(50),
        xplan NVARCHAR(100),
        iestadoven INT
    );

    WHILE @@FETCH_STATUS = 0 BEGIN
        SET @xstatpol = CASE 
            WHEN @istatpol = 'V' THEN 'Vigente'
            WHEN @istatpol = 'A' THEN 'Anulada'
            WHEN @istatpol = 'S' THEN 'Suspendida'
            WHEN @istatpol = 'R' THEN 'Renovada'
            ELSE ''
        END;

        SELECT @xplan = TRIM(xplan) FROM maplanes_per WHERE cramo = @cramo AND cplan = @cplan;
        IF @xplan IS NULL 
        SELECT @xplan = TRIM(xplan) FROM maplanes WHERE cramo = @cramo AND cplan = @cplan;

        SELECT TOP 1 @iestadorec = iestadorec FROM adrecibos
        WHERE cpoliza = @cpoliza AND fanopol = @fanopol AND fmespol = @fmespol ;

        SET @xestadorec = CASE 
            WHEN @iestadorec = 'P' THEN 'Pendiente'
            WHEN @iestadorec = 'C' THEN 'Cobrado'
            WHEN @iestadorec = 'A' THEN 'Anulado'
            WHEN @iestadorec = 'N' THEN 'Notificado'
            WHEN @iestadorec = 'S' THEN 'Suspendido'
            ELSE ''
        END;

        SET @iestadoven = 0

        IF EXISTS (SELECT TOP 1 * FROM adrecibos 
        WHERE cpoliza = @cpoliza and fanopol = @fanopol and fmespol = @fmespol
        AND (cdoccob IS NULL OR cdoccob = 0) AND fdesde <= GETDATE()) BEGIN
            SET @iestadoven = 1
        END

        INSERT INTO #resultados
        VALUES
            (@cpoliza, @fanopol, @fmespol, @cnpoliza, @istatpol, @xstatpol, @cramo, @xramo, @cplan, @xplan, @iestadoven);

        FETCH NEXT FROM cur INTO @cpoliza, @fanopol, @fmespol, @cnpoliza, @istatpol, @cramo, @xramo, @cplan;
    END

    CLOSE cur;
    DEALLOCATE cur;

    SELECT * FROM #resultados;
    DROP TABLE #resultados;

END
