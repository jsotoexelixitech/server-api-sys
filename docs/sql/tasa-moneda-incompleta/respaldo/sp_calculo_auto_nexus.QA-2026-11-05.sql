-- Respaldo de sp_calculo_auto_nexus en QA, 2026-11-05, antes de validar tasas.
GO
CREATE OR ALTER PROCEDURE [dbo].[sp_calculo_auto_nexus]
    @cmarca NVARCHAR(4),
    @cmodelo NVARCHAR(4),
    @cversion NVARCHAR(4),
    @cano INT,
    @cplan NVARCHAR(50),
    @sumaAseg NUMERIC(18, 2),
    @sumaAsegBl NUMERIC(18, 2),
    @sumaAsegAd NUMERIC(18, 2),
    @iplaca CHAR(1),
    @fdesde DATE,
    @fhasta DATE,
    @tasaPt NUMERIC(18, 2),
    @tasaCa NUMERIC(18, 2),
    @tasaPP NUMERIC(18, 2) = 0,
    @recargo NUMERIC(18),
    @tipoV NUMERIC(4),
    @uso NUMERIC(4),
    @puestos NUMERIC(4),
    @toneladas NUMERIC(4),
    @recargoRcv NUMERIC(6, 4),
    @cramo NUMERIC(5) = NULL,
    @cusuario NUMERIC(20) = NULL,
    @coberAdicional VARCHAR(2) = 'RC',
    @incluirTotales BIT = 1,
    @ifrecuencia NVARCHAR(2)
AS
BEGIN
    SET NOCOUNT ON;
	
    IF @cramo IS NULL SET @cramo = 18;
    -- adpoliza/maplanes.cplan es CHAR(6): al asignarlo a VARCHAR quedan espacios
    -- ('Auto  ', 'AutoV '). LIKE no ignora esos espacios y el plan no cotiza
    SET @cplan = NULLIF(RTRIM(@cplan), '');

    -- [R-083100] Plan con RCV aparte (grupo RCVA de separam: ramo + plan -> ramo y plan del RCV). El plan no trae
    -- RCV propio: al pedir solo el RCV ('RC', lo que usa la cotización de valrep) se cotiza el plan del RCV, que es
    -- la póliza que se emite aparte. Sin productor en este SP: gana la regla general (productor vacío).
    IF @coberAdicional = 'RC' AND @cplan IS NOT NULL
    BEGIN
        DECLARE @ramoRcvAparte INT, @cplanRcvAparte NVARCHAR(50);
        SELECT TOP (1) @ramoRcvAparte = r.nentero1, @cplanRcvAparte = NULLIF(TRIM(r.ccaracter1), '')
        FROM separam r
        WHERE r.cgrupparam = 'RCVA' AND r.istatus = 'V' AND r.csiono1 = 'S'
          AND TRY_CONVERT(INT, r.cvdefecto1) = @cramo AND TRIM(r.cvdefecto2) = @cplan
          AND EXISTS (SELECT 1 FROM maplanes p WHERE p.cramo = r.nentero1 AND TRIM(p.cplan) = TRIM(r.ccaracter1) AND p.iestado = 'V')
        ORDER BY CASE WHEN NULLIF(TRIM(r.cvdefecto3), '') IS NULL THEN 0 ELSE 1 END, r.cparamet;

        IF @ramoRcvAparte IS NOT NULL AND @cplanRcvAparte IS NOT NULL
            SELECT @cramo = @ramoRcvAparte, @cplan = @cplanRcvAparte;
    END;

    DECLARE @ano NVARCHAR(5), 
            @cmoneda NVARCHAR(5), 
            @msuma_cos DECIMAL(18, 2), 
            @msuma_per DECIMAL(18, 2), 
            @mprima_bas DECIMAL(18, 2), 
            @diferenciaMeses INT, 
            @recargoCA NUMERIC(18, 4), 
            @recargoPT NUMERIC(18, 4), 
            @recargoPP NUMERIC(18, 4), 
            @ptasaexc NUMERIC(12, 6), 
            @tipoProduc CHAR(20), 
            @tasaTCR NUMERIC(18, 2), 
            @tasaUSD NUMERIC(18, 2), 
            @contador INT,
            @primaPorTonelada NUMERIC(18, 2),
            @cal_tasaPt NUMERIC(18, 2) = 0,
            @cal_tasaCa NUMERIC(18, 2) = 0,
            @cal_tasaPP NUMERIC(18, 2) = 0;

    DECLARE @modif BIT = dbo.fn_validateCoberAccess(@cusuario, (SELECT TRIM(cproducto) FROM maplanes WHERE cplan = @cplan AND cramo = @cramo), @coberAdicional);
    DECLARE @aplicaRecaDesc BIT = dbo.fn_validateCoberAccess(@cusuario, (SELECT TRIM(cproducto) FROM maplanes WHERE cplan = @cplan AND cramo = @cramo), 'CA');
    DECLARE @casaMatriz BIT = 0;

    CREATE TABLE #temp_calculo
    (
        cplan VARCHAR(50),
        xplan VARCHAR(255),
        ccobertura VARCHAR(50),
        xdescripcion_l VARCHAR(255),
        cproducto VARCHAR(50),
        cmoneda VARCHAR(10),
        nubii INT,
        tasaCA DECIMAL(18,6),
        tasaPT DECIMAL(18,6),
        tasaPP DECIMAL(18,6),
        primaBlCA DECIMAL(18,2),
        primaBLPT DECIMAL(18,2),
        primaAdCA DECIMAL(18,2),
        primaAdPT DECIMAL(18,2),
        primaAdPP DECIMAL(18,2),
        prima DECIMAL(18,3),
        masegurada DECIMAL(18,2),
        ctarifa VARCHAR(50),
        cramoint VARCHAR(50),
        ccoberturaint VARCHAR(50),
        xcobertura NVARCHAR(30),
        xvalor NVARCHAR(2),
        badicional BIT
    );

    SELECT @casaMatriz = ISNULL(MAX(1), 0)
    FROM seusuariosweb u
    JOIN macatvalores v 
        ON v.cdominio = 'USRAUTOCAMAT' 
        AND (u.xlogin = v.cvalor OR u.xusuario = v.cvalor OR u.xcorreo = v.cvalor)
    WHERE u.cusuario = @cusuario;

    IF @iplaca = 'B'
    BEGIN
        DECLARE @ctarifabi NUMERIC, @qdias NUMERIC, @ncolumna NUMERIC, @ndias_max NUMERIC, @ndias_ad NUMERIC;
        SET @ncolumna = 3;
        SET @qdias = DATEDIFF(DAY, @fdesde, @fhasta);
        SELECT @ndias_max = MAX(ndias_max) FROM maplantar_dias;

        IF DATEDIFF(MONTH, @fdesde, @fhasta) = 12 AND DAY(@fdesde) >= DAY(@fhasta)
        BEGIN
            SET @qdias = 30;
            SET @ncolumna = 1;
        END;

        IF @qdias > @ndias_max AND @ncolumna != 1
        BEGIN
            SET @ncolumna = 2;
            SET @ndias_ad = @qdias - @ndias_max;
            SET @qdias = 30;
        END;

        -- R-087355: reglas del R.C. Binacional en macatvalores (dominio BINAC_PARAM). Sin parametros activos
        -- se conserva el calculo anterior: tarifa segun el modelo y ocupantes segun los puestos.
        DECLARE @binTarifaNormal NUMERIC, @binTarifaRiesgo NUMERIC, @binPersonas NUMERIC(4), @binSustancRiesgo VARCHAR(2000), @binCsustanc NUMERIC
        SELECT @binTarifaNormal = MAX(CASE WHEN cvalor = 'TARIFA_NORMAL' THEN TRY_CONVERT(NUMERIC, xdescripcion) END),
            @binTarifaRiesgo = MAX(CASE WHEN cvalor = 'TARIFA_RIESGO' THEN TRY_CONVERT(NUMERIC, xdescripcion) END),
            @binPersonas = MAX(CASE WHEN cvalor = 'PERSONAS' THEN TRY_CONVERT(NUMERIC(4), xdescripcion) END),
            @binSustancRiesgo = MAX(CASE WHEN cvalor = 'SUSTANC_RIESGO' THEN xdescripcion END)
        FROM macatvalores WHERE cdominio = 'BINAC_PARAM' AND bactivo = 1;

        IF @binTarifaNormal IS NOT NULL
        BEGIN
            IF @ncolumna <> 1
                THROW 99010, N'El R.C. Binacional solo se emite con vigencia anual.', 1;
            -- Tipos de vehiculo permitidos por plan (dominio PLANTIPOVEH, el mismo que usa spBuscaPlan)
            IF EXISTS (SELECT 1 FROM macatvalores WHERE cdominio = 'PLANTIPOVEH' AND cvalor = RTRIM(@cplan) AND bactivo = 1)
                AND NOT EXISTS (SELECT 1 FROM macatvalores v CROSS APPLY OPENJSON(v.xdescripcion) WITH (ctipo VARCHAR(3) '$') t
                    WHERE v.cdominio = 'PLANTIPOVEH' AND v.cvalor = RTRIM(@cplan) AND v.bactivo = 1 AND t.ctipo = CONVERT(VARCHAR(3), @tipoV))
                THROW 99011, N'El plan seleccionado no está disponible para este tipo de vehículo.', 1;
            -- La actividad llega como el porcentaje de masustac (campo "Recargo RCV"); se ubica su codigo.
            IF @recargoRcv > 0
                SELECT TOP 1 @binCsustanc = csustanc FROM masustac WHERE cramo = 18 AND porcenta = @recargoRcv;
            SET @ctarifabi = @binTarifaNormal;
            IF @binTarifaRiesgo IS NOT NULL AND @binCsustanc IN (SELECT TRY_CONVERT(NUMERIC, value) FROM OPENJSON(@binSustancRiesgo))
                SET @ctarifabi = @binTarifaRiesgo;
        END
        ELSE
        BEGIN
        IF @uso = 6 
            SET @ctarifabi = 5;
        ELSE
            SELECT @ctarifabi = ctarifabi FROM maanomod WHERE cmarca = @cmarca AND cmodelo = @cmodelo AND cversion = @cversion AND cano = @cano;
        END

        INSERT INTO #temp_calculo
        SELECT
            a.cplan, a.xplan, TRIM(b.ccobertura), c.xdescripcion_l, TRIM(a.cproducto), c.cmoneda, 
            (SELECT cubii + 1 FROM macontadores_web),
            0, 0, 0, 0, 0, 0, 0, 0,
            CASE @ncolumna 
                WHEN 1 THEN f.mprima_anual 
                WHEN 2 THEN f.mprima + f.mprima_dia * @ndias_ad
                ELSE f.mprima 
            END + CASE WHEN e.pprima <> 0 THEN (e.msumamax * e.pprima / 100 * ISNULL(@binPersonas, @puestos)) ELSE 0 END,
            f.msuma, d.ctarifa, d.cramoint, d.ccoberturaint,
            h.xcalculo, h.cgruptar, CASE WHEN h.cgruptar IS NOT NULL THEN 1 ELSE 0 END
        FROM maplanes a
        INNER JOIN maplancob b ON a.cplan = b.cplan AND a.cramo = @cramo AND a.iestado = 'V'
        INNER JOIN macoberturas c ON a.cramo = c.cramo AND b.ccobertura = c.ccobertura
        LEFT JOIN matarifa d ON a.cramo = d.cramo AND b.ccobertura = d.ccober
        INNER JOIN maplantar e ON a.cplan = e.cplan AND e.cramo = a.cramo AND e.ccober = b.ccobertura
        INNER JOIN maplantar_dias f ON a.cplan = f.cplan AND d.ctarifa = f.ctarifa AND b.ccobertura = f.ccober AND a.cramo = f.cramo
        LEFT JOIN instarint h ON d.ctarifaint = h.ctarifaint AND c.ccoberturaint = h.ccoberturaint AND d.cramoint = h.cramoint
        WHERE (@cplan IS NULL OR RTRIM(a.cplan) = @cplan)
          AND f.ndias_max = @qdias 
          AND f.ctarifabi = @ctarifabi;

        SELECT * FROM #temp_calculo;

        -- Totales para cotización (nest/valrep usa totalPA). Sin esto el branch B
        -- devolvía solo detalle y la cotización omitía cob 69 (GM) o quedaba en 0.
        IF @incluirTotales = 1
        BEGIN
            SELECT
                SUM(CASE WHEN ccobertura IN ('28') THEN prima ELSE 0 END) AS 'totalPP',
                SUM(CASE WHEN ccobertura IN ('69') THEN prima ELSE 0 END) AS 'totalAP',
                SUM(CASE WHEN ccobertura IN ('1','3','4','5') THEN prima ELSE 0 END) AS 'totalCA',
                SUM(CASE WHEN ccobertura IN ('2','16','4','5') THEN prima ELSE 0 END) AS 'totalPT',
                SUM(CASE WHEN ccobertura IN ('17') THEN prima ELSE 0 END) AS 'totalBL',
                SUM(CASE WHEN ccobertura IN ('18') THEN prima ELSE 0 END) AS 'totalAD',
                SUM(ISNULL(prima, 0)) AS 'totalPA',
                SUM(ISNULL(prima, 0)) AS 'totalPrima'
            FROM #temp_calculo;
        END;

        DROP TABLE #temp_calculo;
        RETURN;
    END;

    -- Lógica para @iplaca != 'B'
    DECLARE @canTCR NUMERIC(4);
    SET @diferenciaMeses = DATEDIFF(MONTH, @fdesde, @fhasta);

    IF @casaMatriz = 0 
    BEGIN
        SELECT @tasaTCR = MAX(ptasamon) FROM mamonedas;
        SELECT @tasaUSD = ptasamon FROM mamonedas WHERE cmoneda = '$';
    END 
    ELSE 
    BEGIN
        SELECT @tasaTCR = MAX(ptasamon) FROM mavamoneda WHERE fmoneda = @fdesde;
        SELECT @tasaUSD = MAX(ptasamon) FROM mavamoneda WHERE cmoneda = '$' AND fmoneda = @fdesde;
        IF @tasaTCR IS NULL OR @tasaUSD IS NULL 
        BEGIN
            SELECT @tasaTCR = MAX(ptasamon) FROM mamonedas;
            SELECT @tasaUSD = ptasamon FROM mamonedas WHERE cmoneda = '$';
        END;
    END;
    
    SELECT @cmoneda = TRIM(cmoneda) FROM maplanes WHERE cplan = @cplan;

    IF @iplaca = 'N' SET @canTCR = 5;
    IF @iplaca = 'E' SET @canTCR = 17;
    
    SET @primaPorTonelada = @toneladas * @canTCR;

    IF @toneladas > 12 AND @uso = 11 
    BEGIN
        SET @toneladas = @toneladas - 12;
        SET @primaPorTonelada = @toneladas * @canTCR;
    END 
    ELSE 
        SET @primaPorTonelada = 0;

    IF (DAY(@fdesde) > DAY(@fhasta)) AND (@cplan <> 'E2')
        SET @diferenciaMeses = @diferenciaMeses - 1;

    IF @iplaca = 'N' 
    BEGIN
        SELECT @msuma_cos = msumacosas, @msuma_per = msumapers, @mprima_bas = mprimbas, @ptasaexc = ptasaexc
        FROM macattip WHERE ccategotr = @uso AND ctipo = @tipoV;
    END 
    ELSE IF @iplaca = 'E' 
    BEGIN
        SELECT @msuma_cos = msumacosasext, @msuma_per = msumapersext, @mprima_bas = mprimext, @ptasaexc = ptasaexc
        FROM macattip WHERE ccategotr = @uso AND ctipo = @tipoV;
    END;

    CREATE TABLE #TempMonths (value INT, percentage DECIMAL(3, 2));
    INSERT INTO #TempMonths (value, percentage) VALUES
    (0, 0.2),(1, 0.3),(2, 0.4),(3, 0.5),(4, 0.6),(5, 0.7),
    (6, 0.75),(7, 0.8),(8, 0.85),(9, 0.9),(10, 0.95),(11, 1),(12, 1);

    DECLARE @sumaAsegReferencia NUMERIC(18, 2);
    DECLARE @sumaAsegReferenciaMin NUMERIC(18, 2);
    DECLARE @sumaAsegReferenciaMax NUMERIC(18, 2);

    SELECT @sumaAsegReferencia = mvalor FROM maanomod WHERE cmarca = @cmarca AND cmodelo = @cmodelo AND cversion = @cversion AND cano = @cano;
    
    SET @sumaAsegReferenciaMin = ROUND(@sumaAsegReferencia * 0.9, 2);
    SET @sumaAsegReferenciaMax = ROUND(@sumaAsegReferencia * 1.3, 2);       
    
    IF (ISNULL(@sumaAseg, 0) = 0) SET @sumaAseg = @sumaAsegReferencia;

    IF @modif = 0
    BEGIN
        IF (@sumaAseg > @sumaAsegReferenciaMax) SET @sumaAseg = @sumaAsegReferenciaMax;
        ELSE IF (@sumaAseg < @sumaAsegReferenciaMin) SET @sumaAseg = @sumaAsegReferenciaMin;
    END;

    DECLARE @tasaSisCa NUMERIC(18, 2), @tasaSisPt NUMERIC(18, 2), @tasaSisPp NUMERIC(18, 2);
    SELECT @tasaSisCa = dbo.fn_buscar_tasa_casco(@cmarca, @cmodelo, @cversion, @cano, '1', @sumaAseg, @cplan);
    SELECT @tasaSisPt = dbo.fn_buscar_tasa_casco(@cmarca, @cmodelo, @cversion, @cano, '2', @sumaAseg, @cplan);
    SELECT @tasaSisPp = dbo.fn_buscar_tasa_casco(@cmarca, @cmodelo, @cversion, @cano, '28', @sumaAseg, @cplan);

    IF @modif = 0
    BEGIN
        SET @cal_tasaCa = ISNULL(NULLIF(@tasaSisCa, 0), @tasaCa);
        SET @cal_tasaPt = ISNULL(NULLIF(@tasaSisPt, 0), @tasaPt);
        SET @cal_tasaPp = ISNULL(NULLIF(@tasaSisPp, 0), @tasaPP);
    END
    ELSE 
    BEGIN
        SET @cal_tasaCa = ISNULL(NULLIF(@tasaCa, 0), @tasaSisCa);
        SET @cal_tasaPt = ISNULL(NULLIF(@tasaPt, 0), @tasaSisPt);
        SET @cal_tasaPp = ISNULL(NULLIF(@tasaPP, 0), @tasaSisPp);
    END;

    SELECT @contador = cubii + 1 FROM macontadores_web;

    -- POBLAR #temp_calculo CON SENTENCIA SET-BASED (SIN CURSOR)
    INSERT INTO #temp_calculo
    SELECT 
        a.cplan, a.xplan, TRIM(b.ccobertura), c.xdescripcion_l, TRIM(a.cproducto), c.cmoneda, @contador,
        --@cal_tasaCa, @cal_tasaPt, @cal_tasaPp,
        CASE WHEN TRIM(b.ccobertura) <> '1' THEN @cal_tasaCa
             WHEN TRIM(a.cproducto) IN ('E', 'E1', 'E2', 'E3') AND ISNULL(@tasaCa, 0) > 0 THEN @tasaCa
             WHEN e.pprima > 0 THEN e.pprima
             ELSE @cal_tasaCa END,
        CASE WHEN TRIM(b.ccobertura) <> '2' THEN @cal_tasaPt
             WHEN TRIM(a.cproducto) IN ('E', 'E1', 'E2', 'E3') AND ISNULL(@tasaPt, 0) > 0 THEN @tasaPt
             WHEN e.pprima > 0 THEN e.pprima
             ELSE @cal_tasaPt END,
        CASE WHEN TRIM(b.ccobertura) <> '28' THEN @cal_tasaPp
             WHEN e.pprima > 0 AND TRIM(a.cproducto) NOT IN ('E', 'E1', 'E2', 'E3') THEN e.pprima
             ELSE @cal_tasaPp END,
        (@sumaAsegBl * @cal_tasaCa / 100),
        (@sumaAsegBl * @cal_tasaPt / 100),
        (@sumaAsegAd * @cal_tasaCa / 100),
        (@sumaAsegAd * @cal_tasaPt / 100),
        (@sumaAsegAd * @cal_tasaPp / 100),
        -- Cálculo de Prima
        CASE 
            WHEN TRIM(a.cproducto) IN ('E', 'E1', 'E3') THEN
                CASE 
                    WHEN CAST(TRIM(b.ccobertura) AS INT) = 1 THEN @sumaAseg * ISNULL(CASE WHEN ISNULL(@tasaCa,0)>0 THEN @tasaCa ELSE e.pprima END, e.pprima) / 100
                    WHEN CAST(TRIM(b.ccobertura) AS INT) = 2 THEN @sumaAseg * ISNULL(CASE WHEN ISNULL(@tasaPt,0)>0 THEN @tasaPt ELSE e.pprima END, e.pprima) / 100
                    WHEN CAST(TRIM(b.ccobertura) AS INT) IN (3,16,4) THEN CASE WHEN e.mprima = 0 THEN (CASE WHEN e.pprima > 0 THEN @sumaAseg * e.pprima / 100 ELSE 0 END) ELSE e.mprima 				END
                    --ELSE COALESCE(e.mprima, 0)
                    ELSE CASE
					    WHEN e.mprima > 0 THEN e.mprima
					    WHEN e.pprima > 0 THEN e.msumamax * e.pprima / 100
					    WHEN ISNULL(f.pprima, 0) > 0 THEN e.msumamax * f.pprima / 100
					    ELSE 0
					END
                END
            WHEN TRIM(a.cproducto) = 'E2' THEN
                CASE 
                    WHEN CAST(TRIM(b.ccobertura) AS INT) = 7 THEN CASE WHEN e.mprima = 0 THEN (@mprima_bas + @primaPorTonelada) * @tasaTCR / @tasaUSD ELSE e.mprima END
                    WHEN CAST(TRIM(b.ccobertura) AS INT) = 1 THEN @sumaAseg * ISNULL(CASE WHEN ISNULL(@tasaCa,0)>0 THEN @tasaCa ELSE e.pprima END, e.pprima) / 100
                    WHEN CAST(TRIM(b.ccobertura) AS INT) = 2 THEN @sumaAseg * ISNULL(CASE WHEN ISNULL(@tasaPt,0)>0 THEN @tasaPt ELSE e.pprima END, e.pprima) / 100
                    WHEN CAST(TRIM(b.ccobertura) AS INT) IN (3,16,4) THEN CASE WHEN e.mprima = 0 THEN (CASE WHEN e.pprima > 0 THEN @sumaAseg * e.pprima / 100 ELSE 0 END) ELSE e.mprima 				END
                    --ELSE COALESCE(e.mprima, 0)
                    ELSE CASE
					    WHEN e.mprima > 0 THEN e.mprima
					    WHEN e.pprima > 0 THEN e.msumamax * e.pprima / 100
					    WHEN ISNULL(f.pprima, 0) > 0 THEN e.msumamax * f.pprima / 100
					    ELSE 0
					END
                END
            ELSE
                CASE 
                    WHEN CAST(TRIM(b.ccobertura) AS INT) = 1 THEN CASE WHEN e.mprima = 0 THEN (CASE WHEN e.pprima > 0 THEN @sumaAseg * e.pprima / 100 ELSE @sumaAseg * @cal_tasaCa / 100 END) ELSE e.mprima END
                    WHEN CAST(TRIM(b.ccobertura) AS INT) = 2 THEN CASE WHEN e.mprima = 0 THEN (CASE WHEN e.pprima > 0 THEN @sumaAseg * e.pprima / 100 ELSE @sumaAseg * @cal_tasaPt / 100 END) ELSE e.mprima END
                    WHEN CAST(TRIM(b.ccobertura) AS INT) = 28 THEN CASE WHEN e.mprima = 0 THEN (CASE WHEN e.pprima > 0 THEN @sumaAseg * e.pprima / 100 ELSE @sumaAseg * @cal_tasaPp / 100 END) ELSE e.mprima END
                    WHEN CAST(TRIM(b.ccobertura) AS INT) IN (3,16,4) THEN CASE WHEN e.mprima = 0 THEN (CASE WHEN e.pprima > 0 THEN @sumaAseg * e.pprima / 100 ELSE @sumaAseg * f.pprima / 100 END) ELSE e.mprima END
                    WHEN CAST(TRIM(b.ccobertura) AS INT) IN (9,5) THEN CASE WHEN e.mprima = 0 THEN (CASE WHEN e.pprima > 0 THEN e.msumamax * e.pprima / 100 ELSE e.msumamax * f.pprima / 100 END) ELSE e.mprima END
                    WHEN CAST(TRIM(b.ccobertura) AS INT) = 8 THEN CASE WHEN e.mprima = 0 THEN (CASE WHEN e.pprima > 0 THEN e.msumamax * e.pprima / 100 ELSE e.msumamax * @ptasaexc / 100 END) ELSE e.mprima END
                    WHEN CAST(TRIM(b.ccobertura) AS INT) BETWEEN 10 AND 13 THEN CASE WHEN e.mprima > 0 THEN e.mprima WHEN e.pprima > 0 THEN (e.msumamax * e.pprima / 100) * @puestos ELSE (e.msumamax * f.pprima / 100) * @puestos END
                    WHEN CAST(TRIM(b.ccobertura) AS INT) = 7 THEN CASE WHEN e.mprima = 0 THEN (@mprima_bas + @primaPorTonelada) * @tasaTCR / @tasaUSD ELSE e.mprima END
                    WHEN CAST(TRIM(b.ccobertura) AS INT) = 6 THEN 0
                    --ELSE COALESCE(e.mprima, 0)
                    ELSE CASE
					    WHEN e.mprima > 0 THEN e.mprima
					    WHEN e.pprima > 0 THEN e.msumamax * e.pprima / 100
					    WHEN ISNULL(f.pprima, 0) > 0 THEN e.msumamax * f.pprima / 100
					    ELSE 0
					END
                END
        END,
        -- Suma Asegurada
        CASE 
            WHEN CAST(TRIM(b.ccobertura) AS INT) IN (1, 2, 3, 4, 16, 28) THEN @sumaAseg 
            WHEN CAST(TRIM(b.ccobertura) AS INT) = 6 THEN @msuma_per 
            WHEN CAST(TRIM(b.ccobertura) AS INT) = 7 THEN @msuma_cos 
            ELSE e.msumamax 
        END,
        d.ctarifa, d.cramoint, d.ccoberturaint, h.xcalculo, h.cgruptar, CASE WHEN h.cgruptar IS NOT NULL THEN 1 ELSE 0 END
    FROM maplanes a
    INNER JOIN maplancob b ON a.cplan = b.cplan AND a.cramo = @cramo AND a.iestado = 'V' 
    INNER JOIN macoberturas c ON a.cramo = c.cramo AND b.ccobertura = c.ccobertura 
    INNER JOIN matarifa d ON a.cramo = d.cramo AND b.ccobertura = d.ccober 
    INNER JOIN maplantar e ON a.cplan = e.cplan AND e.cramo = a.cramo AND e.ccober = b.ccobertura AND e.ctarifa = d.ctarifa
    INNER JOIN matarifa_d f ON f.ccober = d.ccober AND f.cramo = a.cramo AND f.iestado = 'V' AND e.ctarifa = f.ctarifa
    INNER JOIN macattip ON macattip.ccategotr = @uso AND macattip.ctipo = @tipoV 
    LEFT JOIN instarint h ON d.ctarifaint = h.ctarifaint AND c.ccoberturaint = h.ccoberturaint AND d.cramoint = h.cramoint            
    WHERE (@cplan IS NULL OR RTRIM(a.cplan) = @cplan);

    -- Ajustes para Placas E
    IF @iplaca = 'E' AND (SELECT TOP 1 cproducto FROM #temp_calculo) <> 'E2'
    BEGIN
        UPDATE #temp_calculo SET 
            prima = prima * (SELECT percentage FROM #TempMonths WHERE value = CASE WHEN @diferenciaMeses >= 1 THEN @diferenciaMeses ELSE 0 END),
            primaBlCA = primaBlCA * (SELECT percentage FROM #TempMonths WHERE value = CASE WHEN @diferenciaMeses >= 1 THEN @diferenciaMeses ELSE 0 END),
            primaBLPT = primaBLPT * (SELECT percentage FROM #TempMonths WHERE value = CASE WHEN @diferenciaMeses >= 1 THEN @diferenciaMeses ELSE 0 END),
            primaAdCA = primaAdCA * (SELECT percentage FROM #TempMonths WHERE value = CASE WHEN @diferenciaMeses >= 1 THEN @diferenciaMeses ELSE 0 END),
            primaAdPT = primaAdPT * (SELECT percentage FROM #TempMonths WHERE value = CASE WHEN @diferenciaMeses >= 1 THEN @diferenciaMeses ELSE 0 END);

        DELETE FROM #temp_calculo WHERE ccobertura IN ('1','2','3','16','4');
    END;

    -- Recargos y Descuentos por usuario
    ;WITH conf AS (
        SELECT v.cvalor, ISNULL(MAX(ABS(n.descuento) * -1),0) AS descuento, ISNULL(MAX(ABS(n.recargo)), 0) AS recargo
        FROM seusuariosweb u
        JOIN macatvalores v ON v.cdominio = 'USRRECADESC' AND (u.xlogin = v.cvalor OR u.xusuario = v.cvalor OR u.xcorreo = v.cvalor)
        CROSS APPLY OPENJSON(v.xdescripcion, '$') WITH (descuento DECIMAL(10,2) '$.descuento', recargo DECIMAL(10,2) '$.recargo') AS n
        WHERE u.cusuario = @cusuario
        GROUP BY v.cvalor
    )
    SELECT @aplicaRecaDesc = ISNULL(MAX(1), 0) FROM conf WHERE @recargo BETWEEN descuento AND recargo;

    IF @recargo <> 0 AND @aplicaRecaDesc = 1 
    BEGIN
        SELECT @recargoCA = prima * (@recargo / 100) FROM #temp_calculo WHERE ccobertura = '1';
        SELECT @recargoPT = prima * (@recargo / 100) FROM #temp_calculo WHERE ccobertura = '2';
        SELECT @recargoPP = prima * (@recargo / 100) FROM #temp_calculo WHERE ccobertura = '28';

        UPDATE #temp_calculo SET prima = ROUND(prima,2) + ROUND(ISNULL(@recargoCA,0),2) WHERE ccobertura = '1';
        UPDATE #temp_calculo SET prima = ROUND(prima,2) + ROUND(ISNULL(@recargoPT,0),2) WHERE ccobertura = '2';
        UPDATE #temp_calculo SET prima = ROUND(prima,2) + ROUND(ISNULL(@recargoPP,0),2) WHERE ccobertura = '28'; -- FIXED BUG HERE
    END;

    IF @recargoRCV > 0 
        UPDATE #temp_calculo SET prima = (prima * @recargoRCV / 100) + prima;

    IF @puestos = 0
        DELETE FROM #temp_calculo WHERE CAST(ccobertura AS INT) BETWEEN 10 AND 13;

    -- Ajuste por vigencia menor a 1 año
    IF DATEDIFF(DAY, @fdesde, @fhasta) < 365 AND (@iplaca <> 'E' AND (SELECT TOP 1 cproducto FROM #temp_calculo) NOT IN ('E2', 'E3'))
    BEGIN
        DECLARE @dias_faltantes INT = 365 - DATEDIFF(DAY, @fdesde, @fhasta);
        UPDATE #temp_calculo SET prima = prima - ((prima / 365) * @dias_faltantes);
    END;

    IF ((SELECT SUM(prima) FROM #temp_calculo) = 0)
    BEGIN
        THROW 99001, 'Error en cálculo de primas (Suma es 0)', 1;
    END;

    -- Filtrado final según cobertura adicional solicitada
    IF @coberAdicional = 'RC' OR @modif = 0 OR ((@casaMatriz = 0 AND YEAR(GETDATE()) - @cano > 20) OR (@casaMatriz = 0 AND @tipoV IN (4,6,8) AND (SELECT TOP 1 cproducto FROM #temp_calculo) NOT IN ('E', 'E1', 'E2', 'E3'))) 
    BEGIN
        IF (((@tipoV IN (4) AND @cplan != 'RCVBAS') OR @tipoV IN (6,8) OR (@tipoV IN (3,5) AND @uso IN (8,9,10,11))) AND ((SELECT TOP 1 cproducto FROM #temp_calculo) NOT IN ('E', 'E1', 'E2', 'E3')) AND @cplan != 'RCVBAS')
            DELETE FROM #temp_calculo WHERE ccobertura = '15';

        DELETE FROM #temp_calculo WHERE ccobertura IN ('4','5','1','3','2','16','28'/*,'69'*/);
    END 
    ELSE IF @coberAdicional = 'CA' DELETE FROM #temp_calculo WHERE ccobertura IN ('2','16','28','69');
    ELSE IF @coberAdicional = 'PT' DELETE FROM #temp_calculo WHERE ccobertura IN ('1','3','28','69');
    ELSE IF @coberAdicional = 'PP' DELETE FROM #temp_calculo WHERE ccobertura IN ('1','2','3','4','5','16','69');
    ELSE IF @coberAdicional = 'AP' DELETE FROM #temp_calculo WHERE ccobertura IN ('1','2','3','4','5','16','28');

    IF @ifrecuencia IN ('M','S','T','C')
    BEGIN
        DECLARE @cant INT = CASE @ifrecuencia WHEN 'M' THEN 12 WHEN 'T' THEN 4 WHEN 'S' THEN 2 WHEN 'C' THEN 3 END;
        UPDATE #temp_calculo SET prima = prima / @cant;
    END;

    SELECT * FROM #temp_calculo;

    IF @incluirTotales = 1 
    BEGIN
        /* totalPrima = prima que emite sp_pre_emision (SUM del detalle).
           En binacional (cramo 28 / iplaca B|E) totalPA debe coincidir con totalPrima:
           la cob 69 (Gastos Médicos) forma parte de la prima emitida. */
        DECLARE @es_binacional BIT = CASE
            WHEN @cramo = 28 OR @iplaca IN ('B', 'E') THEN 1 ELSE 0 END;

        SELECT 
            SUM(CASE WHEN ccobertura IN ('28') THEN prima ELSE 0 END) AS 'totalPP',
            SUM(CASE WHEN ccobertura IN ('69') THEN prima ELSE 0 END) AS 'totalAP',
            SUM(CASE WHEN ccobertura IN ('1','3','4','5') THEN prima ELSE 0 END) AS 'totalCA',
            SUM(CASE WHEN ccobertura IN ('2','16','4','5') THEN prima ELSE 0 END) AS 'totalPT',
            SUM(CASE WHEN ccobertura IN ('17') THEN prima ELSE 0 END) AS 'totalBL',
            SUM(CASE WHEN ccobertura IN ('18') THEN prima ELSE 0 END) AS 'totalAD',
            CASE WHEN @es_binacional = 1
                THEN SUM(ISNULL(prima, 0))
                ELSE SUM(CASE WHEN ccobertura NOT IN ('4','5','1','3','2','16','28') THEN prima ELSE 0 END)
            END AS 'totalPA',
            SUM(ISNULL(prima, 0)) AS 'totalPrima'
        FROM #temp_calculo;
    END;

    DROP TABLE #TempMonths;
    DROP TABLE #temp_calculo;
END;
GO
