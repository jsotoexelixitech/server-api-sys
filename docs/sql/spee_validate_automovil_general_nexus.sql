-- Validación automóvil RCV + BINAC* (Nexus).
-- Invocado por: nest-api validateEmissionAuto + sp_pre_emision_automovil_rcv_nexus
-- Reemplaza speeValidateAutomovilGeneral (legacy solo ramo 18).

CREATE OR ALTER PROCEDURE [dbo].[spee_validate_automovil_general_nexus]
    @cplan    VARCHAR(10),
    @xplaca   VARCHAR(15),
    @xsercar  VARCHAR(60),
    @xsermot  VARCHAR(60) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE
        @cramo INT,
        @error VARCHAR(250);

    IF @cplan IS NULL OR TRIM(@cplan) = ''
    BEGIN
        SET @error = 'Plan no debe estar vacío.';
    END
    ELSE
    BEGIN
        SELECT TOP 1 @cramo = cramo
        FROM maplanes
        WHERE cplan = TRIM(@cplan) AND iestado = 'V'
        ORDER BY CASE WHEN cramo = 28 THEN 0 WHEN cramo = 18 THEN 1 ELSE 2 END;

        IF @cramo IS NULL
        BEGIN
            SET @error = 'Plan enviado no se encuentra registrado.';
        END
        ELSE IF @cramo NOT IN (18, 28)
        BEGIN
            SET @error = 'Ramo no corresponde a Automóvil.';
        END
    END;

    IF @error IS NULL
    BEGIN
        IF @xplaca IS NULL OR TRIM(@xplaca) = ''
            SET @error = 'Placa no debe estar vacío';
        ELSE IF @xsercar IS NULL OR TRIM(@xsercar) = ''
            SET @error = 'Serial de Carrocería no debe estar vacío';
    END;

    IF @error IS NULL
    BEGIN
        IF EXISTS (
            SELECT 1
            FROM vhcerti
            WHERE TRIM(xplaca) = TRIM(@xplaca)
              AND istatcer = 'V'
              AND fhasta >= CAST(GETDATE() AS DATE)
        )
            SET @error = 'Se ha detectado la existencia de una póliza vigente la misma placa del vehículo.';
    END;

    IF @error IS NULL
    BEGIN
        IF EXISTS (
            SELECT 1
            FROM vhcerti
            WHERE TRIM(xsercar) = TRIM(@xsercar)
              AND istatcer = 'V'
              AND fhasta >= CAST(GETDATE() AS DATE)
        )
            SET @error = 'Se ha detectado la existencia de una póliza vigente con el mismo Serial Carrocería del Vehículo.';
    END;

    IF @error IS NOT NULL
        THROW 99001, @error, 1;
END;
