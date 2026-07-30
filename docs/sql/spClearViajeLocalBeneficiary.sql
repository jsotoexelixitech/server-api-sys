-- Post-emisión VIAJE ramo 25: el trigger de emisión asigna cbeneficiario = titular
-- cuando maplanes_per.cbeneficiario es NULL. Este SP revierte ese default.
-- También aplicable desde nest-api (personas.service clearViajeLocalBeneficiary).

CREATE OR ALTER PROCEDURE [dbo].[spClearViajeLocalBeneficiary]
    @cnpoliza   VARCHAR(30),
    @fanopol    SMALLINT = NULL,
    @fmespol    TINYINT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @fano SMALLINT;
    DECLARE @fmes TINYINT;

    SELECT TOP 1
        @fano = fanopol,
        @fmes = fmespol
    FROM adpoliza
    WHERE cnpoliza = @cnpoliza
    ORDER BY fingreso DESC;

    IF @fano IS NULL
        THROW 99002, 'Póliza no encontrada en adpoliza.', 1;

    IF @fanopol IS NOT NULL SET @fano = @fanopol;
    IF @fmespol IS NOT NULL SET @fmes = @fmespol;

    UPDATE adpoliza SET cbeneficiario = NULL
    WHERE cnpoliza = @cnpoliza AND fanopol = @fano AND fmespol = @fmes;

    UPDATE adrecibos SET cbeneficiario = NULL
    WHERE cnpoliza = @cnpoliza AND fanopol = @fano AND fmespol = @fmes;

    DELETE FROM pebenefi
    WHERE cnpoliza = @cnpoliza AND fanopol = @fano AND fmespol = @fmes AND iclaseaseg = 'B';
END;
