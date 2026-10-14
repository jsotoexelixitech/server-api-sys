/*
  Cotización preestablecida para la emisión de Condominio/Hogar (ramos 16 y 38).

  Qué hace:
    - Crea TMEMISION_CONDOMINIO_COB_NEXUS (staging por cobertura con los valores ANUALES ya calculados).
    - sp_pre_emision_condominio_nexus: nuevo parámetro opcional @coberturas (JSON). Si llega, lo guarda en el staging.
    - sp_emision_condominio_nexus: si hay cobertura(s) en el staging usa esos valores (÷ cuotas) en lugar de
      ejecutar sp_calculo_cotizacion_condominio_nexus. Sin staging, el comportamiento es el de siempre.

  Compatibilidad: el parámetro es opcional; las emisiones que no lo envían no cambian.
  Aplicar primero en QA y probar emisión con y sin "cotizacion". Generado desde las definiciones vivas de sis2000_qa.
  Rollback: volver a las definiciones anteriores de ambos procedimientos (no hace falta borrar la tabla).
*/

IF OBJECT_ID('dbo.TMEMISION_CONDOMINIO_COB_NEXUS', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.TMEMISION_CONDOMINIO_COB_NEXUS (
        id                INT IDENTITY(1,1) PRIMARY KEY,
        id_condominio     INT           NOT NULL,
        ccober            CHAR(4)       NOT NULL,
        ctarifa           CHAR(4)       NOT NULL,
        msumaasegext      NUMERIC(18,2) NOT NULL,
        mprimabrutaext    NUMERIC(18,2) NOT NULL,
        mdescuentoext     NUMERIC(18,2) NOT NULL DEFAULT 0,
        mrecargoext       NUMERIC(18,2) NOT NULL DEFAULT 0,
        mprimaext         NUMERIC(18,2) NOT NULL,
        pcomision         NUMERIC(13,6) NOT NULL DEFAULT 0,
        mcomisionext      NUMERIC(18,2) NOT NULL DEFAULT 0,
        fingreso          DATETIME      NOT NULL DEFAULT GETDATE()
    );
    CREATE INDEX IX_TMEMISION_CONDOMINIO_COB_NEXUS_id ON dbo.TMEMISION_CONDOMINIO_COB_NEXUS (id_condominio);
END
GO

-- Portal Hogar/RC: duplicado por cedula + plan + apartamento (certificado) en ramos 28/38.
-- Basado en definicion QA Sis2000 (sp_pre_emision_condominio_nexus).

CREATE OR ALTER PROCEDURE [dbo].[sp_pre_emision_condominio_nexus]
    @cnpoliza_rel       VARCHAR(30)   = NULL,
    @cnrecibo_rel       VARCHAR(30)   = NULL,
    @cplan              VARCHAR(10)   = NULL,
    @cramo              INT           = NULL,
    @xcanal_venta       VARCHAR(250)  = NULL,
    @icedula_tomador    CHAR(1)       = NULL,
    @xrif_tomador       NUMERIC(12,0) = NULL,
    @xnombre_tomador    VARCHAR(250)  = NULL,
    @xapellido_tomador  VARCHAR(250)  = NULL,
    @cestado_tomador    VARCHAR(100)  = NULL,
    @cciudad_tomador    VARCHAR(100)  = NULL,
    @xdireccion_tomador VARCHAR(1000) = NULL,
    @xtelefono_tomador  VARCHAR(250)  = NULL,
    @xcorreo_tomador    VARCHAR(250)  = NULL,
    @fnac_tomador       DATETIME      = NULL,
    @isexo_tomador      CHAR(1)       = NULL,
    @iestado_civil_tomador CHAR(1)    = NULL,
    @icedula_asegurado  CHAR(1)       = NULL,
    @xrif_asegurado     NUMERIC(12,0) = NULL,
    @xnombre_asegurado  VARCHAR(250)  = NULL,
    @xapellido_asegurado VARCHAR(250) = NULL,
    @cestado_asegurado  VARCHAR(100)  = NULL,
    @cciudad_asegurado  VARCHAR(100)  = NULL,
    @xdireccion_asegurado VARCHAR(1000) = NULL,
    @xtelefono_asegurado VARCHAR(250)  = NULL,
    @xcorreo_asegurado  VARCHAR(250)  = NULL,
    @fnac_asegurado     DATETIME      = NULL,
    @isexo_asegurado    CHAR(1)       = NULL,
    @iestado_civil_asegurado CHAR(1)  = NULL,
    @xdirecob           VARCHAR(250)  = NULL,
    @xdireccion         VARCHAR(250)  = NULL,
    @xdescrip1          VARCHAR(250)  = NULL,
    @xdescrip2          VARCHAR(250)  = NULL,
    @xdescrip3          VARCHAR(250)  = NULL,
    @xdescrip4          VARCHAR(250)  = NULL,
    @msumaaseg          NUMERIC(18,2) = NULL,
    @msumaasegext       NUMERIC(18,2) = NULL,
    @mprima             NUMERIC(18,2) = NULL,
    @mprimaext          NUMERIC(18,2) = NULL,
    @pcomision          NUMERIC(18,2) = NULL,
    @mcomision          NUMERIC(18,2) = NULL,
    @mcomisionext       NUMERIC(18,2) = NULL,
    @femision           DATETIME      = NULL,
    @fcobro             DATETIME      = NULL,
    @fdesde             DATETIME      = NULL,
    @fhasta             DATETIME      = NULL,
    @ptasamon           NUMERIC(18,6) = NULL,
    @cproductor         INT           = NULL,
    @ifrecuencia        CHAR(1)       = NULL,
    @fdesde_rec         DATETIME      = NULL,
    @fhasta_rec         DATETIME      = NULL,
    @xfuente            VARCHAR(10)   = NULL,
    @api                VARCHAR(50)   = NULL,
    @method             VARCHAR(50)   = NULL,
    @cpersona_politica  CHAR(1)       = NULL,
    @cterm_y_cod        CHAR(1)       = NULL,
    @corigen_rel        CHAR(2)       = NULL,
    @xcorreo_gestor     VARCHAR(250)  = NULL,
    @ccanalalt          INT           = NULL,
    @cscanalalt         INT           = NULL,
    @cusuario           INT           = NULL,
    @ncertificado       INT           = NULL,
    @napartamento       INT           = NULL,
    @ccerti             INT           = NULL,
    @dispositivos       NVARCHAR(MAX) = NULL,
    @sustancias         NVARCHAR(MAX) = NULL,
    @equipos            NVARCHAR(MAX) = NULL,
    @coberturas         NVARCHAR(MAX) = NULL -- JSON de la cotización preestablecida (valores anuales por cobertura)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @id INT, @error VARCHAR(250), @qcontador NUMERIC(18,0), @csucur INT = 1,
            @cpoliza NUMERIC(19,0), @cnpoliza VARCHAR(30), @crecibo NUMERIC(19,0),
            @cnrecibo VARCHAR(30), @cproces NUMERIC(18,0), @ctipocanal CHAR(1), @cgestor VARCHAR(30),
            @pSuccess BIT, @pErrorMessage NVARCHAR(MAX),
            @certificado_dup INT;

    IF @cplan IS NULL OR NOT EXISTS (SELECT 1 FROM maplanes WHERE cramo = @cramo AND cplan = @cplan AND iestado = 'V')
    BEGIN
        SET @error = 'El plan enviado no se encuentra registrado en el sistema.';
        THROW 99001, @error, 1;
    END

    IF @xrif_tomador IS NULL OR @xrif_tomador = 0 OR @xrif_asegurado IS NULL OR @xrif_asegurado = 0
    BEGIN
        SET @error = 'El RIF/Cedula del tomador y del asegurado son campos obligatorios.';
        THROW 99001, @error, 1;
    END

    IF @femision IS NULL SET @femision = CAST(GETDATE() AS DATE);
    IF @fdesde IS NULL SET @fdesde = CAST(@femision AS DATE);
    IF @fhasta IS NULL SET @fhasta = DATEADD(YEAR, 1, @fdesde);

    SET @certificado_dup = COALESCE(@napartamento, @ncertificado, @ccerti);

    IF @certificado_dup IS NULL AND @cramo IN (28, 38) AND @xdescrip1 IS NOT NULL
    BEGIN
        DECLARE @aptoParse VARCHAR(30);
        DECLARE @idxApto INT = PATINDEX('%APTO.%', UPPER(@xdescrip1));
        IF @idxApto > 0
        BEGIN
            SET @aptoParse = LTRIM(RTRIM(SUBSTRING(@xdescrip1, @idxApto + 5, 30)));
            IF CHARINDEX('.', @aptoParse) > 0
                SET @aptoParse = LEFT(@aptoParse, CHARINDEX('.', @aptoParse) - 1);
            SET @certificado_dup = TRY_CAST(@aptoParse AS INT);
        END
    END

    IF @cramo IN (28, 38)
    BEGIN
        IF @certificado_dup IS NULL OR @certificado_dup <= 0
        BEGIN
            SET @error = 'El numero de apartamento es obligatorio para emitir Hogar/RC por unidad.';
            THROW 99001, @error, 1;
        END

        IF EXISTS (
            SELECT 1
            FROM adpoliza p
            INNER JOIN adpolcob c
                ON c.cpoliza = p.cpoliza
                AND c.fanopol = p.fanopol
                AND c.fmespol = p.fmespol
            WHERE p.casegurado = @xrif_asegurado
              AND p.cramo = @cramo
              AND RTRIM(LTRIM(p.cplan)) = RTRIM(LTRIM(@cplan))
              AND p.fhasta > @fdesde
              AND p.iestado = 'V'
              AND c.ccerti = @certificado_dup
        )
        BEGIN
            SET @error = 'Se ha detectado la existencia de una poliza vigente con el mismo asegurado, plan y apartamento.';
            THROW 99001, @error, 1;
        END
    END
    ELSE IF EXISTS (
        SELECT 1 FROM adpoliza
        WHERE casegurado = @xrif_asegurado AND cramo = @cramo AND cplan = @cplan
          AND fhasta > @fdesde AND iestado = 'V'
    )
    BEGIN
        SET @error = 'Se ha detectado la existencia de una poliza vigente con el mismo asegurado y plan.';
        THROW 99001, @error, 1;
    END

    IF @cproductor = 0 OR @cproductor IS NULL
        SET @cproductor = 80080;

    IF @ccanalalt IS NOT NULL
    BEGIN
        SELECT @ctipocanal = ctipocanal FROM macanalalt WHERE ccanalalt = @ccanalalt;
        SELECT @cgestor = cgestor FROM magestor WHERE ccanalalt = @ccanalalt AND cscanalalt = @cscanalalt;
    END
    ELSE
    BEGIN
        SELECT @cgestor = cgestor, @ctipocanal = ctipocanal, @ccanalalt = ccanalalt, @cscanalalt = cscanalalt
        FROM magestor
        WHERE cgestor = CAST(@cproductor AS VARCHAR(30));

        IF @ctipocanal IS NULL
        BEGIN
            IF @cproductor = 80080 SET @ctipocanal = 'D';
            ELSE SET @ctipocanal = 'T';
        END
    END

    IF @cproductor = 80080 SET @ctipocanal = 'D';

    IF @cusuario IS NULL SET @cusuario = 7;

    SELECT TOP 1 @csucur = csucur FROM maproduc WHERE cproductor = @cproductor;
    IF @csucur IS NULL SET @csucur = 1;

    EXEC sp_contador_nexus
        @cpoliza OUTPUT,
        @cnpoliza OUTPUT,
        @crecibo OUTPUT,
        @cnrecibo OUTPUT,
        @cproces OUTPUT,
        @csucur,
        @fdesde,
        @cramo,
        'POLIZA';

    IF @cnpoliza IS NULL
    BEGIN
        SELECT @qcontador = qcontador FROM macontadores WHERE ccontador = 'POLIZA';
        SET @cnpoliza = CONVERT(VARCHAR, @cramo) + '-' + CONVERT(VARCHAR, @csucur) + '-' + FORMAT(@qcontador, '0000000000');
    END;

    INSERT INTO dbo.TMEMISION_CONDOMINIO_NEXUS (
        cnpoliza_rel, cnrecibo_rel, cplan, cramo, xcanal_venta,
        icedula_tomador, xrif_tomador, xnombre_tomador, xapellido_tomador, cestado_tomador, cciudad_tomador, xdireccion_tomador, xcorreo_tomador, fnac_tomador, xtelefono_tomador, isexo_tomador, iestado_civil_tomador,
        icedula_asegurado, xrif_asegurado, xnombre_asegurado, xapellido_asegurado, cestado_asegurado, cciudad_asegurado, xdireccion_asegurado, xcorreo_asegurado, fnac_asegurado, xtelefono_asegurado, isexo_asegurado, iestado_civil_asegurado,
        xdirecob, xdireccion, xdescrip1, xdescrip2, xdescrip3, xdescrip4,
        msumaaseg, msumaasegext, mprima, mprimaext,
        femision, fcobro, fdesde, fhasta, ptasamon, cproductor, ifrecuencia, fdesde_rec, fhasta_rec, xfuente, api, method,
        pcomision, mcomision, mcomisionext,
        cpersona_politica, cterm_y_cod, corigen_rel, xcorreo_gestor, ctipocanal, ccanalalt, cscanalalt,
        cpoliza, cnpoliza, cproces, iestado, xestado, xlog, cusuario
    )
    VALUES (
        @cnpoliza_rel, @cnrecibo_rel, @cplan, @cramo, @xcanal_venta,
        @icedula_tomador, @xrif_tomador, @xnombre_tomador, @xapellido_tomador, @cestado_tomador, @cciudad_tomador, @xdireccion_tomador, @xcorreo_tomador, @fnac_tomador, @xtelefono_tomador, @isexo_tomador, @iestado_civil_tomador,
        @icedula_asegurado, @xrif_asegurado, @xnombre_asegurado, @xapellido_asegurado, @cestado_asegurado, @cciudad_asegurado, @xdireccion_asegurado, @xcorreo_asegurado, @fnac_asegurado, @xtelefono_asegurado, @isexo_asegurado, @iestado_civil_asegurado,
        @xdirecob, @xdireccion, @xdescrip1, @xdescrip2, @xdescrip3, @xdescrip4,
        @msumaaseg, @msumaasegext, @mprima, @mprimaext,
        @femision, @fcobro, @fdesde, @fhasta, @ptasamon, @cproductor, @ifrecuencia, @fdesde_rec, @fhasta_rec, @xfuente, @api, @method,
        @pcomision, @mcomision, @mcomisionext,
        @cpersona_politica, @cterm_y_cod, @corigen_rel, @xcorreo_gestor, @ctipocanal, @ccanalalt, @cscanalalt,
        @cpoliza, @cnpoliza, @cproces, 1, 'PENDING', NULL, @cusuario
    );

    SET @id = SCOPE_IDENTITY();

    IF @dispositivos IS NOT NULL AND ISJSON(@dispositivos) = 1
    BEGIN
        INSERT INTO dbo.TMEMISION_CONDOMINIO_DISSEG_NEXUS (id_condominio, cdisseg, porcenta)
        SELECT
            @id,
            d.cdisseg,
            m.pdisseg
        FROM OPENJSON(@dispositivos) WITH (cdisseg SMALLINT '$') d
        LEFT JOIN madisseg m ON m.cdisseg = d.cdisseg AND m.cramo = @cramo;
    END

    IF @sustancias IS NOT NULL AND ISJSON(@sustancias) = 1
    BEGIN
        INSERT INTO dbo.TMEMISION_CONDOMINIO_SUSTAC_NEXUS (id_condominio, csustanc, porcenta)
        SELECT
            @id,
            s.csustanc,
            m.porcenta
        FROM OPENJSON(@sustancias) WITH (csustanc SMALLINT '$') s
        LEFT JOIN masustac m ON m.csustanc = s.csustanc AND m.cramo = @cramo;
    END

    IF @equipos IS NOT NULL AND ISJSON(@equipos) = 1
    BEGIN
        INSERT INTO dbo.TMEMISION_CONDOMINIO_EQUIPO_NEXUS (id_condominio, cequipo, xdescrip, anofab, msumasetotloc, msumasetot, cantidad)
        SELECT
            @id,
            ROW_NUMBER() OVER (ORDER BY (SELECT NULL)),
            ISNULL(e.xdesc_l, e.xdesc_c),
            ISNULL(e.anofab_l, e.anofab_c),
            ISNULL(e.msumasetotloc_l, e.msumasetotloc_c),
            ISNULL(e.msumasetot_l, e.msumasetot_c),
            e.cantidad
        FROM OPENJSON(@equipos)
        WITH (
            xdesc_l VARCHAR(255) '$.xdescrip',
            xdesc_c VARCHAR(255) '$.xDescrip',
            anofab_l SMALLINT '$.anofab',
            anofab_c SMALLINT '$.anoFab',
            msumasetotloc_l NUMERIC(18, 2) '$.msumasetotloc',
            msumasetotloc_c NUMERIC(18, 2) '$.msumaSetotLoc',
            msumasetot_l NUMERIC(18, 2) '$.msumasetot',
            msumasetot_c NUMERIC(18, 2) '$.msumaSetot',
            cantidad SMALLINT '$.cantidad'
        ) e;
    END

    -- Cotización preestablecida por el producto: se guarda por cobertura y la emisión NO recalcula.
    IF @coberturas IS NOT NULL AND ISJSON(@coberturas) = 1
    BEGIN
        INSERT INTO dbo.TMEMISION_CONDOMINIO_COB_NEXUS (
            id_condominio, ccober, ctarifa, msumaasegext, mprimabrutaext, mdescuentoext, mrecargoext, mprimaext, pcomision, mcomisionext
        )
        SELECT
            @id, c.ccober, c.ctarifa, c.msumaasegext, c.mprimabrutaext, c.mdescuentoext, c.mrecargoext, c.mprimaext,
            ISNULL(c.pcomision, 0), ISNULL(c.mcomisionext, 0)
        FROM OPENJSON(@coberturas)
        WITH (
            ccober CHAR(4) '$.ccober',
            ctarifa CHAR(4) '$.ctarifa',
            msumaasegext NUMERIC(18, 2) '$.msumaasegext',
            mprimabrutaext NUMERIC(18, 2) '$.mprimabrutaext',
            mdescuentoext NUMERIC(18, 2) '$.mdescuentoext',
            mrecargoext NUMERIC(18, 2) '$.mrecargoext',
            mprimaext NUMERIC(18, 2) '$.mprimaext',
            pcomision NUMERIC(13, 6) '$.pcomision',
            mcomisionext NUMERIC(18, 2) '$.mcomisionext'
        ) c;
    END

    EXEC dbo.sp_emision_condominio_nexus
        @id = @id,
        @pSuccess = @pSuccess OUTPUT,
        @pErrorMessage = @pErrorMessage OUTPUT;

    IF @pSuccess = 0
    BEGIN
        UPDATE dbo.TMEMISION_CONDOMINIO_NEXUS
        SET iestado = 3, xestado = 'ERROR', xlog = SUBSTRING(@pErrorMessage, 1, 1000)
        WHERE id = @id;

        THROW 99001, @pErrorMessage, 1;
    END
    ELSE
    BEGIN
        UPDATE dbo.TMEMISION_CONDOMINIO_NEXUS
        SET iestado = 2, xestado = 'COMPLETED', xlog = 'Emision realizada satisfactoriamente'
        WHERE id = @id;

        SELECT cpoliza, cnpoliza, cproces, iestado, xestado FROM dbo.TMEMISION_CONDOMINIO_NEXUS WHERE id = @id;
    END
END
GO

CREATE OR ALTER PROCEDURE [dbo].[sp_emision_condominio_nexus]
    @id                  INT,
    @pSuccess            BIT = 0 OUTPUT,
    @pErrorMessage       NVARCHAR(MAX) = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Declarar variables locales
        DECLARE
        @cramo INT, @cplan VARCHAR(10), @xcanal_venta VARCHAR(250),
        @icedula_tomador CHAR(1), @xrif_tomador NUMERIC(12, 0), @xnombre_tomador VARCHAR(250), @xapellido_tomador VARCHAR(250),
        @cestado_tomador VARCHAR(100), @cciudad_tomador VARCHAR(100), @xdireccion_tomador VARCHAR(1000), @xcorreo_tomador VARCHAR(250), @fnac_tomador DATETIME, @xtelefono_tomador VARCHAR(250), @isexo_tomador CHAR(1), @iestado_civil_tomador CHAR(1),
        @icedula_asegurado CHAR(1), @xrif_asegurado NUMERIC(12, 0), @xnombre_asegurado VARCHAR(250), @xapellido_asegurado VARCHAR(250),
        @cestado_asegurado VARCHAR(100), @cciudad_asegurado VARCHAR(100), @xdireccion_asegurado VARCHAR(1000), @xcorreo_asegurado VARCHAR(250), @fnac_asegurado DATETIME, @xtelefono_asegurado VARCHAR(250), @isexo_asegurado CHAR(1), @iestado_civil_asegurado CHAR(1),
        @xdirecob VARCHAR(250), @xdireccion VARCHAR(250),
        @xdescrip1 VARCHAR(250), @xdescrip2 VARCHAR(250), @xdescrip3 VARCHAR(250), @xdescrip4 VARCHAR(250),
        @msumaaseg NUMERIC(18,2), @msumaasegext NUMERIC(18,2), @mprima NUMERIC(18,2), @mprimaext NUMERIC(18,2),
        @femision DATETIME, @fcobro DATETIME, @fdesde DATETIME, @fhasta DATETIME, @ptasamon NUMERIC(18,6), @cproductor INT, @ifrecuencia CHAR(1),
        @xfuente VARCHAR(10), @api VARCHAR(50), @method VARCHAR(50),
        @pcomision NUMERIC(18,2), @mcomision NUMERIC(18,2), @mcomisionext NUMERIC(18,2),
        @cpersona_politica CHAR(1), @cterm_y_cod CHAR(1), @corigen_rel CHAR(2), @xcorreo_gestor VARCHAR(250),
        @ctipocanal CHAR(1), @ccanalalt INT, @cscanalalt INT,
        @cpoliza NUMERIC(19,0), @cnpoliza VARCHAR(30), @cproces NUMERIC(18,0), @cusuario INT,
        @cnpoliza_rel VARCHAR(30), @cnrecibo_rel VARCHAR(30),
        
        -- Variables de cálculo de cuotas
        @cuotas INT, @nrecibo INT, @ncuo INT, @crecibo NUMERIC(19,0), @cnrecibo VARCHAR(30), @CERROR INT,
        @fdesde_rec DATETIME, @fhasta_rec DATETIME, @cgestor VARCHAR(50), @csucur INT = 1, @cmoneda CHAR(4),
        @xcliente_tomador VARCHAR(250), @xcliente_asegurado VARCHAR(250), @xcliente_titular VARCHAR(250),
        @dispositivos_json NVARCHAR(MAX), @sustancias_json NVARCHAR(MAX), @cramoint INT;

        -- 2. Cargar datos desde la tabla de staging
        SELECT
            @cramo = cramo, @cplan = cplan, @xcanal_venta = xcanal_venta,
            @icedula_tomador = icedula_tomador, @xrif_tomador = xrif_tomador, @xnombre_tomador = xnombre_tomador, @xapellido_tomador = xapellido_tomador,
            @cestado_tomador = cestado_tomador, @cciudad_tomador = cciudad_tomador, @xdireccion_tomador = xdireccion_tomador, @xcorreo_tomador = xcorreo_tomador, @fnac_tomador = fnac_tomador, @xtelefono_tomador = xtelefono_tomador, @isexo_tomador = isexo_tomador, @iestado_civil_tomador = iestado_civil_tomador,
            @icedula_asegurado = icedula_asegurado, @xrif_asegurado = xrif_asegurado, @xnombre_asegurado = xnombre_asegurado, @xapellido_asegurado = xapellido_asegurado,
            @cestado_asegurado = cestado_asegurado, @cciudad_asegurado = cciudad_asegurado, @xdireccion_asegurado = xdireccion_asegurado, @xcorreo_asegurado = xcorreo_asegurado, @fnac_asegurado = fnac_asegurado, @xtelefono_asegurado = xtelefono_asegurado, @isexo_asegurado = isexo_asegurado, @iestado_civil_asegurado = iestado_civil_asegurado,
            @xdirecob = xdirecob, @xdireccion = xdireccion,
            @xdescrip1 = xdescrip1, @xdescrip2 = xdescrip2, @xdescrip3 = xdescrip3, @xdescrip4 = xdescrip4,
            @msumaaseg = msumaaseg, @msumaasegext = msumaasegext, @mprima = mprima, @mprimaext = mprimaext,
            @femision = femision, @fcobro = fcobro, @fdesde = fdesde, @fhasta = fhasta, @ptasamon = ptasamon, @cproductor = cproductor, @ifrecuencia = ifrecuencia,
            @xfuente = xfuente, @api = api, @method = method,
            @pcomision = pcomision, @mcomision = mcomision, @mcomisionext = mcomisionext,
            @cpersona_politica = cpersona_politica, @cterm_y_cod = cterm_y_cod, @corigen_rel = corigen_rel, @xcorreo_gestor = xcorreo_gestor,
            @ctipocanal = ctipocanal, @ccanalalt = ccanalalt, @cscanalalt = cscanalalt,
            @cpoliza = cpoliza, @cnpoliza = cnpoliza, @cproces = cproces, @cusuario = cusuario
        FROM dbo.TMEMISION_CONDOMINIO_NEXUS
        WHERE id = @id;

        IF @@ROWCOUNT = 0
        BEGIN
            THROW 50001, 'No existe registro en TMEMISION_CONDOMINIO_NEXUS para el @id enviado.', 1;
        END

        -- Determinar cuotas
        IF @ifrecuencia = 'M' SET @cuotas = 12;
        ELSE IF @ifrecuencia = 'T' SET @cuotas = 4;
        ELSE IF @ifrecuencia = 'C' SET @cuotas = 3;
        ELSE IF @ifrecuencia = 'S' SET @cuotas = 2;
        ELSE IF @ifrecuencia = 'A' SET @cuotas = 1;
        ELSE IF @ifrecuencia = 'E' SET @cuotas = 1;
        ELSE SET @cuotas = 1;

        SELECT @cmoneda = cmoneda FROM maplanes WHERE cramo = @cramo AND cplan = @cplan;
        SELECT @cramoint = cramoint FROM maramos WHERE cramo = @cramo;
        SELECT TOP 1 @csucur = csucur FROM maproduc WHERE cproductor = @cproductor;
        IF @csucur IS NULL SET @csucur = 1;

        -- Buscar gestor por correo si no viene de canal directo
        IF @ccanalalt IS NULL
        BEGIN
            SELECT @cgestor = cgestor, @ctipocanal = ctipocanal, @ccanalalt = ccanalalt, @cscanalalt = cscanalalt
            FROM magestor WHERE cgestor = CAST(@cproductor AS VARCHAR(30));
        END
        ELSE
        BEGIN
            SELECT @cgestor = cgestor FROM magestor WHERE ccanalalt = @ccanalalt AND cscanalalt = @cscanalalt;
        END

        -- 3. CREACION DE TOMADOR Y ASEGURADO EN CORE (maclient)
        IF @xrif_asegurado IS NOT NULL
        BEGIN
            SET @xcliente_asegurado = CONCAT(@xnombre_asegurado, ' ', @xapellido_asegurado);
            EXEC dbo.sp_create_maclient_nexus 
                @icedula_asegurado, @xrif_asegurado, @xnombre_asegurado, @xapellido_asegurado, @xcliente_asegurado, @isexo_asegurado,
                @iestado_civil_asegurado, @fnac_asegurado, @xcorreo_asegurado, 58, @cestado_asegurado, @cciudad_asegurado, @xdireccion_asegurado, NULL,
                @xtelefono_asegurado, @xfuente, NULL;
        END

        IF @xrif_tomador IS NOT NULL
        BEGIN
            SET @xcliente_tomador = CONCAT(@xnombre_tomador, ' ', @xapellido_tomador);
            EXEC dbo.sp_create_maclient_nexus 
                @icedula_tomador, @xrif_tomador, @xnombre_tomador, @xapellido_tomador, @xcliente_tomador, @isexo_tomador,
                @iestado_civil_tomador, @fnac_tomador, @xcorreo_tomador, 58, @cestado_tomador, @cciudad_tomador, @xdireccion_tomador, NULL,
                @xtelefono_tomador, @xfuente, NULL;
        END
        ELSE
        BEGIN
            SET @xrif_tomador = @xrif_asegurado;
        END

        -- 4. INSERT EN ADPOLIZA Y SOPOLIZA
        INSERT INTO dbo.adpoliza (
            cpoliza, fanopol, fmespol, u_version, cramo, cnpoliza, cproces, cplan, itipoprod, itipopol, itiponegocio, clider,
            cpolizalider, istatpol, iestado, itipoingreso, cpoliza_mae, ccerti_mae, itiporen, iperren, ccauren, iestadoren,
            csucur, csucurrec, criesgo, cpolnum, cultcert, casegurado, ctenedor, cbeneficiario, cacreedor, cfinanciera, cproductor,
            czonaprod, cejecta, cmoneda, ptasamon, forigen, fdesde, fhasta, itipoanul, canula, idevolucion,
            iformadevo, qcuotas, ifrecuencia, itipovenprima, iestadovenprima, icalculoedad, igemi, iqgemi, iapligemi, mgemi,
            mgemiext, cprog, ifuente, fingreso, cusuario, ccategoria, cnpoliza_rel, corigen_rel, ccanalalt, ctipocanal, cgestor
        )
        VALUES (
            @cpoliza, YEAR(@fdesde), MONTH(@fdesde), '!', @cramo, @cnpoliza, @cproces, @cplan, 'NU', 'I', 'DI', 0,
            0, 'V', 'V', 'N', 0, 0, 'A', 1, 0, 'N',
            @csucur, 1, 0, 0, 0, @xrif_asegurado, @xrif_tomador, @xrif_asegurado, 0, 0, @cproductor,
            0, 0, @cmoneda, @ptasamon, GETDATE(), @fdesde, @fhasta, 'N', 0, 'P',
            'N', @cuotas, @ifrecuencia, 'N', 'N', 'R', 'N', 'N', 'N', 0,
            0, 'spEmisionCondo', @xfuente, GETDATE(), @cusuario, 1, @cnpoliza_rel, @corigen_rel, @ccanalalt, @ctipocanal, @cgestor
        );

        INSERT INTO dbo.sopoliza (
            cproces, u_version, cpoliza, fanopol, fmespol, cramo, cplan, itipoprod, itipopol, itiponegocio, clider, cpolizalider,
            istatpol, iestado, itipoingreso, cpoliza_mae, ccerti_mae, cloteren, itiporen, iperren, ccauren, iestadoren, csucur,
            cpolnum, cultcert, casegurado, ctenedor, cbeneficiario, cacreedor, cfinanciera, cproductor, czonaprod, cejecta,
            cmoneda, ptasamon, forigen, fdesde, fhasta, idevolucion, femisionp, qcuotas, ifrecuencia, itipovenprima, iestadovenprima,
            icalculoedad, bcom_plan, cproducto, isumaman, msumaman, msumamanext, itarifa, igemi, iqgemi, iapligemi, mgemi, mgemiext,
            cprog, ifuente, fingreso, cusuario, ccategoria
        )
        VALUES (
            @cproces, '!', @cpoliza, YEAR(@fdesde), MONTH(@fdesde), @cramo, @cplan, 'SO', 'I', 'DI', 0, 0,
            'V', 'V', 'N', 0, 0, 0, 'A', 1, 0, 'N', @csucur,
            0, 0, @xrif_asegurado, @xrif_tomador, @xrif_asegurado, 0, 0, @cproductor, 0, 0,
            @cmoneda, @ptasamon, GETDATE(), @fdesde, @fhasta, 'P', GETDATE(), @cuotas, @ifrecuencia, 'N', 'N',
            'R', 0, 0, 0, 0, 0, 0, 'N', 'N', 'N', 0, 0,
            'spEmisionCondo', @xfuente, GETDATE(), @cusuario, 1
        );

        -- 5. INSERT EN CERTIFICADOS (tetitcer y rgcerti)
        INSERT INTO dbo.rgcerti (
            cramo, cpoliza, fanopol, fmespol, ccerti, u_version, itipoprod, cproces, casegurado, ctenedor,
            cbeneficiario, xdirecob, xdireccion, istatcer, mvalor, fdesde, fhasta, femision, cantidad, xdescrip1,
            xdescrip2, xdescrip3, xdescrip4, fingreso, cusuario, ccategoria
        )
        VALUES (
            @cramo, @cpoliza, YEAR(@fdesde), MONTH(@fdesde), 0, '!', 'NU', @cproces, @xrif_asegurado, @xrif_tomador,
            @xrif_asegurado, @xdirecob, @xdireccion, 'V', @msumaasegext, @fdesde, @fhasta, GETDATE(), 1, @xdescrip1,
            @xdescrip2, @xdescrip3, @xdescrip4, GETDATE(), @cusuario, 1
        );

        INSERT INTO dbo.tetitcer (
            cpoliza, fanopol, fmespol, ccerti, u_version, cramo, itipoprod, cproces, casegurado, ctenedor,
            cbeneficia, cacreedor, cbeneficiario, cproductor, itiporen, iestadoren, istatcer, fdesde, fhasta,
            femision, cprog, ifuente, bok, cerror, fingreso, cusuario, ccategoria
        )
        VALUES (
            @cpoliza, YEAR(@fdesde), MONTH(@fdesde), 0, '!', @cramo, 'NU', @cproces, @xrif_asegurado, @xrif_tomador,
            0, 0, @xrif_asegurado, @cproductor, 'A', 'N', 'V', @fdesde, @fhasta, GETDATE(), 'spEmisionCondo',
            @xfuente, 0, 0, GETDATE(), @cusuario, 1
        );

        -- 6. MIGRAR DISPOSITIVOS DE SEGURIDAD (tecerdse)
        INSERT INTO dbo.tecerdse (
            cpoliza, fanopol, fmespol, ccerti, cdisseg, u_version, cramo, porcenta, cprog, ifuente, bok, cerror,
            fingreso, cusuario, ccategoria
        )
        SELECT 
            @cpoliza, YEAR(@fdesde), MONTH(@fdesde), 0, cdisseg, '!', @cramo, porcenta, 'spEmisionCondo', @xfuente, 0, 0,
            GETDATE(), @cusuario, 1
        FROM dbo.TMEMISION_CONDOMINIO_DISSEG_NEXUS
        WHERE id_condominio = @id;

        -- 7. MIGRAR SUSTANCIAS PELIGROSAS (tecersust)
        INSERT INTO dbo.tecersust (
            cpoliza, fanopol, fmespol, ccerti, csustanc, u_version, cramo, porcenta, cprog, ifuente, bok,
            fingreso, cusuario, ccategoria
        )
        SELECT 
            @cpoliza, YEAR(@fdesde), MONTH(@fdesde), 0, csustanc, '!', @cramo, porcenta, 'spEmisionCondo', @xfuente, 0,
            GETDATE(), @cusuario, 1
        FROM dbo.TMEMISION_CONDOMINIO_SUSTAC_NEXUS
        WHERE id_condominio = @id;

        -- 8. MIGRAR DESCRIPCION DE EQUIPOS (rgequipo)
        INSERT INTO dbo.rgequipo (
            cramo, cpoliza, fanopol, fmespol, ccerti, cequipo, u_version, itipoprod, cproces, xdescrip, anofab,
            msumasetotloc, msumasetot, istatbie, femision, cantidad, cprog, ifuente, bok, cerror, fingreso, cusuario, ccategoria
        )
        SELECT 
            @cramo, @cpoliza, YEAR(@fdesde), MONTH(@fdesde), 0, cequipo, '!', 'NU', @cproces, xdescrip, anofab,
            msumasetotloc, msumasetot, 'V', GETDATE(), cantidad, 'spEmisionCondo', @xfuente, 0, 0, GETDATE(), @cusuario, 1
        FROM dbo.TMEMISION_CONDOMINIO_EQUIPO_NEXUS
        WHERE id_condominio = @id;

        -- 9. RECONSTRUIR LISTAS EN JSON PARA EL SP DE COTIZACIÓN
        SELECT @dispositivos_json = COALESCE('[' + STRING_AGG(CAST(cdisseg AS VARCHAR), ',') + ']', '[]') 
        FROM dbo.TMEMISION_CONDOMINIO_DISSEG_NEXUS 
        WHERE id_condominio = @id;

        SELECT @sustancias_json = COALESCE('[' + STRING_AGG(CAST(csustanc AS VARCHAR), ',') + ']', '[]') 
        FROM dbo.TMEMISION_CONDOMINIO_SUSTAC_NEXUS 
        WHERE id_condominio = @id;

        -- 10. CONFIGURACIÓN DE CUOTAS Y RECIBOS
        SET @fdesde_rec = @fdesde;
        SET @fhasta_rec = DATEADD(MONTH, 12 / @cuotas, @fdesde_rec);
        SET @nrecibo = 1;
        SET @ncuo = 1;

        CREATE TABLE #temp_calculo_cuota (
            ccober CHAR(4) COLLATE DATABASE_DEFAULT NULL,
            xcobertura VARCHAR(100) COLLATE DATABASE_DEFAULT NULL,
            ctarifa CHAR(4) COLLATE DATABASE_DEFAULT NULL,
            xtarifa VARCHAR(100) COLLATE DATABASE_DEFAULT NULL,
            msumabrutaext NUMERIC(18, 2) NULL,
            msumabruta NUMERIC(18, 2) NULL,
            mprimabrutaext NUMERIC(18, 2) NULL,
            mprimabruta NUMERIC(18, 2) NULL,
            mdescuentoext NUMERIC(18, 2) NULL,
            mdescuento NUMERIC(18, 2) NULL,
            mrecargoext NUMERIC(18, 2) NULL,
            mrecargo NUMERIC(18, 2) NULL,
            mprimaext NUMERIC(18, 2) NULL,
            mprima NUMERIC(18, 2) NULL,
            pprima NUMERIC(13, 6) NULL,
            pcomision NUMERIC(13, 6) NULL,
            mcomisionext NUMERIC(18, 2) NULL,
            mcomision NUMERIC(18, 2) NULL
        );

        -- Cotización preestablecida: si existe en staging se usa tal cual (valores anuales ÷ cuotas); si no, se calcula como antes.
        IF EXISTS (SELECT 1 FROM dbo.TMEMISION_CONDOMINIO_COB_NEXUS WHERE id_condominio = @id)
        BEGIN
            INSERT INTO #temp_calculo_cuota (
                ccober, xcobertura, ctarifa, xtarifa,
                msumabrutaext, msumabruta, mprimabrutaext, mprimabruta,
                mdescuentoext, mdescuento, mrecargoext, mrecargo,
                mprimaext, mprima, pprima, pcomision, mcomisionext, mcomision
            )
            SELECT
                s.ccober, RTRIM(c.xdescripcion_l), s.ctarifa, RTRIM(t.xtarifa),
                s.msumaasegext, s.msumaasegext * @ptasamon,
                s.mprimabrutaext / @cuotas, (s.mprimabrutaext / @cuotas) * @ptasamon,
                s.mdescuentoext / @cuotas, (s.mdescuentoext / @cuotas) * @ptasamon,
                s.mrecargoext / @cuotas, (s.mrecargoext / @cuotas) * @ptasamon,
                s.mprimaext / @cuotas, (s.mprimaext / @cuotas) * @ptasamon,
                ISNULL(td.pprima, 0), s.pcomision,
                s.mcomisionext / @cuotas, (s.mcomisionext / @cuotas) * @ptasamon
            FROM dbo.TMEMISION_CONDOMINIO_COB_NEXUS s
            INNER JOIN dbo.macoberturas c ON c.cramo = @cramo AND c.ccobertura = s.ccober
            INNER JOIN dbo.matarifa t ON t.cramo = @cramo AND t.ccober = s.ccober AND t.ctarifa = s.ctarifa
            OUTER APPLY (
                SELECT TOP 1 d.pprima
                FROM dbo.matarifa_d d
                WHERE d.cramo = @cramo AND d.ccober = s.ccober AND d.ctarifa = s.ctarifa AND d.iestado = 'V'
                ORDER BY d.fdesde DESC
            ) td
            WHERE s.id_condominio = @id;
        END
        ELSE
        BEGIN
            -- Cargar el cálculo inicial en la tabla temporal (este cálculo ya está dividido entre @cuotas)
            INSERT INTO #temp_calculo_cuota
            EXEC dbo.sp_calculo_cotizacion_condominio_nexus 
                @cramo = @cramo,
                @cplan = @cplan,
                @msumaasegext = @msumaasegext,
                @ifrecuencia = @ifrecuencia,
                @ptasamon = @ptasamon,
                @dispositivos = @dispositivos_json,
                @sustancias = @sustancias_json,
                @is_emision = 1;
        END

        WHILE (@nrecibo <= @cuotas) 
        BEGIN
            -- Generar número correlativo de recibo (crecibo y cnrecibo)
            EXEC dbo.sp_calcula_num_contador_nexus @cramo, 'I', @csucur, 0, 7, @cnrecibo OUTPUT, @crecibo OUTPUT, @CERROR OUTPUT;

            IF @CERROR IS NOT NULL AND @CERROR <> 0
            BEGIN
                DECLARE @err_contador VARCHAR(100) = 'Fallo al obtener correlativos de recibos en sp_calcula_num_contador_nexus. Error: ' + CAST(@CERROR AS VARCHAR(10));
                THROW 99001, @err_contador, 1;
            END

            -- Cargar tarifas por cuota (adpoltar)
            INSERT INTO dbo.adpoltar (
                crecibo, ccober, ctarifa, u_version, cramo, cpoliza, fanopol, fmespol, ccerti, ccoberimp, ietiqtarimp, qordenimp,
                cnpoliza, cnrecibo, cproces, csucur, cmoneda, ptasamon, itipoprod, fdesde, fhasta, itiporiesg, priesg, msumabruta,
                msumabrutaext, msumaaseg, msumaasegext, mprima, mprimaext, pprima, bfraded, mdedu_fran, mdedu_franext, pdedu_fran,
                mdescuento, mdescuentoext, pdescuento, mrecargo, mrecargoext, precargo, mprimabruta, mprimabrutaext, pcomision,
                mcomision, mcomisionext, bprimarea, mprimareas, mprimareasext, istattar, isuma, cramoint, ccoberturaint, ctarifaint,
                cprog, ifuente, bok, cerror, fingreso, cusuario, ccategoria, cusuarioauto, ccategoriaauto, fultmod, cusuariomod,
                ccategoriamod
            )
            SELECT 
                @crecibo, tc.ccober, tc.ctarifa, '!', @cramo, @cpoliza, YEAR(@fdesde), MONTH(@fdesde), 0, c.ccoberpcnd, 'N', 1,
                @cnpoliza, @cnrecibo, @cproces, @csucur, @cmoneda, @ptasamon, 'NU', @fdesde_rec, @fhasta_rec, 'N', 0, tc.msumabruta,
                tc.msumabrutaext, tc.msumabruta, tc.msumabrutaext, tc.mprima, tc.mprimaext, tc.pprima, d.bfraded, d.mdedu_fran, d.mdedu_franext, d.pdedu_fran,
                tc.mdescuento, tc.mdescuentoext, tc.mdescuentoext, tc.mrecargo, tc.mrecargoext, tc.mrecargoext, tc.mprimabruta, tc.mprimabrutaext, tc.pcomision,
                tc.mcomision, tc.mcomisionext, f.bprimarea, tc.mprima, tc.mprimaext, 'V', c.isuma, c.cramoint, c.ccoberturaint, c.ccoberturaint,
                'spEmisionCondo', @xfuente, 0, 0, GETDATE(), @cusuario, 1, NULL, NULL, NULL, NULL, NULL
            FROM #temp_calculo_cuota tc
            INNER JOIN dbo.macoberturas c ON c.ccobertura = tc.ccober AND c.cramo = @cramo
            INNER JOIN dbo.matarifa_d d ON d.ccober = tc.ccober AND d.cramo = @cramo AND d.ctarifa = tc.ctarifa
            INNER JOIN dbo.matarifa f ON f.cramo = @cramo AND f.ccober = tc.ccober AND f.ctarifa = tc.ctarifa;

            -- Cargar coberturas por cuota (adpolcob)
            INSERT INTO dbo.adpolcob (
                crecibo, ccober, u_version, cramo, cpoliza, fanopol, fmespol, ccerti, cnpoliza, cnrecibo, cproces, csucur, cmoneda,
                ptasamon, fdesde, fhasta, itipoprod, msumaaseg, msumaasegext, mprimabruta, mprimabrutaext, pcomision, mcomision,
                mcomisionext, mprimareas, mprimareasext, iestado, isuma, ccontrea, cramorea, cramopcnd, ccoberpcnd, cramoint,
                ccoberturaint, cprog, ifuente, bok, cerror, fingreso, cusuario, ccategoria, cusuarioauto, ccategoriaauto, fultmod,
                cusuariomod, ccategoriamod
            )
            SELECT 
                @crecibo, a.ccober, a.u_version, a.cramo, a.cpoliza, a.fanopol, a.fmespol, a.ccerti, a.cnpoliza, a.cnrecibo, a.cproces, a.csucur, a.cmoneda,
                a.ptasamon, a.fdesde, a.fhasta, a.itipoprod, a.msumaaseg, a.msumaasegext, a.mprimabruta, a.mprimabrutaext, a.pcomision, a.mcomision,
                a.mcomisionext, a.mprimareas, a.mprimareasext, a.istattar, c.isuma, c.ccontrea, c.cramorea, c.cramopcnd, c.ccoberpcnd, c.cramoint,
                c.ccoberturaint, a.cprog, a.ifuente, a.bok, a.cerror, GETDATE(), a.cusuario, a.ccategoria, a.cusuarioauto, a.ccategoriaauto, a.fultmod,
                a.cusuariomod, a.ccategoriamod
            FROM dbo.adpoltar a
            INNER JOIN dbo.macoberturas c ON c.ccobertura = a.ccober AND c.cramo = a.cramo
            WHERE a.crecibo = @crecibo;

            -- Obtener totales calculados de la cuota
            DECLARE 
            @sum_msumaaseg NUMERIC(18,2), @sum_msumaasegext NUMERIC(18,2),
            @sum_mprimabruta NUMERIC(18,2), @sum_mprimabrutaext NUMERIC(18,2),
            @sum_mcomision NUMERIC(18,2), @sum_mcomisionext NUMERIC(18,2),
            @avg_pcomision NUMERIC(13,6),
            @sum_mprimaneta NUMERIC(18,2), @sum_mprimanetaext NUMERIC(18,2);

            SELECT 
                @sum_msumaaseg = MAX(msumaaseg),
                @sum_msumaasegext = MAX(msumaasegext),
                @sum_mprimabruta = SUM(mprimabruta),
                @sum_mprimabrutaext = SUM(mprimabrutaext),
                @sum_mcomision = SUM(mcomision),
                @sum_mcomisionext = SUM(mcomisionext),
                @avg_pcomision = AVG(pcomision)
            FROM dbo.adpoltar
            WHERE crecibo = @crecibo;

            SET @sum_mprimaneta = @sum_mprimabruta;
            SET @sum_mprimanetaext = @sum_mprimabrutaext;

            -- Cargar la facturación en recibos (ADRECIBOS)
            INSERT INTO dbo.ADRECIBOS (
                crecibo, u_version, cnpoliza, cnrecibo, cpoliza, fanopol, fmespol, cramo, itipoprod, itiponegocio, itipopol,
                iestadoren, cpoliza_mae, ccerti_mae, itiporec, imodcobro, cdoccob, csucur, csucurrec, criesgo, ccerti, cproces,
                cserie_rea, casegurado, ctenedor, cbeneficiario, cacreedor, cfinanciera, cplan, cproductor, ctipoproductor,
                czonaprod, csupervisor, crecaudador, cregion, ccentserv, cmercado, cprofesion, cactividad, cgrupoecono, cempresa,
                cpais, cestado, cciudad, ccorregi, cbarriada, czonpos, cmoneda, ptasamon, femision, fdesde, fhasta, fdesde_pol, fhasta_pol,
                itipoanul, nlote, iestcont, fcobro, iestadorec, ifinanciado, idevolucion, iformadevo, msumabruta, msumabrutaext,
                msumacoa, msumacoaext, msumaneta, msumanetaext, mprimabruta, mprimabrutaext, mprimacoa, mprimacoaext, pcoa,
                mprimaneta, mprimanetaext, pretcoa, pcomision, mcomision, mcomisionext, mcompart, mcompartext, mprimareas,
                mprimareasext, mprimareas_c, mprimareasext_c, mprimareas_n, mprimareasext_n, mpret, mpretext, mpcedida, mpcedidaext,
                mpfp, mpfpext, potrosrec, motrosrec, motrosrecext, potrosdes, motrosdes, motrosdesext, pgastos, mgastos, mgastosext, potrosgas,
                motrosgas, motrosgasext, mgemi, mgemiext, pgemi, mmontoneto, mmontonetoext, mimpuesto, pimpuesto, mimpuestoext,
                mmontorec, mmontorecext, mabono, mabonoext, mmontoapag, mmontoapagext, mprimadev, mprimadevext, mprimadif, mprimadifext,
                fpago, mpagado, mpagadoext, mpendiente, mpendientext, mpagcoa, mpagcoaext, pinteres, minteres, minteresext, bobsimp,
                iestadoimp, cforcob, czona_cobro, cbanco, cagenban, itipocta, itarjeta, qcuotas, cprog, ifuente, fingreso, cusuario,
                ifrecuencia, cnrecibo_rel, cgestor, ccanalalt, cscanalalt, ctipocanal, fdesde_dev, fhasta_dev, pbono, mbono, mbonoext
            )
            VALUES (
                @crecibo, '!', @cnpoliza, @cnrecibo, @cpoliza, YEAR(@fdesde), MONTH(@fdesde), @cramo, 'NU', 'DI', 'I',
                'N', 0, 0, 'P', 'IN', 0, @csucur, 1, 3, 0, @cproces,
                0, @xrif_asegurado, @xrif_tomador, @xrif_asegurado, 0, 0, @cplan, @cproductor, 0,
                0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                58, 0, 0, 0, 0, 0, @cmoneda, @ptasamon, GETDATE(), @fdesde_rec, @fhasta_rec, @fdesde, @fhasta,
                'N', 0, 'P', NULL, 'P', 0, 'P', 'N', @sum_msumaaseg, @sum_msumaasegext,
                0, 0, @sum_msumaaseg, @sum_msumaasegext, @sum_mprimabruta, @sum_mprimabrutaext, 0, 0, 0,
                @sum_mprimaneta, @sum_mprimanetaext, 0, @avg_pcomision, @sum_mcomision, @sum_mcomisionext, 0, 0, @sum_mprimaneta,
                @sum_mprimanetaext, 0, 0, @sum_mprimaneta, @sum_mprimanetaext, 0, 0, 0, 0,
                0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0, 0, @sum_mprimaneta, @sum_mprimanetaext, 0, 0, 0,
                @sum_mprimaneta, @sum_mprimanetaext, 0, 0, @sum_mprimaneta, @sum_mprimanetaext, 0, 0, 0, 0,
                NULL, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0, 0, 'N', 'N', @ncuo, 'spEmisionCondo', @xfuente, GETDATE(), @cusuario,
                @ifrecuencia, @cnrecibo_rel, @cgestor, @ccanalalt, @cscanalalt, @ctipocanal, @fdesde_rec, @fhasta_rec, 0, 0, 0
            );

            -- Generar el Reaseguro (adpolrea)
            IF OBJECT_ID('dbo.sp_genera_adpolrea_nexus') IS NOT NULL AND @crecibo IS NOT NULL
			    EXEC dbo.sp_genera_adpolrea_nexus @crecibo;
            --EXEC dbo.sp_genera_adpolrea_nexus @crecibo;

            -- Siguiente cuota
            SET @nrecibo = @nrecibo + 1;
            SET @ncuo = @ncuo + 1;
            SET @fdesde_rec = @fhasta_rec;
            SET @fhasta_rec = DATEADD(MONTH, 12 / @cuotas, @fdesde_rec);
        END;

        DROP TABLE #temp_calculo_cuota;

        COMMIT TRANSACTION;

        SET @pSuccess = 1;
        SET @pErrorMessage = NULL;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        SET @pSuccess = 0;
        SET @pErrorMessage = 'Error en sp_emision_condominio_nexus (Línea ' + CAST(ERROR_LINE() AS VARCHAR(10)) + '): ' + ERROR_MESSAGE() + 
                             ' [cpoliza=' + CAST(ISNULL(@cpoliza, 0) AS VARCHAR) + 
                             ', cramo=' + CAST(ISNULL(@cramo, 0) AS VARCHAR) + 
                             ', cproces=' + CAST(ISNULL(@cproces, 0) AS VARCHAR) + 
                             ', xrif_aseg=' + CAST(ISNULL(@xrif_asegurado, 0) AS VARCHAR) + 
                             ', xrif_tom=' + CAST(ISNULL(@xrif_tomador, 0) AS VARCHAR) + 
                             ', cprod=' + CAST(ISNULL(@cproductor, 0) AS VARCHAR) + 
                             ', xfuente=' + ISNULL(@xfuente, 'NULL') + 
                             ', cusuario=' + CAST(ISNULL(@cusuario, 0) AS VARCHAR) + ']';
    END CATCH;
END;
GO
