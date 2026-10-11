/* 2026-10-11 — Rechazo de un siniestro de Automóvil desde el módulo de Siniestros (D14: snsinies es el registro).
 *
 * Replica lo que hace SIS2000 cuando se rechaza un siniestro (verificado en los rechazados existentes del ramo 18):
 *  - snsinies: istatsin = 'Z', crechazo (catálogo marechazo), frechazo = hoy, reserva en 0, fultmod / cusuariomod.
 *  - snmovsin: movimientos 'LR' (liberación de reserva) por el saldo de cada cobertura (CR + LR), para dejar la reserva en 0.
 * Solo se rechazan siniestros pendientes ('P'). Es idempotente: si ya está rechazado con el mismo motivo responde OK.
 *
 * Motivos (marechazo): 1 EXTEMPORANEIDAD, 2 FALTA DE RECAUDOS, 3 FALTA DE PAGO, 4 DAÑOS PARCIALES,
 * 5 RESPONSABILIDAD COMPARTIDA, 6 NO EXISTE RESPONSABILIDAD DE NUESTRO ASEGURADO.
 * NO invocar contra datos reales sin autorización. Prueba segura: BEGIN TRAN ... ROLLBACK.
 */
CREATE OR ALTER PROCEDURE [dbo].[sp_rechaza_siniestro_nexus]
    @csinies NUMERIC(19, 0),
    @crechazo INT,
    @cusuario NUMERIC(11, 0),
    @cerror INT = 0 OUTPUT,
    @msj VARCHAR(255) = '' OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET @cerror = 0;
    SET @msj = '';

    DECLARE @istatsin CHAR(1), @crechazo_actual INT;

    SELECT @istatsin = istatsin, @crechazo_actual = crechazo FROM snsinies WHERE csinies = @csinies;
    IF @istatsin IS NULL
    BEGIN
        SET @cerror = 1; SET @msj = 'El siniestro no existe.'; RETURN;
    END
    IF @istatsin = 'Z' AND @crechazo_actual = @crechazo
    BEGIN
        SET @msj = 'El siniestro ya estaba rechazado por ese motivo.'; RETURN;
    END
    IF @istatsin <> 'P'
    BEGIN
        SET @cerror = 1; SET @msj = 'Solo se pueden rechazar siniestros pendientes.'; RETURN;
    END
    IF NOT EXISTS (SELECT 1 FROM marechazo WHERE crechazo = @crechazo)
    BEGIN
        SET @cerror = 1; SET @msj = 'El motivo de rechazo no existe.'; RETURN;
    END

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Liberación de la reserva: un 'LR' por el saldo de cada cobertura (solo si el saldo es positivo).
        INSERT INTO snmovsin (
            csinies, cmovsin, u_version, cnsinies, ccober, ctarifa, cramo, cpoliza, fanopol, fmespol, cnpoliza, ccerti,
            iclaseaseg, csiniestrado, nmenor, csucur, ctenedor, crecupera, cpersona_inden, ipersona_inden, cid_inden, xtercero,
            imovsin, ireaseguro, cmoneda, ptasamon, imoneda_pago, itipopago, csolpag, ccobinde, ccorrelativo, bfraded,
            mdedu_fran, mdedu_franext, pdedu_fran, mmovsinn, mmovsinnext, fmov, fcancela, fliquidacion, fcontab, nlote,
            iestadocont, ccontrea, cramorea, reas_ok, xfactura, fingreso, cusuario, ccategoria, cusuarioauto, ccategoriaauto,
            fultmod, cusuariomod, ccategoriamod
        )
        SELECT r.csinies,
               ISNULL((SELECT MAX(cmovsin) FROM snmovsin WHERE csinies = @csinies), 0) + ROW_NUMBER() OVER (ORDER BY r.ccober, r.ctarifa),
               'E', r.cnsinies, r.ccober, r.ctarifa, r.cramo, r.cpoliza, r.fanopol, r.fmespol, r.cnpoliza, r.ccerti,
               r.iclaseaseg, r.csiniestrado, r.nmenor, r.csucur, r.ctenedor, r.crecupera, r.cpersona_inden, r.ipersona_inden, r.cid_inden, r.xtercero,
               'LR', r.ireaseguro, r.cmoneda, r.ptasamon, r.imoneda_pago, r.itipopago, r.csolpag, r.ccobinde, r.ccorrelativo, r.bfraded,
               r.mdedu_fran, r.mdedu_franext, r.pdedu_fran, -n.saldo, -n.saldoext, GETDATE(), NULL, NULL, NULL, 0,
               'P', r.ccontrea, r.cramorea, NULL, NULL, GETDATE(), @cusuario, 1, 0, 0,
               NULL, 0, 0
        FROM   (SELECT ccober, ctarifa, MIN(CASE WHEN imovsin = 'CR' THEN cmovsin END) AS cmov_base,
                       SUM(mmovsinn) AS saldo, SUM(mmovsinnext) AS saldoext
                FROM   snmovsin
                WHERE  csinies = @csinies AND imovsin IN ('CR', 'LR')
                GROUP BY ccober, ctarifa
                HAVING SUM(mmovsinn) > 0) AS n
               INNER JOIN snmovsin AS r
               ON r.csinies = @csinies AND r.ccober = n.ccober AND r.ctarifa = n.ctarifa AND r.cmovsin = n.cmov_base;

        UPDATE snsinies
        SET    istatsin    = 'Z',
               crechazo    = @crechazo,
               frechazo    = CONVERT(DATE, GETDATE()),
               mreserva    = ISNULL((SELECT SUM(mmovsinn)    FROM snmovsin WHERE csinies = @csinies AND imovsin IN ('CR', 'LR')), 0),
               mreservaext = ISNULL((SELECT SUM(mmovsinnext) FROM snmovsin WHERE csinies = @csinies AND imovsin IN ('CR', 'LR')), 0),
               fultmod     = GETDATE(),
               cusuariomod = @cusuario,
               ccategoriamod = 1
        WHERE  csinies = @csinies;

        COMMIT TRANSACTION;
        SET @msj = 'Siniestro rechazado.';
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        SET @cerror = ERROR_NUMBER();
        SET @msj = LEFT(ERROR_MESSAGE(), 255);
    END CATCH
END
