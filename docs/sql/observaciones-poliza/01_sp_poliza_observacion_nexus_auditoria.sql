-- [observaciones 20-nov-2026] Auditoría de las observaciones de la póliza (adpoliza.xobserva).
-- Base: versión de QA .80 del 17-nov (00_reverso_...). Cambios:
--   * Cada llamada deja una fila en auoperaciones con el proceso "Observaciones Poliza" de maauprocesos
--     (cproceso 17 en QA; se busca por nombre porque el identity puede ser otro en producción).
--   * xitem = cnpoliza; xobservacion = JSON con origen, canal, apiKeyId, valor anterior y nuevo.
--   * iestatus F = guardada, E = sin filas (póliza no encontrada) o error.
--   * Parámetros nuevos opcionales (@cusuario, @ifuente, @xorigen, @xcanal, @xapikey_id): la API vieja que
--     solo manda @cnpoliza y @xobserva sigue funcionando y audita con ifuente NEXUS_API.
--   * El UPDATE y la auditoría van en la misma transacción: si la auditoría falla, la observación no se guarda
--     (la API lo registra como warn y la emisión sigue OK, como hoy).
-- Requisito: 02_maauprocesos_observaciones_poliza.sql (crea el proceso si no existe).

CREATE OR ALTER PROCEDURE [dbo].[sp_poliza_observacion_nexus]
    @cnpoliza   VARCHAR(30),
    @xobserva   VARCHAR(255),
    @cusuario   INT          = NULL,  -- usuario Sis2000 si lo envía el canal (SSO); NULL desde APIs externas
    @ifuente    VARCHAR(30)  = NULL,  -- NULL = 'NEXUS_API'
    @xorigen    VARCHAR(30)  = NULL,  -- emision_rcv | emision_personas | ...
    @xcanal     VARCHAR(50)  = NULL,  -- canal de venta de la API key
    @xapikey_id VARCHAR(50)  = NULL   -- id de la API key (nunca la key)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @poliza   VARCHAR(30)  = NULLIF(LTRIM(RTRIM(@cnpoliza)), '');
    DECLARE @texto    VARCHAR(255) = NULLIF(LTRIM(RTRIM(@xobserva)), '');
    DECLARE @filas    INT = 0;
    DECLARE @anterior VARCHAR(255);
    DECLARE @finicio  DATETIME = GETDATE();
    DECLARE @cproceso INT;

    -- Sin póliza o sin texto: no cambia nada y no audita (igual que antes).
    IF @texto IS NULL OR @poliza IS NULL
    BEGIN
        SELECT @filas AS filas_actualizadas;
        RETURN;
    END

    SELECT TOP (1) @cproceso = cproceso
      FROM maauprocesos
     WHERE LTRIM(RTRIM(xproceso)) = 'Observaciones Poliza'
     ORDER BY cproceso;

    IF @cproceso IS NULL
        THROW 99171, N'AUDITORIA_SIN_PROCESO: no existe "Observaciones Poliza" en maauprocesos (aplicar 02_maauprocesos_observaciones_poliza.sql).', 1;

    BEGIN TRANSACTION;

        SELECT TOP (1) @anterior = NULLIF(LTRIM(RTRIM(xobserva)), '')
          FROM adpoliza WITH (UPDLOCK)
         WHERE cnpoliza = @poliza
           AND u_version = '!';

        UPDATE adpoliza
           SET xobserva = @texto
         WHERE cnpoliza = @poliza
           AND u_version = '!';
        SET @filas = @@ROWCOUNT;

        -- JSON para xobservacion (VARCHAR(700)): el valor nuevo completo; el anterior se recorta si no cabe.
        DECLARE @cab VARCHAR(400) = CONCAT(
            '{"origen":',   IIF(@xorigen    IS NULL, 'null', CONCAT('"', STRING_ESCAPE(LEFT(@xorigen, 30), 'json'), '"')),
            ',"canal":',    IIF(@xcanal     IS NULL, 'null', CONCAT('"', STRING_ESCAPE(LEFT(@xcanal, 50), 'json'), '"')),
            ',"apiKeyId":', IIF(@xapikey_id IS NULL, 'null', CONCAT('"', STRING_ESCAPE(LEFT(@xapikey_id, 50), 'json'), '"')),
            ',"filas":', @filas);
        DECLARE @nuevo VARCHAR(700) = CONCAT(',"nuevo":"', STRING_ESCAPE(@texto, 'json'), '"}');
        DECLARE @espacio INT = 700 - LEN(@cab) - LEN(@nuevo) - LEN(',"anterior":""');
        DECLARE @ant VARCHAR(700) = ',"anterior":null';
        IF @anterior IS NOT NULL
        BEGIN
            -- Se recorta el texto ANTES de escaparlo, para no partir una secuencia de escape (\" o \uXXXX).
            DECLARE @n INT = LEN(@anterior);
            WHILE @n > 0 AND LEN(STRING_ESCAPE(LEFT(@anterior, @n), 'json')) > @espacio
                SET @n = @n - 5;
            SET @ant = IIF(@n > 0,
                           CONCAT(',"anterior":"', STRING_ESCAPE(LEFT(@anterior, @n), 'json'), '"'),
                           ',"anterior":""');
        END

        INSERT INTO auoperaciones
            (cproceso, xhostname, ifuente, xip, cusuario, finicio, ffinal, iestatus, xitem, xobservacion)
        VALUES
            (@cproceso,
             LEFT(HOST_NAME(), 128),
             COALESCE(NULLIF(LTRIM(RTRIM(@ifuente)), ''), 'NEXUS_API'),
             NULL,
             @cusuario,
             @finicio,
             GETDATE(),
             IIF(@filas > 0, 'F', 'E'),
             @poliza,
             LEFT(CONCAT(@cab, @ant, @nuevo), 700));

    COMMIT TRANSACTION;

    SELECT @filas AS filas_actualizadas;
END
GO

-- Permiso de ejecución: el mismo que ya tiene el usuario de nest-api sobre esta SP (no cambia).
