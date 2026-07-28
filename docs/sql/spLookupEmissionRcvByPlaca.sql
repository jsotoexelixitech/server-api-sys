-- Última póliza/recibo por placa (fallback respuesta nest-api tras pre-emisión).

CREATE OR ALTER PROCEDURE [dbo].[spLookupEmissionRcvByPlaca]
    @xplaca VARCHAR(15)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT TOP 1
        cert.cnpoliza,
        pol.fanopol,
        pol.fmespol,
        rec.cnrecibo,
        rec.qcuotas
    FROM vhcerti cert
    INNER JOIN adpoliza pol ON pol.cnpoliza = cert.cnpoliza
    INNER JOIN adrecibos rec ON rec.cnpoliza = cert.cnpoliza AND rec.qcuotas = cert.qcuotas
    WHERE cert.xplaca = UPPER(LTRIM(RTRIM(@xplaca)))
    ORDER BY pol.femision DESC, rec.cnrecibo DESC;
END;
