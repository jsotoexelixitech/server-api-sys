-- [observaciones 20-nov-2026] Proceso de auditoría "Observaciones Poliza" en maauprocesos.
-- Idempotente: si ya existe (QA .80 lo tiene como cproceso 17 desde el 02-oct-2026) no hace nada.
-- Aplicar ANTES de 01_sp_poliza_observacion_nexus_auditoria.sql: sin el proceso, la SP no guarda la observación.
-- cproceso es identity: en producción puede quedar con otro número; la SP lo busca por nombre.

IF NOT EXISTS (SELECT 1 FROM maauprocesos WHERE LTRIM(RTRIM(xproceso)) = 'Observaciones Poliza')
BEGIN
    INSERT INTO maauprocesos (xproceso, xllave, fcreacion, cusuario)
    VALUES ('Observaciones Poliza', 'cnpoliza', GETDATE(), 1);
END

SELECT cproceso, xproceso, xllave, fcreacion
  FROM maauprocesos
 WHERE LTRIM(RTRIM(xproceso)) = 'Observaciones Poliza';
GO

-- Reverso (solo si este script lo creó; en QA ya existía y NO se debe borrar):
-- DELETE FROM maauprocesos WHERE LTRIM(RTRIM(xproceso)) = 'Observaciones Poliza'
--    AND NOT EXISTS (SELECT 1 FROM auoperaciones a WHERE a.cproceso = maauprocesos.cproceso);
