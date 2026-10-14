-- =============================================================================
-- sp_emision_personas_general_nexus — v2: correcciones de la revisión de La Mundial
-- Fecha: 2026-10-05 · Solicitado por: Exélixi (emisión personas vía nest-api)
-- Base: versión 2026-10-01 (CTITULAR / CCERTI en PEASEGURADOS).
--
-- Aplica a TODAS las emisiones de personas que entran por
-- sp_pre_emision_personas_general_nexus (funerario, vida, AP, viajero, etc.).
-- Caso revisado: póliza 25-27-27100015781 / 25-27-27100016017 (VIAJE3, canal 27 OS_LMDS).
--
-- Cambios respecto a la versión 2026-10-01 (nada más cambia):
--   1. cproces: el recibo conserva el cproces de la póliza. sp_contador_nexus se sigue
--      llamando en el ciclo del recibo (para crecibo/cnrecibo), pero su cproces va a
--      una variable aparte (@cproces_rec) y ya no pisa el de la póliza.
--   2. Sucursal: @csucur deja de ser 1 fijo. Se toma del canal (macanalalt.csucur) o
--      del productor (maproduc.csucur), la misma regla que usa el pre-SP para armar
--      cnpoliza. Se graba en csucur/csucurrec de adpoliza, sopoliza y adrecibos, y se
--      usa para cnrecibo.
--   3. adrecibos.criesgo = 0 (antes 3 fijo), igual que adpoliza.
--   4. Recibo pendiente sin fechas de cobro: fcobro, fpago y fpago_aseg quedan NULL
--      hasta que se cobre (antes se llenaban con femision).
--   5. adrecibos.mprimacoa_emi = 0 (antes = mprimaneta). No hay negocios en coaseguro.
--   6. Productor directo (80080) sin comisión: pcomision/mcomision/mcomisionext en 0
--      en adpoltar, adpolcob y adrecibos. Es la misma regla que ya aplica
--      sp_genera_adpolrea_nexus.
--   7. Usuario: cusuario sale de TMEMISION_PERSONAS_GENERAL.cusuario (el pre-SP ya lo
--      recibe en @cusuario); si viene NULL se mantiene 7. ccategoria desde seusuarios.
--
-- Requisitos antes de aplicar (ver docs/sql/diag-sp-emision-personas-v2.sql):
--   - adrecibos.fcobro, fpago y fpago_aseg deben aceptar NULL.
--   - Aplicar junto con sp_genera_adpolrea_nexus v2 (deja de rellenar fcobro con femision).
--   - Igual que la versión base: solo donde peasegurados.ctitular exista.
-- =============================================================================
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

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
        @i_cob INT, @ctablatar_viaje CHAR(10), @nedad_viaje INT

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

                IF @cramo = 25 AND @cplan = 'VIAJE' AND @fdesde IS NOT NULL AND @fhasta IS NOT NULL
                BEGIN
                    SELECT @mprima = 0, @mprimaext = 0
                    SET @mprima_acum = 0
                    SET @mprimaext_acum = 0

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

                        SET @mprimaext_acum = @mprimaext_acum + @mprimaext_aseg
                        SET @mprima_acum = @mprima_acum + @mprima_aseg

                        FETCH NEXT FROM cursito_viaje INTO @cparen_aseg, @nedad_aseg, @xrif_aseg
                    END
                    CLOSE cursito_viaje
                    DEALLOCATE cursito_viaje

                    -- Usar @mprimaext_acum para las tablas
                    SELECT @cant_coberturas = COUNT(DISTINCT ccobertura)
                    FROM maplcober_per
                    WHERE cplan = @cplan AND cramo = @cramo

                    IF @cant_coberturas = 0 SET @cant_coberturas = 1

                    SET @mprimaext_restante = @mprimaext_acum
                    SET @mprima_restante = @mprima_acum
                    SET @i_cob = 1

                    DECLARE cursito3 CURSOR FOR
                    select distinct(ccobertura) from maplcober_per where cplan = @cplan AND cramo = @cramo

                    OPEN cursito3
                    FETCH NEXT FROM cursito3 INTO @ncobertura

                    WHILE @@FETCH_STATUS = 0
                    BEGIN
                        IF @i_cob = @cant_coberturas
                        BEGIN
                            SET @mprimaext_tar = @mprimaext_restante
                            SET @mprima_tar = @mprima_restante
                        END
                        ELSE
                        BEGIN
                            SET @mprimaext_tar = ROUND(@mprimaext_acum / @cant_coberturas, 2)
                            SET @mprima_tar = ROUND(@mprima_acum / @cant_coberturas, 2)
                            SET @mprimaext_restante = @mprimaext_restante - @mprimaext_tar
                            SET @mprima_restante = @mprima_restante - @mprima_tar
                        END

                        -- Buscar ctablatar y edad para el titular en esta cobertura
                        SELECT TOP 1 @ctablatar_viaje = t.ctablatar, @nedad_viaje = DATEDIFF(YEAR, p.fnacimiento, GETDATE())
                        FROM mapltarifas_per t
                        INNER JOIN peasegurados p ON p.cpoliza = @cpoliza AND p.cparentesco = t.cparen
                        WHERE t.cplan = @cplan AND t.cramo = @cramo AND t.ccobertura = @ncobertura
                          AND p.cparentesco = 1;

                        IF @ctablatar_viaje IS NULL
                        BEGIN
                            SELECT TOP 1 @ctablatar_viaje = t.ctablatar, @nedad_viaje = DATEDIFF(YEAR, p.fnacimiento, GETDATE())
                            FROM mapltarifas_per t
                            INNER JOIN peasegurados p ON p.cpoliza = @cpoliza AND p.cparentesco = t.cparen
                            WHERE t.cplan = @cplan AND t.cramo = @cramo AND t.ccobertura = @ncobertura;
                        END

                        -- Por cada cobertura del plan VIAJE, igual que spCalculoPer:
                        SELECT @msumaasegext = msuma
                        FROM mapltabedad_d
                        WHERE ctablaedad = @ctablatar_viaje
                          AND @nedad_viaje BETWEEN nedad_min AND nedad_max;

                        IF @msumaasegext IS NULL SET @msumaasegext = 0;
                        SET @msumaaseg = @msumaasegext * @tasa_cambio;

                        SET @mdescuentoext_tar = (@mprimaext_tar * @pdescuento_cob / 100)
                        SET @mrecargoext_tar = (@mprimaext_tar * @precargo_cob / 100)
                        SET @mprimabrutaext_tar = @mprimaext_tar - @mdescuentoext_tar + @mrecargoext_tar

                        SET @mdescuento_tar = @mdescuentoext_tar * @tasa_cambio
                        SET @mrecargo_tar = @mrecargoext_tar * @tasa_cambio
                        SET @mprimabruta_tar = @mprima_tar - @mdescuento_tar + @mrecargo_tar

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
                        SELECT DISTINCT
                            @crecibo, @ncobertura, f.ctarifa, '!', a.cramo, a.cpoliza, a.fanopol, a.fmespol, 0, f.ccoberimp, f.ietiqtarimp, f.qordenimp,
                            a.cnpoliza, @cnrecibo, a.cproces, a.csucur, a.cmoneda, a.ptasamon, a.itipoprod, @fdesde_rec, @fhasta_rec, 'N', 0, @msumaaseg,
                            @msumaasegext, @msumaaseg, @msumaasegext, @mprima_tar, @mprimaext_tar, fd.pprima, fd.bfraded, fd.mdedu_fran, fd.mdedu_franext, fd.pdedu_fran,
                            @mdescuento_tar, @mdescuentoext_tar, @pdescuento_cob, @mrecargo_tar, @mrecargoext_tar, @precargo_cob, @mprimabruta_tar, @mprimabrutaext_tar, CASE WHEN a.cproductor = 80080 THEN 0 ELSE d.pcomision END,
                            @mprimabruta_tar * CASE WHEN a.cproductor = 80080 THEN 0 ELSE d.pcomision END / 100, @mprimabrutaext_tar * CASE WHEN a.cproductor = 80080 THEN 0 ELSE d.pcomision END / 100, f.bprimarea, @mprimabruta_tar, @mprimabrutaext_tar, 'V', f.isuma, f.cramoint, f.ccoberturaint, f.ctarifaint,
                            a.cprog, a.ifuente, 0, 0, GETDATE(), a.cusuario, a.ccategoria, null, null, null, null,
                            null
                        FROM adpoliza a
                        LEFT JOIN maarancel d ON d.cramo = a.cramo and d.iestado = 'V'
                        INNER JOIN mapltarifas_per c ON c.cplan = a.cplan AND c.cramo = a.cramo and c.ccobertura = @ncobertura
                        INNER JOIN matarifa f ON f.ccober = c.ccobertura and f.cramo = a.cramo and f.ctarifa = c.ctarifa
                        INNER JOIN matarifa_d fd ON fd.ccober = c.ccobertura and fd.cramo = a.cramo and fd.ctarifa = c.ctarifa
                        WHERE a.cpoliza = @cpoliza
                        AND (d.ctarifa = '0' OR d.ctarifa = f.ctarifa)
                        AND (d.ccober = '0' OR d.ccober = f.ccober)
                        AND (d.cproductor = '0' OR d.cproductor = a.cproductor)
                        AND (d.ctipoprod = '0')
                        AND (d.cplan = '0' OR d.cplan = a.cplan)
                        AND (d.cramo = '0' OR d.cramo = a.cramo)

                        SET @i_cob = @i_cob + 1
                        FETCH NEXT FROM cursito3 INTO @ncobertura
                    END
                    CLOSE cursito3
                    DEALLOCATE cursito3
                END
                ELSE IF EXISTS(SELECT * FROM maplcober_per WHERE cramo = @cramo AND cplan = @cplan) BEGIN
                    SELECT @mprima = 0, @mprimaext = 0

                    DECLARE cursito3 CURSOR FOR
                    select distinct(ccobertura) from maplcober_per where cplan = @cplan AND cramo = @cramo

                    OPEN cursito3
                    FETCH NEXT FROM cursito3 INTO @ncobertura

                    WHILE @@FETCH_STATUS = 0
                    BEGIN
                        DECLARE cursito4 CURSOR FOR
                        select ctablatar, DATEDIFF(YEAR, peasegurados.fnacimiento, GETDATE()) from mapltarifas_per
                        INNER JOIN peasegurados ON peasegurados.cpoliza = @cpoliza AND peasegurados.cparentesco = mapltarifas_per.cparen
                        WHERE mapltarifas_per.cplan = @cplan AND mapltarifas_per.cramo = @cramo AND mapltarifas_per.ccobertura = @ncobertura

                        SELECT @mprimaext_tar = 0
                        OPEN cursito4
                        FETCH NEXT FROM cursito4 INTO @ctablatar, @nedad_asegurado

                        WHILE @@FETCH_STATUS = 0
                        BEGIN
                            IF @msumatabla is null BEGIN
                                SELECT @msumaasegext = msuma FROM mapltabedad_d
                                WHERE ctablaedad = @ctablatar and @nedad_asegurado >= nedad_min and @nedad_asegurado <= nedad_max;

                                SELECT @mprimaext_tar = mprima + @mprimaext_tar FROM mapltabedad_d
                                WHERE ctablaedad = @ctablatar and @nedad_asegurado >= nedad_min and @nedad_asegurado <= nedad_max;
                            END ELSE BEGIN
                                IF @cmoneda != 'Bs' BEGIN
                                    SELECT @msumaasegext = @msumaaseg
                                    SELECT @msumaaseg = @msumaaseg * @tasa_cambio
                                END ELSE BEGIN
                                    SELECT @msumaasegext = @msumaaseg / @tasa_cambio
                                End

                                SELECT @mprimaext_tar = @msumaasegext * pprima / 100 FROM mapltabedad_d
                                WHERE ctablaedad = @ctablatar and @nedad_asegurado >= nedad_min and @nedad_asegurado <= nedad_max;
                            END

                            FETCH NEXT FROM cursito4 INTO @ctablatar, @nedad_asegurado
                        END
                        CLOSE cursito4
                        DEALLOCATE cursito4

                        SET @msumaaseg = @msumaasegext * @tasa_cambio
                        SET @mprimaext_tar = @mprimaext_tar / @cuotas
                        SET @mdescuentoext_tar = (@mprimaext_tar * @pdescuento_cob / 100)
                        SET @mrecargoext_tar = (@mprimaext_tar * @precargo_cob / 100)
                        SET @mprimabrutaext_tar = @mprimaext_tar - @mdescuentoext_tar + @mrecargoext_tar

                        SET @mdescuento_tar = @mdescuentoext_tar * @tasa_cambio
                        SET @mrecargo_tar = @mrecargoext_tar * @tasa_cambio
                        SET @mprima_tar = @mprimaext_tar * @tasa_cambio
                        SET @mprimabruta_tar = @mprimabrutaext_tar * @tasa_cambio

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
                        SELECT DISTINCT
                            @crecibo, @ncobertura, f.ctarifa, '!', a.cramo, a.cpoliza, a.fanopol, a.fmespol, 0, f.ccoberimp, f.ietiqtarimp, f.qordenimp,
                            a.cnpoliza, @cnrecibo, a.cproces, a.csucur, a.cmoneda, a.ptasamon, a.itipoprod, @fdesde_rec, @fhasta_rec, 'N', 0, @msumaaseg,
                            @msumaasegext, @msumaaseg, @msumaasegext, @mprima_tar, @mprimaext_tar, fd.pprima, fd.bfraded, fd.mdedu_fran, fd.mdedu_franext, fd.pdedu_fran,
                            @mdescuento_tar, @mdescuentoext_tar, @pdescuento_cob, @mrecargo_tar, @mrecargoext_tar, @precargo_cob, @mprimabruta_tar, @mprimabrutaext_tar, CASE WHEN a.cproductor = 80080 THEN 0 ELSE d.pcomision END,
                            @mprimabruta_tar * CASE WHEN a.cproductor = 80080 THEN 0 ELSE d.pcomision END / 100, @mprimabrutaext_tar * CASE WHEN a.cproductor = 80080 THEN 0 ELSE d.pcomision END / 100, f.bprimarea, @mprimabruta_tar, @mprimabrutaext_tar, 'V', f.isuma, f.cramoint, f.ccoberturaint, f.ctarifaint,
                            a.cprog, a.ifuente, 0, 0, GETDATE(), a.cusuario, a.ccategoria, null, null, null, null,
                            null
                        FROM adpoliza a
                        LEFT JOIN maarancel d ON d.cramo = a.cramo and d.iestado = 'V'
                        INNER JOIN mapltarifas_per c ON c.cplan = a.cplan AND c.cramo = a.cramo and c.ccobertura = @ncobertura
                        INNER JOIN matarifa f ON f.ccober = c.ccobertura and f.cramo = a.cramo and f.ctarifa = c.ctarifa
                        INNER JOIN matarifa_d fd ON fd.ccober = c.ccobertura and fd.cramo = a.cramo and fd.ctarifa = c.ctarifa
                        WHERE a.cpoliza = @cpoliza
                        AND (d.ctarifa = '0' OR d.ctarifa = f.ctarifa)
                        AND (d.ccober = '0' OR d.ccober = f.ccober)
                        AND (d.cproductor = '0' OR d.cproductor = a.cproductor)
                        AND (d.ctipoprod = '0')
                        AND (d.cplan = '0' OR d.cplan = a.cplan)
                        AND (d.cramo = '0' OR d.cramo = a.cramo)

                        FETCH NEXT FROM cursito3 INTO @ncobertura
                    END
                    CLOSE cursito3
                    DEALLOCATE cursito3
                END

                INSERT INTO adpolcob
                (
                    crecibo, ccober, u_version, cramo, cpoliza, fanopol, fmespol, ccerti, cnpoliza, cnrecibo, cproces, csucur, cmoneda,
                    ptasamon, fdesde, fhasta, itipoprod, msumaaseg, msumaasegext, mprimabruta, mprimabrutaext, pcomision, mcomision,
                    mcomisionext, mprimareas, mprimareasext, iestado, isuma, ccontrea, cramorea, cramopcnd, ccoberpcnd, cramoint,
                    ccoberturaint, cprog, ifuente, bok, cerror, fingreso, cusuario, ccategoria, cusuarioauto, ccategoriaauto, fultmod,
                    cusuariomod, ccategoriamod
                )
                SELECT
                    crecibo, ccober, a.u_version, a.cramo, cpoliza, fanopol, fmespol, ccerti, cnpoliza, cnrecibo, cproces, csucur, a.cmoneda,
                    ptasamon, fdesde, fhasta, itipoprod, msumaaseg, msumaasegext, mprimabruta, mprimabrutaext, pcomision, mcomision,
                    mcomisionext, mprimareas, mprimareasext, istattar, c.isuma, ccontrea, cramorea, cramopcnd, ccoberpcnd, c.cramoint,
                    c.ccoberturaint, a.cprog, a.ifuente, a.bok, a.cerror, GETDATE(), a.cusuario, a.ccategoria, a.cusuarioauto, a.ccategoriaauto, a.fultmod,
                    a.cusuariomod, a.ccategoriamod
                FROM adpoltar a
                INNER JOIN macoberturas C ON C.ccobertura = a.ccober and C.cramo = a.cramo
                WHERE crecibo = @crecibo

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
GO
