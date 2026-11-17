-- ============================================================================
-- Author:      Hamilton Leon
-- Create date: 2026-09-29
-- Description: pre emision de colectivos, se hace aparte para no modificar el flujo individual
-- ============================================================================
CREATE   PROCEDURE [dbo].[sp_pre_emision_Personas_General_Colectivo]
	@id int = NULL OUTPUT,
	@cnpoliza_rel varchar(30) = NULL,
	@cplan varchar(10) = NULL,
	@cramo int = NULL,
	@xcanal_venta varchar(250) = NULL,
	@icedula_tomador char(1) = NULL,
	@xrif_tomador numeric(9) = NULL,
	@xnombre_tomador varchar(250) = NULL,
	@xapellido_tomador varchar(250) = NULL,
	@isexo_tomador char(1) = NULL,
	@iestado_civil_tomador char(1) = NULL,
	@fnac_tomador datetime = NULL,
	@cestado_tomador varchar(100) = NULL,
	@cciudad_tomador varchar(100) = NULL,
	@xdireccion_tomador varchar(1000) = NULL,
	@xtelefono_tomador varchar(250) = NULL,
	@xcorreo_tomador varchar(250) = NULL,
	@icedula_titular char(1) = NULL,
	@xrif_titular numeric(9) = NULL,
	@xnombre_titular varchar(250) = NULL,
	@xapellido_titular varchar(250) = NULL,
	@isexo_titular char(1) = NULL,
	@iestado_civil_titular char(1) = NULL,
	@fnac_titular datetime = NULL,
	@cestado_titular varchar(100) = NULL,
	@cciudad_titular varchar(100) = NULL,
	@xdireccion_titular varchar(1000) = NULL,
	@xtelefono_titular varchar(250) = NULL,
	@xcorreo_titular varchar(250) = NULL,
	@cpersona_politica char(1) = NULL,
	@cterm_y_cod char(1) = NULL,
	@cdiagnos_enferm char(1) = NULL,
	@xdiagnos_enferm varchar(1000) = NULL,
	@cproductor int = NULL,
	@ptasamon numeric(18, 6) = NULL,
	@cmoneda char(4) = NULL,
	@msumaaseg numeric(18, 2) = NULL,
	@mprimaext numeric(18, 2) = NULL,
	@ifrecuencia char(1) = NULL,
	@femision datetime = NULL,
	@fdesde date = NULL,
	@fhasta date = NULL,
	@corigen_rel CHAR(2) = NULL,
	@api varchar(100) = NULL,
	@method varchar(100) = NULL,
	@cprog char(20) = NULL,
	@ifuente char(10) = NULL,
	@fingreso datetime = NULL,
	@cpoliza NUMERIC(19) = NULL OUTPUT,
	@cnpoliza varchar(30) = NULL OUTPUT,
	@cproces NUMERIC(13) = NULL OUTPUT,
	@ccanalalt int = NULL,
	@cscanalalt int = NULL,
	@ctipocanal CHAR(1) = NULL,
	@asegurados NVARCHAR(MAX) = NULL,
	@beneficiarios NVARCHAR(MAX) = NULL,
	@titulares NVARCHAR(MAX) = NULL
AS
BEGIN
	SET NOCOUNT ON;

	DECLARE
		@POL_RAMO VARCHAR(20), @cnrecibo varchar(50), @crecibo numeric(19), @csucur int,
		@cramoint int, @error VARCHAR(400), @fueraDeRango INT,
		@tplCpoliza NUMERIC(19, 0), @tplFanopol SMALLINT, @tplFmespol TINYINT, @tplFdesde DATETIME

	-- Normalizacion de productor "directo"
	IF ISNULL(@cproductor, 0) = 0 BEGIN
		SELECT @cproductor = 80080
	END

	-- Resolucion de ramo y plantilla vigente SIEMPRE via pcplanes (vigencia de la configuracion colectiva)
	SELECT TOP 1
		@cramo = ISNULL(@cramo, p.cramo),
		@tplCpoliza = p.cpoliza, @tplFanopol = p.fanopol, @tplFmespol = p.fmespol, @tplFdesde = p.fdesde
	FROM dbo.pcplanes p WITH (NOLOCK)
	WHERE p.cplan = @cplan AND p.iestado = 'V'
	  AND (@cramo IS NULL OR p.cramo = @cramo) -- el cplan se repite entre ramos: no mezclar plantillas
	ORDER BY p.fdesde DESC, p.cpoliza DESC

	IF @tplCpoliza IS NULL
	BEGIN
		SET @error = 'El plan colectivo enviado no se encuentra configurado (vigente) en pcplanes.'
		;THROW 51010, @error, 1;
	END

	-- Ramo tecnico interno: toda evaluacion de linea de negocio se hace por cramoint, nunca por cramo directo
	SELECT @cramoint = cramoint FROM dbo.maramos WITH (NOLOCK) WHERE cramo = @cramo

	IF @cramoint IS NULL
	BEGIN
		SET @error = 'El ramo del plan colectivo no posee cramoint configurado en maramos.'
		;THROW 51011, @error, 1;
	END

	-- Fechas: nunca se asumen por defecto si la capa intermedia no las envio
	IF @femision IS NULL OR @fdesde IS NULL OR @fhasta IS NULL
	BEGIN
		SET @error = 'Debe suministrar femision, fdesde y fhasta; no se asumen valores por defecto en pólizas colectivas.'
		;THROW 51012, @error, 1;
	END

	-- Moneda: no se hereda del plan, debe venir validada desde la capa intermedia
	IF @cmoneda IS NULL
	BEGIN
		SET @error = 'Debe suministrar cmoneda ya validada desde la capa intermedia; no se hereda del plan.'
		;THROW 51013, @error, 1;
	END

	-- El suscriptor principal (titulares[0]) debe venir tambien en los escalares de titular,
	-- que es lo que identifica a la poliza (adpoliza.casegurado, maclient, escalaServices, etc.)
	IF (@titulares IS NULL OR ISJSON(@titulares) <> 1 OR @xrif_titular IS NULL)
	BEGIN
		SET @error = 'Debe suministrar @titulares (JSON valido) y los datos del titular principal para emision colectiva.'
		;THROW 51015, @error, 1;
	END

	IF @icedula_tomador IS NULL SET @icedula_tomador = 'V'
	IF @icedula_titular IS NULL SET @icedula_titular = 'V'
	IF @xrif_tomador IS NULL SET @xrif_tomador = @xrif_titular

	-- Asignacion de sucursal: nunca se consulta macanalalt.csucur
	IF @ccanalalt IS NOT NULL
	BEGIN
		-- Canales alternativos: siempre receptora la sucursal principal (Mundial de Seguros)
		SET @csucur = 1
	END
	ELSE
	BEGIN
		-- Canal tradicional (emision propia): se respeta la sucursal asociada al productor
		SELECT @csucur = COALESCE(csucur, 1) FROM dbo.maproduc WITH (NOLOCK) WHERE cproductor = @cproductor
	END

	IF (@cramoint = 1)      SELECT @POL_RAMO = 'POL_VIDA'
	ELSE IF (@cramoint = 2) SELECT @POL_RAMO = 'POL_ACC'
	ELSE IF (@cramoint = 3) SELECT @POL_RAMO = 'POL_SALUD'
	ELSE IF (@cramoint = 4) SELECT @POL_RAMO = 'POL_FUN'
	ELSE                    SELECT @POL_RAMO = 'POLIZA'

	-- Numeracion oficial de poliza/recibo/proceso (no se sobreescribe manualmente)
	EXEC dbo.spContador_v1 @cpoliza OUTPUT, @cnpoliza OUTPUT, @crecibo OUTPUT, @cnrecibo OUTPUT, @cproces OUTPUT, @csucur, @fdesde, @cramo, @POL_RAMO

	-- Numero de poliza colectiva como en QA/prod (sp_pre_emision_Personas_General): C-ramo-ultimos 5 digitos del contador
	SELECT @cnpoliza = 'C-' + CAST(@cramo AS VARCHAR(10)) + '-' + RIGHT('00000' + CAST(@cpoliza AS VARCHAR(20)), 5)

	BEGIN TRANSACTION;
	BEGIN TRY
		INSERT INTO dbo.TMEMISION_PERSONAS_GENERAL
		(
			cnpoliza_rel, cplan, cramo, xcanal_venta, icedula_tomador,
			xrif_tomador, xnombre_tomador, xapellido_tomador, isexo_tomador, iestado_civil_tomador, fnac_tomador, cestado_tomador,
			cciudad_tomador, xdireccion_tomador, xtelefono_tomador, xcorreo_tomador, icedula_titular, xrif_titular, xnombre_titular,
			xapellido_titular, isexo_titular, iestado_civil_titular, fnac_titular, cestado_titular, cciudad_titular,
			xdireccion_titular, xtelefono_titular, xcorreo_titular,
			cpersona_politica, cterm_y_cod, cdiagnos_enferm, xdiagnos_enferm,
			cproductor, ptasamon, cmoneda, msumaaseg, mprimaext, ifrecuencia, femision, fdesde, fhasta,
			corigen_rel, api, method, cprog,
			ifuente, fingreso, cpoliza, cnpoliza, cproces, ccanalalt, cscanalalt, ctipocanal, iestado, xestado, xlog
		)
		SELECT
			@cnpoliza_rel, @cplan, @cramo, @xcanal_venta, @icedula_tomador,
			@xrif_tomador, @xnombre_tomador, @xapellido_tomador, @isexo_tomador, @iestado_civil_tomador, @fnac_tomador,
			@cestado_tomador, @cciudad_tomador, @xdireccion_tomador, @xtelefono_tomador, @xcorreo_tomador, @icedula_titular,
			@xrif_titular, @xnombre_titular, @xapellido_titular, @isexo_titular, @iestado_civil_titular, @fnac_titular,
			@cestado_titular, @cciudad_titular, @xdireccion_titular, @xtelefono_titular, @xcorreo_titular,
			@cpersona_politica, @cterm_y_cod, @cdiagnos_enferm, @xdiagnos_enferm,
			@cproductor, @ptasamon, @cmoneda, @msumaaseg,
			@mprimaext, @ifrecuencia, @femision, @fdesde, @fhasta,
			@corigen_rel, @api, @method, @cprog,
			@ifuente, @fingreso, @cpoliza, @cnpoliza, @cproces, @ccanalalt, @cscanalalt, @ctipocanal, 0, 'REGISTRADO', NULL

		SET @id = SCOPE_IDENTITY()

		-- ============================================================================================
		-- GRUPO COLECTIVO: @titulares es un arreglo de titulares, cada uno con su propio arreglo
		-- "asegurados" de cargas/dependientes anidado dentro. Se aplana todo hacia
		-- TMEMISION_PERSONAS_GENERAL_ASEG codificando el grupo en nasegurado = (orden_titular * 1000) + orden_persona,
		-- donde orden_persona = 0 identifica al titular mismo (nparentesco_asegurado = 0) y > 0 a sus dependientes.
		-- El orden_titular (1, 2, 3, ...) se reutiliza como numero de certificado (ccerti) en la emision:
		-- nunca 0, y correlativo por titular, tal como las polizas colectivas existentes en QA (C-8-...).
		-- ============================================================================================
		;WITH tit AS (
			SELECT
				ROW_NUMBER() OVER (ORDER BY TRY_CONVERT(INT, t.[key]), t.[key]) AS ordtit,
				t.[value] AS titular_json
			FROM OPENJSON(@titulares) t
		)
		INSERT INTO dbo.TMEMISION_PERSONAS_GENERAL_ASEG
		(
			id, nasegurado, cnpoliza, cramo, cplan,
			icedula_asegurado, xrif_asegurado, xnombre_asegurado, xapellido_asegurado,
			isexo_asegurado, iestado_civil_asegurado, fnac_asegurado, cestado_asegurado,
			cciudad_asegurado, xdireccion_asegurado, xtelefono_asegurado, xcorreo_asegurado,
			nparentesco_asegurado, npeso_asegurado, nestatura_asegurado
		)
		SELECT
			@id,
			(tit.ordtit * 1000) + pers.ordpers,
			@cnpoliza, @cramo, @cplan,
			pers.icedula_asegurado, pers.rif_asegurado, pers.nombre_asegurado, pers.apellido_asegurado,
			pers.sexo_asegurado, pers.estado_civil_asegurado, pers.fnac_asegurado, pers.estado_asegurado,
			pers.ciudad_asegurado, pers.direccion_asegurado, pers.telefono_asegurado, pers.correo_asegurado,
			pers.nparentesco_asegurado, pers.npeso_asegurado, pers.nestatura_asegurado
		FROM tit
		CROSS APPLY OPENJSON(tit.titular_json)
			WITH
			(
				icedula_titular  char(1)        '$.icedula_titular',
				xrif_titular     numeric(11, 0) '$.rif_titular',
				xnombre_titular  varchar(250)   '$.nombre_titular',
				xapellido_titular varchar(250)  '$.apellido_titular',
				isexo_titular    char(1)        '$.sexo_titular',
				iestado_civil_titular char(1)   '$.estado_civil_titular',
				fnac_titular     date           '$.fnac_titular',
				cestado_titular  int            '$.estado_titular',
				cciudad_titular  int            '$.ciudad_titular',
				xdireccion_titular varchar(1000) '$.direccion_titular',
				xtelefono_titular varchar(250)  '$.telefono_titular',
				xcorreo_titular  varchar(250)   '$.correo_titular',
				asegurados       nvarchar(max)  '$.asegurados' AS JSON
			) tt
		CROSS APPLY
		(
			-- orden_persona = 0: el titular mismo, con sus propios datos
			SELECT
				0 AS ordpers, 0 AS nparentesco_asegurado,
				tt.icedula_titular AS icedula_asegurado, tt.xrif_titular AS rif_asegurado,
				tt.xnombre_titular AS nombre_asegurado, tt.xapellido_titular AS apellido_asegurado,
				tt.isexo_titular AS sexo_asegurado, tt.iestado_civil_titular AS estado_civil_asegurado,
				tt.fnac_titular AS fnac_asegurado, tt.cestado_titular AS estado_asegurado,
				tt.cciudad_titular AS ciudad_asegurado, tt.xdireccion_titular AS direccion_asegurado,
				tt.xtelefono_titular AS telefono_asegurado, tt.xcorreo_titular AS correo_asegurado,
				CAST(NULL AS numeric(6, 2)) AS npeso_asegurado, CAST(NULL AS numeric(8, 2)) AS nestatura_asegurado
			UNION ALL
			-- orden_persona > 0: las cargas/dependientes de este titular
			SELECT
				ROW_NUMBER() OVER (ORDER BY TRY_CONVERT(INT, a.[key]), a.[key]) AS ordpers,
				ISNULL(c.nparentesco_asegurado, 1),
				c.icedula_asegurado, c.rif_asegurado, c.nombre_asegurado, c.apellido_asegurado,
				c.sexo_asegurado, c.estado_civil_asegurado, c.fnac_asegurado, c.estado_asegurado,
				c.ciudad_asegurado, c.direccion_asegurado, c.telefono_asegurado, c.correo_asegurado,
				c.npeso_asegurado, c.nestatura_asegurado
			FROM OPENJSON(tt.asegurados) a
			CROSS APPLY OPENJSON(a.[value])
				WITH
				(
					icedula_asegurado  char(1)        '$.icedula_asegurado',
					rif_asegurado      numeric(11, 0) '$.rif_asegurado',
					nombre_asegurado   varchar(250)   '$.nombre_asegurado',
					apellido_asegurado varchar(250)   '$.apellido_asegurado',
					sexo_asegurado     char(1)        '$.sexo_asegurado',
					estado_civil_asegurado char(1)    '$.estado_civil_asegurado',
					fnac_asegurado     date           '$.fnac_asegurado',
					estado_asegurado   int            '$.estado_asegurado',
					ciudad_asegurado   int            '$.ciudad_asegurado',
					direccion_asegurado varchar(1000) '$.direccion_asegurado',
					telefono_asegurado varchar(250)   '$.telefono_asegurado',
					correo_asegurado   varchar(250)   '$.correo_asegurado',
					nparentesco_asegurado int         '$.nparentesco_asegurado',
					npeso_asegurado    numeric(6, 2)  '$.npeso_asegurado',
					nestatura_asegurado numeric(8, 2) '$.nestatura_asegurado'
				) c
		) pers (ordpers, nparentesco_asegurado, icedula_asegurado, rif_asegurado, nombre_asegurado, apellido_asegurado,
			sexo_asegurado, estado_civil_asegurado, fnac_asegurado, estado_asegurado, ciudad_asegurado,
			direccion_asegurado, telefono_asegurado, correo_asegurado, npeso_asegurado, nestatura_asegurado)

		-- Validacion preventiva de edades del grupo (todos los titulares y sus dependientes)
		-- contra la matriz de elegibilidad pcasegurados
		IF EXISTS (SELECT 1 FROM dbo.pcasegurados WITH (NOLOCK) WHERE cpoliza = @tplCpoliza AND fanopol = @tplFanopol AND fmespol = @tplFmespol)
		BEGIN
			SELECT @fueraDeRango = COUNT(1)
			FROM dbo.TMEMISION_PERSONAS_GENERAL_ASEG a WITH (NOLOCK)
			WHERE a.id = @id
			  AND NOT EXISTS (
					SELECT 1
					FROM dbo.pcasegurados pa WITH (NOLOCK)
					WHERE pa.cpoliza = @tplCpoliza AND pa.fanopol = @tplFanopol AND pa.fmespol = @tplFmespol
					  AND pa.csexo = a.isexo_asegurado
					  AND DATEDIFF(YEAR, a.fnac_asegurado, @femision) BETWEEN pa.cedad_as_mn AND pa.cedad_as_mx
			  )

			IF ISNULL(@fueraDeRango, 0) > 0
			BEGIN
				SET @error = CONCAT('Existen ', @fueraDeRango, ' asegurado(s) del grupo fuera del rango de edad permitido (pcasegurados) para este plan colectivo.')
				;THROW 51014, @error, 1;
			END
		END

		-- Beneficiarios declarados de forma independiente (si la capa intermedia los envia aparte de los titulares)
		IF (@beneficiarios IS NOT NULL AND ISJSON(@beneficiarios) = 1)
		BEGIN
			INSERT INTO dbo.TMEMISION_PERSONAS_GENERAL_BENF
			(
				id, nbeneficiario, cnpoliza, cramo, cplan,
				icedula_beneficiario, xrif_beneficiario, xnombre_beneficiario, xapellido_beneficiario,
				isexo_beneficiario, iestado_civil_beneficiario, fnac_beneficiario, cestado_beneficiario,
				cciudad_beneficiario, xdireccion_beneficiario, xtelefono_beneficiario, xcorreo_beneficiario,
				nparentesco_beneficiario, pporce_beneficiario
			)
			SELECT
				@id,
				ROW_NUMBER() OVER (ORDER BY TRY_CONVERT(INT, j.[key]), j.[key]),
				@cnpoliza, @cramo, @cplan,
				COALESCE(b.tipo_cedula_beneficiario_v1, b.tipo_cedula_beneficiario_v2, 'V'),
				COALESCE(b.rif_beneficiario_v1, b.rif_beneficiario_v2),
				COALESCE(b.nombre_beneficiario_v1, b.nombre_beneficiario_v2),
				COALESCE(b.apellido_beneficiario_v1, b.apellido_beneficiario_v2),
				COALESCE(b.sexo_beneficiario_v1, b.sexo_beneficiario_v2),
				COALESCE(b.estado_civil_beneficiario_v1, b.estado_civil_beneficiario_v2),
				b.fnac_beneficiario,
				b.estado_beneficiario,
				b.ciudad_beneficiario,
				b.direccion_beneficiario,
				b.telefono_beneficiario,
				b.correo_beneficiario,
				b.nparentesco_beneficiario,
				b.pporce_beneficiario
			FROM OPENJSON(
				CASE WHEN LEFT(LTRIM(@beneficiarios), 1) = '[' THEN @beneficiarios ELSE CONCAT('[', @beneficiarios, ']') END
			) j
			CROSS APPLY OPENJSON(j.value)
			WITH
			(
				tipo_cedula_beneficiario_v1  char(1)        '$.tipo_cedula_beneficiario',
				rif_beneficiario_v1          numeric(11, 0) '$.rif_beneficiario',
				nombre_beneficiario_v1       varchar(250)   '$.nombre_beneficiario',
				apellido_beneficiario_v1     varchar(250)   '$.apellido_beneficiario',
				sexo_beneficiario_v1         char(1)        '$.sexo_beneficiario',
				estado_civil_beneficiario_v1 char(1)        '$.estado_civil_beneficiario',

				tipo_cedula_beneficiario_v2  char(1)        '$.icedula_beneficiario',
				rif_beneficiario_v2          numeric(11, 0) '$.xrif_beneficiario',
				nombre_beneficiario_v2       varchar(250)   '$.xnombre_beneficiario',
				apellido_beneficiario_v2     varchar(250)   '$.xapellido_beneficiario',
				sexo_beneficiario_v2         char(1)        '$.isexo_beneficiario',
				estado_civil_beneficiario_v2 char(1)        '$.iestado_civil_beneficiario',

				fnac_beneficiario            date           '$.fnac_beneficiario',
				estado_beneficiario          INT            '$.estado_beneficiario',
				ciudad_beneficiario          INT            '$.ciudad_beneficiario',
				direccion_beneficiario       varchar(1000)  '$.direccion_beneficiario',
				telefono_beneficiario        varchar(250)   '$.telefono_beneficiario',
				correo_beneficiario          varchar(250)   '$.correo_beneficiario',
				nparentesco_beneficiario     varchar(250)   '$.nparentesco_beneficiario',
				pporce_beneficiario          numeric(13, 2) '$.pporce_beneficiario'
			) b;
		END

		UPDATE dbo.TMEMISION_PERSONAS_GENERAL
		SET iestado = 1, xestado = 'VALIDADO'
		WHERE id = @id

		COMMIT TRANSACTION;
	END TRY
	BEGIN CATCH
		IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;

		SET @error = ERROR_MESSAGE()

		IF @id IS NOT NULL
		BEGIN
			UPDATE dbo.TMEMISION_PERSONAS_GENERAL
			SET iestado = -1, xestado = 'ERROR_VALIDACION', xlog = @error
			WHERE id = @id
		END

		;THROW;
	END CATCH

	-- Enruta hacia el motor transaccional indicando explicitamente que es una emision colectiva.
	-- sp_emision_Personas_General vuelve a evaluar @itipopol y despacha a sp_emision_Personas_General_Colectivo.
	EXEC dbo.sp_emision_Personas_General @id = @id, @itipo_emision = 'C'
END