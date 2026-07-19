-- Frecuencias de pago por plan (maplanes_frec).

CREATE OR ALTER PROCEDURE [dbo].[spBuscaFrecuenciaPlan]
    @cplan CHAR(10),
    @cramo INT = NULL,
    @berror BIT OUTPUT,
    @mensaje NVARCHAR(60) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        TRIM(ifrecuencia) AS cvalor,
        TRIM(xfrecuencia) AS xdescripcion,
        ndias
    FROM maplanes_frec
    WHERE TRIM(cplan) = TRIM(@cplan)
      AND (@cramo IS NULL OR cramo = @cramo)
    ORDER BY ifrecuencia;

    IF @@ROWCOUNT = 0
    BEGIN
        SET @berror = 1;
        SET @mensaje = 'Sin frecuencias para el plan';
    END
    ELSE
    BEGIN
        SET @berror = 0;
        SET @mensaje = 'Frecuencias encontradas';
    END
END;
