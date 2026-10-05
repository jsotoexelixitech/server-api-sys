-- Frecuencias de pago por plan y productor (maplanes_frec y maplanes_frec_produc).

CREATE OR ALTER PROCEDURE [dbo].[sp_busca_frecuencia_plan_nexus]
    @cplan CHAR(10),
    @cramo INT = NULL,
    @cproductor NUMERIC(17) = NULL,
    @berror BIT OUTPUT,
    @mensaje NVARCHAR(60) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT DISTINCT
        TRIM(ifrecuencia) AS cvalor,
        TRIM(xfrecuencia) AS xdescripcion,
        ndias
    FROM maplanes_frec
    WHERE TRIM(cplan) = TRIM(@cplan)
      AND (@cramo IS NULL OR cramo = @cramo)
    UNION
    SELECT DISTINCT
        TRIM(ifrecuencia) AS cvalor,
        TRIM(xfrecuencia) AS xdescripcion,
        ndias
    FROM maplanes_frec_produc
    WHERE TRIM(cplan) = TRIM(@cplan)
      AND (@cramo IS NULL OR cramo = @cramo)
      AND (@cproductor IS NOT NULL AND cproductor = @cproductor);

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
