CREATE      PROCEDURE sp_ma_obtener_estados
    @xfiltros_json NVARCHAR(MAX),
    @cusuario NUMERIC(13)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @cpais INT;

    IF @xfiltros_json IS NOT NULL
    BEGIN
        SELECT @cpais = cpais
        FROM OPENJSON(@xfiltros_json) WITH (cpais INT '$.cpais');
    END

    SELECT '0' AS cvalor, 'Todos' AS xdescripcion
	UNION ALL
    SELECT 
        cestado AS cvalor, 
        trim(xdescripcion_l) AS xdescripcion
    FROM maestados
    WHERE cpais = @cpais;
END;
