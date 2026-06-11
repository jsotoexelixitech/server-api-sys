ALTER TRIGGER [dbo].[TEmision_Per_Ge]
ON [dbo].[TMEMISION_PERSONAS_GENERAL]
WITH EXECUTE AS CALLER
AFTER INSERT
AS
BEGIN

	SET NOCOUNT ON;

    DECLARE
	@id int, @cnpoliza_rel varchar(30), @cplan varchar(6), @xcanal_venta varchar(250), @icedula_tomador char(1),
    @xrif_tomador  numeric(9),   @xnombre_tomador   varchar(250),   @xapellido_tomador   varchar(250),   @isexo_tomador   char(1),
    @iestado_civil_tomador  char(1),  @fnac_tomador  DATE,  @cestado_tomador  varchar(100),   @cciudad_tomador   varchar(100),
    @xdireccion_tomador varchar(1000), @xtelefono_tomador varchar(250), @xcorreo_tomador varchar(250),  @icedula_titular  char(1),
    @xrif_titular  numeric(9),   @xnombre_titular   varchar(250),   @xapellido_titular   varchar(250),   @isexo_titular   char(1),
    @iestado_civil_titular  char(1),  @fnac_titular  DATE,  @cestado_titular  varchar(100),   @cciudad_titular   varchar(100),
    @xdireccion_titular varchar(1000), @xtelefono_titular varchar(250), @xcorreo_titular varchar(250), @cproductor int,  @ptasamon
    numeric(18,6), @ifrecuencia char(1), @femision DATE, @fdesde DATE, @fhasta DATE, 
    @api varchar(100), @method varchar(100),  @cprog  char(20),  @ifuente
    char(10), @fingreso DATETIME, @cpoliza NUMERIC(19,0), @cnpoliza  varchar(30),  @cproces  NUMERIC(13,0),  @pcomision  numeric(9,  2),
    @cramo int, @cmoneda CHAR(4),
	@msumaaseg  numeric(18,  2),  @msumaasegext  numeric(18,  2),  @mprima  numeric(18,  2),  @mprimaext  numeric(18,2),   @mcomision
	numeric(18,2),  @mcomisionext  numeric(18,2),  @qcontador   numeric(18,0),   
	@crecibo numeric(19,0), @cnrecibo varchar(30), @qcontadorrec numeric(18,0),
	@contador_polacc numeric(18,0), @fano smallint, @fmes smallint,  @fanopol  smallint,  @fmespol  smallint,  @fdesde_pol  DATE,
	@fhasta_pol DATE, @fdesde_rec DATE, @fhasta_rec DATE,  @corigen_rel  char(2),  @qrecibo1  numeric(19,0),  @ncuo  int,
	@ifpexceso numeric(18,2), @msfp numeric(18,2), @mpfp numeric(18,2), @mpfpext numeric(18,2), @mpfpret  numeric(18,2),  @mpfpretext
	numeric(18,2), @mcfp numeric(18,2), @mcfpext numeric(18,2), @mifp numeric(18,2), @mifpext numeric(18,2), @msretesp numeric(18,2),
	@msretespext numeric(18,2), @mpretesp numeric(18,2),  @mpretespext  numeric(18,2),  @ctiporamo  int,  @itipocont  char(3),  @pcoa
	numeric(18,8),    @nparentesco_asegurado    tinyint,    @icedula_asegurado    char(1),    @xrif_asegurado     numeric(12,     0),
	@iestado_civil_asegurado char(1), @xnombre_asegurado varchar(250), @xapellido_asegurado varchar(250),  @isexo_asegurado  char(1),
	@fnac_asegurado   DATE,   @xdireccion_asegurado   varchar(1000),   @xcorreo_asegurado   varchar(250),    @xtelefono_asegurado
	varchar(250), @caseg  numeric(12,0),  @cben  numeric(12,0),  @nparentesco_beneficiario  tinyint,  @icedula_beneficiario  char(1),
	@xrif_beneficiario numeric(12, 0), @xnombre_beneficiario varchar(250), @xapellido_beneficiario varchar(250), @isexo_beneficiario char(1),
	@nbeneficia int, @fnac_beneficiario DATE , @ncobertura
	TINYINT, @POL_RAMO VARCHAR(20), @cparen TINYINT, @ctablatar CHAR(10),
    @nedad_asegurado VARCHAR(20),
	@nrecibo int, @fcobro DATE, @iestadorec CHAR(1), @cnrecibo_rel varchar(30), @xcliente_tomador VARCHAR(250), 
	@xcliente_titular VARCHAR(250), @xcliente_asegurado VARCHAR(250), @xcliente_beneficiario VARCHAR(250), @cuotas INT, @cramoint INT,
	@ccanalalt int, @cscanalalt int, @ctipocanal CHAR(1), @cbeneficiario numeric(9), @msumatabla  numeric(18,  2), @cgestor VARCHAR(30),
    @mprimarec  numeric(18,2), @mprimarecext  numeric(18,2),
    @mprimabrutaext numeric(18,2), @pdescuento numeric(13,2), @mdescuentoext numeric(18,2), @precargo numeric(13,2), @mrecargoext numeric(18,2), 
    @mmontonetoext numeric(18,2),
    @mprimabrutarecext numeric(18,2), @mdescuentorecext numeric(18,2), @mrecargorecext numeric(18,2), @mmontonetorecext numeric(18,2),
    @mprimabrutarec numeric(18,2), @mdescuentorec numeric(18,2), @mrecargorec numeric(18,2), @mmontonetorec numeric(18,2),
    @pdescuento_cob numeric(13,2), @precargo_cob numeric(13,2),
    @pporce NUMERIC(13, 2),
    @mprima_tar NUMERIC(18, 2), @mprimabruta_tar NUMERIC(18, 2),
    @mprimaext_tar NUMERIC(18, 2), @mprimabrutaext_tar NUMERIC(18, 2),
    @mdescuento_tar NUMERIC(18, 2), @mdescuentoext_tar NUMERIC(18, 2),
    @mrecargo_tar NUMERIC(18, 2), @mrecargoext_tar NUMERIC(18, 2)
	
	SELECT
	@id = id, @cnpoliza_rel = cnpoliza_rel,  @cplan  =  cplan,  @xcanal_venta  =  xcanal_venta,  @icedula_tomador  =  icedula_tomador,
	@xrif_tomador = xrif_tomador,  @xnombre_tomador  =  xnombre_tomador,  @xapellido_tomador  =  xapellido_tomador,  @isexo_tomador  =
	isexo_tomador, @iestado_civil_tomador = iestado_civil_tomador, @fnac_tomador = fnac_tomador, @cestado_tomador  =  cestado_tomador,
	@cciudad_tomador  =  cciudad_tomador,  @xdireccion_tomador   =   xdireccion_tomador,   @xtelefono_tomador =   xtelefono_tomador,
	@xcorreo_tomador  =  xcorreo_tomador,  @icedula_titular  =  icedula_titular,  @xrif_titular  =  xrif_titular,  @xnombre_titular  =
	xnombre_titular,   @xapellido_titular   =   xapellido_titular,   @isexo_titular   =   isexo_titular,   @iestado_civil_titular    =
	iestado_civil_titular, @fnac_titular = fnac_titular,  @cestado_titular  =  cestado_titular,  @cciudad_titular  =  cciudad_titular,
	@xdireccion_titular = xdireccion_titular, @xtelefono_titular = xtelefono_titular, @xcorreo_titular = xcorreo_titular,  @cproductor
	= cproductor, @ptasamon = ptasamon, @ifrecuencia = ifrecuencia, @femision = femision, @api =  api,  @method  =  method,  @cprog  =
	cprog, @ifuente = ifuente, @fingreso = fingreso, @cpoliza = cpoliza, @cnpoliza  =  cnpoliza,  @cproces  =  cproces,  @pcomision  =
	pcomision, @cramo = cramo, @mprimaext = mprimaext, @corigen_rel = corigen_rel, @ccanalalt = ccanalalt, @cscanalalt = cscanalalt, 
	@ctipocanal = ctipocanal, @msumaaseg = msumaaseg, @fdesde = fdesde, @fhasta = fhasta
	FROM Inserted

    DECLARE @error VARCHAR(max)

    SELECT @msfp=0, @mpfp = 0, @mpfpext = 0, @mpfpret = 0, @mpfpretext = 0, @mcfp = 0, @mcfpext=0, @mifp=0,
	@mifpext = 0, @msretesp = 0, @msretespext=0, @mpretesp = 0, @mpretespext = 0, @itipocont = 'RET', @pcoa = 0

    IF (@ifrecuencia = 'M') SELECT @cuotas = 12
	IF (@ifrecuencia = 'T') SELECT @cuotas = 4
	IF (@ifrecuencia = 'C') SELECT @cuotas = 3
	IF (@ifrecuencia = 'S') SELECT @cuotas = 2
    IF (@ifrecuencia = 'A') SELECT @cuotas = 1
	IF (@ifrecuencia = 'E') SELECT @cuotas = 1

    SELECT @cprog = 'TEmision_Per_Ge'


    IF (@fdesde IS NOT NULL) BEGIN
        SELECT @fdesde_pol = @fdesde
    END ELSE BEGIN
        SELECT @fdesde_pol = @femision
    END 
    IF (@fhasta IS NOT NULL) BEGIN
        SELECT @fhasta_pol = @fhasta
    END ELSE BEGIN
        SELECT @fhasta_pol = CONVERT(datetime, DATEADD(YY, 1, @fdesde_pol))
    END     

    SELECT @fano = YEAR(GETDATE()), @fmes = MONTH(GETDATE())
		
	SELECT @fano = YEAR(GETDATE())

    IF (@precargo IS NULL) SET @precargo = 0
    IF (@pdescuento IS NULL) SET @pdescuento = 0
    IF (@pdescuento_cob IS NULL) SET @pdescuento_cob = 0
    IF (@precargo_cob IS NULL) SET @precargo_cob = 0
    IF (@mdescuentoext IS NULL) SET @mdescuentoext = 0
    IF (@mrecargoext IS NULL) SET @mrecargoext = 0

	SELECT @pcomision = pcomision from maarancel WHERE cramo = @cramo and iestado = 'V'
    SELECT @cmoneda = cmoneda FROM maplanes_per WHERE cramo = @cramo AND cplan = @cplan
    IF (@ptasamon IS NULL ) SELECT @ptasamon = ptasamon FROM mamonedas WHERE cmoneda = @cmoneda
	
	-- IF @msumaaseg IS NOT NULL BEGIN
    --     IF @cmoneda != 'Bs' BEGIN
    --         SELECT @msumaasegext = @msumaaseg
    --         SELECT @msumaaseg = @msumaaseg * @ptasamon
    --     END ELSE BEGIN 
    --         SELECT @msumaasegext = @msumaaseg / @ptasamon
    --     END
	-- END
	
	
    SELECT @mcomision = 0
    SELECT @mcomisionext = 0
    SELECT @pcomision = pcomision from maarancel WHERE cramo = @cramo and iestado = 'V'

	-- IF @cproductor = 80080 BEGIN
	-- 		SELECT @mcomision = 0
	-- 		SELECT @mcomisionext = 0
	-- 		SELECT @pcomision = 0
	-- END ELSE BEGIN
	-- 		SELECT @pcomision = pcomision from maarancel WHERE cramo = @cramo and iestado = 'V'
	-- 		SELECT @mcomision = @mprima * (@pcomision / 100)
	-- 		SELECT @mcomisionext = @mprimaext * (@pcomision / 100)
	-- END
	
    SELECT @cramoint = cramoint from maramos WHERE cramo = @cramo
	-- SELECT @mcomision = @mprima * (@pcomision / 100)
	-- SELECT @mcomisionext = @mprimaext * (@pcomision / 100)
	
	IF (@ccanalalt IS NOT NULL) SELECT @ctipocanal = ctipocanal FROM macanalalt WHERE ccanalalt = @ccanalalt
	SELECT @cgestor = cgestor FROM magestor WHERE ccanalalt = @ccanalalt and cscanalalt = @cscanalalt
    IF (@ccanalalt IS NULL) SELECT @cgestor = cgestor, @ctipocanal = ctipocanal,@ccanalalt = ccanalalt, @cscanalalt = cscanalalt 
    FROM magestor WHERE cgestor = CONCAT(@cproductor, '-0-0')
	

    IF (@femision IS NULL) SELECT @femision=GETDATE()

	IF (@icedula_tomador IS NULL) SELECT @icedula_titular='V'

	IF (@icedula_titular IS NULL) SELECT @icedula_titular='V'

--     SELECT @cbeneficiario = cci_rif FROM maplanes_per
--     INNER JOIN maclient ON maclient.cid = maplanes_per.cbeneficiario
--     WHERE cramo = @cramo and cplan = @cplan
		
	SELECT @cbeneficiario = cbeneficiario FROM maplanes_per
--     INNER JOIN maclient ON maclient.cid = maplanes_per.cbeneficiario
    WHERE cramo = @cramo and cplan = @cplan

    IF (@cbeneficiario IS NULL) SELECT @cbeneficiario = @xrif_titular

	-- CREACION DEL CLIENTE
	IF (@xrif_titular IS NOT NULL) BEGIN
		select @xcliente_titular = concat(@xnombre_titular, ' ', @xapellido_titular)
		EXEC spCreateMaclient @icedula_titular, @xrif_titular, @xnombre_titular, @xapellido_titular, @xcliente_titular,  @isexo_titular,
		@iestado_civil_titular, @fnac_titular, @xcorreo_titular,  58,  @cestado_titular,  @cciudad_titular,  @xdireccion_titular,  null,
		@xtelefono_titular, @ifuente, 0
	END
	
	-- CREACION DEL TOMADOR
	IF (@xrif_tomador IS NOT NULL) BEGIN
		select @xcliente_tomador = concat(@xnombre_tomador, ' ', @xapellido_tomador)
		EXEC spCreateMaclient @icedula_tomador, @xrif_tomador, @xnombre_tomador, @xapellido_tomador, @xcliente_tomador,  @isexo_tomador,
		@iestado_civil_tomador, @fnac_tomador, @xcorreo_tomador,  58,  @cestado_tomador,  @cciudad_tomador,  @xdireccion_tomador,  null,
		@xtelefono_tomador, @ifuente, 0
		
	END ELSE BEGIN
        SELECT @xrif_tomador = @xrif_titular		
	END

    -- SE CREA LA POLIZA
	IF (@cpoliza IS NOT NULL) BEGIN	

		INSERT INTO adpoliza
		(cpoliza, fanopol, fmespol, u_version, cramo,  cnpoliza, cproces,  cplan, itipoprod, itipopol, itiponegocio, clider,
		cpolizalider, istatpol, iestado, itipoingreso, cpoliza_mae,  ccerti_mae,  itiporen,  iperren,  ccauren, iestadoren,
		csucur,csucurrec, criesgo, cpolnum, cultcert,  casegurado,  ctenedor,  cbeneficiario,   cacreedor,  cfinanciera,  cproductor,
		czonaprod, cejecta, cmoneda, ptasamon,   forigen,      fdesde,     fhasta,    itipoanul,    canula,    idevolucion,
		iformadevo, qcuotas, ifrecuencia, itipovenprima, iestadovenprima, icalculoedad, igemi,  iqgemi,  iapligemi,  mgemi,
		mgemiext,       cprog, ifuente, fingreso, cusuario, ccategoria, cnpoliza_rel, corigen_rel, ccanalalt, ctipocanal)

		SELECT 
		@cpoliza,   @fano,   @fmes,  '!', @cramo,  @cnpoliza,  @cproces,   @cplan,      'NU',   'I',      'DI',    0,
		0       ,     'V',          'V',          'N',           0,            0,        'A',         1,         0,      'N',
		1,  1,       0,     0,     0,    @xrif_titular,  @xrif_tomador ,     @xrif_titular,    0,        0,    @cproductor,
		0       ,     0,    @cmoneda,     @ptasamon, @femision,  @FDESDE_POL, @FHASTA_POL,        'N',           0,           'P',
		'N',               0,          @ifrecuencia,          'N',             'N',          'R',   'N',     'N',   'N',      0,
		0,@cprog,   @ifuente, getdate(),   7,          1, @cnpoliza_rel, @corigen_rel, @ccanalalt, @ctipocanal

		INSERT INTO sopoliza
		(cproces,u_version, cpoliza, fanopol, fmespol,  cramo, cplan, itipoprod,itipopol,itiponegocio, clider,   cpolizalider,		
		istatpol, iestado, itipoingreso, cpoliza_mae, ccerti_mae, cloteren, itiporen, iperren, ccauren, iestadoren,   csucur,
		cpolnum,cultcert,casegurado, ctenedor, cbeneficiario, cacreedor, cfinanciera,   cproductor,   czonaprod,     cejecta,
		cmoneda,ptasamon,forigen, fdesde, fhasta,idevolucion,femisionp, qcuotas,ifrecuencia, itipovenprima,  iestadovenprima, 
		icalculoedad, bcom_plan, cproducto, isumaman,msumaman, msumamanext, itarifa, igemi, iqgemi, iapligemi,mgemi,mgemiext,
		cprog, ifuente, fingreso, cusuario, ccategoria)

		SELECT
		@cproces,      '!',@cpoliza,   @fano,   @fmes, @cramo, @cplan,  'SO',     'I',         'DI',     0,         0,
		'V',          'V',          'N',           0,          0,        0,      'A',         1,       0,        'N',     1,
		0,             0,  @xrif_titular, @xrif_tomador,      @xrif_titular,   0,   0,     @cproductor,     0,          0,
		@cmoneda,  @ptasamon,  @femision,    @fdesde_pol,    @fhasta_pol,    'P',      @femision,      0,     @ifrecuencia,     'N',    'N',
		'R',          0,          0,          0,          0,          0,          0,          'N',         'N',     'N',0,  0,
		@cprog,   @ifuente, getdate(),   7,          1


/***********************************************************************************************************************************/
     -- CARGA LOS ASEGURADOS 

	IF EXISTS(SELECT * FROM maclient WHERE cci_rif = @xrif_titular OR cid = @icedula_titular + '-' + CONVERT(VARCHAR,@xrif_titular)) BEGIN		    
		INSERT INTO peasegurados 
        (
            cpoliza, fanopol, fmespol, iclaseaseg, casegurado, nmenor, u_version, ccerti,  cproces,  cramo,  cnpoliza,  fnacimiento,
            csexo, cestado_civil, cparentesco, iestadoren, fdesde, fhasta, falta, fbaja, xobserva, xobsimp, bobsimp, iestado, cprog,
            ifuente, bok, cerror, fingreso, cusuario, ccategoria, cusuarioauto, ccategoriaauto, fultmod, cusuariomod, ccategoriamod
        ) SELECT 
            cpoliza, fanopol, fmespol, 'T', cl.cci_rif, 0, '!', 0,  cproces,  cramo,  cnpoliza,  fnacimiento,
            cl.isexo, cl.iestado_civil, 1, iestadoren, fdesde, fhasta, fdesde, null, null, null, null, 'V', a.cprog,
            a.ifuente, a.bok, a.cerror, GETDATE(), a.cusuario, a.ccategoria, a.cusuarioauto, a.ccategoriaauto, a.fultmod, a.cusuariomod, a.ccategoriamod
        FROM adpoliza a
        INNER JOIN maclient cl ON cl.cci_rif = a.casegurado
        WHERE cpoliza = @cpoliza
    END

	IF EXISTS(SELECT * FROM eePoliza_Salud_Aseg) BEGIN
	
		DECLARE cursito CURSOR FOR 
		SELECT DISTINCT(xrif_asegurado) from eePoliza_Salud_Aseg
   
		OPEN cursito

		FETCH NEXT FROM cursito
		INTO @caseg

		WHILE @@FETCH_STATUS = 0
		BEGIN

            SELECT 
            @icedula_asegurado=icedula_asegurado,@xrif_asegurado=xrif_asegurado,             @xnombre_asegurado=xnombre_asegurado,
            @xapellido_asegurado=xapellido_asegurado,             @fnac_asegurado=fnac_asegurado,@isexo_asegurado=isexo_asegurado,
            @nparentesco_asegurado=nparentesco_asegurado, @iestado_civil_asegurado=iestado_civil_asegurado
            FROM eePoliza_Salud_Aseg WHERE xrif_asegurado = @caseg

            select @xcliente_asegurado = concat(@xnombre_asegurado, ' ', @xapellido_asegurado)
            EXEC    spCreateMaclient    @icedula_asegurado,     @xrif_asegurado,     @xnombre_asegurado,     @xapellido_asegurado,
            @xcliente_asegurado, @isexo_asegurado, @iestado_civil_asegurado, @fnac_asegurado, null, 58, null,  null,  null,  null,
            @xtelefono_asegurado, @ifuente, 0
                

            IF NOT EXISTS(SELECT * FROM peasegurados WHERE casegurado = @caseg AND cpoliza=@cpoliza) BEGIN
                INSERT INTO peasegurados 
                (
                    cpoliza, fanopol, fmespol, iclaseaseg, casegurado, nmenor, u_version, ccerti,  cproces,  cramo,  cnpoliza,  fnacimiento,
                    csexo, cestado_civil, cparentesco, iestadoren, fdesde, fhasta, falta, fbaja, xobserva, xobsimp, bobsimp, iestado, cprog,
                    ifuente, bok, cerror, fingreso, cusuario, ccategoria, cusuarioauto, ccategoriaauto, fultmod, cusuariomod, ccategoriamod
                ) SELECT 
                    cpoliza, fanopol, fmespol, 'B', cl.cci_rif, 0, '!', 0,  cproces,  cramo,  cnpoliza,  fnacimiento,
                    cl.isexo, cl.iestado_civil, @nparentesco_asegurado, iestadoren, fdesde, fhasta, fdesde, null, null, null, null, 'V', a.cprog,
                    a.ifuente, a.bok, a.cerror, GETDATE(), a.cusuario, a.ccategoria, a.cusuarioauto, a.ccategoriaauto, a.fultmod, a.cusuariomod, a.ccategoriamod
                FROM adpoliza a
                INNER JOIN maclient cl ON cl.cci_rif = @caseg
                -- INNER JOIN eePoliza_Salud_Aseg aseg ON aseg.xrif_asegurado = @caseg
                WHERE cpoliza = @cpoliza
            END

			FETCH NEXT FROM cursito 
			INTO @caseg 
		END 
		CLOSE cursito
		DEALLOCATE cursito
		    
	END

/**********************************************************************************************************************************/
    -- CARGA LOS BENEFICIARIOS SEGUN LA POLIZA 

	IF EXISTS(SELECT * FROM eePoliza_Salud_Ben) BEGIN
        SELECT @nbeneficia = 1

		DECLARE cursito1 CURSOR FOR 
		SELECT DISTINCT(xrif_beneficiario) from eePoliza_Salud_Ben
   
		OPEN cursito1

		FETCH NEXT FROM cursito1
		INTO @cben

		WHILE @@FETCH_STATUS = 0
		BEGIN

		    
            SELECT 
            @icedula_beneficiario=icedula_beneficiario,@xrif_beneficiario=xrif_beneficiario, @xnombre_beneficiario=xnombre_beneficiario,
            @xapellido_beneficiario=xapellido_beneficiario, @fnac_beneficiario=fnac_beneficiario,@isexo_beneficiario=isexo_beneficiario,
            @nparentesco_beneficiario=nparentesco_beneficiario, @pporce = pporce
            FROM eePoliza_Salud_Ben WHERE xrif_beneficiario = @cben

            select @xcliente_beneficiario = concat(@xnombre_beneficiario, ' ', @xapellido_beneficiario)
            EXEC    spCreateMaclient    @icedula_beneficiario,     @xrif_beneficiario,     @xnombre_beneficiario,     @xapellido_beneficiario,
            @xcliente_beneficiario, @isexo_beneficiario, null, @fnac_beneficiario, null, 58, null,  null,  null,  null,
            null, @ifuente, 0

			IF NOT EXISTS(SELECT * FROM pebenefi WHERE casegurado = @cben AND cnpoliza=@cnpoliza) BEGIN
                INSERT INTO pebenefi
                (
                    cpoliza, fanopol, fmespol, iclaseaseg, casegurado, nmenor,  cbeneficia,  nbeneficia,  u_version,  xnombre,  fnacimiento,
                    csexo, cparentesco, cramo, cnpoliza, pporce, fdesde, fhasta, falta,  fbaja,  xobserva,  xobsimp,  bobsimp,  igenera_cid,
                    fingreso, cusuario, ccategoria, cusuarioauto, ccategoriaauto, fultmod, cusuariomod, ccategoriamod
                ) SELECT
                    cpoliza, fanopol, fmespol, 'B', casegurado, 0,  cl.cci_rif,  @nbeneficia,  '!',  xnombre,  fnacimiento,
                    cl.isexo, @nparentesco_beneficiario, cramo, cnpoliza, @pporce, fdesde, fhasta, fdesde,  null,  xobserva,  null,  null,  'N',
                    GETDATE(), a.cusuario, a.ccategoria, a.cusuarioauto, a.ccategoriaauto, a.fultmod, a.cusuariomod, a.ccategoriamod
                FROM adpoliza a
                INNER JOIN maclient cl ON cl.cci_rif = @cben
                WHERE cpoliza = @cpoliza
			END

            SELECT @nbeneficia = @nbeneficia + 1

			FETCH NEXT FROM cursito1 
			INTO @cben 
		END 
		CLOSE cursito1
		DEALLOCATE cursito1
		  
	END

/**********************************************************************************************************************************/
    -- IF (@mcomisionext is null) SELECT @mcomision=0, @mcomisionext=0

    -- IF (@ptasamon IS NULL OR @ptasamon = 0) BEGIN
    --     SELECT @mcomision = 0
    -- END ELSE BEGIN
    --     SELECT @mcomision = @mcomisionext * @ptasamon
    -- END

/***********************************************************************************************************************************/


        -- CALCULO DE FECHAS SEGÚN FRECUENCIA Y CANT. CUOTAS
        SELECT @FDESDE_REC = @FDESDE_POL
        SELECT @FHASTA_REC = CONVERT(datetime, DATEADD(MM, 12 / @cuotas, @FDESDE_POL))

        IF (@ifrecuencia = 'E') BEGIN 
            SELECT @FDESDE_REC = @fdesde
            SELECT @FHASTA_REC = @fhasta
            SELECT @cuotas = 1
        END

        SELECT @nrecibo = 1, @ncuo = 1

        SELECT @IESTADOREC = 'P', @FCOBRO = NULL

        SELECT @msumatabla = @msumaaseg
        

        WHILE (@nrecibo <= @cuotas) BEGIN
            SELECT @nrecibo = @nrecibo + 1 

            SELECT @qcontador = qcontador FROM MACONTADORES WHERE ccontador = 'CRECIBO'
            SELECT @qcontador = @qcontador + 1
            UPDATE MACONTADORES SET qcontador = @qcontador WHERE ccontador = 'CRECIBO'

            SELECT @crecibo = CONVERT(VARCHAR, @cramo) + CONVERT(VARCHAR, FORMAT(@qcontador, '0000000000'))
            
            SELECT @qcontador = qcontador FROM MACONTADORES WHERE ccontador = 'RECIBO'
            SELECT @qcontador = @qcontador + 1
            UPDATE MACONTADORES SET qcontador = @qcontador WHERE ccontador = 'RECIBO'

            SELECT @cnrecibo = CONVERT(VARCHAR, @cramo) + '-' + CONVERT(VARCHAR, FORMAT(@qcontador, '000000000'))

            -- IF (@ncuo > 1) SELECT @FCOBRO = NULL

            -- IF (@FCOBRO IS NULL OR @FCOBRO = '') BEGIN    
            --     SELECT @IESTADOREC = 'P'
            -- END ELSE BEGIN
            --     IF (@FCOBRO IS NOT NULL AND @FCOBRO <> '') BEGIN
            --             SELECT @IESTADOREC = 'C'
            --     END 
            -- END	



            IF EXISTS(SELECT * FROM maplcober_per WHERE cramo=@cramo AND cplan=@cplan) BEGIN
                SELECT @mprima = 0, @mprimaext = 0
                
                DECLARE cursito3 CURSOR FOR 
                select distinct(ccobertura) from maplcober_per where cplan=@cplan AND cramo=@cramo

                OPEN cursito3

                FETCH NEXT FROM cursito3
                INTO @ncobertura

                    WHILE @@FETCH_STATUS = 0
                    BEGIN
                    
                    DECLARE cursito4 CURSOR FOR 
                    select ctablatar, DATEDIFF(YEAR, peasegurados.fnacimiento, GETDATE()) from mapltarifas_per 
                    INNER JOIN peasegurados ON peasegurados.cpoliza = @cpoliza AND peasegurados.cparentesco = mapltarifas_per.cparen
                    WHERE mapltarifas_per.cplan=@cplan AND mapltarifas_per.cramo=@cramo AND mapltarifas_per.ccobertura=@ncobertura
                       
                SELECT @mprimaext_tar = 0
                    OPEN cursito4
                    -- while 1 = 1
                    -- BEGIN

                    FETCH NEXT FROM cursito4
                    INTO @ctablatar, @nedad_asegurado

                        WHILE @@FETCH_STATUS = 0
                        BEGIN

                            

                        IF @msumatabla is null BEGIN
                            SELECT @msumaasegext = msuma FROM mapltabedad_d 
                            WHERE ctablaedad = @ctablatar and @nedad_asegurado >= nedad_min and @nedad_asegurado <= nedad_max;

                            SELECT @mprimaext_tar = mprima + @mprimaext_tar FROM mapltabedad_d 
                            WHERE ctablaedad = @ctablatar and @nedad_asegurado >= nedad_min and @nedad_asegurado <= nedad_max;
                        END ELSE BEGIN
                           IF @cmoneda != 'Bs' BEGIN
    IF @cramo = 9 OR @cramo = 18 BEGIN
        SELECT @msumaasegext = @msumatabla / @ptasamon
        SELECT @msumaaseg = @msumatabla
    END ELSE BEGIN
        SELECT @msumaasegext = @msumatabla
        SELECT @msumaaseg = @msumatabla * @ptasamon
    END
END ELSE BEGIN 
    SELECT @msumaasegext = @msumatabla / @ptasamon
    SELECT @msumaaseg = @msumatabla
END

                            SELECT @mprimaext_tar = @msumaasegext * pprima / 100 FROM mapltabedad_d 
                            WHERE ctablaedad = @ctablatar and @nedad_asegurado >= nedad_min and @nedad_asegurado <= nedad_max;
                        END                        

                    FETCH NEXT FROM cursito4
                    INTO @ctablatar, @nedad_asegurado

                    END 
                    CLOSE cursito4
                    DEALLOCATE cursito4

                    SET @msumaaseg = @msumaasegext * @ptasamon

                    
                    IF ISNULL(@mprimaext, 0) > 0 BEGIN
                        SET @mprimaext_tar = @mprimaext * @cuotas
                    END
                    SET @mprimaext_tar = @mprimaext_tar / @cuotas

                    SET @mdescuentoext_tar = (@mprimaext_tar * @pdescuento_cob / 100) 
                    SET @mrecargoext_tar = (@mprimaext_tar * @precargo_cob / 100)
                    SET @mprimabrutaext_tar = @mprimaext_tar - @mdescuentoext_tar + @mrecargoext_tar

                    SET @mdescuento_tar = @mdescuentoext_tar * @ptasamon
                    SET @mrecargo_tar = @mrecargoext_tar * @ptasamon
                    SET @mprima_tar = @mprimaext_tar * @ptasamon
                    SET @mprimabruta_tar = @mprimabrutaext_tar * @ptasamon

                    INSERT INTO adpoltar
                    (
                        crecibo, ccober, ctarifa, u_version, cramo,  cpoliza,  fanopol,  fmespol,  ccerti,  ccoberimp,  ietiqtarimp,  qordenimp,
                        cnpoliza, cnrecibo, cproces, csucur, cmoneda, ptasamon,  itipoprod,  fdesde,  fhasta,  itiporiesg,  priesg,  msumabruta,
                        msumabrutaext, msumaaseg, msumaasegext, mprima,  mprimaext,  pprima,  bfraded,  mdedu_fran,  mdedu_franext,  pdedu_fran,
                        mdescuento,  mdescuentoext,  pdescuento,  mrecargo,  mrecargoext,  precargo,  mprimabruta,  mprimabrutaext,   pcomision,
                        mcomision, mcomisionext, bprimarea, mprimareas, mprimareasext, istattar,  isuma,  cramoint,  ccoberturaint,  ctarifaint,
                        cprog, ifuente, bok,  cerror,  fingreso,  cusuario,  ccategoria,  cusuarioauto,  ccategoriaauto,  fultmod,  cusuariomod,
                        ccategoriamod
                    )
                    SELECT DISTINCT
                        @crecibo, @ncobertura, f.ctarifa, '!', a.cramo, a.cpoliza, a.fanopol, a.fmespol, 0, f.ccoberimp, f.ietiqtarimp, f.qordenimp,
                        a.cnpoliza, @cnrecibo, a.cproces, a.csucur, a.cmoneda, a.ptasamon, a.itipoprod, @fdesde_rec, @fhasta_rec, 'N', 0, @msumaaseg,
                        @msumaasegext, @msumaaseg, @msumaasegext, @mprima_tar, @mprimaext_tar, fd.pprima, fd.bfraded, fd.mdedu_fran, fd.mdedu_franext, fd.pdedu_fran,
                        @mdescuento_tar, @mdescuentoext_tar, @pdescuento_cob, @mrecargo_tar, @mrecargoext_tar, @precargo_cob,  @mprimabruta_tar, @mprimabrutaext_tar, d.pcomision, 
                        @mprimabruta_tar * d.pcomision / 100, @mprimabrutaext_tar * d.pcomision / 100, f.bprimarea, @mprimabruta_tar, @mprimabrutaext_tar, 'V', f.isuma, f.cramoint, f.ccoberturaint, f.ctarifaint,
                        a.cprog, a.ifuente, 0, 0, GETDATE(), a.cusuario, a.ccategoria, null, null, null, null,
                        null
                    FROM adpoliza a
                    LEFT JOIN maarancel d ON d.cramo = a.cramo and d.iestado = 'V'
                    INNER JOIN mapltarifas_per c ON c.cplan = a.cplan AND c.cramo = a.cramo and c.ccobertura = @ncobertura
                    INNER JOIN matarifa f ON f.ccober = c.ccobertura and f.cramo = a.cramo and f.ctarifa = c.ctarifa
                    INNER JOIN matarifa_d fd ON fd.ccober = c.ccobertura and fd.cramo = a.cramo and fd.ctarifa = c.ctarifa 
                    WHERE a.cpoliza = @cpoliza
                    AND (
                        d.ctarifa = '0' OR d.ctarifa = f.ctarifa
                    ) AND (
                        d.ccober = '0' OR d.ccober = f.ccober
                    ) AND (
                        d.cproductor = '0' OR d.cproductor = a.cproductor
                    ) AND (
                        d.ctipoprod = '0' --OR d.ctipoprod = a.ctipoprod
                    ) AND (
                        d.cplan = '0' OR d.cplan = a.cplan
                    ) AND (
                        d.cramo = '0' OR d.cramo = a.cramo
                    )

                FETCH NEXT FROM cursito3
                INTO @ncobertura 

                END 
                CLOSE cursito3
                DEALLOCATE cursito3

            END 

            -- 
            INSERT INTO adpolcob 
            (
                crecibo, ccober, u_version, cramo, cpoliza, fanopol, fmespol, ccerti,  cnpoliza,  cnrecibo,  cproces,  csucur,  cmoneda,
                ptasamon, fdesde,  fhasta,  itipoprod,  msumaaseg,  msumaasegext,  mprimabruta,  mprimabrutaext,  pcomision,  mcomision,
                mcomisionext,  mprimareas,  mprimareasext,  iestado,  isuma,  ccontrea,  cramorea,  cramopcnd,   ccoberpcnd,   cramoint,
                ccoberturaint, cprog, ifuente, bok, cerror,  fingreso,  cusuario,  ccategoria,  cusuarioauto,  ccategoriaauto,  fultmod,
                cusuariomod, ccategoriamod
            )
            SELECT 
                crecibo, ccober, a.u_version, a.cramo, cpoliza, fanopol, fmespol, ccerti,  cnpoliza,  cnrecibo,  cproces,  csucur,  a.cmoneda,
                ptasamon, fdesde,  fhasta,  itipoprod,  msumaaseg,  msumaasegext,  mprimabruta,  mprimabrutaext,  pcomision,  mcomision,
                mcomisionext,  mprimareas,  mprimareasext,  istattar,  c.isuma,  ccontrea,  cramorea,  cramopcnd,   ccoberpcnd,   c.cramoint,
                c.ccoberturaint, a.cprog, a.ifuente, a.bok, a.cerror,  GETDATE(),  a.cusuario,  a.ccategoria,  a.cusuarioauto,  a.ccategoriaauto,  a.fultmod,
                a.cusuariomod, a.ccategoriamod
            FROM adpoltar a
            INNER JOIN macoberturas C ON C.ccobertura = a.ccober and C.cramo = a.cramo
            WHERE crecibo = @crecibo
            -- 

            -- SET @mprimabrutaext = @mprimaext
            
            -- SELECT @mprimarecext = @mprimabrutaext / @cuotas
            -- SELECT @mprimarec = @mprimabrutaext / @cuotas * @ptasamon

        
            SELECT @mprimarec = SUM(mprimabruta) FROM adpolcob WHERE crecibo = @crecibo
            SELECT @mprimarecext = SUM(mprimabrutaext) FROM adpolcob WHERE crecibo = @crecibo

            -- SET @mprimabrutarecext = @mprimabrutaext / @cuotas
            SET @mdescuentorecext = @mdescuentoext / @cuotas
            SET @mrecargorecext = @mrecargoext / @cuotas
            SET @mmontonetorecext = @mmontonetoext / @cuotas

            -- SET @mprimabrutarec = @mprimabrutaext / @cuotas * @ptasamon
            SET @mdescuentorec = @mdescuentoext / @cuotas * @ptasamon
            SET @mrecargorec = @mrecargoext / @cuotas * @ptasamon
            SET @mmontonetorec = @mmontonetoext / @cuotas * @ptasamon


            -- SELECT @mprima           = @mprima         / @cuotas
            -- SELECT @mprimaext        = @mprimaext      / @cuotas
            
            SELECT @mcomision = @mprimarec * (@pcomision / 100)
	        SELECT @mcomisionext = @mprimarecext * (@pcomision / 100)

            -- SELECT @mcomision = @mprimabrutarec * (@pcomision / 100)
	        -- SELECT @mcomisionext = @mprimabrutarecext * (@pcomision / 100)

            SELECT @msumaaseg = MAX(msumaaseg) FROM adpolcob WHERE crecibo = @crecibo
            SELECT @msumaasegext = MAX(msumaasegext) FROM adpolcob WHERE crecibo = @crecibo

            

         INSERT INTO ADRECIBOS
            (crecibo, u_version,  cnpoliza, cnrecibo, cpoliza, fanopol, fmespol,  cramo, itipoprod, itiponegocio, itipopol, -- 1
            iestadoren,   cpoliza_mae,   ccerti_mae,   itiporec,  imodcobro, cdoccob, csucur, csucurrec,criesgo, ccerti, cproces, -- 2
            cserie_rea, casegurado,   ctenedor,  cbeneficiario,  cacreedor, cfinanciera, cplan, cproductor, ctipoproductor, -- 3
            czonaprod, csupervisor, crecaudador, cregion,ccentserv,cmercado, cprofesion, cactividad, cgrupoecono, cempresa, -- 4
            cpais, cestado,cciudad,ccorregi,cbarriada,czonpos, cmoneda,ptasamon, femision,fdesde,fhasta,fdesde_pol,fhasta_pol, -- 5
            itipoanul, nlote, iestcont, fcobro, iestadorec, ifinanciado,idevolucion, iformadevo,msumabruta, msumabrutaext, -- 6
            msumacoa, msumacoaext, msumaneta, msumanetaext, mprimabruta,mprimabrutaext,mprimacoa,mprimacoaext, pcoa, -- 7
            mprimaneta, mprimanetaext, mprimabruta_emi, mprimacoa_emi, mprimaneta_emi, pretcoa, pcomision, mcomision, mcomisionext,mcompart, mcompartext, mprimareas, -- 9
            mprimareasext,mprimareas_c, mprimareasext_c, mprimareas_n, mprimareasext_n, mpret, mpretext, mpcedida, mpcedidaext, -- 9
            mpfp,mpfpext,potrosrec,motrosrec,motrosrecext,potrosdes,motrosdes,motrosdesext,pgastos,mgastos,mgastosext,potrosgas, -- 10
            motrosgas, motrosgasext, mgemi, mgemiext, pgemi, mmontoneto, mmontonetoext, mimpuesto, pimpuesto, mimpuestoext, -- 11
            mmontorec, mmontorecext, mabono, mabonoext, mmontoapag, mmontoapagext, mprimadev, mprimadevext, mprimadif, mprimadifext, -- 12
            fpago, mpagado, mpagadoext, mpendiente, mpendientext, mpagcoa,mpagcoaext, pinteres, minteres, minteresext, bobsimp, -- 13
            iestadoimp, cforcob, czona_cobro, cbanco, cagenban, itipocta, itarjeta, qcuotas, cprog, ifuente, fingreso, cusuario, -- 14
            ifrecuencia, cnrecibo_rel, cgestor, ctipocanal, ccanalalt, cscanalalt, fdesde_dev, fhasta_dev, -- 15
            pbono, mbono, mbonoext) --16

            SELECT 
            @crecibo,       '!', @cnpoliza,   @cnrecibo, @cpoliza,  @fano, @fmes, @cramo,      'NU',         'DI',      'I', -- 1
            'N',                    0,            0,        'P',        'IN',        0,     1,  1,     3,      0,    @cproces, -- 2
            0,     @xrif_titular,  @xrif_tomador,  @xrif_titular,     0,           0,     @cplan, @CPRODUCTOR,              0, -- 3
            0,          0,           0,           0,           0,           0,           0,          0,         0,          0, -- 4
            0,    0,    0,    0,     0,       0, @cmoneda,@ptasamon, @femision, @FDESDE_REC, @FHASTA_REC, @FDESDE_POL, @FHASTA_POL, -- 5
            'N',          0,          'P',        @FCOBRO,     @IESTADOREC,          0, 'P',  'N', @msumaaseg,  @msumaasegext, -- 6
            0,          0,       @msumaaseg,    @msumaasegext,        @mprimarec,       @mprimarecext,        0,  0,        0, -- 7
            @mprimarec, @mprimarecext, @mprimarec, 0, @mprimarec, 100, @pcomision, @mcomision, @mcomisionext,  0, 0,  @mprimarec, -- 8
            @mprimarecext,             0,             0,        @mprimarec, @mprimarecext, @mprimarec, @mprimarecext, 0,    0, -- 9
            0,         0, @precargo, @mrecargorec, @mrecargorecext, @pdescuento, @mdescuentorec, @mdescuentorecext, 0, 0,  0,     0, -- 10
            0,        0,           0,           0,          0, @mprimarec, @mprimarecext,      0,           0,      0, -- 11
            @mprimarec, @mprimarecext, 0, 0, @mprimarec, @mprimarecext,       0,       0,       0,          0, -- 12
            @fcobro,        0,       0,       0,       0,       0,       0,       0,        0,             0,               0, -- 13
            0,        0,        0,        0,        0,       'N',       'N',       @ncuo, @cprog, @ifuente,      getdate(), 7, -- 14
            @ifrecuencia, @cnrecibo_rel, @cgestor, @ctipocanal, @ccanalalt,     @cscanalalt,     @fdesde_rec,      @fhasta_rec, -- 15
            0, 0, 0 -- 16

            EXEC spGeneraAdpolrea @crecibo

            SELECT @ncuo = @ncuo + 1
            SELECT @FDESDE_REC = CONVERT(DATE, DATEADD(MM, 12 / @cuotas, @FDESDE_REC))
            SELECT @FHASTA_REC = CONVERT(DATE, DATEADD(MM, 12 / @cuotas, @FHASTA_REC))
        END	            

        EXEC spGeneraCoberturasSiniestroPersonas @cpoliza, @fano, @fmes
    END		

    SELECT cpoliza, cnpoliza, cnrecibo, cproces, qcuotas, fanopol, fmespol FROM adrecibos WHERE cpoliza = @cpoliza and qcuotas = 1
 

END
;
