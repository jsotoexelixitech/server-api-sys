/*
  nest-api — reemplaza SQL directo en producción
  ─────────────────────────────────────────────
  emissions.service.ts → bumpPolVehCounter (flujo emisión RCV local)

  SQL reemplazado:
    UPDATE macontadores SET qcontador=ISNULL(qcontador,0)+1 WHERE ccontador='POL_VEH'
*/

CREATE OR ALTER PROCEDURE [dbo].[spBumpPolVehCounter]
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE macontadores
    SET qcontador = ISNULL(qcontador, 0) + 1
    WHERE ccontador = 'POL_VEH';
END;
