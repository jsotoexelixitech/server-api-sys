SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
-- REVERSA: definición de PROD .67 al 20-nov-2026
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

    -- 1. Validar Plan enviado
    IF @cplan IS NULL OR TRIM(@cplan) = ''
    BEGIN
        SET @error = 'Plan no debe estar vacío.';
    END
    ELSE
    BEGIN
        SELECT @cramo = cramo 
        FROM maplanes 
        WHERE cplan = TRIM(@cplan) AND iestado = 'V';

        IF @cramo IS NULL
	        BEGIN
	            SET @error = 'Plan enviado no se encuentra registrado.';
	        END
        ELSE IF @cramo NOT IN(18, 28)
	        BEGIN
	            SET @error = 'Ramo no corresponde a Automóvil.';
	        END
    END;

    -- 2. Validaciones de datos obligatorios del vehículo (Ramo 18)
    IF @error IS NULL
    BEGIN
        IF @xplaca IS NULL OR TRIM(@xplaca) = ''
        BEGIN
            SET @error = 'Placa no debe estar vacío';
        END
        ELSE IF @xsercar IS NULL OR TRIM(@xsercar) = ''
        BEGIN
            SET @error = 'Serial de Carrocería no debe estar vacío';
        END
    END;

    -- 3. Validar existencia de Póliza Vigente con la misma Placa
    IF @error IS NULL
    BEGIN
        IF EXISTS (
            SELECT 1 
            FROM vhcerti 
            WHERE TRIM(xplaca) = TRIM(@xplaca) 
              AND istatcer = 'V' 
              AND fhasta >= CAST(GETDATE() AS DATE)
        )
        BEGIN
            SET @error = 'Se ha detectado la existencia de una póliza vigente la misma placa del vehículo.';
        END;
    END;

    -- 4. Validar existencia de Póliza Vigente con el mismo Serial de Carrocería
    IF @error IS NULL
    BEGIN
        IF EXISTS (
            SELECT 1 
            FROM vhcerti 
            WHERE TRIM(xsercar) = TRIM(@xsercar) 
              AND istatcer = 'V' 
              AND fhasta >= CAST(GETDATE() AS DATE)
        )
        BEGIN
            SET @error = 'Se ha detectado la existencia de una póliza vigente con el mismo Serial Carrocería del Vehículo.';
        END;
    END;

    -- 5. Disparar excepción consolidada si alguna regla de negocio falló
    IF @error IS NOT NULL
    BEGIN
        THROW 99001, @error, 1;
    END;
END;
GO
