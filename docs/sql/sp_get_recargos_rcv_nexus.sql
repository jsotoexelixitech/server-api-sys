/*
  nest-api — GET /api/v1/valrep/recargosRCV
  ─────────────────────────────────────────
  Reemplaza SQL directo en valrep.service.ts getRecargosRcv().

  Origen: masustac (ramo RCV = 18 por defecto).
  Paridad SysIP GET /valrep/recargosRCV (Sequelize Masustac.findAll).

  Despliegue Sis2000 (srv001 / QA):
    sqlcmd -S ... -d ... -i sp_get_recargos_rcv_nexus.sql
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
