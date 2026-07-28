/*
  nest-api — reemplaza SQL directo en producción
  ─────────────────────────────────────────────
  client.service.ts → searchClient (GET /api/v1/client/search/:cci_rif)

  SQL reemplazado (5 req.query):
    RS0: SELECT ... FROM maclient WHERE cci_rif=@cci_rif
    RS1: SELECT xtelefono FROM maclient_tel WHERE cci_rif=@cci_rif
    RS2: SELECT ... FROM maclient_dir WHERE cci_rif=@cci_rif
    RS3: SELECT xcorreo FROM maclient_correo WHERE cci_rif=@cci_rif
    RS4: SELECT cci_rif FROM maclient_atr WHERE cci_rif=@cci_rif
*/

CREATE OR ALTER PROCEDURE [dbo].[spGetMaclientCompleto]
    @cci_rif VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        cci_rif,
        TRIM(cid)           AS cid,
        TRIM(ipersona)      AS ipersona,
        TRIM(xnombre)       AS xnombre,
        TRIM(xapellido)     AS xapellido,
        TRIM(xcliente)      AS xcliente,
        isexo,
        iestado_civil,
        FORMAT(fnacimiento, 'dd-MM-yyyy') AS fnacimiento,
        iestado
    FROM maclient
    WHERE cci_rif = @cci_rif;

    SELECT TRIM(xtelefono) AS xtelefono
    FROM maclient_tel
    WHERE cci_rif = @cci_rif;

    SELECT
        cpais, cestado, cciudad,
        RTRIM(xavecalle) AS xavecalle,
        RTRIM(czonapos)  AS czonapos
    FROM maclient_dir
    WHERE cci_rif = @cci_rif;

    SELECT cci_rif, RTRIM(xcorreo) AS xcorreo
    FROM maclient_correo
    WHERE cci_rif = @cci_rif;

    SELECT cci_rif
    FROM maclient_atr
    WHERE cci_rif = @cci_rif;
END;
