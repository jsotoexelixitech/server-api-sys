/* =====================================================================================
   PROPUESTA — NO EJECUTAR en Sis2000 sin revisión y aprobación de La Mundial (DBA / Luis).
   Sis2000 es solo diagnóstico para Exélixi: este archivo es el contrato que consume
   nest-api POST /api/flota/polizas/:cnpoliza/certificados/:ccerti/recibos (módulo flota).

   sp_crear_recibo_certificado_nexus
   Genera UN recibo (un viaje de Ridery) sobre UN certificado de una póliza de flota colectiva.

   Diferencias con sp_crear_recibo_endoso_nexus (que NO sirve para flota):
     - recibe @ccerti (el endoso hereda el ccerti del último recibo de la póliza);
     - NO anula recibos pendientes ni recorta cobrados (el endoso lo hace para TODA la póliza);
     - NO cambia adpoliza.cplan / ifrecuencia ni adcertificado;
     - respeta fdesde/fhasta del viaje (el endoso toma la vigencia completa si nada está cobrado);
     - idempotente por @creferencia (VIAJE:<idViaje>): si ya existe devuelve el mismo recibo.

   Base: SPCargaRecibosColectivos (Hamilton León) — mismo INSERT de adrecibos de un colectivo —
   con el contador de sp_crear_recibo_endoso_nexus (sp_calcula_num_contador_nexus caso 7) y
   sp_genera_adpolrea_nexus.

   Coherencia con el archivo 02 (mismos nombres, tablas y contadores):
     - póliza: la crea sp_flota_crear_poliza_nexus (itipopol 'C', sin recibos);
     - certificado: lo crea sp_flota_incluir_certificado_nexus (vhcerti 'V' + coberturas en sopolcob/sopoltar
       sin crecibo) y lo excluye sp_flota_excluir_certificado_nexus (istatcer 'N' + fanulacion);
     - recibo: contador sp_calcula_num_contador_nexus caso 7 (CRECIBO + correlativo de recibo del ramo);
       qcuotas = n.º de recibos del certificado + 1; cproces = el de la póliza.

   Pendiente de definir por La Mundial (ver LEEME-SOLICITUD-LA-MUNDIAL.md y .antigravity/RIDERY-COBRO-POR-VIAJE.md):
     (1) coberturas del recibo: se copian de sopoltar/sopolcob del certificado (paso 6); reparto de la prima
         y si lleva adpolrea (sp_genera_adpolrea_nexus);
     (2) tasa de cambio: la del día del viaje (propuesta) o la de forigen de la póliza;
     (3) itiporec: 'P' (prima) o 'A' (adicional);
     (4) fhasta = fdesde (viaje en el mismo día) es válido o se usa fdesde + 1.
   ===================================================================================== */

-- Tabla de control de idempotencia (un recibo por referencia externa).
IF OBJECT_ID('dbo.nxflota_recibo_viaje', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.nxflota_recibo_viaje (
        creferencia  NVARCHAR(120) NOT NULL PRIMARY KEY,
        cpoliza      NUMERIC(19, 0) NOT NULL,
        ccerti       INT            NOT NULL,
        crecibo      NUMERIC(19, 0) NOT NULL,
        cnrecibo     NVARCHAR(30)   NOT NULL,
        mprima       NUMERIC(18, 2) NOT NULL,
        cmoneda      NVARCHAR(4)    NOT NULL,
        fingreso     DATETIME       NOT NULL DEFAULT GETDATE(),
        cusuario     INT            NULL
    );
END
GO

CREATE OR ALTER PROCEDURE dbo.sp_crear_recibo_certificado_nexus
    @cnpoliza      NVARCHAR(30),
    @ccerti        INT,
    @mprima        NUMERIC(18, 2),          -- prima del viaje en @cmoneda
    @cmoneda       NVARCHAR(4)  = NULL,     -- '$' o 'Bs'; NULL = moneda de la póliza
    @fdesde        DATE,
    @fhasta        DATE,
    @creferencia   NVARCHAR(120),           -- VIAJE:<idViaje>
    @xobservacion  NVARCHAR(250) = NULL,
    @cusuario      INT = 1,
    @pCnrecibo     NVARCHAR(30)   OUTPUT,
    @pCrecibo      NUMERIC(19, 0) OUTPUT,
    @pYaExistia    BIT            OUTPUT,
    @pSuccess      BIT            OUTPUT,
    @pErrorMessage NVARCHAR(MAX)  OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    SELECT @pSuccess = 0, @pYaExistia = 0, @pErrorMessage = NULL, @pCnrecibo = NULL, @pCrecibo = NULL;

    BEGIN TRY
        -- 0. Idempotencia
        SELECT @pCrecibo = crecibo, @pCnrecibo = cnrecibo
        FROM dbo.nxflota_recibo_viaje WHERE creferencia = @creferencia;
        IF @pCrecibo IS NOT NULL
        BEGIN
            SELECT @pYaExistia = 1, @pSuccess = 1, @pErrorMessage = 'Recibo ya generado para esta referencia.';
            RETURN;
        END

        IF @mprima IS NULL OR @mprima <= 0 RAISERROR('La prima del recibo debe ser mayor que cero.', 16, 1);
        IF @fhasta < @fdesde RAISERROR('fhasta no puede ser anterior a fdesde.', 16, 1);
        IF @fhasta = @fdesde SET @fhasta = DATEADD(DAY, 1, @fdesde);   -- pendiente (4)

        -- 1. Póliza (último período) — debe ser colectiva y vigente
        DECLARE @cpoliza NUMERIC(19, 0), @fanopol INT, @fmespol INT, @cramo INT, @itipopol CHAR(1), @csucur INT,
                @ccerti_mae INT, @polMoneda NVARCHAR(4), @istatpol CHAR(1), @polFdesde DATE, @polFhasta DATE;
        SELECT TOP 1 @cpoliza = cpoliza, @fanopol = fanopol, @fmespol = fmespol, @cramo = cramo,
               @itipopol = ISNULL(itipopol, 'I'), @csucur = ISNULL(csucur, 1), @ccerti_mae = ISNULL(ccerti_mae, 0),
               @polMoneda = LTRIM(RTRIM(cmoneda)), @istatpol = istatpol, @polFdesde = fdesde, @polFhasta = fhasta
        FROM adpoliza WHERE cnpoliza = @cnpoliza ORDER BY fanopol DESC, fmespol DESC;

        IF @cpoliza IS NULL RAISERROR('No existe la póliza indicada.', 16, 1);
        IF @itipopol <> 'C' RAISERROR('La póliza no es colectiva (itipopol <> C).', 16, 1);
        IF @istatpol <> 'V' RAISERROR('La póliza no está vigente.', 16, 1);
        IF @fdesde < @polFdesde OR @fdesde > @polFhasta RAISERROR('La fecha del viaje está fuera de la vigencia de la póliza.', 16, 1);

        -- 2. Certificado del conductor — debe existir y estar vigente
        --    (lo crea sp_flota_incluir_certificado_nexus; lo excluye sp_flota_excluir_certificado_nexus con
        --     istatcer 'N' + fanulacion: un viaje anterior a la exclusión se puede facturar después)
        DECLARE @casegurado NUMERIC(22, 0), @istatcer CHAR(1), @cplanCert NVARCHAR(10), @certFdesde DATE, @certFanul DATE;
        SELECT @casegurado = casegurado, @istatcer = istatcer, @cplanCert = cplan,
               @certFdesde = fdesde, @certFanul = fanulacion
        FROM vhcerti WHERE cpoliza = @cpoliza AND fanopol = @fanopol AND fmespol = @fmespol AND ccerti = @ccerti;
        IF @istatcer IS NULL RAISERROR('El certificado no existe en la póliza.', 16, 1);
        IF @istatcer NOT IN ('V', 'E') AND NOT (@istatcer = 'N' AND @certFanul IS NOT NULL AND @fdesde < @certFanul)
            RAISERROR('El certificado no está vigente para la fecha del viaje.', 16, 1);
        IF @fdesde < @certFdesde RAISERROR('El viaje es anterior a la inclusión del certificado.', 16, 1);

        -- 3. Montos en $ y Bs (tasa del día del viaje — pendiente (2))
        SET @cmoneda = ISNULL(NULLIF(LTRIM(RTRIM(@cmoneda)), ''), @polMoneda);
        DECLARE @ptasamon NUMERIC(18, 6), @primaext NUMERIC(18, 2), @primabs NUMERIC(18, 2),
                @pcomision NUMERIC(10, 2), @mcomision NUMERIC(18, 2), @mcomisionext NUMERIC(18, 2);
        SELECT TOP 1 @ptasamon = ptasamon FROM mavamoneda
        WHERE TRIM(cmoneda) = '$' AND CONVERT(DATE, fmoneda) <= @fdesde ORDER BY fmoneda DESC;
        IF @ptasamon IS NULL RAISERROR('No hay tasa de cambio para la fecha del viaje.', 16, 1);
        IF @cmoneda = 'Bs' SELECT @primabs = @mprima, @primaext = ROUND(@mprima / @ptasamon, 2);
        ELSE SELECT @primaext = @mprima, @primabs = ROUND(@mprima * @ptasamon, 2);
        SELECT @pcomision = ISNULL((SELECT TOP 1 pcomision FROM maarancel WHERE cramo = @cramo AND iestado = 'V'), 0);
        SELECT @mcomisionext = ROUND(@primaext * @pcomision / 100, 2), @mcomision = ROUND(@primabs * @pcomision / 100, 2);

        BEGIN TRAN;

        -- 4. Número de recibo (mismo contador que la emisión / endoso Nexus)
        DECLARE @newCnrecibo NVARCHAR(30), @newCrecibo NUMERIC(19, 0), @errCounter INT = 0, @qcuotas INT;
        EXEC dbo.sp_calcula_num_contador_nexus
            @cramo = @cramo, @itipopol = @itipopol, @csucur = @csucur, @ccerti_mae = @ccerti_mae, @caso = 7,
            @cnrecibo = @newCnrecibo OUTPUT, @crecibo = @newCrecibo OUTPUT, @cerror = @errCounter OUTPUT;
        IF @newCrecibo IS NULL OR @newCnrecibo IS NULL RAISERROR('Fallo al generar el número de recibo.', 16, 1);
        SELECT @qcuotas = COUNT(*) + 1 FROM adrecibos
        WHERE cpoliza = @cpoliza AND fanopol = @fanopol AND fmespol = @fmespol AND ccerti = @ccerti;

        -- 5. Recibo: mismo INSERT que SPCargaRecibosColectivos, con ccerti, asegurado del certificado y vigencia del viaje
        INSERT INTO adrecibos (
             cramo, itipoprod, itiponegocio, itipopol, iestadoren, cpoliza_mae,
             ccerti_mae, itiporec, imodcobro, cdoccob, criesgo, ccerti,
             cserie_rea, cacreedor, cfinanciera, cplan, ctipoproductor, czonaprod,
             csupervisor, crecaudador, cregion, ccentserv, cmercado, cprofesion,
             cactividad, cgrupoecono, cempresa, cpais, cestado, cciudad,
             ccorregi, cbarriada, czonpos, fanulacion, itipoanul, ccausaanul,
             fcontab, fanomescont, nlote, iestcont, ifinanciado, fdevolucion,
             idevolucion, iformadevo, msumacoa, msumacoaext, mprimacoa, mprimacoaext,
             pcoa, pbono, mbono, mbonoext, mprimareas_c, mprimareasext_c,
             mpcedida, mpcedidaext, mpfp, mpfpext, potrosrec, motrosrec,
             motrosrecext, potrosdes, motrosdes, motrosdesext, pgastos, mgastos,
             mgastosext, potrosgas, motrosgas, motrosgasext, mgemi, mgemiext,
             pgemi, mimpuesto, pimpuesto, mimpuestoext, mabono, mabonoext,
             mprimadif, mprimadifext, fpago, mpagcoa, mpagcoaext, pinteres,
             minteres, minteresext, bobsimp, xobsimp, iestadoimp, cforcob,
             czona_cobro, cbanco, cagenban, xcuentabanc, itipocta, xtarjeta,
             itarjeta, qcuotas, ifrecuencia, istatpcnd, fpcnd, cprog,
             ifuente, fingreso, cusuario, ccategoria, crecibo, u_version,
             cnpoliza, cnrecibo, cpoliza, fanopol, fmespol, cproces,
             csucur, csucurrec, casegurado, ctenedor, cbeneficiario, cproductor,
             cmoneda, ptasamon, femision, fdesde, fhasta, fdesde_pol,
             fhasta_pol, fcobro, iestadorec, msumabruta, msumabrutaext, msumaneta,
             msumanetaext, mprimabruta, mprimabrutaext, mprimaneta, mprimanetaext, pretcoa,
             pcomision, mcomision, mcomisionext, mcompart, mcompartext, mprimareas,
             mprimareasext, mprimareas_n, mprimareasext_n, mpret, mpretext, mmontoneto,
             mmontonetoext, mmontorec, mmontorecext, mmontoapag, mmontoapagext, fdesde_dev,
             fhasta_dev, mprimadev, mprimadevext, mpagado, mpagadoext, mpendiente,
             mpendientext, xobserva, cnrecibo_rel
        )
        SELECT
             cramo, itipoprod, 'DI', 'C', 'N', ISNULL(cpoliza_mae, 0),
             ISNULL(ccerti_mae, 0), 'P' /* pendiente (3) */, 'IN', 0, ISNULL(criesgo, 0), @ccerti,
             0, 0, 0, @cplanCert, 0, 0,
             0, 0, 0, 0, 0, 0,
             0, 0, 0, 0, 0, 0,
             0, 0, 0, NULL, 'N', 0,
             NULL, NULL, 0, 'P', 0, NULL,
             'P', 'N', 0, 0, 0, 0,
             0, 0, 0, 0, 0, 0,
             0, 0, 0, 0, 0, 0,
             0, 0, 0, 0, 0, 0,
             0, 0, 0, 0, 0, 0,
             0, 0, 0, 0, 0, 0,
             0, 0, NULL, 0, 0, 0,
             0, 0, 0, NULL, 'N', 0,
             0, 0, 0, NULL, 'N', NULL,
             'N', @qcuotas, 'E', 'N', NULL, 'ReciboViajeNexus',
             'NEXUS', GETDATE(), @cusuario, 1, @newCrecibo, '!',
             cnpoliza, @newCnrecibo, cpoliza, fanopol, fmespol, cproces,
             ISNULL(csucur, 1), ISNULL(csucurrec, 1), @casegurado, ctenedor, ctenedor,
             CASE WHEN cproductor = 0 THEN 80080 ELSE cproductor END,
             @cmoneda, @ptasamon, GETDATE(), @fdesde, @fhasta, fdesde,
             fhasta, NULL, 'P', 0, 0, 0,
             0, @primabs, @primaext, @primabs, @primaext, 100,
             @pcomision, @mcomision, @mcomisionext, 0, 0, @primabs,
             @primaext, @primabs, @primaext, @primabs, @primaext, @primabs,
             @primaext, @primabs, @primaext, @primabs, @primaext, @fdesde,
             @fhasta, @primabs, @primaext, 0, 0, @primabs,
             @primaext, LEFT(ISNULL(@xobservacion, @creferencia), 250), NULL
        FROM adpoliza
        WHERE cpoliza = @cpoliza AND fanopol = @fanopol AND fmespol = @fmespol;

        /* 6. Coberturas y tarifas del recibo (pendiente (1)).
           sp_flota_incluir_certificado_nexus deja las coberturas del certificado en sopoltar / sopolcob SIN crecibo
           (prima 0). Aquí se copian a adpoltar / adpolcob con el crecibo del viaje y la prima del viaje repartida:
             - en proporción a sopoltar.mprimaext si alguna es > 0 (prima de referencia, si La Mundial la carga);
             - si todas son 0, toda la prima va a la primera cobertura (qordenimp, ccober).
           Si el certificado no tiene sopoltar (póliza que no se creó con el 02) el recibo queda sin coberturas,
           como SPCargaRecibosColectivos. */
        IF EXISTS (SELECT 1 FROM sopoltar WHERE cpoliza = @cpoliza AND ccerti = @ccerti AND istattar = 'V')
        BEGIN
            DECLARE @tar TABLE (ccober CHAR(4), ctarifa CHAR(10), peso NUMERIC(18, 6), orden INT);
            INSERT INTO @tar (ccober, ctarifa, peso, orden)
            SELECT ccober, ctarifa, ISNULL(mprimaext, 0),
                   ROW_NUMBER() OVER (ORDER BY ISNULL(qordenimp, 0), ccober, ctarifa)
            FROM sopoltar WHERE cpoliza = @cpoliza AND ccerti = @ccerti AND istattar = 'V';
            DECLARE @pesoTotal NUMERIC(18, 6) = (SELECT SUM(peso) FROM @tar);
            IF ISNULL(@pesoTotal, 0) <= 0
            BEGIN
                UPDATE @tar SET peso = CASE WHEN orden = 1 THEN 1 ELSE 0 END;
                SET @pesoTotal = 1;
            END

            INSERT INTO adpoltar
            (crecibo, ccober, ctarifa, u_version, cramo, cpoliza, fanopol, fmespol, ccerti, ccoberimp, ietiqtarimp, qordenimp,
             cnpoliza, cnrecibo, cproces, csucur, cmoneda, ptasamon, itipoprod, fdesde, fhasta, itiporiesg, priesg,
             bfraded, mdedu_fran, mdedu_franext, pdedu_fran, istattar, isuma, cramoint, ccoberturaint, ctarifaint,
             cprog, ifuente, bok, cerror, fingreso, cusuario, ccategoria,
             msumabruta, msumabrutaext, msumaaseg, msumaasegext, mprima, mprimaext, pprima,
             pdescuento, mdescuento, mdescuentoext, precargo, mrecargo, mrecargoext,
             mprimabruta, mprimabrutaext, bprimarea, mprimareas, mprimareasext, pcomision, mcomision, mcomisionext)
            SELECT @newCrecibo, s.ccober, s.ctarifa, '!', @cramo, @cpoliza, @fanopol, @fmespol, @ccerti, s.ccoberimp, s.ietiqtarimp, s.qordenimp,
                   @cnpoliza, @newCnrecibo, s.cproces, @csucur, @cmoneda, @ptasamon, p.itipoprod, @fdesde, @fhasta, 'N', 0,
                   s.bfraded, s.mdedu_fran, s.mdedu_franext, s.pdedu_fran, 'V', s.isuma, s.cramoint, s.ccoberturaint, s.ctarifaint,
                   'ReciboViajeNexus', 'NEXUS', 0, 0, GETDATE(), @cusuario, 1,
                   s.msumaaseg, s.msumaasegext, s.msumaaseg, s.msumaasegext,
                   ROUND(@primabs * t.peso / @pesoTotal, 2), ROUND(@primaext * t.peso / @pesoTotal, 2), 0,
                   0, 0, 0, 0, 0, 0,
                   ROUND(@primabs * t.peso / @pesoTotal, 2), ROUND(@primaext * t.peso / @pesoTotal, 2), 1,
                   ROUND(@primabs * t.peso / @pesoTotal, 2), ROUND(@primaext * t.peso / @pesoTotal, 2),
                   s.pcomision, ROUND(@primabs * t.peso / @pesoTotal * s.pcomision / 100, 2),
                   ROUND(@primaext * t.peso / @pesoTotal * s.pcomision / 100, 2)
            FROM sopoltar s
            INNER JOIN @tar t ON t.ccober = s.ccober AND t.ctarifa = s.ctarifa
            CROSS JOIN (SELECT itipoprod FROM adpoliza WHERE cpoliza = @cpoliza AND fanopol = @fanopol AND fmespol = @fmespol) p
            WHERE s.cpoliza = @cpoliza AND s.ccerti = @ccerti AND s.istattar = 'V' AND t.peso > 0;
            -- PREGUNTA LM: bprimarea = 1 (prima reasegurable) y pprima = 0 en el recibo por viaje.

            INSERT INTO adpolcob
            (crecibo, ccober, u_version, cramo, cpoliza, fanopol, fmespol, ccerti, cnpoliza, cnrecibo, cproces, csucur, cmoneda,
             ptasamon, fdesde, fhasta, itipoprod, msumaaseg, msumaasegext, mprimabruta, mprimabrutaext, pcomision, mcomision,
             mcomisionext, mprimareas, mprimareasext, iestado, isuma, ccontrea, cramorea, cramopcnd, ccoberpcnd, cramoint,
             ccoberturaint, cprog, ifuente, bok, cerror, fingreso, cusuario, ccategoria)
            SELECT a.crecibo, a.ccober, '!', a.cramo, a.cpoliza, a.fanopol, a.fmespol, a.ccerti, a.cnpoliza, a.cnrecibo, a.cproces,
                   a.csucur, a.cmoneda, a.ptasamon, a.fdesde, a.fhasta, a.itipoprod, MAX(a.msumaaseg), MAX(a.msumaasegext),
                   SUM(a.mprimabruta), SUM(a.mprimabrutaext), MAX(a.pcomision), SUM(a.mcomision), SUM(a.mcomisionext),
                   SUM(a.mprimareas), SUM(a.mprimareasext), 'V', MAX(a.isuma),
                   MAX(c.ccontrea), MAX(c.cramorea), MAX(c.cramopcnd), MAX(c.ccoberpcnd), MAX(a.cramoint), MAX(a.ccoberturaint),
                   'ReciboViajeNexus', 'NEXUS', 0, 0, GETDATE(), @cusuario, 1
            FROM adpoltar a
            LEFT JOIN sopolcob c ON c.cpoliza = a.cpoliza AND c.ccerti = a.ccerti AND c.ccober = a.ccober AND c.iestado = 'V'
            WHERE a.crecibo = @newCrecibo
            GROUP BY a.crecibo, a.ccober, a.cramo, a.cpoliza, a.fanopol, a.fmespol, a.ccerti, a.cnpoliza, a.cnrecibo, a.cproces,
                     a.csucur, a.cmoneda, a.ptasamon, a.fdesde, a.fhasta, a.itipoprod;

            -- Ajuste de redondeo: la suma de coberturas debe ser igual a la prima del recibo.
            DECLARE @difBs NUMERIC(18, 2) = @primabs - ISNULL((SELECT SUM(mprimabruta) FROM adpolcob WHERE crecibo = @newCrecibo), 0),
                    @difExt NUMERIC(18, 2) = @primaext - ISNULL((SELECT SUM(mprimabrutaext) FROM adpolcob WHERE crecibo = @newCrecibo), 0);
            IF @difBs <> 0 OR @difExt <> 0
                UPDATE TOP (1) adpolcob SET mprimabruta = mprimabruta + @difBs, mprimabrutaext = mprimabrutaext + @difExt
                WHERE crecibo = @newCrecibo;

            -- PREGUNTA LM: ¿el recibo por viaje lleva cesión de reaseguro? Si sí:
            -- EXEC dbo.sp_genera_adpolrea_nexus @crecibo = @newCrecibo;
        END

        INSERT INTO dbo.nxflota_recibo_viaje (creferencia, cpoliza, ccerti, crecibo, cnrecibo, mprima, cmoneda, cusuario)
        VALUES (@creferencia, @cpoliza, @ccerti, @newCrecibo, @newCnrecibo, @mprima, @cmoneda, @cusuario);

        COMMIT;
        SELECT @pCrecibo = @newCrecibo, @pCnrecibo = LTRIM(RTRIM(@newCnrecibo)), @pSuccess = 1;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        SELECT @pSuccess = 0, @pErrorMessage = ERROR_MESSAGE();
    END CATCH
END
GO
