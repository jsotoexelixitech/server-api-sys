/*
  nest-api — reemplaza SQL directo en producción
  ─────────────────────────────────────────────
  Origen: SysIP-backend/src/db/Emissions.js → searchNewPropietary
  Endpoint legacy: POST /api/v1/emissions/automobile_new/propietary
  Body: { "xrif_cliente": "V-15700585" }

  Destino nest-api: emissions.service → execute sp_search_automobile_propietary_nexus
  Parámetro: @cid = body.xrif_cliente

  Diferencia con spGetMaclientCompleto (02):
    - spGetMaclientCompleto busca por cci_rif numérico (5 result sets)
    - Este SP busca por maclient.cid (V-12345678), un result set plano con es_mayor_de_edad
*/

CREATE OR ALTER PROCEDURE [dbo].[sp_search_automobile_propietary_nexus]
    @cid VARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;

    SET @cid = LTRIM(RTRIM(@cid));

    IF @cid = ''
        RETURN;

    SELECT
        RTRIM(LTRIM(maclient.xnombre_1)) AS xnombre,
        RTRIM(LTRIM(maclient.xapellido_1)) AS xapellido,
        CONVERT(DATE, maclient.fnacimiento) AS fnacimiento,
        maclient.isexo,
        maclient.npeso,
        maclient.nestatura,
        maclient.ipersona,
        maclient.iestado_civil,
        maclient_dir.cestado,
        RTRIM(LTRIM(maestados.xdescripcion_c)) AS xestado,
        maclient_dir.cciudad,
        maclient.cci_rif,
        maclient.cid,
        TRIM(maciudades.xdescripcion_c) AS xciudad,
        TRIM(maclient_dir.xavecalle) AS xavecalle,
        TRIM(maclient_correo.xcorreo) AS xcorreo,
        TRIM(maclient_tel.xtelefono) AS xtelefono,
        TRIM(maclient.xcliente) AS cliente,
        CASE
            WHEN maclient.fnacimiento IS NOT NULL
                 AND DATEDIFF(YEAR, maclient.fnacimiento, GETDATE())
                     - CASE
                           WHEN MONTH(maclient.fnacimiento) > MONTH(GETDATE())
                                OR (
                                    MONTH(maclient.fnacimiento) = MONTH(GETDATE())
                                    AND DAY(maclient.fnacimiento) > DAY(GETDATE())
                                )
                           THEN 1
                           ELSE 0
                       END >= 18
            THEN 1
            ELSE 0
        END AS es_mayor_de_edad,
        COALESCE(maprofes.xprofesion, '') AS xprofesion,
        COALESCE(maocupac.xocupacion, '') AS xocupacion,
        COALESCE(maactivi.xactividad, '') AS xactividad
    FROM maclient
    FULL OUTER JOIN maclient_dir
        ON maclient.cci_rif = maclient_dir.cci_rif
    LEFT OUTER JOIN maclient_correo
        ON maclient.cci_rif = maclient_correo.cci_rif
    LEFT OUTER JOIN maestados
        ON maclient_dir.cestado = maestados.cestado
       AND COALESCE(maclient_dir.cpais, 58) = maestados.cpais
    LEFT OUTER JOIN maciudades
        ON maclient_dir.cestado = maciudades.cestado
       AND maclient_dir.cciudad = maciudades.cciudad
    LEFT OUTER JOIN maclient_tel
        ON maclient.cci_rif = maclient_tel.cci_rif
    LEFT OUTER JOIN maclient_atr
        ON maclient.cci_rif = maclient_atr.cci_rif
    LEFT OUTER JOIN maprofes
        ON maclient_atr.cprofesion = maprofes.cprofesion
    LEFT OUTER JOIN maocupac
        ON maclient_atr.cocupacion = maocupac.cocupacion
    LEFT OUTER JOIN maactivi
        ON maclient_atr.cactividad = maactivi.cactividad
    WHERE maclient.cid = @cid;
END;
