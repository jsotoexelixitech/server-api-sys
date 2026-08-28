-- Beneficiario preferencial post-emisión RCV (maclient + cbeneficiario en póliza/recibos/certificados).

CREATE OR ALTER PROCEDURE [dbo].[spApplyBeneficiarioPreferencialRcv]
    @cnpoliza           VARCHAR(30),
    @rif                NUMERIC(13, 0),
    @icedula            CHAR(1),
    @xnombre            VARCHAR(120) = NULL,
    @xapellido          VARCHAR(120) = NULL,
    @xcliente           VARCHAR(250) = NULL,
    @isexo              CHAR(1) = 'M',
    @iestado_civil      CHAR(1) = 'S',
    @fnac               DATETIME = NULL,
    @xcorreo            CHAR(60) = NULL,
    @cestado            SMALLINT = NULL,
    @cciudad            SMALLINT = NULL,
    @xdireccion         CHAR(60) = NULL,
    @xtelefono          CHAR(20) = NULL,
    @ifuente            CHAR(10) = 'API',
    @fanopol            SMALLINT = NULL,
    @fmespol            TINYINT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @salida VARCHAR(50);
    DECLARE @cpoliza NUMERIC(19, 0);
    DECLARE @fano SMALLINT;
    DECLARE @fmes TINYINT;

    EXEC sp_create_maclient_nexus
        @icedula = @icedula,
        @cci_rif = @rif,
        @xnombre = @xnombre,
        @xapellido = @xapellido,
        @xcliente = @xcliente,
        @isexo = @isexo,
        @iestado_civil = @iestado_civil,
        @fnac = @fnac,
        @xcorreo = @xcorreo,
        @cpais = 58,
        @cestado = @cestado,
        @cciudad = @cciudad,
        @xdireccion = @xdireccion,
        @czonapos = NULL,
        @xtelefono = @xtelefono,
        @ifuente = @ifuente,
        @salida = @salida OUTPUT;

    SELECT TOP 1
        @fano = fanopol,
        @fmes = fmespol,
        @cpoliza = cpoliza
    FROM adpoliza
    WHERE cnpoliza = @cnpoliza
    ORDER BY fingreso DESC;

    IF @fano IS NULL
        THROW 99001, 'Póliza no encontrada en adpoliza.', 1;

    IF @fanopol IS NOT NULL SET @fano = @fanopol;
    IF @fmespol IS NOT NULL SET @fmes = @fmespol;

    UPDATE adpoliza SET cbeneficiario = @rif
    WHERE cnpoliza = @cnpoliza AND fanopol = @fano AND fmespol = @fmes;

    UPDATE adrecibos SET cbeneficiario = @rif
    WHERE cnpoliza = @cnpoliza AND fanopol = @fano AND fmespol = @fmes;

    UPDATE vhofcert SET cbeneficiario = @rif WHERE cpoliza = @cpoliza;
    UPDATE vhcerti SET cbeneficiario = @rif WHERE cnpoliza = @cnpoliza;
END;
