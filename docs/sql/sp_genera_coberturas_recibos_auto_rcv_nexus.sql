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
    @cproces_in NUMERIC(18, 0) = NULL

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
	@itipoprod VARCHAR(10), @fanopol_cert INT, @fmespol_cert INT, @moneda_local BIT;

	IF @cproces_in IS NOT NULL AND EXISTS(SELECT 1 FROM adpoliza WHERE cproces = @cproces_in)
	BEGIN
		SELECT TOP 1
			@cnpoliza = cnpoliza, @cproces = cproces, @fdesde_pol = fdesde, @fhasta_pol = fhasta, 
			@ifrecuencia = ifrecuencia, @cramo = cramo, @cplan = cplan, @cproductor = cproductor, @cmoneda = cmoneda,
			@fano = fanopol, @fmes = fmespol, @itipopol = itipopol, @csucur = csucur, @ptasamon = ptasamon,
			@ifuente = ifuente, @cprog = cprog, @ccanalalt = ccanalalt, @cscanalalt = cscanalalt, @ctipocanal = ctipocanal,
			@casegurado = casegurado, @ctenedor = ctenedor, @cbeneficiario = ISNULL(cbeneficiario, casegurado),
			@cusuario = COALESCE(@cusuario, cusuario), @femision = forigen, @cgestor = cgestor, @ccategoria = ccategoria,
			@itipoprod = ISNULL(itipoprod, 'NU')
		FROM adpoliza 
		WHERE cproces = @cproces_in;
	END
	ELSE IF @ccerti IS NOT NULL AND @ccerti > 0
		AND EXISTS (SELECT 1 FROM vhcerti WHERE cpoliza = @cpoliza AND ccerti = @ccerti)
	BEGIN
		SELECT TOP 1
			@fanopol_cert = fanopol,
			@fmespol_cert = fmespol
		FROM vhcerti
		WHERE cpoliza = @cpoliza AND ccerti = @ccerti
		ORDER BY fanopol DESC, fmespol DESC;

		SELECT TOP 1
			@cnpoliza = cnpoliza, @cproces = cproces, @fdesde_pol = fdesde, @fhasta_pol = fhasta, 
			@ifrecuencia = ifrecuencia, @cramo = cramo, @cplan = cplan, @cproductor = cproductor, @cmoneda = cmoneda,
			@fano = fanopol, @fmes = fmespol, @itipopol = itipopol, @csucur = csucur, @ptasamon = ptasamon,
			@ifuente = ifuente, @cprog = cprog, @ccanalalt = ccanalalt, @cscanalalt = cscanalalt, @ctipocanal = ctipocanal,
			@casegurado = casegurado, @ctenedor = ctenedor, @cbeneficiario = ISNULL(cbeneficiario, casegurado),
			@cusuario = COALESCE(@cusuario, cusuario), @femision = forigen, @cgestor = cgestor, @ccategoria = ccategoria,
			@itipoprod = ISNULL(itipoprod, 'NU')
		FROM adpoliza 
		WHERE cpoliza = @cpoliza
		  AND fanopol = @fanopol_cert
		  AND fmespol = @fmespol_cert
		ORDER BY fanopol DESC, fmespol DESC;
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
			@itipoprod = ISNULL(itipoprod, 'NU')
		FROM adpoliza 
		WHERE cpoliza = @cpoliza
		ORDER BY fanopol DESC, fmespol DESC;
	END;

	SET @cplan = NULLIF(RTRIM(@cplan), '');

	IF @cnpoliza IS NULL OR NULLIF(RTRIM(@cnpoliza), '') IS NULL
		THROW 99101, 'sp_genera_coberturas: no se encontró la póliza en adpoliza (cpoliza/cproces inválido).', 1;

	IF @cramo IS NULL OR NULLIF(RTRIM(@cplan), '') IS NULL
		THROW 99102, 'sp_genera_coberturas: cramo/cplan ausentes en adpoliza; no se puede tarifar.', 1;

	SET @moneda_local = CASE WHEN UPPER(RTRIM(ISNULL(@cmoneda, ''))) IN ('BS', 'BS.') THEN 1 ELSE 0 END;

    -- Tasa de cambio: solo cuando la moneda de emisión/recibo no es la moneda local (Bs)
    SET @tasa_cambio = 1.0;

    IF @moneda_local = 0
    BEGIN
        IF @ptasamon_pago IS NOT NULL AND @ptasamon_pago > 1.0
            SET @tasa_cambio = @ptasamon_pago;
        ELSE IF @ptasamon IS NOT NULL AND @ptasamon > 1.0
            SET @tasa_cambio = @ptasamon;
        ELSE
        BEGIN
            SELECT TOP 1 @tasa_cambio = ptasamon
            FROM mamonedas 
            WHERE cmoneda = '$' AND iestado = 'V';

            IF @tasa_cambio IS NULL OR @tasa_cambio <= 0
                SET @tasa_cambio = 1.0;
        END;
    END;

    IF @ptasamon IS NULL OR @ptasamon <= 1.0
    BEGIN
        SELECT TOP 1 @ptasamon = ptasamon
        FROM mamonedas 
        WHERE cmoneda = '$' AND iestado = 'V';

        IF @ptasamon IS NULL OR @ptasamon <= 1.0
            SET @ptasamon = CASE WHEN @moneda_local = 0 THEN @tasa_cambio ELSE 1.0 END;
    END;

    IF @ptasamon_pago IS NULL OR @ptasamon_pago <= 1.0
        SET @ptasamon_pago = CASE WHEN @moneda_local = 0 THEN @tasa_cambio ELSE @ptasamon END;

    IF (@coberAdicional IS NULL OR TRIM(@coberAdicional) = '')
        SET @coberAdicional = 'RC';

    IF (@iplaca IS NULL OR TRIM(@iplaca) = '')
        SET @iplaca = 'N';

    -- Vehículo del tramo/certificado que se está emitiendo
    SELECT TOP 1
        @cmarca = TRIM(cmarca), @cmodelo = TRIM(cmodelo), @cversion = TRIM(cversion), 
        @cano = cano, @tipoV = ctipo, @uso = cuso, @puestos = qpuestos
    FROM vhcerti 
    WHERE cpoliza = @cpoliza
      AND fanopol = @fano
      AND fmespol = @fmes
      AND (@ccerti IS NULL OR @ccerti = 0 OR ccerti = @ccerti)
    ORDER BY CASE WHEN @ccerti IS NOT NULL AND @ccerti > 0 AND ccerti = @ccerti THEN 0 ELSE 1 END,
             fanopol DESC, fmespol DESC;

	IF @cmarca IS NULL OR @cmodelo IS NULL OR @cversion IS NULL OR @cano IS NULL
		THROW 99103, 'sp_genera_coberturas: no se encontró vehículo en vhcerti para la póliza; no se puede cotizar.', 1;

    IF (@msumaaseg IS NULL OR @msumaaseg <= 0)
    BEGIN
        SELECT TOP 1 @msumaaseg = mvalor
        FROM vhcerti
        WHERE cpoliza = @cpoliza
          AND fanopol = @fano
          AND fmespol = @fmes
          AND (@ccerti IS NULL OR @ccerti = 0 OR ccerti = @ccerti)
          AND mvalor > 0
        ORDER BY fanopol DESC, fmespol DESC;

        IF (@msumaaseg IS NULL OR @msumaaseg <= 0)
        BEGIN
            SELECT TOP 1 @msumaaseg = msumabruta 
            FROM adrecibos 
            WHERE cpoliza = @cpoliza
              AND fanopol = @fano
              AND fmespol = @fmes
              AND msumabruta > 0
            ORDER BY fanopol DESC, fmespol DESC;
        END;
    END;

	IF @mprima IS NOT NULL AND @mprima > 0
	BEGIN
		IF @moneda_local = 1
		BEGIN
			SET @mprimaext = ROUND(@mprima / NULLIF(@ptasamon, 0), 2);
		END
		ELSE
		BEGIN
			SET @mprimaext = ROUND(@mprima, 2);
			SET @mprima = ROUND(@mprima * @tasa_cambio, 2);
		END
	END;

	IF @msumaaseg IS NOT NULL AND @msumaaseg > 0
	BEGIN
		IF @moneda_local = 1
			SET @msumaasegext = ROUND(@msumaaseg / NULLIF(@ptasamon, 0), 2);
		ELSE
			SET @msumaasegext = ROUND(@msumaaseg, 2);
	END;

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
            @tasaPP = @tasaPp,
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
					@crecibo, c.ccober, c.ctarifa, '!', @cramo, @cpoliza, @fano, @fmes, @ccerti, c.ccoberimp, c.ietiqtarimp, c.qordenimp,
					@cnpoliza, @cnrecibo, @cproces, @csucur, @cmoneda, @ptasamon, @itipoprod, @FDESDE_REC, @FHASTA_REC, 'N', 0, 
					fd.bfraded, fd.mdedu_fran, fd.mdedu_franext, fd.pdedu_fran, 'V', e.isuma, e.cramoint, e.ccoberturaint, c.ctarifaint,
					@cprog, @ifuente, 0, 0, GETDATE(), @cusuario, @ccategoria, null, null, null, null, null,
					CASE WHEN @moneda_local = 1
						THEN ROUND(COALESCE(m.masegurada, 0), 2)
						ELSE ROUND(COALESCE(m.masegurada, 0) * @tasa_cambio, 2)
					END,
					CASE WHEN @moneda_local = 1
						THEN ROUND(COALESCE(m.masegurada, 0) / NULLIF(@ptasamon, 0), 2)
						ELSE ROUND(COALESCE(m.masegurada, 0), 2)
					END,
					CASE WHEN @moneda_local = 1
						THEN ROUND(COALESCE(m.masegurada, 0), 2)
						ELSE ROUND(COALESCE(m.masegurada, 0) * @tasa_cambio, 2)
					END,
					CASE WHEN @moneda_local = 1
						THEN ROUND(COALESCE(m.masegurada, 0) / NULLIF(@ptasamon, 0), 2)
						ELSE ROUND(COALESCE(m.masegurada, 0), 2)
					END,
					CASE WHEN @moneda_local = 1
						THEN ROUND(COALESCE(m.prima, 0) / @cuotas, 2)
						ELSE ROUND(COALESCE(m.prima, 0) * @tasa_cambio / @cuotas, 2)
					END,
					CASE WHEN @moneda_local = 1
						THEN ROUND(COALESCE(m.prima, 0) / NULLIF(@ptasamon, 0) / @cuotas, 2)
						ELSE ROUND(COALESCE(m.prima, 0) / @cuotas, 2)
					END,
					fd.pprima,
					0, 0, 0, 0, 0, 0,
					CASE WHEN @moneda_local = 1
						THEN ROUND(COALESCE(m.prima, 0) / @cuotas, 2)
						ELSE ROUND(COALESCE(m.prima, 0) * @tasa_cambio / @cuotas, 2)
					END,
					CASE WHEN @moneda_local = 1
						THEN ROUND(COALESCE(m.prima, 0) / NULLIF(@ptasamon, 0) / @cuotas, 2)
						ELSE ROUND(COALESCE(m.prima, 0) / @cuotas, 2)
					END,
					C.bprimarea, 
					CASE WHEN @moneda_local = 1
						THEN ROUND(COALESCE(m.prima, 0) / @cuotas, 2)
						ELSE ROUND(COALESCE(m.prima, 0) * @tasa_cambio / @cuotas, 2)
					END,
					CASE WHEN @moneda_local = 1
						THEN ROUND(COALESCE(m.prima, 0) / NULLIF(@ptasamon, 0) / @cuotas, 2)
						ELSE ROUND(COALESCE(m.prima, 0) / @cuotas, 2)
					END,
					CASE WHEN @cproductor = 80080 THEN 0.0 ELSE B.pcomision END,
					CASE WHEN @cproductor = 80080 THEN 0.0
						WHEN @moneda_local = 1 THEN ROUND(COALESCE(m.prima, 0) / @cuotas * B.pcomision / 100, 2)
						ELSE ROUND(COALESCE(m.prima, 0) * @tasa_cambio / @cuotas * B.pcomision / 100, 2)
					END,
					CASE WHEN @cproductor = 80080 THEN 0.0
						WHEN @moneda_local = 1 THEN ROUND(COALESCE(m.prima, 0) / NULLIF(@ptasamon, 0) / @cuotas * B.pcomision / 100, 2)
						ELSE ROUND(COALESCE(m.prima, 0) / @cuotas * B.pcomision / 100, 2)
					END
					FROM maplantar A
					INNER JOIN maarancel B ON A.ccober = B.ccober and A.cramo = B.cramo
					INNER JOIN matarifa C ON A.ccober = C.ccober and A.cramo = C.cramo and A.ctarifa = C.ctarifa
					INNER JOIN macoberturas e ON e.ccobertura = c.ccober and e.cramo = c.cramo
					LEFT JOIN matarifa_d fd ON fd.ccober = c.ccober and fd.cramo = c.cramo and fd.ctarifa = c.ctarifa
					INNER JOIN #montos m ON TRIM(m.ccobertura) = TRIM(a.ccober)
					WHERE A.cramo=@cramo AND TRIM(A.cplan)=TRIM(@cplan) and B.iestado = 'V';

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
					SELECT
						a.crecibo,
						a.ccober,
						MAX(a.u_version),
						a.cramo,
						a.cpoliza,
						a.fanopol,
						a.fmespol,
						MAX(a.ccerti),
						MAX(a.cnpoliza),
						MAX(a.cnrecibo),
						MAX(a.cproces),
						MAX(a.csucur),
						MAX(a.cmoneda),
						MAX(a.ptasamon),
						MAX(a.fdesde),
						MAX(a.fhasta),
						MAX(a.itipoprod),
						MAX(a.msumaaseg),
						MAX(a.msumaasegext),
						SUM(a.mprimabruta),
						SUM(a.mprimabrutaext),
						MAX(a.pcomision),
						SUM(a.mcomision),
						SUM(a.mcomisionext),
						SUM(a.mprimareas),
						SUM(a.mprimareasext),
						MAX(a.istattar),
						MAX(c.isuma),
						MAX(c.ccontrea),
						MAX(c.cramorea),
						MAX(c.cramopcnd),
						MAX(c.ccoberpcnd),
						MAX(c.cramoint),
						MAX(c.ccoberturaint),
						MAX(a.cprog),
						MAX(a.ifuente),
						MAX(a.bok),
						MAX(a.cerror),
						GETDATE(),
						MAX(a.cusuario),
						MAX(a.ccategoria),
						MAX(a.cusuarioauto),
						MAX(a.ccategoriaauto),
						MAX(a.fultmod),
						MAX(a.cusuariomod),
						MAX(a.ccategoriamod)
					FROM adpoltar a
					INNER JOIN macoberturas c ON c.ccobertura = a.ccober AND c.cramo = a.cramo
					WHERE a.crecibo = @crecibo
					GROUP BY a.crecibo, a.ccober, a.cramo, a.cpoliza, a.fanopol, a.fmespol;

					IF NOT EXISTS (SELECT 1 FROM adpolcob WHERE crecibo = @crecibo)
						THROW 99108, 'sp_genera_coberturas: INSERT adpolcob no generó coberturas para el recibo.', 1;

					SET @msumaaseg = NULL;
					SET @msumaasegext = NULL;

					SELECT TOP 1
						@msumaaseg = cob.msumaaseg,
						@msumaasegext = cob.msumaasegext
					FROM adpolcob cob
					INNER JOIN macoberturas mc ON mc.ccobertura = cob.ccober AND mc.cramo = cob.cramo
					WHERE cob.crecibo = @crecibo
					ORDER BY
						CASE RTRIM(ISNULL(mc.isuma, ''))
							WHEN 'P' THEN 0
							WHEN 'S' THEN 1
							WHEN 'T' THEN 2
							ELSE 3
						END,
						cob.msumaaseg DESC;

					IF @msumaaseg IS NULL OR @msumaaseg <= 0
					BEGIN
						SELECT @msumaaseg = MAX(msumaaseg), @msumaasegext = MAX(msumaasegext)
						FROM adpolcob WHERE crecibo = @crecibo;
					END;

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
					ifrecuencia, cnrecibo_rel, ccanalalt, cscanalalt, ctipocanal)

					SELECT 
					@crecibo,       '!', @cnpoliza,   @cnrecibo, @cpoliza,  @fano,   @fmes, @cramo,      @itipoprod,   'DI',      'I',
					'N',                    0,            0,        'P',        'IN',        0,     1,  1,     3,      @ccerti, @cproces,
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
					@ifrecuencia, @cnrecibo_rel, @ccanalalt, @cscanalalt, @ctipocanal;

			UPDATE vhcerti 
			SET mvalor = ISNULL(NULLIF(@msumaaseg, 0), mvalor),
			    mtotpri = ISNULL(@mprimaext, mtotpri),
			    mtotcom = ISNULL(@mcomisionext, mtotcom)
			WHERE cpoliza = @cpoliza
			  AND fanopol = @fano
			  AND fmespol = @fmes
			  AND (@ccerti IS NULL OR @ccerti = 0 OR ccerti = @ccerti);

			IF OBJECT_ID('dbo.sp_genera_adpolrea_nexus') IS NOT NULL AND @crecibo IS NOT NULL
			    EXEC dbo.sp_genera_adpolrea_nexus @crecibo;

			SELECT @FDESDE_REC = @FHASTA_REC;
			SELECT @FHASTA_REC = CONVERT(DATE, DATEADD(MM, 12 / @cuotas, @FDESDE_REC));
			SELECT @ncuo = @ncuo + 1;
	END

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
