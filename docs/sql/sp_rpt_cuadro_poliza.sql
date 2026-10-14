-- Cuadro de poliza (JSON). Recibos ordenados por fecha de vigencia (fdesde) y no por qcuotas:
-- los recibos que genera un endoso quedan a continuacion de los existentes.
-- Desplegar en Sis2000 QA/prod.

IF OBJECT_ID(N'dbo.sp_rpt_cuadro_poliza', N'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_rpt_cuadro_poliza;
GO

CREATE PROCEDURE sp_rpt_cuadro_poliza
	@xparametros_json NVARCHAR(MAX)	

	
AS
BEGIN
	--DECLARE @xparametros_json NVARCHAR(MAX) = N'{"cpoliza": "1800000091220", "fanopol": 2026, "fmespol": 1}';
	SET NOCOUNT ON;
	BEGIN TRY
        -- Variables de filtro
        DECLARE @cpoliza CHAR(30),@fanopol INT,	@fmespol INT;

        SELECT
            @cpoliza     =cpoliza,
            @fanopol      = fanopol,
            @fmespol      = fmespol
            
        FROM OPENJSON(@xparametros_json, '$') WITH (
            cpoliza CHAR(30)        '$.cpoliza',
            fanopol INT           '$.fanopol',
            fmespol INT           '$.fmespol'
        );
    END TRY
	BEGIN CATCH
        DECLARE @errMsg   NVARCHAR(4000) = ERROR_MESSAGE(),
                @errSev   INT            = ERROR_SEVERITY(),
                @errState INT            = ERROR_STATE(),
                @errLine  INT            = ERROR_LINE();


        RAISERROR('sp_rpt_cuadro_poliza línea %d: %s', @errSev, @errState, @errLine, @errMsg);
    END CATCH
    
    IF @cpoliza IS NULL OR @fanopol IS NULL OR @fmespol IS NULL
    BEGIN
	    RAISERROR('Parámetros incompletos', 1, 1);
    END
	
	DECLARE @casegurado VARCHAR(30), @ctenedor VARCHAR(30), @cbeneficiario VARCHAR(30), @cacreedor VARCHAR(30), @cramo INT;
	
	-- TRAER DE UNA TABLA
	DECLARE @base_url varchar(100) = 'https://qaapi.lamundialdeseguros.com/sis2000_qa/poliza/';

	SELECT 
		@casegurado = casegurado,
		@ctenedor = ctenedor,
		@cbeneficiario = cbeneficiario,
		@cacreedor = cacreedor,
		@cramo = cramo
	FROM dbo.adpoliza
	WHERE cpoliza = @cpoliza AND fanopol = @fanopol AND fmespol = @fmespol;
	
	SELECT
	-- Datos De La Empresa
		ISNULL(JSON_QUERY((
			SELECT 
				TRIM(c.cid) as [xrif_empresa],
				TRIM(i.xnomempre) as [xnombre_empresa],
				'Humberto Martinez' as [xrep_legal_empresa],
				'ES-73' as [cacti_aseg],
				'73' as [num_acti_aseg],
				i.mcappag as [xcapital_pagado],
				'+58-212-7726767' as [xtel_empresa],
				'info@lamundialdeseguros.com' as [xemail_empresa],
				'https://lamundialdeseguros.com/' as [xweb_empresa],
				'defensordelasegurado@lamundialdeseguros.com' as [xcorreo_def_aseg],
				'www.lamundialdeseguros.com' as [xdire_web_empresa]
			FROM insinstalac i
			join maclient c on  c.cci_rif  =  '0'
			FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
		)), JSON_QUERY('{}')) AS datos_empresa,
		
		-- POLIZA
		ISNULL(JSON_QUERY((
			SELECT TOP 1
				CONVERT(VARCHAR, COALESCE(adpoliza.forigen, adpoliza.fingreso), 103) AS 'femision_pol',
				CONVERT(VARCHAR, fdesde, 103) AS 'fdesde_pol',   
				CONVERT(VARCHAR, fhasta, 103) AS 'fhasta_pol',
				FORMAT(DAY(adpoliza.fingreso ), '00') AS 'fdiapol',
				fanopol,
				fmespol,
/*Agregado*/	CHOOSE(fmespol, 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre') AS 'fmespol_letra',
				TRIM(mamonedas.xdescripcion_l) AS 'xmoneda',  
				TRIM(masucur.xdescripcion_l) AS 'xsucursal',
/*Mejora*/		CASE WHEN maproduc.cproductor IS NOT NULL AND maproduc.xproductor IS NOT NULL THEN CAST(maproduc.cproductor AS VARCHAR(20)) + ' - ' + TRIM(maproduc.xproductor) WHEN maproduc.xproductor IS NOT NULL THEN TRIM(maproduc.xproductor) ELSE '' END AS 'xintermediario',
				TRIM(matipoprod.xdescripcion_l) AS 'xcanal_venta',  
				TRIM(maramos.xdescripcion_l) AS 'xramo',   
				maramos.cramo, 
				TRIM(maramos.xdescripcion_l) AS 'xdescripcion_l',   
				adpoliza.fingreso,
				COALESCE(NULLIF(TRIM(maplanes_per.xplan), ''), TRIM(maplanes.xplan)) AS 'xplan',
				TRIM(maplanes_per.itarifa) AS 'ctipo_grupo', 
				maplanes.bnacional, 
				adpoliza.itiporen, 
				CASE adpoliza.ifrecuencia WHEN 'D' THEN 'DIARIO' WHEN 'M' THEN 'MENSUAL' WHEN 'B' THEN 'BIMENSUAL' WHEN 'T' THEN 'TRIMESTRAL' WHEN 'C' THEN 'CUATRIMESTRAL' WHEN 'S' THEN 'SEMESTRAL' WHEN 'A' THEN 'ANUAL' ELSE 'N/A' END AS 'ifrecuencia', 
				matiporamo.ctiporamo, 
				TRIM(insramfor.xforma) AS 'xforma',
				TRIM(bc.xcorreo) AS 'xcorreo_beneficario', 
				TRIM(adpoliza.cnpoliza_rel) AS 'cnpoliza_rel',
				TRIM(adpoliza.cnpoliza) AS 'cnpoliza',
				TRIM(adpoliza.iestado) AS 'iestado', 
				TRIM(adpoliza.istatpol) AS 'istatpol',
				ISNULL(TRIM(insramo.cnaprsudpr), '') AS 'cnaprsudpr',
				ISNULL(CONVERT(VARCHAR, insramo.faprsudpr, 103), '05/08/2022') AS 'faprsudpr',
				adpoliza.cpoliza, 
				TRIM(adpoliza.cplan) AS 'cplan', 
				adpoliza.ctipocanal, 
				TRIM(adpoliza.ccanalalt) AS 'ccanalalt', 
				TRIM(adpoliza.cscanalalt) AS 'cscanalalt', 
				adpoliza.cgestor,
				ISNULL((SELECT TOP 1 ccerti FROM dbo.adrecibos WHERE cpoliza = adpoliza.cpoliza AND fanopol = adpoliza.fanopol AND fmespol = adpoliza.fmespol ORDER BY qcuotas ASC), 0) AS 'ccerti_recibo',
/*Agregado*/  	CASE WHEN TRIM(adpoliza.ccanalalt) = '27' THEN 'Contacto: 0414-2202315 / 0414-2202608 / 0500-5526256' ELSE 'Contacto: 0500-5526256' END AS 'xcontacto_carnet',
/*Agregado*/	CASE WHEN adpoliza.iestado = 'V' THEN 'VIGENTE' WHEN adpoliza.iestado = 'N' THEN 'NO VIGENTE' WHEN adpoliza.iestado = 'A' THEN 'ANULADO' END AS 'xestado',
				CASE WHEN adpoliza.istatpol = 'A' THEN 'ANULADO' WHEN ISNULL((SELECT TOP 1 iestadorec FROM dbo.adrecibos WHERE cpoliza = adpoliza.cpoliza AND fanopol = adpoliza.fanopol AND fmespol = adpoliza.fmespol AND iestadorec != 'A' ORDER BY qcuotas ASC), '') = 'C' THEN 'PAGADO' ELSE 'PENDIENTE' END AS 'xstatpol',
				-- CASE WHEN adpoliza.istatpol = 'V' THEN 'VIGENTE' WHEN adpoliza.istatpol = 'N' THEN 'NO VIGENTE' WHEN adpoliza.istatpol = 'A' THEN 'ANULADO' END AS 'xstatpol',
/*Lo modifique*/@base_url + CONCAT_WS('/', TRIM(adpoliza.cnpoliza), adpoliza.fanopol, adpoliza.fmespol) + '/' as [url_qr],
				ISNULL((SELECT SUM(CASE WHEN r.cmoneda = 'Bs' THEN r.mmontorec ELSE r.mmontorecext END) FROM dbo.adrecibos r WHERE r.cpoliza = adpoliza.cpoliza AND r.fanopol = adpoliza.fanopol AND r.fmespol = adpoliza.fmespol AND r.iestadorec != 'A'), 0) AS 'mprima_total'
			FROM dbo.adpoliza 
			LEFT JOIN dbo.mamonedas ON mamonedas.cmoneda = adpoliza.cmoneda 
			LEFT JOIN dbo.masucur ON masucur.csucur = adpoliza.csucur 
			LEFT JOIN dbo.maclient ON maclient.cci_rif = adpoliza.cproductor
			LEFT JOIN dbo.maclient b ON b.cci_rif = adpoliza.cbeneficiario
			LEFT JOIN dbo.maclient_correo bc ON bc.cci_rif = b.cci_rif
			LEFT JOIN dbo.maproduc ON maproduc.cproductor = adpoliza.cproductor
			LEFT JOIN dbo.matipoprod ON matipoprod.ctipoprod = maproduc.ctipoprod
			LEFT JOIN dbo.maramos ON maramos.cramo = adpoliza.cramo
			LEFT JOIN dbo.insramoint ON insramoint.cramoint = maramos.cramoint
			LEFT JOIN dbo.insramfor ON insramfor.cramoint = insramoint.cramoint AND insramfor.cclaveramo = 'IMPRESION DE POLIZA'
			LEFT JOIN dbo.insramo ON insramo.cramo = adpoliza.cramo
			LEFT JOIN dbo.matiporamo ON matiporamo.ctiporamo = maramos.ctiporamo
			LEFT JOIN dbo.maplanes_per ON maplanes_per.cplan = adpoliza.cplan AND maplanes_per.cramo = adpoliza.cramo
			LEFT JOIN dbo.maplanes ON maplanes.cplan = adpoliza.cplan AND maplanes.cramo = adpoliza.cramo
			WHERE adpoliza.cpoliza = @cpoliza AND adpoliza.fanopol = @fanopol AND adpoliza.fmespol = @fmespol
			ORDER BY adpoliza.fingreso DESC
			FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
		)), JSON_QUERY('{}')) AS poliza,

		-- VEHICULO
		ISNULL(JSON_QUERY((
			SELECT
				TRIM(UPPER(mamarcas.xmarca)) [xmarca], 
				TRIM(UPPER(mamodelo.xmodelo)) [xmodelo], 
				TRIM(UPPER(maversion.xversion)) [xversion],
				vhcerti.cano [fano], 
				TRIM(UPPER(vhcerti.xsercar)) [xserialcarroceria], 
				TRIM(UPPER(vhcerti.xsermot)) [xserialmotor],
				TRIM(UPPER(vhcerti.xplaca)) [xplaca], 
				vhcerti.qpuestos [ncapacidadpasajeros], 
				TRIM(UPPER(vhcerti.xcolor)) [xcolor],
				TRIM(UPPER(macategtr.xcategoria)) [xuso],
				ISNULL(CAST(mainma.ncapcarga AS VARCHAR), '') [ncapcarga],
            	ISNULL(CAST(mainma.npesovacio AS VARCHAR), '') [npesovacio],
            	ISNULL(TRIM(UPPER(mainma.xtrans)), '') [xtransmision]
			FROM dbo.vhcerti 
			LEFT JOIN mamarcas ON TRY_CAST(mamarcas.cmarca AS INT) = TRY_CAST(vhcerti.cmarca AS INT)
			LEFT JOIN mamodelo ON TRY_CAST(mamodelo.cmodelo AS INT) = TRY_CAST(vhcerti.cmodelo AS INT) AND TRY_CAST(mamodelo.cmarca AS INT) = TRY_CAST(vhcerti.cmarca AS INT)
			LEFT JOIN maversion ON TRY_CAST(maversion.cversion AS INT) = TRY_CAST(vhcerti.cversion AS INT) AND TRY_CAST(maversion.cmodelo AS INT) = TRY_CAST(vhcerti.cmodelo AS INT) AND TRY_CAST(maversion.cmarca AS INT) = TRY_CAST(vhcerti.cmarca AS INT)
			LEFT JOIN matipos ON TRY_CAST(matipos.ctipo AS INT) = TRY_CAST(vhcerti.ctipo AS INT)
			LEFT JOIN macategtr ON TRY_CAST(macategtr.ctipo AS INT) = TRY_CAST(vhcerti.ctipo AS INT) AND TRY_CAST(macategtr.ccategotr AS INT) =TRY_CAST( vhcerti.cuso AS INT)
			LEFT JOIN mainma ON TRY_CAST(mainma.id AS INT) = TRY_CAST(vhcerti.ccategovh AS INT)
			WHERE vhcerti.cpoliza = @cpoliza AND vhcerti.fanopol = @fanopol AND vhcerti.fmespol = @fmespol
			FOR JSON PATH, WITHOUT_ARRAY_WRAPPER, INCLUDE_NULL_VALUES
		)), JSON_QUERY('{}')) AS vehiculo,
		
		-- TOMADOR
		ISNULL(JSON_QUERY((
			SELECT TOP 1
				UPPER(TRIM(cli.xcliente)) AS 'xtomador', TRIM(cli.cid) AS 'xcedula_tomador',
				TRIM(dir.xavecalle) AS 'xdireccion_tomador',
				TRIM(est.xdescripcion_l) AS 'xestado_tomador',TRIM(ciu.xdescripcion_l) AS 'xciudad_tomador',
				TRIM(cor.xcorreo) AS 'xcorreo_tomador', TRIM(tel.xtelefono) AS 'xtelefono_tomador',
				TRIM(dir.czonapos) AS 'xzona_postal_tomador'
			FROM dbo.maclient cli 
			LEFT JOIN dbo.maclient_correo cor ON cor.cci_rif = cli.cci_rif
			LEFT JOIN dbo.maclient_dir dir ON dir.cci_rif = cli.cci_rif
			LEFT JOIN dbo.maestados est ON est.cestado = dir.cestado
			LEFT JOIN dbo.maciudades ciu ON ciu.cciudad = dir.cciudad
			LEFT JOIN dbo.maclient_tel tel ON tel.cci_rif = cli.cci_rif
			WHERE cli.cci_rif = @ctenedor
			FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
		)), JSON_QUERY('{}')) AS tomador,
		
		-- ASEGURADO
		ISNULL(JSON_QUERY((
			SELECT TOP 1
				UPPER(TRIM(cli.xcliente)) AS 'xasegurado',
				TRIM(cli.cid) AS 'xcedula_asegurado',
				(SELECT TRIM(xdescripcion_l) FROM dbo.maramos WHERE cramo = @cramo) AS 'xramo', -- Subconsulta segura
				TRIM(dir.xavecalle) AS 'xdireccion_asegurado',
				TRIM(est.xdescripcion_l) AS 'xestado_asegurado',
				TRIM(ciu.xdescripcion_l) AS 'xciudad_asegurado',
				TRIM(tel.xtelefono) AS 'xtelefono_asegurado',
				TRIM(cor.xcorreo) AS 'xcorreo_asegurado',
				TRIM(dir.czonapos) AS 'xzona_postal_asegurado'
			FROM dbo.maclient cli 
			LEFT JOIN dbo.maclient_correo cor ON cor.cci_rif = cli.cci_rif
			LEFT JOIN dbo.maclient_dir dir ON dir.cci_rif = cli.cci_rif
			LEFT JOIN dbo.maestados est ON est.cestado = dir.cestado
			LEFT JOIN dbo.maciudades ciu ON ciu.cciudad = dir.cciudad
			LEFT JOIN dbo.maclient_tel tel ON tel.cci_rif = cli.cci_rif
			WHERE cli.cci_rif = @casegurado
			FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
		)), JSON_QUERY('{}')) AS asegurado,		

		-- BENEFICIARIO PREFERENCIAL
		ISNULL(JSON_QUERY((
			SELECT TOP 1
				UPPER(TRIM(maclient.xcliente)) AS 'xbeneficiario_preferencial', 
				TRIM(maclient.cid) AS 'xcedula_beneficiario_preferencial', 
				TRIM(maclient_dir.xavecalle) AS 'xdireccion_beneficiario_preferencial',
				TRIM(maestados.xdescripcion_l) AS 'xestado_beneficiario_preferencial', 
				TRIM(maciudades.xdescripcion_l) AS 'xciudad_beneficiario_preferencial', 
				TRIM(maclient_correo.xcorreo) AS 'xcorreo_beneficiario_preferencial', 
				TRIM(maclient_tel.xtelefono) AS 'xtelefono_beneficiario_preferencial', 
				ISNULL(TRIM(maclient_dir.czonapos), '') AS 'xzona_postal_beneficiario_preferencial',
				@cbeneficiario AS 'cbeneficiario',
				CASE 
					WHEN @ctenedor = @casegurado THEN 0
					WHEN @cbeneficiario <> @ctenedor AND @cbeneficiario <> @casegurado THEN 1
					ELSE 0
				END AS 'is_ben_pref'
			FROM dbo.maclient 
			LEFT JOIN dbo.maclient_correo ON maclient_correo.cci_rif = maclient.cci_rif 
			LEFT JOIN dbo.maclient_dir ON maclient_dir.cci_rif = maclient.cci_rif
			LEFT JOIN dbo.maestados ON maestados.cestado = maclient_dir.cestado
			LEFT JOIN dbo.maciudades ON maciudades.cciudad = maclient_dir.cciudad
			LEFT JOIN dbo.maclient_tel ON maclient_tel.cci_rif = maclient.cci_rif
			WHERE maclient.cci_rif = @cbeneficiario
			FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
		)), JSON_QUERY('{}')) AS beneficiario_pref,

		-- FIANZA
		ISNULL(JSON_QUERY((
			SELECT
				TRIM(acre.xcliente) AS 'xacreedor',
				certi.monto_contrato AS 'xmonto_contrato',
				TRIM(certi.xobjeto)  AS 'xobjeto_contrato',
				certi.cproces AS 'cproces', TRIM(certi.ccont_lic) AS 'ccont_lic',
				CONVERT(VARCHAR, certi.fecha_cont_lic, 103) AS 'femision_fianza',
				CASE certi.itipofianza
					WHEN 'AD' THEN 'ADUANALES' WHEN 'AN' THEN 'ANTICIPO' WHEN 'BC' THEN 'BUENA CALIDAD'
					WHEN 'FI' THEN 'FIEL CUMPLIMIENTO' WHEN 'GM' THEN 'GARANTÍA DE MANT. OFERTA' WHEN 'JD' THEN 'JUDICIAL'
					WHEN 'LA' THEN 'LABORAL' WHEN 'RE' THEN 'RECURRIR' ELSE 'N/A.' END AS 'itipofianza',
				certi.mcapitalp AS 'mcapital',
				CASE WHEN TRY_CONVERT(NUMERIC, certi.monto_gastnot) IS NULL THEN '0' ELSE CONVERT(VARCHAR, certi.monto_gastnot) END AS 'gastos_notaria'
			FROM dbo.facerti certi 
			LEFT JOIN dbo.maclient acre ON acre.cci_rif = @cacreedor
			WHERE certi.cpoliza = @cpoliza AND certi.fanopol = @fanopol AND certi.fmespol = @fmespol 
			FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
		)), JSON_QUERY('{}')) AS fianza,

		-- RIESGOS GENERALES
		ISNULL(JSON_QUERY((
			SELECT TRIM(rg.xdescrip1) AS 'xdescripcion', TRIM(rg.xdescrip2) AS 'xdescripcion2', TRIM(rg.xdescrip3) AS 'xdescripcion3', TRIM(rg.xdescrip4) AS 'xdescripcion4'
			FROM dbo.rgcerti rg
			WHERE rg.cpoliza = @cpoliza AND rg.fanopol = @fanopol AND rg.fmespol = @fmespol
			FOR JSON PATH
		)), JSON_QUERY('[]')) AS riesgos,

		-- ASEGURADOS (PERSONAS)
		ISNULL(JSON_QUERY((
			SELECT
				UPPER(TRIM(cli.xcliente)) AS 'xasegurado', TRIM(cli.cid) AS 'xcedula_asegurado', TRIM(par.xparentesco) AS 'xparentesco_asegurado',
				ISNULL(CONVERT(VARCHAR, pe.fnacimiento, 103), 'N/A') AS 'fnacimiento_asegurado', CASE TRIM(pe.csexo) WHEN 'M' THEN 'MASCULINO' WHEN 'F' THEN 'FEMENINO' ELSE '' END AS 'csexo_asegurado',
				TRIM(pe.cestado_civil) AS 'cestado_civil_asegurado', ISNULL(CONVERT(varchar, pe.fdesde, 103), 'N/A') AS 'fingreso_asegurado'
			FROM dbo.peasegurados pe 
			LEFT JOIN dbo.maclient cli ON cli.cci_rif = pe.casegurado
			LEFT JOIN dbo.maparent par ON par.cparentesco = pe.cparentesco
			WHERE pe.cpoliza = @cpoliza AND pe.fanopol = @fanopol AND pe.fmespol = @fmespol AND pe.iestado = 'V'
			ORDER BY pe.cparentesco
			FOR JSON PATH
		)), JSON_QUERY('[]')) AS asegurados,

		-- BENEFICIARIOS (PERSONAS)
		ISNULL(JSON_QUERY((
			SELECT 
				TRIM(UPPER(CASE WHEN pebenefi.cbeneficia > 100 THEN maclient.xcliente ELSE pebenefi.xnombre END)) AS 'xbeneficiario', 
				TRIM(CASE WHEN pebenefi.cbeneficia > 100 THEN maclient.cid ELSE '' END) AS 'xcedula_beneficiario', 
				TRIM(maparent.xparentesco) AS 'xparentesco_beneficiario', 
				CONVERT(VARCHAR, pebenefi.fnacimiento, 103) AS 'fnacimiento_beneficiario', 
				TRIM(pebenefi.csexo) AS 'csexo_beneficiario' 
			FROM dbo.pebenefi 
			LEFT JOIN dbo.maclient ON maclient.cci_rif = pebenefi.cbeneficia 
			LEFT JOIN dbo.maparent ON maparent.cparentesco = pebenefi.cparentesco 
			WHERE pebenefi.cpoliza = @cpoliza AND pebenefi.fanopol = @fanopol AND pebenefi.fmespol = @fmespol 
			ORDER BY pebenefi.cparentesco
			FOR JSON PATH 
		)), JSON_QUERY('[]')) AS beneficiarios,

		-- RECIBOS
		ISNULL(JSON_QUERY((
			SELECT 
				adrecibos.crecibo, TRIM(adrecibos.cnrecibo) AS 'recibo_fianza', TRIM(adrecibos.cnrecibo) AS 'cnrecibo', adrecibos.qcuotas AS 'cuota',
				TRIM(CASE adrecibos.itiporec WHEN 'P' THEN 'Primer Año (Nuevo)' WHEN 'R' THEN 'Renovación' WHEN 'A' THEN 'Adicional' WHEN 'D' THEN 'Devolución' ELSE '' END)  AS 'itiporec',
/*AGREGADO*/	TRIM(CASE adrecibos.iestadorec WHEN 'C' THEN 'COBRADO' WHEN 'P' THEN 'PENDIENTE' WHEN 'A' THEN 'ANULADO' ELSE 'N/A' END) AS 'xestado_recibo',
				CONVERT(VARCHAR, adrecibos.fdesde, 103) AS 'fdesde',  
				CONVERT(VARCHAR, adrecibos.fhasta, 103) AS 'fhasta', CASE WHEN adrecibos.fcobro IS NULL THEN 'N/A' ELSE CONVERT(VARCHAR, adrecibos.fcobro, 103) END AS 'fcobro',
				TRIM(adrecibos.cmoneda) AS 'cmoneda', adrecibos.mgastos AS 'mgastos', adrecibos.mgastosext AS 'mgastosext', adrecibos.mmontorec AS 'monto', adrecibos.mmontorecext AS 'monto_ext',
				adrecibos.cramo AS 'ramo', TRIM(mamonedas.xdescripcion_l) AS 'xmoneda',
				CASE WHEN adrecibos.cmoneda = 'Bs' THEN adrecibos.mmontorec ELSE adrecibos.mmontorecext END AS 'mprima'
			FROM dbo.adrecibos
			LEFT JOIN dbo.mamonedas ON adrecibos.cmoneda = mamonedas.cmoneda 
			WHERE adrecibos.cpoliza = @cpoliza AND adrecibos.fanopol = @fanopol AND adrecibos.fmespol = @fmespol AND adrecibos.iestadorec != 'A'
			ORDER BY adrecibos.fdesde ASC, adrecibos.crecibo ASC
			FOR JSON PATH
		)), JSON_QUERY('[]')) AS recibos,
		
		-- COBERTURAS
		ISNULL(JSON_QUERY((
			SELECT 
				TRIM(adpolcob.ccober) AS 'ccober',
				TRIM(macoberturas.xdescripcion_l) AS 'xdescripcion_l',
				CASE WHEN adpolcob.cmoneda <> 'Bs' THEN MAX(adpolcob.msumaasegext) ELSE MAX(adpolcob.msumaaseg) END AS 'msumaaseg',
				CASE WHEN adrecibos.cmoneda <> 'Bs' THEN SUM(adpolcob.mprimabrutaext) ELSE SUM(adpolcob.mprimabruta) END AS 'primabruta',
				TRIM(adpolcob.cmoneda) AS 'cmoneda',
				TRIM(CASE WHEN adpolcob.cramo = 18 THEN CASE WHEN adpolcob.ccober IN (7,6) THEN 'TCR' ELSE adpolcob.cmoneda END ELSE '' END) AS 'cmoneda2',
				adpolcob.cramo AS 'ramo'
			FROM dbo.adrecibos 
			INNER JOIN dbo.adpolcob ON adrecibos.crecibo = adpolcob.crecibo AND adrecibos.cmoneda = adpolcob.cmoneda
			INNER JOIN dbo.adpoltar ON adpoltar.crecibo = adpolcob.crecibo AND adpoltar.ccober = adpolcob.ccober
			INNER JOIN dbo.matarifa matar ON adpolcob.cramo = matar.cramo AND adpoltar.ccober = matar.ccober AND adpoltar.ctarifa = matar.ctarifa
			LEFT JOIN dbo.macoberturas ON macoberturas.ccobertura = adpolcob.ccober AND macoberturas.cramo = adpolcob.cramo
			WHERE adrecibos.cpoliza = @cpoliza AND adrecibos.fanopol = @fanopol AND adrecibos.fmespol = @fmespol 
			  AND adrecibos.iestadorec != 'A' AND adpolcob.iestado = 'V' 
			  AND (
					(adpolcob.cmoneda <> 'Bs' AND (adpolcob.msumaasegext IS NOT NULL OR adpolcob.mprimabrutaext IS NOT NULL))
					OR 
					(adpolcob.cmoneda = 'Bs' AND (adpolcob.msumaaseg IS NOT NULL OR adpolcob.mprimabruta IS NOT NULL))
			  )
			GROUP BY adpolcob.cramo, adrecibos.cmoneda, adpolcob.cmoneda, macoberturas.xdescripcion_l, adpolcob.ccober, matar.qordenimp
			ORDER BY CASE WHEN matar.qordenimp = 0 THEN 1 ELSE 0 END, matar.qordenimp ASC, CONVERT(INT, adpolcob.ccober) ASC
			FOR JSON PATH
		)), JSON_QUERY('[]')) AS coberturas

	FOR JSON PATH, ROOT('data');
END;
GO
