/* 2026-10-11 — Copia "_nexus" de SpValidaSiniestro (los SP existentes no se modifican; mismo criterio que RCV y funerario).
 * Copia fiel por ahora. Los ajustes D17 (recibo cobrado) y D18 (fanopol) se harán aquí cuando se decidan.
 */
/*******************************************************************
 * Autor: Hamilton Leon
 * Fecha de creación: 31-07-2026
 * Fecha de última actualización: 
 * Descripción: Stored Procedure para la validación de siniestro
 ******************************************************************/
CREATE OR ALTER PROCEDURE [dbo].[sp_valida_siniestro_nexus] -- Datos iniciales
@cnpoliza VARCHAR (30), @focurrencia DATE, @fnotificacion DATE, -- Auditoría
-- Mensajes de salida
@cerror INT OUTPUT, @msj VARCHAR (255) OUTPUT
AS
BEGIN
    SET NOCOUNT ON; -- 1. Inicialización de variables de salida e internas
    SET @cerror = 0;
    SET @msj = '';
    DECLARE @cpoliza AS NUMERIC (19, 0), @fanopol AS INT, @fmespol AS INT, @cramo AS INT;
    SET @cpoliza = NULL; /* Paso 1: Validar existencia y estado activo de la póliza*/
    IF NOT EXISTS (SELECT 1
                   FROM   adpoliza
                   WHERE  cnpoliza = @cnpoliza
                          AND iestado = 'V'
                          AND istatpol = 'V')
        BEGIN
            SET @cerror = 1;
            SET @msj = 'La póliza no existe o no se encuentra en estado activo.';
            RETURN;
        END /*Paso 2: Obtener datos internos de la póliza según la fecha de ocurrencia*/
    SELECT @cpoliza = pol.cpoliza,
           @fanopol = pol.fanopol,
           @fmespol = pol.fmespol,
           @cramo = pol.cramo
    FROM   adpoliza AS pol
    WHERE  pol.cnpoliza = @cnpoliza
           AND pol.iestado = 'V'
           AND pol.istatpol = 'V'
           AND @focurrencia BETWEEN pol.fdesde AND pol.fhasta; 
    /* Paso 3: Validar si la fecha de ocurrencia está dentro de la vigencia*/
    IF @cpoliza IS NULL
        BEGIN
            SET @cerror = 1;
            SET @msj = 'El asegurado no tiene cobertura, debido a que la póliza se encuentra fuera de vigencia.';
            RETURN;
        END 
    /*PAso 3.1: Validamos si la poliza de la vigencia tiene el recibo cobrado*/
    if not exists (select 1 from adrecibos rec where rec.cpoliza = @cpoliza and rec.fanopol = @fanopol and rec.fmespol = @fmespol and iestadorec = 'C' and @focurrencia BETWEEN rec.fdesde AND rec.fhasta) begin
            SET @cerror = 1;
            SET @msj = 'La póliza posee recibos pendiente para la fecha de ocurrencia del siniestro';
            RETURN;
    end 

    /*PAso 4: Consulto el bien asegurado o los asegurados de la póliza*/ --Caso automovil
    IF @cramo IN (SELECT cramo
                  FROM   maramos
                  WHERE  ctiporamo = 7)
        BEGIN
            SELECT vh.cnpoliza,
                   vh.fanopol,
                   vh.fmespol,
                   vh.ccerti,
                   vh.xplaca,
                   vh.xsermot,
                   vh.cmarca,
                   inm.xmarca,
                   vh.cmodelo,
                   inm.xmodelo,
                   vh.cversion,
                   inm.xversion,
                   vh.cano,
                   vh.casegurado,
                   aseg.cid,
                   aseg.xcliente
            FROM   vhcerti AS vh
                   LEFT OUTER JOIN
                   vinma AS inm
                   ON vh.cmarca = inm.cmarca
                      AND vh.cmodelo = inm.cmodelo
                      AND vh.cversion = inm.cversion
                      AND vh.cano = inm.cano
                   LEFT OUTER JOIN
                   maclient AS aseg
                   ON vh.casegurado = aseg.cci_rif
            WHERE  cpoliza = @cpoliza
                   AND fanopol = @fanopol
                   AND fmespol = @fmespol;
        END --caso fianza
    IF @cramo IN (SELECT cramo
                  FROM   maramos
                  WHERE  ctiporamo = 5)
        BEGIN
            SELECT CONCAT(trim(acre.cid), ' - ', trim(acre.xcliente)) AS 'acreedor',
                   trim(cert.xobjeto) AS 'xobjeto',
                   cert.ccont_lic,
                   CASE WHEN cert.itipofianza = 'AD' THEN 'Aduanales' WHEN cert.itipofianza = 'AN' THEN 'Anticipos' WHEN cert.itipofianza = 'FI' THEN 'Fiel cumplimiento' WHEN cert.itipofianza = 'JD' THEN 'Judicial' WHEN cert.itipofianza = 'LA' THEN 'Laboral' WHEN cert.itipofianza = 'RE' THEN 'Recurrir' WHEN cert.itipofianza = 'GM' THEN 'Garantia de Mant. Oferta' WHEN cert.itipofianza = 'BC' THEN 'Buen cumplimiento' ELSE cert.itipofianza END AS 'itipofianza',
                   cert.monto_contrato,
                   CASE WHEN cert.monto_gastnot IS NULL THEN 0.00 ELSE cert.monto_gastnot END AS 'monto_gastnot',
                   cmoneda
            FROM   adpoliza AS pol
                   LEFT OUTER JOIN
                   facerti AS cert
                   ON pol.cpoliza = cert.cpoliza
                   LEFT OUTER JOIN
                   maclient AS acre
                   ON pol.cacreedor = acre.cci_rif
            WHERE  pol.cpoliza = @cpoliza
                   AND pol.fanopol = @fanopol
                   AND pol.fmespol = @fmespol;
        END --Caso patrimoniales
    IF @cramo IN (SELECT cramo
                  FROM   maramos
                  WHERE  ctiporamo IN (1, 6))
        BEGIN
            SELECT cpoliza,
                   fanopol,
                   fmespol,
                   trim(xdescrip1) AS 'descripcion1',
                   trim(xdescrip2) AS 'descripcion2',
                   trim(xdescrip3) AS 'descripcion3',
                   trim(xdescrip4) AS 'descripcion4',
                   mvalor AS 'valor'
            FROM   rgcerti
            WHERE  cpoliza = @cpoliza
                   AND fanopol = @fanopol
                   AND fmespol = @fmespol;
        END --Caso personas y salud 
    IF @cramo IN (SELECT cramo
                  FROM   maramos
                  WHERE  ctiporamo IN (2, 4))
        BEGIN
            SELECT CASE cestado_civil WHEN 'S' THEN 'Soltero' WHEN 'C' THEN 'Casado/a' WHEN 'V' THEN 'Viudo' WHEN 'D' THEN 'Divorciado' END AS 'estado_civil',
                   CASE csexo WHEN 'F' THEN 'Femenino' WHEN 'M' THEN 'Masculino' ELSE csexo END AS 'sexo',
                   TRY_CONVERT (NUMERIC (19), pol.cpoliza) AS 'cpoliza',
                   trim(pol.cnpoliza) AS 'cnpoliza',
                   trim(cli.xcliente) AS 'xpersona',
                   trim(cli.cid) AS 'cid',
                   (SELECT xparentesco
                    FROM   maparent
                    WHERE  cparentesco = aseg.cparentesco) AS 'xparentesco',
                   format(aseg.fnacimiento, 'dd/MM/yyyy') AS 'fnacimiento',
                   format(aseg.falta, 'dd/MM/yyyy') AS 'fingreso'
            FROM   adpoliza AS pol
                   LEFT OUTER JOIN
                   peasegurados AS aseg
                   ON aseg.cpoliza = pol.cpoliza
                      AND aseg.fanopol = pol.fanopol
                      AND aseg.fmespol = pol.fmespol
                      AND aseg.iestado = 'V'
                   LEFT OUTER JOIN
                   maclient AS cli
                   ON aseg.casegurado = cli.cci_rif
            WHERE  pol.cpoliza = @cpoliza
                   AND pol.fanopol = @fanopol
                   AND pol.fmespol = @fmespol;
        END /*PAso 5: Obtenemos las causas disponibles de la poliza*/
    IF @cramo IN (SELECT cramo
                  FROM   maramos
                  WHERE  ctiporamo IN (2, 4))
        BEGIN
            SELECT trim(aseg.cid) 'cedula', trim(aseg.xcliente) 'asegurado',msin.ccausa 'cod_causa',trim(msin.xcausa) 'causa'
            FROM   macauscob AS mcob
                   INNER JOIN 
                   macausasin msin 
                   on mcob.ccausa = msin.ccausa and mcob.cramo = msin.cramo 
                   INNER JOIN
                   pepolcob_ind AS acob
                   ON mcob.ccobertura = acob.ccober and mcob.cramo = acob.cramo
                      AND @focurrencia BETWEEN acob.fdesde AND acob.fhasta
                   INNER JOIN 
                   maclient aseg
                   on acob.casegurado = aseg.cci_rif
            WHERE  acob.cpoliza = @cpoliza
                   AND acob.fanopol = @fanopol
                   AND acob.fmespol = @fmespol;
        END
    ELSE
        BEGIN
            SELECT msin.ccausa 'cod_causa',msin.xcausa 'causa'
            FROM   macauscob AS mcob
                   INNER JOIN 
                   macausasin msin on mcob.ccausa = msin.ccausa and mcob.cramo = msin.cramo
                   INNER JOIN 
                   adpolcob AS acob
                   ON mcob.ccobertura = acob.ccober and mcob.cramo = acob.cramo
            WHERE  acob.cpoliza = @cpoliza
                   AND acob.fanopol = @fanopol
                   AND acob.fmespol = @fmespol;
        END
END

