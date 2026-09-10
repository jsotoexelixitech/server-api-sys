-- Endoso: crear recibo(s) fraccionados + actualizar plan/frecuencia en adpoliza (misma transacción).
-- @mprima = prima total del endoso; @ncuotas = cuotas a generar (si > 1 divide monto y vigencia).
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

        DECLARE @cleanCnpoliza NVARCHAR(30) = TRIM(@cnpoliza);

        -- 1. Obtener la plantilla de la póliza en adpoliza
        DECLARE @cpoliza NUMERIC(19, 0), @cramo INT, @itipopol CHAR(1), @csucur INT, @ccerti_mae NUMERIC(19, 0), @ptasamon NUMERIC(18, 6), @casegurado NUMERIC(19, 0), @ctenedor NUMERIC(19, 0), @cbeneficiario NUMERIC(19, 0), @cproductor INT;

        SELECT TOP 1
            @cpoliza = cpoliza,
            @cramo = cramo,
            @itipopol = ISNULL(itipopol, 'I'),
            @csucur = ISNULL(csucur, 1),
            @ccerti_mae = ISNULL(ccerti_mae, 0),
            @ptasamon = ISNULL(ptasamon, 1.0),
            @casegurado = casegurado,
            @ctenedor = ctenedor,
            @cbeneficiario = cbeneficiario,
            @cproductor = cproductor
        FROM adpoliza
        WHERE cnpoliza = @cleanCnpoliza;

        IF @cpoliza IS NULL
        BEGIN
            RAISERROR('No se encontró la póliza indicada para generar el recibo de endoso.', 16, 1);
        END

        -- 2. Resolver cantidad de cuotas / recibos a generar
        DECLARE @totalCuotas INT = 1;
        DECLARE @monthsPerCuota INT;
        DECLARE @periodMonths INT;

        IF @ncuotas IS NOT NULL AND @ncuotas > 1
            SET @totalCuotas = @ncuotas;
        ELSE IF @ifrecuencia IS NOT NULL AND LTRIM(RTRIM(@ifrecuencia)) <> '' AND @ifrecuencia NOT IN ('A', 'E')
        BEGIN
            IF UPPER(@ifrecuencia) = 'M'
                SET @monthsPerCuota = 1;
            ELSE IF UPPER(@ifrecuencia) = 'T'
                SET @monthsPerCuota = 3;
            ELSE IF UPPER(@ifrecuencia) = 'C'
                SET @monthsPerCuota = 4;
            ELSE IF UPPER(@ifrecuencia) = 'S'
                SET @monthsPerCuota = 6;
            ELSE
                SET @monthsPerCuota = 12;
            SET @periodMonths = DATEDIFF(MONTH, @fdesde, @fhasta);
            IF @periodMonths < 1 SET @periodMonths = 1;
            SET @totalCuotas = CEILING(CAST(@periodMonths AS FLOAT) / @monthsPerCuota);
            IF @totalCuotas < 1 SET @totalCuotas = 1;
        END

        -- 3. Secuencia qcuotas en la póliza
        DECLARE @maxCuota INT = 1;
        SELECT @maxCuota = ISNULL(MAX(qcuotas), 0) + 1 FROM adrecibos WHERE cpoliza = @cpoliza;

        -- 4. Anular recibos pendientes anteriores (una sola vez)
        UPDATE adrecibos SET iestadorec = 'A', fanulacion = GETDATE() WHERE cpoliza = @cpoliza AND iestadorec = 'P';
        UPDATE adpolcob SET iestado = 'A' WHERE cpoliza = @cpoliza AND iestado = 'V' AND crecibo IN (SELECT crecibo FROM adrecibos WHERE cpoliza = @cpoliza AND iestadorec = 'A');

        -- 5. Fraccionar prima total (1ª cuota absorbe centavos, igual que el wizard de endosos)
        DECLARE @mprimaTotalExt NUMERIC(18, 2) = @mprima;
        DECLARE @basePrimaExt NUMERIC(18, 2) = FLOOR((@mprimaTotalExt / @totalCuotas) * 100) / 100;
        DECLARE @firstPrimaExt NUMERIC(18, 2) = @mprimaTotalExt - (@basePrimaExt * (@totalCuotas - 1));

        -- 6. Fraccionar vigencia [fdesde, fhasta] en segmentos iguales
        DECLARE @totalDays INT = DATEDIFF(DAY, @fdesde, @fhasta);
        IF @totalDays < 1 SET @totalDays = 1;

        DECLARE @cuotaIdx INT = 1;
        DECLARE @firstCnrecibo NVARCHAR(30) = NULL;
        DECLARE @firstCrecibo NUMERIC(19, 0) = NULL;
        DECLARE @newCnrecibo NVARCHAR(30);
        DECLARE @newCrecibo NUMERIC(19, 0);
        DECLARE @errCounter INT;
        DECLARE @cuotaPrimaExt NUMERIC(18, 2);
        DECLARE @cuotaPrimaBs NUMERIC(18, 2);
        DECLARE @cuotaFdesde DATE;
        DECLARE @cuotaFhasta DATE;
        DECLARE @daysPerCuota INT = @totalDays / @totalCuotas;
        IF @daysPerCuota < 1 SET @daysPerCuota = 1;

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
                SET @firstCnrecibo = TRIM(@newCnrecibo);
                SET @firstCrecibo = @newCrecibo;
            END

            IF @cuotaIdx = 1
                SET @cuotaPrimaExt = @firstPrimaExt;
            ELSE
                SET @cuotaPrimaExt = @basePrimaExt;

            SET @cuotaPrimaBs = ROUND(@cuotaPrimaExt * @ptasamon, 2);
            SET @cuotaFdesde = DATEADD(DAY, (@cuotaIdx - 1) * @daysPerCuota, @fdesde);

            IF @cuotaIdx = @totalCuotas
                SET @cuotaFhasta = @fhasta;
            ELSE
                SET @cuotaFhasta = DATEADD(DAY, @cuotaIdx * @daysPerCuota, @fdesde);

            INSERT INTO adrecibos (
                crecibo, cnrecibo, cpoliza, cnpoliza, cramo, itipopol, csucur, ccerti_mae,
                casegurado, ctenedor, cbeneficiario, cproductor, cplan, qcuotas,
                fdesde, fhasta, fdesde_dev, fhasta_dev, femision, fingreso, cusuario, cprog,
                iestadorec, mprimabruta, mprimaneta, mprimareas, mmontoneto, mmontorec, mmontoapag, mpendiente,
                mprimabrutaext, mprimanetaext, mprimareasext, mmontonetoext, mmontorecext, mmontoapagext, mpendientext, ptasamon
            )
            VALUES (
                @newCrecibo, TRIM(@newCnrecibo), @cpoliza, @cleanCnpoliza, @cramo, @itipopol, @csucur, @ccerti_mae,
                @casegurado, @ctenedor, @cbeneficiario, @cproductor, ISNULL(@cplan, 'ESTANDAR'), @maxCuota,
                @cuotaFdesde, @cuotaFhasta, @cuotaFdesde, @cuotaFhasta, GETDATE(), GETDATE(), @cusuario, 'EndosoRecibo',
                'P', @cuotaPrimaBs, @cuotaPrimaBs, @cuotaPrimaBs, @cuotaPrimaBs, @cuotaPrimaBs, @cuotaPrimaBs, @cuotaPrimaBs,
                @cuotaPrimaExt, @cuotaPrimaExt, @cuotaPrimaExt, @cuotaPrimaExt, @cuotaPrimaExt, @cuotaPrimaExt, @cuotaPrimaExt, @ptasamon
            );

            EXEC dbo.spGeneraAdpolrea @crecibo = @newCrecibo;

            SET @cuotaIdx = @cuotaIdx + 1;
            SET @maxCuota = @maxCuota + 1;
        END

        -- 7. Actualizar contrato (plan y frecuencia)
        IF @cplan IS NOT NULL AND LTRIM(RTRIM(@cplan)) <> ''
        BEGIN
            UPDATE adpoliza
            SET cplan = LTRIM(RTRIM(@cplan))
            WHERE cpoliza = @cpoliza;
        END

        IF @ifrecuencia IS NOT NULL AND LTRIM(RTRIM(@ifrecuencia)) <> ''
        BEGIN
            UPDATE adpoliza
            SET ifrecuencia = @ifrecuencia
            WHERE cpoliza = @cpoliza;

            IF EXISTS (SELECT 1 FROM adcertificado WHERE cpoliza = @cpoliza)
            BEGIN
                UPDATE adcertificado
                SET ifrecuencia = @ifrecuencia
                WHERE cpoliza = @cpoliza;
            END
        END

        SET @pCnrecibo = @firstCnrecibo;
        SET @pCrecibo = @firstCrecibo;
        SET @pSuccess = 1;
        IF @totalCuotas > 1
            SET @pErrorMessage = 'Recibos de endoso creados exitosamente (' + CAST(@totalCuotas AS NVARCHAR(10)) + ' cuotas).';
        ELSE
            SET @pErrorMessage = 'Recibo de endoso creado exitosamente.';

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
