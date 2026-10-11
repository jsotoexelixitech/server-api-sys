-- =============================================================================
-- sp_emision_personas_general_nexus - v3: prima por tarifa y por asegurado, con recargo/descuento
-- Fecha: 2026-10-05 · Solicitado por: Exélixi (emisión personas vía nest-api)
-- Base: v2 (2026-10-05) ya en QA: cproces del recibo, sucursal real, fechas de cobro NULL,
--       productor directo sin comisión, cusuario de la emisión.
--
-- Cambios respecto a la v2 (nada más cambia). Solo el bloque de coberturas, en sus dos ramas
-- (general y viajero 25/VIAJE):
--   1. Se recorre por tarifa y por asegurado. La prima de cada tarifa sale de su propia
--      ctablatar y de la edad y el parentesco de ese asegurado (antes se sumaban todas las
--      tarifas de la cobertura y cada tarifa repetía el total).
--   2. pepoltar_ind: una fila por asegurado, cobertura y tarifa. Prima (mprima/mprimaext),
--      precargo y pdescuento de ese asegurado tomados de TMEMISION_PERSONAS_GENERAL_ASEG con
--      sus montos (mrecargo*, mdescuento*) y mprimabruta = prima + recargo - descuento.
--      Sin comisión: la comisión va en la cobertura.
--   3. pepolcob_ind: por asegurado y cobertura, suma de mprimabruta de sus tarifas, y la
--      comisión (pcomision de maarancel) sobre esa suma (0 si el productor es 80080).
--   4. adpoltar: por tarifa, suma de todos los asegurados (sin repetir la prima).
--   5. adpolcob: por cobertura, suma de pepolcob_ind, con la comisión en la cobertura. Deja de
--      copiarse fila por fila de adpoltar.
--   El recibo sigue igual: SUM(adpolcob). El recargo/descuento ya está dentro de mprimabruta,
--   por eso el recibo no lo vuelve a sumar (adrecibos sigue con @precargo/@pdescuento = 0).
--
-- Aplicar junto con:
--   - alter-tmemision-personas-general-aseg-precargo.sql (columnas precargo y pdescuento)
--   - sp_pre_emision_personas_general_nexus v3 (llena esas columnas)
--   - sp_genera_coberturas_siniestro_personas_nexus v3 (ya no inserta pepolcob_ind/pepoltar_ind)
--   sp_genera_adpolrea_nexus v2 no cambia.
-- =============================================================================


CREATE OR ALTER PROCEDURE [dbo].[sp_emision_personas_general_nexus]
    -- Nuevos parametros de salida para control
    @id                  INT,
    @pSuccess            BIT = 0 OUTPUT,
    @pErrorMessage       NVARCHAR(MAX) = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON; -- Opcional: hace que cualquier error haga rollback automatico (evita dejar transacciones abiertas)

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE
        @cnpoliza_rel varchar(30), @cplan varchar(6), @xcanal_venta varchar(250), @icedula_tomador char(1),
        @xrif_tomador numeric(9), @xnombre_tomador varchar(250), @xapellido_tomador varchar(250), @isexo_tomador char(1),
        @iestado_civil_tomador char(1), @fnac_tomador DATE, @cestado_tomador varchar(100), @cciudad_tomador varchar(100),
        @xdireccion_tomador varchar(1000), @xtelefono_tomador varchar(250), @xcorreo_tomador varchar(250), @icedula_titular char(1),
        @xrif_titular numeric(9), @xnombre_titular varchar(250), @xapellido_titular varchar(250), @isexo_titular char(1),
        @iestado_civil_titular char(1), @fnac_titular DATE, @cestado_titular varchar(100), @cciudad_titular varchar(100),
        @xdireccion_titular varchar(1000), @xtelefono_titular varchar(250), @xcorreo_titular varchar(250), @cproductor int, @ptasamon numeric(18,6),
        @ifrecuencia char(1), @femision DATE, @fdesde DATE, @fhasta DATE,
        @api varchar(100), @method varchar(100), @cprog char(20), @ifuente char(10), @fingreso DATETIME, @cpoliza NUMERIC(19,0), @cnpoliza varchar(30),
        @cproces NUMERIC(13,0), @pcomision numeric(9,2), @cramo int, @cmoneda CHAR(4),
        @msumaaseg numeric(18,2), @msumaasegext numeric(18,2), @mprima numeric(18,2), @mprimaext numeric(18,2), @mcomision numeric(18,2),
        @mcomisionext numeric(18,2), @qcontador numeric(18,0),
        @crecibo numeric(19,0), @cnrecibo varchar(30), @qcontadorrec numeric(18,0),
        @contador_polacc numeric(18,0), @fano smallint, @fmes smallint, @fanopol smallint, @fmespol smallint, @fdesde_pol DATE,
        @fhasta_pol DATE, @fdesde_rec DATE, @fhasta_rec DATE, @corigen_rel char(2), @qrecibo1 numeric(19,0), @ncuo int,
        @ifpexceso numeric(18,2), @msfp numeric(18,2), @mpfp numeric(18,2), @mpfpext numeric(18,2), @mpfpret numeric(18,2), @mpfpretext numeric(18,2),
        @mcfp numeric(18,2), @mcfpext numeric(18,2), @mifp numeric(18,2), @mifpext numeric(18,2), @msretesp numeric(18,2), @msretespext numeric(18,2),
        @mpretesp numeric(18,2), @mpretespext numeric(18,2), @ctiporamo int, @itipocont char(3), @pcoa numeric(18,8),
        @nparentesco_asegurado tinyint, @icedula_asegurado char(1), @xrif_asegurado numeric(12,0), @iestado_civil_asegurado char(1),
        @xnombre_asegurado varchar(250), @xapellido_asegurado varchar(250), @isexo_asegurado char(1),
        @fnac_asegurado DATE, @xdireccion_asegurado varchar(1000), @xcorreo_asegurado varchar(250), @xtelefono_asegurado varchar(250),
        @caseg numeric(12,0), @cben numeric(12,0), @nparentesco_beneficiario tinyint, @icedula_beneficiario char(1),
        @xrif_beneficiario numeric(12,0), @xnombre_beneficiario varchar(250), @xapellido_beneficiario varchar(250), @isexo_beneficiario char(1),
        @nbeneficia int, @fnac_beneficiario DATE, @ncobertura TINYINT, @POL_RAMO VARCHAR(20), @cparen TINYINT, @ctablatar CHAR(10),
        @nedad_asegurado VARCHAR(20), @nrecibo int, @fcobro DATE, @iestadorec CHAR(1), @cnrecibo_rel varchar(30), @xcliente_tomador VARCHAR(250),
        @xcliente_titular VARCHAR(250), @xcliente_asegurado VARCHAR(250), @xcliente_beneficiario VARCHAR(250), @cuotas INT, @cramoint INT,
        @ccanalalt int, @cscanalalt int, @ctipocanal CHAR(1), @cbeneficiario numeric(9), @msumatabla numeric(18,2), @cgestor VARCHAR(30),
        @mprimarec numeric(18,2), @mprimarecext numeric(18,2), @mprimabrutaext numeric(18,2), @pdescuento numeric(13,2), @mdescuentoext numeric(18,2),
        @precargo numeric(13,2), @mrecargoext numeric(18,2), @mmontonetoext numeric(18,2), @mprimabrutarecext numeric(18,2), @mdescuentorecext numeric(18,2),
        @mrecargorecext numeric(18,2), @mmontonetorecext numeric(18,2), @mprimabrutarec numeric(18,2), @mdescuentorec numeric(18,2),
        @mrecargorec numeric(18,2), @mmontonetorec numeric(18,2), @pdescuento_cob numeric(13,2), @precargo_cob numeric(13,2), @pporce_beneficiario NUMERIC(13,2), @tasa_cambio NUMERIC(18,6),
        @mprima_tar NUMERIC(18,2), @mprimabruta_tar NUMERIC(18,2), @mprimaext_tar NUMERIC(18,2), @mprimabrutaext_tar NUMERIC(18,2),
        @mdescuento_tar NUMERIC(18,2), @mdescuentoext_tar NUMERIC(18,2), @mrecargo_tar NUMERIC(18,2), @mrecargoext_tar NUMERIC(18,2),
        @error VARCHAR(MAX), 
        
        @icedula CHAR (1),
        @cci_rif NUMERIC (11),
        @xnombre VARCHAR (250),
        @xapellido VARCHAR (250),
        @xcliente VARCHAR (250), 
        @isexo CHAR (1),
        @iestado_civil CHAR (1),
        @npeso NUMERIC (6,2),
        @nestatura NUMERIC (8,2),
        @fnac DATE,
        @xcorreo VARCHAR (250) , 
        @cpais int, 
        @cestado int,
        @cciudad int,
        @xdireccion VARCHAR (1000), 
        @czonapos int,
        @xtelefono VARCHAR (250), 
        @cid VARCHAR (250),
        @CERROR INT,
        @itipopol CHAR(1),
        @csucur INT,
        @cpoliza_o NUMERIC(19),
        @cproces_rec NUMERIC(13,0),
        @cusuario INT,
        @ccategoria INT,
        @cnpoliza_o VARCHAR(30),

        -- Variables prorrata viajero
        @cparen_aseg INT, @nedad_aseg INT, @xrif_aseg VARCHAR(12),
        @ndias_aseg INT, @mprimaext_aseg NUMERIC(18,2), @mprima_aseg NUMERIC(18,2),
        @berror_aseg BIT, @mensaje_aseg NVARCHAR(120),
        @mprima_acum NUMERIC(18,2), @mprimaext_acum NUMERIC(18,2),
        @cant_coberturas INT, @mprimaext_restante NUMERIC(18,2), @mprima_restante NUMERIC(18,2),
        @i_cob INT, @ctablatar_viaje CHAR(10), @nedad_viaje INT,

        -- v3: días de vigencia (viajero) y tasa con la que se pasa la prima a Bs
        @ndias_viaje INT, @tasa_prima NUMERIC(18,6)

        set @itipopol = 'I'
        set @csucur = 1
        

        SELECT
        @cnpoliza_rel = cnpoliza_rel, @cplan = cplan, @xcanal_venta = xcanal_venta, @icedula_tomador = icedula_tomador,
        @xrif_tomador = xrif_tomador, @xnombre_tomador = xnombre_tomador, @xapellido_tomador = xapellido_tomador, @isexo_tomador = isexo_tomador,
        @iestado_civil_tomador = iestado_civil_tomador, @fnac_tomador = fnac_tomador, @cestado_tomador = cestado_tomador,
        @cciudad_tomador = cciudad_tomador, @xdireccion_tomador = xdireccion_tomador, @xtelefono_tomador = xtelefono_tomador,
        @xcorreo_tomador = xcorreo_tomador, @icedula_titular = icedula_titular, @xrif_titular = xrif_titular, @xnombre_titular = xnombre_titular,
        @xapellido_titular = xapellido_titular, @isexo_titular = isexo_titular, @iestado_civil_titular = iestado_civil_titular,
        @fnac_titular = fnac_titular, @cestado_titular = cestado_titular, @cciudad_titular = cciudad_titular, @xdireccion_titular = xdireccion_titular,
        @xtelefono_titular = xtelefono_titular, @xcorreo_titular = xcorreo_titular, @cproductor = cproductor, @ptasamon = ptasamon,
        @ifrecuencia = ifrecuencia, @femision = femision, @api = api, @method = method, @cprog = cprog, @ifuente = ifuente, @fingreso = fingreso,
        @cpoliza = cpoliza, @cnpoliza = cnpoliza, @cproces = cproces, @pcomision = pcomision, @cramo = cramo, @mprimaext = mprimaext,
        @corigen_rel = corigen_rel, @ccanalalt = ccanalalt, @cscanalalt = cscanalalt, @ctipocanal = ctipocanal, @msumaaseg = msumaaseg,
        @fdesde = fdesde, @fhasta = fhasta, @cusuario = cusuario
        FROM TMEMISION_PERSONAS_GENERAL WHERE id = @id

        IF @@ROWCOUNT = 0
        BEGIN
            BEGIN THROW 50001, 'No existe registro en TMEMISION_PERSONAS_GENERAL para el @id enviado.', 1; END
        END

        SELECT @msfp = 0, @mpfp = 0, @mpfpext = 0, @mpfpret = 0, @mpfpretext = 0, @mcfp = 0, @mcfpext = 0, @mifp = 0,
        @mifpext = 0, @msretesp = 0, @msretespext = 0, @mpretesp = 0, @mpretespext = 0, @itipocont = 'RET', @pcoa = 0

        SET @ifrecuencia = UPPER(LEFT(LTRIM(RTRIM(COALESCE(@ifrecuencia, 'A'))), 1))
        SET @cuotas = CASE @ifrecuencia
            WHEN 'M' THEN 12
            WHEN 'T' THEN 4
            WHEN 'C' THEN 3
            WHEN 'S' THEN 2
            WHEN 'A' THEN 1
            WHEN 'E' THEN 1
            ELSE 1
        END
        IF ISNULL(@cuotas, 0) <= 0 SET @cuotas = 1

        SELECT @cprog = 'TEmision_Per_Ge'

        IF @femision IS NULL BEGIN
            SET @femision = CAST(GETDATE() AS DATE)
        END

        IF @fdesde IS NULL BEGIN
            SET @fdesde = CAST(@femision AS DATE)
        END

        IF @fhasta IS NULL BEGIN
            SET @fhasta = DATEADD(YEAR, 1, @fdesde)
        END

        SET @fdesde_pol = @fdesde
        SET @fhasta_pol = @fhasta

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
        -- Determinar tasa de cambio real de USD a BS para conversiones
        IF @ptasamon IS NOT NULL AND @ptasamon > 1.0
        BEGIN
            SET @tasa_cambio = @ptasamon;
        END
        ELSE
        BEGIN
            SET @tasa_cambio = (SELECT ptasamon FROM mamonedas WHERE cmoneda = '$');
        END

        -- Validar y asegurar tasa de cambio correcta (1.0 para bolívares)
        IF TRIM(@cmoneda) IN ('Bs', 'BS')
        BEGIN
            SET @ptasamon = 1.0;
        END
        ELSE IF @ptasamon IS NULL OR @ptasamon = 0
        BEGIN
            SET @ptasamon = @tasa_cambio;
        END

        SELECT @mcomision = 0
        SELECT @mcomisionext = 0
        SELECT @pcomision = pcomision from maarancel WHERE cramo = @cramo and iestado = 'V'

        SELECT @cramoint = cramoint from maramos WHERE cramo = @cramo

        IF (@ccanalalt IS NOT NULL) SELECT @ctipocanal = ctipocanal FROM macanalalt WHERE ccanalalt = @ccanalalt
        SELECT @cgestor = cgestor FROM magestor WHERE ccanalalt = @ccanalalt and cscanalalt = @cscanalalt
        IF (@ccanalalt IS NULL) SELECT @cgestor = cgestor, @ctipocanal = ctipocanal, @ccanalalt = ccanalalt, @cscanalalt = cscanalalt
        FROM magestor WHERE cgestor = CONCAT(@cproductor, '-0-0')

        IF (@cproductor = 80080 OR @cproductor IS NULL)
        BEGIN
            SET @ctipocanal = 'D';
        END

        -- Sucursal real: misma regla que sp_pre_emision_personas_general_nexus (cnpoliza).
        IF (@ccanalalt IS NOT NULL)
            SELECT @csucur = COALESCE(csucur, 1) FROM macanalalt WHERE ccanalalt = @ccanalalt
        ELSE
            SELECT @csucur = COALESCE(csucur, 1) FROM maproduc WHERE cproductor = @cproductor
        IF (@csucur IS NULL) SET @csucur = 1

        -- Productor directo: sin comisión (misma regla que sp_genera_adpolrea_nexus).
        IF (@cproductor = 80080 OR @cproductor IS NULL) SET @pcomision = 0

        -- Usuario de la emisión (pre-SP @cusuario); 7 solo si no vino.
        IF (@cusuario IS NULL) SET @cusuario = 7
        SELECT @ccategoria = COALESCE((SELECT TOP 1 ccategoria FROM seusuarios WHERE cusuario = @cusuario), 1)

        IF (@femision IS NULL) SELECT @femision = GETDATE()
        IF (@icedula_tomador IS NULL) SELECT @icedula_titular = 'V'
        IF (@icedula_titular IS NULL) SELECT @icedula_titular = 'V'

        -- Beneficiario preferencial: rif real de BENF; si no hay, 0 (no copiar titular)
        SET @xrif_beneficiario = NULL
        SELECT TOP 1 @xrif_beneficiario = xrif_beneficiario
        FROM TMEMISION_PERSONAS_GENERAL_BENF WITH (NOLOCK)
        WHERE id = @id
          AND ISNULL(xrif_beneficiario, 0) > 0
        ORDER BY xrif_beneficiario

        IF @xrif_beneficiario IS NULL SET @xrif_beneficiario = 0
        SET @cbeneficiario = CASE WHEN @xrif_beneficiario > 999999999 THEN 0 ELSE @xrif_beneficiario END

        -- CREACION DEL CLIENTE
        IF (@xrif_titular IS NOT NULL) BEGIN
            select @xcliente_titular = concat(@xnombre_titular, ' ', @xapellido_titular)
            EXEC sp_create_maclient_nexus @icedula_titular, @xrif_titular, @xnombre_titular, @xapellido_titular, @xcliente_titular, @isexo_titular,
            @iestado_civil_titular, @fnac_titular, @xcorreo_titular, 58, @cestado_titular, @cciudad_titular, @xdireccion_titular, null,
            @xtelefono_titular, @ifuente, NULL
        END

        -- CREACION DEL TOMADOR
        IF (@xrif_tomador IS NOT NULL) BEGIN
            select @xcliente_tomador = concat(@xnombre_tomador, ' ', @xapellido_tomador)
            EXEC sp_create_maclient_nexus @icedula_tomador, @xrif_tomador, @xnombre_tomador, @xapellido_tomador, @xcliente_tomador, @isexo_tomador,
            @iestado_civil_tomador, @fnac_tomador, @xcorreo_tomador, 58, @cestado_tomador, @cciudad_tomador, @xdireccion_tomador, null,
            @xtelefono_tomador, @ifuente, NULL
        END ELSE BEGIN
            SELECT @xrif_tomador = @xrif_titular
        END

        -- SE CREA LA POLIZA
        IF (@cpoliza IS NOT NULL) BEGIN

            INSERT INTO adpoliza
            (cpoliza, fanopol, fmespol, u_version, cramo, cnpoliza, cproces, cplan, itipoprod, itipopol, itiponegocio, clider,
            cpolizalider, istatpol, iestado, itipoingreso, cpoliza_mae, ccerti_mae, itiporen, iperren, ccauren, iestadoren,
            csucur, csucurrec, criesgo, cpolnum, cultcert, casegurado, ctenedor, cbeneficiario, cacreedor, cfinanciera, cproductor,
            czonaprod, cejecta, cmoneda, ptasamon, forigen, fdesde, fhasta, itipoanul, canula, idevolucion,
            iformadevo, qcuotas, ifrecuencia, itipovenprima, iestadovenprima, icalculoedad, igemi, iqgemi, iapligemi, mgemi,
            mgemiext, cprog, ifuente, fingreso, cusuario, ccategoria, cnpoliza_rel, corigen_rel, ccanalalt, ctipocanal)

            SELECT
            @cpoliza, @fano, @fmes, '!', @cramo, @cnpoliza, @cproces, @cplan, 'NU', 'I', 'DI', 0,
            0, 'V', 'V', 'N', 0, 0, 'A', 1, 0, 'N',
            @csucur, @csucur, 0, 0, 0, @xrif_titular, @xrif_tomador, @xrif_beneficiario, 0, 0, @cproductor,
            0, 0, @cmoneda, @ptasamon, @femision, @FDESDE_POL, @FHASTA_POL, 'N', 0, 'P',
            'N', @cuotas, @ifrecuencia, 'N', 'N', 'R', 'N', 'N', 'N', 0,
            0, @cprog, @ifuente, getdate(), @cusuario, @ccategoria, @cnpoliza_rel, @corigen_rel, @ccanalalt, @ctipocanal

            INSERT INTO sopoliza
            (cproces, u_version, cpoliza, fanopol, fmespol, cramo, cplan, itipoprod, itipopol, itiponegocio, clider, cpolizalider,
            istatpol, iestado, itipoingreso, cpoliza_mae, ccerti_mae, cloteren, itiporen, iperren, ccauren, iestadoren, csucur,
            cpolnum, cultcert, casegurado, ctenedor, cbeneficiario, cacreedor, cfinanciera, cproductor, czonaprod, cejecta,
            cmoneda, ptasamon, forigen, fdesde, fhasta, idevolucion, femisionp, qcuotas, ifrecuencia, itipovenprima, iestadovenprima,
            icalculoedad, bcom_plan, cproducto, isumaman, msumaman, msumamanext, itarifa, igemi, iqgemi, iapligemi, mgemi, mgemiext,
            cprog, ifuente, fingreso, cusuario, ccategoria)

            SELECT
            @cproces, '!', @cpoliza, @fano, @fmes, @cramo, @cplan, 'SO', 'I', 'DI', 0, 0,
            'V', 'V', 'N', 0, 0, 0, 'A', 1, 0, 'N', @csucur,
            0, 0, @xrif_titular, @xrif_tomador, @xrif_beneficiario, 0, 0, @cproductor, 0, 0,
            @cmoneda, @ptasamon, @femision, @fdesde_pol, @fhasta_pol, 'P', @femision, @cuotas, @ifrecuencia, 'N', 'N',
            'R', 0, 0, 0, 0, 0, 0, 'N', 'N', 'N', 0, 0,
            @cprog, @ifuente, getdate(), @cusuario, @ccategoria
 
            -- SE CREA EL CERTIFICADO DE PERSONAS
            INSERT INTO nbcerti
            (
                cramo, cpoliza, fanopol, fmespol, ccerti, u_version, itipoprod,
                cproces, casegurado, ctenedor, cbeneficiario, istatcer,
                fdesde, fhasta, femision, fingreso, cusuario, ccategoria
            )
            VALUES
            (
                @cramo, @cpoliza, @fano, @fmes, 0, '!', 'NU',
                @cproces, @xrif_titular, @xrif_tomador, @xrif_beneficiario, 'V',
                @fdesde_pol, @fhasta_pol, @femision, GETDATE(), @cusuario, @ccategoria
            );

--------------------------------------------------------------------------------------------------------------------------------------------
-- CARGA LOS ASEGURADOS SEGUN LA POLIZA
--------------------------------------------------------------------------------------------------------------------------------------------

            -- CARGA LOS ASEGURADOS
            IF EXISTS(SELECT * FROM maclient WHERE cci_rif = @xrif_titular OR cid = @icedula_titular + '-' + CONVERT(VARCHAR,@xrif_titular)) BEGIN
                INSERT INTO peasegurados
                (
                    cpoliza, fanopol, fmespol, iclaseaseg, casegurado, nmenor, u_version, ccerti, ctitular, cproces, cramo, cnpoliza, fnacimiento,
                    csexo, cestado_civil, cparentesco, iestadoren, fdesde, fhasta, falta, fbaja, xobserva, xobsimp, bobsimp, iestado, cprog,
                    ifuente, bok, cerror, fingreso, cusuario, ccategoria, cusuarioauto, ccategoriaauto, fultmod, cusuariomod, ccategoriamod
                ) SELECT
                    cpoliza, fanopol, fmespol, 'T', cl.cci_rif, 0, '!', 0, a.casegurado, cproces, cramo, cnpoliza,
                    -- Fecha enviada en la emisión (la misma que cotizó/validó); maclient solo como respaldo.
                    COALESCE(
                        (SELECT TOP 1 x.fnac_asegurado FROM TMEMISION_PERSONAS_GENERAL_ASEG x
                         WHERE x.id = @id AND x.xrif_asegurado = cl.cci_rif AND x.fnac_asegurado IS NOT NULL),
                        @fnac_titular,
                        cl.fnacimiento
                    ),
                    cl.isexo, cl.iestado_civil, 1, iestadoren, fdesde, fhasta, fdesde, null, null, null, null, 'V', a.cprog,
                    a.ifuente, a.bok, a.cerror, GETDATE(), a.cusuario, a.ccategoria, a.cusuarioauto, a.ccategoriaauto, a.fultmod, a.cusuariomod, a.ccategoriamod
                FROM adpoliza a
                INNER JOIN maclient cl ON cl.cci_rif = a.casegurado
                WHERE cpoliza = @cpoliza
            END

            IF EXISTS(SELECT * FROM TMEMISION_PERSONAS_GENERAL_ASEG WHERE id = @id) BEGIN
                DECLARE cursito CURSOR FOR
                SELECT DISTINCT(xrif_asegurado) from TMEMISION_PERSONAS_GENERAL_ASEG WHERE id = @id

                OPEN cursito
                FETCH NEXT FROM cursito INTO @caseg

                WHILE @@FETCH_STATUS = 0
                BEGIN
                    -- SELECT
                    -- @icedula_asegurado = icedula_asegurado, @xrif_asegurado = xrif_asegurado, @xnombre_asegurado = xnombre_asegurado,
                    -- @xapellido_asegurado = xapellido_asegurado, @fnac_asegurado = fnac_asegurado, @isexo_asegurado = isexo_asegurado,
                    -- @nparentesco_asegurado = nparentesco_asegurado, @iestado_civil_asegurado = iestado_civil_asegurado
                    -- FROM eePoliza_Salud_Aseg WHERE xrif_asegurado = @caseg

                    -- select @xcliente_asegurado = concat(@xnombre_asegurado, ' ', @xapellido_asegurado)
                    -- EXEC sp_create_maclient_nexus @icedula_asegurado, @xrif_asegurado, @xnombre_asegurado, @xapellido_asegurado,
                    -- @xcliente_asegurado, @isexo_asegurado, @iestado_civil_asegurado, @fnac_asegurado, null, 58, null, null, null, null,
                    -- @xtelefono_asegurado, @ifuente, 0

                    SELECT 
                        @icedula = icedula_asegurado,
                        @cci_rif = xrif_asegurado,
                        @xnombre = xnombre_asegurado,
                        @xapellido = xapellido_asegurado,
                        @xcliente = CONCAT(xnombre_asegurado, ' ', xapellido_asegurado),
                        @isexo = isexo_asegurado,
                        @iestado_civil = iestado_civil_asegurado,
                        @fnac = fnac_asegurado,
                        @xcorreo = xcorreo_asegurado,
                        @cpais = 58,
                        @cestado = cestado_asegurado,
                        @cciudad = cciudad_asegurado,
                        @xdireccion = xdireccion_asegurado,
                        @czonapos = null,
                        @xtelefono = xtelefono_asegurado,
                        @nparentesco_asegurado = nparentesco_asegurado,
                        @npeso = npeso_asegurado,
                        @nestatura = nestatura_asegurado,
                        @ifuente = @ifuente,
                        @cid = CONCAT(icedula_asegurado, '-', xrif_asegurado)
                    FROM TMEMISION_PERSONAS_GENERAL_ASEG WHERE xrif_asegurado = @caseg and id = @id

                    EXEC sp_create_maclient_nexus
                        @icedula = @icedula,
                        @cci_rif = @cci_rif,
                        @xnombre = @xnombre,
                        @xapellido = @xapellido,
                        @xcliente = @xcliente,
                        @isexo = @isexo,
                        @iestado_civil = @iestado_civil,
                        @fnac = @fnac,
                        @xcorreo = @xcorreo,
                        @cpais = @cpais,
                        @cestado = @cestado,
                        @cciudad = @cciudad,
                        @xdireccion = @xdireccion,
                        @czonapos = @czonapos,
                        @xtelefono = @xtelefono,
                        @ifuente = @ifuente,
                        @cid = @cid,
                        @npeso = @npeso,
                        @nestatura = @nestatura

                    IF NOT EXISTS(SELECT * FROM peasegurados WHERE casegurado = @caseg AND cpoliza = @cpoliza) BEGIN
                        INSERT INTO peasegurados
                        (
                            cpoliza, fanopol, fmespol, iclaseaseg, casegurado, nmenor, u_version, ccerti, ctitular, cproces, cramo, cnpoliza, fnacimiento,
                            csexo, cestado_civil, cparentesco, iestadoren, fdesde, fhasta, falta, fbaja, xobserva, xobsimp, bobsimp, iestado, cprog,
                            ifuente, bok, cerror, fingreso, cusuario, ccategoria, cusuarioauto, ccategoriaauto, fultmod, cusuariomod, ccategoriamod
                        ) SELECT
                            cpoliza, fanopol, fmespol, 'B', cl.cci_rif, 0, '!', 0, a.casegurado, cproces, cramo, cnpoliza,
                            COALESCE(@fnac, cl.fnacimiento),
                            cl.isexo, cl.iestado_civil, @nparentesco_asegurado, iestadoren, fdesde, fhasta, fdesde, null, null, null, null, 'V', a.cprog,
                            a.ifuente, a.bok, a.cerror, GETDATE(), a.cusuario, a.ccategoria, a.cusuarioauto, a.ccategoriaauto, a.fultmod, a.cusuariomod, a.ccategoriamod
                        FROM adpoliza a
                        INNER JOIN maclient cl ON cl.cci_rif = @caseg
                        WHERE cpoliza = @cpoliza
                    END

                    FETCH NEXT FROM cursito INTO @caseg
                END
                CLOSE cursito
                DEALLOCATE cursito
            END

--------------------------------------------------------------------------------------------------------------------------------------------
-- CARGA LOS BENEFICIARIOS SEGUN LA POLIZA
--------------------------------------------------------------------------------------------------------------------------------------------

            -- CARGA LOS BENEFICIARIOS SEGUN LA POLIZA
            IF EXISTS(SELECT * FROM TMEMISION_PERSONAS_GENERAL_BENF WHERE id = @id) BEGIN
                SELECT @nbeneficia = 1

                DECLARE cursito1 CURSOR FOR
                SELECT DISTINCT(xrif_beneficiario) from TMEMISION_PERSONAS_GENERAL_BENF WHERE id = @id

                OPEN cursito1
                FETCH NEXT FROM cursito1 INTO @cben

                WHILE @@FETCH_STATUS = 0
                BEGIN
                    -- SELECT
                    -- @icedula_beneficiario = icedula_beneficiario, @xrif_beneficiario = xrif_beneficiario, @xnombre_beneficiario = xnombre_beneficiario,
                    -- @xapellido_beneficiario = xapellido_beneficiario, @fnac_beneficiario = fnac_beneficiario, @isexo_beneficiario = isexo_beneficiario,
                    
                    -- FROM eePoliza_Salud_Ben WHERE xrif_beneficiario = @cben

                    -- select @xcliente_beneficiario = concat(@xnombre_beneficiario, ' ', @xapellido_beneficiario)
                    -- EXEC sp_create_maclient_nexus @icedula_beneficiario, @xrif_beneficiario, @xnombre_beneficiario, @xapellido_beneficiario,
                    -- @xcliente_beneficiario, @isexo_beneficiario, null, @fnac_beneficiario, null, 58, null, null, null, null,
                    -- null, @ifuente, 0

                    SELECT 
                        @icedula = icedula_beneficiario,
                        @cci_rif = xrif_beneficiario,
                        @xnombre = xnombre_beneficiario,
                        @xapellido = xapellido_beneficiario,
                        @xcliente = CONCAT(xnombre_beneficiario, ' ', xapellido_beneficiario),
                        @isexo = isexo_beneficiario,
                        @iestado_civil = iestado_civil_beneficiario,
                        @fnac = fnac_beneficiario,
                        @xcorreo = xcorreo_beneficiario,
                        @cpais = 58,
                        @cestado = cestado_beneficiario,
                        @cciudad = cciudad_beneficiario,
                        @xdireccion = xdireccion_beneficiario,
                        @czonapos = null,
                        @xtelefono = xtelefono_beneficiario,
                        @ifuente = @ifuente,
                        @cid = CONCAT(icedula_beneficiario, '-', xrif_beneficiario),
                        @nparentesco_beneficiario = nparentesco_beneficiario, 
                        @pporce_beneficiario = pporce_beneficiario
                    FROM TMEMISION_PERSONAS_GENERAL_BENF WHERE xrif_beneficiario = @cben and id = @id

                    EXEC sp_create_maclient_nexus
                        @icedula = @icedula,
                        @cci_rif = @cci_rif,
                        @xnombre = @xnombre,
                        @xapellido = @xapellido,
                        @xcliente = @xcliente,
                        @isexo = @isexo,
                        @iestado_civil = @iestado_civil,
                        @fnac = @fnac,
                        @xcorreo = @xcorreo,
                        @cpais = @cpais,
                        @cestado = @cestado,
                        @cciudad = @cciudad,
                        @xdireccion = @xdireccion,
                        @czonapos = @czonapos,
                        @xtelefono = @xtelefono,
                        @ifuente = @ifuente,
                        @cid = @cid

                    IF NOT EXISTS(SELECT * FROM pebenefi WHERE casegurado = @cben AND cnpoliza = @cnpoliza) BEGIN
                        INSERT INTO pebenefi
                        (
                            cpoliza, fanopol, fmespol, iclaseaseg, casegurado, nmenor, cbeneficia, nbeneficia, u_version, xnombre, fnacimiento,
                            csexo, cparentesco, cramo, cnpoliza, pporce, fdesde, fhasta, falta, fbaja, xobserva, xobsimp, bobsimp, igenera_cid,
                            fingreso, cusuario, ccategoria, cusuarioauto, ccategoriaauto, fultmod, cusuariomod, ccategoriamod
                        ) SELECT
                            cpoliza, fanopol, fmespol, 'B', casegurado, 0, cl.cci_rif, @nbeneficia, '!', xnombre, fnacimiento,
                            cl.isexo, @nparentesco_beneficiario, cramo, cnpoliza, @pporce_beneficiario, fdesde, fhasta, fdesde, null, xobserva, null, null, 'N',
                            GETDATE(), a.cusuario, a.ccategoria, a.cusuarioauto, a.ccategoriaauto, a.fultmod, a.cusuariomod, a.ccategoriamod
                        FROM adpoliza a
                        INNER JOIN maclient cl ON cl.cci_rif = @cben
                        WHERE cpoliza = @cpoliza
                    END

                    SELECT @nbeneficia = @nbeneficia + 1
                    FETCH NEXT FROM cursito1 INTO @cben
                END
                CLOSE cursito1
                DEALLOCATE cursito1
            END

            -- CALCULO DE FECHAS SEGUN FRECUENCIA Y CANT. CUOTAS
            SELECT @FDESDE_REC = @FDESDE_POL
            SELECT @FHASTA_REC = CONVERT(datetime, DATEADD(MM, 12 / @cuotas, @FDESDE_POL))

            IF (@ifrecuencia = 'E') BEGIN
                SELECT @FDESDE_REC = @fdesde
                SELECT @FHASTA_REC = @fhasta
                SELECT @cuotas = 1
            END

            SELECT @nrecibo = 1, @ncuo = 1
            SELECT @IESTADOREC = 'P', @FCOBRO = NULL  -- pendiente: sin fecha de cobro hasta que se cobre
            SELECT @msumatabla = @msumaaseg

            WHILE (@nrecibo <= @cuotas) BEGIN
                SELECT @nrecibo = @nrecibo + 1

                -- SELECT @qcontador = qcontador FROM MACONTADORES WHERE ccontador = 'CRECIBO'
                -- SELECT @qcontador = @qcontador + 1
                -- UPDATE MACONTADORES SET qcontador = @qcontador WHERE ccontador = 'CRECIBO'
                -- SELECT @crecibo = CONVERT(VARCHAR, @cramo) + CONVERT(VARCHAR, FORMAT(@qcontador, '0000000000'))

                -- SELECT @qcontador = qcontador FROM MACONTADORES WHERE ccontador = 'RECIBO'
                -- SELECT @qcontador = @qcontador + 1
                -- UPDATE MACONTADORES SET qcontador = @qcontador WHERE ccontador = 'RECIBO'
                -- SELECT @cnrecibo = CONVERT(VARCHAR, @cramo) + '-' + CONVERT(VARCHAR, FORMAT(@qcontador, '000000000'))

                -- EXEC adB_calcula_num_contad_nexus @cramo, @itipopol, @csucur, 0, 7, @cnrecibo OUTPUT,@crecibo OUTPUT, @CERROR OUTPUT

                EXEC sp_contador_nexus @cpoliza_o OUTPUT, @cnpoliza_o OUTPUT, @crecibo OUTPUT, @cnrecibo OUTPUT, @cproces_rec OUTPUT , @csucur, @fdesde, @cramo, @POL_RAMO

                -- ====================================================================
                -- v3: coberturas por TARIFA y por ASEGURADO (ramas general y viajero).
                -- La prima de cada tarifa sale de su propia ctablatar y de la edad y el
                -- parentesco de ese asegurado (ya no se suman todas las tarifas de la cobertura).
                --   pepoltar_ind : asegurado + cobertura + tarifa. Prima de la tarifa, recargo y
                --                  descuento del asegurado (% de TMEMISION_PERSONAS_GENERAL_ASEG),
                --                  mprimabruta = prima + recargo - descuento. Sin comisión.
                --   pepolcob_ind : asegurado + cobertura. Suma de mprimabruta de sus tarifas y la
                --                  comisión (maarancel) sobre esa suma (0 si el productor es 80080).
                --   adpoltar     : por tarifa, suma de todos los asegurados.
                --   adpolcob     : por cobertura, suma de pepolcob_ind (la comisión va aquí).
                -- ====================================================================
                IF OBJECT_ID('tempdb..#pt_base') IS NOT NULL DROP TABLE #pt_base

                CREATE TABLE #pt_base (
                    ccober CHAR(4) COLLATE DATABASE_DEFAULT NOT NULL, ctarifa CHAR(4) COLLATE DATABASE_DEFAULT NOT NULL,
                    iclaseaseg CHAR(1) COLLATE DATABASE_DEFAULT NOT NULL, casegurado NUMERIC(11,0) NOT NULL, nmenor SMALLINT NOT NULL, ccerti NUMERIC(9,0) NOT NULL,
                    msumaasegext NUMERIC(18,2) NOT NULL DEFAULT 0, mprimaext NUMERIC(18,2) NOT NULL DEFAULT 0,
                    precargo NUMERIC(13,2) NOT NULL DEFAULT 0, pdescuento NUMERIC(13,2) NOT NULL DEFAULT 0,
                    mrecargoext NUMERIC(18,2) NOT NULL DEFAULT 0, mdescuentoext NUMERIC(18,2) NOT NULL DEFAULT 0,
                    mprima NUMERIC(18,2) NOT NULL DEFAULT 0, mrecargo NUMERIC(18,2) NOT NULL DEFAULT 0, mdescuento NUMERIC(18,2) NOT NULL DEFAULT 0,
                    mprimabrutaext NUMERIC(18,2) NOT NULL DEFAULT 0, mprimabruta NUMERIC(18,2) NOT NULL DEFAULT 0
                )

                IF @cramo = 25 AND @cplan = 'VIAJE' AND @fdesde IS NOT NULL AND @fhasta IS NOT NULL
                BEGIN
                    -- Valida vigencia, parentesco y edad de cada asegurado (igual que antes).
                    DECLARE cursito_viaje CURSOR FOR
                    SELECT cparentesco, DATEDIFF(YEAR, fnacimiento, GETDATE()), casegurado
                    FROM peasegurados
                    WHERE cpoliza = @cpoliza

                    OPEN cursito_viaje
                    FETCH NEXT FROM cursito_viaje INTO @cparen_aseg, @nedad_aseg, @xrif_aseg

                    WHILE @@FETCH_STATUS = 0
                    BEGIN
                        EXEC sp_calculo_viajero_prorrata_nexus
                            @cramo = @cramo,
                            @cplan = @cplan,
                            @fdesde = @fdesde,
                            @fhasta = @fhasta,
                            @cparen = @cparen_aseg,
                            @nedad_asegurado = @nedad_aseg,
                            @xrif_asegurado = @xrif_aseg,
                            @ptasamon = @ptasamon,
                            @ndias = @ndias_aseg OUTPUT,
                            @mprimaext = @mprimaext_aseg OUTPUT,
                            @mprima = @mprima_aseg OUTPUT,
                            @berror = @berror_aseg OUTPUT,
                            @mensaje = @mensaje_aseg OUTPUT;

                        IF @berror_aseg = 1
                        BEGIN
                            DECLARE @errMsg NVARCHAR(250) = COALESCE(@mensaje_aseg, 'Error en sp_calculo_viajero_prorrata_nexus');
                            THROW 50002, @errMsg, 1;
                        END

                        FETCH NEXT FROM cursito_viaje INTO @cparen_aseg, @nedad_aseg, @xrif_aseg
                    END
                    CLOSE cursito_viaje
                    DEALLOCATE cursito_viaje

                    SET @ndias_viaje = DATEDIFF(DAY, @fdesde, @fhasta) + 1
                    SET @tasa_prima = COALESCE(@ptasamon, 1.0)

                    -- Viajero: prima de la tarifa = días de vigencia x tarifa diaria de su ctablatar para la edad.
                    INSERT INTO #pt_base (ccober, ctarifa, iclaseaseg, casegurado, nmenor, ccerti, msumaasegext, mprimaext)
                    SELECT x.ccober, x.ctarifa, x.iclaseaseg, x.casegurado, x.nmenor, x.ccerti,
                           COALESCE(x.msuma, 0),
                           ROUND(@ndias_viaje * COALESCE(x.mprima, 0), 2)
                    FROM (
                        SELECT c.ccobertura AS ccober, c.ctarifa, p.iclaseaseg, p.casegurado, p.nmenor, p.ccerti,
                               te.msuma, te.mprima,
                               ROW_NUMBER() OVER (
                                   PARTITION BY c.ccobertura, c.ctarifa, p.iclaseaseg, p.casegurado, p.nmenor, p.ccerti
                                   ORDER BY c.fdesde_tar DESC) AS rn
                        FROM peasegurados p
                        INNER JOIN mapltarifas_per c ON c.cplan = @cplan AND c.cramo = @cramo AND c.cparen = p.cparentesco
                        INNER JOIN (SELECT DISTINCT ccobertura FROM maplcober_per WHERE cplan = @cplan AND cramo = @cramo) cb
                                ON cb.ccobertura = c.ccobertura
                        OUTER APPLY (
                            SELECT TOP 1 d.msuma, d.mprima
                            FROM mapltabedad_d d
                            WHERE d.ctablaedad = c.ctablatar
                              AND DATEDIFF(YEAR, p.fnacimiento, GETDATE()) BETWEEN d.nedad_min AND d.nedad_max
                        ) te
                        WHERE p.cpoliza = @cpoliza
                    ) x
                    WHERE x.rn = 1
                END
                ELSE IF EXISTS(SELECT * FROM maplcober_per WHERE cramo = @cramo AND cplan = @cplan) BEGIN
                    SET @tasa_prima = @tasa_cambio

                    -- General: sin suma asegurada, prima de la tabla de edad; con suma asegurada, suma x pprima / 100.
                    INSERT INTO #pt_base (ccober, ctarifa, iclaseaseg, casegurado, nmenor, ccerti, msumaasegext, mprimaext)
                    SELECT x.ccober, x.ctarifa, x.iclaseaseg, x.casegurado, x.nmenor, x.ccerti,
                           CASE WHEN @msumatabla IS NULL THEN COALESCE(x.msuma, 0)
                                WHEN @cmoneda <> 'Bs' THEN @msumatabla
                                ELSE ROUND(@msumatabla / @tasa_cambio, 2) END,
                           ROUND(
                               CASE WHEN @msumatabla IS NULL THEN COALESCE(x.mprima, 0)
                                    ELSE (CASE WHEN @cmoneda <> 'Bs' THEN @msumatabla ELSE @msumatabla / @tasa_cambio END)
                                         * COALESCE(x.pprima, 0) / 100
                               END / @cuotas, 2)
                    FROM (
                        SELECT c.ccobertura AS ccober, c.ctarifa, p.iclaseaseg, p.casegurado, p.nmenor, p.ccerti,
                               te.msuma, te.mprima, te.pprima,
                               ROW_NUMBER() OVER (
                                   PARTITION BY c.ccobertura, c.ctarifa, p.iclaseaseg, p.casegurado, p.nmenor, p.ccerti
                                   ORDER BY c.fdesde_tar DESC) AS rn
                        FROM peasegurados p
                        INNER JOIN mapltarifas_per c ON c.cplan = @cplan AND c.cramo = @cramo AND c.cparen = p.cparentesco
                        INNER JOIN (SELECT DISTINCT ccobertura FROM maplcober_per WHERE cplan = @cplan AND cramo = @cramo) cb
                                ON cb.ccobertura = c.ccobertura
                        OUTER APPLY (
                            SELECT TOP 1 d.msuma, d.mprima, d.pprima
                            FROM mapltabedad_d d
                            WHERE d.ctablaedad = c.ctablatar
                              AND DATEDIFF(YEAR, p.fnacimiento, GETDATE()) BETWEEN d.nedad_min AND d.nedad_max
                        ) te
                        WHERE p.cpoliza = @cpoliza
                    ) x
                    WHERE x.rn = 1
                END

                -- % de recargo y descuento de cada asegurado (TMEMISION_PERSONAS_GENERAL_ASEG).
                -- Si el asegurado se repite en _ASEG se toma la primera fila (por nasegurado).
                UPDATE b
                SET precargo = COALESCE(s.precargo, 0),
                    pdescuento = COALESCE(s.pdescuento, 0)
                FROM #pt_base b
                OUTER APPLY (
                    SELECT TOP 1 q.precargo, q.pdescuento
                    FROM TMEMISION_PERSONAS_GENERAL_ASEG q
                    WHERE q.id = @id AND q.xrif_asegurado = b.casegurado
                    ORDER BY q.nasegurado
                ) s

                -- Montos: prima base +/- el % del asegurado. El recibo ya no vuelve a sumar el recargo.
                UPDATE #pt_base
                SET mrecargoext = ROUND(mprimaext * precargo / 100, 2),
                    mdescuentoext = ROUND(mprimaext * pdescuento / 100, 2)

                UPDATE #pt_base
                SET mprima = ROUND(mprimaext * @tasa_prima, 2),
                    mrecargo = ROUND(mrecargoext * @tasa_prima, 2),
                    mdescuento = ROUND(mdescuentoext * @tasa_prima, 2)

                UPDATE #pt_base
                SET mprimabrutaext = mprimaext + mrecargoext - mdescuentoext,
                    mprimabruta = mprima + mrecargo - mdescuento

                -- pepoltar_ind: una fila por asegurado, cobertura y tarifa (sin comisión).
                INSERT INTO pepoltar_ind
                (
                    crecibo, iclaseaseg, casegurado, nmenor, ccerti, ccober, ctarifa, u_version, cramo, cproces, cpoliza, fanopol, fmespol,
                    cnpoliza, cnrecibo, csucur, cmoneda, ptasamon, fdesde, fhasta, msumaaseg, msumaasegext, mprima, mprimaext, pprima,
                    bfraded, mdedu_fran, mdedu_franext, pdedu_fran, mdescuento, mdescuentoext, pdescuento, mrecargo, mrecargoext, precargo,
                    mprimabruta, mprimabrutaext, pcomision, mcomision, mcomisionext, isuma, istattar, cramoint, ccoberturaint, ctarifaint,
                    cprog, ifuente, bok, cerror, fingreso, cusuario, ccategoria, cusuarioauto, ccategoriaauto, fultmod, cusuariomod,
                    ccategoriamod
                )
                SELECT
                    @crecibo, b.iclaseaseg, b.casegurado, b.nmenor, b.ccerti, b.ccober, b.ctarifa, '!', a.cramo, a.cproces, a.cpoliza, a.fanopol, a.fmespol,
                    a.cnpoliza, @cnrecibo, a.csucur, a.cmoneda, a.ptasamon, @fdesde_rec, @fhasta_rec, ROUND(b.msumaasegext * @tasa_cambio, 2), b.msumaasegext, b.mprima, b.mprimaext, fd.pprima,
                    fd.bfraded, fd.mdedu_fran, fd.mdedu_franext, fd.pdedu_fran, b.mdescuento, b.mdescuentoext, b.pdescuento, b.mrecargo, b.mrecargoext, b.precargo,
                    b.mprimabruta, b.mprimabrutaext, 0, 0, 0, f.isuma, 'V', f.cramoint, f.ccoberturaint, f.ctarifaint,
                    a.cprog, a.ifuente, 0, 0, GETDATE(), a.cusuario, a.ccategoria, NULL, NULL, NULL, NULL,
                    NULL
                FROM #pt_base b
                INNER JOIN adpoliza a ON a.cpoliza = @cpoliza
                CROSS APPLY (
                    SELECT TOP 1 m.isuma, m.cramoint, m.ccoberturaint, m.ctarifaint
                    FROM matarifa m
                    WHERE m.ccober = b.ccober AND m.cramo = a.cramo AND m.ctarifa = b.ctarifa
                ) f
                CROSS APPLY (
                    SELECT TOP 1 m.pprima, m.bfraded, m.mdedu_fran, m.mdedu_franext, m.pdedu_fran
                    FROM matarifa_d m
                    WHERE m.ccober = b.ccober AND m.cramo = a.cramo AND m.ctarifa = b.ctarifa
                ) fd

                -- pepolcob_ind: por asegurado y cobertura, suma de sus tarifas + comisión de la cobertura.
                INSERT INTO pepolcob_ind
                (
                    crecibo, iclaseaseg, casegurado, nmenor, ccerti, ccober, u_version, cramo, cproces, cpoliza,
                    fanopol, fmespol, cnpoliza, cnrecibo, csucur, cmoneda, ptasamon, fdesde, fhasta, itipoprod,
                    msumaaseg, msumaasegext, mprimabruta, mprimabrutaext, pcomision, mcomision, mcomisionext,
                    mprimareas, mprimareasext, iestado, isuma, ccontrea, cramorea, cramopcnd, ccoberpcnd, cramoint,
                    ccoberturaint, btarifaok, cprog, ifuente, bok, cerror, fingreso, cusuario, ccategoria,
                    cusuarioauto, ccategoriaauto, fultmod, cusuariomod, ccategoriamod
                )
                SELECT
                    @crecibo, t.iclaseaseg, t.casegurado, t.nmenor, t.ccerti, t.ccober, '!', a.cramo, a.cproces, a.cpoliza,
                    a.fanopol, a.fmespol, a.cnpoliza, @cnrecibo, a.csucur, a.cmoneda, a.ptasamon, @fdesde_rec, @fhasta_rec, a.itipoprod,
                    t.msumaaseg, t.msumaasegext, t.mprimabruta, t.mprimabrutaext, k.pcomision,
                    ROUND(t.mprimabruta * k.pcomision / 100, 2), ROUND(t.mprimabrutaext * k.pcomision / 100, 2),
                    t.mprimabruta, t.mprimabrutaext, 'V', c.isuma, c.ccontrea, c.cramorea, c.cramopcnd, c.ccoberpcnd, c.cramoint,
                    c.ccoberturaint, NULL, a.cprog, a.ifuente, 0, 0, GETDATE(), a.cusuario, a.ccategoria,
                    NULL, NULL, NULL, NULL, NULL
                FROM (
                    SELECT iclaseaseg, casegurado, nmenor, ccerti, ccober,
                           MAX(msumaaseg) AS msumaaseg, MAX(msumaasegext) AS msumaasegext,
                           SUM(mprimabruta) AS mprimabruta, SUM(mprimabrutaext) AS mprimabrutaext
                    FROM pepoltar_ind
                    WHERE crecibo = @crecibo
                    GROUP BY iclaseaseg, casegurado, nmenor, ccerti, ccober
                ) t
                INNER JOIN adpoliza a ON a.cpoliza = @cpoliza
                INNER JOIN macoberturas c ON c.ccobertura = t.ccober AND c.cramo = a.cramo
                CROSS APPLY (
                    SELECT pcomision = CASE
                        WHEN @cproductor = 80080 OR @cproductor IS NULL THEN CAST(0 AS NUMERIC(9,2))
                        ELSE COALESCE((
                            SELECT TOP 1 d.pcomision
                            FROM maarancel d
                            WHERE d.cramo = a.cramo AND d.iestado = 'V'
                              AND (d.ctarifa = '0')
                              AND (d.ccober = '0' OR d.ccober = t.ccober)
                              AND (d.cproductor = 0 OR d.cproductor = a.cproductor)
                              AND (d.ctipoprod = 0)
                              AND (d.cplan = '0' OR d.cplan = a.cplan)
                            ORDER BY CASE WHEN d.ccober <> '0' THEN 0 ELSE 1 END,
                                     CASE WHEN d.cplan <> '0' THEN 0 ELSE 1 END,
                                     CASE WHEN d.cproductor <> 0 THEN 0 ELSE 1 END
                        ), 0)
                    END
                ) k

                -- adpoltar: por tarifa, suma de todos los asegurados (la prima no se repite).
                INSERT INTO adpoltar
                (
                    crecibo, ccober, ctarifa, u_version, cramo, cpoliza, fanopol, fmespol, ccerti, ccoberimp, ietiqtarimp, qordenimp,
                    cnpoliza, cnrecibo, cproces, csucur, cmoneda, ptasamon, itipoprod, fdesde, fhasta, itiporiesg, priesg, msumabruta,
                    msumabrutaext, msumaaseg, msumaasegext, mprima, mprimaext, pprima, bfraded, mdedu_fran, mdedu_franext, pdedu_fran,
                    mdescuento, mdescuentoext, pdescuento, mrecargo, mrecargoext, precargo, mprimabruta, mprimabrutaext, pcomision,
                    mcomision, mcomisionext, bprimarea, mprimareas, mprimareasext, istattar, isuma, cramoint, ccoberturaint, ctarifaint,
                    cprog, ifuente, bok, cerror, fingreso, cusuario, ccategoria, cusuarioauto, ccategoriaauto, fultmod, cusuariomod,
                    ccategoriamod
                )
                SELECT
                    @crecibo, t.ccober, t.ctarifa, '!', a.cramo, a.cpoliza, a.fanopol, a.fmespol, 0, f.ccoberimp, f.ietiqtarimp, f.qordenimp,
                    a.cnpoliza, @cnrecibo, a.cproces, a.csucur, a.cmoneda, a.ptasamon, a.itipoprod, @fdesde_rec, @fhasta_rec, 'N', 0, t.msumaaseg,
                    t.msumaasegext, t.msumaaseg, t.msumaasegext, t.mprima, t.mprimaext, fd.pprima, fd.bfraded, fd.mdedu_fran, fd.mdedu_franext, fd.pdedu_fran,
                    t.mdescuento, t.mdescuentoext,
                    -- % efectivo de la tarifa (promedio ponderado por prima de los asegurados)
                    CASE WHEN t.mprimaext = 0 THEN 0 ELSE ROUND(t.mdescuentoext * 100.0 / t.mprimaext, 2) END,
                    t.mrecargo, t.mrecargoext,
                    CASE WHEN t.mprimaext = 0 THEN 0 ELSE ROUND(t.mrecargoext * 100.0 / t.mprimaext, 2) END,
                    t.mprimabruta, t.mprimabrutaext, 0,
                    0, 0, f.bprimarea, t.mprimabruta, t.mprimabrutaext, 'V', f.isuma, f.cramoint, f.ccoberturaint, f.ctarifaint,
                    a.cprog, a.ifuente, 0, 0, GETDATE(), a.cusuario, a.ccategoria, NULL, NULL, NULL, NULL,
                    NULL
                FROM (
                    SELECT ccober, ctarifa,
                           SUM(msumaaseg) AS msumaaseg, SUM(msumaasegext) AS msumaasegext,
                           SUM(mprima) AS mprima, SUM(mprimaext) AS mprimaext,
                           SUM(mdescuento) AS mdescuento, SUM(mdescuentoext) AS mdescuentoext,
                           SUM(mrecargo) AS mrecargo, SUM(mrecargoext) AS mrecargoext,
                           SUM(mprimabruta) AS mprimabruta, SUM(mprimabrutaext) AS mprimabrutaext
                    FROM pepoltar_ind
                    WHERE crecibo = @crecibo
                    GROUP BY ccober, ctarifa
                ) t
                INNER JOIN adpoliza a ON a.cpoliza = @cpoliza
                CROSS APPLY (
                    SELECT TOP 1 m.ccoberimp, m.ietiqtarimp, m.qordenimp, m.bprimarea, m.isuma, m.cramoint, m.ccoberturaint, m.ctarifaint
                    FROM matarifa m
                    WHERE m.ccober = t.ccober AND m.cramo = a.cramo AND m.ctarifa = t.ctarifa
                ) f
                CROSS APPLY (
                    SELECT TOP 1 m.pprima, m.bfraded, m.mdedu_fran, m.mdedu_franext, m.pdedu_fran
                    FROM matarifa_d m
                    WHERE m.ccober = t.ccober AND m.cramo = a.cramo AND m.ctarifa = t.ctarifa
                ) fd

                -- adpolcob: por cobertura, suma de pepolcob_ind, con la comisión en la cobertura.
                INSERT INTO adpolcob
                (
                    crecibo, ccober, u_version, cramo, cpoliza, fanopol, fmespol, ccerti, cnpoliza, cnrecibo, cproces, csucur, cmoneda,
                    ptasamon, fdesde, fhasta, itipoprod, msumaaseg, msumaasegext, mprimabruta, mprimabrutaext, pcomision, mcomision,
                    mcomisionext, mprimareas, mprimareasext, iestado, isuma, ccontrea, cramorea, cramopcnd, ccoberpcnd, cramoint,
                    ccoberturaint, cprog, ifuente, bok, cerror, fingreso, cusuario, ccategoria, cusuarioauto, ccategoriaauto, fultmod,
                    cusuariomod, ccategoriamod
                )
                SELECT
                    @crecibo, t.ccober, '!', a.cramo, a.cpoliza, a.fanopol, a.fmespol, 0, a.cnpoliza, @cnrecibo, a.cproces, a.csucur, a.cmoneda,
                    a.ptasamon, @fdesde_rec, @fhasta_rec, a.itipoprod, t.msumaaseg, t.msumaasegext, t.mprimabruta, t.mprimabrutaext, t.pcomision, t.mcomision,
                    t.mcomisionext, t.mprimabruta, t.mprimabrutaext, 'V', c.isuma, c.ccontrea, c.cramorea, c.cramopcnd, c.ccoberpcnd, c.cramoint,
                    c.ccoberturaint, a.cprog, a.ifuente, 0, 0, GETDATE(), a.cusuario, a.ccategoria, NULL, NULL, NULL,
                    NULL, NULL
                FROM (
                    SELECT ccober,
                           SUM(msumaaseg) AS msumaaseg, SUM(msumaasegext) AS msumaasegext,
                           SUM(mprimabruta) AS mprimabruta, SUM(mprimabrutaext) AS mprimabrutaext,
                           MAX(pcomision) AS pcomision,
                           SUM(mcomision) AS mcomision, SUM(mcomisionext) AS mcomisionext
                    FROM pepolcob_ind
                    WHERE crecibo = @crecibo
                    GROUP BY ccober
                ) t
                INNER JOIN adpoliza a ON a.cpoliza = @cpoliza
                INNER JOIN macoberturas c ON c.ccobertura = t.ccober AND c.cramo = a.cramo

                DROP TABLE #pt_base


                SELECT @mprimarec = SUM(mprimabruta) FROM adpolcob WHERE crecibo = @crecibo
                SELECT @mprimarecext = SUM(mprimabrutaext) FROM adpolcob WHERE crecibo = @crecibo

                SET @mdescuentorecext = @mdescuentoext / @cuotas
                SET @mrecargorecext = @mrecargoext / @cuotas
                SET @mmontonetorecext = @mmontonetoext / @cuotas

                SET @mdescuentorec = @mdescuentoext / @cuotas * @tasa_cambio
                SET @mrecargorec = @mrecargoext / @cuotas * @tasa_cambio
                SET @mmontonetorec = @mmontonetoext / @cuotas * @tasa_cambio

                SELECT @mcomision = @mprimarec * (@pcomision / 100)
                SELECT @mcomisionext = @mprimarecext * (@pcomision / 100)

                SELECT @msumaaseg = MAX(msumaaseg) FROM adpolcob WHERE crecibo = @crecibo
                SELECT @msumaasegext = MAX(msumaasegext) FROM adpolcob WHERE crecibo = @crecibo

                -- No emitir con prima 0 (sin tarifa para edad/parentesco): rollback por el CATCH.
                IF ISNULL(@mprimarecext, 0) <= 0
                BEGIN
                    DECLARE @errPrima NVARCHAR(250) = CONCAT(
                        'Prima del recibo en 0 para el plan ', RTRIM(@cplan), ' ramo ', @cramo,
                        ': revise edad y parentesco de los asegurados contra la tarifa del plan.');
                    THROW 50003, @errPrima, 1;
                END

                INSERT INTO ADRECIBOS
                (crecibo, u_version, cnpoliza, cnrecibo, cpoliza, fanopol, fmespol, cramo, itipoprod, itiponegocio, itipopol,
                iestadoren, cpoliza_mae, ccerti_mae, itiporec, imodcobro, cdoccob, csucur, csucurrec, criesgo, ccerti, cproces,
                cserie_rea, casegurado, ctenedor, cbeneficiario, cacreedor, cfinanciera, cplan, cproductor, ctipoproductor,
                czonaprod, csupervisor, crecaudador, cregion, ccentserv, cmercado, cprofesion, cactividad, cgrupoecono, cempresa,
                cpais, cestado, cciudad, ccorregi, cbarriada, czonpos, cmoneda, ptasamon, femision, fdesde, fhasta, fdesde_pol, fhasta_pol,
                itipoanul, nlote, iestcont, fcobro, iestadorec, ifinanciado, idevolucion, iformadevo, msumabruta, msumabrutaext,
                msumacoa, msumacoaext, msumaneta, msumanetaext, mprimabruta, mprimabrutaext, mprimacoa, mprimacoaext, pcoa,
                mprimaneta, mprimanetaext, mprimabruta_emi, mprimacoa_emi, mprimaneta_emi, pretcoa, pcomision, mcomision, mcomisionext, mcompart, mcompartext, mprimareas,
                mprimareasext, mprimareas_c, mprimareasext_c, mprimareas_n, mprimareasext_n, mpret, mpretext, mpcedida, mpcedidaext,
                mpfp, mpfpext, potrosrec, motrosrec, motrosrecext, potrosdes, motrosdes, motrosdesext, pgastos, mgastos, mgastosext, potrosgas,
                motrosgas, motrosgasext, mgemi, mgemiext, pgemi, mmontoneto, mmontonetoext, mimpuesto, pimpuesto, mimpuestoext,
                mmontorec, mmontorecext, mabono, mabonoext, mmontoapag, mmontoapagext, mprimadev, mprimadevext, mprimadif, mprimadifext,
                fpago, mpagado, mpagadoext, mpendiente, mpendientext, mpagcoa, mpagcoaext, pinteres, minteres, minteresext, bobsimp,
                iestadoimp, cforcob, czona_cobro, cbanco, cagenban, itipocta, itarjeta, qcuotas, cprog, ifuente, fingreso, cusuario,
                ifrecuencia, cnrecibo_rel, cgestor, ctipocanal, ccanalalt, cscanalalt, fdesde_dev, fhasta_dev, pbono, mbono, mbonoext)

                SELECT
                @crecibo, '!', @cnpoliza, @cnrecibo, @cpoliza, @fano, @fmes, @cramo, 'NU', 'DI', 'I',
                'N', 0, 0, 'P', 'IN', 0, @csucur, @csucur, 0, 0, @cproces,
                0, @xrif_titular, @xrif_tomador, @xrif_beneficiario, 0, 0, @cplan, @CPRODUCTOR, 0,
                0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0, 0, 0, @cmoneda, @ptasamon, @femision, @FDESDE_REC, @FHASTA_REC, @FDESDE_POL, @FHASTA_POL,
                'N', 0, 'P', @FCOBRO, @IESTADOREC, 0, 'P', 'N', @msumaaseg, @msumaasegext,
                0, 0, @msumaaseg, @msumaasegext, @mprimarec, @mprimarecext, 0, 0, 0,
                @mprimarec, @mprimarecext, @mprimarec, 0, @mprimarec, 100, @pcomision, @mcomision, @mcomisionext, 0, 0, @mprimarec,
                @mprimarecext, 0, 0, @mprimarec, @mprimarecext, @mprimarec, @mprimarecext, 0, 0,
                0, 0, @precargo, @mrecargorec, @mrecargorecext, @pdescuento, @mdescuentorec, @mdescuentorecext, 0, 0, 0, 0,
                0, 0, 0, 0, 0, @mprimarec, @mprimarecext, 0, 0, 0,
                @mprimarec, @mprimarecext, 0, 0, @mprimarec, @mprimarecext, 0, 0, 0, 0,
                @fcobro, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0, 0, 'N', 'N', @ncuo, @cprog, @ifuente, getdate(), @cusuario,
                @ifrecuencia, @cnrecibo_rel, @cgestor, @ctipocanal, @ccanalalt, @cscanalalt, @fdesde_rec, @fhasta_rec, 0, 0, 0

                -- Corrección de montos netos y tasas de cambio para Personas
                UPDATE adrecibos 
                SET 
                    mmontoneto = mprimaneta, 
                    mmontonetoext = mprimanetaext,
                    mprimabruta_emi = mprimabruta,
                    cserie_rea = @fano,
                    ccategoria = COALESCE((SELECT ccategoria FROM seusuarios WHERE cusuario = adrecibos.cusuario), 1),
                    ptasamon = CASE WHEN TRIM(cmoneda) IN ('Bs', 'BS') THEN 1.0 ELSE ptasamon END,
                    ptasamon_pago = CASE WHEN TRIM(cmoneda) IN ('Bs', 'BS') THEN @tasa_cambio ELSE ptasamon_pago END,
                    mprimacoa_emi = 0,
                    mprimaneta_emi = COALESCE(mprimaneta_emi, mprimaneta),
                    mbono = COALESCE(mbono, 0),
                    mbonoext = COALESCE(mbonoext, 0),
                    pbono = COALESCE(pbono, 0),
                    mcomision = COALESCE(mcomision, 0),
                    mcomisionext = COALESCE(mcomisionext, 0),
                    pcomision = COALESCE(pcomision, 0)
                WHERE crecibo = @crecibo;

                UPDATE adpoliza
                SET ptasamon = CASE WHEN TRIM(cmoneda) IN ('Bs', 'BS') THEN 1.0 ELSE ptasamon END
                WHERE cpoliza = @cpoliza;

                -- Ejecutar el reaseguro optimizado específico de Nexus
                EXEC sp_genera_adpolrea_nexus @crecibo

                SELECT @ncuo = @ncuo + 1
                SELECT @FDESDE_REC = CONVERT(DATE, DATEADD(MM, 12 / @cuotas, @FDESDE_REC))
                SELECT @FHASTA_REC = CONVERT(DATE, DATEADD(MM, 12 / @cuotas, @FHASTA_REC))
            END

            EXEC sp_genera_coberturas_siniestro_personas_nexus @cpoliza, @fano, @fmes
        END

        SELECT cpoliza, cnpoliza, cnrecibo, cproces, qcuotas, fanopol, fmespol FROM adrecibos WHERE cpoliza = @cpoliza and qcuotas = 1

        -- ====================================================================
        -- Finaliza el bloque de codigo original
        -- ====================================================================
        COMMIT TRANSACTION;
        SET @pSuccess = 1;
        SET @pErrorMessage = NULL;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        SET @pSuccess = 0;
        SET @pErrorMessage = ERROR_MESSAGE();

        -- Opcional: puedes relanzar el error si quieres que la aplicacion tambien lo vea
        THROW;
    END CATCH
END
