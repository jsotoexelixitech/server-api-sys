-- Repara adpoltar/adpolcob vacíos en pólizas premium ya emitidas (prima 0 en PDF).
-- Desplegar en Sis2000 QA junto al parche de spGeneraCoberturasYRecibos_Auto_RCV2.
-- Invocado automáticamente por nest-api tras emitLocal si detecta adpolcob sin prima.

CREATE OR ALTER PROCEDURE [dbo].[sp_repair_rcv_coberturas_nexus]
    @cnpoliza           VARCHAR(30),
    @pSuccess           BIT = 0 OUTPUT,
    @pErrorMessage      NVARCHAR(MAX) = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @cpoliza NUMERIC(19), @cplan VARCHAR(10), @cramo INT, @cmoneda CHAR(4),
                @msumaaseg NUMERIC(18,2), @msumaasegext NUMERIC(18,2),
                @mprima NUMERIC(18,2), @mprimaext NUMERIC(18,6), @ptasamon NUMERIC(13,6),
                @ifrecuencia CHAR(1), @cuotas INT = 1,
                @cmarca VARCHAR(3), @cmodelo VARCHAR(3), @cversion VARCHAR(3), @cano INT,
                @ccategoria_uso INT, @iplaca CHAR(1), @npuestos INT, @ntoneladas INT,
                @precargorcv NUMERIC(18,2), @fdesde_pol DATE, @fhasta_pol DATE, @tipoV INT,
                @coberAdicional CHAR(2) = 'RC', @idInma INT, @cusuario INT,
                @tasaPt NUMERIC(18,2) = 0, @tasaCa NUMERIC(18,2) = 0, @tasaPp NUMERIC(18,2) = 0;

        SELECT TOP 1
            @cpoliza = pol.cpoliza, @cplan = RTRIM(pol.cplan), @cramo = pol.cramo,
            @cmoneda = RTRIM(pol.cmoneda), @ptasamon = pol.ptasamon, @ifrecuencia = pol.ifrecuencia,
            @fdesde_pol = pol.fdesde, @fhasta_pol = pol.fhasta
        FROM adpoliza pol
        WHERE RTRIM(pol.cnpoliza) = RTRIM(@cnpoliza);

        IF @cpoliza IS NULL
            THROW 99001, 'Póliza no encontrada.', 1;

        IF NOT EXISTS (SELECT 1 FROM maplantar WHERE cramo = @cramo AND RTRIM(cplan) = @cplan)
        BEGIN
            SET @pSuccess = 1;
            COMMIT TRANSACTION;
            RETURN;
        END

        IF EXISTS (
            SELECT 1 FROM adpolcob c
            INNER JOIN adrecibos r ON r.crecibo = c.crecibo
            WHERE r.cpoliza = @cpoliza AND c.mprimabruta > 0
        )
        BEGIN
            SET @pSuccess = 1;
            COMMIT TRANSACTION;
            RETURN;
        END

        SELECT TOP 1
            @msumaaseg = t.msumaaseg, @mprima = t.mprima,
            @cmarca = t.cmarca, @cmodelo = t.cmodelo, @cversion = t.cversion, @cano = t.cano,
            @ccategoria_uso = t.ccategoria_uso, @iplaca = ISNULL(t.iplaca, 'N'),
            @npuestos = t.npuestos, @ntoneladas = ISNULL(t.ntoneladas, 0),
            @precargorcv = ISNULL(t.precargorcv, 0),
            @coberAdicional = NULLIF(RTRIM(t.coberAdicional), ''),
            @cusuario = t.cusuario,
            @tasaPt = ISNULL(t.tasaPt, 0),
            @tasaCa = ISNULL(t.tasaCa, 0),
            @tasaPp = ISNULL(t.tasaPp, 0)
        FROM TMEMISION_AUTOMOVIL_RCV2 t
        WHERE RTRIM(t.cnpoliza) = RTRIM(@cnpoliza)
        ORDER BY t.id DESC;

        IF @coberAdicional IS NULL OR @coberAdicional IN ('', 'R')
            SET @coberAdicional = 'RC';

        IF @cmoneda IS NULL
            SELECT @cmoneda = RTRIM(cmoneda) FROM maplanes WHERE RTRIM(cplan) = @cplan;

        IF @ptasamon IS NULL OR @ptasamon = 0
            SELECT @ptasamon = ptasamon FROM mamonedas WHERE RTRIM(cmoneda) = '$';

        IF RTRIM(ISNULL(@cmoneda, '')) NOT IN ('Bs', 'BS', 'bs')
        BEGIN
            SET @mprimaext = @mprima;
            IF @mprimaext IS NOT NULL SET @mprima = @mprimaext * @ptasamon;
            SET @msumaasegext = @msumaaseg;
            IF @msumaaseg IS NOT NULL SET @msumaaseg = @msumaasegext * @ptasamon;
        END
        ELSE
        BEGIN
            SET @mprimaext = @mprima / NULLIF(@ptasamon, 0);
            SET @msumaasegext = @msumaaseg / NULLIF(@ptasamon, 0);
        END

        IF @ifrecuencia = 'S' SET @cuotas = 2;
        ELSE IF @ifrecuencia = 'M' SET @cuotas = 12;
        ELSE IF @ifrecuencia = 'T' SET @cuotas = 4;
        ELSE IF @ifrecuencia = 'C' SET @cuotas = 3;

        SELECT @tipoV = ctipo FROM vinma
        WHERE cmarca = @cmarca AND cmodelo = @cmodelo AND cversion = @cversion AND cano = @cano;
        IF @tipoV IS NULL
            SELECT @tipoV = ctipo FROM macategtr WHERE ccategotr = @ccategoria_uso;

        SELECT @idInma = id FROM mainma
        WHERE cmarca = @cmarca AND cmodelo = @cmodelo AND cversion = @cversion AND qano = @cano;

        IF (@npuestos IS NULL AND @idInma IS NOT NULL)
            SELECT @npuestos = npasajero FROM mainma WHERE id = @idInma;

        CREATE TABLE #montos (
            cplan CHAR(50), xplan CHAR(70), ccobertura CHAR(4), xdescripcion_l CHAR(60), cproducto NVARCHAR(6),
            cmoneda CHAR(10), nubii NUMERIC(6), tasaCA NUMERIC(18,6), tasaPT NUMERIC(18,6), tasaPP DECIMAL(18,2),
            primaBlCA NUMERIC(18,6), primaBLPT NUMERIC(18,6), primaAdCA NUMERIC(18,6), primaAdPT NUMERIC(18,6),
            primaAdPP NUMERIC(18,6), prima NUMERIC(18,6), masegurada NUMERIC(18,6), ctarifa CHAR(4),
            cramoint CHAR(4), ccoberturaint CHAR(4), xcobertura NVARCHAR(30), xvalor NVARCHAR(2), badicional bit
        );

        INSERT INTO #montos
        EXEC spCalculoAuto
            @cmarca = @cmarca, @cmodelo = @cmodelo, @cversion = @cversion, @cano = @cano, @cplan = @cplan,
            @sumaAseg = ISNULL(@msumaasegext, 0),
            @sumaAsegBl = 0, @sumaAsegAd = 0, @iplaca = @iplaca,
            @fdesde = @fdesde_pol, @fhasta = @fhasta_pol,
            @tasaPt = @tasaPt, @tasaCa = @tasaCa, @tasaPp = @tasaPp, @recargo = 0,
            @tipoV = @tipoV, @uso = @ccategoria_uso, @puestos = @npuestos, @toneladas = @ntoneladas,
            @recargoRcv = @precargorcv, @cramo = NULL, @cusuario = @cusuario,
            @coberAdicional = @coberAdicional, @incluirTotales = 0;

        IF NOT EXISTS (SELECT 1 FROM #montos WHERE ISNULL(prima, 0) > 0)
            THROW 99001, 'spCalculoAuto retornó prima cero; verifique msumaaseg y plan.', 1;

        DECLARE @crecibo NUMERIC(19), @cnrecibo VARCHAR(30), @fano INT, @fmes INT,
                @cproces NUMERIC(13), @csucur INT, @cproductor INT, @casegurado NUMERIC(11),
                @ctenedor NUMERIC(11), @FDESDE_REC DATE, @FHASTA_REC DATE, @ncuo INT,
                @pcomision NUMERIC(8,6), @mcomision NUMERIC(18,6), @mcomisionext NUMERIC(18,6),
                @pdescuento NUMERIC(18,2) = 0, @mdescuento NUMERIC(18,2) = 0, @mdescuentoext NUMERIC(18,2) = 0,
                @precargo NUMERIC(18,2) = 0, @mrecargo NUMERIC(18,2) = 0, @mrecargoext NUMERIC(18,2) = 0,
                @ifuente CHAR(10) = 'API', @cprog CHAR(20) = 'TEmision_Auto_RCV2';

        SELECT @pcomision = pcomision FROM maarancel WHERE cramo = @cramo AND iestado = 'V';

        DECLARE cur CURSOR LOCAL FAST_FORWARD FOR
            SELECT r.crecibo, RTRIM(r.cnrecibo), r.fanopol, r.fmespol, r.cproces, r.csucur,
                   r.casegurado, r.ctenedor, r.cproductor, r.fdesde, r.fhasta, r.qcuotas
            FROM adrecibos r
            WHERE r.cpoliza = @cpoliza
            ORDER BY r.qcuotas;

        OPEN cur;
        FETCH NEXT FROM cur INTO @crecibo, @cnrecibo, @fano, @fmes, @cproces, @csucur,
            @casegurado, @ctenedor, @cproductor, @FDESDE_REC, @FHASTA_REC, @ncuo;

        WHILE @@FETCH_STATUS = 0
        BEGIN
            DELETE FROM adpolcob WHERE crecibo = @crecibo;
            DELETE FROM adpoltar WHERE crecibo = @crecibo;

            INSERT INTO adpoltar (
                crecibo, ccober, ctarifa, u_version, cramo, cpoliza, fanopol, fmespol, ccerti, ccoberimp, ietiqtarimp, qordenimp,
                cnpoliza, cnrecibo, cproces, csucur, cmoneda, ptasamon, itipoprod, fdesde, fhasta, itiporiesg, priesg,
                bfraded, mdedu_fran, mdedu_franext, pdedu_fran, istattar, isuma, cramoint, ccoberturaint, ctarifaint,
                cprog, ifuente, bok, cerror, fingreso, cusuario, ccategoria,
                msumabruta, msumabrutaext, msumaaseg, msumaasegext, mprima, mprimaext, pprima,
                pdescuento, mdescuento, mdescuentoext, precargo, mrecargo, mrecargoext,
                mprimabruta, mprimabrutaext, bprimarea, mprimareas, mprimareasext, pcomision, mcomision, mcomisionext
            )
            SELECT
                @crecibo, c.ccober, c.ctarifa, '!', @cramo, @cpoliza, @fano, @fmes, 0, c.ccoberimp, c.ietiqtarimp, c.qordenimp,
                @cnpoliza, @cnrecibo, @cproces, @csucur, @cmoneda, @ptasamon, 'NU', @FDESDE_REC, @FHASTA_REC, 'N', 0,
                fd.bfraded, fd.mdedu_fran, fd.mdedu_franext, fd.pdedu_fran, 'V', e.isuma, e.cramoint, e.ccoberturaint, c.ctarifaint,
                @cprog, @ifuente, 0, 0, GETDATE(), 7, 1,
                COALESCE(m.masegurada * @ptasamon, 0), COALESCE(m.masegurada, 0),
                COALESCE(m.masegurada * @ptasamon, 0), COALESCE(m.masegurada, 0),
                COALESCE(m.prima * @ptasamon, 0) / @cuotas, COALESCE(m.prima, 0) / @cuotas, fd.pprima,
                @pdescuento, @mdescuento, @mdescuentoext, @precargo, @mrecargo, @mrecargoext,
                (COALESCE(m.prima * @ptasamon, 0) - @mdescuento + @mrecargo) / @cuotas,
                (COALESCE(m.prima, 0) - @mdescuento + @mrecargo) / @cuotas,
                C.bprimarea,
                (COALESCE(m.prima * @ptasamon, 0) - @mdescuento + @mrecargo) / @cuotas,
                (COALESCE(m.prima, 0) - @mdescuento + @mrecargo) / @cuotas,
                B.pcomision,
                (COALESCE(m.prima * @ptasamon, 0) - @mdescuento + @mrecargo) / @cuotas * B.pcomision / 100,
                (COALESCE(m.prima, 0) - @mdescuento + @mrecargo) / @cuotas * B.pcomision / 100
            FROM maplantar A
            INNER JOIN maarancel B ON A.ccober = B.ccober AND A.cramo = B.cramo
            INNER JOIN matarifa C ON A.ccober = C.ccober AND A.cramo = C.cramo AND A.ctarifa = C.ctarifa
            INNER JOIN macoberturas e ON e.ccobertura = C.ccober AND e.cramo = C.cramo
            INNER JOIN matarifa_d fd ON fd.ccober = C.ccober AND fd.cramo = C.cramo AND fd.ctarifa = C.ctarifa
            INNER JOIN #montos m ON m.ccobertura = A.ccober COLLATE Modern_Spanish_CI_AS
                AND m.ctarifa = A.ctarifa COLLATE Modern_Spanish_CI_AS
            WHERE A.cramo = @cramo AND RTRIM(A.cplan) = @cplan AND B.iestado = 'V'
              AND ISNULL(m.prima, 0) > 0
              AND m.ccobertura IN (
                SELECT ccobertura FROM #montos
                WHERE
                    (@coberAdicional = 'CA' AND ccobertura NOT IN (16, 2)) OR
                    (@coberAdicional = 'PT' AND ccobertura NOT IN (1, 3)) OR
                    (@coberAdicional = 'PP' AND ccobertura NOT IN (1, 2, 16)) OR
                    (@coberAdicional NOT IN ('CA', 'PT', 'PP') AND ccobertura NOT IN (1, 2, 3, 4, 5, 16))
              );

            INSERT INTO adpolcob (
                crecibo, ccober, u_version, cramo, cpoliza, fanopol, fmespol, ccerti, cnpoliza, cnrecibo, cproces, csucur, cmoneda,
                ptasamon, fdesde, fhasta, itipoprod, msumaaseg, msumaasegext, mprimabruta, mprimabrutaext, pcomision, mcomision,
                mcomisionext, mprimareas, mprimareasext, iestado, isuma, cramoint, ccoberturaint, cprog, ifuente, bok, cerror,
                fingreso, cusuario, ccategoria
            )
            SELECT DISTINCT
                crecibo, ccober, a.u_version, a.cramo, cpoliza, fanopol, fmespol, ccerti, cnpoliza, cnrecibo, cproces, csucur, a.cmoneda,
                ptasamon, fdesde, fhasta, itipoprod, msumaaseg, msumaasegext, mprimabruta, mprimabrutaext, pcomision, mcomision,
                mcomisionext, mprimareas, mprimareasext, istattar, c.isuma, c.cramoint, c.ccoberturaint, a.cprog, a.ifuente, a.bok, a.cerror,
                GETDATE(), a.cusuario, a.ccategoria
            FROM adpoltar a
            INNER JOIN macoberturas c ON c.ccobertura = a.ccober AND c.cramo = a.cramo
            WHERE crecibo = @crecibo;

            DECLARE @rec_mprima NUMERIC(18,2), @rec_mprimaext NUMERIC(18,6);
            SELECT @rec_mprima = SUM(mprimabruta), @rec_mprimaext = SUM(mprimabrutaext)
            FROM adpolcob WHERE crecibo = @crecibo;

            UPDATE adrecibos SET
                mprimabruta = ISNULL(@rec_mprima, 0), mprimabrutaext = ISNULL(@rec_mprimaext, 0),
                mprimaneta = ISNULL(@rec_mprima, 0), mprimanetaext = ISNULL(@rec_mprimaext, 0),
                mprimareas = ISNULL(@rec_mprima, 0), mprimareasext = ISNULL(@rec_mprimaext, 0),
                mmontorec = ISNULL(@rec_mprima, 0), mmontorecext = ISNULL(@rec_mprimaext, 0),
                mmontoapag = ISNULL(@rec_mprima, 0), mmontoapagext = ISNULL(@rec_mprimaext, 0)
            WHERE crecibo = @crecibo;

            FETCH NEXT FROM cur INTO @crecibo, @cnrecibo, @fano, @fmes, @cproces, @csucur,
                @casegurado, @ctenedor, @cproductor, @FDESDE_REC, @FHASTA_REC, @ncuo;
        END

        CLOSE cur;
        DEALLOCATE cur;
        DROP TABLE #montos;

        COMMIT TRANSACTION;
        SET @pSuccess = 1;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        SET @pSuccess = 0;
        SET @pErrorMessage = ERROR_MESSAGE();
        THROW;
    END CATCH
END
GO
