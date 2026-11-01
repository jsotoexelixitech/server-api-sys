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

   Pendiente de definir por La Mundial (ver .antigravity/RIDERY-COBRO-POR-VIAJE.md):
     (1) ¿el recibo por viaje lleva adpolcob/adpoltar? (bloque comentado al final);
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
        DECLARE @casegurado NUMERIC(22, 0), @istatcer CHAR(1), @cplanCert NVARCHAR(10);
        SELECT @casegurado = casegurado, @istatcer = istatcer, @cplanCert = cplan
        FROM vhcerti WHERE cpoliza = @cpoliza AND fanopol = @fanopol AND fmespol = @fmespol AND ccerti = @ccerti;
        IF @istatcer IS NULL RAISERROR('El certificado no existe en la póliza.', 16, 1);
        IF @istatcer NOT IN ('V', 'E') RAISERROR('El certificado no está vigente.', 16, 1);

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

        /* (1) Pendiente La Mundial: coberturas/tarifas del recibo.
           Opción propuesta: copiar las coberturas vigentes del certificado (adpolcob/adpoltar del último recibo
           del ccerti) con la prima repartida en proporción, igual que sp_crear_recibo_endoso_nexus (#cobs),
           y luego: EXEC dbo.sp_genera_adpolrea_nexus @crecibo = @newCrecibo;  */

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
