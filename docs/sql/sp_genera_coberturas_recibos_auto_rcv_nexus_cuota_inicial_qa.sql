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
    @coberturas_cuota_inicial VARCHAR(100) = '15,17'
	
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
