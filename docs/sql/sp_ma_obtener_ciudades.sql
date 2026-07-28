CREATE      PROCEDURE sp_ma_obtener_ciudades
    @xfiltros_json NVARCHAR(MAX),
    @cusuario NUMERIC(13)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @cestado INT;

    IF @xfiltros_json IS NOT NULL
    BEGIN
        SELECT @cestado = cestado
        FROM OPENJSON(@xfiltros_json) WITH (cestado INT '$.cestado');
    END

    SELECT '0' AS cvalor, 'Todos' AS xdescripcion
	UNION ALL
    SELECT 
        cciudad AS cvalor, 
        trim(xdescripcion_l) AS xdescripcion
    FROM maciudades
    WHERE cestado = @cestado;
END;
