-- Última póliza/recibo del titular (post-emisión cuando el SP no devuelve cnpoliza en recordset).

CREATE OR ALTER PROCEDURE [dbo].[spGetPolizaRecienteTitular]
    @casegurado NUMERIC(9, 0)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT TOP 1
        pol.cpoliza,
        pol.cnpoliza,
        pol.fanopol,
        pol.fmespol,
        rec.cnrecibo,
        rec.qcuotas
    FROM adpoliza pol
    INNER JOIN adrecibos rec
        ON rec.cnpoliza = pol.cnpoliza AND rec.qcuotas = 1
    WHERE pol.casegurado = @casegurado
    ORDER BY COALESCE(pol.forigen, pol.fingreso) DESC,
             pol.fanopol DESC,
             pol.fmespol DESC,
             rec.cnrecibo DESC;
END;
