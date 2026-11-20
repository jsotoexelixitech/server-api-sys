-- REVERSO: versión de sp_poliza_observacion_nexus en QA .80 antes de la auditoría (exportada el 20-nov-2026).
-- Aplicar solo para volver atrás. La API ya desplegada con auditoría manda parámetros extra: revertir también la API.

-- [observaciones 17-nov-2026] Observaciones de la póliza enviadas por las APIs de emisión de Exélixi
-- (personas y RCV). Guarda el texto en adpoliza.xobserva (VARCHAR(255)) de la póliza ya emitida.
-- No modifica los SP de emisión: nest-api lo llama justo después de emitir.
-- Solo actualiza la versión vigente de la póliza (u_version = '!'). Sin texto, no cambia nada.
-- Devuelve las filas actualizadas (0 = la póliza no existe o no hay texto).
-- Base: Sis2000_QA primero; producción cuando QA lo apruebe.

CREATE OR ALTER PROCEDURE [dbo].[sp_poliza_observacion_nexus]
    @cnpoliza VARCHAR(30),
    @xobserva VARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @texto VARCHAR(255) = NULLIF(LTRIM(RTRIM(@xobserva)), '');
    DECLARE @filas INT = 0;

    IF @texto IS NOT NULL AND NULLIF(LTRIM(RTRIM(@cnpoliza)), '') IS NOT NULL
    BEGIN
        UPDATE adpoliza
           SET xobserva = @texto
         WHERE cnpoliza = LTRIM(RTRIM(@cnpoliza))
           AND u_version = '!';
        SET @filas = @@ROWCOUNT;
    END

    SELECT @filas AS filas_actualizadas;
END

-- Permiso de ejecución al usuario de nest-api (el mismo que ya ejecuta sp_emision_personas_general_nexus).
-- El DBA completa el usuario correspondiente:
-- GRANT EXECUTE ON [dbo].[sp_poliza_observacion_nexus] TO [<usuario de nest-api>];
