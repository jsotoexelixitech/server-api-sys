-- Endoso: crear recibo(s) fraccionados + actualizar plan/frecuencia en adpoliza (misma transacción).
-- La cantidad de recibos la manda la frecuencia (M=12, T=4, C=3, S=2, A/E=1), igual que la emisión
-- nativa spGeneraCoberturasYRecibos_Auto_RCV2. @ncuotas solo se usa si no llega @ifrecuencia.
-- @mprima = prima total del endoso, expresada en la moneda de la póliza (adpoliza.cmoneda).
-- Desplegar en Sis2000 QA/prod.

CREATE OR ALTER PROCEDURE [dbo].[sp_crear_recibo_endoso_nexus]
    @cnpoliza       NVARCHAR(50),
    @fanopol        INT = NULL,
    @fmespol        INT = NULL,
    @mprima         NUMERIC(18, 2),
    @fdesde         DATE,
    @fhasta         DATE,
    @cplan          NVARCHAR(10) = NULL,
    @ifrecuencia    CHAR(1) = NULL,
    @ncuotas        INT = NULL,
    @cusuario       INT = 1,
    @pCnrecibo      NVARCHAR(30) = NULL OUTPUT,
    @pCrecibo       NUMERIC(19, 0) = NULL OUTPUT,
    @pSuccess       BIT = 0 OUTPUT,
    @pErrorMessage  NVARCHAR(MAX) = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @cleanCnpoliza NVARCHAR(30) = LTRIM(RTRIM(@cnpoliza));

        -- 1. Plantilla de la póliza (adpoliza). Los locales no pueden llamarse igual que los parámetros.
        DECLARE
            @cpoliza        NUMERIC(19, 0),
            @cramo          INT,
            @itipopol       CHAR(1),
            @csucur         INT,
            @csucurrec      INT,
            @criesgo        INT,
            @cpoliza_mae    NUMERIC(19, 0),
            @ccerti_mae     NUMERIC(19, 0),
            @cproces        NUMERIC(18, 0),
            @cmoneda        CHAR(10),
            @ptasamon       NUMERIC(18, 6),
            @casegurado     NUMERIC(19, 0),
            @ctenedor       NUMERIC(19, 0),
            @cbeneficiario  NUMERIC(19, 0),
            @cacreedor      NUMERIC(19, 0),
            @cfinanciera    NUMERIC(19, 0),
            @cproductor     NUMERIC(19, 0),
            @ifuente        CHAR(10),
            @ccanalalt      INT,
            @cscanalalt     INT,
            @ctipocanal     CHAR(1),
            @polFanopol     INT,
            @polFmespol     INT,
            @polFdesde      DATE,
            @polFhasta      DATE,
            @polCplan       NVARCHAR(10);

        SELECT TOP 1
            @cpoliza       = cpoliza,
            @cramo         = cramo,
            @itipopol      = ISNULL(itipopol, 'I'),
            @csucur        = ISNULL(csucur, 1),
            @csucurrec     = ISNULL(csucurrec, 1),
            @criesgo       = ISNULL(criesgo, 3),
            @cpoliza_mae   = ISNULL(cpoliza_mae, 0),
            @ccerti_mae    = ISNULL(ccerti_mae, 0),
            @cproces       = cproces,
            @cmoneda       = cmoneda,
            @ptasamon      = ISNULL(ptasamon, 1.0),
            @casegurado    = casegurado,
            @ctenedor      = ctenedor,
            @cbeneficiario = ISNULL(cbeneficiario, 0),
            @cacreedor     = ISNULL(cacreedor, 0),
            @cfinanciera   = ISNULL(cfinanciera, 0),
            @cproductor    = cproductor,
            @ifuente       = ifuente,
            @ccanalalt     = ccanalalt,
            @cscanalalt    = cscanalalt,
            @ctipocanal    = ctipocanal,
            @polFanopol    = fanopol,
            @polFmespol    = fmespol,
            @polFdesde     = fdesde,
            @polFhasta     = fhasta,
            @polCplan      = cplan
        FROM adpoliza
        WHERE cnpoliza = @cleanCnpoliza
        -- El período pedido se prefiere, no se exige: el llamador puede mandar uno inexistente.
        ORDER BY
            CASE
                WHEN @fanopol IS NOT NULL AND fanopol = @fanopol
                 AND (@fmespol IS NULL OR fmespol = @fmespol) THEN 0
                ELSE 1
            END,
            fanopol DESC, fmespol DESC;

        IF @cpoliza IS NULL
        BEGIN
            RAISERROR('No se encontró la póliza indicada para generar el recibo de endoso.', 16, 1);
        END

        -- Plan del endoso; si no viene, se conserva el de la póliza.
        DECLARE @cplanRecibo NVARCHAR(10) = COALESCE(NULLIF(LTRIM(RTRIM(@cplan)), ''), @polCplan);

        -- 2. Datos que solo viven a nivel de recibo: se heredan del último recibo de la póliza.
        DECLARE
            @ptasamon_pago  NUMERIC(18, 6),
            @itiponegocio   CHAR(2),
            @imodcobro      CHAR(2),
            @ctipoproductor INT,
            @pcomision      NUMERIC(8, 6),
            @ccerti         NUMERIC(19, 0),
            @cdoccob        INT;

        SELECT TOP 1
            @ptasamon_pago  = ptasamon_pago,
            @itiponegocio   = itiponegocio,
            @imodcobro      = imodcobro,
            @ctipoproductor = ctipoproductor,
            @pcomision      = pcomision,
            @ccerti         = ccerti,
            @cdoccob        = cdoccob
        FROM adrecibos
        WHERE cpoliza = @cpoliza
        ORDER BY crecibo DESC;

        SET @ptasamon_pago  = ISNULL(@ptasamon_pago, @ptasamon);
        SET @itiponegocio   = ISNULL(@itiponegocio, 'DI');
        SET @imodcobro      = ISNULL(@imodcobro, 'IN');
        SET @ctipoproductor = ISNULL(@ctipoproductor, 0);
        SET @pcomision      = ISNULL(@pcomision, 0);
        SET @ccerti         = ISNULL(@ccerti, 0);
        SET @cdoccob        = ISNULL(@cdoccob, 0);

        -- 3. La frecuencia manda sobre la cantidad de cuotas. Si no llega, se infiere de @ncuotas.
        IF @ifrecuencia IS NOT NULL
            SET @ifrecuencia = UPPER(LTRIM(RTRIM(@ifrecuencia)));

        IF @ifrecuencia IS NULL OR @ifrecuencia = ''
        BEGIN
            IF @ncuotas >= 12     SET @ifrecuencia = 'M';
            ELSE IF @ncuotas >= 4 SET @ifrecuencia = 'T';
            ELSE IF @ncuotas = 3  SET @ifrecuencia = 'C';
            ELSE IF @ncuotas = 2  SET @ifrecuencia = 'S';
            ELSE                  SET @ifrecuencia = 'A';
        END

        DECLARE @totalCuotas INT = 1;

        IF @ifrecuencia = 'M' SET @totalCuotas = 12;
        ELSE IF @ifrecuencia = 'T' SET @totalCuotas = 4;
        ELSE IF @ifrecuencia = 'C' SET @totalCuotas = 3;
        ELSE IF @ifrecuencia = 'S' SET @totalCuotas = 2;

        DECLARE @monthsPerCuota INT = 12 / @totalCuotas;

        -- 4. Prima total del endoso en ambas monedas (misma conversión que la emisión nativa).
        DECLARE @mprimaTotalExt NUMERIC(18, 2);

        IF LTRIM(RTRIM(ISNULL(@cmoneda, ''))) = 'Bs'
            SET @mprimaTotalExt = ROUND(@mprima / NULLIF(@ptasamon, 0), 2);
        ELSE
            SET @mprimaTotalExt = @mprima;

        -- Reparto por cuota: la 1ª absorbe los centavos, igual que el wizard de endosos.
        DECLARE @basePrimaExt  NUMERIC(18, 2) = FLOOR((@mprimaTotalExt / @totalCuotas) * 100) / 100;
        DECLARE @firstPrimaExt NUMERIC(18, 2) = @mprimaTotalExt - (@basePrimaExt * (@totalCuotas - 1));

        -- 5. Anular los recibos pendientes del mismo período y sus coberturas.
        DECLARE @anulados TABLE (crecibo NUMERIC(19, 0) PRIMARY KEY);

        UPDATE adrecibos
        SET iestadorec = 'A',
            fanulacion = GETDATE()
        OUTPUT deleted.crecibo INTO @anulados
        WHERE cpoliza = @cpoliza
          AND fanopol = @polFanopol
          AND fmespol = @polFmespol
          AND iestadorec = 'P';

        UPDATE adpolcob
        SET iestado = 'A'
        WHERE iestado = 'V'
          AND crecibo IN (SELECT crecibo FROM @anulados);

        -- 6. Generar un recibo por cuota, partiendo la vigencia en tramos de 12/cuotas meses.
        DECLARE @cuotaIdx      INT = 1;
        DECLARE @firstCnrecibo NVARCHAR(30) = NULL;
        DECLARE @firstCrecibo  NUMERIC(19, 0) = NULL;
        DECLARE @newCnrecibo   NVARCHAR(30);
        DECLARE @newCrecibo    NUMERIC(19, 0);
        DECLARE @errCounter    INT;
        DECLARE @cuotaPrimaExt NUMERIC(18, 2);
        DECLARE @cuotaPrimaBs  NUMERIC(18, 2);
        DECLARE @cuotaComExt   NUMERIC(18, 2);
        DECLARE @cuotaComBs    NUMERIC(18, 2);
        DECLARE @cuotaFdesde   DATE = @fdesde;
        DECLARE @cuotaFhasta   DATE;

        WHILE @cuotaIdx <= @totalCuotas
        BEGIN
            SET @newCnrecibo = NULL;
            SET @newCrecibo = NULL;
            SET @errCounter = 0;

            EXEC dbo.sp_calcula_num_contador_nexus
                @cramo = @cramo,
                @itipopol = @itipopol,
                @csucur = @csucur,
                @ccerti_mae = @ccerti_mae,
                @caso = 7,
                @cnrecibo = @newCnrecibo OUTPUT,
                @crecibo = @newCrecibo OUTPUT,
                @cerror = @errCounter OUTPUT;

            IF @newCrecibo IS NULL OR @newCnrecibo IS NULL
            BEGIN
                RAISERROR('Fallo al generar número de recibo por sp_calcula_num_contador_nexus.', 16, 1);
            END

            IF @firstCnrecibo IS NULL
            BEGIN
                SET @firstCnrecibo = LTRIM(RTRIM(@newCnrecibo));
                SET @firstCrecibo = @newCrecibo;
            END

            IF @cuotaIdx = 1
                SET @cuotaPrimaExt = @firstPrimaExt;
            ELSE
                SET @cuotaPrimaExt = @basePrimaExt;

            SET @cuotaPrimaBs  = ROUND(@cuotaPrimaExt * @ptasamon, 2);
            SET @cuotaComExt   = ROUND(@cuotaPrimaExt * @pcomision / 100, 2);
            SET @cuotaComBs    = ROUND(@cuotaPrimaBs * @pcomision / 100, 2);

            -- La última cuota cierra en la vigencia del endoso; los tramos nunca la sobrepasan.
            IF @cuotaIdx = @totalCuotas
                SET @cuotaFhasta = @fhasta;
            ELSE
                SET @cuotaFhasta = CONVERT(DATE, DATEADD(MM, @monthsPerCuota, @cuotaFdesde));

            IF @cuotaFhasta > @fhasta
                SET @cuotaFhasta = @fhasta;

            INSERT INTO adrecibos (
                crecibo, u_version, cnpoliza, cnrecibo, cpoliza, fanopol, fmespol, cramo, itipoprod, itiponegocio, itipopol,
                iestadoren, cpoliza_mae, ccerti_mae, itiporec, imodcobro, cdoccob, csucur, csucurrec, criesgo, ccerti, cproces,
                cserie_rea, casegurado, ctenedor, cbeneficiario, cacreedor, cfinanciera, cplan, cproductor, ctipoproductor,
                cmoneda, ptasamon, ptasamon_pago, femision, fdesde, fhasta, fdesde_pol, fhasta_pol,
                itipoanul, nlote, iestcont, fcobro, iestadorec, ifinanciado, idevolucion, iformadevo,
                mprimabruta, mprimabrutaext, mprimaneta, mprimanetaext, pretcoa, pcomision, mcomision, mcomisionext,
                mmontorec, mmontorecext, mabono, mabonoext, mmontoapag, mmontoapagext,
                fpago, mpagado, mpagadoext, mpendiente, mpendientext,
                itipocta, itarjeta, qcuotas, cprog, ifuente, fingreso, cusuario,
                ifrecuencia, cnrecibo_rel, ccanalalt, cscanalalt, ctipocanal
            )
            VALUES (
                -- itiporec = 'A' (Adicional): la prima del endoso no es de primer año ni renovación.
                @newCrecibo, '!', @cleanCnpoliza, LTRIM(RTRIM(@newCnrecibo)), @cpoliza, @polFanopol, @polFmespol, @cramo, 'NU', @itiponegocio, @itipopol,
                'N', @cpoliza_mae, @ccerti_mae, 'A', @imodcobro, @cdoccob, @csucur, @csucurrec, @criesgo, @ccerti, @cproces,
                0, @casegurado, @ctenedor, @cbeneficiario, @cacreedor, @cfinanciera, @cplanRecibo, @cproductor, @ctipoproductor,
                @cmoneda, @ptasamon, @ptasamon_pago, GETDATE(), @cuotaFdesde, @cuotaFhasta, ISNULL(@polFdesde, @fdesde), ISNULL(@polFhasta, @fhasta),
                'N', 0, 'P', NULL, 'P', 0, 'P', 'N',
                @cuotaPrimaBs, @cuotaPrimaExt, @cuotaPrimaBs, @cuotaPrimaExt, 100, @pcomision, @cuotaComBs, @cuotaComExt,
                @cuotaPrimaBs, @cuotaPrimaExt, 0, 0, @cuotaPrimaBs, @cuotaPrimaExt,
                NULL, 0, 0, 0, 0,
                'N', 'N', @cuotaIdx, 'EndosoRecibo', @ifuente, GETDATE(), @cusuario,
                @ifrecuencia, NULL, @ccanalalt, @cscanalalt, @ctipocanal
            );

            EXEC dbo.spGeneraAdpolrea @crecibo = @newCrecibo;

            SET @cuotaIdx = @cuotaIdx + 1;
            SET @cuotaFdesde = @cuotaFhasta;
        END

        -- 7. Actualizar el contrato con el plan y la frecuencia del endoso.
        UPDATE adpoliza
        SET cplan = @cplanRecibo,
            ifrecuencia = @ifrecuencia
        WHERE cpoliza = @cpoliza;

        IF OBJECT_ID(N'dbo.adcertificado', N'U') IS NOT NULL
        BEGIN
            DECLARE @sqlCert NVARCHAR(MAX) = N'
                UPDATE adcertificado
                SET ifrecuencia = @ifrecuencia
                WHERE cpoliza = @cpoliza';
            EXEC sp_executesql
                @sqlCert,
                N'@ifrecuencia CHAR(1), @cpoliza NUMERIC(19,0)',
                @ifrecuencia = @ifrecuencia,
                @cpoliza = @cpoliza;
        END

        SET @pCnrecibo = @firstCnrecibo;
        SET @pCrecibo = @firstCrecibo;
        SET @pSuccess = 1;
        IF @totalCuotas > 1
            SET @pErrorMessage = 'Recibos de endoso creados exitosamente ('
                + CAST(@totalCuotas AS NVARCHAR(10)) + ' cuotas, frecuencia '
                + @ifrecuencia + ').';
        ELSE
            SET @pErrorMessage = 'Recibo de endoso creado exitosamente (frecuencia '
                + @ifrecuencia + ').';

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        SET @pSuccess = 0;
        SET @pErrorMessage = ERROR_MESSAGE();
    END CATCH
END;
GO
