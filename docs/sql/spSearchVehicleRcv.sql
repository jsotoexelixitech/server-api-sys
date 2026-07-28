-- Búsqueda vehículo RCV por placa o serial (endpoints searchByPlate / searchBySerial).
-- Resultado: vigente = 1 póliza activa bloqueante; vigente = 0 certificado sin bloqueo; sin filas = no encontrado.

CREATE OR ALTER PROCEDURE [dbo].[spSearchVehicleRcv]
    @searchBy CHAR(1),
    @value VARCHAR(60)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @v VARCHAR(60) = UPPER(LTRIM(RTRIM(@value)));
    DECLARE @cnpoliza VARCHAR(30);
    DECLARE @fhasta DATE;

    IF @searchBy = 'P'
    BEGIN
        SELECT TOP 1 @cnpoliza = cnpoliza
        FROM vhcerti
        WHERE xplaca = @v AND istatcer != 'A';
    END
    ELSE IF @searchBy = 'S'
    BEGIN
        SELECT TOP 1 @cnpoliza = cnpoliza
        FROM vhcerti
        WHERE xsercar = @v AND istatcer != 'A';
    END
    ELSE
        THROW 99001, 'searchBy inválido (P=placa, S=serial).', 1;

    IF @cnpoliza IS NULL
        RETURN;

    SELECT TOP 1 @fhasta = fhasta
    FROM adpoliza
    WHERE cnpoliza = @cnpoliza
      AND (iestado != 'N' OR istatpol != 'A');

    IF @fhasta IS NOT NULL
    BEGIN
        SELECT CAST(1 AS BIT) AS vigente, v.*, @fhasta AS fhasta
        FROM vhcerti v
        WHERE v.cnpoliza = @cnpoliza AND v.istatcer != 'A';
        RETURN;
    END

    SELECT CAST(0 AS BIT) AS vigente, v.*
    FROM vhcerti v
    WHERE v.cnpoliza = @cnpoliza AND v.istatcer != 'A';
END;
