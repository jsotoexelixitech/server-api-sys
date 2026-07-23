-- Pre-emisión RCV auto (Nexus). Mismo contrato de parámetros que sp_pre_emision_Automovil_RCV2.
-- Cadena: speeValidateAutomovilGeneral → spCreateInmaItem → sp_contador_nexus → TMEMISION → sp_emision_automovil_rcv_nexus
-- Referencia: nest-api POST /external/createEmissionAuto (emitLocalAutomobile).

CREATE PROCEDURE [dbo].[sp_pre_emision_automovil_rcv_nexus]
    @cnpoliza_rel       VARCHAR(30)   = NULL,
    @cramo              INT           = NULL,
    @cplan              VARCHAR(10)   = NULL,
    @xcanal_venta       VARCHAR(250)  = NULL,
    @icedula_tomador    CHAR(1)       = NULL,
    @xrif_tomador       NUMERIC(9)    = NULL,
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
    @xrif_titular       NUMERIC(9)    = NULL,
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
    @xmodelo            VARCHAR(60)   = NULL,
    @xversion           VARCHAR(60)   = NULL,
    @fdesde             DATE          = NULL,
    @fhasta             DATE          = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @id INT, @cerror INT, @xerror NVARCHAR(MAX),
            @qcontador NUMERIC(18,0), @csucur INT = 1,
            @crecibo NUMERIC(19), @cnrecibo VARCHAR(30),
            @cnpoliza_cont VARCHAR(30), @ctipo INT,
            @iestado INT, @xestado VARCHAR(30), @xlog VARCHAR(1000),
            @pSuccess BIT, @pErrorMessage NVARCHAR(MAX);

    SET @csucur = 1;

    IF @cproductor = 0
        SET @cproductor = 80080;

    IF @cproductor = 80080 AND @ctipocanal IS NULL
        SET @ctipocanal = 'D';

    IF @cusuario IS NULL
        SET @cusuario = 7;

    SELECT @cramo = cramo FROM maplanes WHERE cplan = @cplan AND iestado = 'V';

    SELECT TOP 1 @ctipo = ctipo FROM macategtr WHERE ccategotr = @ccategoria_uso AND cramo = 18;

    BEGIN TRY
        SELECT TOP 1 @csucur = csucur FROM maclient_api WHERE ifuente_api = @ifuente;
        IF @csucur IS NULL SET @csucur = 1;
    END TRY
    BEGIN CATCH
        SET @xerror = ERROR_MESSAGE();
        THROW 99001, @xerror, 1;
    END CATCH;

    EXEC speeValidateAutomovilGeneral @cplan, @xplaca, @xsercar;

    EXEC spCreateInmaItem
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

    IF @femision IS NULL SET @femision = CAST(GETDATE() AS DATE);
    IF @fdesde IS NULL SET @fdesde = CAST(@femision AS DATE);
    IF @fhasta IS NULL SET @fhasta = DATEADD(YEAR, 1, @fdesde);

    IF @csucur IS NULL SET @csucur = 1;
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
        UPDATE macontadores
        SET @qcontador = qcontador = qcontador + 1
        WHERE ccontador = 'POL_VEH';

        SET @cnpoliza = CONVERT(VARCHAR, @cramo) + '-' + CONVERT(VARCHAR, @csucur) + '-' + FORMAT(@qcontador, '0000000000');
    END;

    IF EXISTS (SELECT 1 FROM adpoliza WHERE cnpoliza = @cnpoliza) THROW 99001, 'Nro. de Póliza Rel ya existente.', 1;

    SET @iestado = 1;
    SET @xestado = 'PENDING';
    SET @xlog = NULL;

    INSERT INTO TMEMISION_AUTOMOVIL_RCV2 (
        cnpoliza_rel, cplan, cramo, xcanal_venta, icedula_tomador, xrif_tomador, xnombre_tomador, xapellido_tomador,
        isexo_tomador, iestado_civil_tomador, fnac_tomador, cestado_tomador, cciudad_tomador, xdireccion_tomador,
        xtelefono_tomador, xcorreo_tomador, icedula_titular, xrif_titular, xnombre_titular, xapellido_titular, isexo_titular,
        iestado_civil_titular, fnac_titular, cestado_titular, cciudad_titular, xdireccion_titular, xtelefono_titular,
        xcorreo_titular, cmarca, cmodelo, cversion, cano, xcolor, xplaca, xsercar, xsermot,
        cpersona_politica, cterm_y_cod, cproductor, ptasamon, mprima, ifrecuencia, femision, corigen_rel, api, method,
        cprog, ifuente, fingreso, cpoliza, cnpoliza, cproces, ccanalalt, cscanalalt, ctipocanal, ccategoria_uso, cmoneda,
        cusuario, ntoneladas, npuestos, precargorcv, iplaca, ptasamon_pago, msumaaseg, xmarca, xmodelo, xversion, fdesde, fhasta,
        iestado, xestado, xlog
    )
    VALUES (
        @cnpoliza_rel, @cplan, @cramo, @xcanal_venta, @icedula_tomador, @xrif_tomador, @xnombre_tomador, @xapellido_tomador,
        @isexo_tomador, @iestado_civil_tomador, @fnac_tomador, @cestado_tomador, @cciudad_tomador, @xdireccion_tomador,
        @xtelefono_tomador, @xcorreo_tomador, @icedula_titular, @xrif_titular, @xnombre_titular, @xapellido_titular,
        @isexo_titular, @iestado_civil_titular, @fnac_titular, @cestado_titular, @cciudad_titular, @xdireccion_titular,
        @xtelefono_titular, @xcorreo_titular, @cmarca, @cmodelo, @cversion, @cano, @xcolor, @xplaca, @xsercar, @xsermot,
        @cpersona_politica, @cterm_y_cod, @cproductor, @ptasamon, @mprima, @ifrecuencia, @femision, @corigen_rel, @api, @method,
        @cprog, @ifuente, @fingreso, @cpoliza, @cnpoliza, @cproces, @ccanalalt, @cscanalalt, @ctipocanal, @ccategoria_uso,
        @cmoneda, @cusuario, @ntoneladas, @npuestos, @precargorcv, @iplaca, @ptasamon_pago, @msumaaseg, @xmarca, @xmodelo,
        @xversion, @fdesde, @fhasta, @iestado, @xestado, @xlog
    );

    SET @id = SCOPE_IDENTITY();

    EXEC sp_emision_automovil_rcv_nexus
        @id = @id,
        @pSuccess = @pSuccess OUTPUT,
        @pErrorMessage = @pErrorMessage OUTPUT;

    IF @pSuccess = 0
    BEGIN
        THROW 99001, @pErrorMessage, 1;
    END;
END;
