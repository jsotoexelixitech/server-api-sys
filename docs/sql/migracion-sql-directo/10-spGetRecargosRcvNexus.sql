/*
  migracion-sql-directo #10
  valrep.service.ts getRecargosRcv → sp_get_recargos_rcv_nexus

  SQL reemplazado:
    SELECT csustanc, LTRIM(RTRIM(xsustanc)), porcenta
    FROM masustac WHERE cramo = @cramo
*/

CREATE OR ALTER PROCEDURE [dbo].[sp_get_recargos_rcv_nexus]
    @cramo INT = 18
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        csustanc,
        LTRIM(RTRIM(xsustanc)) AS xsustanc,
        porcenta
    FROM masustac
    WHERE cramo = @cramo
    ORDER BY porcenta, xsustanc;
END;
