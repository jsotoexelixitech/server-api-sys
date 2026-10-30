-- =============================================================================
-- 3 de 3 - sp_pre_emision_automovil_rcv_nexus (versión QA 29-oct-2026 + profesión y ocupación por separado)
-- APLICAR DESPUÉS del 2 de 3 (sp_emision_automovil_rcv_nexus debe aceptar los parámetros).
-- Cambios anteriores marcados con [cpais 23-oct-2026] (país de la dirección).
-- Cambios de esta versión (marcados con [ocupacion 29-oct-2026]):
--   1) Tres parámetros opcionales al final: @cocupacion_tomador, @cocupacion_titular, @bocupacion_separada.
--   2) @bocupacion_separada = 1: @cprofesion_* es la PROFESIÓN (maprofes) y @cocupacion_* la OCUPACIÓN
--      (maocupac). Debida diligencia simplificada acepta profesión, ocupación o actividad.
--   3) Herencia tomador <-> titular también de la ocupación, y se pasa todo a sp_emision_automovil_rcv_nexus.
-- Sin los parámetros nuevos (default 0) el resultado es el de hoy. No se toca TMEMISION_AUTOMOVIL_RCV2.
-- =============================================================================
CREATE OR ALTER PROCEDURE [dbo].[sp_pre_emision_automovil_rcv_nexus]
    -- Parámetros que corresponden a las columnas de la tabla eePoliza_Automovil_RCV2
    @cnpoliza_rel       VARCHAR(30)   = NULL,
    @cramo              INT           = NULL,
    @cplan              VARCHAR(10)   = NULL,
    @xcanal_venta       VARCHAR(250)  = NULL,
    @icedula_tomador    CHAR(1)       = NULL,
    @xrif_tomador       NUMERIC(13,0)    = NULL,
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
    @xrif_titular       NUMERIC(13,0)    = NULL,
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
    @icedula_conductor  CHAR(1)       = NULL,
    @xrif_conductor     NUMERIC(13,0)    = NULL,
    @xnombre_conductor  VARCHAR(250)  = NULL,
    @xapellido_conductor VARCHAR(250) = NULL,
    @isexo_conductor    CHAR(1)       = NULL,
    @iestado_civil_conductor CHAR(1)  = NULL,
    @fnac_conductor     DATE          = NULL,
    @cestado_conductor  VARCHAR(100)  = NULL,
    @cciudad_conductor  VARCHAR(100)  = NULL,
    @xdireccion_conductor VARCHAR(1000) = NULL,
    @xtelefono_conductor VARCHAR(250) = NULL,
    @xcorreo_conductor   VARCHAR(250) = NULL,
    @icedula_beneficiario CHAR(1)     = NULL,
    @xrif_beneficiario  NUMERIC(13,0)   = NULL,
    @xnombre_beneficiario VARCHAR(250) = NULL,
    @xapellido_beneficiario VARCHAR(250) = NULL,
    @isexo_beneficiario  CHAR(1)      = NULL,
    @iestado_civil_beneficiario CHAR(1) = NULL,
    @fnac_beneficiario   DATE         = NULL,
    @cestado_beneficiario VARCHAR(100) = NULL,
    @cciudad_beneficiario VARCHAR(100) = NULL,
    @xdireccion_beneficiario VARCHAR(1000) = NULL,
    @xtelefono_beneficiario VARCHAR(250) = NULL,
    @xcorreo_beneficiario VARCHAR(250) = NULL,
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
    @xmodelo             VARCHAR(60)   = NULL,
    @xversion           VARCHAR(60)   = NULL,
    @fdesde             DATE          = NULL,
    @fhasta             DATE          = NULL,
    @itipoEmi           VARCHAR(10)   = 'NU',
    @coberAdicional     VARCHAR(2)    = 'RC',
    @tasaPt             NUMERIC(18,2) = 0,
    @tasaCa             NUMERIC(18,2) = 0,
    @tasaPp             NUMERIC(18,2) = 0,
    @itipo_diligencia     CHAR(1)       = NULL,
    @cprofesion_tomador   INT           = NULL,
    @cactividad_tomador   INT           = NULL,
    @cprofesion_titular   INT           = NULL,
    @cactividad_titular   INT           = NULL,
    @cgestor             VARCHAR(60) = NULL,
    -- [cpais 23-oct-2026] País de la dirección (57 Colombia en placa extranjera). NULL = 58 Venezuela.
    @cpais_tomador       SMALLINT      = NULL,
    @cpais_titular       SMALLINT      = NULL,
    -- [ocupacion 29-oct-2026] Ocupación (maocupac) aparte de la profesión (maprofes).
    -- 0 = @cprofesion_* trae la ocupación, como hasta ahora.
    @cocupacion_tomador  SMALLINT      = NULL,
    @cocupacion_titular  SMALLINT      = NULL,
    @bocupacion_separada BIT           = 0
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Control de transacción atómica
    DECLARE @TranStarted BIT = 0;
    IF @@TRANCOUNT = 0
    BEGIN
        BEGIN TRANSACTION;
        SET @TranStarted = 1;
    END;

    BEGIN TRY
        -- Variables locales
        DECLARE @id INT, @cerror INT, @xerror NVARCHAR(MAX),
                @qcontador NUMERIC(18,0), @csucur INT = 1,
                @crecibo NUMERIC(19), @cnrecibo VARCHAR(30),
                @cnpoliza_cont VARCHAR(30), @ctipo INT,
                @iestado INT, @xestado VARCHAR(30), @xlog VARCHAR(1000),
                @pSuccess BIT, @pErrorMessage NVARCHAR(MAX),
                --@cgestor VARCHAR(30),
    			@mprima_servicio NUMERIC(18,2),
    			@puestos_calc INT,
                @uso_calc INT;

        SET @csucur = 1;

        -- 1. Validaciones preventivas del Tipo de Emisión (itipoEmi)
        IF @itipoEmi IS NULL OR TRIM(@itipoEmi) = ''
            SET @itipoEmi = 'NU';

        IF UPPER(TRIM(@itipoEmi)) NOT IN ('NU', 'SO', 'RE', 'RM')
        BEGIN
            THROW 99001, 'Tipo de emisión inválido. Debe ser NU (Nueva), SO (Solicitud), RE (Renovación) o RM (Reemisión).', 1;
        END;

        -- Auto-detección de coberturas adicionales si se reciben tasas de casco
        IF (@tasaCa > 0 OR @tasaPt > 0) AND (@coberAdicional IS NULL OR @coberAdicional = 'RC')
        BEGIN
            IF @tasaCa > 0 SET @coberAdicional = 'CA';
            ELSE IF @tasaPt > 0 SET @coberAdicional = 'PT';
        END;


        -- Circular SAA-02-1079-2026 - debida diligencia
        IF @itipo_diligencia IS NULL
            SET @itipo_diligencia = 'C'; -- legacy: default conservador DDC

        IF @itipo_diligencia NOT IN ('S', 'C')
            THROW 99010, 'itipo_diligencia inválido. Use S (simplificada) o C (completa).', 1;

        IF @itipo_diligencia = 'S' AND @icedula_tomador IN ('J', 'G', 'C')
            THROW 99011, 'Persona jurídica no aplica debida diligencia simplificada (Circular SAA-02-1079-2026).', 1;

        IF @itipo_diligencia = 'S'
        BEGIN
            IF NULLIF(LTRIM(RTRIM(@xdireccion_tomador)), '') IS NULL
                THROW 99012, 'Debida diligencia simplificada requiere dirección del tomador.', 1;
            IF @cprofesion_tomador IS NULL AND @cactividad_tomador IS NULL
               AND (ISNULL(@bocupacion_separada, 0) = 0 OR @cocupacion_tomador IS NULL) -- [ocupacion 29-oct-2026]
                THROW 99013, 'Debida diligencia simplificada requiere profesión o actividad económica del tomador.', 1;
        END;

        -- [ocupacion 29-oct-2026] Sin la ocupación aparte no se envía nada nuevo a la emisión.
        SET @bocupacion_separada = ISNULL(@bocupacion_separada, 0);
        IF @bocupacion_separada = 0
        BEGIN
            SET @cocupacion_tomador = NULL;
            SET @cocupacion_titular = NULL;
        END;
        IF (@cocupacion_tomador IS NULL AND @cocupacion_titular IS NOT NULL)
            SET @cocupacion_tomador = @cocupacion_titular;
        IF (@cocupacion_titular IS NULL AND @cocupacion_tomador IS NOT NULL)
            SET @cocupacion_titular = @cocupacion_tomador;

        -- Herencia profesión/actividad tomador  titular
        IF (@cprofesion_tomador IS NULL AND @cprofesion_titular IS NOT NULL)
            SET @cprofesion_tomador = @cprofesion_titular;
        IF (@cprofesion_titular IS NULL AND @cprofesion_tomador IS NOT NULL)
            SET @cprofesion_titular = @cprofesion_tomador;
        IF (@cactividad_tomador IS NULL AND @cactividad_titular IS NOT NULL)
            SET @cactividad_tomador = @cactividad_titular;
        IF (@cactividad_titular IS NULL AND @cactividad_tomador IS NOT NULL)
            SET @cactividad_titular = @cactividad_tomador;

        -- 2. Asignación y herencia en cascada de actores (Tomador, Titular/Asegurado, Beneficiario)
        IF (@xrif_tomador IS NULL OR @xrif_tomador = 0) AND (@xrif_titular IS NOT NULL AND @xrif_titular > 0)
        BEGIN
            SET @xrif_tomador           = @xrif_titular;
            SET @icedula_tomador        = ISNULL(@icedula_tomador, @icedula_titular);
            SET @xnombre_tomador        = ISNULL(NULLIF(TRIM(@xnombre_tomador), ''), @xnombre_titular);
            SET @xapellido_tomador      = ISNULL(NULLIF(TRIM(@xapellido_tomador), ''), @xapellido_titular);
            SET @isexo_tomador          = ISNULL(@isexo_tomador, @isexo_titular);
            SET @iestado_civil_tomador  = ISNULL(@iestado_civil_tomador, @iestado_civil_titular);
            SET @fnac_tomador           = ISNULL(@fnac_tomador, @fnac_titular);
            SET @cestado_tomador        = ISNULL(NULLIF(TRIM(@cestado_tomador), ''), @cestado_titular);
            SET @cciudad_tomador        = ISNULL(NULLIF(TRIM(@cciudad_tomador), ''), @cciudad_titular);
            SET @xdireccion_tomador     = ISNULL(NULLIF(TRIM(@xdireccion_tomador), ''), @xdireccion_titular);
            SET @xtelefono_tomador      = ISNULL(NULLIF(TRIM(@xtelefono_tomador), ''), @xtelefono_titular);
            SET @xcorreo_tomador        = ISNULL(NULLIF(TRIM(@xcorreo_tomador), ''), @xcorreo_titular);
            SET @cpais_tomador          = ISNULL(@cpais_tomador, @cpais_titular); -- [cpais 23-oct-2026]
        END;

        IF (@xrif_titular IS NULL OR @xrif_titular = 0) AND (@xrif_tomador IS NOT NULL AND @xrif_tomador > 0)
        BEGIN
            SET @xrif_titular           = @xrif_tomador;
            SET @icedula_titular        = ISNULL(@icedula_titular, @icedula_tomador);
            SET @xnombre_titular        = ISNULL(NULLIF(TRIM(@xnombre_titular), ''), @xnombre_tomador);
            SET @xapellido_titular      = ISNULL(NULLIF(TRIM(@xapellido_titular), ''), @xapellido_tomador);
            SET @isexo_titular          = ISNULL(@isexo_titular, @isexo_tomador);
            SET @iestado_civil_titular  = ISNULL(@iestado_civil_titular, @iestado_civil_tomador);
            SET @fnac_titular           = ISNULL(@fnac_titular, @fnac_tomador);
            SET @cestado_titular        = ISNULL(NULLIF(TRIM(@cestado_titular), ''), @cestado_tomador);
            SET @cciudad_titular        = ISNULL(NULLIF(TRIM(@cciudad_titular), ''), @cciudad_tomador);
            SET @xdireccion_titular     = ISNULL(NULLIF(TRIM(@xdireccion_titular), ''), @xdireccion_tomador);
            SET @xtelefono_titular      = ISNULL(NULLIF(TRIM(@xtelefono_titular), ''), @xtelefono_tomador);
            SET @xcorreo_titular        = ISNULL(NULLIF(TRIM(@xcorreo_titular), ''), @xcorreo_tomador);
            SET @cpais_titular          = ISNULL(@cpais_titular, @cpais_tomador); -- [cpais 23-oct-2026]
        END;

        IF @icedula_titular IS NULL SET @icedula_titular = 'V';
        IF @icedula_tomador IS NULL SET @icedula_tomador = @icedula_titular;

        -- 3. Manejo diferenciado según Tipo de Emisión (RE, RM, NU)
        IF UPPER(TRIM(@itipoEmi)) IN ('RE', 'RM')
        BEGIN
            IF @cnpoliza_rel IS NULL OR TRIM(@cnpoliza_rel) = ''
            BEGIN
                THROW 99001, 'Para Renovaciones (RE) y Reemisiones (RM) es obligatorio enviar el número de póliza previa (cnpoliza_rel).', 1;
            END;

            -- Buscar la póliza original registrada para mantener estricta continuidad del histórico (cpoliza y cnpoliza)
            DECLARE @exist_cpoliza NUMERIC(19), @exist_cnpoliza VARCHAR(30), @exist_cramo INT, @exist_cplan VARCHAR(10),
                    @exist_casegurado NUMERIC(13), @exist_ctenedor NUMERIC(13),
                    @exist_xplaca VARCHAR(15), @exist_xsercar VARCHAR(60), @exist_xsermot VARCHAR(60),
                    @exist_cmarca VARCHAR(3), @exist_cmodelo VARCHAR(3), @exist_cversion VARCHAR(3),
                    @exist_cano SMALLINT, @exist_xcolor VARCHAR(60), @exist_ccategoria_uso INT,
                    @exist_npuestos INT, @max_fhasta DATE,
                    @exist_msumaaseg NUMERIC(18,2), @exist_mprima NUMERIC(18,2), @exist_ptasamon NUMERIC(18,6);

            SELECT TOP 1
                @exist_cpoliza   = P.cpoliza,
                @exist_cnpoliza  = P.cnpoliza,
                @exist_cramo     = P.cramo,
                @exist_cplan     = P.cplan,
                @exist_casegurado = P.casegurado,
                @exist_ctenedor   = P.ctenedor,
                @exist_xplaca    = V.xplaca,
                @exist_xsercar   = V.xsercar,
                @exist_xsermot   = V.xsermot,
                @exist_cmarca    = V.cmarca,
                @exist_cmodelo   = V.cmodelo,
                @exist_cversion  = V.cversion,
                @exist_cano      = V.cano,
                @exist_xcolor    = V.xcolor,
                @exist_ccategoria_uso = V.cuso,
                @exist_npuestos  = V.qpuestos
            FROM adpoliza P WITH (NOLOCK)
            LEFT JOIN vhcerti V WITH (NOLOCK) ON P.cpoliza = V.cpoliza
            WHERE P.cnpoliza = TRIM(@cnpoliza_rel) OR P.cnpoliza_rel = TRIM(@cnpoliza_rel)
            ORDER BY P.fanopol DESC, P.fmespol DESC;

            IF @exist_cpoliza IS NULL
            BEGIN
                THROW 99001, 'No se encontró la póliza original asociada a cnpoliza_rel para realizar la renovación o reemisión.', 1;
            END;

            -- Bloqueo: No se pueden renovar pólizas con recibos pendientes de pago
            IF UPPER(TRIM(@itipoEmi)) = 'RE'
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM adrecibos WITH (NOLOCK)
                    WHERE (cnpoliza = TRIM(@cnpoliza_rel) OR cpoliza = @exist_cpoliza)
                      AND (iestadorec = 'P' OR (iestadorec NOT IN ('C', 'A') AND fcobro IS NULL))
                )
                BEGIN
                    THROW 99001, 'No se puede renovar la póliza porque posee recibos pendientes de pago.', 1;
                END;

                -- En Renovación (RE), calcular vigencia 100% internamente a partir de la última fecha de fin (MAX fhasta)
                SELECT @max_fhasta = MAX(fhasta)
                FROM adpoliza WITH (NOLOCK)
                WHERE cnpoliza = TRIM(@cnpoliza_rel) OR cnpoliza_rel = TRIM(@cnpoliza_rel);

                IF @max_fhasta IS NULL
                    SELECT TOP 1 @max_fhasta = fhasta FROM adpoliza WHERE cpoliza = @exist_cpoliza ORDER BY fanopol DESC;

                IF @max_fhasta IS NULL SET @max_fhasta = CAST(GETDATE() AS DATE);

                SET @fdesde = @max_fhasta;
                SET @fhasta = DATEADD(YEAR, 1, @fdesde);
            END;

            -- ?? RECUPERAR VALORES FINANCIEROS VÁLIDOS (msumaaseg, mprima, ptasamon > 0) DE LA PÓLIZA EXISTENTE SI VIENEN EN NULL O 0
            SELECT TOP 1
                @exist_msumaaseg = R.msumabruta,
                @exist_mprima    = R.mprimabruta,
                @exist_ptasamon  = R.ptasamon
            FROM adrecibos R WITH (NOLOCK)
            WHERE (R.cpoliza = @exist_cpoliza OR R.cnpoliza = TRIM(@cnpoliza_rel))
              AND R.msumabruta > 0
            ORDER BY R.fanopol DESC, R.fmespol DESC;

            IF (@exist_msumaaseg IS NULL OR @exist_msumaaseg <= 0)
            BEGIN
                SELECT TOP 1 @exist_msumaaseg = mvalor
                FROM vhcerti WITH (NOLOCK)
                WHERE (cpoliza = @exist_cpoliza OR cnpoliza = TRIM(@cnpoliza_rel))
                  AND mvalor > 0
                ORDER BY fanopol DESC;
            END;

            -- Mantener EXACTAMENTE cpoliza y cnpoliza originales para el histórico
            SET @cpoliza   = @exist_cpoliza;
            SET @cnpoliza  = @exist_cnpoliza;

            -- Autocompletar campos omitidos utilizando los datos de la póliza registrada
            SET @cplan           = ISNULL(NULLIF(TRIM(@cplan), ''), @exist_cplan);
            SET @cramo           = ISNULL(@cramo, @exist_cramo);
            SET @xrif_titular    = ISNULL(NULLIF(@xrif_titular, 0), @exist_casegurado);
            SET @xrif_tomador    = ISNULL(NULLIF(@xrif_tomador, 0), @exist_ctenedor);
            SET @xplaca          = ISNULL(NULLIF(TRIM(@xplaca), ''), @exist_xplaca);
            SET @xsercar         = ISNULL(NULLIF(TRIM(@xsercar), ''), @exist_xsercar);
            SET @xsermot         = ISNULL(NULLIF(TRIM(@xsermot), ''), @exist_xsermot);
            SET @cmarca          = ISNULL(NULLIF(TRIM(@cmarca), ''), @exist_cmarca);
            SET @cmodelo         = ISNULL(NULLIF(TRIM(@cmodelo), ''), @exist_cmodelo);
            SET @cversion        = ISNULL(NULLIF(TRIM(@cversion), ''), @exist_cversion);
            SET @cano            = ISNULL(NULLIF(@cano, 0), @exist_cano);
            SET @xcolor          = ISNULL(NULLIF(TRIM(@xcolor), ''), @exist_xcolor);
            SET @ccategoria_uso  = ISNULL(NULLIF(@ccategoria_uso, 0), @exist_ccategoria_uso);
            SET @npuestos        = ISNULL(NULLIF(@npuestos, 0), @exist_npuestos);
            SET @msumaaseg      = ISNULL(NULLIF(@msumaaseg, 0), @exist_msumaaseg);
            SET @mprima          = 0;
            SET @ptasamon        = ISNULL(NULLIF(@ptasamon, 0), @exist_ptasamon);


            -- Completar nombres/apellidos si no fueron proporcionados
            IF (@xnombre_titular IS NULL OR TRIM(@xnombre_titular) = '') AND @xrif_titular IS NOT NULL
            BEGIN
                SELECT TOP 1
                    @xnombre_titular = xnombre,
                    @xapellido_titular = xapellido
                FROM maclient WITH (NOLOCK)
                WHERE cci_rif = @xrif_titular;
            END;

            IF (@xnombre_tomador IS NULL OR TRIM(@xnombre_tomador) = '') AND @xrif_tomador IS NOT NULL
            BEGIN
                SELECT TOP 1
                    @xnombre_tomador = xnombre,
                    @xapellido_tomador = xapellido
                FROM maclient WITH (NOLOCK)
                WHERE cci_rif = @xrif_tomador;
            END;
        END
        ELSE
        BEGIN
            -- Para Emisiones Nuevas ('NU', 'SO'), se exigen todos los datos obligatorios del payload
            IF @cplan IS NULL OR TRIM(@cplan) = ''
                THROW 99001, 'El código de plan (cplan) es obligatorio para emisiones nuevas.', 1;

            IF @xrif_titular IS NULL OR @xrif_titular = 0
                THROW 99001, 'El RIF/Cédula del titular o tomador (xrif_titular/xrif_tomador) es obligatorio para emisiones nuevas.', 1;

            IF @xnombre_titular IS NULL OR TRIM(@xnombre_titular) = ''
                THROW 99001, 'El nombre del titular o tomador es obligatorio para emisiones nuevas.', 1;

            IF @icedula_titular NOT IN ('J', 'G', 'C') AND (@xapellido_titular IS NULL OR TRIM(@xapellido_titular) = '')
                THROW 99001, 'El apellido del titular o tomador es obligatorio para emisiones nuevas.', 1;

            IF @xplaca IS NULL OR TRIM(@xplaca) = ''
                THROW 99001, 'La placa del vehículo (xplaca) es obligatoria para emisiones nuevas.', 1;

            IF @xsercar IS NULL OR TRIM(@xsercar) = ''
                THROW 99001, 'El serial de carrocería del vehículo (xsercar) es obligatorio para emisiones nuevas.', 1;

            IF @xmarca IS NULL OR TRIM(@xmarca) = ''
                THROW 99001, 'La marca del vehículo (xmarca) es obligatoria para emisiones nuevas.', 1;

            IF @xmodelo IS NULL OR TRIM(@xmodelo) = ''
                THROW 99001, 'El modelo del vehículo (xmodelo) es obligatorio para emisiones nuevas.', 1;

            IF @xversion IS NULL OR TRIM(@xversion) = ''
                THROW 99001, 'La versión del vehículo (xversion) es obligatoria para emisiones nuevas.', 1;

            IF @cano IS NULL OR @cano <= 1900
                THROW 99001, 'El año del vehículo (cano) es obligatorio y debe ser mayor a 1900 para emisiones nuevas.', 1;

            IF @ccategoria_uso IS NULL OR @ccategoria_uso = 0
                THROW 99001, 'La categoría de uso del vehículo (ccategoria_uso) es obligatoria para emisiones nuevas.', 1;

            --IF @mprima IS NULL OR @mprima <= 0
            --    THROW 99001, 'El monto de prima (mprima) es obligatorio y debe ser mayor a 0 para emisiones nuevas.', 1;

            --IF @msumaaseg IS NULL OR @msumaaseg <= 0
            --    THROW 99001, 'La suma asegurada (msumaaseg) es obligatoria y debe ser mayor a 0 para emisiones nuevas.', 1;
        END;

        -- 4. Ajustes iniciales
        IF @cproductor = 0 SET @cproductor = 80080;

        -- Lógica de resolución de canal
        IF (@ccanalalt IS NOT NULL)
        BEGIN
            SELECT @ctipocanal = ctipocanal FROM macanalalt WHERE ccanalalt = @ccanalalt;
            SELECT @cgestor = cgestor FROM magestor WHERE ccanalalt = @ccanalalt AND cscanalalt = @cscanalalt;
        END
        ELSE
        BEGIN
            SELECT @cgestor = cgestor, @ctipocanal = ctipocanal, @ccanalalt = ccanalalt, @cscanalalt = cscanalalt
            FROM magestor
            WHERE cgestor = CAST(@cproductor AS VARCHAR(30));

            IF (@ctipocanal IS NULL)
            BEGIN
                IF (@cproductor = 80080) SET @ctipocanal = 'D';
                ELSE SET @ctipocanal = 'T';
            END
        END

        IF (@cproductor = 80080 OR @cproductor IS NULL) SET @ctipocanal = 'D';
        IF @cusuario IS NULL SET @cusuario = 1422;

        -- Obtener ramo desde el plan
        IF @cramo IS NULL
        	SELECT @cramo = cramo FROM maplanes WHERE cplan = @cplan AND iestado = 'V';

        -- Obtener tipo de categoría
        SELECT TOP 1 @ctipo = ctipo FROM macategtr WHERE ccategotr = @ccategoria_uso AND cramo = @cramo;

        -- 5. Obtener sucursal desde maclient_api
        SELECT TOP 1 @csucur = csucur FROM maclient_api WHERE ifuente_api = @ifuente;
        IF @csucur IS NULL SET @csucur = 1;

        -- 6. Validar automóvil (solo aplica validación de placa/serial vigente para emisiones nuevas)
        IF UPPER(TRIM(@itipoEmi)) IN ('NU', 'SO')
        BEGIN

	        SET @mprima_servicio = @mprima;
            SET @iplaca = ISNULL(NULLIF(TRIM(@iplaca), ''), 'N');
            SET @puestos_calc = ISNULL(NULLIF(@npuestos, 0), 5);
            SET @uso_calc = ISNULL(@ccategoria_uso, 1);

            -- Preferir tipo/uso/puestos desde VINMA (misma lógica que endosos/emisión)
            IF EXISTS (
                SELECT 1 FROM vinma
                WHERE cmarca = @cmarca AND cmodelo = @cmodelo AND cversion = @cversion AND cano = @cano
            )
            BEGIN
                SELECT TOP 1
                    @ctipo = ctipo,
                    @uso_calc = CASE WHEN ISNULL(ccategotr, 0) > 0 THEN ccategotr ELSE @uso_calc END,
                    @puestos_calc = CASE WHEN ISNULL(npasajero, 0) > 0 THEN npasajero ELSE @puestos_calc END
                FROM vinma
                WHERE cmarca = @cmarca AND cmodelo = @cmodelo AND cversion = @cversion AND cano = @cano;
            END
            ELSE IF @ctipo IS NULL
            BEGIN
                SELECT TOP 1 @ctipo = ctipo FROM macategtr WHERE ccategotr = @uso_calc;
            END;

            IF @ctipo IS NULL SET @ctipo = 1;

            CREATE TABLE #montos_cotiza (
                cplan CHAR(50),
                xplan CHAR(70),
                ccobertura CHAR(4),
                xdescripcion_l CHAR(60),
                cproducto NVARCHAR(6),
                cmoneda CHAR(10),
                nubii NUMERIC(6),
                tasaCA NUMERIC(18,6),
                tasaPT NUMERIC(18,6),
                tasaPP DECIMAL(18,2),
                primaBlCA NUMERIC(18,6),
                primaBLPT NUMERIC(18,6),
                primaAdCA NUMERIC(18,6),
                primaAdPT NUMERIC(18,6),
                primaAdPP NUMERIC(18,6),
                prima NUMERIC(18,6),
                masegurada NUMERIC(18,6),
                ctarifa CHAR(4),
                cramoint CHAR(4),
                ccoberturaint CHAR(4),
                xcobertura NVARCHAR(30),
                xvalor NVARCHAR(2),
                badicional BIT
            );

            SET @ntoneladas = ISNULL(@ntoneladas, 0);
            SET @precargorcv = ISNULL(@precargorcv, 0);
            SET @cusuario = ISNULL(@cusuario, 1422);
            SET @coberAdicional = ISNULL(@coberAdicional, 'RC');

            INSERT INTO #montos_cotiza
            EXEC sp_calculo_auto_nexus
                @cmarca = @cmarca,
                @cmodelo = @cmodelo,
                @cversion = @cversion,
                @cano = @cano,
                @cplan = @cplan,
                @sumaAseg = @msumaaseg,
                @sumaAsegBl = @msumaaseg,
                @sumaAsegAd = 0,
                @iplaca = @iplaca,
                @fdesde = @fdesde,
                @fhasta = @fhasta,
                @tasaPt = @tasaPt,
                @tasaCa = @tasaCa,
                @tasaPp = @tasaPp,
                @recargo = 0,
                @tipoV = @ctipo,
                @uso = @uso_calc,
                @puestos = @puestos_calc,
                @toneladas = @ntoneladas,
                @recargoRcv = @precargorcv,
                @cramo = @cramo,
                @cusuario = @cusuario,
                @coberAdicional = @coberAdicional,
                @incluirTotales = 0,
                @ifrecuencia = 'A'; -- Siempre anual: el fraccionamiento lo hace la generación de recibos.

            SELECT @mprima = ROUND(ISNULL(SUM(prima), 0), 2) FROM #montos_cotiza;

            DROP TABLE #montos_cotiza;

            IF @mprima IS NULL OR @mprima <= 0
                THROW 99001, 'No se pudo cotizar la prima anual en BD (sp_calculo_auto_nexus). Verifique plan, vehículo y coberturas.', 1;

            -- Traza opcional: comparar lo enviado por el servicio vs lo cotizado en BD
            IF @mprima_servicio IS NOT NULL AND @mprima_servicio > 0 AND @mprima_servicio <> @mprima
            BEGIN
                SET @xlog = CONCAT(
                    'mprima_servicio=', CONVERT(VARCHAR(30), @mprima_servicio),
                    '; mprima_anual_bd=', CONVERT(VARCHAR(30), @mprima),
                    '; ifrecuencia=', ISNULL(@ifrecuencia, '')
                );
            END;

            EXEC spee_validate_automovil_general_nexus
                @cplan = @cplan,
                @xplaca = @xplaca,
                @xsercar = @xsercar,
                @xsermot = @xsermot;
        END;

        -- 7. Crear o vincular ítem en INMA si es necesario
        EXEC sp_create_inma_item_nexus
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

        -- 8. Ajustar fechas por defecto para emisiones nuevas
        IF UPPER(TRIM(@itipoEmi)) NOT IN ('RE')
        BEGIN
            IF @femision IS NULL SET @femision = CAST(GETDATE() AS DATE);
            IF @fdesde IS NULL SET @fdesde = CAST(@femision AS DATE);
            IF @fhasta IS NULL SET @fhasta = DATEADD(YEAR, 1, @fdesde);
        END
        ELSE
        BEGIN
            IF @femision IS NULL SET @femision = CAST(GETDATE() AS DATE);
        END;

        -- 9. Generar números de recibo y proceso mediante contador
        IF @csucur IS NULL SET @csucur = 1;

        IF UPPER(TRIM(@itipoEmi)) IN ('RE', 'RM')
        BEGIN
            -- Para Renovaciones y Reemisiones, solo generamos nuevo recibo y proceso (reutilizando cpoliza y cnpoliza)
            DECLARE @dummy_cpoliza NUMERIC(19), @dummy_cnpoliza VARCHAR(30);
            EXEC sp_contador_nexus
                @dummy_cpoliza OUTPUT,
                @dummy_cnpoliza OUTPUT,
                @crecibo OUTPUT,
                @cnrecibo OUTPUT,
                @cproces OUTPUT,
                @csucur,
                @fdesde,
                @cramo,
                'POL_VEH';
        END
        ELSE
        BEGIN
            -- Para Emisiones Nuevas (NU/SO), generamos cpoliza y cnpoliza nuevos
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
                SELECT @qcontador = qcontador FROM macontadores WHERE ccontador = 'POL_VEH';
                SET @cnpoliza = CONVERT(VARCHAR, @cramo) + '-' + CONVERT(VARCHAR, @csucur) + '-' + FORMAT(@qcontador, '0000000000');
            END;

            IF EXISTS (SELECT 1 FROM adpoliza WHERE cnpoliza = @cnpoliza)
                THROW 99001, 'Nro. de Póliza Rel ya existente.', 1;
        END;

        SET @iestado = 1;
        SET @xestado = 'PENDING';
        SET @xlog = NULL;

        -- 10. Insertar registro en tabla de emisión (TMEMISION_AUTOMOVIL_RCV2)
        INSERT INTO TMEMISION_AUTOMOVIL_RCV2 (
            cnpoliza_rel, cplan, cramo, xcanal_venta, icedula_tomador, xrif_tomador, xnombre_tomador, xapellido_tomador,
            isexo_tomador, iestado_civil_tomador, fnac_tomador, cestado_tomador, cciudad_tomador, xdireccion_tomador,
            xtelefono_tomador, xcorreo_tomador, icedula_titular, xrif_titular, xnombre_titular, xapellido_titular, isexo_titular,
            iestado_civil_titular, fnac_titular, cestado_titular, cciudad_titular, xdireccion_titular, xtelefono_titular,
            xcorreo_titular, cmarca, cmodelo, cversion, cano, xcolor, xplaca, xsercar, xsermot,
            cpersona_politica, cterm_y_cod, cproductor, ptasamon, mprima, ifrecuencia, femision, corigen_rel, api, method,
            cprog, ifuente, fingreso, cpoliza, cnpoliza, cproces, ccanalalt, cscanalalt, ctipocanal, ccategoria_uso, cmoneda,
            cusuario, ntoneladas, npuestos, precargorcv, iplaca, ptasamon_pago, msumaaseg, xmarca, xmodelo, xversion, fdesde, fhasta,
            itipo_emi, cober_adicional, ptasa_pt, ptasa_ca, ptasa_pp,
            iestado, xestado, xlog,
            icedula_conductor, xrif_conductor, xnombre_conductor, xapellido_conductor, isexo_conductor, iestado_civil_conductor,
            fnac_conductor, cestado_conductor, cciudad_conductor, xdireccion_conductor, xtelefono_conductor, xcorreo_conductor,
            icedula_beneficiario, xrif_beneficiario, xnombre_beneficiario, xapellido_beneficiario, isexo_beneficiario, iestado_civil_beneficiario,
            fnac_beneficiario, cestado_beneficiario, cciudad_beneficiario, xdireccion_beneficiario, xtelefono_beneficiario, xcorreo_beneficiario,
            itipo_diligencia, cprofesion_tomador, cactividad_tomador, cprofesion_titular, cactividad_titular, cgestor
        )
        VALUES (
            @cnpoliza_rel, @cplan, @cramo, @xcanal_venta, @icedula_tomador, @xrif_tomador, @xnombre_tomador, @xapellido_tomador,
            @isexo_tomador, @iestado_civil_tomador, @fnac_tomador, @cestado_tomador, @cciudad_tomador, @xdireccion_tomador,
            @xtelefono_tomador, @xcorreo_tomador, @icedula_titular, @xrif_titular, @xnombre_titular, @xapellido_titular,
            @isexo_titular, @iestado_civil_titular, @fnac_titular, @cestado_titular, @cciudad_titular, @xdireccion_titular,
            @xtelefono_titular, @xcorreo_titular, @cmarca, @cmodelo, @cversion, @cano, @xcolor, @xplaca, @xsercar, @xsermot,
            @cpersona_politica, @cterm_y_cod, @cproductor, @ptasamon, @mprima, @ifrecuencia, @femision, @corigen_rel, @api, @method,
            @cprog, @ifuente, @fingreso, @cpoliza, @cnpoliza, @cproces, @ccanalalt, @cscanalalt, @ctipocanal, @ccategoria_uso,
            @cmoneda, @cusuario, @ntoneladas, @npuestos, @precargorcv, @iplaca, @ptasamon_pago, @msumaaseg, @xmarca, @xmodelo, @xversion, @fdesde, @fhasta,
            @itipoEmi, @coberAdicional, @tasaPt, @tasaCa, @tasaPp,
            @iestado, @xestado, @xlog,
            @icedula_conductor, @xrif_conductor, @xnombre_conductor, @xapellido_conductor, @isexo_conductor, @iestado_civil_conductor,
            @fnac_conductor, @cestado_conductor, @cciudad_conductor, @xdireccion_conductor, @xtelefono_conductor, @xcorreo_conductor,
            @icedula_beneficiario, @xrif_beneficiario, @xnombre_beneficiario, @xapellido_beneficiario, @isexo_beneficiario, @iestado_civil_beneficiario,
            @fnac_beneficiario, @cestado_beneficiario, @cciudad_beneficiario, @xdireccion_beneficiario, @xtelefono_beneficiario, @xcorreo_beneficiario,
            @itipo_diligencia, @cprofesion_tomador, @cactividad_tomador, @cprofesion_titular, @cactividad_titular, @cgestor
        );

        SET @id = SCOPE_IDENTITY();

        -- 11. Invocar sp_emision_automovil_rcv_nexus
        EXEC sp_emision_automovil_rcv_nexus
            @id = @id,
            @pSuccess = @pSuccess OUTPUT,
            @pErrorMessage = @pErrorMessage OUTPUT,
            @cpais_tomador = @cpais_tomador,   -- [cpais 23-oct-2026]
            @cpais_titular = @cpais_titular,   -- [cpais 23-oct-2026]
            @cocupacion_tomador = @cocupacion_tomador,     -- [ocupacion 29-oct-2026]
            @cocupacion_titular = @cocupacion_titular,     -- [ocupacion 29-oct-2026]
            @bocupacion_separada = @bocupacion_separada;   -- [ocupacion 29-oct-2026]

        -- Si la emisión interna falla, abortar y hacer rollback atómico
        IF @pSuccess = 0 OR @pSuccess IS NULL
        BEGIN
            SET @xerror = ISNULL(@pErrorMessage, 'Error no especificado durante la emisión de la póliza.');
            THROW 99001, @xerror, 1;
        END;

        -- Confirmar la transacción única
        IF @TranStarted = 1 AND @@TRANCOUNT > 0
        BEGIN
            COMMIT TRANSACTION;
        END;

    END TRY
    BEGIN CATCH
        -- Garantizar Rollback atómico completo ante cualquier error
        IF @@TRANCOUNT > 0
        BEGIN
            ROLLBACK TRANSACTION;
        END;

        SET @xerror = ERROR_MESSAGE();
        THROW 99001, @xerror, 1;
    END CATCH;
END;
GO
