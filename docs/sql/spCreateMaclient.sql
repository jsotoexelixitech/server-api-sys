CREATE   PROCEDURE [dbo].[spCreateMaclient]
		@icedula CHAR(1),
		@cci_rif NUMERIC(13, 0),
		@xnombre VARCHAR(120),
		@xapellido VARCHAR(120),
		@xcliente VARCHAR(250),
		@isexo CHAR(1),
		@iestado_civil CHAR(1),
		@fnac DATETIME,
		@xcorreo CHAR(60),
		@cpais SMALLINT,
		@cestado SMALLINT,
		@cciudad SMALLINT,
		@xdireccion CHAR(60),
		@czonapos CHAR(10),
		@xtelefono CHAR(20),
		@ifuente CHAR(10),
		@salida VARCHAR(50) OUTPUT,
		@cid VARCHAR(15) = null,
		@npeso NUMERIC(6,2) = null,
		@nestatura NUMERIC(8,2) = null
		
AS
BEGIN
	DECLARE @ipersona CHAR(1)
	
	IF(@cid IS NULL) BEGIN
		SELECT @cid = CONCAT(@icedula, '-', @cci_rif)
	END

	IF (@icedula IS NULL) SELECT @icedula='V'

	IF (@icedula = 'V') SELECT @ipersona='N'
	IF (@icedula = 'E') SELECT @ipersona='N'
	IF (@icedula = 'J') SELECT @ipersona='J'
	IF (@icedula = 'G') SELECT @ipersona='G'

	IF (@cci_rif IS NOT NULL) BEGIN

			IF NOT EXISTS(SELECT *
			FROM maclient
			WHERE cci_rif = @cci_rif) BEGIN
					INSERT INTO maclient
							(cci_rif, u_version, ipersona, cid, cdv_cliente,
							xnombre_1, xapellido_1, xnombre, xapellido, xcliente,
							isexo, iestado_civil, iestado, cprog,ifuente, fingreso,cusuario,ccategoria, fnacimiento, npeso, nestatura
							)

					SELECT
							@cci_rif, '!', @ipersona, @cid, 0,
							@xnombre, @xapellido, @xnombre, @xapellido, @xcliente,
							@isexo, @iestado_civil, 'V', 'spCreateMaclient', @ifuente, GETDATE(), 7, 1, @fnac, @npeso, @nestatura
			END

			IF NOT EXISTS(SELECT *
			FROM maclient_correo
			WHERE cci_rif = @cci_rif) BEGIN
					INSERT INTO maclient_correo
							(cci_rif, cclave_num, u_version, itipocorreo, xcorreo, mcliente_dircob, cprog, ifuente, fingreso,
							cusuario, ccategoria)

					SELECT
							@cci_rif, 1, '!', 'H', @xcorreo, 0, 'spCreateMaclient', @ifuente, GETDATE(),
							7, 1
			END

			IF NOT EXISTS(SELECT *
			FROM maclient_dir
			WHERE cci_rif = @cci_rif) BEGIN
					INSERT INTO maclient_dir

							(cci_rif, cclave_num, u_version, itipodirec,xavecalle, cpais, cestado, cciudad, cprog, ifuente, fingreso,
							cusuario, ccategoria)

					SELECT
							@cci_rif, 1, '!', 'H', @xdireccion, 58, @cestado, @cciudad, 'spCreateMaclient', @ifuente, GETDATE(),
							7, 1
			END

			IF NOT EXISTS(SELECT *
			FROM maclient_tel
			WHERE cci_rif = @cci_rif) BEGIN
					INSERT INTO maclient_tel
							(cci_rif, cclave_num, u_version, itipotel, xtelefono, mcliente_dircob, cprog, ifuente, fingreso,
							cusuario, ccategoria)

					SELECT
							@cci_rif, 1, '!', 'H', @xtelefono, 0, 'spCreateMaclient', @ifuente, GETDATE(),
							7, 1
			END

			IF NOT EXISTS(SELECT *
			FROM maclient_atr
			WHERE cci_rif = @cci_rif) BEGIN
					INSERT INTO maclient_atr
							(cci_rif, u_version, iorigen, iente, cprofesion, cocupacion, ccategocli, cempresa, cgrupoecono, cmercado,
							cactividad,csucur,cregion, ccentserv, cplan, irevisadopor, iadministra, itesoreria, iexon_imp,isiniestro,
							ireltrab, miganmin, miganmax, mpatmin, mpatmax, nregistro, ntomo, cultprod, cprog, ifuente,
							fingreso, cusuario, ccategoria)

					SELECT
							@cci_rif, '!', 'D', 'P', 0, 0, 0, 0, 0, 0,
							0, 0, 0, 0, 0, 0, 'N', 0, 0, 'N',
							0, 0, 0, 0, 0, 0, 0, 0, 'spCreateMaclient', @ifuente,
							GETDATE(), 7, 1
			END
			
		END
END;
