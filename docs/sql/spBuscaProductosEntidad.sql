CREATE   PROCEDURE [dbo].[spBuscaProductosEntidad]
    @citem NVARCHAR(20),
    @centidad CHAR(1),
    @berror BIT OUTPUT,
    @mensaje NVARCHAR(60) OUTPUT
AS
BEGIN
    DECLARE @ccategoria NVARCHAR(4),@resultadoCount INT;

    CREATE TABLE #Resultados (
        cproducto VARCHAR(10),
        xproducto VARCHAR(60),
        cramo INT,
        xabreviatura VARCHAR(5),
        xlogo VARCHAR(15),
        xform VARCHAR(50),
        iproductor bit,
        icanal bit
    );

		INSERT INTO #Resultados
    SELECT TRIM(cproducto) cproducto, TRIM(xdescripcion_l) [xproducto], cramo, xabreviatura, TRIM(xdescripcion_c) [xlogo], xform, iproductor, icanal
    FROM maproductos p
    WHERE
    CASE
        WHEN @centidad = 'P' THEN iproductor
        WHEN @centidad = 'C' THEN icanal
        ELSE 1
    END = 1
    AND ( 
        cproducto IN (
            SELECT cproducto FROM maplanes_per WHERE
            cplan IN (
                    SELECT cplan FROM mausuplan WHERE centidad = @centidad and citem IS NULL and itipouso = 'A'
            ) OR
            cplan IN (
                    SELECT cplan FROM mausuplan WHERE centidad = @centidad and citem = @citem and itipouso = 'A'
            ) AND
            cplan NOT IN (
                    SELECT cplan FROM mausuplan WHERE centidad = @centidad and citem IS NULL and itipouso = 'E'
            ) AND
            cplan NOT IN (
                    SELECT cplan FROM mausuplan WHERE centidad = @centidad and citem = @citem and itipouso = 'E'
            )
        ) OR cproducto IN (
            SELECT 24 FROM maplanes WHERE
            cplan IN (
                    SELECT cplan FROM mausuplan WHERE centidad = @centidad and citem IS NULL and itipouso = 'A'
            ) OR
            cplan IN (
                    SELECT cplan FROM mausuplan WHERE centidad = @centidad and citem = @citem and itipouso = 'A'
            ) AND
            cplan NOT IN (
                    SELECT cplan FROM mausuplan WHERE centidad = @centidad and citem IS NULL and itipouso = 'E'
            ) AND
            cplan NOT IN (
                    SELECT cplan FROM mausuplan WHERE centidad = @centidad and citem = @citem and itipouso = 'E'
            )
        )
    )

    SELECT @resultadoCount = COUNT(*) FROM #Resultados;

    IF @resultadoCount = 0
    BEGIN
        SET @berror = 1
        SET @mensaje = 'No se encuentra planes asociados';
    END
    ELSE
    BEGIN
        SET @berror = 0
        SET @mensaje = 'Planes encontrados';
    END

    SELECT * FROM #Resultados;

END
