-- Endoso: crear recibo + actualizar plan/frecuencia en adpoliza (misma transacción).
-- Desplegar en Sis2000 QA/prod. Reemplaza la versión sin @ifrecuencia.

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

        -- 2. Calcular número de cuota máximo
        DECLARE @maxCuota INT = 1;
        SELECT @maxCuota = ISNULL(MAX(qcuotas), 0) + 1 FROM adrecibos WHERE cpoliza = @cpoliza;

        -- 3. Generar número de recibo usando sp_calcula_num_contador_nexus
        DECLARE @newCnrecibo NVARCHAR(30), @newCrecibo NUMERIC(19, 0), @errCounter INT;

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

        -- 4. Anular cualquier recibo pendiente anterior para evitar duplicidad de cobro
        UPDATE adrecibos SET iestadorec = 'A', fanulacion = GETDATE() WHERE cpoliza = @cpoliza AND iestadorec = 'P';
        UPDATE adpolcob SET iestado = 'A' WHERE cpoliza = @cpoliza AND iestado = 'V' AND crecibo IN (SELECT crecibo FROM adrecibos WHERE cpoliza = @cpoliza AND iestadorec = 'A');

        -- 5. Calcular primas en moneda local y divisas
        DECLARE @mprimaext NUMERIC(18, 2) = @mprima;
        DECLARE @mprimabs NUMERIC(18, 2) = ROUND(@mprimaext * @ptasamon, 2);

        -- 6. Insertar nuevo recibo de endoso
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
            @fdesde, @fhasta, @fdesde, @fhasta, GETDATE(), GETDATE(), @cusuario, 'EndosoRecibo',
            'P', @mprimabs, @mprimabs, @mprimabs, @mprimabs, @mprimabs, @mprimabs, @mprimabs,
            @mprimaext, @mprimaext, @mprimaext, @mprimaext, @mprimaext, @mprimaext, @mprimaext, @ptasamon
        );

        -- 7. Actualizar contrato (plan y frecuencia) en la misma transacción del endoso
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

        -- 8. Ejecutar spGeneraAdpolrea
        EXEC dbo.spGeneraAdpolrea @crecibo = @newCrecibo;

        -- 9. Retornar outputs
        SET @pCnrecibo = TRIM(@newCnrecibo);
        SET @pCrecibo = @newCrecibo;
        SET @pSuccess = 1;
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
