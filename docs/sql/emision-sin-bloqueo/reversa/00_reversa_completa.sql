-- REVERSA (Sis2000 .67): definiciones de PRODUCCIÓN al 20-nov-2026, antes del pase

-- ===== 10_sp_contador_nexus.sql =====
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
-- REVERSA: definición de PROD (.67) al 20-nov-2026 (modificada 17-nov 14:06). Idéntica en QA .80.
CREATE OR ALTER PROCEDURE [dbo].[sp_contador_nexus]
@cpoliza NUMERIC(19) OUTPUT, @cnpoliza NVARCHAR(17)OUTPUT,
@crecibo NUMERIC(19) OUTPUT, @cnrecibo NVARCHAR(17) OUTPUT,
@cproces NUMERIC(13)OUTPUT, @csucur NUMERIC(4),@fdesde DATE,
@ramo INT, @pol_type VARCHAR(10)
AS
BEGIN
    BEGIN TRANSACTION;
    BEGIN TRY
        DECLARE
            @lencpoliza  NUMERIC (19) = (SELECT NUMERIC_PRECISION FROM information_schema.COLUMNS WHERE TABLE_NAME = 'adpoliza' and COLUMN_NAME = 'cpoliza'),
            @lencnpoliza  NVARCHAR (14) = 14,
            @lencrecibo NUMERIC (19) = (SELECT NUMERIC_PRECISION FROM information_schema.COLUMNS WHERE TABLE_NAME = 'adrecibos' and COLUMN_NAME = 'crecibo'),
            @lencproces NUMERIC (13) = (SELECT NUMERIC_PRECISION FROM information_schema.COLUMNS WHERE TABLE_NAME = 'adrecibos' and COLUMN_NAME = 'cproces'),
            @q_recibo numeric(16), @q_proces numeric(16), @q_poliza numeric(16), @q_pol_type numeric(16), @q_crecibo numeric(16);

        -- 1. Obtener valores incrementados de macontadores
        UPDATE macontadores WITH (UPDLOCK)
        SET @q_recibo = qcontador = qcontador + 1 WHERE ccontador = 'RECIBO';

        UPDATE macontadores WITH (UPDLOCK)
        SET @q_proces = qcontador = qcontador + 1 WHERE ccontador = 'cproces';

        UPDATE macontadores WITH (UPDLOCK)
        SET @q_poliza = qcontador = qcontador + 1 WHERE ccontador = 'cpoliza';

        UPDATE macontadores WITH (UPDLOCK)
        SET @q_pol_type = qcontador = qcontador + 1 WHERE ccontador = @pol_type;

        UPDATE macontadores WITH (UPDLOCK)
        SET @q_crecibo = qcontador = qcontador + 1 WHERE ccontador = 'CRECIBO';

        -- 2. Consultar máximos reales de las tablas para autocuración
        DECLARE @max_poliza NUMERIC(16), @max_crecibo NUMERIC(16), @max_proces NUMERIC(16), @max_recibo_friendly NUMERIC(16), @max_pol_type NUMERIC(16);

        SELECT @max_poliza = MAX(cpoliza % 1000000000) FROM adpoliza WHERE cpoliza >= 1000000000000000000 AND cramo IN (4, 9, 18, 27);
        SELECT @max_crecibo = MAX(crecibo % 1000000000) FROM adrecibos WHERE crecibo >= 1000000000000000000 AND cramo IN (4, 9, 18, 27);
        SELECT @max_proces = MAX(cproces % 100000000) FROM adpoliza WHERE cproces >= 100000000000 AND cramo IN (4, 9, 18, 27);

        SELECT @max_recibo_friendly = MAX(TRY_CAST(RIGHT(TRIM(cnrecibo), 9) AS NUMERIC(18,0)))
        FROM adrecibos
        WHERE cnrecibo LIKE '%-%' AND crecibo >= 1000000000000000000 AND cramo = @ramo;

        IF @pol_type = 'POL_VEH'
        BEGIN
            SELECT @max_pol_type = MAX(TRY_CAST(RIGHT(TRIM(cnpoliza), 6) AS NUMERIC(18,0)))
            FROM adpoliza
            WHERE cnpoliza LIKE '%-%-%' AND cpoliza >= 1000000000000000000 AND cramo = @ramo;
        END
        ELSE IF @pol_type IN ('POL_ACC', 'POL_FUN', 'POL_SALUD', 'POL_VIDA')
        BEGIN
            -- Personas: los flujos de Sis2000 (spContador_v1) arman el cnpoliza con qcontador + 1 sin dejarlo en el
            -- contador, así que el contador queda uno atrás del último número entregado. Tomar el mayor número ya
            -- usado en el ramo, en pólizas emitidas y en solicitudes de pre-emisión (aún sin adpoliza).
            -- Formato de ambos contadores: <ramo>-<sucursal>-<sucursal><ceros><contador> de @lencnpoliza caracteres,
            -- p. ej. 5-1-1000000915. Otras series del ramo (p. ej. 7-1-100016108, 13 caracteres) no usan este contador.
            SELECT @max_pol_type = MAX(n.numero)
            FROM (
                SELECT RTRIM(cnpoliza) AS cn FROM adpoliza
                WHERE cramo = @ramo AND cnpoliza LIKE CAST(@ramo AS VARCHAR(5)) + '-%-%'
                UNION ALL
                SELECT RTRIM(cnpoliza) FROM TMEMISION_PERSONAS_GENERAL
                WHERE cramo = @ramo AND cnpoliza LIKE CAST(@ramo AS VARCHAR(5)) + '-%-%'
            ) p
            CROSS APPLY (SELECT CHARINDEX('-', p.cn) AS d1) a
            CROSS APPLY (SELECT CHARINDEX('-', p.cn, a.d1 + 1) AS d2) b
            CROSS APPLY (SELECT SUBSTRING(p.cn, a.d1 + 1, b.d2 - a.d1 - 1) AS sucur, SUBSTRING(p.cn, b.d2 + 1, 30) AS resto) s
            CROSS APPLY (SELECT TRY_CAST(CASE WHEN LEN(s.sucur) > 0 AND LEFT(s.resto, LEN(s.sucur)) = s.sucur
                                              THEN STUFF(s.resto, 1, LEN(s.sucur), '') END AS NUMERIC(18,0)) AS numero) n
            -- Ventana de 1000 sobre el contador: cubre el desfase de spContador_v1 y las solicitudes pendientes sin que un
            -- número aislado fuera de serie (p. ej. 7-1-1000008907 en QA) haga saltar todo el contador.
            WHERE LEN(p.cn) = @lencnpoliza AND n.numero <= @q_pol_type + 1000;
        END

        -- 3. Si el máximo de la tabla es mayor o igual que el valor obtenido, curar y usar el máximo + 1
        IF @max_poliza IS NOT NULL AND @max_poliza >= @q_poliza
        BEGIN
            SET @q_poliza = @max_poliza + 1;
            UPDATE macontadores SET qcontador = @q_poliza WHERE ccontador = 'cpoliza';
        END

        IF @max_crecibo IS NOT NULL AND @max_crecibo >= @q_crecibo
        BEGIN
            SET @q_crecibo = @max_crecibo + 1;
            UPDATE macontadores SET qcontador = @q_crecibo WHERE ccontador = 'CRECIBO';
        END

        IF @max_proces IS NOT NULL AND @max_proces >= @q_proces
        BEGIN
            SET @q_proces = @max_proces + 1;
            UPDATE macontadores SET qcontador = @q_proces WHERE ccontador = 'cproces';
        END

        IF @max_recibo_friendly IS NOT NULL AND @max_recibo_friendly >= @q_recibo
        BEGIN
            SET @q_recibo = @max_recibo_friendly + 1;
            UPDATE macontadores SET qcontador = @q_recibo WHERE ccontador = 'RECIBO';
        END

        IF @max_pol_type IS NOT NULL AND @max_pol_type >= @q_pol_type
        BEGIN
            SET @q_pol_type = @max_pol_type + 1;
            UPDATE macontadores SET qcontador = @q_pol_type WHERE ccontador = @pol_type;
        END

        -- 4. Construir salidas
        -- cnrecibo
        SET @cnrecibo = CAST(@ramo AS NVARCHAR) + '-' + CAST(@csucur AS NVARCHAR) + CAST(@q_recibo AS NVARCHAR);

        -- cproces
        -- [cproces-unico 13-nov-2026] La emisión de Auto de Sis2000 escritorio (cprog 'Emi_Auto') graba solicitudes en
        -- sopoliza con un cproces que no deja en macontadores; el contador luego entrega ese mismo número y la emisión
        -- falla con "Violation of PRIMARY KEY constraint 'sopoliza_pk'" (QA .80: 202600309795, Condominio).
        -- Si el número ya existe en sopoliza (PK por cproces), se salta al siguiente y el contador queda ahí.
        DECLARE @cp_saltos INT = 0, @cp_msg NVARCHAR(400);
        WHILE 1 = 1
        BEGIN
            SET @cproces = CONCAT(YEAR(@fdesde), REPLICATE('0',
                CASE
                    WHEN (12 - LEN(YEAR(@fdesde)) - LEN(CONVERT(VARCHAR, @q_proces))) > 0
                    THEN 12 - LEN(YEAR(@fdesde)) - LEN(CONVERT(VARCHAR, @q_proces))
                    ELSE 0
                END
            ) ,@q_proces);

            IF NOT EXISTS (SELECT 1 FROM sopoliza WHERE cproces = @cproces)
                BREAK;

            SET @cp_saltos += 1;
            IF @cp_saltos >= 1000
            BEGIN
                SET @cp_msg = CONCAT(N'CONTADOR_SIN_NUMERO_LIBRE: cproces no encontró un número libre en 1000 intentos (último ', @cproces, N').');
                THROW 99151, @cp_msg, 1;
            END;
            SET @q_proces += 1;
        END;

        IF @cp_saltos > 0
            UPDATE macontadores SET qcontador = @q_proces WHERE ccontador = 'cproces' AND qcontador < @q_proces;

        -- cpoliza
        SET @cpoliza = CONCAT(CAST(@ramo AS NVARCHAR), REPLICATE('0',
            CASE
                WHEN (@lencpoliza - LEN(@ramo) - LEN(CONVERT(VARCHAR, @q_poliza))) > 0
                THEN @lencpoliza - LEN(@ramo) - LEN(CONVERT(VARCHAR, @q_poliza))
                ELSE 0
            END
        ) ,@q_poliza);

        -- cnpoliza
        -- [cnpoliza-unico 09-nov-2026] El número no puede existir ya en una póliza emitida (adpoliza) ni en una
        -- pre-emisión pendiente de Nexus (TMEMISION_PERSONAS_GENERAL, TMEMISION_CONDOMINIO_NEXUS). Si existe, se salta
        -- al siguiente y el contador queda en el número entregado. adpoliza.cnpoliza tiene índice (adpolizaI2).
        DECLARE @cn_saltos INT = 0, @cn_chk VARCHAR(30), @cn_msg NVARCHAR(400);
        WHILE 1 = 1
        BEGIN
            SET @cnpoliza = CONCAT(CAST(@ramo AS NVARCHAR) + '-' +
                CAST(@csucur AS NVARCHAR) + '-' +
                CAST(@csucur AS NVARCHAR) +
                REPLICATE('0',
                CASE
                    WHEN (@lencnpoliza - LEN(@ramo)- len('-') - LEN(@csucur) - len('-') - LEN(@csucur) -LEN(CONVERT(VARCHAR, @q_pol_type))) > 0
                    THEN @lencnpoliza -LEN(@ramo)- len('-') - LEN(@csucur)  -len('-') - LEN(@csucur) -LEN(CONVERT(VARCHAR, @q_pol_type))
                    ELSE 0
                END
                ) ,@q_pol_type);
            SET @cn_chk = @cnpoliza;

            IF NOT EXISTS (SELECT 1 FROM adpoliza WHERE cnpoliza = @cn_chk)
               AND NOT EXISTS (SELECT 1 FROM TMEMISION_PERSONAS_GENERAL WHERE cnpoliza = @cn_chk)
               AND NOT EXISTS (SELECT 1 FROM TMEMISION_CONDOMINIO_NEXUS WHERE cnpoliza = @cn_chk)
                BREAK;

            SET @cn_saltos += 1;
            IF @cn_saltos >= 1000
            BEGIN
                SET @cn_msg = CONCAT(N'CONTADOR_SIN_NUMERO_LIBRE: ', @pol_type, N' no encontró un número de póliza libre en 1000 intentos (último ', @cnpoliza, N').');
                THROW 99150, @cn_msg, 1;
            END;
            SET @q_pol_type += 1;
        END;

        IF @cn_saltos > 0
            UPDATE macontadores SET qcontador = @q_pol_type WHERE ccontador = @pol_type AND qcontador < @q_pol_type;

        -- crecibo
        SET @crecibo = CONCAT(CAST(@ramo AS NVARCHAR), REPLICATE('0',
            CASE
                WHEN (@lencrecibo - LEN(@ramo) - LEN(CONVERT(VARCHAR, @q_crecibo))) > 0
                THEN @lencrecibo - LEN(@ramo) - LEN(CONVERT(VARCHAR, @q_crecibo))
                ELSE 0
            END
        ) ,@q_crecibo);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- ===== 11_sp_genera_coberturas_recibos_auto_rcv_nexus.sql =====
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
-- REVERSA: definición de PROD .67 al 20-nov-2026
-- =============================================================================
-- sp_genera_coberturas_recibos_auto_rcv_nexus · PRODUCCIÓN · R-091262 pase del cotizador de automóvil
-- Base: definición viva de PRODUCCIÓN (Sis2000) exportada el 17/11/2026 (modify_date 2026-10-26 21:48:47).
-- Cambios: solo los bloques del cotizador: [cotizacion 02-nov-2026] y [ccerti 05-nov-2026] (primas de sopoltar y validación contra lo cotizado).
-- Fuera de esos bloques el código es el de producción. Detalle: docs/pase-cotizador-2026-11/diferencias.md
-- Volver atrás: aplicar el respaldo tomado antes del pase (ver R20261118__pase_cotizador_orden.md).
-- =============================================================================
-- sp_genera_coberturas_recibos_auto_rcv_nexus (version QA)
-- RCV obligatoria completa en la cuota inicial: con frecuencia distinta a la anual, Daños a personas
-- (ccoberturaint 15) y Daños a cosas (17) van completas en el recibo 1 y no se generan en los recibos 2..n.
-- El resto de coberturas se divide entre las cuotas como antes. Comision y totales del recibo siguen a las
-- lineas (SUM de adpolcob). Base: definicion vigente en sis2000_qa. Se aplica con CREATE OR ALTER.
CREATE OR ALTER PROCEDURE [dbo].[sp_genera_coberturas_recibos_auto_rcv_nexus]
	@cpoliza NUMERIC(19), 
	@ccerti INT,
	@idInma int,
	@ifuente CHAR(10), 
	@cprog CHAR(20),
	@ccategoria_uso INT,
    @iplaca CHAR(1),
	@npuestos INT,
	@ntoneladas INT = 0,
    @precargorcv NUMERIC(18, 2) = 0,
    @cmoneda char(4) = NULL,
    @msumaaseg NUMERIC(18, 2),
    @mprima NUMERIC(18, 2) = NULL,
    @ptasamon NUMERIC(13, 6) = NULL,
    @ptasamon_pago NUMERIC(13, 6) = NULL,
    @coberAdicional VARCHAR(2) = 'RC',
    @tasaPt NUMERIC(18, 2) = 0,
    @tasaCa NUMERIC(18, 2) = 0,
    @tasaPp NUMERIC(18, 2) = 0,
    @cusuario INT = 7,
    @cproces_in NUMERIC(18, 0) = NULL,
    -- ccoberturaint que se cobran completas en la cuota inicial cuando la frecuencia no es anual
    -- (15 = Daños a personas, 17 = Daños a cosas; mismo ccoberturaint en ramos 18 y 26).
    @coberturas_cuota_inicial VARCHAR(100) = '15,17',
    -- [cotizacion 02-nov-2026] Cotización del cotizador de SysIP (sopoliza.cproces). Con valor, las coberturas, sumas y primas
    -- anuales salen de sopoltar tal como se cotizaron (en USD, con el recargo/descuento ya aplicado) y no se
    -- recalcula con sp_calculo_auto_nexus. NULL = comportamiento de siempre.
    @cproces_cotizacion NUMERIC(13, 0) = NULL,
    -- [ccerti 05-nov-2026] Opción de la cotización (sopoltar.ccerti) que se emite. NULL = 1.
    @ccerti_cotizacion INT = NULL
	
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;
	DECLARE @harden_msg NVARCHAR(500);

	DECLARE
	@cnpoliza VARCHAR(20), @cproces NUMERIC(18, 0), @crecibo NUMERIC(18, 0), @cnrecibo VARCHAR(20), @cnrecibo_rel VARCHAR(20),
	@qcontador INT, @fdesde_pol DATE, @fhasta_pol DATE, @fdesde_rec DATE, @fhasta_rec DATE, @forigen DATE,
	@femision DATE, @fcobro DATE,
	@cuotas INT, @nrecibo INT, @ncuo INT, @cramo INT, @cplan VARCHAR(50), @mprimaext NUMERIC(18, 6),
	@msumaasegext NUMERIC(18, 2), @cramoint INT, 
	@fano INT, @FMES INT, @pcomision NUMERIC(8, 6), @mcomision NUMERIC(18, 6), @mcomisionext NUMERIC(18, 6), @casegurado NUMERIC(11, 0),
	@ctenedor NUMERIC(11, 0), @cbeneficiario NUMERIC(11, 0), @cproductor NUMERIC(11, 0), @itipopol CHAR(1),
	@ifrecuencia CHAR(1), @csucur INT, @cerror INT, @ccanalalt INT, @cscanalalt INT, @ctipocanal CHAR(1),
	@tipoV int, @uso int, @puestos int, @tasa_cambio NUMERIC(18,6),
	@cmarca VARCHAR(4), @cmodelo VARCHAR(4), @cversion VARCHAR(3), @cano INT, @cgestor VARCHAR(30), @ccategoria SMALLINT,
	@itipoprod VARCHAR(10);

	IF @cproces_in IS NOT NULL AND EXISTS(SELECT 1 FROM adpoliza WHERE cproces = @cproces_in)
	BEGIN
		SELECT TOP 1
			@cnpoliza = cnpoliza, @cproces = cproces, @fdesde_pol = fdesde, @fhasta_pol = fhasta, 
			@ifrecuencia = ifrecuencia, @cramo = cramo, @cplan = cplan, @cproductor = cproductor, @cmoneda = cmoneda,
			@fano = fanopol, @fmes = fmespol, @itipopol = itipopol, @csucur = csucur, @ptasamon = ptasamon,
			@ifuente = ifuente, @cprog = cprog, @ccanalalt = ccanalalt, @cscanalalt = cscanalalt, @ctipocanal = ctipocanal,
			@casegurado = casegurado, @ctenedor = ctenedor, @cbeneficiario = ISNULL(cbeneficiario, casegurado),
			@cusuario = COALESCE(@cusuario, cusuario), @femision = forigen, @cgestor = cgestor, @ccategoria = ccategoria,
			@itipoprod = ISNULL(itipoprod, 'NU'), @cgestor = cgestor
		FROM adpoliza 
		WHERE cproces = @cproces_in;
	END
	ELSE
	BEGIN
		SELECT TOP 1
			@cnpoliza = cnpoliza, @cproces = cproces, @fdesde_pol = fdesde, @fhasta_pol = fhasta, 
			@ifrecuencia = ifrecuencia, @cramo = cramo, @cplan = cplan, @cproductor = cproductor, @cmoneda = cmoneda,
			@fano = fanopol, @fmes = fmespol, @itipopol = itipopol, @csucur = csucur, @ptasamon = ptasamon,
			@ifuente = ifuente, @cprog = cprog, @ccanalalt = ccanalalt, @cscanalalt = cscanalalt, @ctipocanal = ctipocanal,
			@casegurado = casegurado, @ctenedor = ctenedor, @cbeneficiario = ISNULL(cbeneficiario, casegurado),
			@cusuario = COALESCE(@cusuario, cusuario), @femision = forigen, @cgestor = cgestor, @ccategoria = ccategoria,
			@itipoprod = ISNULL(itipoprod, 'NU'), @cgestor = cgestor
		FROM adpoliza 
		WHERE cpoliza = @cpoliza
		ORDER BY fanopol DESC, fmespol DESC;
	END;

	SET @cplan = NULLIF(RTRIM(@cplan), '');

	IF @cnpoliza IS NULL OR NULLIF(RTRIM(@cnpoliza), '') IS NULL
		THROW 99101, 'sp_genera_coberturas: no se encontró la póliza en adpoliza (cpoliza/cproces inválido).', 1;

	IF @cramo IS NULL OR NULLIF(RTRIM(@cplan), '') IS NULL
		THROW 99102, 'sp_genera_coberturas: cramo/cplan ausentes en adpoliza; no se puede tarifar.', 1;


    -- Determinar tasa de cambio real de USD a BS para conversiones
    IF @ptasamon_pago IS NOT NULL AND @ptasamon_pago > 1.0
    BEGIN
        SET @tasa_cambio = @ptasamon_pago;
    END
    ELSE IF @ptasamon IS NOT NULL AND @ptasamon > 1.0
    BEGIN
        SET @tasa_cambio = @ptasamon;
    END
    ELSE
    BEGIN
        SELECT TOP 1 @tasa_cambio = ptasamon
        FROM mamonedas 
        WHERE cmoneda = '$' AND iestado = 'V';


        IF @tasa_cambio IS NULL OR @tasa_cambio <= 0
            SET @tasa_cambio = 1.0;
    END;

    IF @ptasamon IS NULL OR @ptasamon <= 1.0
        SET @ptasamon = @tasa_cambio;

    IF @ptasamon_pago IS NULL OR @ptasamon_pago <= 1.0
        SET @ptasamon_pago = @tasa_cambio;

    IF (@coberAdicional IS NULL OR TRIM(@coberAdicional) = '')
        SET @coberAdicional = 'RC';

    IF (@iplaca IS NULL OR TRIM(@iplaca) = '')
        SET @iplaca = 'N';

    -- Auto-detección de coberturas adicionales si se reciben tasas de casco

    IF (@tasaCa > 0 OR @tasaPt > 0) AND (@coberAdicional = 'RC')
    BEGIN
        IF @tasaCa > 0 SET @coberAdicional = 'CA';
        ELSE IF @tasaPt > 0 SET @coberAdicional = 'PT';
    END;


    -- BUSQUEDA DEL VEHICULO ASOCIADO A LA POLIZA
    SELECT TOP 1
        @cmarca = TRIM(cmarca), @cmodelo = TRIM(cmodelo), @cversion = TRIM(cversion), 
        @cano = cano, @tipoV = ctipo, @uso = cuso, @puestos = qpuestos
    FROM vhcerti 
    WHERE cpoliza = @cpoliza
    ORDER BY fanopol DESC;

	IF @cmarca IS NULL OR @cmodelo IS NULL OR @cversion IS NULL OR @cano IS NULL
		THROW 99103, 'sp_genera_coberturas: no se encontró vehículo en vhcerti para la póliza; no se puede cotizar.', 1;

    -- Recuperación automática de @msumaaseg si viene nula o en 0
    IF (@msumaaseg IS NULL OR @msumaaseg <= 0)
    BEGIN
        SELECT TOP 1 @msumaaseg = mvalor
        FROM vhcerti
        WHERE cpoliza = @cpoliza AND mvalor > 0
        ORDER BY fanopol DESC;

        IF (@msumaaseg IS NULL OR @msumaaseg <= 0)
        BEGIN
            SELECT TOP 1 @msumaaseg = msumabruta 
            FROM adrecibos 
            WHERE cpoliza = @cpoliza AND msumabruta > 0
            ORDER BY fanopol DESC, fmespol DESC;
        END;
    END;



	IF @mprima IS NOT NULL AND @mprima > 0 BEGIN 
		SELECT @mprimaext = ROUND(@mprima / @tasa_cambio, 2)
	END 

	IF @msumaaseg IS NOT NULL AND @msumaaseg > 0 BEGIN 
		SELECT @msumaasegext = ROUND(@msumaaseg / @tasa_cambio, 2)
	END 

	-- TABLA TEMPORAL PARA MONTOS DE COBERTURAS (esquema alineado a sp_calculo_auto_nexus)
    CREATE TABLE #montos (
        cplan VARCHAR(50) COLLATE DATABASE_DEFAULT,
        xplan VARCHAR(255) COLLATE DATABASE_DEFAULT,
        ccobertura VARCHAR(50) COLLATE DATABASE_DEFAULT,
        xdescripcion_l VARCHAR(255) COLLATE DATABASE_DEFAULT,
        cproducto VARCHAR(50) COLLATE DATABASE_DEFAULT,
        cmoneda VARCHAR(10) COLLATE DATABASE_DEFAULT,
        nubii INT,
        tasaCA DECIMAL(18,2),
        tasaPT DECIMAL(18,2),
        tasaPP DECIMAL(18,2),
        primaBlCA DECIMAL(18,2),
        primaBLPT DECIMAL(18,2),
        primaAdCA DECIMAL(18,2),
        primaAdPT DECIMAL(18,2),
        primaAdPP DECIMAL(18,2),
        prima DECIMAL(18,3),
        masegurada DECIMAL(18,2),
        ctarifa VARCHAR(50) COLLATE DATABASE_DEFAULT,
        cramoint VARCHAR(50) COLLATE DATABASE_DEFAULT,
        ccoberturaint VARCHAR(50) COLLATE DATABASE_DEFAULT,
        xcobertura NVARCHAR(30) COLLATE DATABASE_DEFAULT,
        xvalor NVARCHAR(2) COLLATE DATABASE_DEFAULT,
        badicional bit
    );

    -- Cotizar SIEMPRE prima ANUAL con sp_calculo_auto_nexus.
    -- Ese SP fracciona si recibe M/T/S/C; aquí luego se divide por @cuotas al armar recibos.
    -- Pasar la ifrecuencia de la póliza provocaba doble fraccionamiento (prima/cuotas/cuotas).
    DECLARE @ifrecuencia_cotiza CHAR(1);
    DECLARE @sumaAsegAd_calc NUMERIC(18,2);
    DECLARE @recargo_calc NUMERIC(18);
    DECLARE @incluirTotales_calc BIT;
    DECLARE @cusuario_calc INT;

    SET @ifrecuencia_cotiza = 'A';
    SET @sumaAsegAd_calc = 0;
    SET @recargo_calc = 0;
    SET @incluirTotales_calc = 0;
    SET @cusuario_calc = 1422;
	
    -- [cotizacion 02-nov-2026] Valores congelados de la cotización: misma forma que la salida de sp_calculo_auto_nexus
    -- (prima y masegurada en USD, anuales); el fraccionamiento lo hace el ciclo de recibos.
    SET @ccerti_cotizacion = ISNULL(@ccerti_cotizacion, 1);   -- [ccerti 05-nov-2026]

    IF @cproces_cotizacion IS NOT NULL
    BEGIN
        INSERT INTO #montos (cplan, ccobertura, prima, masegurada, ctarifa, cramoint, ccoberturaint, badicional)
        SELECT @cplan, TRIM(t.ccober), ISNULL(t.mprimaext, 0), ISNULL(t.msumaasegext, 0), TRIM(t.ctarifa),
               CONVERT(VARCHAR(50), t.cramoint), TRIM(CONVERT(VARCHAR(50), t.ccoberturaint)), 0
        FROM sopoltar t
        WHERE t.cproces = @cproces_cotizacion AND t.ccerti = @ccerti_cotizacion;   -- [ccerti 05-nov-2026]
    END
    ELSE
    BEGIN
    -- INVOCACIÓN AL PROCEDIMIENTO DE CÁLCULO DE TARIFAS DE VEHÍCULO
    BEGIN TRY
        INSERT INTO #montos
        EXEC sp_calculo_auto_nexus
            @cmarca = @cmarca,
            @cmodelo = @cmodelo,
            @cversion = @cversion,
            @cano = @cano,
            @cplan = @cplan,
            @sumaAseg = @msumaaseg,
            @sumaAsegBl = @msumaaseg,
            @sumaAsegAd = @sumaAsegAd_calc,
            @iplaca = @iplaca,
            @fdesde = @fdesde_pol, 
            @fhasta = @fhasta_pol,
            @tasaPt = @tasaPt,
            @tasaCa = @tasaCa, 
            @tasaPp = @tasaPp,
            @recargo = @recargo_calc, 
            @tipoV = @tipoV,
            @uso = @uso,
            @puestos = @puestos,
            @toneladas = @ntoneladas,
            @recargoRcv = @precargorcv,
            @cramo = @cramo,
            @cusuario = @cusuario_calc,
            @coberAdicional = @coberAdicional,
            @incluirTotales = @incluirTotales_calc,
            @ifrecuencia = @ifrecuencia_cotiza;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH;
    END;

    IF NOT EXISTS (SELECT 1 FROM #montos)
        THROW 99001, 'sp_calculo_auto_nexus no retornó coberturas para el plan/vehículo.', 1;

    IF NOT EXISTS (SELECT 1 FROM #montos WHERE ISNULL(prima, 0) > 0)
        THROW 99104, 'sp_calculo_auto_nexus retornó coberturas pero todas con prima 0. Revise maplantar/tarifas del plan.', 1;



	IF (TRIM(@ifrecuencia) = 'M') SELECT @cuotas = 12;
	ELSE IF (TRIM(@ifrecuencia) = 'T') SELECT @cuotas = 4;
	ELSE IF (TRIM(@ifrecuencia) = 'C') SELECT @cuotas = 3;
	ELSE IF (TRIM(@ifrecuencia) = 'S') SELECT @cuotas = 2;
	ELSE SELECT @cuotas = 1;

	IF (@cuotas IS NULL OR @cuotas <= 0) SET @cuotas = 1;


	-- RCV OBLIGATORIA COMPLETA EN LA CUOTA INICIAL
	-- Con frecuencia distinta a la anual, las coberturas de @coberturas_cuota_inicial van completas en el
	-- recibo 1 y no se generan en los recibos 2..n; el resto se divide entre las cuotas como siempre.
	-- Totales del recibo (adrecibos) y comision salen de SUM(adpolcob), asi que siguen a las lineas.
	DECLARE @cob_cuota_inicial TABLE (cint VARCHAR(10) PRIMARY KEY);
	INSERT INTO @cob_cuota_inicial (cint)
	SELECT DISTINCT LTRIM(RTRIM(value)) FROM STRING_SPLIT(ISNULL(@coberturas_cuota_inicial, ''), ',')
	WHERE LTRIM(RTRIM(value)) <> '';

	-- Si el plan solo tiene coberturas de cuota inicial (nada que fraccionar), se emite en una sola cuota.
	IF @cuotas > 1 AND NOT EXISTS (
		SELECT 1
		FROM maplantar A
		INNER JOIN macoberturas E ON E.ccobertura = A.ccober AND E.cramo = A.cramo
		INNER JOIN #montos M ON TRIM(M.ccobertura) = TRIM(A.ccober)
		WHERE A.cramo = @cramo AND TRIM(A.cplan) = TRIM(@cplan)
		  AND ISNULL(M.prima, 0) > 0
		  AND LTRIM(RTRIM(E.ccoberturaint)) NOT IN (SELECT cint FROM @cob_cuota_inicial)
	)
		SET @cuotas = 1;

	-- CÁLCULO DE FECHAS SEGÚN FRECUENCIA Y CANT. CUOTAS
	-- Vigencia corta (binacional diario/ndias): el recibo hereda fhasta de la póliza.
	SELECT @FDESDE_REC = @FDESDE_POL;
	IF @cuotas = 1
	   AND @FHASTA_POL IS NOT NULL
	   AND DATEDIFF(DAY, @FDESDE_POL, @FHASTA_POL) > 0
	   AND DATEDIFF(DAY, @FDESDE_POL, @FHASTA_POL) < 360
		SELECT @FHASTA_REC = @FHASTA_POL;
	ELSE
		SELECT @FHASTA_REC = CONVERT(DATE, DATEADD(MM, 12 / @cuotas, @FDESDE_POL));

	SELECT @nrecibo = 1, @ncuo = 1;
    DECLARE @iprimaexterna INT = 0;

	WHILE (@nrecibo <= @cuotas) BEGIN
		SELECT @nrecibo = @nrecibo + 1;

		EXEC dbo.adB_calcula_num_contad_nexus @cramo, @itipopol, @csucur, 0, 7, @cnrecibo OUTPUT, @crecibo OUTPUT, @CERROR OUTPUT;

		IF NOT EXISTS (SELECT 1 FROM maplantar WHERE cramo = @cramo AND TRIM(cplan) = TRIM(@cplan))
		BEGIN
			SET @harden_msg = N'sp_genera_coberturas: no hay tarifas en maplantar para cramo='
				+ CONVERT(NVARCHAR(10), @cramo) + N' cplan=' + ISNULL(@cplan, N'(null)');
			THROW 99105, @harden_msg, 1;
		END;

		-- Pre-check catálogo: evitar emitir con 0 coberturas por JOINs rotos (ej. maarancel faltante)
		IF NOT EXISTS (
			SELECT 1
			FROM maplantar A
			INNER JOIN maarancel B ON A.ccober = B.ccober AND A.cramo = B.cramo
			INNER JOIN matarifa C ON A.ccober = C.ccober AND A.cramo = C.cramo AND A.ctarifa = C.ctarifa
			INNER JOIN macoberturas E ON E.ccobertura = C.ccober AND E.cramo = C.cramo
			INNER JOIN #montos M ON TRIM(M.ccobertura) = TRIM(A.ccober)
			WHERE A.cramo = @cramo
			  AND TRIM(A.cplan) = TRIM(@cplan)
			  AND B.iestado = 'V'
			  AND ISNULL(M.prima, 0) > 0
		)
		BEGIN
			SET @harden_msg = N'sp_genera_coberturas: el JOIN maplantar/maarancel/matarifa/macoberturas/#montos no produjo coberturas con prima>0 (cramo='
				+ CONVERT(NVARCHAR(10), @cramo) + N' cplan=' + ISNULL(@cplan, N'(null)')
				+ N'). Verifique maarancel vigente para las coberturas del plan.';
			THROW 99106, @harden_msg, 1;
		END;

				INSERT INTO adpoltar
				(
					crecibo, ccober, ctarifa, u_version, cramo,  cpoliza,  fanopol,  fmespol,  ccerti,  ccoberimp,  ietiqtarimp,  qordenimp,
					cnpoliza, cnrecibo, cproces, csucur, cmoneda, ptasamon,  itipoprod,  fdesde,  fhasta,  itiporiesg,  priesg,  
					bfraded,  mdedu_fran,  mdedu_franext,  pdedu_fran, istattar,  isuma,  cramoint,  ccoberturaint,  ctarifaint,
					cprog, ifuente, bok,  cerror,  fingreso,  cusuario,  ccategoria,  cusuarioauto,  ccategoriaauto,  fultmod,  cusuariomod,
					ccategoriamod,
					msumabruta, msumabrutaext, 
					msumaaseg, msumaasegext, 
					mprima,  mprimaext,  
					pprima,  
					pdescuento, mdescuento,  mdescuentoext, 
					precargo, mrecargo,  mrecargoext,  
					mprimabruta,  mprimabrutaext,   
					bprimarea, mprimareas, mprimareasext, 
					pcomision, mcomision, mcomisionext
				)
				SELECT 
					@crecibo, c.ccober, c.ctarifa, '!', @cramo, @cpoliza, @fano, @fmes, 0, c.ccoberimp, c.ietiqtarimp, c.qordenimp,
					@cnpoliza, @cnrecibo, @cproces, @csucur, @cmoneda, @ptasamon, @itipoprod, @FDESDE_REC, @FHASTA_REC, 'N', 0, 
					fd.bfraded, fd.mdedu_fran, fd.mdedu_franext, fd.pdedu_fran, 'V', e.isuma, e.cramoint, e.ccoberturaint, c.ctarifaint,
					@cprog, @ifuente, 0, 0, GETDATE(), @cusuario, @ccategoria, null, null, null, null, null,
					COALESCE(m.masegurada * @tasa_cambio, 0) as msumabruta, COALESCE(m.masegurada  , 0) as msumabrutaext,
					COALESCE(m.masegurada * @tasa_cambio, 0) as msumaaseg, COALESCE(m.masegurada  , 0) as msumaasegext,
					COALESCE(m.prima * @tasa_cambio / dv.divisor, 0) as mprima,
					COALESCE(m.prima / dv.divisor, 0) as mprimaext,
					fd.pprima,
					0, 0, 0, 0, 0, 0,
					COALESCE(((m.prima * @tasa_cambio)) / dv.divisor, 0) as mprimabruta,
					COALESCE(((m.prima)) / dv.divisor, 0) as mprimabrutaext,
					C.bprimarea, 
					COALESCE(((m.prima * @tasa_cambio)) / dv.divisor, 0) as mprimareas,
					COALESCE(((m.prima)) / dv.divisor, 0) as mprimareasext,

					CASE WHEN @cproductor = 80080 THEN 0.0 ELSE B.pcomision END,
					CASE WHEN @cproductor = 80080 THEN 0.0 ELSE ((m.prima * @tasa_cambio)) / dv.divisor * B.pcomision / 100 END as mcomision,
					CASE WHEN @cproductor = 80080 THEN 0.0 ELSE ((m.prima)) / dv.divisor * B.pcomision / 100 END as mcomisionext
					FROM maplantar A
					INNER JOIN maarancel B ON A.ccober = B.ccober and A.cramo = B.cramo
					INNER JOIN matarifa C ON A.ccober = C.ccober and A.cramo = C.cramo and A.ctarifa = C.ctarifa
					INNER JOIN macoberturas e ON e.ccobertura = c.ccober and e.cramo = c.cramo
					LEFT JOIN matarifa_d fd ON fd.ccober = c.ccober and fd.cramo = c.cramo and fd.ctarifa = c.ctarifa
					INNER JOIN #montos m ON TRIM(m.ccobertura) = TRIM(a.ccober)
					CROSS APPLY (
						SELECT CASE WHEN @cuotas > 1
						            AND LTRIM(RTRIM(e.ccoberturaint)) IN (SELECT cint FROM @cob_cuota_inicial)
						       THEN 1 ELSE 0 END AS cuota_inicial,
						       CASE WHEN @cuotas > 1
						            AND LTRIM(RTRIM(e.ccoberturaint)) IN (SELECT cint FROM @cob_cuota_inicial)
						       THEN 1 ELSE @cuotas END AS divisor
					) dv

					WHERE A.cramo=@cramo AND TRIM(A.cplan)=TRIM(@cplan) and B.iestado = 'V'
					  AND (dv.cuota_inicial = 0 OR @ncuo = 1);

					IF @@ROWCOUNT = 0
						THROW 99107, 'sp_genera_coberturas: INSERT adpoltar insertó 0 filas (JOIN de tarifas falló).', 1;

					INSERT INTO adpolcob 
					(
						crecibo, ccober, u_version, cramo, cpoliza, fanopol, fmespol, ccerti,  cnpoliza,  cnrecibo,  cproces,  csucur,  cmoneda,
						ptasamon, fdesde,  fhasta,  itipoprod,  msumaaseg,  msumaasegext,  mprimabruta,  mprimabrutaext,  pcomision,  mcomision,
						mcomisionext,  mprimareas,  mprimareasext,  iestado,  isuma,  ccontrea,  cramorea,  cramopcnd,   ccoberpcnd,   cramoint,
						ccoberturaint, cprog, ifuente, bok, cerror,  fingreso,  cusuario,  ccategoria,  cusuarioauto,  ccategoriaauto,  fultmod,
						cusuariomod, ccategoriamod
					)
					SELECT DISTINCT
						crecibo, ccober, a.u_version, a.cramo, cpoliza, fanopol, fmespol, ccerti,  cnpoliza,  cnrecibo,  cproces,  csucur,  a.cmoneda,
						ptasamon, fdesde,  fhasta,  itipoprod,  msumaaseg,  msumaasegext,  mprimabruta,  mprimabrutaext,  pcomision,  mcomision,
						mcomisionext,  mprimareas,  mprimareasext,  istattar,  c.isuma,  ccontrea,  cramorea,  cramopcnd,   ccoberpcnd,   c.cramoint,
						c.ccoberturaint, a.cprog, a.ifuente, a.bok, a.cerror,  GETDATE(),  a.cusuario,  a.ccategoria,  a.cusuarioauto,  a.ccategoriaauto,  a.fultmod,
						a.cusuariomod, a.ccategoriamod
					FROM adpoltar a
					INNER JOIN macoberturas C ON C.ccobertura = a.ccober and C.cramo = a.cramo
					WHERE crecibo = @crecibo;

					IF NOT EXISTS (SELECT 1 FROM adpolcob WHERE crecibo = @crecibo)
						THROW 99108, 'sp_genera_coberturas: INSERT adpolcob no generó coberturas para el recibo.', 1;

					SELECT @msumaaseg = MAX(msumaaseg) FROM adpolcob WHERE crecibo = @crecibo;
					SELECT @msumaasegext = MAX(msumaasegext) FROM adpolcob WHERE crecibo = @crecibo;

					SELECT @mprima = SUM(mprimabruta) FROM adpolcob WHERE crecibo = @crecibo;
					SELECT @mprimaext = SUM(mprimabrutaext) FROM adpolcob WHERE crecibo = @crecibo;

					SELECT @mcomision = SUM(mcomision) FROM adpolcob WHERE crecibo = @crecibo;
					SELECT @mcomisionext = SUM(mcomisionext) FROM adpolcob WHERE crecibo = @crecibo;

					IF ISNULL(@mprimaext, 0) <= 0
						THROW 99109, 'sp_genera_coberturas: prima externa (USD) resultante es 0; no se permite emitir recibo sin prima.', 1;

					IF ISNULL(@mprima, 0) <= 0
						THROW 99110, 'sp_genera_coberturas: prima bruta (Bs) resultante es 0; no se permite emitir recibo sin prima.', 1;
	
					INSERT INTO ADRECIBOS
					(crecibo, u_version,  cnpoliza, cnrecibo, cpoliza, fanopol, fmespol,  cramo, itipoprod, itiponegocio, itipopol,
					iestadoren,   cpoliza_mae,   ccerti_mae,   itiporec,  imodcobro, cdoccob, csucur, csucurrec,criesgo, ccerti,     cproces,
					cserie_rea, casegurado,   ctenedor,  cbeneficiario,  cacreedor, cfinanciera, cplan, cproductor, ctipoproductor,
					czonaprod, csupervisor, crecaudador, cregion,ccentserv,cmercado, cprofesion, cactividad, cgrupoecono, cempresa,
					cpais, cestado,cciudad,ccorregi,cbarriada,czonpos, cmoneda,ptasamon,ptasamon_pago, femision,fdesde,fhasta,fdesde_pol,fhasta_pol,
					itipoanul, nlote, iestcont, fcobro, iestadorec, ifinanciado,idevolucion, iformadevo,msumabruta, msumabrutaext,
					msumacoa, msumacoaext, msumaneta, msumanetaext, mprimabruta,mprimabrutaext,mprimacoa,mprimacoaext, pcoa,
					mprimaneta, mprimanetaext, pretcoa, pcomision, mcomision, mcomisionext,mcompart, mcompartext, mprimareas,
					mprimareasext,mprimareas_c, mprimareasext_c, mprimareas_n, mprimareasext_n, mpret, mpretext, mpcedida, mpcedidaext,
					mpfp,mpfpext,potrosrec,motrosrec,motrosrecext,potrosdes,motrosdes,motrosdesext,pgastos,mgastos,mgastosext,potrosgas,
					motrosgas, motrosgasext, mgemi, mgemiext, pgemi, mmontoneto, mmontonetoext, mimpuesto, pimpuesto, mimpuestoext,
					mmontorec, mmontorecext, mabono, mabonoext, mmontoapag, mmontoapagext, mprimadev, mprimadevext, mprimadif, mprimadifext,
					fpago, mpagado, mpagadoext, mpendiente, mpendientext, mpagcoa,mpagcoaext, pinteres, minteres, minteresext, bobsimp,
					iestadoimp, cforcob, czona_cobro, cbanco, cagenban, itipocta, itarjeta, qcuotas, cprog, ifuente, fingreso, cusuario,
					ifrecuencia, cnrecibo_rel, ccanalalt, cscanalalt, ctipocanal, cgestor)

					SELECT 
					@crecibo,       '!', @cnpoliza,   @cnrecibo, @cpoliza,  @fano,   @fmes, @cramo,      @itipoprod,   'DI',      'I',
					'N',                    0,            0,        'P',        'IN',        0,     1,  1,     3,      0, @cproces,
					0,     @casegurado,  @ctenedor,  @cbeneficiario,     0,           0,     @cplan, @CPRODUCTOR,     0,
					0,          0,           0,           0,           0,           0,           0,          0,         0,          0,
					0,    0,    0,    0,     0,       0, @cmoneda,@ptasamon, @ptasamon_pago,@femision, @FDESDE_REC, @FHASTA_REC, @FDESDE_POL, @FHASTA_POL,
					'N',          0,          'P',        NULL,     'P',          0, 'P',  'N', @msumaaseg,  @msumaasegext,
					0,          0,       @msumaaseg,    @msumaasegext,        @mprima,       @mprimaext,        0,        0,        0, 
					@mprima,       @mprimaext,       100,       @pcomision,     @mcomision,     @mcomisionext,  0,        0,        0, 
					0,             0,             0,            0,            0,            0,           0,           0,            0,
					0,         0,         0,         0,         0,         0,         0,        0,         0,       0,       0,     0,
					0,        0,           0,           0,          0,          0,           0,           0,           0,           0,
					@mprima,       @mprimaext, 0,      0,       @mprima,       @mprimaext,       0,       0,       0,          0,
					NULL,        0,       0,       0,       0,       0,       0,       0,       0,       0,       0,
					0,        0,        0,        0,        0,       'N',       'N',       @ncuo,@cprog,@ifuente, getdate(), @cusuario,
					@ifrecuencia, @cnrecibo_rel, @ccanalalt, @cscanalalt, @ctipocanal, @cgestor;

			-- Actualizar vhcerti con suma asegurada y montos

			UPDATE vhcerti 
			SET mvalor = ISNULL(NULLIF(@msumaaseg, 0), mvalor),
			    mtotpri = ISNULL(@mprimaext, mtotpri),
			    mtotcom = ISNULL(@mcomisionext, mtotcom)
			WHERE cpoliza = @cpoliza;

			IF OBJECT_ID('dbo.sp_genera_adpolrea_nexus') IS NOT NULL AND @crecibo IS NOT NULL
			    EXEC dbo.sp_genera_adpolrea_nexus @crecibo;


			SELECT @FDESDE_REC = @FHASTA_REC;
			SELECT @FHASTA_REC = CONVERT(DATE, DATEADD(MM, 12 / @cuotas, @FDESDE_REC));
			SELECT @ncuo = @ncuo + 1;
	END

	-- [cotizacion 02-nov-2026] Toda cobertura cotizada con prima debe estar en la póliza: si ya no está en el plan
	-- (maplantar/maarancel/matarifa vigentes), el JOIN la descarta. Se revisa una por una porque una cobertura
	-- pequeña cabe en la tolerancia de redondeo de la suma.
	IF @cproces_cotizacion IS NOT NULL
	BEGIN
		DECLARE @prima_cotizada NUMERIC(18, 2), @prima_emitida NUMERIC(18, 2), @cob_cotizadas INT, @cob_faltante VARCHAR(10);
		SELECT TOP 1 @cob_faltante = TRIM(s.ccober)
		FROM sopoltar s
		WHERE s.cproces = @cproces_cotizacion AND s.ccerti = @ccerti_cotizacion AND ISNULL(s.mprimaext, 0) > 0   -- [ccerti 05-nov-2026]
		  AND NOT EXISTS (SELECT 1 FROM adpoltar a WHERE a.cpoliza = @cpoliza AND TRIM(a.ccober) = TRIM(s.ccober));
		IF @cob_faltante IS NOT NULL
		BEGIN
			SET @harden_msg = CONCAT(N'COTIZACION_NO_COINCIDE: la cobertura ', @cob_faltante, N' de la cotización ya no está vigente en el plan ', @cplan, N'.');
			THROW 99130, @harden_msg, 1;
		END;

		-- Cada cuota redondea cada cobertura a 2 decimales: la suma puede moverse hasta 0,005 por cobertura y cuota.
		SELECT @prima_cotizada = ROUND(ISNULL(SUM(mprimaext), 0), 2), @cob_cotizadas = COUNT(*) FROM sopoltar WHERE cproces = @cproces_cotizacion AND ccerti = @ccerti_cotizacion;   -- [ccerti 05-nov-2026]
		SELECT @prima_emitida = ROUND(ISNULL(SUM(mprimaext), 0), 2) FROM adpoltar WHERE cpoliza = @cpoliza;
		IF ABS(@prima_cotizada - @prima_emitida) > 0.005 * @cuotas * @cob_cotizadas + 0.01
		BEGIN
			SET @harden_msg = CONCAT(N'COTIZACION_NO_COINCIDE: la prima emitida (', @prima_emitida,
				N' USD) no coincide con la cotizada (', @prima_cotizada, N' USD).');
			THROW 99130, @harden_msg, 1;
		END;

		-- El % de recargo/descuento queda en la póliza como referencia (la prima ya lo trae).
		UPDATE a SET precargo = s.precargo
		FROM adpoltar a
		INNER JOIN sopoltar s ON s.cproces = @cproces_cotizacion AND s.ccerti = @ccerti_cotizacion AND TRIM(s.ccober) = TRIM(a.ccober)   -- [ccerti 05-nov-2026]
		WHERE a.cpoliza = @cpoliza;
	END;

	-- Validación final: al menos un recibo con prima > 0
	IF NOT EXISTS (
		SELECT 1 FROM adrecibos
		WHERE cpoliza = @cpoliza
		  AND ISNULL(mprimabrutaext, 0) > 0
	)
		THROW 99111, 'sp_genera_coberturas: no quedó ningún recibo con prima > 0; emisión abortada.', 1;

	IF NOT EXISTS (SELECT 1 FROM adpolcob WHERE cpoliza = @cpoliza)
		THROW 99112, 'sp_genera_coberturas: no quedaron coberturas en adpolcob; emisión abortada.', 1;
END;
GO

-- ===== 12_sp_emision_automovil_rcv_nexus.sql =====
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
-- REVERSA: definición de PROD .67 al 20-nov-2026
-- =============================================================================
-- sp_emision_automovil_rcv_nexus · PRODUCCIÓN · R-091262 pase del cotizador de automóvil
-- Base: definición viva de PRODUCCIÓN (Sis2000) exportada el 17/11/2026 (modify_date 2026-10-30 14:03:55).
-- Cambios: solo los bloques del cotizador: [cotizacion 02-nov-2026] y [ccerti 05-nov-2026] (recibe y pasa @cproces_cotizacion y @ccerti_cotizacion).
-- Fuera de esos bloques el código es el de producción. Detalle: docs/pase-cotizador-2026-11/diferencias.md
-- Volver atrás: aplicar el respaldo tomado antes del pase (ver R20261118__pase_cotizador_orden.md).
-- =============================================================================
-- =============================================================================
-- sp_emision_automovil_rcv_nexus · PRODUCCIÓN · profesión, ocupación y actividad económica
-- Fecha: 2026-10-30
--
-- Base: la definición de PRODUCCIÓN exportada el 30-oct-2026 (respaldo/sp_emision_automovil_rcv_nexus.PROD-2026-10-30.sql).
-- Cambios: los mismos aplicados y probados en QA, marcados con [ocupacion 29-oct-2026].
-- Fuera de esos bloques el código es el de producción.
-- Requiere: 03_sp_create_maclient_nexus.sql (acepta @cocupacion y @bocupacion_separada).
-- Volver atrás: aplicar el respaldo.
-- =============================================================================
CREATE OR ALTER PROCEDURE [dbo].[sp_emision_automovil_rcv_nexus]
    @id                  INT,
    @pSuccess            BIT = 0 OUTPUT,
    @pErrorMessage       NVARCHAR(MAX) = NULL OUTPUT,
    -- [cpais 23-oct-2026] País de la dirección (lo envía sp_pre_emision). NULL = 58 Venezuela.
    @cpais_tomador       SMALLINT      = NULL,
    @cpais_titular       SMALLINT      = NULL,
    -- [ocupacion 29-oct-2026] Ocupación (maocupac) aparte de la profesión. 0 = la profesión trae la ocupación (hoy).
    @cocupacion_tomador  SMALLINT      = NULL,
    @cocupacion_titular  SMALLINT      = NULL,
    @bocupacion_separada BIT           = 0,
    -- [cotizacion 02-nov-2026] Cotización de SysIP (sopoliza.cproces); se pasa tal cual a sp_genera_coberturas.
    @cproces_cotizacion  NUMERIC(13)   = NULL,
    -- [ccerti 05-nov-2026] Opción de la cotización (sopoltar.ccerti); se pasa tal cual a sp_genera_coberturas.
    @ccerti_cotizacion   INT           = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @TranStarted BIT = 0;
    IF @@TRANCOUNT = 0
    BEGIN
        BEGIN TRANSACTION;
        SET @TranStarted = 1;
    END;

    BEGIN TRY
        -- Declarar variables locales
        DECLARE
        @cnpoliza_rel varchar(30), @cplan varchar(6), @xcanal_venta varchar(250), @icedula_tomador char(1),
        @xrif_tomador  numeric(13),   @xnombre_tomador   varchar(250),   @xapellido_tomador   varchar(250),   @isexo_tomador   char(1),
        @iestado_civil_tomador  char(1),  @fnac_tomador  date,  @cestado_tomador  varchar(100),   @cciudad_tomador   varchar(100),
        @xdireccion_tomador varchar(1000), @xtelefono_tomador varchar(250), @xcorreo_tomador varchar(250),  @icedula_titular  char(1),
        @xrif_titular  numeric(13),   @xnombre_titular   varchar(250),   @xapellido_titular   varchar(250),   @isexo_titular   char(1),
        @iestado_civil_titular  char(1),  @fnac_titular  date,  @cestado_titular  varchar(100),   @cciudad_titular   varchar(100),
        @xdireccion_titular varchar(1000), @xtelefono_titular varchar(250), @xcorreo_titular varchar(250), @cproductor int,  @ptasamon
        numeric(13,6), @ifrecuencia char(1), @femision date, @api varchar(100), @method varchar(100),  @cprog  char(20),  @ifuente
        char(10), @fingreso datetime, @cpoliza NUMERIC(19), @cnpoliza  varchar(30),  @cproces  NUMERIC(13),  @pcomision  numeric(9,  2),
        @cramo int, @cmoneda CHAR(4),
        @msumaaseg  numeric(18,  2),  @msumaasegext  numeric(18,  2),  @mprima  numeric(18,  2),  @mprimaext  numeric(18,2),   @mcomision
        numeric(18,2),  @mcomisionext  numeric(18,2),  @qcontador   numeric(18,0),
        @crecibo numeric(19), @cnrecibo varchar(30), @qcontadorrec numeric(18,0),
        @contador_polacc numeric(18,0), @fano smallint, @fmes smallint,  @fanopol  smallint,  @fmespol  smallint,  @fdesde_pol  date,
        @fhasta_pol date, @fdesde_rec date, @fhasta_rec date,  @corigen_rel  char(2),  @qrecibo1  numeric(19,0),  @ncuo  int,
        @ifpexceso numeric(18,2), @msfp numeric(18,2), @mpfp numeric(18,2), @mpfpext numeric(18,2), @mpfpret  numeric(18,2),  @mpfpretext
        numeric(18,2), @mcfp numeric(18,2), @mcfpext numeric(18,2), @mifp numeric(18,2), @mifpext numeric(18,2), @msretesp numeric(18,2),
        @msretespext numeric(18,2), @mpretesp numeric(18,2),  @mpretespext  numeric(18,2),  @ctiporamo  int,  @itipocont  char(3),  @pcoa
        numeric(18,8),    @nparentesco_asegurado    tinyint,    @icedula_asegurado    char(1),    @xrif_asegurado     numeric(12,     0),
        @iestado_civil_asegurado char(1), @xnombre_asegurado varchar(250), @xapellido_asegurado varchar(250),  @isexo_asegurado  char(1),
        @fnac_asegurado   date,   @xdireccion_asegurado   varchar(1000),   @xcorreo_asegurado   varchar(250),    @xtelefono_asegurado
        varchar(250), @caseg  numeric(13,0),  @cben  numeric(12,0),  @nparentesco_beneficiario  tinyint,  @icedula_beneficiario  char(1),
        @xrif_beneficiario numeric(13, 0), @xnombre_beneficiario varchar(250), @xapellido_beneficiario varchar(250), @isexo_beneficiario char(1),
        @nbeneficia int, @fnac_beneficiario date,
        @iestado_civil_beneficiario char(1), @cestado_beneficiario varchar(100),
        @cciudad_beneficiario varchar(100), @xdireccion_beneficiario varchar(1000), @xtelefono_beneficiario varchar(250), @xcorreo_beneficiario varchar(250),
        @ncobertura TINYINT, @POL_RAMO VARCHAR(20), @cparen TINYINT, @ctablatar CHAR(10), @mprimaext_cob numeric(18,2), @nedad_asegurado VARCHAR(20),
        @nrecibo int, @fcobro date, @iestadorec CHAR(1), @cnrecibo_rel varchar(30), @xcliente_tomador VARCHAR(250),
        @xcliente_titular VARCHAR(250), @xcliente_asegurado VARCHAR(250), @xcliente_beneficiario VARCHAR(250), @cuotas INT, @cramoint INT,
        @cmarca varchar(3), @cmodelo varchar(3), @cversion  varchar(3),  @cano  SMALLINT,  @xcolor  VARCHAR(60),  @xplaca  VARCHAR(15),
        @xsercar VARCHAR(60), @xsermot VARCHAR(60), @id_inma int, @mvalor numeric(18, 2), @qpuestos INT, @qtoneladas INT,
        @ccanalalt int, @cscanalalt int, @ctipocanal char(1), @idInma INT, @ccategoria_uso INT, @cusuario numeric(13), @ntoneladas INT,
        @npuestos INT, @ctipo INT, @precargorcv NUMERIC(18, 2), @iplaca CHAR(1), @ptasamon_pago NUMERIC(13, 6),
        @xmarca VARCHAR(60), @xmodelo VARCHAR(60), @xversion VARCHAR(60), @fdesde DATE, @fhasta DATE,
        @itipoEmi VARCHAR(10), @coberAdicional VARCHAR(2), @tasaPt NUMERIC(18, 2), @tasaCa NUMERIC(18, 2), @tasaPp NUMERIC(18, 2),
        @icedula_conductor char(1), @xrif_conductor numeric(13), @xnombre_conductor varchar(250), @xapellido_conductor varchar(250),
        @isexo_conductor char(1), @iestado_civil_conductor char(1), @fnac_conductor date, @cestado_conductor varchar(100),
        @cciudad_conductor varchar(100), @xdireccion_conductor varchar(1000), @xtelefono_conductor varchar(250), @xcorreo_conductor varchar(250),
        @itipo_diligencia char(1), @cprofesion_tomador int, @cactividad_tomador int, @cprofesion_titular int, @cactividad_titular int, @cgestor varchar(50);

        -- Leer datos del registro de pre-emisión
        SELECT
        @id = id, @cnpoliza_rel = cnpoliza_rel,  @cplan  =  cplan,  @xcanal_venta  =  xcanal_venta,  @icedula_tomador  =  icedula_tomador,
        @xrif_tomador = xrif_tomador,  @xnombre_tomador  =  xnombre_tomador,  @xapellido_tomador  =  xapellido_tomador,  @isexo_tomador  =
        isexo_tomador, @iestado_civil_tomador = iestado_civil_tomador, @fnac_tomador = fnac_tomador, @cestado_tomador  =  cestado_tomador,
        @cciudad_tomador  =  cciudad_tomador,  @xdireccion_tomador   =   xdireccion_tomador,   @xtelefono_tomador   =   xtelefono_tomador,
        @xcorreo_tomador  =  xcorreo_tomador,  @icedula_titular  =  icedula_titular,  @xrif_titular  =  xrif_titular,  @xnombre_titular  =
        xnombre_titular,   @xapellido_titular   =   xapellido_titular,   @isexo_titular   =   isexo_titular,   @iestado_civil_titular    =
        iestado_civil_titular, @fnac_titular = fnac_titular,  @cestado_titular  =  cestado_titular,  @cciudad_titular  =  cciudad_titular,
        @xdireccion_titular = xdireccion_titular, @xtelefono_titular = xtelefono_titular, @xcorreo_titular = xcorreo_titular,  @cproductor
        = cproductor, @ptasamon = ptasamon, @ifrecuencia = ifrecuencia, @femision = femision, @api =  api,  @method  =  method,  @cprog  =
        cprog, @ifuente = ifuente, @fingreso = fingreso, @cpoliza = cpoliza, @cnpoliza  =  cnpoliza,  @cproces  =  cproces,  @pcomision  =
        pcomision, @cramo = cramo, @mprima = mprima, @mprimaext = mprimaext, @corigen_rel = corigen_rel, @cmarca = cmarca, @cmodelo = cmodelo,
        @cversion = cversion, @cano = cano, @xcolor = xcolor, @xplaca = xplaca, @xsercar = xsercar, @xsermot = xsermot,
        @ccanalalt = ccanalalt, @cscanalalt = cscanalalt, @ctipocanal = ctipocanal, @ccategoria_uso = ccategoria_uso, @cmoneda = cmoneda,
        @cusuario = cusuario, @ntoneladas = ntoneladas, @npuestos = npuestos, @precargorcv = precargorcv, @iplaca = iplaca,
        @msumaaseg = msumaaseg, @ptasamon_pago = ptasamon_pago,
        @xmarca = xmarca, @xmodelo = xmodelo, @xversion = xversion, @fdesde = fdesde, @fhasta = fhasta,
        @icedula_conductor = icedula_conductor, @xrif_conductor = xrif_conductor, @xnombre_conductor = xnombre_conductor,
        @xapellido_conductor = xapellido_conductor, @isexo_conductor = isexo_conductor, @iestado_civil_conductor = iestado_civil_conductor,
        @fnac_conductor = fnac_conductor, @cestado_conductor = cestado_conductor, @cciudad_conductor = cciudad_conductor,
        @xdireccion_conductor = xdireccion_conductor, @xtelefono_conductor = xtelefono_conductor, @xcorreo_conductor = xcorreo_conductor,
        @icedula_beneficiario = icedula_beneficiario, @xrif_beneficiario = xrif_beneficiario, @xnombre_beneficiario = xnombre_beneficiario,
        @xapellido_beneficiario = xapellido_beneficiario, @isexo_beneficiario = isexo_beneficiario, @iestado_civil_beneficiario = iestado_civil_beneficiario,
        @fnac_beneficiario = fnac_beneficiario, @cestado_beneficiario = cestado_beneficiario, @cciudad_beneficiario = cciudad_beneficiario,
        @xdireccion_beneficiario = xdireccion_beneficiario, @xtelefono_beneficiario = xtelefono_beneficiario, @xcorreo_beneficiario = xcorreo_beneficiario,
        @itipoEmi = itipo_emi, @coberAdicional = cober_adicional, @tasaPt = ptasa_pt, @tasaCa = ptasa_ca, @tasaPp = ptasa_pp,
        @itipo_diligencia = itipo_diligencia, @cprofesion_tomador = cprofesion_tomador, @cactividad_tomador = cactividad_tomador,
        @cprofesion_titular = cprofesion_titular, @cactividad_titular = cactividad_titular, @cgestor = cgestor
        FROM TMEMISION_AUTOMOVIL_RCV2 WHERE ID = @ID;

        -- Validación de integridad estricta ACID: Si cpoliza es nulo, no continuar y forzar excepción
        IF (@cpoliza IS NULL)
        BEGIN
            THROW 99001, 'No se ha asignado un número de póliza (cpoliza) válido para el registro de emisión en TMEMISION_AUTOMOVIL_RCV2.', 1;
        END;

        -- Inicializar variables
        SELECT @msfp = 0, @mpfp = 0, @mpfpext = 0, @mpfpret = 0, @mpfpretext = 0,
               @mcfp = 0, @mcfpext = 0, @mifp = 0, @mifpext = 0,
               @msretesp = 0, @msretespext = 0, @mpretesp = 0, @mpretespext = 0,
               @itipocont = 'RET', @pcoa = 0;

        -- Cálculo de cuotas según frecuencia
        IF (@ifrecuencia = 'M') SELECT @cuotas = 12;
        IF (@ifrecuencia = 'T') SELECT @cuotas = 4;
        IF (@ifrecuencia = 'C') SELECT @cuotas = 3;
        IF (@ifrecuencia = 'S') SELECT @cuotas = 2;
        IF (@ifrecuencia = 'A') SELECT @cuotas = 1;
        IF (@ifrecuencia = 'E') SELECT @cuotas = 1;

        -- Productor por defecto
        IF (@cproductor = 0) SELECT @cproductor = 80080;

        -- Moneda y tasa
        IF (@cmoneda IS NULL)
            SELECT @cmoneda = cmoneda FROM maplanes WHERE cramo = @cramo AND cplan = @cplan;

        -- Determinar tasa de cambio real para conversiones
        DECLARE @tasa_cambio NUMERIC(18, 6);
        IF @ptasamon IS NOT NULL AND @ptasamon > 1.0
        BEGIN
            SET @tasa_cambio = @ptasamon;
        END
        ELSE IF @ptasamon_pago IS NOT NULL AND @ptasamon_pago > 1.0
        BEGIN
            SET @tasa_cambio = @ptasamon_pago;
        END
        ELSE
        BEGIN
            SET @tasa_cambio = (SELECT ptasamon FROM mamonedas WHERE cmoneda = '$');
        END

        -- Para bolívares, ptasamon es 1.0, pero ptasamon_pago es la tasa real
        IF TRIM(@cmoneda) IN ('Bs', 'BS')
        BEGIN
            SET @ptasamon = 1.0;
            SET @ptasamon_pago = @tasa_cambio;
        END
        ELSE
        BEGIN
            IF @ptasamon IS NULL OR @ptasamon = 0
            BEGIN
                SET @ptasamon = @tasa_cambio;
            END
            SET @ptasamon_pago = @ptasamon;
        END;

        -- Usuario por defecto
        IF (@cusuario IS NULL) SELECT @cusuario = 7;
        IF (@ccanalalt = 27) SELECT @cusuario = 7;

        -- Fechas por defecto
        IF @femision IS NULL SET @femision = CAST(GETDATE() AS DATE);
        IF @fdesde IS NULL SET @fdesde = CAST(@femision AS DATE);
        IF @fhasta IS NULL SET @fhasta = DATEADD(YEAR, 1, @fdesde);

        SELECT @fano = YEAR(@fdesde), @fmes = MONTH(@fdesde);

        -- Obtener id del vehículo en mainma
        SET @idInma = 0;
        IF (@ntoneladas IS NULL) SELECT @ntoneladas = 0;

        -- Comisión desde arancel
        SELECT @pcomision = pcomision FROM maarancel WHERE cramo = @cramo AND iestado = 'V';

        IF @cproductor = 80080
        BEGIN
            SELECT @mcomision = 0, @mcomisionext = 0, @pcomision = 0;
        END

        SELECT @cramoint = cramoint FROM maramos WHERE cramo = @cramo;

        IF (@cproductor IS NOT NULL AND @cproductor != 80080) SELECT @ctipocanal = 'T';
        IF (@cproductor = 80080 OR @cproductor IS NULL) SELECT @ctipocanal = 'D';
        IF (@ccanalalt IS NOT NULL) SELECT @ctipocanal = 'A';

        IF (@icedula_tomador IS NULL) SELECT @icedula_titular = 'V';
        IF (@icedula_titular IS NULL) SELECT @icedula_titular = 'V';

        -- [cpais 23-oct-2026] País de la dirección; sin dato, Venezuela (58) como siempre.
        SET @cpais_tomador = ISNULL(@cpais_tomador, 58);
        SET @cpais_titular = ISNULL(@cpais_titular, 58);

        -- CREACIÓN DEL CLIENTE TITULAR
        IF (@xrif_titular IS NOT NULL)
        BEGIN
            SELECT @xcliente_titular = CONCAT(@xnombre_titular, ' ', @xapellido_titular);
            EXEC sp_create_maclient_nexus
                @icedula_titular, @xrif_titular, @xnombre_titular, @xapellido_titular, @xcliente_titular,
                @isexo_titular, @iestado_civil_titular, @fnac_titular, @xcorreo_titular, @cpais_titular, -- [cpais 23-oct-2026] antes 58
                @cestado_titular, @cciudad_titular, @xdireccion_titular, NULL, @xtelefono_titular,
                @ifuente, NULL,
                @cprofesion = @cprofesion_titular, @cactividad = @cactividad_titular,
                @cocupacion = @cocupacion_titular, @bocupacion_separada = @bocupacion_separada; -- [ocupacion 29-oct-2026]
        END

        -- CREACIÓN DEL CLIENTE TOMADOR
        IF (@xrif_tomador IS NOT NULL)
        BEGIN
            SELECT @xcliente_tomador = CONCAT(@xnombre_tomador, ' ', @xapellido_tomador);
            EXEC sp_create_maclient_nexus
                @icedula_tomador, @xrif_tomador, @xnombre_tomador, @xapellido_tomador, @xcliente_tomador,
                @isexo_tomador, @iestado_civil_tomador, @fnac_tomador, @xcorreo_tomador, @cpais_tomador, -- [cpais 23-oct-2026] antes 58
                @cestado_tomador, @cciudad_tomador, @xdireccion_tomador, NULL, @xtelefono_tomador,
                @ifuente, NULL,
                @cprofesion = @cprofesion_tomador, @cactividad = @cactividad_tomador,
                @cocupacion = @cocupacion_tomador, @bocupacion_separada = @bocupacion_separada; -- [ocupacion 29-oct-2026]
        END
        ELSE
        BEGIN
            SELECT @xrif_tomador = @xrif_titular;
        END

        -- CREACIÓN DEL CLIENTE CONDUCTOR
        IF (@xrif_conductor IS NOT NULL AND @xrif_conductor > 0)
        BEGIN
            DECLARE @xcliente_conductor VARCHAR(250) = CONCAT(@xnombre_conductor, ' ', @xapellido_conductor);
            EXEC sp_create_maclient_nexus
                @icedula_conductor, @xrif_conductor, @xnombre_conductor, @xapellido_conductor, @xcliente_conductor,
                @isexo_conductor, @iestado_civil_conductor, @fnac_conductor, @xcorreo_conductor, 58,
                @cestado_conductor, @cciudad_conductor, @xdireccion_conductor, NULL, @xtelefono_conductor,
                @ifuente, NULL;
        END

        -- CREACIÓN DEL CLIENTE BENEFICIARIO
        IF (@xrif_beneficiario IS NOT NULL AND @xrif_beneficiario > 0)
        BEGIN
            SELECT @xcliente_beneficiario = CONCAT(@xnombre_beneficiario, ' ', @xapellido_beneficiario);
            EXEC sp_create_maclient_nexus
                @icedula_beneficiario, @xrif_beneficiario, @xnombre_beneficiario, @xapellido_beneficiario, @xcliente_beneficiario,
                @isexo_beneficiario, @iestado_civil_beneficiario, @fnac_beneficiario, @xcorreo_beneficiario, 58,
                @cestado_beneficiario, @cciudad_beneficiario, @xdireccion_beneficiario, NULL, @xtelefono_beneficiario,
                @ifuente, NULL;
        END

        -- SE CREA LA PÓLIZA Y EL CERTIFICADO DEL VEHÍCULO
        SET @fdesde_pol = @fdesde;
        SET @fhasta_pol = @fhasta;

        INSERT INTO adpoliza
        (cpoliza, fanopol, fmespol, u_version, cramo, cnpoliza, cproces, cplan, itipoprod, itipopol, itiponegocio, clider,
         cpolizalider, istatpol, iestado, itipoingreso, cpoliza_mae, ccerti_mae, itiporen, iperren, ccauren, iestadoren,
         csucur, csucurrec, criesgo, cpolnum, cultcert, casegurado, ctenedor, cbeneficiario, cacreedor, cfinanciera,
         cproductor, czonaprod, cejecta, cmoneda, ptasamon, forigen, fdesde, fhasta, itipoanul, canula, idevolucion,
         iformadevo, qcuotas, ifrecuencia, itipovenprima, iestadovenprima, icalculoedad, igemi, iqgemi, iapligemi,
         mgemi, mgemiext, cprog, ifuente, fingreso, cusuario, ccategoria, cnpoliza_rel, corigen_rel, ccanalalt, cscanalalt, ctipocanal, itipo_diligencia,cgestor)
        VALUES
        (@cpoliza, @fano, @fmes, '!', @cramo, @cnpoliza, @cproces, @cplan, @itipoEmi, 'I', 'DI', 0,
         0, 'V', 'V', 'N', 0, 0, 'A', 1, 0, 'N',
         1, 1, 0, 0, 0, @xrif_titular, @xrif_tomador, @xrif_beneficiario, 0, 0,
         @cproductor, 0, 0, @cmoneda, @ptasamon, @femision, @fdesde_pol, @fhasta_pol, 'N', 0, 'P',
         'N', @cuotas, @ifrecuencia, 'N', 'N', 'R', 'N', 'N', 'N', 0,
         0, 'TEmision_Auto_RCV2', @ifuente, GETDATE(), @cusuario, 1, @cnpoliza_rel, @corigen_rel, @ccanalalt, @cscanalalt, @ctipocanal, @itipo_diligencia,@cgestor);

        -- Obtener datos del vehículo para certificados
        SELECT @id_inma = 0, @mvalor = mvalor, @qpuestos = npasajero
        FROM maanomod
        WHERE cmarca = @cmarca AND cmodelo = @cmodelo AND cversion = @cversion AND cano = @cano;

        SELECT @ctipo = ctipo FROM maanomod
        WHERE cmarca = @cmarca AND cmodelo = @cmodelo AND cversion = @cversion AND cano = @cano;

        IF (@msumaaseg IS NULL OR @msumaaseg <= 0)
        BEGIN
            SELECT TOP 1 @msumaaseg = R.msumabruta
            FROM adrecibos R WITH (NOLOCK)
            WHERE (R.cpoliza = @cpoliza OR R.cnpoliza = TRIM(@cnpoliza_rel)) AND R.msumabruta > 0
            ORDER BY R.crecibo DESC;

            IF (@msumaaseg IS NULL OR @msumaaseg <= 0)
            BEGIN
                SELECT TOP 1 @msumaaseg = V.mvalor
                FROM vhcerti V WITH (NOLOCK)
                WHERE (V.cpoliza = @cpoliza OR V.cnpoliza = TRIM(@cnpoliza_rel)) AND V.mvalor > 0
                ORDER BY V.fanopol DESC;
            END;
        END;

        IF (@mvalor IS NULL OR @mvalor <= 0)
        BEGIN
            SELECT TOP 1 @mvalor = mvalor
            FROM vhcerti
            WHERE (cpoliza = @cpoliza OR cnpoliza = @cnpoliza) AND mvalor > 0
            ORDER BY fanopol DESC;

            IF (@mvalor IS NULL OR @mvalor <= 0)
                SET @mvalor = @msumaaseg;
        END;


        INSERT INTO vhcerti
        (cproces, ccerti, u_version, cramo, cpoliza, cnpoliza, cplan, fanopol, fmespol, casegurado, ctenedor,
         cbeneficiario, cacreedor, ccategovh, cmarca, cmodelo, cano, mvalor, xplaca, xsercar, xsermot, xcolor,
         qpuestos, qtoneladas, istatcer, fdesde, fhasta, fingreso, cusuario, ccategoria, itipoprod, cversion, ctipo, cuso, cprog, ifuente, femision, xconductor)
        VALUES
        (@cproces, 0, '!', @cramo, @cpoliza, @cnpoliza, @cplan, @fano, @fmes, @xrif_titular, @xrif_tomador,
         @xrif_beneficiario, 0, 0, @cmarca, @cmodelo, @cano, COALESCE(@mvalor, 0), @xplaca, @xsercar, @xsermot, @xcolor,
         @qpuestos, @ntoneladas, 'V', @fdesde_pol, @fhasta_pol, GETDATE(), @cusuario, 1, @itipoEmi, @cversion, @ctipo, @ccategoria_uso, @cprog, @ifuente, @femision, @xrif_conductor);



        -- Título/certificado técnico (tetitcer): copia desde adpoliza, ccerti=0
        IF NOT EXISTS (
            SELECT 1 FROM tetitcer WITH (UPDLOCK, HOLDLOCK)
            WHERE cpoliza = @cpoliza AND fanopol = @fano AND fmespol = @fmes AND ccerti = 0
        )
        BEGIN
            INSERT INTO tetitcer
            SELECT
                a.cpoliza, a.fanopol, a.fmespol,
                0,
                a.u_version, a.cramo, a.itipoprod, a.cproces,
                a.casegurado, a.ctenedor,
                0,
                a.cacreedor,
                a.cbeneficiario,
                a.cproductor,
                a.itiporen, a.iestadoren,
                'V',
                a.fdesde, a.fhasta,
                a.forigen,
                a.cprog, a.ifuente, a.bok, a.cerror,
                a.fingreso, a.cusuario, a.ccategoria,
                a.cusuarioauto, a.ccategoriaauto, a.fultmod, a.cusuariomod, a.ccategoriamod
            FROM adpoliza a
            WHERE a.cpoliza = @cpoliza
              AND a.fanopol = @fano
              AND a.fmespol = @fmes;
        END

		-- LLAMADA AL SP QUE GENERA COBERTURAS Y RECIBOS
        EXEC sp_genera_coberturas_recibos_auto_rcv_nexus
            @cpoliza = @cpoliza,
            @ccerti = 0,
            @idInma = @idInma,
            @ifuente = @ifuente,
            @cprog = 'TEmision_Auto_RCV2',
            @ccategoria_uso = @ccategoria_uso,
            @iplaca = @iplaca,
            @npuestos = @npuestos,
            @ntoneladas = @ntoneladas,
            @precargorcv = @precargorcv,
            @cmoneda = @cmoneda,
            @msumaaseg = @msumaaseg,
            @mprima = @mprima,
            @ptasamon = @ptasamon,
            @ptasamon_pago = @ptasamon_pago,
            @coberAdicional = @coberAdicional,
            @tasaPt = @tasaPt,
            @tasaCa = @tasaCa,
            @tasaPp = @tasaPp,
            @cusuario = @cusuario,
            @cproces_in = @cproces,
            @cproces_cotizacion = @cproces_cotizacion,   -- [cotizacion 02-nov-2026]
            @ccerti_cotizacion = @ccerti_cotizacion;     -- [ccerti 05-nov-2026]

        -- Hardening: no marcar EMITTED si no hay coberturas/prima
        IF NOT EXISTS (SELECT 1 FROM adpolcob WHERE cpoliza = @cpoliza)
            THROW 99120, 'sp_emision: sp_genera no dejó coberturas en adpolcob; se aborta la emisión.', 1;

        IF NOT EXISTS (
            SELECT 1 FROM adrecibos
            WHERE cpoliza = @cpoliza
              AND ISNULL(mprimabrutaext, 0) > 0
        )
            THROW 99121, 'sp_emision: no hay recibo con prima > 0; se aborta la emisión (rollback).', 1;

        -- Actualizar estado de éxito en TMEMISION_AUTOMOVIL_RCV2
        UPDATE TMEMISION_AUTOMOVIL_RCV2
        SET iestado = 2, xestado = 'EMITTED', xlog = NULL
        WHERE id = @id;

        -- Select de retorno
        SELECT TOP 1 cpoliza, cnpoliza, cnrecibo, cproces, qcuotas, fanopol, fmespol
        FROM adrecibos
        WHERE cpoliza = @cpoliza
        ORDER BY qcuotas ASC, cnrecibo ASC;




        IF @TranStarted = 1 AND @@TRANCOUNT > 0
        BEGIN
            COMMIT TRANSACTION;
        END;

        SET @pSuccess = 1;
        SET @pErrorMessage = NULL;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
        BEGIN
            ROLLBACK TRANSACTION;
        END;

        SET @pSuccess = 0;
        SET @pErrorMessage = ERROR_MESSAGE();

        THROW 99001, @pErrorMessage, 1;
    END CATCH
END;
GO

-- ===== 13_sp_pre_emision_automovil_rcv_nexus.sql =====
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
-- REVERSA: definición de PROD .67 al 20-nov-2026
-- =============================================================================
-- sp_pre_emision_automovil_rcv_nexus · PRODUCCIÓN · R-091262 pase del cotizador de automóvil
-- Base: definición viva de PRODUCCIÓN (Sis2000) exportada el 17/11/2026 (modify_date 2026-10-30 14:04:19).
-- Cambios: solo los bloques del cotizador: [cotizacion 02-nov-2026], [ccerti 05-nov-2026] y [cotizacion anulada 17-nov-2026] (emisión desde cotización: @cproces_cotizacion, @ccerti_cotizacion, @mprima_esperada).
-- Fuera de esos bloques el código es el de producción. Detalle: docs/pase-cotizador-2026-11/diferencias.md
-- Volver atrás: aplicar el respaldo tomado antes del pase (ver R20261118__pase_cotizador_orden.md).
-- =============================================================================
-- =============================================================================
-- sp_pre_emision_automovil_rcv_nexus · PRODUCCIÓN · profesión, ocupación y actividad económica
-- Fecha: 2026-10-30
--
-- Base: la definición de PRODUCCIÓN exportada el 30-oct-2026 (respaldo/sp_pre_emision_automovil_rcv_nexus.PROD-2026-10-30.sql).
-- Cambios: los mismos aplicados y probados en QA, marcados con [ocupacion 29-oct-2026].
-- Fuera de esos bloques el código es el de producción.
-- Requiere: 04_sp_emision_automovil_rcv_nexus.sql (recibe los parámetros nuevos).
-- Volver atrás: aplicar el respaldo.
-- =============================================================================
 CREATE OR ALTER PROCEDURE [dbo].[sp_pre_emision_automovil_rcv_nexus]
    -- Parámetros que corresponden a las columnas de la tabla eePoliza_Automovil_RCV2
    @cnpoliza_rel       VARCHAR(30)   = NULL,
    @cramo              INT           = NULL,
    @cplan              VARCHAR(10)   = NULL,
    @xcanal_venta       VARCHAR(250)  = NULL,
    @icedula_tomador    CHAR(1)       = NULL,
    @xrif_tomador       NUMERIC(13,0)    = NULL,
    @xnombre_tomador    VARCHAR(250)  = NULL,
    @xapellido_tomador  VARCHAR(250)  = NULL,
    @isexo_tomador      CHAR(1)       = NULL,
    @iestado_civil_tomador CHAR(1)    = NULL,
    @fnac_tomador       DATE          = NULL,
    @cestado_tomador    VARCHAR(100)  = NULL,
    @cciudad_tomador    VARCHAR(100)  = NULL,
    @xdireccion_tomador VARCHAR(1000) = NULL,
    @xtelefono_tomador  VARCHAR(250)  = NULL,
    @xcorreo_tomador    VARCHAR(250)  = NULL,
    @icedula_titular    CHAR(1)       = NULL,
    @xrif_titular       NUMERIC(13,0)    = NULL,
    @xnombre_titular    VARCHAR(250)  = NULL,
    @xapellido_titular  VARCHAR(250)  = NULL,
    @isexo_titular      CHAR(1)       = NULL,
    @iestado_civil_titular CHAR(1)    = NULL,
    @fnac_titular       DATE          = NULL,
    @cestado_titular    VARCHAR(100)  = NULL,
    @cciudad_titular    VARCHAR(100)  = NULL,
    @xdireccion_titular VARCHAR(1000) = NULL,
    @xtelefono_titular  VARCHAR(250)  = NULL,
    @xcorreo_titular    VARCHAR(250)  = NULL,
    @icedula_conductor  CHAR(1)       = NULL,
    @xrif_conductor     NUMERIC(13,0)    = NULL,
    @xnombre_conductor  VARCHAR(250)  = NULL,
    @xapellido_conductor VARCHAR(250) = NULL,
    @isexo_conductor    CHAR(1)       = NULL,
    @iestado_civil_conductor CHAR(1)  = NULL,
    @fnac_conductor     DATE          = NULL,
    @cestado_conductor  VARCHAR(100)  = NULL,
    @cciudad_conductor  VARCHAR(100)  = NULL,
    @xdireccion_conductor VARCHAR(1000) = NULL,
    @xtelefono_conductor VARCHAR(250) = NULL,
    @xcorreo_conductor   VARCHAR(250) = NULL,
    @icedula_beneficiario CHAR(1)     = NULL,
    @xrif_beneficiario  NUMERIC(13,0)   = NULL,
    @xnombre_beneficiario VARCHAR(250) = NULL,
    @xapellido_beneficiario VARCHAR(250) = NULL,
    @isexo_beneficiario  CHAR(1)      = NULL,
    @iestado_civil_beneficiario CHAR(1) = NULL,
    @fnac_beneficiario   DATE         = NULL,
    @cestado_beneficiario VARCHAR(100) = NULL,
    @cciudad_beneficiario VARCHAR(100) = NULL,
    @xdireccion_beneficiario VARCHAR(1000) = NULL,
    @xtelefono_beneficiario VARCHAR(250) = NULL,
    @xcorreo_beneficiario VARCHAR(250) = NULL,
    @cmarca             VARCHAR(3)    = NULL,
    @cmodelo            VARCHAR(3)    = NULL,
    @cversion           VARCHAR(3)    = NULL,
    @cano               SMALLINT      = NULL,
    @xcolor             VARCHAR(60)   = NULL,
    @xplaca             VARCHAR(15)   = NULL,
    @xsercar            VARCHAR(60)   = NULL,
    @xsermot            VARCHAR(60)   = NULL,
    @cpersona_politica  CHAR(1)       = NULL,
    @cterm_y_cod        CHAR(1)       = NULL,
    @cproductor         INT           = NULL,
    @ptasamon           NUMERIC(18,6) = NULL,
    @mprima             NUMERIC(18,2) = NULL,
    @ifrecuencia        CHAR(1)       = NULL,
    @femision           DATE          = NULL,
    @corigen_rel        CHAR(2)       = NULL,
    @api                VARCHAR(100)  = NULL,
    @method             VARCHAR(100)  = NULL,
    @cprog              CHAR(20)      = NULL,
    @ifuente            CHAR(10)      = NULL,
    @fingreso           DATETIME      = NULL,
    @cpoliza            NUMERIC(19)   = NULL,
    @cnpoliza           VARCHAR(30)   = NULL,
    @cproces            NUMERIC(13)   = NULL,
    @ccanalalt          INT           = NULL,
    @cscanalalt         INT           = NULL,
    @ctipocanal         CHAR(1)       = NULL,
    @ccategoria_uso     INT           = NULL,
    @cmoneda            CHAR(4)       = NULL,
    @cusuario           NUMERIC(13)   = NULL,
    @ntoneladas         INT           = NULL,
    @npuestos           INT           = NULL,
    @precargorcv        NUMERIC(18,2) = NULL,
    @iplaca             CHAR(1)       = NULL,
    @ptasamon_pago      NUMERIC(18,6) = NULL,
    @msumaaseg          NUMERIC(18,2) = NULL,
    @xmarca             VARCHAR(60)   = NULL,
    @xmodelo             VARCHAR(60)   = NULL,
    @xversion           VARCHAR(60)   = NULL,
    @fdesde             DATE          = NULL,
    @fhasta             DATE          = NULL,
    @itipoEmi           VARCHAR(10)   = 'NU',
    @coberAdicional     VARCHAR(2)    = 'RC',
    @tasaPt             NUMERIC(18,2) = 0,
    @tasaCa             NUMERIC(18,2) = 0,
    @tasaPp             NUMERIC(18,2) = 0,
    @itipo_diligencia     CHAR(1)       = NULL,
    @cprofesion_tomador   INT           = NULL,
    @cactividad_tomador   INT           = NULL,
    @cprofesion_titular   INT           = NULL,
    @cactividad_titular   INT           = NULL,
    @cgestor             VARCHAR(60) = NULL,
    -- [cpais 23-oct-2026] País de la dirección (57 Colombia en placa extranjera). NULL = 58 Venezuela.
    @cpais_tomador       SMALLINT      = NULL,
    @cpais_titular       SMALLINT      = NULL,
    -- [ocupacion 29-oct-2026] Ocupación (maocupac) aparte de la profesión (maprofes).
    -- 0 = @cprofesion_* trae la ocupación, como hasta ahora.
    @cocupacion_tomador  SMALLINT      = NULL,
    @cocupacion_titular  SMALLINT      = NULL,
    @bocupacion_separada BIT           = 0,
    -- [cotizacion 02-nov-2026] Cotización del cotizador de SysIP (sopoliza.cproces, cprog Emi_Auto). Con valor se emite con
    -- el plan, la suma y las primas de la cotización y se marca como emitida. NULL = emisión de siempre.
    @cproces_cotizacion  NUMERIC(13)   = NULL,
    -- [ccerti 05-nov-2026] Opción de la cotización (ccerti de sopolcob/sopoltar/vhofcert/sorecibos). NULL = la única que tenga.
    @ccerti_cotizacion   INT           = NULL,
    -- [ccerti 05-nov-2026] Prima anual en USD de la opción que aceptó el cliente. El ccerti es una posición que cambia si
    -- se edita la cotización: con valor, se rechaza (COTIZACION_NO_COINCIDE) si la opción ya no suma esa prima. NULL = no se compara.
    @mprima_esperada     NUMERIC(18,2) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Control de transacción atómica
    DECLARE @TranStarted BIT = 0;
    IF @@TRANCOUNT = 0
    BEGIN
        BEGIN TRANSACTION;
        SET @TranStarted = 1;
    END;

    BEGIN TRY
        -- Variables locales
        DECLARE @id INT, @cerror INT, @xerror NVARCHAR(MAX),
                @qcontador NUMERIC(18,0), @csucur INT = 1,
                @crecibo NUMERIC(19), @cnrecibo VARCHAR(30),
                @cnpoliza_cont VARCHAR(30), @ctipo INT,
                @iestado INT, @xestado VARCHAR(30), @xlog VARCHAR(1000),
                @pSuccess BIT, @pErrorMessage NVARCHAR(MAX),
                --@cgestor VARCHAR(30),
    			@mprima_servicio NUMERIC(18,2),
    			@puestos_calc INT,
                @uso_calc INT;

        SET @csucur = 1;

        -- [cotizacion 02-nov-2026] Validar la cotización y bloquear su fila hasta el COMMIT: otra emisión de la misma
        -- cotización espera aquí y luego ve cpoliza <> 0. Los mensajes empiezan con un código que el
        -- servicio traduce a HTTP (COTIZACION_NO_EXISTE 404, COTIZACION_EMITIDA 409, COTIZACION_NO_COINCIDE 422).
        DECLARE @cot_cramo INT, @cot_iestado CHAR(1), @cot_cprog VARCHAR(20), @cot_cpoliza NUMERIC(19),
                @cot_cnpoliza VARCHAR(30), @cot_cplan VARCHAR(10), @cot_fdesde DATE, @cot_fhasta DATE,
                @cot_cmarca VARCHAR(6), @cot_cmodelo VARCHAR(6), @cot_cversion VARCHAR(6), @cot_cano INT,
                @cot_mvalor NUMERIC(18,2), @cot_msg NVARCHAR(500);

        IF @cproces_cotizacion IS NOT NULL
        BEGIN
            SELECT @cot_cramo = cramo, @cot_iestado = iestado, @cot_cprog = RTRIM(cprog), @cot_cpoliza = cpoliza,
                   @cot_cnpoliza = RTRIM(cnpoliza), @cot_cplan = RTRIM(cplan), @cot_fdesde = fdesde, @cot_fhasta = fhasta
            FROM sopoliza WITH (UPDLOCK, HOLDLOCK)
            WHERE cproces = @cproces_cotizacion;

            IF @cot_cramo IS NULL OR @cot_cramo <> 18 OR @cot_iestado <> 'S' OR ISNULL(@cot_cprog, '') <> 'Emi_Auto'
            BEGIN
                SET @cot_msg = CONCAT(N'COTIZACION_NO_EXISTE: no existe una cotización de automóvil con el número ', @cproces_cotizacion, N'.');
                THROW 99140, @cot_msg, 1;
            END;

            -- [cotizacion anulada 17-nov-2026] Una cotización cuya póliza se anuló vuelve a estar libre (Miguel Arzualde).
            IF ISNULL(@cot_cpoliza, 0) <> 0 AND NOT (EXISTS (SELECT 1 FROM adpoliza ax WHERE ax.cpoliza = @cot_cpoliza AND (ax.istatpol = 'A' OR ax.iestado = 'N')) AND NOT EXISTS (SELECT 1 FROM adpoliza ax WHERE ax.cpoliza = @cot_cpoliza AND ISNULL(ax.istatpol, '') <> 'A' AND ISNULL(ax.iestado, '') <> 'N'))
            BEGIN
                SET @cot_msg = CONCAT(N'COTIZACION_EMITIDA: la cotización ', @cproces_cotizacion, N' ya fue emitida (póliza ',
                    ISNULL(NULLIF(@cot_cnpoliza, ''), CONVERT(VARCHAR(19), @cot_cpoliza)), N').');
                THROW 99141, @cot_msg, 1;
            END;

            IF UPPER(TRIM(ISNULL(@itipoEmi, 'NU'))) <> 'NU'
                THROW 99142, N'COTIZACION_NO_COINCIDE: una cotización solo se emite como póliza nueva (itipoEmi NU).', 1;

            IF NULLIF(TRIM(@cplan), '') IS NOT NULL AND TRIM(@cplan) <> @cot_cplan
            BEGIN
                SET @cot_msg = CONCAT(N'COTIZACION_NO_COINCIDE: el plan enviado (', TRIM(@cplan), N') no es el de la cotización (', @cot_cplan, N').');
                THROW 99142, @cot_msg, 1;
            END;

            -- [ccerti 05-nov-2026] Opción (ccerti) que se emite.
            IF @ccerti_cotizacion IS NULL
            BEGIN
                IF (SELECT COUNT(DISTINCT ccerti) FROM sopoltar WHERE cproces = @cproces_cotizacion) > 1
                BEGIN
                    SET @cot_msg = CONCAT(N'COTIZACION_NO_COINCIDE: la cotización ', @cproces_cotizacion,
                        N' tiene varias opciones de cobertura; indique cuál se emite (ccerti_cotizacion).');
                    THROW 99142, @cot_msg, 1;
                END;
                SELECT @ccerti_cotizacion = MIN(ccerti) FROM sopoltar WHERE cproces = @cproces_cotizacion;
                SET @ccerti_cotizacion = ISNULL(@ccerti_cotizacion, 1);
            END
            ELSE IF NOT EXISTS (SELECT 1 FROM sopoltar WHERE cproces = @cproces_cotizacion AND ccerti = @ccerti_cotizacion)
            BEGIN
                SET @cot_msg = CONCAT(N'COTIZACION_NO_EXISTE: la cotización ', @cproces_cotizacion, N' no tiene la opción ', @ccerti_cotizacion, N'.');
                THROW 99140, @cot_msg, 1;
            END;

            SELECT TOP 1 @cot_cmarca = TRIM(cmarca), @cot_cmodelo = TRIM(cmodelo), @cot_cversion = TRIM(cversion),
                   @cot_cano = cano, @cot_mvalor = mvalor
            FROM vhofcert
            WHERE cproces = @cproces_cotizacion AND ccerti = @ccerti_cotizacion;   -- [ccerti 05-nov-2026]

            IF NOT EXISTS (SELECT 1 FROM sopoltar WHERE cproces = @cproces_cotizacion AND ccerti = @ccerti_cotizacion AND ISNULL(mprimaext, 0) > 0)   -- [ccerti 05-nov-2026]
            BEGIN
                SET @cot_msg = CONCAT(N'COTIZACION_NO_COINCIDE: la cotización ', @cproces_cotizacion, N' no tiene coberturas con prima en la opción ', @ccerti_cotizacion, N'.');
                THROW 99142, @cot_msg, 1;
            END;

            -- [ccerti 05-nov-2026] La opción debe seguir siendo la que aceptó el cliente: misma prima (tolerancia de redondeo 0,01).
            IF @mprima_esperada IS NOT NULL
            BEGIN
                DECLARE @cot_prima_opcion NUMERIC(18,2);
                SELECT @cot_prima_opcion = ROUND(ISNULL(SUM(mprimaext), 0), 2)
                FROM sopoltar WHERE cproces = @cproces_cotizacion AND ccerti = @ccerti_cotizacion;
                IF ABS(@cot_prima_opcion - @mprima_esperada) > 0.01
                BEGIN
                    SET @cot_msg = CONCAT(N'COTIZACION_NO_COINCIDE: la opción ', @ccerti_cotizacion, N' de la cotización ', @cproces_cotizacion,
                        N' suma ', @cot_prima_opcion, N' USD y se esperaba ', @mprima_esperada, N' USD: la cotización cambió.');
                    THROW 99142, @cot_msg, 1;
                END;
            END;

            -- La prima cotizada es por el período de la cotización: anual con anual, o el mismo número de días.
            IF @fdesde IS NOT NULL AND @fhasta IS NOT NULL
               AND NOT (DATEDIFF(DAY, @fdesde, @fhasta) >= 360 AND DATEDIFF(DAY, @cot_fdesde, @cot_fhasta) >= 360)
               AND DATEDIFF(DAY, @fdesde, @fhasta) <> DATEDIFF(DAY, @cot_fdesde, @cot_fhasta)
            BEGIN
                SET @cot_msg = CONCAT(N'COTIZACION_NO_COINCIDE: la vigencia enviada (', DATEDIFF(DAY, @fdesde, @fhasta),
                    N' días) no es la de la cotización (', DATEDIFF(DAY, @cot_fdesde, @cot_fhasta), N' días).');
                THROW 99142, @cot_msg, 1;
            END;

            SET @cplan = @cot_cplan;
            SET @cramo = 18;
            SET @msumaaseg = @cot_mvalor;
        END;

        -- 1. Validaciones preventivas del Tipo de Emisión (itipoEmi)
        IF @itipoEmi IS NULL OR TRIM(@itipoEmi) = ''
            SET @itipoEmi = 'NU';

        IF UPPER(TRIM(@itipoEmi)) NOT IN ('NU', 'SO', 'RE', 'RM')
        BEGIN
            THROW 99001, 'Tipo de emisión inválido. Debe ser NU (Nueva), SO (Solicitud), RE (Renovación) o RM (Reemisión).', 1;
        END;

        -- Auto-detección de coberturas adicionales si se reciben tasas de casco
        IF (@tasaCa > 0 OR @tasaPt > 0) AND (@coberAdicional IS NULL OR @coberAdicional = 'RC')
        BEGIN
            IF @tasaCa > 0 SET @coberAdicional = 'CA';
            ELSE IF @tasaPt > 0 SET @coberAdicional = 'PT';
        END;


        -- Circular SAA-02-1079-2026 — debida diligencia
        IF @itipo_diligencia IS NULL
            SET @itipo_diligencia = 'C'; -- legacy: default conservador DDC

        IF @itipo_diligencia NOT IN ('S', 'C')
            THROW 99010, 'itipo_diligencia inválido. Use S (simplificada) o C (completa).', 1;

        IF @itipo_diligencia = 'S' AND @icedula_tomador IN ('J', 'G', 'C')
            THROW 99011, 'Persona jurídica no aplica debida diligencia simplificada (Circular SAA-02-1079-2026).', 1;

        IF @itipo_diligencia = 'S'
        BEGIN
            IF NULLIF(LTRIM(RTRIM(@xdireccion_tomador)), '') IS NULL
                THROW 99012, 'Debida diligencia simplificada requiere dirección del tomador.', 1;
            IF @cprofesion_tomador IS NULL AND @cactividad_tomador IS NULL
               AND (ISNULL(@bocupacion_separada, 0) = 0 OR @cocupacion_tomador IS NULL) -- [ocupacion 29-oct-2026]
                THROW 99013, 'Debida diligencia simplificada requiere profesión o actividad económica del tomador.', 1;
        END;

        -- [ocupacion 29-oct-2026] Sin la ocupación aparte no se envía nada nuevo a la emisión.
        SET @bocupacion_separada = ISNULL(@bocupacion_separada, 0);
        IF @bocupacion_separada = 0
        BEGIN
            SET @cocupacion_tomador = NULL;
            SET @cocupacion_titular = NULL;
        END;
        IF (@cocupacion_tomador IS NULL AND @cocupacion_titular IS NOT NULL)
            SET @cocupacion_tomador = @cocupacion_titular;
        IF (@cocupacion_titular IS NULL AND @cocupacion_tomador IS NOT NULL)
            SET @cocupacion_titular = @cocupacion_tomador;

        -- Herencia profesión/actividad tomador ↔ titular
        IF (@cprofesion_tomador IS NULL AND @cprofesion_titular IS NOT NULL)
            SET @cprofesion_tomador = @cprofesion_titular;
        IF (@cprofesion_titular IS NULL AND @cprofesion_tomador IS NOT NULL)
            SET @cprofesion_titular = @cprofesion_tomador;
        IF (@cactividad_tomador IS NULL AND @cactividad_titular IS NOT NULL)
            SET @cactividad_tomador = @cactividad_titular;
        IF (@cactividad_titular IS NULL AND @cactividad_tomador IS NOT NULL)
            SET @cactividad_titular = @cactividad_tomador;

        -- 2. Asignación y herencia en cascada de actores (Tomador, Titular/Asegurado, Beneficiario)
        IF (@xrif_tomador IS NULL OR @xrif_tomador = 0) AND (@xrif_titular IS NOT NULL AND @xrif_titular > 0)
        BEGIN
            SET @xrif_tomador           = @xrif_titular;
            SET @icedula_tomador        = ISNULL(@icedula_tomador, @icedula_titular);
            SET @xnombre_tomador        = ISNULL(NULLIF(TRIM(@xnombre_tomador), ''), @xnombre_titular);
            SET @xapellido_tomador      = ISNULL(NULLIF(TRIM(@xapellido_tomador), ''), @xapellido_titular);
            SET @isexo_tomador          = ISNULL(@isexo_tomador, @isexo_titular);
            SET @iestado_civil_tomador  = ISNULL(@iestado_civil_tomador, @iestado_civil_titular);
            SET @fnac_tomador           = ISNULL(@fnac_tomador, @fnac_titular);
            SET @cestado_tomador        = ISNULL(NULLIF(TRIM(@cestado_tomador), ''), @cestado_titular);
            SET @cciudad_tomador        = ISNULL(NULLIF(TRIM(@cciudad_tomador), ''), @cciudad_titular);
            SET @xdireccion_tomador     = ISNULL(NULLIF(TRIM(@xdireccion_tomador), ''), @xdireccion_titular);
            SET @xtelefono_tomador      = ISNULL(NULLIF(TRIM(@xtelefono_tomador), ''), @xtelefono_titular);
            SET @xcorreo_tomador        = ISNULL(NULLIF(TRIM(@xcorreo_tomador), ''), @xcorreo_titular);
            SET @cpais_tomador          = ISNULL(@cpais_tomador, @cpais_titular); -- [cpais 23-oct-2026]
        END;

        IF (@xrif_titular IS NULL OR @xrif_titular = 0) AND (@xrif_tomador IS NOT NULL AND @xrif_tomador > 0)
        BEGIN
            SET @xrif_titular           = @xrif_tomador;
            SET @icedula_titular        = ISNULL(@icedula_titular, @icedula_tomador);
            SET @xnombre_titular        = ISNULL(NULLIF(TRIM(@xnombre_titular), ''), @xnombre_tomador);
            SET @xapellido_titular      = ISNULL(NULLIF(TRIM(@xapellido_titular), ''), @xapellido_tomador);
            SET @isexo_titular          = ISNULL(@isexo_titular, @isexo_tomador);
            SET @iestado_civil_titular  = ISNULL(@iestado_civil_titular, @iestado_civil_tomador);
            SET @fnac_titular           = ISNULL(@fnac_titular, @fnac_tomador);
            SET @cestado_titular        = ISNULL(NULLIF(TRIM(@cestado_titular), ''), @cestado_tomador);
            SET @cciudad_titular        = ISNULL(NULLIF(TRIM(@cciudad_titular), ''), @cciudad_tomador);
            SET @xdireccion_titular     = ISNULL(NULLIF(TRIM(@xdireccion_titular), ''), @xdireccion_tomador);
            SET @xtelefono_titular      = ISNULL(NULLIF(TRIM(@xtelefono_titular), ''), @xtelefono_tomador);
            SET @xcorreo_titular        = ISNULL(NULLIF(TRIM(@xcorreo_titular), ''), @xcorreo_tomador);
            SET @cpais_titular          = ISNULL(@cpais_titular, @cpais_tomador); -- [cpais 23-oct-2026]
        END;

        IF @icedula_titular IS NULL SET @icedula_titular = 'V';
        IF @icedula_tomador IS NULL SET @icedula_tomador = @icedula_titular;

        -- 3. Manejo diferenciado según Tipo de Emisión (RE, RM, NU)
        IF UPPER(TRIM(@itipoEmi)) IN ('RE', 'RM')
        BEGIN
            IF @cnpoliza_rel IS NULL OR TRIM(@cnpoliza_rel) = ''
            BEGIN
                THROW 99001, 'Para Renovaciones (RE) y Reemisiones (RM) es obligatorio enviar el número de póliza previa (cnpoliza_rel).', 1;
            END;

            -- Buscar la póliza original registrada para mantener estricta continuidad del histórico (cpoliza y cnpoliza)
            DECLARE @exist_cpoliza NUMERIC(19), @exist_cnpoliza VARCHAR(30), @exist_cramo INT, @exist_cplan VARCHAR(10),
                    @exist_casegurado NUMERIC(13), @exist_ctenedor NUMERIC(13),
                    @exist_xplaca VARCHAR(15), @exist_xsercar VARCHAR(60), @exist_xsermot VARCHAR(60),
                    @exist_cmarca VARCHAR(3), @exist_cmodelo VARCHAR(3), @exist_cversion VARCHAR(3),
                    @exist_cano SMALLINT, @exist_xcolor VARCHAR(60), @exist_ccategoria_uso INT,
                    @exist_npuestos INT, @max_fhasta DATE,
                    @exist_msumaaseg NUMERIC(18,2), @exist_mprima NUMERIC(18,2), @exist_ptasamon NUMERIC(18,6);

            SELECT TOP 1
                @exist_cpoliza   = P.cpoliza,
                @exist_cnpoliza  = P.cnpoliza,
                @exist_cramo     = P.cramo,
                @exist_cplan     = P.cplan,
                @exist_casegurado = P.casegurado,
                @exist_ctenedor   = P.ctenedor,
                @exist_xplaca    = V.xplaca,
                @exist_xsercar   = V.xsercar,
                @exist_xsermot   = V.xsermot,
                @exist_cmarca    = V.cmarca,
                @exist_cmodelo   = V.cmodelo,
                @exist_cversion  = V.cversion,
                @exist_cano      = V.cano,
                @exist_xcolor    = V.xcolor,
                @exist_ccategoria_uso = V.cuso,
                @exist_npuestos  = V.qpuestos
            FROM adpoliza P WITH (NOLOCK)
            LEFT JOIN vhcerti V WITH (NOLOCK) ON P.cpoliza = V.cpoliza
            WHERE P.cnpoliza = TRIM(@cnpoliza_rel) OR P.cnpoliza_rel = TRIM(@cnpoliza_rel)
            ORDER BY P.fanopol DESC, P.fmespol DESC;

            IF @exist_cpoliza IS NULL
            BEGIN
                THROW 99001, 'No se encontró la póliza original asociada a cnpoliza_rel para realizar la renovación o reemisión.', 1;
            END;

            -- Bloqueo: No se pueden renovar pólizas con recibos pendientes de pago
            IF UPPER(TRIM(@itipoEmi)) = 'RE'
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM adrecibos WITH (NOLOCK)
                    WHERE (cnpoliza = TRIM(@cnpoliza_rel) OR cpoliza = @exist_cpoliza)
                      AND (iestadorec = 'P' OR (iestadorec NOT IN ('C', 'A') AND fcobro IS NULL))
                )
                BEGIN
                    THROW 99001, 'No se puede renovar la póliza porque posee recibos pendientes de pago.', 1;
                END;

                -- En Renovación (RE), calcular vigencia 100% internamente a partir de la última fecha de fin (MAX fhasta)
                SELECT @max_fhasta = MAX(fhasta)
                FROM adpoliza WITH (NOLOCK)
                WHERE cnpoliza = TRIM(@cnpoliza_rel) OR cnpoliza_rel = TRIM(@cnpoliza_rel);

                IF @max_fhasta IS NULL
                    SELECT TOP 1 @max_fhasta = fhasta FROM adpoliza WHERE cpoliza = @exist_cpoliza ORDER BY fanopol DESC;

                IF @max_fhasta IS NULL SET @max_fhasta = CAST(GETDATE() AS DATE);

                SET @fdesde = @max_fhasta;
                SET @fhasta = DATEADD(YEAR, 1, @fdesde);
            END;

            -- 🔑 RECUPERAR VALORES FINANCIEROS VÁLIDOS (msumaaseg, mprima, ptasamon > 0) DE LA PÓLIZA EXISTENTE SI VIENEN EN NULL O 0
            SELECT TOP 1
                @exist_msumaaseg = R.msumabruta,
                @exist_mprima    = R.mprimabruta,
                @exist_ptasamon  = R.ptasamon
            FROM adrecibos R WITH (NOLOCK)
            WHERE (R.cpoliza = @exist_cpoliza OR R.cnpoliza = TRIM(@cnpoliza_rel))
              AND R.msumabruta > 0
            ORDER BY R.fanopol DESC, R.fmespol DESC;

            IF (@exist_msumaaseg IS NULL OR @exist_msumaaseg <= 0)
            BEGIN
                SELECT TOP 1 @exist_msumaaseg = mvalor
                FROM vhcerti WITH (NOLOCK)
                WHERE (cpoliza = @exist_cpoliza OR cnpoliza = TRIM(@cnpoliza_rel))
                  AND mvalor > 0
                ORDER BY fanopol DESC;
            END;

            -- Mantener EXACTAMENTE cpoliza y cnpoliza originales para el histórico
            SET @cpoliza   = @exist_cpoliza;
            SET @cnpoliza  = @exist_cnpoliza;

            -- Autocompletar campos omitidos utilizando los datos de la póliza registrada
            SET @cplan           = ISNULL(NULLIF(TRIM(@cplan), ''), @exist_cplan);
            SET @cramo           = ISNULL(@cramo, @exist_cramo);
            SET @xrif_titular    = ISNULL(NULLIF(@xrif_titular, 0), @exist_casegurado);
            SET @xrif_tomador    = ISNULL(NULLIF(@xrif_tomador, 0), @exist_ctenedor);
            SET @xplaca          = ISNULL(NULLIF(TRIM(@xplaca), ''), @exist_xplaca);
            SET @xsercar         = ISNULL(NULLIF(TRIM(@xsercar), ''), @exist_xsercar);
            SET @xsermot         = ISNULL(NULLIF(TRIM(@xsermot), ''), @exist_xsermot);
            SET @cmarca          = ISNULL(NULLIF(TRIM(@cmarca), ''), @exist_cmarca);
            SET @cmodelo         = ISNULL(NULLIF(TRIM(@cmodelo), ''), @exist_cmodelo);
            SET @cversion        = ISNULL(NULLIF(TRIM(@cversion), ''), @exist_cversion);
            SET @cano            = ISNULL(NULLIF(@cano, 0), @exist_cano);
            SET @xcolor          = ISNULL(NULLIF(TRIM(@xcolor), ''), @exist_xcolor);
            SET @ccategoria_uso  = ISNULL(NULLIF(@ccategoria_uso, 0), @exist_ccategoria_uso);
            SET @npuestos        = ISNULL(NULLIF(@npuestos, 0), @exist_npuestos);
            SET @msumaaseg      = ISNULL(NULLIF(@msumaaseg, 0), @exist_msumaaseg);
            SET @mprima          = 0;
            SET @ptasamon        = ISNULL(NULLIF(@ptasamon, 0), @exist_ptasamon);


            -- Completar nombres/apellidos si no fueron proporcionados
            IF (@xnombre_titular IS NULL OR TRIM(@xnombre_titular) = '') AND @xrif_titular IS NOT NULL
            BEGIN
                SELECT TOP 1
                    @xnombre_titular = xnombre,
                    @xapellido_titular = xapellido
                FROM maclient WITH (NOLOCK)
                WHERE cci_rif = @xrif_titular;
            END;

            IF (@xnombre_tomador IS NULL OR TRIM(@xnombre_tomador) = '') AND @xrif_tomador IS NOT NULL
            BEGIN
                SELECT TOP 1
                    @xnombre_tomador = xnombre,
                    @xapellido_tomador = xapellido
                FROM maclient WITH (NOLOCK)
                WHERE cci_rif = @xrif_tomador;
            END;
        END
        ELSE
        BEGIN
            -- Para Emisiones Nuevas ('NU', 'SO'), se exigen todos los datos obligatorios del payload
            IF @cplan IS NULL OR TRIM(@cplan) = ''
                THROW 99001, 'El código de plan (cplan) es obligatorio para emisiones nuevas.', 1;

            IF @xrif_titular IS NULL OR @xrif_titular = 0
                THROW 99001, 'El RIF/Cédula del titular o tomador (xrif_titular/xrif_tomador) es obligatorio para emisiones nuevas.', 1;

            IF @xnombre_titular IS NULL OR TRIM(@xnombre_titular) = ''
                THROW 99001, 'El nombre del titular o tomador es obligatorio para emisiones nuevas.', 1;

            IF @icedula_titular NOT IN ('J', 'G', 'C') AND (@xapellido_titular IS NULL OR TRIM(@xapellido_titular) = '')
                THROW 99001, 'El apellido del titular o tomador es obligatorio para emisiones nuevas.', 1;

            IF @xplaca IS NULL OR TRIM(@xplaca) = ''
                THROW 99001, 'La placa del vehículo (xplaca) es obligatoria para emisiones nuevas.', 1;

            IF @xsercar IS NULL OR TRIM(@xsercar) = ''
                THROW 99001, 'El serial de carrocería del vehículo (xsercar) es obligatorio para emisiones nuevas.', 1;

            IF @xmarca IS NULL OR TRIM(@xmarca) = ''
                THROW 99001, 'La marca del vehículo (xmarca) es obligatoria para emisiones nuevas.', 1;

            IF @xmodelo IS NULL OR TRIM(@xmodelo) = ''
                THROW 99001, 'El modelo del vehículo (xmodelo) es obligatorio para emisiones nuevas.', 1;

            IF @xversion IS NULL OR TRIM(@xversion) = ''
                THROW 99001, 'La versión del vehículo (xversion) es obligatoria para emisiones nuevas.', 1;

            IF @cano IS NULL OR @cano <= 1900
                THROW 99001, 'El año del vehículo (cano) es obligatorio y debe ser mayor a 1900 para emisiones nuevas.', 1;

            IF @ccategoria_uso IS NULL OR @ccategoria_uso = 0
                THROW 99001, 'La categoría de uso del vehículo (ccategoria_uso) es obligatoria para emisiones nuevas.', 1;

            --IF @mprima IS NULL OR @mprima <= 0
            --    THROW 99001, 'El monto de prima (mprima) es obligatorio y debe ser mayor a 0 para emisiones nuevas.', 1;

            --IF @msumaaseg IS NULL OR @msumaaseg <= 0
            --    THROW 99001, 'La suma asegurada (msumaaseg) es obligatoria y debe ser mayor a 0 para emisiones nuevas.', 1;
        END;

        -- 4. Ajustes iniciales
        IF @cproductor = 0 SET @cproductor = 80080;

        -- Lógica de resolución de canal
        IF (@ccanalalt IS NOT NULL)
        BEGIN
            SELECT @ctipocanal = ctipocanal FROM macanalalt WHERE ccanalalt = @ccanalalt;
            SELECT @cgestor = cgestor FROM magestor WHERE ccanalalt = @ccanalalt AND cscanalalt = @cscanalalt;
        END
        ELSE
        BEGIN
            SELECT @cgestor = cgestor, @ctipocanal = ctipocanal, @ccanalalt = ccanalalt, @cscanalalt = cscanalalt
            FROM magestor
            WHERE cgestor = CAST(@cproductor AS VARCHAR(30));

            IF (@ctipocanal IS NULL)
            BEGIN
                IF (@cproductor = 80080) SET @ctipocanal = 'D';
                ELSE SET @ctipocanal = 'T';
            END
        END

        IF (@cproductor = 80080 OR @cproductor IS NULL) SET @ctipocanal = 'D';
        IF @cusuario IS NULL SET @cusuario = 1422;

        -- Obtener ramo desde el plan
        IF @cramo IS NULL
        	SELECT @cramo = cramo FROM maplanes WHERE cplan = @cplan AND iestado = 'V';

        -- Obtener tipo de categoría
        SELECT TOP 1 @ctipo = ctipo FROM macategtr WHERE ccategotr = @ccategoria_uso AND cramo = @cramo;

        -- 5. Obtener sucursal desde maclient_api
        SELECT TOP 1 @csucur = csucur FROM maclient_api WHERE ifuente_api = @ifuente;
        IF @csucur IS NULL SET @csucur = 1;

        -- 6. Validar automóvil (solo aplica validación de placa/serial vigente para emisiones nuevas)
        IF UPPER(TRIM(@itipoEmi)) IN ('NU', 'SO')
        BEGIN

	        SET @mprima_servicio = @mprima;
            SET @iplaca = ISNULL(NULLIF(TRIM(@iplaca), ''), 'N');
            SET @puestos_calc = ISNULL(NULLIF(@npuestos, 0), 5);
            SET @uso_calc = ISNULL(@ccategoria_uso, 1);

            -- Preferir tipo/uso/puestos desde VINMA (misma lógica que endosos/emisión)
            IF EXISTS (
                SELECT 1 FROM vinma
                WHERE cmarca = @cmarca AND cmodelo = @cmodelo AND cversion = @cversion AND cano = @cano
            )
            BEGIN
                SELECT TOP 1
                    @ctipo = ctipo,
                    @uso_calc = CASE WHEN ISNULL(ccategotr, 0) > 0 THEN ccategotr ELSE @uso_calc END,
                    @puestos_calc = CASE WHEN ISNULL(npasajero, 0) > 0 THEN npasajero ELSE @puestos_calc END
                FROM vinma
                WHERE cmarca = @cmarca AND cmodelo = @cmodelo AND cversion = @cversion AND cano = @cano;
            END
            ELSE IF @ctipo IS NULL
            BEGIN
                SELECT TOP 1 @ctipo = ctipo FROM macategtr WHERE ccategotr = @uso_calc;
            END;

            IF @ctipo IS NULL SET @ctipo = 1;

            CREATE TABLE #montos_cotiza (
                cplan CHAR(50),
                xplan CHAR(70),
                ccobertura CHAR(4),
                xdescripcion_l CHAR(60),
                cproducto NVARCHAR(6),
                cmoneda CHAR(10),
                nubii NUMERIC(6),
                tasaCA NUMERIC(18,6),
                tasaPT NUMERIC(18,6),
                tasaPP DECIMAL(18,2),
                primaBlCA NUMERIC(18,6),
                primaBLPT NUMERIC(18,6),
                primaAdCA NUMERIC(18,6),
                primaAdPT NUMERIC(18,6),
                primaAdPP NUMERIC(18,6),
                prima NUMERIC(18,6),
                masegurada NUMERIC(18,6),
                ctarifa CHAR(4),
                cramoint CHAR(4),
                ccoberturaint CHAR(4),
                xcobertura NVARCHAR(30),
                xvalor NVARCHAR(2),
                badicional BIT
            );

            SET @ntoneladas = ISNULL(@ntoneladas, 0);
            SET @precargorcv = ISNULL(@precargorcv, 0);
            SET @cusuario = ISNULL(@cusuario, 1422);
            SET @coberAdicional = ISNULL(@coberAdicional, 'RC');

            -- [cotizacion 02-nov-2026] Con cotización la prima anual es la de sopoltar (USD, ya con recargo/descuento).
            IF @cproces_cotizacion IS NOT NULL
                INSERT INTO #montos_cotiza (cplan, ccobertura, prima, masegurada, ccoberturaint)
                SELECT @cplan, ccober, ISNULL(mprimaext, 0), ISNULL(msumaasegext, 0), CONVERT(VARCHAR(4), ccoberturaint)
                FROM sopoltar
                WHERE cproces = @cproces_cotizacion AND ccerti = @ccerti_cotizacion;   -- [ccerti 05-nov-2026]
            ELSE
            INSERT INTO #montos_cotiza
            EXEC sp_calculo_auto_nexus
                @cmarca = @cmarca,
                @cmodelo = @cmodelo,
                @cversion = @cversion,
                @cano = @cano,
                @cplan = @cplan,
                @sumaAseg = @msumaaseg,
                @sumaAsegBl = @msumaaseg,
                @sumaAsegAd = 0,
                @iplaca = @iplaca,
                @fdesde = @fdesde,
                @fhasta = @fhasta,
                @tasaPt = @tasaPt,
                @tasaCa = @tasaCa,
                @tasaPp = @tasaPp,
                @recargo = 0,
                @tipoV = @ctipo,
                @uso = @uso_calc,
                @puestos = @puestos_calc,
                @toneladas = @ntoneladas,
                @recargoRcv = @precargorcv,
                @cramo = @cramo,
                @cusuario = @cusuario,
                @coberAdicional = @coberAdicional,
                @incluirTotales = 0,
                @ifrecuencia = 'A'; -- Siempre anual: el fraccionamiento lo hace la generación de recibos.

            SELECT @mprima = ROUND(ISNULL(SUM(prima), 0), 2) FROM #montos_cotiza;

            DROP TABLE #montos_cotiza;

            IF @mprima IS NULL OR @mprima <= 0
                THROW 99001, 'No se pudo cotizar la prima anual en BD (sp_calculo_auto_nexus). Verifique plan, vehículo y coberturas.', 1;

            -- Traza opcional: comparar lo enviado por el servicio vs lo cotizado en BD
            IF @mprima_servicio IS NOT NULL AND @mprima_servicio > 0 AND @mprima_servicio <> @mprima
            BEGIN
                SET @xlog = CONCAT(
                    'mprima_servicio=', CONVERT(VARCHAR(30), @mprima_servicio),
                    '; mprima_anual_bd=', CONVERT(VARCHAR(30), @mprima),
                    '; ifrecuencia=', ISNULL(@ifrecuencia, '')
                );
            END;

            EXEC spee_validate_automovil_general_nexus
                @cplan = @cplan,
                @xplaca = @xplaca,
                @xsercar = @xsercar,
                @xsermot = @xsermot;
        END;

        -- 7. Crear o vincular ítem en INMA si es necesario
        EXEC sp_create_inma_item_nexus
            @xmarca = @xmarca,
            @xmodelo = @xmodelo,
            @xversion = @xversion,
            @cano = @cano,
            @ctipo = @ctipo,
            @xtransm = NULL,
            @xmotor = NULL,
            @mvalor = NULL,
            @npasajero = @npuestos,
            @cuso = @ccategoria_uso,
            @xclasificacion = NULL,
            @cusuario = @cusuario,
            @cmarca = @cmarca OUTPUT,
            @cmodelo = @cmodelo OUTPUT,
            @cversion = @cversion OUTPUT,
            @cerror = @cerror OUTPUT,
            @xerror = @xerror OUTPUT;

        IF @cerror IS NOT NULL AND @cerror <> 0
        BEGIN
            THROW 99001, @xerror, 1;
        END;

        -- [cotizacion 02-nov-2026] El vehículo (INMA) debe ser el de la cotización.
        IF @cproces_cotizacion IS NOT NULL
           AND (ISNULL(TRIM(@cmarca), '') <> ISNULL(@cot_cmarca, '') OR ISNULL(TRIM(@cmodelo), '') <> ISNULL(@cot_cmodelo, '')
                OR ISNULL(TRIM(@cversion), '') <> ISNULL(@cot_cversion, '') OR ISNULL(@cano, 0) <> ISNULL(@cot_cano, 0))
        BEGIN
            SET @cot_msg = CONCAT(N'COTIZACION_NO_COINCIDE: el vehículo enviado (', TRIM(@cmarca), N'/', TRIM(@cmodelo), N'/', TRIM(@cversion), N'/', @cano,
                N') no es el de la cotización (', @cot_cmarca, N'/', @cot_cmodelo, N'/', @cot_cversion, N'/', @cot_cano, N').');
            THROW 99142, @cot_msg, 1;
        END;

        -- 8. Ajustar fechas por defecto para emisiones nuevas
        IF UPPER(TRIM(@itipoEmi)) NOT IN ('RE')
        BEGIN
            IF @femision IS NULL SET @femision = CAST(GETDATE() AS DATE);
            IF @fdesde IS NULL SET @fdesde = CAST(@femision AS DATE);
            IF @fhasta IS NULL SET @fhasta = DATEADD(YEAR, 1, @fdesde);
        END
        ELSE
        BEGIN
            IF @femision IS NULL SET @femision = CAST(GETDATE() AS DATE);
        END;

        -- 9. Generar números de recibo y proceso mediante contador
        IF @csucur IS NULL SET @csucur = 1;

        IF UPPER(TRIM(@itipoEmi)) IN ('RE', 'RM')
        BEGIN
            -- Para Renovaciones y Reemisiones, solo generamos nuevo recibo y proceso (reutilizando cpoliza y cnpoliza)
            DECLARE @dummy_cpoliza NUMERIC(19), @dummy_cnpoliza VARCHAR(30);
            EXEC sp_contador_nexus
                @dummy_cpoliza OUTPUT,
                @dummy_cnpoliza OUTPUT,
                @crecibo OUTPUT,
                @cnrecibo OUTPUT,
                @cproces OUTPUT,
                @csucur,
                @fdesde,
                @cramo,
                'POL_VEH';
        END
        ELSE
        BEGIN
            -- Para Emisiones Nuevas (NU/SO), generamos cpoliza y cnpoliza nuevos
            EXEC sp_contador_nexus
                @cpoliza OUTPUT,
                @cnpoliza_cont OUTPUT,
                @crecibo OUTPUT,
                @cnrecibo OUTPUT,
                @cproces OUTPUT,
                @csucur,
                @fdesde,
                @cramo,
                'POL_VEH';

            IF @cnpoliza IS NULL
            BEGIN
                SELECT @qcontador = qcontador FROM macontadores WHERE ccontador = 'POL_VEH';
                SET @cnpoliza = CONVERT(VARCHAR, @cramo) + '-' + CONVERT(VARCHAR, @csucur) + '-' + FORMAT(@qcontador, '0000000000');
            END;

            IF EXISTS (SELECT 1 FROM adpoliza WHERE cnpoliza = @cnpoliza)
                THROW 99001, 'Nro. de Póliza Rel ya existente.', 1;
        END;

        -- [cotizacion 02-nov-2026] La póliza conserva el cproces de la cotización, como spEmiAuto. sp_genera_coberturas busca la
        -- póliza solo por cproces: si otra póliza ya usa ese número se deja el del contador para no escribir sobre
        -- ella; el vínculo con la cotización queda en sopoliza.cpoliza.
        IF @cproces_cotizacion IS NOT NULL AND NOT EXISTS (SELECT 1 FROM adpoliza WHERE cproces = @cproces_cotizacion)
            SET @cproces = @cproces_cotizacion;

        SET @iestado = 1;
        SET @xestado = 'PENDING';
        SET @xlog = NULL;

        -- 10. Insertar registro en tabla de emisión (TMEMISION_AUTOMOVIL_RCV2)
        INSERT INTO TMEMISION_AUTOMOVIL_RCV2 (
            cnpoliza_rel, cplan, cramo, xcanal_venta, icedula_tomador, xrif_tomador, xnombre_tomador, xapellido_tomador,
            isexo_tomador, iestado_civil_tomador, fnac_tomador, cestado_tomador, cciudad_tomador, xdireccion_tomador,
            xtelefono_tomador, xcorreo_tomador, icedula_titular, xrif_titular, xnombre_titular, xapellido_titular, isexo_titular,
            iestado_civil_titular, fnac_titular, cestado_titular, cciudad_titular, xdireccion_titular, xtelefono_titular,
            xcorreo_titular, cmarca, cmodelo, cversion, cano, xcolor, xplaca, xsercar, xsermot,
            cpersona_politica, cterm_y_cod, cproductor, ptasamon, mprima, ifrecuencia, femision, corigen_rel, api, method,
            cprog, ifuente, fingreso, cpoliza, cnpoliza, cproces, ccanalalt, cscanalalt, ctipocanal, ccategoria_uso, cmoneda,
            cusuario, ntoneladas, npuestos, precargorcv, iplaca, ptasamon_pago, msumaaseg, xmarca, xmodelo, xversion, fdesde, fhasta,
            itipo_emi, cober_adicional, ptasa_pt, ptasa_ca, ptasa_pp,
            iestado, xestado, xlog,
            icedula_conductor, xrif_conductor, xnombre_conductor, xapellido_conductor, isexo_conductor, iestado_civil_conductor,
            fnac_conductor, cestado_conductor, cciudad_conductor, xdireccion_conductor, xtelefono_conductor, xcorreo_conductor,
            icedula_beneficiario, xrif_beneficiario, xnombre_beneficiario, xapellido_beneficiario, isexo_beneficiario, iestado_civil_beneficiario,
            fnac_beneficiario, cestado_beneficiario, cciudad_beneficiario, xdireccion_beneficiario, xtelefono_beneficiario, xcorreo_beneficiario,
            itipo_diligencia, cprofesion_tomador, cactividad_tomador, cprofesion_titular, cactividad_titular, cgestor
        )
        VALUES (
            @cnpoliza_rel, @cplan, @cramo, @xcanal_venta, @icedula_tomador, @xrif_tomador, @xnombre_tomador, @xapellido_tomador,
            @isexo_tomador, @iestado_civil_tomador, @fnac_tomador, @cestado_tomador, @cciudad_tomador, @xdireccion_tomador,
            @xtelefono_tomador, @xcorreo_tomador, @icedula_titular, @xrif_titular, @xnombre_titular, @xapellido_titular,
            @isexo_titular, @iestado_civil_titular, @fnac_titular, @cestado_titular, @cciudad_titular, @xdireccion_titular,
            @xtelefono_titular, @xcorreo_titular, @cmarca, @cmodelo, @cversion, @cano, @xcolor, @xplaca, @xsercar, @xsermot,
            @cpersona_politica, @cterm_y_cod, @cproductor, @ptasamon, @mprima, @ifrecuencia, @femision, @corigen_rel, @api, @method,
            @cprog, @ifuente, @fingreso, @cpoliza, @cnpoliza, @cproces, @ccanalalt, @cscanalalt, @ctipocanal, @ccategoria_uso,
            @cmoneda, @cusuario, @ntoneladas, @npuestos, @precargorcv, @iplaca, @ptasamon_pago, @msumaaseg, @xmarca, @xmodelo, @xversion, @fdesde, @fhasta,
            @itipoEmi, @coberAdicional, @tasaPt, @tasaCa, @tasaPp,
            @iestado, @xestado, @xlog,
            @icedula_conductor, @xrif_conductor, @xnombre_conductor, @xapellido_conductor, @isexo_conductor, @iestado_civil_conductor,
            @fnac_conductor, @cestado_conductor, @cciudad_conductor, @xdireccion_conductor, @xtelefono_conductor, @xcorreo_conductor,
            @icedula_beneficiario, @xrif_beneficiario, @xnombre_beneficiario, @xapellido_beneficiario, @isexo_beneficiario, @iestado_civil_beneficiario,
            @fnac_beneficiario, @cestado_beneficiario, @cciudad_beneficiario, @xdireccion_beneficiario, @xtelefono_beneficiario, @xcorreo_beneficiario,
            @itipo_diligencia, @cprofesion_tomador, @cactividad_tomador, @cprofesion_titular, @cactividad_titular, @cgestor
        );

        SET @id = SCOPE_IDENTITY();

        -- 11. Invocar sp_emision_automovil_rcv_nexus
        EXEC sp_emision_automovil_rcv_nexus
            @id = @id,
            @pSuccess = @pSuccess OUTPUT,
            @pErrorMessage = @pErrorMessage OUTPUT,
            @cpais_tomador = @cpais_tomador,   -- [cpais 23-oct-2026]
            @cpais_titular = @cpais_titular,   -- [cpais 23-oct-2026]
            @cocupacion_tomador = @cocupacion_tomador,     -- [ocupacion 29-oct-2026]
            @cocupacion_titular = @cocupacion_titular,     -- [ocupacion 29-oct-2026]
            @bocupacion_separada = @bocupacion_separada,   -- [ocupacion 29-oct-2026]
            @cproces_cotizacion = @cproces_cotizacion,     -- [cotizacion 02-nov-2026]
            @ccerti_cotizacion = @ccerti_cotizacion;       -- [ccerti 05-nov-2026]

        -- Si la emisión interna falla, abortar y hacer rollback atómico
        IF @pSuccess = 0 OR @pSuccess IS NULL
        BEGIN
            SET @xerror = ISNULL(@pErrorMessage, 'Error no especificado durante la emisión de la póliza.');
            THROW 99001, @xerror, 1;
        END;

        -- [cotizacion 02-nov-2026] Marcar la cotización como emitida (como spEmiAuto), en la misma transacción.
        IF @cproces_cotizacion IS NOT NULL
        BEGIN
            DECLARE @cot_crecibo NUMERIC(19);
            SELECT TOP 1 @cot_crecibo = crecibo FROM adrecibos WHERE cpoliza = @cpoliza ORDER BY qcuotas, cnrecibo;

            UPDATE sopoliza SET cpoliza = @cpoliza, cnpoliza = @cnpoliza WHERE cproces = @cproces_cotizacion;
            -- [cotizacion anulada 17-nov-2026] Si se reemite tras anular, se quita la marca de la opción emitida antes (puede ser otra).
            UPDATE vhofcert SET cpoliza = 0
            WHERE cproces = @cproces_cotizacion AND ccerti <> @ccerti_cotizacion AND ISNULL(cpoliza, 0) <> 0;
            UPDATE sorecibos SET cpoliza = NULL, cnpoliza = '0', crecibo = NULL
            WHERE cproces = @cproces_cotizacion AND ccerti <> @ccerti_cotizacion AND cpoliza IS NOT NULL;
            -- [ccerti 05-nov-2026] Solo la opción emitida: así se sabe cuál eligió el cliente.
            UPDATE vhofcert SET cpoliza = @cpoliza WHERE cproces = @cproces_cotizacion AND ccerti = @ccerti_cotizacion;
            UPDATE sorecibos SET cpoliza = @cpoliza, cnpoliza = @cnpoliza, crecibo = @cot_crecibo
            WHERE cproces = @cproces_cotizacion AND ccerti = @ccerti_cotizacion;
        END;

        -- Confirmar la transacción única
        IF @TranStarted = 1 AND @@TRANCOUNT > 0
        BEGIN
            COMMIT TRANSACTION;
        END;

    END TRY
    BEGIN CATCH
        -- Garantizar Rollback atómico completo ante cualquier error
        IF @@TRANCOUNT > 0
        BEGIN
            ROLLBACK TRANSACTION;
        END;

        SET @xerror = ERROR_MESSAGE();
        THROW 99001, @xerror, 1;
    END CATCH;
END;
GO

-- ===== 14_spee_validate_automovil_general_nexus.sql =====
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
-- REVERSA: definición de PROD .67 al 20-nov-2026
CREATE OR ALTER PROCEDURE [dbo].[spee_validate_automovil_general_nexus]
    @cplan    VARCHAR(10),
    @xplaca   VARCHAR(15),
    @xsercar  VARCHAR(60),
    @xsermot  VARCHAR(60) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE 
        @cramo INT,
        @error VARCHAR(250);

    -- 1. Validar Plan enviado
    IF @cplan IS NULL OR TRIM(@cplan) = ''
    BEGIN
        SET @error = 'Plan no debe estar vacío.';
    END
    ELSE
    BEGIN
        SELECT @cramo = cramo 
        FROM maplanes 
        WHERE cplan = TRIM(@cplan) AND iestado = 'V';

        IF @cramo IS NULL
	        BEGIN
	            SET @error = 'Plan enviado no se encuentra registrado.';
	        END
        ELSE IF @cramo NOT IN(18, 28)
	        BEGIN
	            SET @error = 'Ramo no corresponde a Automóvil.';
	        END
    END;

    -- 2. Validaciones de datos obligatorios del vehículo (Ramo 18)
    IF @error IS NULL
    BEGIN
        IF @xplaca IS NULL OR TRIM(@xplaca) = ''
        BEGIN
            SET @error = 'Placa no debe estar vacío';
        END
        ELSE IF @xsercar IS NULL OR TRIM(@xsercar) = ''
        BEGIN
            SET @error = 'Serial de Carrocería no debe estar vacío';
        END
    END;

    -- 3. Validar existencia de Póliza Vigente con la misma Placa
    IF @error IS NULL
    BEGIN
        IF EXISTS (
            SELECT 1 
            FROM vhcerti 
            WHERE TRIM(xplaca) = TRIM(@xplaca) 
              AND istatcer = 'V' 
              AND fhasta >= CAST(GETDATE() AS DATE)
        )
        BEGIN
            SET @error = 'Se ha detectado la existencia de una póliza vigente la misma placa del vehículo.';
        END;
    END;

    -- 4. Validar existencia de Póliza Vigente con el mismo Serial de Carrocería
    IF @error IS NULL
    BEGIN
        IF EXISTS (
            SELECT 1 
            FROM vhcerti 
            WHERE TRIM(xsercar) = TRIM(@xsercar) 
              AND istatcer = 'V' 
              AND fhasta >= CAST(GETDATE() AS DATE)
        )
        BEGIN
            SET @error = 'Se ha detectado la existencia de una póliza vigente con el mismo Serial Carrocería del Vehículo.';
        END;
    END;

    -- 5. Disparar excepción consolidada si alguna regla de negocio falló
    IF @error IS NOT NULL
    BEGIN
        THROW 99001, @error, 1;
    END;
END;
GO

