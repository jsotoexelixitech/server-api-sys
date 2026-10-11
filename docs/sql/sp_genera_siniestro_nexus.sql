/* 2026-10-11 — Copia "_nexus" de spGeneraSiniestro (el original no se modifica; mismo criterio que RCV y funerario).
 * Cambio: en lugar de "fanopol = YEAR(GETDATE())" se exige que la póliza esté EN CURSO (la vigencia contiene HOY) y que la
 * fecha de ocurrencia caiga en esa misma vigencia. Así una póliza emitida en 2025 con vigencia hasta 2026 sí se acepta,
 * y los siniestros solo se declaran sobre pólizas en curso (decisión 2026-10-11).
 * Recibos: la declaración se acepta con recibos pendientes; el recibo cobrado se exige solo al pagar (D17).
 * NO invocar contra datos reales sin autorización: crea un siniestro.
 */
/*******************************************************************
 * Autor: Hamilton Leon
 * Fecha de creación: 31-07-2026
 * Fecha de última actualización: 
 * Descripción: Stored Procedure para la notificación de siniestro
 ******************************************************************/
CREATE OR ALTER PROCEDURE [dbo].[sp_genera_siniestro_nexus]
-- Parámetros de Entrada (Solicitados al usuario/aplicación)
@cnpoliza CHAR (30), @fnotificacion DATETIME, @focurencia DATETIME, @ccausa INT, @asegurado VARCHAR (50), @cmoneda CHAR (4), @cpais INT, @cestado INT, @cciudad INT, @xobserva VARCHAR (254), @mmontosiniestro NUMERIC (16, 2)=NULL, @mmontosiniestroext NUMERIC (16, 2)=NULL, @itiposiniestro CHAR (1), @cusuario NUMERIC (11, 0), @csinies NUMERIC (19, 0)=NULL OUTPUT, @cnsinies CHAR (30)=NULL OUTPUT, @cerror INT=0 OUTPUT, @msj VARCHAR (255)='' OUTPUT --Auditoria
 -- Parámetros de Salida
AS
BEGIN
    SET NOCOUNT ON;
    -- Variables Internas
    DECLARE @cpoliza AS NUMERIC (19, 0), @fanopol AS INT, @fmespol AS INT, @ramo AS INT, @casegurado AS NUMERIC (11, 0), @iclaseaseg AS CHAR (5), @nmenor AS INT, @ctenedor AS NUMERIC (11, 0), @cbeneficiario AS NUMERIC (11, 0), @cacreedor AS NUMERIC (11, 0), @itipopol AS CHAR (4), @fdesde AS DATE, @fhasta AS DATE, @ptasamon AS NUMERIC (16, 4), @cproductor AS NUMERIC (11, 0), @totreserva AS NUMERIC (16, 2), @totreservaext AS NUMERIC (16, 2), @ccerti AS NUMERIC (19, 0), @bok AS CHAR (1), @ifuente AS CHAR (10) = 'SpGenSin';
    BEGIN TRY
        -- 1. Inicialización de variables de salida
        SET @cerror = 0;
        SET @msj = '';
        -- Validaciones de SpValidaSiniestro
        -- Paso 1: Validar existencia y estado activo de la póliza
        IF NOT EXISTS (SELECT 1
                       FROM   adpoliza
                       WHERE  cnpoliza = @cnpoliza
                              AND iestado = 'V'
                              AND istatpol = 'V')
            BEGIN
                SET @cerror = 1;
                SET @msj = 'La póliza no existe o no se encuentra en estado activo.';
                GOTO LogAndExit;
            END
        -- Paso 2: Obtener datos internos de la póliza según la fecha de ocurrencia
        SELECT TOP 1 @cpoliza = pol.cpoliza,
                     @fanopol = pol.fanopol,
                     @fmespol = pol.fmespol,
                     @ramo = pol.cramo,
                     @itipopol = pol.itipopol,
                     @fdesde = pol.fdesde,
                     @fhasta = pol.fhasta,
                     @cproductor = pol.cproductor
        FROM   adpoliza AS pol
        WHERE  pol.cnpoliza = @cnpoliza
               AND pol.iestado = 'V'
               AND pol.istatpol = 'V'
               AND CONVERT (DATE, GETDATE()) BETWEEN pol.fdesde AND pol.fhasta
               AND CONVERT (DATE, @focurencia) BETWEEN pol.fdesde AND pol.fhasta
        ORDER BY pol.fanopol DESC, pol.fmespol DESC;
            -- Paso 2.1 Validar la existencia de la causa especificada 
            IF NOT EXISTS (SELECT 1
                        FROM   macausasin
                        WHERE  ccausa = @ccausa
                                AND cramo = @ramo)
                BEGIN
                    SET @cerror = 1;
                    SET @msj = 'La causa no existe o no se encuentra activa.';
                    GOTO LogAndExit;
                END
        -- Paso 3: Validar si la fecha de ocurrencia está dentro de la vigencia
        IF @cpoliza IS NULL
            BEGIN
                SET @cerror = 1;
                SET @msj = 'El asegurado no tiene cobertura, debido a que la póliza se encuentra fuera de vigencia.';
                GOTO LogAndExit;
            END
        -- Paso 3.1: Validamos si la poliza de la vigencia tiene el recibo cobrado
        /*IF NOT EXISTS (SELECT 1
                       FROM   adrecibos AS rec
                       WHERE  rec.cpoliza = @cpoliza
                              AND rec.fanopol = @fanopol
                              AND rec.fmespol = @fmespol
                              AND rec.iestadorec = 'C'
                              AND CONVERT (DATE, @focurencia) BETWEEN rec.fdesde AND rec.fhasta)
            BEGIN
                SET @cerror = 1;
                SET @msj = 'La póliza posee recibos pendiente para la fecha de ocurrencia del siniestro';
                GOTO LogAndExit;
            END*/
        -- Inicia la transacción
        BEGIN TRANSACTION;
        -- 2. Tasa de cambio y montos del siniestro
        IF @cmoneda <> 'BS'
            BEGIN
                SELECT @ptasamon = ptasamon
                FROM   mamonedas
                WHERE  cmoneda = @cmoneda;
                IF @ptasamon IS NULL
                   OR @ptasamon = 0
                    BEGIN
                        RAISERROR ('No se encontró tasa de cambio registrada para la moneda %s.', 16, 1, @cmoneda);
                    END
            END
        ELSE
            BEGIN
                SET @ptasamon = 1.0000;
            END
        IF @mmontosiniestro IS NULL
           AND @mmontosiniestroext IS NOT NULL
            BEGIN
                SET @mmontosiniestro = @mmontosiniestroext * @ptasamon;
            END
        IF @mmontosiniestroext IS NULL
           AND @mmontosiniestro IS NOT NULL
            BEGIN
                SET @mmontosiniestroext = @mmontosiniestro / @ptasamon;
            END
        -- Inicialización de montos de reserva -- 3. Obtener datos específicos según el ramo -- Ramos de Vehículo (ctiporamo = 7)
        IF @ramo IN (SELECT cramo
                     FROM   maramos
                     WHERE  ctiporamo = 7)
            BEGIN
                SELECT TOP 1 @ccerti = vh.ccerti,
                             @casegurado = vh.casegurado,
                             @iclaseaseg = 'T',
                             @ctenedor = vh.ctenedor,
                             @cbeneficiario = vh.cbeneficiario,
                             @cacreedor = vh.cacreedor
                FROM   vhcerti AS vh
                       LEFT OUTER JOIN
                       vinma AS inm
                       ON vh.cmarca = inm.cmarca
                          AND vh.cmodelo = inm.cmodelo
                          AND vh.cversion = inm.cversion
                          AND vh.cano = inm.cano
                       LEFT OUTER JOIN
                       maclient AS aseg
                       ON vh.casegurado = aseg.cci_rif
                WHERE  vh.cpoliza = @cpoliza
                       AND vh.fanopol = @fanopol
                       AND vh.fmespol = @fmespol
                       AND vh.xplaca = @asegurado;
            END
        -- Ramos de Personas / Salud / Vida (ctiporamo IN (2, 4))
        IF @ramo IN (SELECT cramo
                     FROM   maramos
                     WHERE  ctiporamo IN (2, 4))
            BEGIN
                SELECT TOP 1 @nmenor = aseg.nmenor,
                             @ccerti = aseg.ccerti,
                             @iclaseaseg = aseg.iclaseaseg,
                             @casegurado = aseg.casegurado,
                             @ctenedor = pol.ctenedor,
                             @cbeneficiario = pol.cbeneficiario,
                             @cacreedor = pol.cacreedor
                FROM   adpoliza AS pol
                       LEFT OUTER JOIN
                       peasegurados AS aseg
                       ON aseg.cpoliza = pol.cpoliza
                          AND aseg.fanopol = pol.fanopol
                          AND aseg.fmespol = pol.fmespol
                          AND aseg.iestado = 'V'
                       LEFT OUTER JOIN
                       maclient AS cli
                       ON aseg.casegurado = cli.cci_rif
                WHERE  pol.cpoliza = @cpoliza
                       AND pol.fanopol = @fanopol
                       AND pol.fmespol = @fmespol
                       AND cli.cid = @asegurado;
            END
        -- 4. Generar correlativos mediante spContador_v1
        -- Guardar el @cnsinies recibido como entrada si fue suministrado (ej. desde RMS)
        DECLARE @cnsinies_in AS CHAR (30) = @cnsinies;

        -- 4. Generar correlativos mediante spContador_v1
        EXECUTE [dbo].[spContador_v1] NULL, NULL, NULL, NULL, NULL, 1, @fnotificacion, @ramo, 'SINIESTRO', @csinies OUTPUT, @cnsinies OUTPUT;

        -- Si se proporcionó un número de siniestro de entrada (mismo número de RMS), respetarlo
        IF @cnsinies_in IS NOT NULL AND RTRIM(LTRIM(@cnsinies_in)) <> ''
        BEGIN
            IF EXISTS (SELECT 1 FROM dbo.snsinies WITH (NOLOCK) WHERE RTRIM(LTRIM(cnsinies)) = RTRIM(LTRIM(@cnsinies_in)))
            BEGIN
                SET @cerror = 1;
                SET @msj = CONCAT('El número de siniestro ', RTRIM(LTRIM(@cnsinies_in)), ' ya existe en Sis2000.');
                ROLLBACK TRANSACTION;
                GOTO LogAndExit;
            END
            SET @cnsinies = @cnsinies_in;
        END
        -- 5. Insertar registro en snsinies
        INSERT  INTO snsinies (
            csinies,
            u_version,
            cnsinies,
            fnotifi,
            focursin,
            fhoraocu,
            ccausa,
            istatsin,
            csucrnot,
            csucrpag,
            cramo,
            cnpoliza,
            cpoliza,
            fanopol,
            fmespol,
            ccerti,
            iclaseaseg,
            csiniestrado,
            nmenor,
            ctenedor,
            casegurado,
            cbeneficiario,
            cacreedor,
            itipopol,
            fdesde,
            fhasta,
            itiponegocio,
            csinielider,
            cmoneda,
            ptasamon,
            csucur,
            cpais,
            cestado,
            cciudad,
            ccorregi,
            cbarriada,
            czonapos,
            cregion,
            cproductor,
            csupeprod,
            ctipoprod,
            czonprod,
            ccentserv,
            cmercado,
            cactividad,
            cgrupoecono,
            cempresa,
            cprofesion,
            canula,
            fanulacion,
            crechazo,
            frechazo,
            montosiniestro,
            montosiniestroext,
            mreserva,
            mreservaext,
            mpagos,
            mpagosext,
            mrecuperado,
            mrecuperadoext,
            mgastos,
            mgastosext,
            brecupera,
            iopercat,
            ccatastro,
            cevento,
            pporcpag,
            cdespag,
            cajustador,
            cinvestigador,
            xobserva,
            fingreso,
            cusuario,
            ccategoria,
            cusuarioauto,
            ccategoriaauto,
            fultmod,
            cusuariomod,
            ccategoriamod,
            itiposin
        )
        VALUES               (@csinies, 'E', @cnsinies, @fnotificacion, @focurencia, @fnotificacion, @ccausa, 'P', 1, 1, @ramo, @cnpoliza, @cpoliza, @fanopol, @fmespol, @ccerti, @iclaseaseg, @casegurado, @nmenor, @ctenedor, @casegurado, @cbeneficiario, @cacreedor, @itipopol, @fdesde, @fhasta, 'DI', 0, @cmoneda, @ptasamon, 1, @cpais, @cestado, @cciudad, 1, 1, 1010, 0, @cproductor, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULL, 0, NULL, @mmontosiniestro, @mmontosiniestroext, @totreserva, @totreservaext, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, @xobserva, GETDATE(), @cusuario, 1, 0, 0, NULL, 0, 0, @itiposiniestro);
        DECLARE @pmoneda AS CHAR (1);
        IF @cmoneda = 'BS'
            BEGIN
                SET @pmoneda = 'O';
            END
        ELSE
            BEGIN
                SET @pmoneda = '$';
            END
        -- Generamos snhtarsin
        IF @ramo IN (SELECT cramo
                     FROM   maramos
                     WHERE  ctiporamo IN (2, 4))
            BEGIN
                INSERT INTO snhtarsin (
                    csinies,
                    ccober,
                    ctarifa,
                    u_version,
                    cnsinies,
                    cramo,
                    cnpoliza,
                    cpoliza,
                    fanopol,
                    fmespol,
                    ccerti,
                    iclaseaseg,
                    csiniestrado,
                    nmenor,
                    cmoneda,
                    ptasamon,
                    fdesde,
                    fhasta,
                    msumaaseg,
                    msumaasegext,
                    imoneda_pago,
                    mmontorecl,
                    mmontoreclext,
                    iinfraseguro,
                    minfraseguro,
                    minfraseguroext,
                    pinfraseguro,
                    bfraded,
                    mdedu_fran,
                    mdedu_franext,
                    pdedu_fran,
                    ccontrea,
                    cramorea,
                    fingreso,
                    cusuario,
                    ccategoria,
                    cusuarioauto,
                    ccategoriaauto,
                    fultmod,
                    cusuariomod,
                    ccategoriamod
                )
                SELECT @csinies,
                       tar.ccober,
                       tar.ctarifa,
                       'E',
                       @cnsinies,
                       tar.cramo,
                       tar.cnpoliza,
                       tar.cpoliza,
                       tar.fanopol,
                       tar.fmespol,
                       @ccerti,
                       @iclaseaseg,
                       @casegurado,
                       @nmenor,
                       @cmoneda,
                       @ptasamon,
                       tar.fdesde,
                       tar.fhasta,
                       tar.msumaaseg,
                       tar.msumaasegext,
                       @pmoneda,
                       0,
                       0,
                       0,
                       0,
                       0,
                       0,
                       tar.bfraded,
                       tar.mdedu_fran,
                       tar.mdedu_franext,
                       tar.pdedu_fran,
                       cob.ccontrea,
                       cob.cramorea,
                       getdate(),
                       @cusuario,
                       1,
                       0,
                       0,
                       NULL,
                       0,
                       0
                FROM   pepoltar_ind AS tar
                       INNER JOIN
                       adrecibos AS rec
                       ON rec.cpoliza = tar.cpoliza
                          AND rec.fanopol = tar.fanopol
                          AND rec.fmespol = tar.fmespol
                          AND rec.crecibo = tar.crecibo
                          AND iestadorec <> 'A'
                       INNER JOIN
                       adpolcob AS cob
                       ON cob.cpoliza = tar.cpoliza
                          AND cob.fanopol = tar.fanopol
                          AND cob.fmespol = tar.fmespol
                          AND cob.crecibo = tar.crecibo
                          AND cob.cramo = tar.cramo
                          AND cob.ccober = tar.ccober
                WHERE  tar.cpoliza = @cpoliza
                       AND tar.fanopol = @fanopol
                       AND tar.fmespol = @fmespol
                       AND @focurencia BETWEEN tar.fdesde AND tar.fhasta
                       AND tar.ccober IN (SELECT ccobertura
                                          FROM   macauscob
                                          WHERE  ccausa = @ccausa
                                                 AND cramo = tar.cramo)
                       AND tar.casegurado = @casegurado;
            END
        ELSE
            BEGIN
                INSERT INTO snhtarsin (
                    csinies,
                    ccober,
                    ctarifa,
                    u_version,
                    cnsinies,
                    cramo,
                    cnpoliza,
                    cpoliza,
                    fanopol,
                    fmespol,
                    ccerti,
                    iclaseaseg,
                    csiniestrado,
                    nmenor,
                    cmoneda,
                    ptasamon,
                    fdesde,
                    fhasta,
                    msumaaseg,
                    msumaasegext,
                    imoneda_pago,
                    mmontorecl,
                    mmontoreclext,
                    iinfraseguro,
                    minfraseguro,
                    minfraseguroext,
                    pinfraseguro,
                    bfraded,
                    mdedu_fran,
                    mdedu_franext,
                    pdedu_fran,
                    ccontrea,
                    cramorea,
                    fingreso,
                    cusuario,
                    ccategoria,
                    cusuarioauto,
                    ccategoriaauto,
                    fultmod,
                    cusuariomod,
                    ccategoriamod
                )
                SELECT @csinies,
                       tar.ccober,
                       tar.ctarifa,
                       'E',
                       @cnsinies,
                       tar.cramo,
                       tar.cnpoliza,
                       tar.cpoliza,
                       tar.fanopol,
                       tar.fmespol,
                       @ccerti,
                       @iclaseaseg,
                       @casegurado,
                       @nmenor,
                       @cmoneda,
                       @ptasamon,
                       tar.fdesde,
                       tar.fhasta,
                       tar.msumaaseg,
                       tar.msumaasegext,
                       @pmoneda,
                       @mmontosiniestro,
                       @mmontosiniestroext,
                       0,
                       0,
                       0,
                       0,
                       tar.bfraded,
                       tar.mdedu_fran,
                       tar.mdedu_franext,
                       tar.pdedu_fran,
                       cob.ccontrea,
                       cob.cramorea,
                       getdate(),
                       @cusuario,
                       1,
                       0,
                       0,
                       NULL,
                       0,
                       0
                FROM   adpoltar AS tar
                       INNER JOIN
                       adrecibos AS rec
                       ON rec.cpoliza = tar.cpoliza
                          AND rec.fanopol = tar.fanopol
                          AND rec.fmespol = tar.fmespol
                          AND rec.crecibo = tar.crecibo
                          AND iestadorec <> 'A'
                       INNER JOIN
                       adpolcob AS cob
                       ON cob.cpoliza = tar.cpoliza
                          AND cob.fanopol = tar.fanopol
                          AND cob.fmespol = tar.fmespol
                          AND cob.crecibo = tar.crecibo
                          AND cob.cramo = tar.cramo
                          AND cob.ccober = tar.ccober
                WHERE  tar.cpoliza = @cpoliza
                       AND tar.fanopol = @fanopol
                       AND tar.fmespol = @fmespol
                       AND @focurencia BETWEEN tar.fdesde AND tar.fhasta
                       AND tar.ccober IN (SELECT ccobertura
                                          FROM   macauscob
                                          WHERE  ccausa = @ccausa
                                                 AND cramo = tar.cramo);
            END
        -- Insertamos snmovsin 
        INSERT INTO snmovsin (
            csinies,
            cmovsin,
            u_version,
            cnsinies,
            ccober,
            ctarifa,
            cramo,
            cpoliza,
            fanopol,
            fmespol,
            cnpoliza,
            ccerti,
            iclaseaseg,
            csiniestrado,
            nmenor,
            csucur,
            ctenedor,
            crecupera,
            cpersona_inden,
            ipersona_inden,
            cid_inden,
            xtercero,
            imovsin,
            ireaseguro,
            cmoneda,
            ptasamon,
            imoneda_pago,
            itipopago,
            csolpag,
            ccobinde,
            ccorrelativo,
            bfraded,
            mdedu_fran,
            mdedu_franext,
            pdedu_fran,
            mmovsinn,
            mmovsinnext,
            fmov,
            fcancela,
            fliquidacion,
            fcontab,
            nlote,
            iestadocont,
            ccontrea,
            cramorea,
            reas_ok,
            xfactura,
            fingreso,
            cusuario,
            ccategoria,
            cusuarioauto,
            ccategoriaauto,
            fultmod,
            cusuariomod,
            ccategoriamod
        )
        SELECT csinies,
               ISNULL((SELECT MAX(cmovsin)
                       FROM   snmovsin
                       WHERE  csinies = st.csinies), 0) + ROW_NUMBER() OVER (ORDER BY st.ccober) AS cmovsin,
               'E',
               cnsinies,
               ccober,
               ctarifa,
               cramo,
               cpoliza,
               fanopol,
               fmespol,
               cnpoliza,
               ccerti,
               @iclaseaseg,
               csiniestrado,
               @nmenor,
               1,
               @ctenedor,
               0,
               0,
               'N/A',
               0,
               NULL,
               'CR',
               1,
               cmoneda,
               ptasamon,
               imoneda_pago,
               'N',
               0,
               0,
               0,
               bfraded,
               mdedu_fran,
               mdedu_franext,
               pdedu_fran,
               @mmontosiniestro,
               @mmontosiniestroext,
               GETDATE(),
               NULL,
               NULL,
               NULL,
               0,
               'P',
               ccontrea,
               cramorea,
               NULL,
               NULL,
               GETDATE(),
               @cusuario,
               1,
               0,
               0,
               NULL,
               0,
               0
        FROM   snhtarsin AS st
        WHERE  csinies = @csinies;
        -- calculamos la reserva total y actualizamos snsinies 
        SELECT @totreserva = sum(mmovsinn),
               @totreservaext = sum(mmovsinnext)
        FROM   snmovsin
        WHERE  csinies = @csinies
               AND imovsin IN ('CR', 'LR');
        UPDATE snsinies
        SET    mreserva    = @totreserva,
               mreservaext = @totreservaext
        WHERE  csinies = @csinies;
        -- Si todo sale bien, confirmamos los cambios
        COMMIT TRANSACTION;
        -- Respuesta satisfactoria
        SET @cerror = 0;
        SET @msj = 'Siniestro registrado exitosamente.';
        LogAndExit:
        IF @cerror = 0
            SET @bok = '1';
        ELSE
            SET @bok = '0';
        INSERT  INTO tmsinies (
            cnpoliza,
            csinies,
            cnsinies,
            fnotificacion,
            focurencia,
            ccausa,
            asegurado,
            cmoneda,
            cpais,
            cestado,
            cciudad,
            xobserva,
            ptasamon,
            mmontosiniestro,
            mmontosiniestroext,
            itiposiniestro,
            bok,
            cerror,
            cprog,
            ifuente,
            fingreso,
            cusuario
        )
        VALUES               (@cnpoliza,@csinies,@cnsinies,@fnotificacion, @focurencia, @ccausa, @asegurado, @cmoneda, @cpais, @cestado, @cciudad, @xobserva, @ptasamon, @mmontosiniestro, @mmontosiniestroext, @itiposiniestro, @bok, CONVERT (CHAR (10), @cerror), 'APIsin', @ifuente, GETDATE(), @cusuario);
    END TRY
    BEGIN CATCH
        -- Si existe una transacción activa en este bloque, la revertimos completamente
        IF @@TRANCOUNT > 0
            BEGIN
                ROLLBACK;
            END
        -- Capturamos el error
        SET @cerror = ERROR_NUMBER();
        SET @msj = ERROR_MESSAGE();
        INSERT  INTO tmsinies (
            cnpoliza,
            fnotificacion,
            focurencia,
            ccausa,
            asegurado,
            cmoneda,
            cpais,
            cestado,
            cciudad,
            xobserva,
            ptasamon,
            mmontosiniestro,
            mmontosiniestroext,
            itiposiniestro,
            bok,
            cerror,
            cprog,
            ifuente,
            fingreso,
            cusuario
        )
        VALUES               (@cnpoliza, @fnotificacion, @focurencia, @ccausa, @asegurado, @cmoneda, @cpais, @cestado, @cciudad, @xobserva, @ptasamon, @mmontosiniestro, @mmontosiniestroext, @itiposiniestro, '0', CONVERT (CHAR (10), @cerror), 'APIsin', @ifuente, GETDATE(), @cusuario);
    END CATCH
END