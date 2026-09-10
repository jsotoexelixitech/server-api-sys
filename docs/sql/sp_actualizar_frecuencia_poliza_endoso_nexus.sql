-- Actualiza ifrecuencia en adpoliza tras endoso con fraccionamiento.
-- Desplegar en Sis2000 QA/prod antes de usar crearRecibo con ifrecuencia.

CREATE OR ALTER PROCEDURE [dbo].[sp_actualizar_frecuencia_poliza_endoso_nexus]
    @cnpoliza           NVARCHAR(50),
    @ifrecuencia        CHAR(1),
    @ncuotas            INT = NULL,
    @cusuario           INT = 1,
    @pSuccess           BIT = 0 OUTPUT,
    @pErrorMessage      NVARCHAR(MAX) = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @cpoliza NUMERIC(19, 0);

        SELECT TOP 1 @cpoliza = pol.cpoliza
        FROM adpoliza pol WITH (UPDLOCK, ROWLOCK)
        WHERE RTRIM(pol.cnpoliza) = RTRIM(@cnpoliza);

        IF @cpoliza IS NULL
            THROW 99101, 'Póliza no encontrada para actualizar frecuencia.', 1;

        IF @ifrecuencia IS NULL OR LTRIM(RTRIM(@ifrecuencia)) = ''
            THROW 99102, 'ifrecuencia es requerida.', 1;

        UPDATE adpoliza
        SET ifrecuencia = @ifrecuencia
        WHERE cpoliza = @cpoliza;

        IF EXISTS (SELECT 1 FROM adcertificado WHERE cpoliza = @cpoliza)
        BEGIN
            UPDATE adcertificado
            SET ifrecuencia = @ifrecuencia
            WHERE cpoliza = @cpoliza;
        END

        SET @pSuccess = 1;
        SET @pErrorMessage = 'Frecuencia de pago actualizada correctamente.';

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        SET @pSuccess = 0;
        SET @pErrorMessage = ERROR_MESSAGE();
    END CATCH
END
GO
