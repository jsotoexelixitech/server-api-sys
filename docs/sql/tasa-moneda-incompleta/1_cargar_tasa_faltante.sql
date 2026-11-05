-- Contingencia: completa una tasa que quedó en NULL o 0 en mamonedas y mavamoneda.
-- No sobrescribe una tasa válida y no se debe inventar el valor: usar el publicado por el BCV para esa fecha.
-- Repetir el proceso de carga no sirve: spInsertMonedaHistory no toca una fila que ya existe.
-- 05/11/2026: esta incidencia ya se corrigió (EUR 1006.0326). Con estos valores el script no cambia nada.

DECLARE @cmoneda CHAR(4) = 'EUR';
DECLARE @fmoneda DATE = '2026-11-05';
DECLARE @ptasamon NUMERIC(13, 6) = 1006.032640;

SET XACT_ABORT ON;
SET NOCOUNT ON;

IF ISNULL(@ptasamon, 0) <= 0
    THROW 99003, 'Indique una tasa mayor que cero.', 1;

SELECT 'antes' AS momento, 'mamonedas' AS tabla, ptasamon FROM mamonedas WHERE cmoneda = @cmoneda
UNION ALL
SELECT 'antes', 'mavamoneda', ptasamon FROM mavamoneda WHERE cmoneda = @cmoneda AND fmoneda = @fmoneda;

BEGIN TRANSACTION;

UPDATE mavamoneda
SET ptasamon = @ptasamon, fultmod = GETDATE()
WHERE cmoneda = @cmoneda AND fmoneda = @fmoneda AND ISNULL(ptasamon, 0) <= 0;

-- mamonedas guarda la tasa vigente: solo se toca si la fecha es la más reciente del histórico.
UPDATE mamonedas
SET ptasamon = @ptasamon, fultmod = GETDATE()
WHERE cmoneda = @cmoneda AND ISNULL(ptasamon, 0) <= 0
  AND @fmoneda = (SELECT MAX(fmoneda) FROM mavamoneda WHERE cmoneda = @cmoneda);

COMMIT TRANSACTION;

SELECT 'despues' AS momento, 'mamonedas' AS tabla, ptasamon FROM mamonedas WHERE cmoneda = @cmoneda
UNION ALL
SELECT 'despues', 'mavamoneda', ptasamon FROM mavamoneda WHERE cmoneda = @cmoneda AND fmoneda = @fmoneda;
