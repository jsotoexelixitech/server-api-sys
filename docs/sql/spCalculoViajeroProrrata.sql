/*
 * spCalculoViajeroProrrata — Prorrata viajero por días (versión BDA Sis2000 QA)
 *
 * Fórmula:
 *   ndias     = DATEDIFF(DAY, fdesde, fhasta) + 1  (inclusive)
 *   mprimaext = ndias × 0.75 USD
 *   mprima    = mprimaext × ptasamon (Bs)
 *
 * Planes: ramo 25 + VIAJE | ramo 5 + VIAJ%
 *
 * nest-api: personas.service → getCotizacionViajeroProrrata
 *   Entrada: cramo, cplan, fdesde, fhasta, cparen, nedad_asegurado, xrif_asegurado, ptasamon
 *   Salida OUTPUT: ndias, mprimaext, mprima, berror, mensaje
 */

CREATE OR ALTER PROCEDURE [dbo].[spCalculoViajeroProrrata]
    @cramo           INT,
    @cplan           CHAR(10),
    @fdesde          DATE,
    @fhasta          DATE,
    @cparen          INT            = 1,
    @nedad_asegurado INT,
    @xrif_asegurado  VARCHAR(10),
    @ptasamon        FLOAT          = NULL,
    @ndias           INT            = NULL OUTPUT,
    @mprimaext       NUMERIC(18, 2) = NULL OUTPUT,
    @mprima          NUMERIC(18, 2) = NULL OUTPUT,
    @berror          BIT            = 0 OUTPUT,
    @mensaje         NVARCHAR(120)  = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @cplan_t    VARCHAR(10) = UPPER(LTRIM(RTRIM(@cplan)));
    DECLARE @cmoneda    CHAR(4);
    DECLARE @min_edad   INT;
    DECLARE @max_edad   INT;
    DECLARE @tarifa_dia NUMERIC(18, 4) = 0.75;

    SET @berror = 0;
    SET @mensaje = NULL;

    IF NOT (
        (@cramo = 25 AND @cplan_t = 'VIAJE')
        OR (@cramo = 5 AND @cplan_t LIKE 'VIAJ%')
    )
    BEGIN
        SET @berror = 1;
        SET @mensaje = N'Plan no aplica prorrata viajero por días';
        RETURN;
    END;

    IF @fdesde IS NULL OR @fhasta IS NULL
    BEGIN
        SET @berror = 1;
        SET @mensaje = N'fdesde y fhasta son obligatorios para prorrata viajero';
        RETURN;
    END;

    IF @fhasta < @fdesde
    BEGIN
        SET @berror = 1;
        SET @mensaje = N'fhasta no puede ser anterior a fdesde';
        RETURN;
    END;

    SET @ndias = DATEDIFF(DAY, @fdesde, @fhasta) + 1;

    IF @ndias < 1 OR @ndias > 366
    BEGIN
        SET @berror = 1;
        SET @mensaje = N'Vigencia fuera de rango (1-366 días)';
        RETURN;
    END;

    SELECT @min_edad = TRY_CAST(cemin_ase AS INT),
           @max_edad = TRY_CAST(cemax_ase AS INT)
    FROM mapledades_per
    WHERE cramo = @cramo AND LTRIM(RTRIM(cplan)) = @cplan_t AND cparen = @cparen;

    IF @min_edad IS NULL OR @max_edad IS NULL
    BEGIN
        SET @berror = 1;
        SET @mensaje = N'Parentesco no permitido para este plan';
        RETURN;
    END;

    IF @nedad_asegurado < @min_edad OR @nedad_asegurado > @max_edad
    BEGIN
        SET @berror = 1;
        SET @mensaje = N'Edad fuera de rango permitido para el plan';
        RETURN;
    END;

    SELECT @cmoneda = LTRIM(RTRIM(cmoneda))
    FROM maplanes_per
    WHERE cramo = @cramo AND LTRIM(RTRIM(cplan)) = @cplan_t;

    IF @ptasamon IS NULL
        SELECT @ptasamon = ptasamon FROM mamonedas WHERE cmoneda = @cmoneda;

    SET @mprimaext = ROUND(@ndias * @tarifa_dia, 2);
    SET @mprima     = ROUND(@mprimaext * ISNULL(@ptasamon, 1), 2);
    SET @mensaje    = N'Prorrata viajero OK';
END;
GO

/*
 * Prueba manual (ejecutar DECLARE + EXEC en el mismo batch):
 *
 * DECLARE @n INT, @ext NUMERIC(18,2), @bs NUMERIC(18,2), @e BIT, @m NVARCHAR(120);
 * EXEC dbo.spCalculoViajeroProrrata
 *   @cramo=25, @cplan='VIAJE',
 *   @fdesde='2026-07-29', @fhasta='2026-08-02',
 *   @cparen=1, @nedad_asegurado=35, @xrif_asegurado='28901456',
 *   @ndias=@n OUT, @mprimaext=@ext OUT, @mprima=@bs OUT, @berror=@e OUT, @mensaje=@m OUT;
 * SELECT @n ndias, @ext mprimaext_usd, @bs mprima_bs, @e berror, @m mensaje;
 * -- Esperado: ndias=5, mprimaext_usd=3.75
 */
