--  ˚☽˚. ‧₊˚✩₊˚.⋆☾⋆⁺₊✧⋆⁺₊⋆ ☀︎ ⋆⁺₊⋆
-- Author:	Franjhely Araujo <3
-- Create date: 6/8/2024
-- Modif date: 17/4/2026
-- Description:	Calculo Auto
--  ˚☽˚. ‧₊˚✩₊˚.⋆☾⋆⁺₊✧⋆⁺₊⋆ ☀︎ ⋆⁺₊⋆
CREATE PROCEDURE [dbo].[spCalculoAuto]
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
    @cramo NUMERIC(5) = null,
    @cusuario numeric(20) = null,
    @coberAdicional varchar(2) = 'RC',
    @incluirTotales bit = 1


AS DECLARE

  @ano NVARCHAR(5),
  @cmoneda NVARCHAR(5),
  @pprima_mca DECIMAL(18, 2),
  @pprima_mpt DECIMAL(18, 2),
  @pprima_eve DECIMAL(18, 2),
  @pprima_ind DECIMAL(18, 2),
  @msuma_cos DECIMAL(18, 2),
  @msuma_per DECIMAL(18, 2),
  @mprima_bas DECIMAL(18, 2),
  @diferenciaMeses INT,
  @recargoCA NUMERIC(18),
  @recargoPT NUMERIC(18),
  @recargoPP NUMERIC(18),
  @ptasaexc NUMERIC(12, 6),
  @tipoProduc char(20),
  @tasaTCR NUMERIC(18, 2),
  @tasaUSD NUMERIC(18, 2),
  @contador INT,
  @primaPorTonelada NUMERIC(18, 2),
  --variables para el bucle de calculo
  @xplan NVARCHAR(20),
  @ccobertura NVARCHAR(4),
  @xdescripcion_l NVARCHAR(30),
  @cproducto NVARCHAR(3),
  @ctarifa NVARCHAR(50),
  @cramoint NVARCHAR(50),
  @ccoberturaint NVARCHAR(50),
  @msumamax DECIMAL(18, 2),
  @mprima DECIMAL(18, 3),
  @pprima DECIMAL(18, 6),
  @pprima_tar DECIMAL(18, 6),
  @ccobertura_num INT,
  @prima DECIMAL(18, 3),
  @masegurada DECIMAL(18, 2),
  @xcobertura NVARCHAR(30),
  @xvalor NVARCHAR(2),
  @badicional bit

BEGIN

    IF @cramo IS NULL BEGIN
        SELECT @cramo = 18
    END

    DECLARE @modif BIT = dbo.fn_validateCoberAccess(@cusuario, (SELECT TRIM(cproducto) FROM maplanes WHERE cplan = @cplan and cramo = @cramo), @coberAdicional);
    DECLARE @aplicaRecaDesc BIT = dbo.fn_validateCoberAccess(@cusuario, (SELECT TRIM(cproducto) FROM maplanes WHERE cplan = @cplan and cramo = @cramo), 'CA');

   CREATE TABLE #temp_calculo
    (
        cplan VARCHAR(50),
        xplan VARCHAR(255),
        ccobertura VARCHAR(50),
        xdescripcion_l VARCHAR(255),
        cproducto VARCHAR(50),
        cmoneda VARCHAR(10),
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
        ctarifa VARCHAR(50),
        cramoint VARCHAR(50),
        ccoberturaint VARCHAR(50),
        xcobertura NVARCHAR(30),
        xvalor NVARCHAR(2),
        badicional bit
    );

    IF @iplaca = 'B'
    BEGIN
        DECLARE @ctarifabi NUMERIC , @qdias NUMERIC , @ncolumna NUMERIC , @ndias_max NUMERIC , @ndias_ad NUMERIC
        /*
            @ncolumna = 1  Representa la columna de prima anual
            @ncolumna = 2  Representa la columna de adicional por dia mas la prima
            @ncolumna = 3  Representa la columna de prima por dia
            */
        SET @ncolumna = 3
        SET @qdias = (SELECT DATEDIFF(DAY, @fdesde, @fhasta) AS DiasDiferencia);
        SET @ndias_max = (select max(ndias_max)
        from maplantar_dias)

        IF DATEDIFF(MONTH, @fdesde, @fhasta) = 12 and DAY(@fdesde) >= DAY(@fhasta)
            BEGIN
            SET @qdias = 30
            SET @ncolumna = 1
        END
        IF @qdias > @ndias_max and @ncolumna != 1
            BEGIN
            SET @ncolumna = 2
            SET @ndias_ad = @qdias - @ndias_max
            SET @qdias = 30
        END
        IF @uso = 6 BEGIN
            set @ctarifabi = 5
        END
            ELSE
            BEGIN
            SELECT @ctarifabi = ctarifabi
            from maanomod
            where cmarca = @cmarca and cmodelo = @cmodelo and cversion = @cversion and cano = @cano
        END



        select
            a.cplan, a.xplan, trim(b.ccobertura) as ccobertura, c.xdescripcion_l, trim(a.cproducto) as cproducto, c.cmoneda, (SELECT cubii + 1
            FROM macontadores_web)'nubii',
            0'tasaCA', 0'tasaPT',0'tasaPP', 0'primaBlCA', 0'primaBLPT', 0'primaAdCA', 0'primaAdPT', 0'primaAdPP',
            case @ncolumna
                    when 1 then f.mprima_anual
                    when 2 then f.mprima + f.mprima_dia * @ndias_ad
                    else f.mprima
                end +
                case when e.pprima <> 0 then
                    e.msumamax * e.pprima / 100 * @puestos  else 0
                end
                'prima',
            f.msuma 'masegurada', d.ctarifa, d.cramoint, d.ccoberturaint,
            h.xcalculo 'xcobertura', h.cgruptar 'xvalor', case  when h.cgruptar is not null  then 1 else 0 end 'badicional'
        FROM
            maplanes a
            inner JOIN maplancob b ON a.cplan = b.cplan AND a.cramo = @cramo AND a.iestado = 'V'
            inner JOIN macoberturas c ON a.cramo = c.cramo AND b.ccobertura = c.ccobertura
            LEFT JOIN matarifa d ON a.cramo = d.cramo AND b.ccobertura = d.ccober
            INNER JOIN maplantar e ON a.cplan = e.cplan AND e.cramo = a.cramo AND e.ccober = b.ccobertura
            inner join maplantar_dias f on a.cplan = f.cplan and d.ctarifa = f.ctarifa and b.ccobertura = f.ccober and a.cramo = f.cramo
            LEFT JOIN instarint h ON d.ctarifaint = h.ctarifaint AND c.ccoberturaint = h.ccoberturaint AND d.cramoint = h.cramoint
        WHERE  RTRIM(a.cplan) LIKE COALESCE(@cplan, '%') and
            f.ndias_max =  @qdias and f.ctarifabi = @ctarifabi

    END
    IF @iplaca != 'B'
    BEGIN
        DECLARE @canTCR NUMERIC(4)
        SET  @diferenciaMeses = DATEDIFF(MONTH, @fdesde, @fhasta);
        SET @tasaTCR = ( SELECT max(ptasamon)
        from mamonedas )
        SET @tasaUSD = ( SELECT ptasamon
        from mamonedas
        where cmoneda = '$')
        SET @cmoneda = ( SELECT trim(cmoneda)
        from maplanes
        where cplan = @cplan )

        IF @iplaca = 'N' BEGIN
            set @canTCR = 5
        END
        IF @iplaca = 'E' BEGIN
            set @canTCR = 17
        END
        SET  @primaPorTonelada = @toneladas * @canTCR

        IF @toneladas > 12 and @uso = 11 BEGIN
            SET  @toneladas = @toneladas - 12
            SET  @primaPorTonelada = @toneladas * @canTCR
        END
        ELSE SET  @primaPorTonelada = 0

        IF (DAY(@fdesde) > DAY(@fhasta)) AND (@cproducto <> 'E2')  BEGIN
            SET
        @diferenciaMeses = @diferenciaMeses -1;
        END

        IF @iplaca = 'N' BEGIN
            SELECT @msuma_cos = msumacosas, @msuma_per = msumapers, @mprima_bas = mprimbas , @ptasaexc = ptasaexc
            FROM macattip
            WHERE ccategotr = @uso and ctipo = @tipoV;
        END
        ELSE IF @iplaca = 'E' BEGIN
            SELECT @msuma_cos = msumacosasext, @msuma_per = msumapersext, @mprima_bas = mprimext , @ptasaexc = ptasaexc
            FROM macattip
            WHERE ccategotr = @uso and ctipo = @tipoV;
        END

        CREATE TABLE #TempMonths
        (
            value INT,
            percentage DECIMAL(3, 2)
        );
        -- Insertar datos en la tabla temporal
        INSERT INTO #TempMonths
            (value, percentage)
        VALUES
            (0, 0.2),
            (1, 0.3),
            (2, 0.4),
            (3, 0.5),
            (4, 0.6),
            (5, 0.7),
            (6, 0.75),
            (7, 0.8),
            (8, 0.85),
            (9, 0.9),
            (10, 0.95),
            (11, 1),
            (12, 1);


		DECLARE @sumaAsegReferencia NUMERIC(18, 2), @porcentajeInma Real = 0;
		DECLARE @sumaAsegReferenciaMin NUMERIC(18, 2);
		DECLARE @sumaAsegReferenciaMax NUMERIC(18, 2);

       SELECT @sumaAsegReferencia = mvalor
       from maanomod
       where cmarca = @cmarca and cmodelo = @cmodelo and cversion = @cversion and cano = @cano

       SET @sumaAsegReferenciaMin = ROUND(@sumaAsegReferencia * 0.9, 2)
       SET @sumaAsegReferenciaMax = ROUND(@sumaAsegReferencia * 1.3, 2)

	   IF (ISNULL(@sumaAseg, 0) = 0)
		BEGIN
			SET @sumaAseg = @sumaAsegReferencia;
		END



		IF @modif = 0
		BEGIN
			IF (@sumaAseg > @sumaAsegReferenciaMax)
			BEGIN
				set @sumaAseg = @sumaAsegReferenciaMax
			END
			ELSE IF (@sumaAseg < @sumaAsegReferenciaMin)
			BEGIN
				set @sumaAseg = @sumaAsegReferenciaMin
			END
		END


		DECLARE @tasaSCa NUMERIC(18, 2), @tasaSPt NUMERIC(18, 2), @tasaSPp NUMERIC(18, 2);

		SELECT @tasaSCa = dbo.fn_buscar_tasa_casco(@cmarca, @cmodelo, @cversion, @cano, '1', @sumaAseg);
		SELECT @tasaSPt = dbo.fn_buscar_tasa_casco(@cmarca, @cmodelo, @cversion, @cano, '2', @sumaAseg);
		SELECT @tasaSPp = dbo.fn_buscar_tasa_casco(@cmarca, @cmodelo, @cversion, @cano, '28', @sumaAseg);

		IF @modif = 0
		BEGIN
            SET @tasaCa = ISNULL(NULLIF(@tasaSCa, 0), @tasaCa);
            SET @tasaPt = ISNULL(NULLIF(@tasaSPt, 0), @tasaPt);
            SET @tasaPp = ISNULL(NULLIF(@tasaSPp, 0), @tasaPp);
		END
		ELSE
		BEGIN
            SET @tasaCa = ISNULL(NULLIF(@tasaCa, 0), @tasaSCa);
            SET @tasaPt = ISNULL(NULLIF(@tasaPt, 0), @tasaSPt);
            SET @tasaPp = ISNULL(NULLIF(@tasaPp, 0), @tasaSPp);
		END


        SELECT @contador = cubii + 1
        FROM macontadores_web;
        -- Cursor para iterar sobre los planes
        DECLARE plan_cursor CURSOR FOR

        SELECT
            a.cplan, a.xplan, trim(b.ccobertura) as ccobertura, c.xdescripcion_l, trim(a.cproducto) as cproducto, c.cmoneda, d.ctarifa, d.cramoint, d.ccoberturaint, e.msumamax, e.mprima, e.pprima, f.pprima 'pprima_tar', trim(c.ccobertura) 'ccobertura',
            --h.xcalculo 'xcobertura', case trim(h.cgruptar) when 'AD' then 1 else 0 end 'badicional'
            h.xcalculo 'xcobertura', h.cgruptar 'xvalor', case  when h.cgruptar is not null  then 1 else 0 end 'badicional'
        FROM
            maplanes a
            inner JOIN maplancob b ON a.cplan = b.cplan AND a.cramo = @cramo AND a.iestado = 'V'
            inner JOIN macoberturas c ON a.cramo = c.cramo AND b.ccobertura = c.ccobertura
            inner JOIN matarifa d ON a.cramo = d.cramo AND b.ccobertura = d.ccober
            inner JOIN maplantar e ON a.cplan = e.cplan AND e.cramo = a.cramo AND e.ccober = b.ccobertura and e.ctarifa = d.ctarifa
            inner JOIN matarifa_d f ON f.ccober = d.ccober AND f.cramo = a.cramo AND f.iestado = 'V' and e.ctarifa = f.ctarifa
            inner JOIN macattip ON macattip.ccategotr = @uso  AND macattip.ctipo = @tipoV
            left JOIN instarint h ON d.ctarifaint = h.ctarifaint AND c.ccoberturaint = h.ccoberturaint AND d.cramoint = h.cramoint
            WHERE  RTRIM(a.cplan) LIKE COALESCE(@cplan, '%');

        OPEN plan_cursor;
        FETCH NEXT FROM  plan_cursor INTO @cplan, @xplan, @ccobertura, @xdescripcion_l, @cproducto, @cmoneda, @ctarifa, @cramoint, @ccoberturaint, @msumamax, @mprima, @pprima, @pprima_tar, @ccobertura_num,@xcobertura,@xvalor,@badicional;
        WHILE @@FETCH_STATUS = 0 BEGIN

            -- Validación por tipo de cobertura con lógica específica
            IF @cproducto IN ('E', 'E1', 'E3')
            BEGIN

                SET @tasaCa = CASE
                    WHEN @ccobertura_num = 1 THEN isnull(@pprima,@tasaCa)
                    ELSE @tasaCa
                END

                SET @tasaPt = CASE
                    WHEN @ccobertura_num = 2 THEN isnull(@pprima,@tasaPt)
                    ELSE @tasaPt
                END

                SET @tasaPP = CASE
                    WHEN @ccobertura_num = 28 THEN isnull(@pprima,@tasaPP)
                    ELSE @tasaPP
                END
                SET @prima = CASE
                    /* Coberturas de casco */
                    WHEN @ccobertura_num = 1 THEN @sumaAseg * isnull(@tasaCa,@pprima) / 100       --Calculo bello
                    WHEN @ccobertura_num = 2 THEN @sumaAseg * isnull(@tasaPt,@pprima) / 100       --Calculo hermoso
                    WHEN @ccobertura_num in (3,16,4)  --Calculo precioso
                    THEN
                        CASE WHEN @mprima = 0
                            THEN
                                CASE WHEN @pprima > 0 THEN @sumaAseg * @pprima / 100
                                ELSE 0 END
                        ELSE @mprima END

                    ELSE COALESCE(@mprima, @prima)
                END;
            END
            ELSE IF @cproducto = 'E2'
            BEGIN

                SET @tasaCa = CASE
                    WHEN @ccobertura_num = 1 THEN @pprima
                    ELSE @tasaCa
                END

                SET @tasaPt = CASE
                    WHEN @ccobertura_num = 2 THEN @pprima
                    ELSE @tasaPt
                END

                SET @tasaPP = CASE
                    WHEN @ccobertura_num = 28 THEN @pprima
                    ELSE @tasaPP
                END
                SET @prima = CASE
                    /* Coberturas de casco */
					WHEN @ccobertura_num = 7
                        THEN
                        CASE @mprima WHEN  0
                            THEN
                                CASE WHEN @pprima > 0 THEN   (@mprima_bas + @primaPorTonelada )* @tasaTCR / @tasaUSD
                                ELSE (@mprima_bas + @primaPorTonelada )* @tasaTCR / @tasaUSD END
                        ELSE @mprima END
					WHEN @ccobertura_num = 1 THEN @sumaAseg * isnull(@tasaCa,@pprima) / 100       --Calculo bello
                    WHEN @ccobertura_num = 1 THEN @sumaAseg * isnull(@tasaCa,@pprima) / 100       --Calculo bello
                    WHEN @ccobertura_num = 2 THEN @sumaAseg * isnull(@tasaPt,@pprima) / 100       --Calculo hermoso
                    WHEN @ccobertura_num in (3,16,4)  --Calculo precioso
                    THEN
                        CASE WHEN @mprima = 0
                            THEN
                                CASE WHEN @pprima > 0 THEN @sumaAseg * @pprima / 100
                                ELSE 0 END
                        ELSE @mprima END

                    ELSE COALESCE(@mprima, @prima)
                END;
            END
            ELSE
            BEGIN
                SET @prima = CASE

                    WHEN @ccobertura_num in (1)
                    THEN
                        CASE WHEN @mprima = 0
                            THEN
                                CASE WHEN @pprima > 0 THEN @sumaAseg * @pprima / 100
                                ELSE @sumaAseg * @tasaCa  / 100   END
                        ELSE @mprima END


                    WHEN @ccobertura_num in (2)
                    THEN
                        CASE WHEN @mprima = 0
                            THEN
                                CASE WHEN @pprima > 0 THEN @sumaAseg * @pprima / 100
                                ELSE @sumaAseg * @tasaPt / 100  END
                    ELSE @mprima END

                    WHEN @ccobertura_num in (28)
                    THEN
                        CASE WHEN @mprima = 0
                            THEN
                                CASE WHEN @pprima > 0 THEN @sumaAseg * @pprima / 100
                                ELSE @sumaAseg * @tasaPP / 100  END
                    ELSE @mprima END

                    WHEN @ccobertura_num in (3,16,4)  --Calculo precioso
                    THEN
                        CASE WHEN @mprima = 0
                            THEN
                                CASE WHEN @pprima > 0 THEN @sumaAseg * @pprima / 100
                                ELSE @sumaAseg * @pprima_tar / 100 END
                        ELSE @mprima END

                    WHEN @ccobertura_num in (9,5)
                    THEN
                        CASE WHEN @mprima = 0
                            THEN
                                CASE WHEN @pprima > 0 THEN @msumamax * @pprima / 100
                                ELSE @msumamax * @pprima_tar / 100 END
                        ELSE @mprima END

                    WHEN @ccobertura_num in (8)
                    THEN
                        CASE WHEN @mprima = 0
                            THEN
                                CASE WHEN @pprima > 0 THEN @msumamax * @pprima / 100
                                ELSE @msumamax * @ptasaexc / 100 END
                        ELSE @mprima END

                    WHEN @ccobertura_num >= 10 AND @ccobertura_num <= 13
                    THEN
                        CASE WHEN @pprima > 0 THEN (@msumamax * @pprima / 100) * @puestos
                        ELSE (@msumamax * @pprima_tar / 100) * @puestos END

                    WHEN @ccobertura_num in (7)
                        THEN
                        CASE @mprima WHEN  0
                            THEN
                                CASE WHEN @pprima > 0 THEN   (@mprima_bas + @primaPorTonelada )* @tasaTCR / @tasaUSD
                                ELSE (@mprima_bas + @primaPorTonelada )* @tasaTCR / @tasaUSD END
                        ELSE @mprima END

                    WHEN @ccobertura_num = 6
                        THEN
                        CASE WHEN @mprima = 0
                            THEN 0
                    ELSE 0 END

                    ELSE COALESCE(@mprima, @prima)
                END;
            END

            SET @masegurada = CASE
                WHEN @ccobertura_num IN (1, 2, 3, 4, 16,28) THEN @sumaAseg
                WHEN @ccobertura_num = 6 THEN @msuma_per
                WHEN @ccobertura_num = 7 THEN @msuma_cos
                WHEN @ccobertura_num IN (8, 9, 5) THEN @msumamax
                WHEN @ccobertura_num BETWEEN 10 AND 13 THEN @msumamax
                ELSE @msumamax
            END;

            INSERT INTO #temp_calculo
            (
                cplan,
                xplan,
                ccobertura,
                xdescripcion_l,
                cproducto,
                cmoneda,
                nubii,
                tasaCA,
                tasaPT,
				tasaPP,
                primaBlCA,
                primaBLPT,
                primaAdCA,
                primaAdPT,
				primaAdPP,
                prima,
                masegurada,
                ctarifa,
                cramoint,
                ccoberturaint,
                xcobertura,
                badicional,
                xvalor
            )
            VALUES
            (
                @cplan,
                @xplan,
                @ccobertura,
                @xdescripcion_l,
                @cproducto,
                @cmoneda,
                @contador,
                @tasaCa,
                @tasaPt,
                @tasaPP,
                @sumaAsegBl * @tasaCa / 100,
                @sumaAsegBl * @tasaPt / 100,
                @sumaAsegAd * @tasaCa / 100,
                @sumaAsegAd * @tasaPt / 100,
                @sumaAsegAd * @tasaPP / 100,
                @prima,
                @masegurada,
                @ctarifa,
                @cramoint,
                @ccoberturaint,
                @xcobertura,
                @badicional,
                @xvalor
            );
            FETCH NEXT
        FROM
        plan_cursor INTO @cplan, @xplan, @ccobertura, @xdescripcion_l, @cproducto, @cmoneda, @ctarifa, @cramoint, @ccoberturaint, @msumamax, @mprima, @pprima, @pprima_tar, @ccobertura_num,@xcobertura,@xvalor,@badicional;
        END
        CLOSE plan_cursor;
        DEALLOCATE plan_cursor;

        IF  @iplaca = 'E' AND @cproducto <> 'E2' BEGIN
            UPDATE #temp_calculo SET prima =
            CASE
                WHEN @diferenciaMeses >= 1 THEN prima * (SELECT percentage
            FROM #TempMonths
            WHERE value = @diferenciaMeses)
                ELSE prima * (SELECT percentage
            FROM #TempMonths
            WHERE value = 0)
            END,
            primaBlCA =
            CASE
                WHEN @diferenciaMeses >= 1 THEN primaBlCA * (SELECT percentage
            FROM #TempMonths
            WHERE value = @diferenciaMeses)
                ELSE primaBlCA * (SELECT percentage
            FROM #TempMonths
            WHERE value = 0)
            END,
            primaBLPT =
            CASE
                WHEN @diferenciaMeses >= 1 THEN primaBLPT * (SELECT percentage
            FROM #TempMonths
            WHERE value = @diferenciaMeses)
                ELSE primaBLPT * (SELECT percentage
            FROM #TempMonths
            WHERE value = 0)
            END,
            primaAdCA =
            CASE
                WHEN @diferenciaMeses >= 1 THEN primaAdCA * (SELECT percentage
            FROM #TempMonths
            WHERE value = @diferenciaMeses)
                ELSE primaAdCA * (SELECT percentage
            FROM #TempMonths
            WHERE value = 0)
            END,
            primaAdPT =
            CASE
                WHEN @diferenciaMeses >= 1 THEN primaAdPT * (SELECT percentage
            FROM #TempMonths
            WHERE value = @diferenciaMeses)
                ELSE primaAdPT * (SELECT percentage
            FROM #TempMonths
            WHERE value = 0)
            END
            DELETE #temp_calculo where ccobertura in (1,2,3,16,4)
        END

        --IF @recargo <> 0 BEGIN
        IF @recargo <> 0 and @aplicaRecaDesc = 1 BEGIN
            SELECT @recargoCA =  prima * (@recargo / 100)
            FROM #temp_calculo
            where ccobertura = 1
            SELECT @recargoPT =  prima * (@recargo / 100)
            FROM #temp_calculo
            where ccobertura = 2
            SELECT @recargoPP =  prima * (@recargo / 100)
            FROM #temp_calculo
            where ccobertura = 28

            UPDATE #temp_calculo  SET prima = ROUND(prima,2) + ROUND(@recargoCA,2) where ccobertura = 1
            UPDATE #temp_calculo  SET prima = ROUND(prima,2) + ROUND(@recargoPT,2) where ccobertura = 2
            UPDATE #temp_calculo  SET prima = ROUND(prima,2) + ROUND(@recargoPT,2) where ccobertura = 28

        END

        IF @recargoRCV > 0 BEGIN
            UPDATE #temp_calculo  SET prima = (prima * @recargoRCV / 100) + prima
        END

        IF @puestos = 0
        BEGIN
            delete #temp_calculo where  ccobertura >= 10 AND ccobertura <= 13
        END

        --IF @cmoneda = '$' and @cproducto not in ('E', 'E1', 'E2', 'E3')
        -- BEGIN
        --     UPDATE #temp_calculo SET prima = (prima * @tasaTCR) / @tasaUSD where ccobertura in (6,7) and @tipoProduc is null
        -- END
/*
        IF (@tasaCa IS NULL or @tasaCa = 0)  DELETE #temp_calculo WHERE ccobertura in (3,16,4,1,5)
        IF (@tasaPt IS NULL or @tasaPt = 0)  DELETE #temp_calculo WHERE ccobertura in (3,16,4,2,5)
        IF (@tasaPP IS NULL or @tasaPP = 0)  DELETE #temp_calculo WHERE ccobertura in (3,16,4,28,5)
*/
        IF DATEDIFF(day,@fdesde, @fhasta) < 365 and (@iplaca <> 'E' AND @cproducto not in ('E2', 'E3'))
        BEGIN
            DECLARE @dias_faltantes INT;
            SET @dias_faltantes = 365 - DATEDIFF(day,@fdesde, @fhasta);

            ALTER TABLE #temp_calculo ADD primaDia DECIMAL(18, 3);
            ALTER TABLE #temp_calculo ADD primaTotal DECIMAL(18, 3);
            ALTER TABLE #temp_calculo ADD diasDiferencia int;

            UPDATE #temp_calculo   SET diasDiferencia = (365 - DATEDIFF(day,@fdesde, @fhasta))
            UPDATE  #temp_calculo  SET primaDia = (prima / 365)
            --prima diaria
            UPDATE  #temp_calculo  SET primaTotal = primaDia * @dias_faltantes
            --prima diaria

            UPDATE  #temp_calculo  SET prima = prima - primaTotal

            ALTER TABLE #temp_calculo DROP COLUMN primaDia;
            ALTER TABLE #temp_calculo DROP COLUMN primaTotal;
            ALTER TABLE #temp_calculo DROP COLUMN diasDiferencia;
        END

        IF ((SELECT SUM(prima)
        FROM #temp_calculo) = 0)
        BEGIN
            DECLARE @mensaje NVARCHAR(100), @status BIT;
            SET @mensaje = 'Error en calculo'
            SET @status = 0
            ;THROW 99001, @mensaje, @status
        END

        IF @coberAdicional = 'RC' OR @modif = 0 or (@aplicaRecaDesc = 0 and year(GETDATE()) - @cano > 20 or (@tipoV in (4,6,8) and @cproducto NOT IN ('E', 'E1', 'E2', 'E3')) ) BEGIN
        	DELETE #temp_calculo where ccobertura in (
        	'4','5', /*CASCO*/
        	'1','3', /*Cobertura Amplia*/
        	'2','16', /*Perdida Total*/
        	'28', /*Perdida Parcial*/
        	'69' /*APOV Binacional*/)
        	/*IF @aplicaRecaDesc = 0 and year(GETDATE()) - @cano > 20 and (@tipoV in (4,6,8) and @cproducto NOT IN ('E', 'E1', 'E2', 'E3')) BEGIN
        		DELETE #temp_calculo where cplan != 'RCVBAS'
        	END*/
    	END ELSE IF @coberAdicional = 'CA' BEGIN
	    	DELETE #temp_calculo where ccobertura in ('2','16','28','69')
	    END ELSE IF @coberAdicional = 'PT' BEGIN
		    DELETE #temp_calculo where ccobertura in ('1','3','28','69')
	    END ELSE IF @coberAdicional = 'PP' BEGIN
		    DELETE #temp_calculo where ccobertura in ('1','2','3','4','5','16','69')
	    END ELSE IF @coberAdicional = 'AP' BEGIN
		    DELETE #temp_calculo where ccobertura in ('1','2','3','4','5','16','28')
	    END

	    SELECT * from #temp_calculo
	    IF @incluirTotales = 1 BEGIN

	        SELECT sum(case
		        WHEN ccobertura in ('28') then prima
		        ELSE 0
	        END) AS 'totalPP',
	        sum(case
		        WHEN ccobertura in ('69') then prima
		        ELSE 0
	        END) AS 'totalAP',
	        sum(case
		        WHEN ccobertura in ('1','3','4','5') then prima
		        ELSE 0
	        END) AS 'totalCA',
	        sum(case
		        WHEN ccobertura in ('2','16','4','5') then prima
		        ELSE 0
	        END) AS 'totalPT',
	        sum(case
		        WHEN ccobertura in ('17') then prima
		        ELSE 0
	        END) AS 'totalBL',
	        sum(case
		        WHEN ccobertura in ('18') then prima
		        ELSE 0
	        END) AS 'totalAD',
	        sum(case
		        WHEN ccobertura not in ('4','5','1','3','2','16','28','69') then prima
		        ELSE 0
	        END) AS 'totalPA'
	        FROM #temp_calculo

        END

        DROP table  #TempMonths



    END
END;

