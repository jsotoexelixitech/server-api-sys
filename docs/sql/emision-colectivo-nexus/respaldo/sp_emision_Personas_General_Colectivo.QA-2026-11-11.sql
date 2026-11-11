-- ============================================================================
-- Author:      Hamilton Leon
-- Create date: 2026-09-29
-- Description: Logica para la emision de colectivos sin tocar el flujo de invididuales
-- ============================================================================
CREATE   PROCEDURE [dbo].[sp_emision_Personas_General_Colectivo]
	@id            INT,
	@pSuccess      BIT           = 0 OUTPUT,
	@pErrorMessage NVARCHAR(MAX) = NULL OUTPUT
AS
BEGIN
	SET NOCOUNT ON;
	SET XACT_ABORT ON;

	BEGIN TRY
		BEGIN TRANSACTION;

		DECLARE
			@cnpoliza_rel varchar(30), @cplan varchar(10), @xcanal_venta varchar(250), @icedula_tomador char(1),
			@xrif_tomador numeric(9), @xnombre_tomador varchar(250), @xapellido_tomador varchar(250), @isexo_tomador char(1),
			@iestado_civil_tomador char(1), @fnac_tomador DATE, @cestado_tomador varchar(100), @cciudad_tomador varchar(100),
			@xdireccion_tomador varchar(1000), @xtelefono_tomador varchar(250), @xcorreo_tomador varchar(250), @icedula_titular char(1),
			@xrif_titular numeric(9), @xnombre_titular varchar(250), @xapellido_titular varchar(250), @isexo_titular char(1),
			@iestado_civil_titular char(1), @fnac_titular DATE, @cestado_titular varchar(100), @cciudad_titular varchar(100),
			@xdireccion_titular varchar(1000), @xtelefono_titular varchar(250), @xcorreo_titular varchar(250), @cproductor int,
			@ptasamon numeric(18, 6), @cmoneda char(4), @ifrecuencia char(1), @femision DATE, @fdesde DATE, @fhasta DATE,
			@cprog char(20), @ifuente char(10), @fingreso datetime, @cpoliza numeric(19, 0), @cnpoliza varchar(30),
			@cproces numeric(13, 0), @cramo int, @cramoint int, @msumaaseg numeric(18, 2), @ccanalalt int, @cscanalalt int,
			@ctipocanal char(1), @corigen_rel char(2),
			@csucur int, @csucurrec int, @POL_RAMO VARCHAR(20), @cuotas INT,
			@fano smallint, @fmes smallint, @fdesde_pol DATE, @fhasta_pol DATE, @fdesde_rec DATE, @fhasta_rec DATE,
			@xcliente_tomador VARCHAR(250), @xcliente_titular VARCHAR(250),
			@tplCpoliza NUMERIC(19, 0), @tplFanopol SMALLINT, @tplFmespol TINYINT, @tplFdesde DATETIME,
			@cnrecibo varchar(50), @crecibo numeric(19), @cpoliza_o numeric(19), @cnpoliza_o varchar(30), @cproces_o numeric(13),
			@nrecibo INT, @ncuo INT, @iestadorec CHAR(1), @fcobro DATE, @mprimarec numeric(18, 2), @mprimarecext numeric(18, 2),
			@mcomision numeric(18, 2), @mcomisionext numeric(18, 2), @pcomision numeric(9, 2), @error VARCHAR(400)

		SELECT
			@cnpoliza_rel = cnpoliza_rel, @cplan = cplan, @xcanal_venta = xcanal_venta, @icedula_tomador = icedula_tomador,
			@xrif_tomador = xrif_tomador, @xnombre_tomador = xnombre_tomador, @xapellido_tomador = xapellido_tomador,
			@isexo_tomador = isexo_tomador, @iestado_civil_tomador = iestado_civil_tomador, @fnac_tomador = fnac_tomador,
			@cestado_tomador = cestado_tomador, @cciudad_tomador = cciudad_tomador, @xdireccion_tomador = xdireccion_tomador,
			@xtelefono_tomador = xtelefono_tomador, @xcorreo_tomador = xcorreo_tomador, @icedula_titular = icedula_titular,
			@xrif_titular = xrif_titular, @xnombre_titular = xnombre_titular, @xapellido_titular = xapellido_titular,
			@isexo_titular = isexo_titular, @iestado_civil_titular = iestado_civil_titular, @fnac_titular = fnac_titular,
			@cestado_titular = cestado_titular, @cciudad_titular = cciudad_titular, @xdireccion_titular = xdireccion_titular,
			@xtelefono_titular = xtelefono_titular, @xcorreo_titular = xcorreo_titular, @cproductor = cproductor,
			@ptasamon = ptasamon, @cmoneda = cmoneda, @ifrecuencia = ifrecuencia, @femision = femision, @fdesde = fdesde,
			@fhasta = fhasta, @cprog = cprog, @ifuente = ifuente, @fingreso = fingreso, @cpoliza = cpoliza, @cnpoliza = cnpoliza,
			@cproces = cproces, @cramo = cramo, @msumaaseg = msumaaseg, @ccanalalt = ccanalalt, @cscanalalt = cscanalalt,
			@ctipocanal = ctipocanal, @corigen_rel = corigen_rel
		FROM dbo.TMEMISION_PERSONAS_GENERAL WITH (NOLOCK)
		WHERE id = @id

		IF @@ROWCOUNT = 0
		BEGIN
			RAISERROR('No existe registro en TMEMISION_PERSONAS_GENERAL para el @id enviado.', 16, 1)
		END

		SELECT @cramoint = cramoint FROM dbo.maramos WITH (NOLOCK) WHERE cramo = @cramo

		-- Resolucion de la plantilla colectiva vigente (pcplanes) para este @cplan: aqui viven las primas configuradas
		SELECT TOP 1
			@tplCpoliza = p.cpoliza, @tplFanopol = p.fanopol, @tplFmespol = p.fmespol, @tplFdesde = p.fdesde
		FROM dbo.pcplanes p WITH (NOLOCK)
		WHERE p.cplan = @cplan AND p.iestado = 'V' AND p.cramo = @cramo -- el cplan se repite entre ramos
		ORDER BY p.fdesde DESC, p.cpoliza DESC

		IF @tplCpoliza IS NULL
		BEGIN
			RAISERROR('No se encontro configuracion vigente en pcplanes para el plan colectivo.', 16, 1)
		END

		IF (@ifrecuencia = 'M') SELECT @cuotas = 12
		IF (@ifrecuencia = 'T') SELECT @cuotas = 4
		IF (@ifrecuencia = 'C') SELECT @cuotas = 3
		IF (@ifrecuencia = 'S') SELECT @cuotas = 2
		IF (@ifrecuencia = 'A') SELECT @cuotas = 1
		IF (@ifrecuencia = 'E') SELECT @cuotas = 1
		IF (@cuotas IS NULL) SELECT @cuotas = 1

		SELECT @fano = YEAR(GETDATE()), @fmes = MONTH(GETDATE())
		SET @fdesde_pol = @fdesde
		SET @fhasta_pol = @fhasta

		IF (@cramoint = 1)      SELECT @POL_RAMO = 'POL_VIDA'
		ELSE IF (@cramoint = 2) SELECT @POL_RAMO = 'POL_ACC'
		ELSE IF (@cramoint = 3) SELECT @POL_RAMO = 'POL_SALUD'
		ELSE IF (@cramoint = 4) SELECT @POL_RAMO = 'POL_FUN'
		ELSE                    SELECT @POL_RAMO = 'POLIZA'

		-- Sucursales: nunca se consulta macanalalt.csucur
		IF @ccanalalt IS NOT NULL
		BEGIN
			SET @csucur = 1
			SET @csucurrec = 1
		END
		ELSE
		BEGIN
			SELECT @csucur = COALESCE(csucur, 1), @csucurrec = COALESCE(csucur, 1)
			FROM dbo.maproduc WITH (NOLOCK) WHERE cproductor = @cproductor
		END

		-- CREACION DE CLIENTES (TITULAR PRINCIPAL Y TOMADOR)
		IF (@xrif_titular IS NOT NULL)
		BEGIN
			SELECT @xcliente_titular = CONCAT(@xnombre_titular, ' ', @xapellido_titular)
			EXEC dbo.spCreateMaclient @icedula_titular, @xrif_titular, @xnombre_titular, @xapellido_titular, @xcliente_titular,
				@isexo_titular, @iestado_civil_titular, @fnac_titular, @xcorreo_titular, 58, @cestado_titular, @cciudad_titular,
				@xdireccion_titular, NULL, @xtelefono_titular, @ifuente, 0
		END

		IF (@xrif_tomador IS NOT NULL)
		BEGIN
			SELECT @xcliente_tomador = CONCAT(@xnombre_tomador, ' ', @xapellido_tomador)
			EXEC dbo.spCreateMaclient @icedula_tomador, @xrif_tomador, @xnombre_tomador, @xapellido_tomador, @xcliente_tomador,
				@isexo_tomador, @iestado_civil_tomador, @fnac_tomador, @xcorreo_tomador, 58, @cestado_tomador, @cciudad_tomador,
				@xdireccion_tomador, NULL, @xtelefono_tomador, @ifuente, 0
		END
		ELSE
		BEGIN
			SET @xrif_tomador = @xrif_titular
		END

		-- POLIZA (nucleo compartido con el flujo individual) + EXTENSION COLECTIVA (pcpoliza)
		-- @xrif_titular aqui es el titular principal del grupo (titulares[0]) y es quien identifica
		-- la poliza en adpoliza.casegurado; el resto de titulares del grupo viven en pctitulares/peasegurados.
		INSERT INTO dbo.adpoliza
		(cpoliza, fanopol, fmespol, u_version, cramo, cnpoliza, cproces, cplan, itipoprod, itipopol, itiponegocio, clider,
		cpolizalider, istatpol, iestado, itipoingreso, cpoliza_mae, ccerti_mae, itiporen, iperren, ccauren, iestadoren,
		csucur, csucurrec, criesgo, cpolnum, cultcert, casegurado, ctenedor, cbeneficiario, cacreedor, cfinanciera, cproductor,
		czonaprod, cejecta, cmoneda, ptasamon, forigen, fdesde, fhasta, itipoanul, canula, idevolucion,
		iformadevo, qcuotas, ifrecuencia, itipovenprima, iestadovenprima, icalculoedad, igemi, iqgemi, iapligemi, mgemi,
		mgemiext, cprog, ifuente, fingreso, cusuario, ccategoria, cnpoliza_rel, corigen_rel, ccanalalt, ctipocanal)
		SELECT
		@cpoliza, @fano, @fmes, '!', @cramo, @cnpoliza, @cproces, @cplan, 'NU', 'C', 'DI', 0,
		0, 'V', 'V', 'N', 0, 0, 'A', 1, 0, 'N',
		@csucur, @csucurrec, 0, 0, 0, @xrif_titular, @xrif_tomador, @xrif_titular, 0, 0, @cproductor,
		0, 0, @cmoneda, @ptasamon, @femision, @fdesde_pol, @fhasta_pol, 'N', 0, 'P',
		'N', @cuotas, @ifrecuencia, 'N', 'N', 'R', 'N', 'N', 'N', 0,
		0, @cprog, @ifuente, GETDATE(), 7, 1, @cnpoliza_rel, @corigen_rel, @ccanalalt, @ctipocanal

		INSERT INTO dbo.pcpoliza
		(cpoliza, fanopol, fmespol, u_version, cramo, itipoprod, istatpol, itipopol, iestado, csucur, cnpoliza, cproductor,
		cmoneda, ptasamon, forigen, fdesde, fhasta, cprog, ifuente, bok, cerror, fingreso, cusuario)
		SELECT
		@cpoliza, @fano, @fmes, '!', @cramo, 'NU', 'V', 'C', 'V', @csucur, @cnpoliza, @cproductor,
		@cmoneda, @ptasamon, @femision, @fdesde_pol, @fhasta_pol, @cprog, @ifuente, 0, 0, GETDATE(), 7

		-- SNAPSHOT DE LA CONFIGURACION COLECTIVA VIGENTE (pcplanes/pccoberturas/pctarifas) HACIA LA NUEVA POLIZA.
		-- Las primas, recargos y comisiones de la poliza quedan tal como estaban configurados en la plantilla
		-- del plan al momento de la emision (no se recalculan a mano, no se hardcodean).
		INSERT INTO dbo.pcplanes
		(cpoliza, fanopol, fmespol, cplan, fdesde, u_version, fhasta, cramo, iaplica, xplan, cmoneda, precargo, premb_t,
		premb_b, pcomision, mcomision, mcomisionext, msumamax, pprima, iedad, icalculoedad, cedadmax_m, cedadmin_m,
		cedadmax_f, cedadmin_f, iclasetar, ipagaprima, xobserva, iestado, cprog, ifuente, bok, cerror, fingreso, cusuario)
		SELECT
		@cpoliza, @fano, @fmes, cplan, @fdesde_pol, '!', @fhasta_pol, cramo, iaplica, xplan, @cmoneda, precargo, premb_t,
		premb_b, pcomision, mcomision, mcomisionext, msumamax, pprima, iedad, icalculoedad, cedadmax_m, cedadmin_m,
		cedadmax_f, cedadmin_f, iclasetar, ipagaprima, xobserva, 'V', @cprog, @ifuente, 0, 0, GETDATE(), 7
		FROM dbo.pcplanes WITH (NOLOCK)
		WHERE cpoliza = @tplCpoliza AND fanopol = @tplFanopol AND fmespol = @tplFmespol AND cplan = @cplan AND fdesde = @tplFdesde

		INSERT INTO dbo.pccoberturas
		(cpoliza, fanopol, fmespol, cplan, fdesde, cramo, ccobertura, u_version, fhasta, iclasetar, cmoneda, msumamax,
		pprima, pcomision, mcomision, mcomisionext, ccontrea, cramorea, cramopcnd, ccoberpcnd, cramoint, ccoberturaint,
		isuma, ccobercomp, bimprime, iestado, cprog, ifuente, bok, cerror, fingreso, cusuario)
		SELECT
		@cpoliza, @fano, @fmes, cplan, @fdesde_pol, cramo, ccobertura, '!', @fhasta_pol, iclasetar, @cmoneda, msumamax,
		pprima, pcomision, mcomision, mcomisionext, ccontrea, cramorea, cramopcnd, ccoberpcnd, cramoint, ccoberturaint,
		isuma, ccobercomp, bimprime, 'V', @cprog, @ifuente, 0, 0, GETDATE(), 7
		FROM dbo.pccoberturas WITH (NOLOCK)
		WHERE cpoliza = @tplCpoliza AND fanopol = @tplFanopol AND fmespol = @tplFmespol AND cplan = @cplan AND fdesde = @tplFdesde

		INSERT INTO dbo.pctarifas
		(cpoliza, fanopol, fmespol, cplan, fdesde, cramo, ccobertura, ctarifa, u_version, iclasetar, fhasta, cmoneda,
		bprimagrupo, msuma, msumaext, msumamax, mprima, mprimaext, pprima, pdeducible, mdeducible, mdeducibleext, isuma,
		pcomision, mcomision, mcomisionext, cramoint, ccoberturaint, ctarifaint, qordenimp, ccoberimp, iestado, cprog,
		ifuente, bok, cerror, fingreso, cusuario)
		SELECT
		@cpoliza, @fano, @fmes, cplan, @fdesde_pol, cramo, ccobertura, ctarifa, '!', iclasetar, @fhasta_pol, @cmoneda,
		bprimagrupo, msuma, msumaext, msumamax, mprima, mprimaext, pprima, pdeducible, mdeducible, mdeducibleext, isuma,
		pcomision, mcomision, mcomisionext, cramoint, ccoberturaint, ctarifaint, qordenimp, ccoberimp, 'V', @cprog,
		@ifuente, 0, 0, GETDATE(), 7
		FROM dbo.pctarifas WITH (NOLOCK)
		WHERE cpoliza = @tplCpoliza AND fanopol = @tplFanopol AND fmespol = @tplFmespol AND cplan = @cplan AND fdesde = @tplFdesde

		-- ============================================================================================
		-- GRUPO COLECTIVO (MULTI-TITULAR): TMEMISION_PERSONAS_GENERAL_ASEG trae a todos los titulares
		-- del grupo y sus cargas, aplanados por sp_pre_emision_Personas_General_Colectivo con
		-- nasegurado = (orden_titular * 1000) + orden_persona (orden_persona = 0 -> el titular mismo).
		-- #grpAseg recupera esa agrupacion: ordtit identifica el titular (se usa como ccerti, nunca 0,
		-- correlativo por titular, igual que las polizas colectivas existentes en QA C-8-...) y
		-- xrif_titular es el RIF que debe quedar en ctitular tanto para el titular como para sus cargas.
		-- ============================================================================================
		IF EXISTS (SELECT 1 FROM dbo.TMEMISION_PERSONAS_GENERAL_ASEG WITH (NOLOCK) WHERE id = @id)
		BEGIN
			CREATE TABLE #grpAseg (nasegurado INT PRIMARY KEY, ordtit INT NOT NULL, ordpers INT NOT NULL, xrif_titular NUMERIC(11, 0) NOT NULL)

			INSERT INTO #grpAseg (nasegurado, ordtit, ordpers, xrif_titular)
			SELECT a.nasegurado, a.nasegurado / 1000, a.nasegurado % 1000, tgt.xrif_asegurado
			FROM dbo.TMEMISION_PERSONAS_GENERAL_ASEG a WITH (NOLOCK)
			INNER JOIN dbo.TMEMISION_PERSONAS_GENERAL_ASEG tgt WITH (NOLOCK)
				ON tgt.id = a.id AND tgt.nparentesco_asegurado = 0 AND (tgt.nasegurado / 1000) = (a.nasegurado / 1000)
			WHERE a.id = @id

			-- TITULARES DEL GRUPO: pctitulares (uno por titular, un certificado por titular -> ccerti/csubgrupo = ordtit)
			INSERT INTO dbo.pctitulares
			(cpoliza, fanopol, fmespol, cgrupo, csubgrupo, ctitular, u_version, fnacimiento, qedad, csexo, cestado_civil,
			falta, iestado, cprog, ifuente, bok, cerror, fingreso, cusuario)
			SELECT
			@cpoliza, @fano, @fmes, RIGHT(CAST(@cpoliza AS VARCHAR(20)), 10),
			RIGHT('0000000000' + CAST(g.ordtit AS VARCHAR(10)), 10),
			a.xrif_asegurado, '!', a.fnac_asegurado,
			DATEDIFF(YEAR, a.fnac_asegurado, @femision), a.isexo_asegurado, a.iestado_civil_asegurado,
			@fdesde_pol, 'V', @cprog, @ifuente, 0, 0, GETDATE(), 7
			FROM dbo.TMEMISION_PERSONAS_GENERAL_ASEG a WITH (NOLOCK)
			INNER JOIN #grpAseg g ON g.nasegurado = a.nasegurado
			WHERE a.id = @id AND a.nparentesco_asegurado = 0

			-- DEPENDIENTES/CARGAS: pcbeneficiarios, referenciando al titular de su propio grupo (no siempre el principal)
			INSERT INTO dbo.pcbeneficiarios
			(cpoliza, fanopol, fmespol, cgrupo, csubgrupo, ctitular, cbeneficiario, nmenor, u_version, ctipotarifa,
			fnacimiento, qedad, csexo, cestado_civil, falta, iestado, cprog, ifuente, bok, cerror, fingreso, cusuario)
			SELECT
			@cpoliza, @fano, @fmes, RIGHT(CAST(@cpoliza AS VARCHAR(20)), 10),
			RIGHT('0000000000' + CAST(g.ordtit AS VARCHAR(10)), 10),
			g.xrif_titular, a.xrif_asegurado, 0, '!',
			NULL, a.fnac_asegurado, DATEDIFF(YEAR, a.fnac_asegurado, @femision), a.isexo_asegurado, a.iestado_civil_asegurado,
			@fdesde_pol, 'V', @cprog, @ifuente, 0, 0, GETDATE(), 7
			FROM dbo.TMEMISION_PERSONAS_GENERAL_ASEG a WITH (NOLOCK)
			INNER JOIN #grpAseg g ON g.nasegurado = a.nasegurado
			WHERE a.id = @id AND a.nparentesco_asegurado > 0

			-- peasegurados: registro compartido usado por la cobertura de siniestros, igual para individual y colectivo.
			-- ctitular (NOT NULL) = RIF del titular del grupo al que pertenece la persona (el mismo para el titular y sus cargas).
			-- ccerti = ordtit del grupo (nunca 0, correlativo por titular).
			DECLARE @cur_nasegurado INT, @cur_rif NUMERIC(11, 0), @cur_fnac DATE, @cur_isexo CHAR(1), @cur_iecivil CHAR(1), @cur_paren INT,
				@cur_xnombre VARCHAR(250), @cur_xapellido VARCHAR(250), @cur_xcliente VARCHAR(250), @cur_icedula CHAR(1),
				@cur_cid VARCHAR(250), @cur_xcorreo VARCHAR(250), @cur_cestado INT, @cur_cciudad INT,
				@cur_xdireccion VARCHAR(1000), @cur_xtelefono VARCHAR(250), @cur_npeso NUMERIC(6, 2), @cur_nestatura NUMERIC(8, 2),
				@cur_ccerti INT, @cur_ctitular NUMERIC(11, 0)

			DECLARE cur_grp_aseg CURSOR FAST_FORWARD FOR
				SELECT nasegurado, icedula_asegurado, xrif_asegurado, xnombre_asegurado, xapellido_asegurado, isexo_asegurado,
				       iestado_civil_asegurado, fnac_asegurado, xcorreo_asegurado, cestado_asegurado, cciudad_asegurado,
				       xdireccion_asegurado, xtelefono_asegurado, nparentesco_asegurado, npeso_asegurado, nestatura_asegurado
				FROM dbo.TMEMISION_PERSONAS_GENERAL_ASEG WITH (NOLOCK)
				WHERE id = @id

			OPEN cur_grp_aseg
			FETCH NEXT FROM cur_grp_aseg INTO @cur_nasegurado, @cur_icedula, @cur_rif, @cur_xnombre, @cur_xapellido, @cur_isexo,
				@cur_iecivil, @cur_fnac, @cur_xcorreo, @cur_cestado, @cur_cciudad, @cur_xdireccion, @cur_xtelefono,
				@cur_paren, @cur_npeso, @cur_nestatura

			WHILE @@FETCH_STATUS = 0
			BEGIN
				SELECT @cur_ccerti = g.ordtit, @cur_ctitular = g.xrif_titular FROM #grpAseg g WHERE g.nasegurado = @cur_nasegurado

				SET @cur_xcliente = CONCAT(@cur_xnombre, ' ', @cur_xapellido)
				SET @cur_cid = CONCAT(@cur_icedula, '-', @cur_rif)

				EXEC dbo.spCreateMaclient
					@icedula = @cur_icedula, @cci_rif = @cur_rif, @xnombre = @cur_xnombre, @xapellido = @cur_xapellido,
					@xcliente = @cur_xcliente, @isexo = @cur_isexo, @iestado_civil = @cur_iecivil, @fnac = @cur_fnac,
					@xcorreo = @cur_xcorreo, @cpais = 58, @cestado = @cur_cestado, @cciudad = @cur_cciudad,
					@xdireccion = @cur_xdireccion, @czonapos = NULL, @xtelefono = @cur_xtelefono, @ifuente = @ifuente,
					@salida = NULL, @cid = @cur_cid

				IF NOT EXISTS (SELECT 1 FROM dbo.peasegurados WHERE casegurado = @cur_rif AND cpoliza = @cpoliza)
				BEGIN
					INSERT INTO dbo.peasegurados
					(cpoliza, fanopol, fmespol, iclaseaseg, casegurado, ctitular, nmenor, u_version, ccerti, cproces, cramo, cnpoliza,
					fnacimiento, csexo, cestado_civil, cparentesco, iestadoren, fdesde, fhasta, falta, iestado, cprog,
					ifuente, bok, cerror, fingreso, cusuario, ccategoria)
					SELECT
					cpoliza, fanopol, fmespol, CASE WHEN @cur_paren = 0 THEN 'T' ELSE 'B' END, @cur_rif, @cur_ctitular, 0, '!', @cur_ccerti,
					cproces, cramo, cnpoliza, @cur_fnac, @cur_isexo, @cur_iecivil, @cur_paren, iestadoren, fdesde, fhasta,
					fdesde, 'V', cprog, ifuente, bok, cerror, GETDATE(), cusuario, ccategoria
					FROM dbo.adpoliza WHERE cpoliza = @cpoliza
				END

				FETCH NEXT FROM cur_grp_aseg INTO @cur_nasegurado, @cur_icedula, @cur_rif, @cur_xnombre, @cur_xapellido, @cur_isexo,
					@cur_iecivil, @cur_fnac, @cur_xcorreo, @cur_cestado, @cur_cciudad, @cur_xdireccion, @cur_xtelefono,
					@cur_paren, @cur_npeso, @cur_nestatura
			END
			CLOSE cur_grp_aseg
			DEALLOCATE cur_grp_aseg

			DROP TABLE #grpAseg
		END

		-- RECIBOS Y CONDICIONES DE FACTURACION (adpoltar/adpolcob). El origen de las condiciones es siempre
		-- la plantilla pctarifas/pccoberturas recien copiada a la poliza; nunca mapl*/adpolcob directo.
		-- PENDIENTE DE NEGOCIO: el recibo se genera por poliza completa (suma de todos los titulares del
		-- grupo), no por certificado/titular; confirmar que esto sigue siendo lo esperado para el colectivo
		-- multi-titular (ver observaciones pendientes).
		SELECT @fdesde_rec = @fdesde_pol
		SELECT @fhasta_rec = CONVERT(DATE, DATEADD(MM, 12 / @cuotas, @fdesde_pol))

		IF (@ifrecuencia = 'E')
		BEGIN
			SELECT @fdesde_rec = @fdesde
			SELECT @fhasta_rec = @fhasta
			SELECT @cuotas = 1
		END

		SELECT @nrecibo = 1, @ncuo = 1
		SELECT @iestadorec = 'P', @fcobro = NULL

		DECLARE @ncobertura_col CHAR(4), @ctarifa_col CHAR(4), @pcomision_col NUMERIC(9, 2), @mprimaext_col NUMERIC(18, 2)

		WHILE (@nrecibo <= @cuotas)
		BEGIN
			SELECT @nrecibo = @nrecibo + 1

			EXEC dbo.spContador_v1 @cpoliza_o OUTPUT, @cnpoliza_o OUTPUT, @crecibo OUTPUT, @cnrecibo OUTPUT, @cproces_o OUTPUT, @csucur, @fdesde, @cramo, @POL_RAMO

			DECLARE cur_cober_col CURSOR FAST_FORWARD FOR
				SELECT t.ccobertura, t.ctarifa, t.pcomision,
					-- Prima del grupo para esta cobertura/tarifa = suma de la prima por cabeza (todos los titulares + sus dependientes)
					-- segun la tarifa que le corresponde en pcasegurados (ctipotarifa por edad/sexo) y su monto en pctarifas.
					(SELECT SUM(t2.mprimaext)
					 FROM dbo.TMEMISION_PERSONAS_GENERAL_ASEG a WITH (NOLOCK)
					 INNER JOIN dbo.pcasegurados pa WITH (NOLOCK)
						ON pa.cpoliza = @tplCpoliza AND pa.fanopol = @tplFanopol AND pa.fmespol = @tplFmespol
						AND pa.csexo = a.isexo_asegurado
						AND DATEDIFF(YEAR, a.fnac_asegurado, @femision) BETWEEN pa.cedad_as_mn AND pa.cedad_as_mx
					 INNER JOIN dbo.pctarifas t2 WITH (NOLOCK)
						ON t2.cpoliza = @cpoliza AND t2.fanopol = @fano AND t2.fmespol = @fmes
						AND t2.ccobertura = t.ccobertura
						AND t2.ctarifa = RIGHT('0000' + CONVERT(VARCHAR(4), pa.ctipotarifa), 4)
					 WHERE a.id = @id
					) AS mprimaext_grupo
				FROM dbo.pctarifas t WITH (NOLOCK)
				WHERE t.cpoliza = @cpoliza AND t.fanopol = @fano AND t.fmespol = @fmes

			OPEN cur_cober_col
			FETCH NEXT FROM cur_cober_col INTO @ncobertura_col, @ctarifa_col, @pcomision_col, @mprimaext_col

			WHILE @@FETCH_STATUS = 0
			BEGIN
				SET @mprimaext_col = ISNULL(@mprimaext_col, 0) / @cuotas

				INSERT INTO dbo.adpoltar
				(crecibo, ccober, ctarifa, u_version, cramo, cpoliza, fanopol, fmespol, ccerti, ccoberimp, ietiqtarimp,
				qordenimp, cnpoliza, cnrecibo, cproces, csucur, cmoneda, ptasamon, itipoprod, fdesde, fhasta, itiporiesg,
				priesg, msumabruta, msumabrutaext, msumaaseg, msumaasegext, mprima, mprimaext, pprima, bfraded,
				mdedu_fran, mdedu_franext, pdedu_fran, mdescuento, mdescuentoext, pdescuento, mrecargo, mrecargoext,
				precargo, mprimabruta, mprimabrutaext, pcomision, mcomision, mcomisionext, bprimarea, mprimareas,
				mprimareasext, istattar, isuma, cramoint, ccoberturaint, ctarifaint, cprog, ifuente, bok, cerror,
				fingreso, cusuario)
				SELECT
				@crecibo, @ncobertura_col, @ctarifa_col, '!', @cramo, @cpoliza, @fano, @fmes, 0, NULL, 'COB', 1,
				@cnpoliza, @cnrecibo, @cproces, @csucur, @cmoneda, @ptasamon, 'NU', @fdesde_rec, @fhasta_rec, 'N',
				0, @msumaaseg, @msumaaseg, @msumaaseg, @msumaaseg, @mprimaext_col * @ptasamon, @mprimaext_col, 0, 'N',
				0, 0, 0, 0, 0, 0, 0, 0, 0, @mprimaext_col * @ptasamon, @mprimaext_col, @pcomision_col,
				(@mprimaext_col * @ptasamon) * (@pcomision_col / 100), @mprimaext_col * (@pcomision_col / 100), 'N', 0, 0,
				'V', 1, @cramoint, 0, 0, @cprog, @ifuente, 0, 0, GETDATE(), 7

				FETCH NEXT FROM cur_cober_col INTO @ncobertura_col, @ctarifa_col, @pcomision_col, @mprimaext_col
			END
			CLOSE cur_cober_col
			DEALLOCATE cur_cober_col

			INSERT INTO dbo.adpolcob
			(crecibo, ccober, u_version, cramo, cpoliza, fanopol, fmespol, ccerti, cnpoliza, cnrecibo, cproces, csucur,
			cmoneda, ptasamon, fdesde, fhasta, itipoprod, msumaaseg, msumaasegext, mprimabruta, mprimabrutaext, pcomision,
			mcomision, mcomisionext, mprimareas, mprimareasext, iestado, isuma, cramoint, ccoberturaint, cprog, ifuente,
			bok, cerror, fingreso, cusuario)
			SELECT
			crecibo, ccober, u_version, cramo, cpoliza, fanopol, fmespol, ccerti, cnpoliza, cnrecibo, cproces, csucur,
			cmoneda, ptasamon, fdesde, fhasta, itipoprod, msumaaseg, msumaasegext, mprimabruta, mprimabrutaext, pcomision,
			mcomision, mcomisionext, mprimareas, mprimareasext, istattar, isuma, cramoint, ccoberturaint, cprog, ifuente,
			bok, cerror, GETDATE(), cusuario
			FROM dbo.adpoltar
			WHERE crecibo = @crecibo

			SELECT @mprimarec = SUM(mprimabruta), @mprimarecext = SUM(mprimabrutaext) FROM dbo.adpolcob WHERE crecibo = @crecibo
			SELECT @mcomision = SUM(mcomision), @mcomisionext = SUM(mcomisionext) FROM dbo.adpolcob WHERE crecibo = @crecibo
			SELECT @pcomision = CASE WHEN ISNULL(@mprimarec, 0) > 0 THEN (@mcomision / @mprimarec) * 100 ELSE 0 END

			INSERT INTO dbo.ADRECIBOS
			(crecibo, u_version, cnpoliza, cnrecibo, cpoliza, fanopol, fmespol, cramo, itipoprod, itiponegocio, itipopol,
			iestadoren, cpoliza_mae, ccerti_mae, itiporec, imodcobro, cdoccob, csucur, csucurrec, criesgo, ccerti, cproces,
			cserie_rea, casegurado, ctenedor, cbeneficiario, cacreedor, cfinanciera, cplan, cproductor, cmoneda, ptasamon,
			femision, fdesde, fhasta, fdesde_pol, fhasta_pol, itipoanul, nlote, iestcont, fcobro, iestadorec, ifinanciado,
			idevolucion, iformadevo, msumabruta, msumabrutaext, msumacoa, msumacoaext, msumaneta, msumanetaext,
			mprimabruta, mprimabrutaext, pcoa, mprimaneta, mprimanetaext, mprimabruta_emi, pcomision, mcomision,
			mcomisionext, mmontoneto, mmontonetoext, qcuotas, cprog, ifuente, fingreso, cusuario, ifrecuencia,
			cnrecibo_rel, ctipocanal, ccanalalt, cscanalalt)
			SELECT
			@crecibo, '!', @cnpoliza, @cnrecibo, @cpoliza, @fano, @fmes, @cramo, 'NU', 'DI', 'C', 'N', 0, 0, 'P', 'IN',
			0, @csucur, @csucurrec, 3, 0, @cproces, 0, @xrif_titular, @xrif_tomador, @xrif_titular, 0, 0, @cplan,
			@cproductor, @cmoneda, @ptasamon, @femision, @fdesde_rec, @fhasta_rec, @fdesde_pol, @fhasta_pol, 'N', 0, 'P',
			@fcobro, @iestadorec, 0, 'P', 'N', @msumaaseg, @msumaaseg, 0, 0, @msumaaseg, @msumaaseg, @mprimarec,
			@mprimarecext, 0, @mprimarec, @mprimarecext, @mprimarec, @pcomision, @mcomision, @mcomisionext,
			@mprimarec, @mprimarecext, @ncuo, @cprog, @ifuente, GETDATE(), 7, @ifrecuencia, NULL, @ctipocanal,
			@ccanalalt, @cscanalalt

			EXEC dbo.spGeneraAdpolrea @crecibo

			SELECT @ncuo = @ncuo + 1
			SELECT @fdesde_rec = CONVERT(DATE, DATEADD(MM, 12 / @cuotas, @fdesde_rec))
			SELECT @fhasta_rec = CONVERT(DATE, DATEADD(MM, 12 / @cuotas, @fhasta_rec))
		END

		EXEC dbo.spGeneraCoberturasSiniestroPersonas @cpoliza, @fano, @fmes

		COMMIT TRANSACTION;

		UPDATE dbo.TMEMISION_PERSONAS_GENERAL
		SET iestado = 3, xestado = 'EMITIDO', cpoliza = @cpoliza, cnpoliza = @cnpoliza
		WHERE id = @id

		SET @pSuccess = 1
		SET @pErrorMessage = NULL

		SELECT CONVERT(VARCHAR, cpoliza) [cpoliza], cnpoliza, cnrecibo, cproces, qcuotas, fanopol, fmespol
		FROM dbo.adrecibos WHERE cpoliza = @cpoliza AND qcuotas = 1
	END TRY
	BEGIN CATCH
		IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;

		SET @pSuccess = 0
		SET @pErrorMessage = ERROR_MESSAGE()

		IF @id IS NOT NULL
		BEGIN
			UPDATE dbo.TMEMISION_PERSONAS_GENERAL
			SET iestado = -2, xestado = 'ERROR_EMISION', xlog = @pErrorMessage
			WHERE id = @id
		END

		;THROW;
	END CATCH
END