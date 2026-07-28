/*
  nest-api — reemplaza SQL directo en producción
  ─────────────────────────────────────────────
  changes.service.ts → changeClientData (POST /api/v1/changes/client)

  SQL reemplazado (~10 req.query):
    SELECT cci_rif FROM maclient WHERE cci_rif=@old_cci_rif
    UPDATE maclient SET ...
    UPDATE maclient_tel|dir|correo|atr (cascada RIF)
    UPDATE adpoliza|adrecibos|vhcerti (casegurado|ctenedor|cbeneficiario|cacreedor)
    SELECT/UPDATE/INSERT maclient_tel, maclient_correo
*/

CREATE OR ALTER PROCEDURE [dbo].[spChangeMaclientData]
    @old_cci_rif   VARCHAR(20),
    @cci_rif       VARCHAR(20),
    @ipersona      CHAR(1) = NULL,
    @xcliente      VARCHAR(120) = NULL,
    @xnombre       VARCHAR(60) = NULL,
    @xapellido     VARCHAR(60) = NULL,
    @fnacimiento   DATE = NULL,
    @isexo         CHAR(1) = NULL,
    @iestado_civil CHAR(1) = NULL,
    @xtelefono     VARCHAR(20) = NULL,
    @xcorreo       VARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM maclient WHERE cci_rif = @old_cci_rif)
        THROW 99001, 'Cliente no encontrado.', 1;

    UPDATE maclient SET
        cci_rif       = @cci_rif,
        ipersona      = COALESCE(@ipersona, ipersona),
        xcliente      = COALESCE(@xcliente, xcliente),
        xnombre       = COALESCE(@xnombre, xnombre),
        xapellido     = COALESCE(@xapellido, xapellido),
        fnacimiento   = COALESCE(@fnacimiento, fnacimiento),
        isexo         = COALESCE(@isexo, isexo),
        iestado_civil = COALESCE(@iestado_civil, iestado_civil)
    WHERE cci_rif = @old_cci_rif;

    IF @cci_rif <> @old_cci_rif
    BEGIN
        UPDATE maclient_tel    SET cci_rif = @cci_rif WHERE cci_rif = @old_cci_rif;
        UPDATE maclient_dir    SET cci_rif = @cci_rif WHERE cci_rif = @old_cci_rif;
        UPDATE maclient_correo SET cci_rif = @cci_rif WHERE cci_rif = @old_cci_rif;
        UPDATE maclient_atr    SET cci_rif = @cci_rif WHERE cci_rif = @old_cci_rif;

        UPDATE adpoliza SET casegurado = @cci_rif WHERE casegurado = @old_cci_rif;
        UPDATE adpoliza SET ctenedor   = @cci_rif WHERE ctenedor   = @old_cci_rif;
        UPDATE adpoliza SET cbeneficiario = @cci_rif WHERE cbeneficiario = @old_cci_rif;
        UPDATE adpoliza SET cacreedor  = @cci_rif WHERE cacreedor  = @old_cci_rif;

        UPDATE adrecibos SET casegurado = @cci_rif WHERE casegurado = @old_cci_rif;
        UPDATE adrecibos SET ctenedor   = @cci_rif WHERE ctenedor   = @old_cci_rif;
        UPDATE adrecibos SET cbeneficiario = @cci_rif WHERE cbeneficiario = @old_cci_rif;
        UPDATE adrecibos SET cacreedor  = @cci_rif WHERE cacreedor  = @old_cci_rif;

        UPDATE vhcerti SET casegurado = @cci_rif WHERE casegurado = @old_cci_rif;
        UPDATE vhcerti SET ctenedor   = @cci_rif WHERE ctenedor   = @old_cci_rif;
        UPDATE vhcerti SET cbeneficiario = @cci_rif WHERE cbeneficiario = @old_cci_rif;
        UPDATE vhcerti SET cacreedor  = @cci_rif WHERE cacreedor  = @old_cci_rif;
    END

    IF @xtelefono IS NOT NULL
    BEGIN
        IF EXISTS (SELECT 1 FROM maclient_tel WHERE cci_rif = @cci_rif)
            UPDATE maclient_tel SET xtelefono = @xtelefono WHERE cci_rif = @cci_rif;
        ELSE
            INSERT INTO maclient_tel (cci_rif, xtelefono) VALUES (@cci_rif, @xtelefono);
    END

    IF @xcorreo IS NOT NULL
    BEGIN
        IF EXISTS (SELECT 1 FROM maclient_correo WHERE cci_rif = @cci_rif)
            UPDATE maclient_correo SET xcorreo = @xcorreo WHERE cci_rif = @cci_rif;
        ELSE
            INSERT INTO maclient_correo (cci_rif, xcorreo) VALUES (@cci_rif, @xcorreo);
    END
END;
