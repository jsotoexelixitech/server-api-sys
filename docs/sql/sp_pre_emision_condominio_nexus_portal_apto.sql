-- Portal Hogar/RC: duplicado por cedula + plan + apartamento (certificado) en ramos 28/38.
-- Basado en definicion QA Sis2000 (sp_pre_emision_condominio_nexus).

ALTER PROCEDURE [dbo].[sp_pre_emision_condominio_nexus]
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
    @equipos            NVARCHAR(MAX) = NULL
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
