CREATE PROCEDURE sp_macat_obtener_valores_dominio
    @cdominio VARCHAR(30),
    @xtipo_orden VARCHAR(4) = 'ASC',
    @bactivos BIT = 1
AS
BEGIN
    SET NOCOUNT ON;

    SELECT 
        cvalor, 
        xdescripcion
    FROM macatvalores
    WHERE cdominio = @cdominio
      AND (@bactivos = 0 OR bactivo = 1)
    ORDER BY 
        CASE WHEN UPPER(@xtipo_orden) = 'ASC' THEN iorden END ASC,
        CASE WHEN UPPER(@xtipo_orden) = 'DESC' THEN iorden END DESC;
END;
