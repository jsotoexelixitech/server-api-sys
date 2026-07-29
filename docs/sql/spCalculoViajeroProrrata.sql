/*
 * spCalculoViajeroProrrata — Prorrata genérica por días (viajero y planes similares)
 *
 * Fórmula (producto técnico La Mundial, jul-2026):
 *   ndias     = @ndias explícito  OR  DATEDIFF(DAY, fdesde, fhasta) + 1  (inclusive)
 *   mprimaext = ndias × tarifa_diaria
 *   mprima    = mprimaext × ptasamon (Bs)
 *
 * Ejemplos tarifa 0,75 USD/día: 3→2,25 | 15→11,25 | 30→22,50 | X→X×0,75
 *
 * Planes que aplican (extensible sin cambiar código):
 *   1) maplanes_per.itarifa = 'P'  (Prorrata por días — marcar nuevos planes en BD)
 *   2) Compatibilidad: ramo 25 + VIAJE | ramo 5 + cplan LIKE 'VIAJ%'
 *   3) @forzar_prorrata = 1 (QA / migración)
 *
 * Límites de vigencia (ndias_max):
 *   @ndias_max parámetro  >  MAX(maplanes_frec.ndias) del plan  >  366 default
 *   Cuando exista plan de 30 días, BDA inserta fila en maplanes_frec con ndias=30
 *   o parametriza ndias_max en catálogo.
 *
 * Tarifa diaria:
 *   @mprima_diaria  >  mapltabedad_d.mprima (por edad)  >  error si no hay tarifa
 *   (Evitar hardcode 0,75 en prod; usar mapltabedad_d para nuevos productos.)
 *
 * Salida recordsets (compatible spCalculoPer / nest-api cotización):
 *   RS1: detalle por cobertura (opcional, vacío en prorrata simple)
 *   RS2: totales por asegurado (cparen, xparentesco, xrif, mprima, mprimaext, ndias, tarifa_diaria)
 *
 * Integración: spCalculoPer delega aquí si fdesde/fhasta o ndias + plan prorrata.
 * NO cablear nest-api hasta deploy BDA en Sis2000.
 */

CREATE OR ALTER PROCEDURE [dbo].[spCalculoViajeroProrrata]
    @cramo           INT,
    @cplan           CHAR(10),
    @cparen          INT             = 1,
    @nedad_asegurado INT,
    @xrif_asegurado  VARCHAR(10),
    @fdesde          DATE            = NULL,
    @fhasta          DATE            = NULL,
    @ndias_in        INT             = NULL,   -- alternativa a fdesde/fhasta (API envía días directo)
    @ptasamon        FLOAT           = NULL,
    @mprima_diaria   NUMERIC(18, 6)  = NULL,   -- override tarifa; NULL → mapltabedad_d
    @ndias_max       INT             = NULL,   -- override tope; NULL → maplanes_frec / 366
    @forzar_prorrata BIT             = 0,
    @ndias           INT             = NULL OUTPUT,
    @tarifa_diaria   NUMERIC(18, 6)  = NULL OUTPUT,
    @mprimaext       NUMERIC(18, 2)  = NULL OUTPUT,
    @mprima          NUMERIC(18, 2)  = NULL OUTPUT,
    @berror          BIT             = 0 OUTPUT,
    @mensaje         NVARCHAR(200)   = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @cplan_t      VARCHAR(10) = UPPER(LTRIM(RTRIM(@cplan)));
    DECLARE @itarifa      CHAR(1);
    DECLARE @cmoneda      CHAR(4);
    DECLARE @min_edad     INT;
    DECLARE @max_edad     INT;
    DECLARE @ctablatar    CHAR(10);
    DECLARE @ndias_tope   INT;
    DECLARE @aplica       BIT = 0;

    SET @berror = 0;
    SET @mensaje = NULL;
    SET @ndias = NULL;
    SET @tarifa_diaria = NULL;
    SET @mprimaext = NULL;
    SET @mprima = NULL;

    -- ── ¿Plan con prorrata por días? ───────────────────────────────────────
    SELECT @itarifa = LTRIM(RTRIM(itarifa)),
           @cmoneda = LTRIM(RTRIM(cmoneda))
    FROM maplanes_per
    WHERE cramo = @cramo AND LTRIM(RTRIM(cplan)) = @cplan_t;

    IF @itarifa IS NULL
    BEGIN
        SELECT @cmoneda = LTRIM(RTRIM(cmoneda))
        FROM maplanes
        WHERE cramo = @cramo AND LTRIM(RTRIM(cplan)) = @cplan_t;
    END;

    IF @forzar_prorrata = 1
        SET @aplica = 1;
    ELSE IF @itarifa = 'P'
        SET @aplica = 1;
    ELSE IF @cramo = 25 AND @cplan_t = 'VIAJE'
        SET @aplica = 1;
    ELSE IF @cramo = 5 AND @cplan_t LIKE 'VIAJ%'
        SET @aplica = 1;

    IF @aplica = 0
    BEGIN
        SET @berror = 1;
        SET @mensaje = N'El plan no está configurado para prorrata por días (itarifa P o catálogo viajero).';
        RETURN;
    END;

    -- ── Calcular ndias ─────────────────────────────────────────────────────
    IF @ndias_in IS NOT NULL AND @ndias_in > 0
        SET @ndias = @ndias_in;
    ELSE IF @fdesde IS NOT NULL AND @fhasta IS NOT NULL
    BEGIN
        IF @fhasta < @fdesde
        BEGIN
            SET @berror = 1;
            SET @mensaje = N'fhasta no puede ser anterior a fdesde';
            RETURN;
        END;
        SET @ndias = DATEDIFF(DAY, @fdesde, @fhasta) + 1;
    END
    ELSE
    BEGIN
        SET @berror = 1;
        SET @mensaje = N'Informe ndias_in o el par fdesde/fhasta para prorrata.';
        RETURN;
    END;

    -- ── Tope máximo de días (30, 15, 366… según catálogo) ─────────────────
    SELECT @ndias_tope = MAX(ndias)
    FROM maplanes_frec
    WHERE cramo = @cramo
      AND LTRIM(RTRIM(cplan)) = @cplan_t
      AND ndias IS NOT NULL
      AND ndias > 0;

    IF @ndias_max IS NOT NULL AND @ndias_max > 0
        SET @ndias_tope = @ndias_max;
    ELSE IF @ndias_tope IS NULL OR @ndias_tope <= 0
        SET @ndias_tope = 366;

    IF @ndias < 1 OR @ndias > @ndias_tope
    BEGIN
        SET @berror = 1;
        SET @mensaje = CONCAT(N'Vigencia fuera de rango permitido (1-', @ndias_tope, N' días). Recibido: ', @ndias);
        RETURN;
    END;

    -- ── Edad / parentesco ──────────────────────────────────────────────────
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
        SET @mensaje = CONCAT(N'Edad fuera de rango (', @min_edad, N'-', @max_edad, N').');
        RETURN;
    END;

    IF @ptasamon IS NULL AND @cmoneda IS NOT NULL
        SELECT @ptasamon = ptasamon FROM mamonedas WHERE cmoneda = @cmoneda;

    IF @ptasamon IS NULL OR @ptasamon <= 0
        SET @ptasamon = 1;

    -- ── Tarifa diaria desde catálogo ───────────────────────────────────────
    IF @mprima_diaria IS NOT NULL AND @mprima_diaria > 0
        SET @tarifa_diaria = @mprima_diaria;
    ELSE
    BEGIN
        SELECT TOP 1 @ctablatar = ctablatar
        FROM mapltarifas_per
        WHERE cramo = @cramo
          AND LTRIM(RTRIM(cplan)) = @cplan_t
          AND cparen = @cparen;

        SELECT @tarifa_diaria = mprima
        FROM mapltabedad_d
        WHERE ctablaedad = @ctablatar
          AND @nedad_asegurado >= nedad_min
          AND @nedad_asegurado <= nedad_max;

        IF @tarifa_diaria IS NULL OR @tarifa_diaria <= 0
        BEGIN
            SET @berror = 1;
            SET @mensaje = N'Sin tarifa diaria en mapltabedad_d para plan/edad. Configurar mprima (USD/día) en BD.';
            RETURN;
        END;
    END;

    SET @mprimaext = ROUND(CAST(@ndias AS NUMERIC(18, 6)) * @tarifa_diaria, 2);
    SET @mprima     = ROUND(@mprimaext * @ptasamon, 2);
    SET @mensaje    = CONCAT(N'Prorrata OK: ', @ndias, N' días × ', @tarifa_diaria, N' = ', @mprimaext, N' USD');

    -- RS1: detalle (vacío — reservado si luego se prorratea por cobertura)
    SELECT CAST(NULL AS INT) AS cparen WHERE 1 = 0;

    -- RS2: totales (misma forma que spCalculoPer recordset 2)
    SELECT
        @cparen AS cparen,
        TRIM(p.xparentesco) AS xparentesco,
        @xrif_asegurado AS xrif_asegurado,
        @mprima AS mprima,
        @mprimaext AS mprimaext,
        @ndias AS ndias,
        @tarifa_diaria AS tarifa_diaria,
        @fdesde AS fdesde,
        @fhasta AS fhasta
    FROM maparent p
    WHERE p.cparentesco = @cparen;
END;
GO

/*
 * ── Parche sugerido spCalculoPer (BDA) ─────────────────────────────────────
 *
 * ALTER PROCEDURE spCalculoPer
 *   ... params existentes ...
 *   , @fdesde DATE = NULL
 *   , @fhasta DATE = NULL
 *   , @ndias_in INT = NULL
 * AS BEGIN
 *   IF @fdesde IS NOT NULL OR @fhasta IS NOT NULL OR @ndias_in IS NOT NULL
 *   BEGIN
 *     EXEC spCalculoViajeroProrrata
 *       @cramo, @cplan, @cparen, @nedad_asegurado, @xrif_asegurado,
 *       @fdesde, @fhasta, @ndias_in, @ptasamon, NULL, NULL, 0,
 *       @nd OUT, @tar OUT, @ext OUT, @bs OUT, @err OUT, @msg OUT;
 *     IF @err = 1 ;THROW 99001, @msg, 1;
 *     RETURN;
 *   END
 *   -- flujo funerario / anual actual ...
 * END
 *
 * ── Catálogo BD para escalar (ej. plan 30 días) ────────────────────────────
 *
 * 1) maplanes_per: itarifa = 'P' en cualquier plan nuevo con prorrata
 * 2) mapltabedad_d: mprima = tarifa USD por día (ej. 0.75)
 * 3) maplanes_frec (opcional): ndias = 30 → tope máximo 30 para ese plan
 *    Si no hay filas en maplanes_frec, tope default 366 (o @ndias_max en SP)
 *
 * ── nest-api (post-deploy) ─────────────────────────────────────────────────
 * CotizacionPerDto: fdesde, fhasta, ndias opcionales
 * getCotizacionPer → pasa fechas/días a spCalculoPer
 * Emisión viajero: fhasta obligatorio; sin default +1 año
 */
