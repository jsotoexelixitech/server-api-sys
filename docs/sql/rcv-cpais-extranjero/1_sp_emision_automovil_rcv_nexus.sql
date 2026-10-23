-- =============================================================================
-- 1 de 2 — sp_emision_automovil_rcv_nexus (versión QA 23-oct-2026 + país)
-- APLICAR PRIMERO (el 2 de 2 le envía los parámetros nuevos).
-- Cambios (marcados con [cpais 23-oct-2026]):
--   1) Dos parámetros opcionales al final: @cpais_tomador, @cpais_titular (default NULL).
--   2) Si vienen NULL → 58 (Venezuela), igual que hoy.
--   3) sp_create_maclient_nexus de TITULAR y TOMADOR recibe ese país en lugar del 58 fijo.
-- No se toca la tabla TMEMISION_AUTOMOVIL_RCV2. Conductor y beneficiario siguen con 58.
-- =============================================================================
USE Sis2000;
GO
CREATE OR ALTER PROCEDURE [dbo].[sp_emision_automovil_rcv_nexus]
    @id                  INT,
    @pSuccess            BIT = 0 OUTPUT,
    @pErrorMessage       NVARCHAR(MAX) = NULL OUTPUT,
    -- [cpais 23-oct-2026] País de la dirección (lo envía sp_pre_emision). NULL = 58 Venezuela.
    @cpais_tomador       SMALLINT      = NULL,
    @cpais_titular       SMALLINT      = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @TranStarted BIT = 0;
    IF @@TRANCOUNT = 0
    BEGIN
        BEGIN TRANSACTION;
        SET @TranStarted = 1;
    END;

    BEGIN TRY
        -- Declarar variables locales
        DECLARE
        @cnpoliza_rel varchar(30), @cplan varchar(6), @xcanal_venta varchar(250), @icedula_tomador char(1),
        @xrif_tomador  numeric(13),   @xnombre_tomador   varchar(250),   @xapellido_tomador   varchar(250),   @isexo_tomador   char(1),
        @iestado_civil_tomador  char(1),  @fnac_tomador  date,  @cestado_tomador  varchar(100),   @cciudad_tomador   varchar(100),
        @xdireccion_tomador varchar(1000), @xtelefono_tomador varchar(250), @xcorreo_tomador varchar(250),  @icedula_titular  char(1),
        @xrif_titular  numeric(13),   @xnombre_titular   varchar(250),   @xapellido_titular   varchar(250),   @isexo_titular   char(1),
        @iestado_civil_titular  char(1),  @fnac_titular  date,  @cestado_titular  varchar(100),   @cciudad_titular   varchar(100),
        @xdireccion_titular varchar(1000), @xtelefono_titular varchar(250), @xcorreo_titular varchar(250), @cproductor int,  @ptasamon
        numeric(13,6), @ifrecuencia char(1), @femision date, @api varchar(100), @method varchar(100),  @cprog  char(20),  @ifuente
        char(10), @fingreso datetime, @cpoliza NUMERIC(19), @cnpoliza  varchar(30),  @cproces  NUMERIC(13),  @pcomision  numeric(9,  2),
        @cramo int, @cmoneda CHAR(4),
        @msumaaseg  numeric(18,  2),  @msumaasegext  numeric(18,  2),  @mprima  numeric(18,  2),  @mprimaext  numeric(18,2),   @mcomision
        numeric(18,2),  @mcomisionext  numeric(18,2),  @qcontador   numeric(18,0),
        @crecibo numeric(19), @cnrecibo varchar(30), @qcontadorrec numeric(18,0),
        @contador_polacc numeric(18,0), @fano smallint, @fmes smallint,  @fanopol  smallint,  @fmespol  smallint,  @fdesde_pol  date,
        @fhasta_pol date, @fdesde_rec date, @fhasta_rec date,  @corigen_rel  char(2),  @qrecibo1  numeric(19,0),  @ncuo  int,
        @ifpexceso numeric(18,2), @msfp numeric(18,2), @mpfp numeric(18,2), @mpfpext numeric(18,2), @mpfpret  numeric(18,2),  @mpfpretext
        numeric(18,2), @mcfp numeric(18,2), @mcfpext numeric(18,2), @mifp numeric(18,2), @mifpext numeric(18,2), @msretesp numeric(18,2),
        @msretespext numeric(18,2), @mpretesp numeric(18,2),  @mpretespext  numeric(18,2),  @ctiporamo  int,  @itipocont  char(3),  @pcoa
        numeric(18,8),    @nparentesco_asegurado    tinyint,    @icedula_asegurado    char(1),    @xrif_asegurado     numeric(12,     0),
        @iestado_civil_asegurado char(1), @xnombre_asegurado varchar(250), @xapellido_asegurado varchar(250),  @isexo_asegurado  char(1),
        @fnac_asegurado   date,   @xdireccion_asegurado   varchar(1000),   @xcorreo_asegurado   varchar(250),    @xtelefono_asegurado
        varchar(250), @caseg  numeric(13,0),  @cben  numeric(12,0),  @nparentesco_beneficiario  tinyint,  @icedula_beneficiario  char(1),
        @xrif_beneficiario numeric(13, 0), @xnombre_beneficiario varchar(250), @xapellido_beneficiario varchar(250), @isexo_beneficiario char(1),
        @nbeneficia int, @fnac_beneficiario date,
        @iestado_civil_beneficiario char(1), @cestado_beneficiario varchar(100),
        @cciudad_beneficiario varchar(100), @xdireccion_beneficiario varchar(1000), @xtelefono_beneficiario varchar(250), @xcorreo_beneficiario varchar(250),
        @ncobertura TINYINT, @POL_RAMO VARCHAR(20), @cparen TINYINT, @ctablatar CHAR(10), @mprimaext_cob numeric(18,2), @nedad_asegurado VARCHAR(20),
        @nrecibo int, @fcobro date, @iestadorec CHAR(1), @cnrecibo_rel varchar(30), @xcliente_tomador VARCHAR(250),
        @xcliente_titular VARCHAR(250), @xcliente_asegurado VARCHAR(250), @xcliente_beneficiario VARCHAR(250), @cuotas INT, @cramoint INT,
        @cmarca varchar(3), @cmodelo varchar(3), @cversion  varchar(3),  @cano  SMALLINT,  @xcolor  VARCHAR(60),  @xplaca  VARCHAR(15),
        @xsercar VARCHAR(60), @xsermot VARCHAR(60), @id_inma int, @mvalor numeric(18, 2), @qpuestos INT, @qtoneladas INT,
        @ccanalalt int, @cscanalalt int, @ctipocanal char(1), @idInma INT, @ccategoria_uso INT, @cusuario numeric(13), @ntoneladas INT,
        @npuestos INT, @ctipo INT, @precargorcv NUMERIC(18, 2), @iplaca CHAR(1), @ptasamon_pago NUMERIC(13, 6),
        @xmarca VARCHAR(60), @xmodelo VARCHAR(60), @xversion VARCHAR(60), @fdesde DATE, @fhasta DATE,
        @itipoEmi VARCHAR(10), @coberAdicional VARCHAR(2), @tasaPt NUMERIC(18, 2), @tasaCa NUMERIC(18, 2), @tasaPp NUMERIC(18, 2),
        @icedula_conductor char(1), @xrif_conductor numeric(13), @xnombre_conductor varchar(250), @xapellido_conductor varchar(250),
        @isexo_conductor char(1), @iestado_civil_conductor char(1), @fnac_conductor date, @cestado_conductor varchar(100),
        @cciudad_conductor varchar(100), @xdireccion_conductor varchar(1000), @xtelefono_conductor varchar(250), @xcorreo_conductor varchar(250),
        @itipo_diligencia char(1), @cprofesion_tomador int, @cactividad_tomador int, @cprofesion_titular int, @cactividad_titular int, @cgestor varchar(50);

        -- Leer datos del registro de pre-emisión
        SELECT
        @id = id, @cnpoliza_rel = cnpoliza_rel,  @cplan  =  cplan,  @xcanal_venta  =  xcanal_venta,  @icedula_tomador  =  icedula_tomador,
        @xrif_tomador = xrif_tomador,  @xnombre_tomador  =  xnombre_tomador,  @xapellido_tomador  =  xapellido_tomador,  @isexo_tomador  =
        isexo_tomador, @iestado_civil_tomador = iestado_civil_tomador, @fnac_tomador = fnac_tomador, @cestado_tomador  =  cestado_tomador,
        @cciudad_tomador  =  cciudad_tomador,  @xdireccion_tomador   =   xdireccion_tomador,   @xtelefono_tomador   =   xtelefono_tomador,
        @xcorreo_tomador  =  xcorreo_tomador,  @icedula_titular  =  icedula_titular,  @xrif_titular  =  xrif_titular,  @xnombre_titular  =
        xnombre_titular,   @xapellido_titular   =   xapellido_titular,   @isexo_titular   =   isexo_titular,   @iestado_civil_titular    =
        iestado_civil_titular, @fnac_titular = fnac_titular,  @cestado_titular  =  cestado_titular,  @cciudad_titular  =  cciudad_titular,
        @xdireccion_titular = xdireccion_titular, @xtelefono_titular = xtelefono_titular, @xcorreo_titular = xcorreo_titular,  @cproductor
        = cproductor, @ptasamon = ptasamon, @ifrecuencia = ifrecuencia, @femision = femision, @api =  api,  @method  =  method,  @cprog  =
        cprog, @ifuente = ifuente, @fingreso = fingreso, @cpoliza = cpoliza, @cnpoliza  =  cnpoliza,  @cproces  =  cproces,  @pcomision  =
        pcomision, @cramo = cramo, @mprima = mprima, @mprimaext = mprimaext, @corigen_rel = corigen_rel, @cmarca = cmarca, @cmodelo = cmodelo,
        @cversion = cversion, @cano = cano, @xcolor = xcolor, @xplaca = xplaca, @xsercar = xsercar, @xsermot = xsermot,
        @ccanalalt = ccanalalt, @cscanalalt = cscanalalt, @ctipocanal = ctipocanal, @ccategoria_uso = ccategoria_uso, @cmoneda = cmoneda,
        @cusuario = cusuario, @ntoneladas = ntoneladas, @npuestos = npuestos, @precargorcv = precargorcv, @iplaca = iplaca,
        @msumaaseg = msumaaseg, @ptasamon_pago = ptasamon_pago,
        @xmarca = xmarca, @xmodelo = xmodelo, @xversion = xversion, @fdesde = fdesde, @fhasta = fhasta,
        @icedula_conductor = icedula_conductor, @xrif_conductor = xrif_conductor, @xnombre_conductor = xnombre_conductor,
        @xapellido_conductor = xapellido_conductor, @isexo_conductor = isexo_conductor, @iestado_civil_conductor = iestado_civil_conductor,
        @fnac_conductor = fnac_conductor, @cestado_conductor = cestado_conductor, @cciudad_conductor = cciudad_conductor,
        @xdireccion_conductor = xdireccion_conductor, @xtelefono_conductor = xtelefono_conductor, @xcorreo_conductor = xcorreo_conductor,
        @icedula_beneficiario = icedula_beneficiario, @xrif_beneficiario = xrif_beneficiario, @xnombre_beneficiario = xnombre_beneficiario,
        @xapellido_beneficiario = xapellido_beneficiario, @isexo_beneficiario = isexo_beneficiario, @iestado_civil_beneficiario = iestado_civil_beneficiario,
        @fnac_beneficiario = fnac_beneficiario, @cestado_beneficiario = cestado_beneficiario, @cciudad_beneficiario = cciudad_beneficiario,
        @xdireccion_beneficiario = xdireccion_beneficiario, @xtelefono_beneficiario = xtelefono_beneficiario, @xcorreo_beneficiario = xcorreo_beneficiario,
        @itipoEmi = itipo_emi, @coberAdicional = cober_adicional, @tasaPt = ptasa_pt, @tasaCa = ptasa_ca, @tasaPp = ptasa_pp,
        @itipo_diligencia = itipo_diligencia, @cprofesion_tomador = cprofesion_tomador, @cactividad_tomador = cactividad_tomador,
        @cprofesion_titular = cprofesion_titular, @cactividad_titular = cactividad_titular, @cgestor = cgestor
        FROM TMEMISION_AUTOMOVIL_RCV2 WHERE ID = @ID;

        -- Validación de integridad estricta ACID: Si cpoliza es nulo, no continuar y forzar excepción
        IF (@cpoliza IS NULL)
        BEGIN
            THROW 99001, 'No se ha asignado un número de póliza (cpoliza) válido para el registro de emisión en TMEMISION_AUTOMOVIL_RCV2.', 1;
        END;

        -- Inicializar variables
        SELECT @msfp = 0, @mpfp = 0, @mpfpext = 0, @mpfpret = 0, @mpfpretext = 0,
               @mcfp = 0, @mcfpext = 0, @mifp = 0, @mifpext = 0,
               @msretesp = 0, @msretespext = 0, @mpretesp = 0, @mpretespext = 0,
               @itipocont = 'RET', @pcoa = 0;

        -- Cálculo de cuotas según frecuencia
        IF (@ifrecuencia = 'M') SELECT @cuotas = 12;
        IF (@ifrecuencia = 'T') SELECT @cuotas = 4;
        IF (@ifrecuencia = 'C') SELECT @cuotas = 3;
        IF (@ifrecuencia = 'S') SELECT @cuotas = 2;
        IF (@ifrecuencia = 'A') SELECT @cuotas = 1;
        IF (@ifrecuencia = 'E') SELECT @cuotas = 1;

        -- Productor por defecto
        IF (@cproductor = 0) SELECT @cproductor = 80080;

        -- Moneda y tasa
        IF (@cmoneda IS NULL)
            SELECT @cmoneda = cmoneda FROM maplanes WHERE cramo = @cramo AND cplan = @cplan;

        -- Determinar tasa de cambio real para conversiones
        DECLARE @tasa_cambio NUMERIC(18, 6);
        IF @ptasamon IS NOT NULL AND @ptasamon > 1.0
        BEGIN
            SET @tasa_cambio = @ptasamon;
        END
        ELSE IF @ptasamon_pago IS NOT NULL AND @ptasamon_pago > 1.0
        BEGIN
            SET @tasa_cambio = @ptasamon_pago;
        END
        ELSE
        BEGIN
            SET @tasa_cambio = (SELECT ptasamon FROM mamonedas WHERE cmoneda = '$');
        END

        -- Para bolívares, ptasamon es 1.0, pero ptasamon_pago es la tasa real
        IF TRIM(@cmoneda) IN ('Bs', 'BS')
        BEGIN
            SET @ptasamon = 1.0;
            SET @ptasamon_pago = @tasa_cambio;
        END
        ELSE
        BEGIN
            IF @ptasamon IS NULL OR @ptasamon = 0
            BEGIN
                SET @ptasamon = @tasa_cambio;
            END
            SET @ptasamon_pago = @ptasamon;
        END;

        -- Usuario por defecto
        IF (@cusuario IS NULL) SELECT @cusuario = 7;
        IF (@ccanalalt = 27) SELECT @cusuario = 7;

        -- Fechas por defecto
        IF @femision IS NULL SET @femision = CAST(GETDATE() AS DATE);
        IF @fdesde IS NULL SET @fdesde = CAST(@femision AS DATE);
        IF @fhasta IS NULL SET @fhasta = DATEADD(YEAR, 1, @fdesde);

        SELECT @fano = YEAR(@fdesde), @fmes = MONTH(@fdesde);

        -- Obtener id del vehículo en mainma
        SET @idInma = 0;
        IF (@ntoneladas IS NULL) SELECT @ntoneladas = 0;

        -- Comisión desde arancel
        SELECT @pcomision = pcomision FROM maarancel WHERE cramo = @cramo AND iestado = 'V';

        IF @cproductor = 80080
        BEGIN
            SELECT @mcomision = 0, @mcomisionext = 0, @pcomision = 0;
        END

        SELECT @cramoint = cramoint FROM maramos WHERE cramo = @cramo;

        IF (@cproductor IS NOT NULL AND @cproductor != 80080) SELECT @ctipocanal = 'T';
        IF (@cproductor = 80080 OR @cproductor IS NULL) SELECT @ctipocanal = 'D';
        IF (@ccanalalt IS NOT NULL) SELECT @ctipocanal = 'A';

        IF (@icedula_tomador IS NULL) SELECT @icedula_titular = 'V';
        IF (@icedula_titular IS NULL) SELECT @icedula_titular = 'V';

        -- [cpais 23-oct-2026] País de la dirección; sin dato, Venezuela (58) como siempre.
        SET @cpais_tomador = ISNULL(@cpais_tomador, 58);
        SET @cpais_titular = ISNULL(@cpais_titular, 58);

        -- CREACIÓN DEL CLIENTE TITULAR
        IF (@xrif_titular IS NOT NULL)
        BEGIN
            SELECT @xcliente_titular = CONCAT(@xnombre_titular, ' ', @xapellido_titular);
            EXEC sp_create_maclient_nexus
                @icedula_titular, @xrif_titular, @xnombre_titular, @xapellido_titular, @xcliente_titular,
                @isexo_titular, @iestado_civil_titular, @fnac_titular, @xcorreo_titular, @cpais_titular, -- [cpais 23-oct-2026] antes 58
                @cestado_titular, @cciudad_titular, @xdireccion_titular, NULL, @xtelefono_titular,
                @ifuente, NULL,
                @cprofesion = @cprofesion_titular, @cactividad = @cactividad_titular;
        END

        -- CREACIÓN DEL CLIENTE TOMADOR
        IF (@xrif_tomador IS NOT NULL)
        BEGIN
            SELECT @xcliente_tomador = CONCAT(@xnombre_tomador, ' ', @xapellido_tomador);
            EXEC sp_create_maclient_nexus
                @icedula_tomador, @xrif_tomador, @xnombre_tomador, @xapellido_tomador, @xcliente_tomador,
                @isexo_tomador, @iestado_civil_tomador, @fnac_tomador, @xcorreo_tomador, @cpais_tomador, -- [cpais 23-oct-2026] antes 58
                @cestado_tomador, @cciudad_tomador, @xdireccion_tomador, NULL, @xtelefono_tomador,
                @ifuente, NULL,
                @cprofesion = @cprofesion_tomador, @cactividad = @cactividad_tomador;
        END
        ELSE
        BEGIN
            SELECT @xrif_tomador = @xrif_titular;
        END

        -- CREACIÓN DEL CLIENTE CONDUCTOR
        IF (@xrif_conductor IS NOT NULL AND @xrif_conductor > 0)
        BEGIN
            DECLARE @xcliente_conductor VARCHAR(250) = CONCAT(@xnombre_conductor, ' ', @xapellido_conductor);
            EXEC sp_create_maclient_nexus
                @icedula_conductor, @xrif_conductor, @xnombre_conductor, @xapellido_conductor, @xcliente_conductor,
                @isexo_conductor, @iestado_civil_conductor, @fnac_conductor, @xcorreo_conductor, 58,
                @cestado_conductor, @cciudad_conductor, @xdireccion_conductor, NULL, @xtelefono_conductor,
                @ifuente, NULL;
        END

        -- CREACIÓN DEL CLIENTE BENEFICIARIO
        IF (@xrif_beneficiario IS NOT NULL AND @xrif_beneficiario > 0)
        BEGIN
            SELECT @xcliente_beneficiario = CONCAT(@xnombre_beneficiario, ' ', @xapellido_beneficiario);
            EXEC sp_create_maclient_nexus
                @icedula_beneficiario, @xrif_beneficiario, @xnombre_beneficiario, @xapellido_beneficiario, @xcliente_beneficiario,
                @isexo_beneficiario, @iestado_civil_beneficiario, @fnac_beneficiario, @xcorreo_beneficiario, 58,
                @cestado_beneficiario, @cciudad_beneficiario, @xdireccion_beneficiario, NULL, @xtelefono_beneficiario,
                @ifuente, NULL;
        END

        -- SE CREA LA PÓLIZA Y EL CERTIFICADO DEL VEHÍCULO
        SET @fdesde_pol = @fdesde;
        SET @fhasta_pol = @fhasta;

        INSERT INTO adpoliza
        (cpoliza, fanopol, fmespol, u_version, cramo, cnpoliza, cproces, cplan, itipoprod, itipopol, itiponegocio, clider,
         cpolizalider, istatpol, iestado, itipoingreso, cpoliza_mae, ccerti_mae, itiporen, iperren, ccauren, iestadoren,
         csucur, csucurrec, criesgo, cpolnum, cultcert, casegurado, ctenedor, cbeneficiario, cacreedor, cfinanciera,
         cproductor, czonaprod, cejecta, cmoneda, ptasamon, forigen, fdesde, fhasta, itipoanul, canula, idevolucion,
         iformadevo, qcuotas, ifrecuencia, itipovenprima, iestadovenprima, icalculoedad, igemi, iqgemi, iapligemi,
         mgemi, mgemiext, cprog, ifuente, fingreso, cusuario, ccategoria, cnpoliza_rel, corigen_rel, ccanalalt, cscanalalt, ctipocanal, itipo_diligencia,cgestor)
        VALUES
        (@cpoliza, @fano, @fmes, '!', @cramo, @cnpoliza, @cproces, @cplan, @itipoEmi, 'I', 'DI', 0,
         0, 'V', 'V', 'N', 0, 0, 'A', 1, 0, 'N',
         1, 1, 0, 0, 0, @xrif_titular, @xrif_tomador, @xrif_beneficiario, 0, 0,
         @cproductor, 0, 0, @cmoneda, @ptasamon, @femision, @fdesde_pol, @fhasta_pol, 'N', 0, 'P',
         'N', @cuotas, @ifrecuencia, 'N', 'N', 'R', 'N', 'N', 'N', 0,
         0, 'TEmision_Auto_RCV2', @ifuente, GETDATE(), @cusuario, 1, @cnpoliza_rel, @corigen_rel, @ccanalalt, @cscanalalt, @ctipocanal, @itipo_diligencia,@cgestor);

        -- Obtener datos del vehículo para certificados
        SELECT @id_inma = 0, @mvalor = mvalor, @qpuestos = npasajero
        FROM maanomod
        WHERE cmarca = @cmarca AND cmodelo = @cmodelo AND cversion = @cversion AND cano = @cano;

        SELECT @ctipo = ctipo FROM maanomod
        WHERE cmarca = @cmarca AND cmodelo = @cmodelo AND cversion = @cversion AND cano = @cano;

        IF (@msumaaseg IS NULL OR @msumaaseg <= 0)
        BEGIN
            SELECT TOP 1 @msumaaseg = R.msumabruta
            FROM adrecibos R WITH (NOLOCK)
            WHERE (R.cpoliza = @cpoliza OR R.cnpoliza = TRIM(@cnpoliza_rel)) AND R.msumabruta > 0
            ORDER BY R.crecibo DESC;

            IF (@msumaaseg IS NULL OR @msumaaseg <= 0)
            BEGIN
                SELECT TOP 1 @msumaaseg = V.mvalor
                FROM vhcerti V WITH (NOLOCK)
                WHERE (V.cpoliza = @cpoliza OR V.cnpoliza = TRIM(@cnpoliza_rel)) AND V.mvalor > 0
                ORDER BY V.fanopol DESC;
            END;
        END;

        IF (@mvalor IS NULL OR @mvalor <= 0)
        BEGIN
            SELECT TOP 1 @mvalor = mvalor
            FROM vhcerti
            WHERE (cpoliza = @cpoliza OR cnpoliza = @cnpoliza) AND mvalor > 0
            ORDER BY fanopol DESC;

            IF (@mvalor IS NULL OR @mvalor <= 0)
                SET @mvalor = @msumaaseg;
        END;


        INSERT INTO vhcerti
        (cproces, ccerti, u_version, cramo, cpoliza, cnpoliza, cplan, fanopol, fmespol, casegurado, ctenedor,
         cbeneficiario, cacreedor, ccategovh, cmarca, cmodelo, cano, mvalor, xplaca, xsercar, xsermot, xcolor,
         qpuestos, qtoneladas, istatcer, fdesde, fhasta, fingreso, cusuario, ccategoria, itipoprod, cversion, ctipo, cuso, cprog, ifuente, femision, xconductor)
        VALUES
        (@cproces, 0, '!', @cramo, @cpoliza, @cnpoliza, @cplan, @fano, @fmes, @xrif_titular, @xrif_tomador,
         @xrif_beneficiario, 0, 0, @cmarca, @cmodelo, @cano, COALESCE(@mvalor, 0), @xplaca, @xsercar, @xsermot, @xcolor,
         @qpuestos, @ntoneladas, 'V', @fdesde_pol, @fhasta_pol, GETDATE(), @cusuario, 1, @itipoEmi, @cversion, @ctipo, @ccategoria_uso, @cprog, @ifuente, @femision, @xrif_conductor);



        -- Título/certificado técnico (tetitcer): copia desde adpoliza, ccerti=0
        IF NOT EXISTS (
            SELECT 1 FROM tetitcer WITH (UPDLOCK, HOLDLOCK)
            WHERE cpoliza = @cpoliza AND fanopol = @fano AND fmespol = @fmes AND ccerti = 0
        )
        BEGIN
            INSERT INTO tetitcer
            SELECT
                a.cpoliza, a.fanopol, a.fmespol,
                0,
                a.u_version, a.cramo, a.itipoprod, a.cproces,
                a.casegurado, a.ctenedor,
                0,
                a.cacreedor,
                a.cbeneficiario,
                a.cproductor,
                a.itiporen, a.iestadoren,
                'V',
                a.fdesde, a.fhasta,
                a.forigen,
                a.cprog, a.ifuente, a.bok, a.cerror,
                a.fingreso, a.cusuario, a.ccategoria,
                a.cusuarioauto, a.ccategoriaauto, a.fultmod, a.cusuariomod, a.ccategoriamod
            FROM adpoliza a
            WHERE a.cpoliza = @cpoliza
              AND a.fanopol = @fano
              AND a.fmespol = @fmes;
        END

		-- LLAMADA AL SP QUE GENERA COBERTURAS Y RECIBOS
        EXEC sp_genera_coberturas_recibos_auto_rcv_nexus
            @cpoliza = @cpoliza,
            @ccerti = 0,
            @idInma = @idInma,
            @ifuente = @ifuente,
            @cprog = 'TEmision_Auto_RCV2',
            @ccategoria_uso = @ccategoria_uso,
            @iplaca = @iplaca,
            @npuestos = @npuestos,
            @ntoneladas = @ntoneladas,
            @precargorcv = @precargorcv,
            @cmoneda = @cmoneda,
            @msumaaseg = @msumaaseg,
            @mprima = @mprima,
            @ptasamon = @ptasamon,
            @ptasamon_pago = @ptasamon_pago,
            @coberAdicional = @coberAdicional,
            @tasaPt = @tasaPt,
            @tasaCa = @tasaCa,
            @tasaPp = @tasaPp,
            @cusuario = @cusuario,
            @cproces_in = @cproces;

        -- Hardening: no marcar EMITTED si no hay coberturas/prima
        IF NOT EXISTS (SELECT 1 FROM adpolcob WHERE cpoliza = @cpoliza)
            THROW 99120, 'sp_emision: sp_genera no dejó coberturas en adpolcob; se aborta la emisión.', 1;

        IF NOT EXISTS (
            SELECT 1 FROM adrecibos
            WHERE cpoliza = @cpoliza
              AND ISNULL(mprimabrutaext, 0) > 0
        )
            THROW 99121, 'sp_emision: no hay recibo con prima > 0; se aborta la emisión (rollback).', 1;

        -- Actualizar estado de éxito en TMEMISION_AUTOMOVIL_RCV2
        UPDATE TMEMISION_AUTOMOVIL_RCV2
        SET iestado = 2, xestado = 'EMITTED', xlog = NULL
        WHERE id = @id;

        -- Select de retorno
        SELECT TOP 1 cpoliza, cnpoliza, cnrecibo, cproces, qcuotas, fanopol, fmespol
        FROM adrecibos
        WHERE cpoliza = @cpoliza
        ORDER BY qcuotas ASC, cnrecibo ASC;




        IF @TranStarted = 1 AND @@TRANCOUNT > 0
        BEGIN
            COMMIT TRANSACTION;
        END;

        SET @pSuccess = 1;
        SET @pErrorMessage = NULL;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
        BEGIN
            ROLLBACK TRANSACTION;
        END;

        SET @pSuccess = 0;
        SET @pErrorMessage = ERROR_MESSAGE();

        THROW 99001, @pErrorMessage, 1;
    END CATCH
END;
GO
