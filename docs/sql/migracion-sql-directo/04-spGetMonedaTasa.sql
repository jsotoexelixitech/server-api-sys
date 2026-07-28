/*
  nest-api — reemplaza SQL directo en producción
  ─────────────────────────────────────────────
  valrep.service.ts   → getCotizacionAuto
  collection.service.ts → searchByClient, buildCollectionPayloadInternal

  SQL reemplazado:
    SELECT ptasamon FROM mamonedas WHERE TRIM(cmoneda)='$'
    SELECT ptasamon FROM mamonedas WHERE cmoneda=@cmoneda
*/

CREATE OR ALTER PROCEDURE [dbo].[spGetMonedaTasa]
    @cmoneda VARCHAR(10)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT TOP 1 ptasamon
    FROM mamonedas
    WHERE TRIM(cmoneda) = TRIM(@cmoneda)
       OR cmoneda = @cmoneda
    ORDER BY fdesde DESC;
END;
