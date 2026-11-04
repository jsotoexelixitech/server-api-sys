-- sp_emision_condominio_nexus: el cuadro de la póliza muestra la tasa aplicada en las coberturas del reparto por
-- antigüedad de Condominio (ramo 16), en lugar de la tasa de matarifa_d. El resto de las coberturas no cambia.
-- Generado a partir de la definición vigente en Sis2000_QA (2026-11-04): solo cambian los dos cálculos de pprima y su JOIN.
-- La versión de docs/sql/condominio-cotizacion-preestablecida.sql está desactualizada respecto a la base.
--
-- ORDEN: aplicar antes condominio-tasas-antiguedad.sql. Sin esa tabla este SP fallaría al emitir.
-- PRODUCCIÓN: comparar antes con la definición de allá; esta se generó desde QA.

-- Si falta la tabla, NOEXEC evita que se ejecute el resto del script (un THROW no detiene los lotes siguientes).
IF OBJECT_ID('dbo.MATARIFA_REPARTO_NEXUS', 'U') IS NULL
BEGIN
    RAISERROR('Aplica primero condominio-tasas-antiguedad.sql: falta MATARIFA_REPARTO_NEXUS.', 16, 1);
    SET NOEXEC ON;
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

        DECLARE @usa_cotizacion BIT = 0;
        CREATE TABLE #temp_calculo_ult (
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
        -- Cada cobertura paga la cuota redondeada en las primeras cuotas y la ÚLTIMA cuota absorbe el ajuste de redondeo,
        -- de modo que la suma de cuotas de cada cobertura sea exactamente el valor anual cotizado.
        IF EXISTS (SELECT 1 FROM dbo.TMEMISION_CONDOMINIO_COB_NEXUS WHERE id_condominio = @id)
        BEGIN
            SET @usa_cotizacion = 1;
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
                -- Coberturas del reparto por antigüedad: tasa realmente aplicada (prima anual / suma de la cobertura)
                CASE WHEN rep.ccober IS NOT NULL AND s.msumaasegext > 0
                     THEN CAST(s.mprimabrutaext * 100 / s.msumaasegext AS NUMERIC(13, 6))
                     ELSE ISNULL(td.pprima, 0)
                END, s.pcomision,
                s.mcomisionext / @cuotas, (s.mcomisionext / @cuotas) * @ptasamon
            FROM dbo.TMEMISION_CONDOMINIO_COB_NEXUS s
            INNER JOIN dbo.macoberturas c ON c.cramo = @cramo AND c.ccobertura = s.ccober
            INNER JOIN dbo.matarifa t ON t.cramo = @cramo AND t.ccober = s.ccober AND t.ctarifa = s.ctarifa
            LEFT JOIN dbo.MATARIFA_REPARTO_NEXUS rep ON rep.cramo = @cramo AND rep.ccober = RTRIM(s.ccober) AND rep.ctarifa = RTRIM(s.ctarifa)
            OUTER APPLY (
                SELECT TOP 1 d.pprima
                FROM dbo.matarifa_d d
                WHERE d.cramo = @cramo AND d.ccober = s.ccober AND d.ctarifa = s.ctarifa AND d.iestado = 'V'
                ORDER BY d.fdesde DESC
            ) td
            WHERE s.id_condominio = @id;

            -- Valores de la ÚLTIMA cuota = anual - (cuotas - 1) × cuota redondeada
            INSERT INTO #temp_calculo_ult (
                ccober, xcobertura, ctarifa, xtarifa,
                msumabrutaext, msumabruta, mprimabrutaext, mprimabruta,
                mdescuentoext, mdescuento, mrecargoext, mrecargo,
                mprimaext, mprima, pprima, pcomision, mcomisionext, mcomision
            )
            SELECT
                s.ccober, RTRIM(c.xdescripcion_l), s.ctarifa, RTRIM(t.xtarifa),
                s.msumaasegext, s.msumaasegext * @ptasamon,
                s.mprimabrutaext - (@cuotas - 1) * ROUND(s.mprimabrutaext / @cuotas, 2),
                ROUND(s.mprimabrutaext * @ptasamon, 2) - (@cuotas - 1) * ROUND((s.mprimabrutaext / @cuotas) * @ptasamon, 2),
                s.mdescuentoext - (@cuotas - 1) * ROUND(s.mdescuentoext / @cuotas, 2),
                ROUND(s.mdescuentoext * @ptasamon, 2) - (@cuotas - 1) * ROUND((s.mdescuentoext / @cuotas) * @ptasamon, 2),
                s.mrecargoext - (@cuotas - 1) * ROUND(s.mrecargoext / @cuotas, 2),
                ROUND(s.mrecargoext * @ptasamon, 2) - (@cuotas - 1) * ROUND((s.mrecargoext / @cuotas) * @ptasamon, 2),
                s.mprimaext - (@cuotas - 1) * ROUND(s.mprimaext / @cuotas, 2),
                ROUND(s.mprimaext * @ptasamon, 2) - (@cuotas - 1) * ROUND((s.mprimaext / @cuotas) * @ptasamon, 2),
                -- Coberturas del reparto por antigüedad: tasa realmente aplicada (prima anual / suma de la cobertura)
                CASE WHEN rep.ccober IS NOT NULL AND s.msumaasegext > 0
                     THEN CAST(s.mprimabrutaext * 100 / s.msumaasegext AS NUMERIC(13, 6))
                     ELSE ISNULL(td.pprima, 0)
                END, s.pcomision,
                s.mcomisionext - (@cuotas - 1) * ROUND(s.mcomisionext / @cuotas, 2),
                ROUND(s.mcomisionext * @ptasamon, 2) - (@cuotas - 1) * ROUND((s.mcomisionext / @cuotas) * @ptasamon, 2)
            FROM dbo.TMEMISION_CONDOMINIO_COB_NEXUS s
            INNER JOIN dbo.macoberturas c ON c.cramo = @cramo AND c.ccobertura = s.ccober
            INNER JOIN dbo.matarifa t ON t.cramo = @cramo AND t.ccober = s.ccober AND t.ctarifa = s.ctarifa
            LEFT JOIN dbo.MATARIFA_REPARTO_NEXUS rep ON rep.cramo = @cramo AND rep.ccober = RTRIM(s.ccober) AND rep.ctarifa = RTRIM(s.ctarifa)
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
            -- Última cuota con cotización preestablecida: toma los valores que absorben el redondeo.
            IF @usa_cotizacion = 1 AND @cuotas > 1 AND @nrecibo = @cuotas
            BEGIN
                DELETE FROM #temp_calculo_cuota;
                INSERT INTO #temp_calculo_cuota SELECT * FROM #temp_calculo_ult;
            END

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

SET NOEXEC OFF;
GO
