/* =====================================================================================
   PROPUESTA (contrato) — NO EJECUTAR. La lógica la debe completar/validar La Mundial (DBA).
   nest-api ya llama estos SP con estos parámetros (módulo flota, rama feat/flota-ridery);
   mientras no existan, los endpoints responden 501.

   Cómo se emite hoy una flota de autos (SysIP legacy, backend-api-sys/src):
     1) POST /api/v1/emissions/matriz-automovil/create → INSERT TMEMISION_FLOTA_AUTO
        (db/Emissions.js:1984-2007) → trigger TEmision_Flota_Auto crea la póliza matriz en adpoliza
        (cuerpo del trigger truncado en el volcado: pedir OBJECT_DEFINITION, consulta 7).
     2) POST /cargaColectivo → db/automobile_colectivo.js insertData (131-592): por vehículo
        vhofcert (staging, istatcer 'P'), sopolcob, sopoltar y SIEMPRE un sorecibos por certificado;
        al final EXEC SP_CalculoAltas @cproces (prorrateo por días).
     3) POST /acceptEmission → db/automobile_colectivo_recibos.js (301-667): vhcerti 'V', adpolcob,
        adpoltar, INSERT adrecibos desde sorecibos y EXEC adBRecibo_Frecuencia_Colectivo (clona el
        recibo hasta completar la frecuencia: M → 12), spCorrigeCertificadoFlota; adpoliza.iestado 'V'.
   Para el modelo "recibo por viaje" se necesita el mismo flujo SIN sorecibos, SIN
   adBRecibo_Frecuencia_Colectivo y SIN SP_CalculoAltas (la prima la ponen los viajes).
   ===================================================================================== */

-- (a) Cabecera de la póliza de flota (colectiva 'C') sin recibos.
--     Equivalente a TMEMISION_FLOTA_AUTO + trigger, pero devolviendo el número y sin generar recibos.
CREATE OR ALTER PROCEDURE dbo.sp_flota_crear_poliza_nexus
    @cramo         INT,
    @cplan         NVARCHAR(10),
    @cid_tomador   NVARCHAR(20),     -- debe existir en maclient (cid)
    @cproductor    NUMERIC(9, 0) = NULL,
    @csucur        SMALLINT = 1,
    @cmoneda       NVARCHAR(4) = '$',
    @fdesde        DATE,
    @fhasta        DATE,
    @cusuario      INT = 1,
    @pCnpoliza     NVARCHAR(30)   OUTPUT,
    @pCpoliza      NUMERIC(19, 0) OUTPUT,
    @pSuccess      BIT            OUTPUT,
    @pErrorMessage NVARCHAR(MAX)  OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT @pSuccess = 0, @pErrorMessage = 'PROPUESTA: implementar con La Mundial (numeración CPOLIZA/POL_VEH en macontadores, '
        + 'itipopol = ''C'', ifrecuencia = ''E'' o la que defina La Mundial, istatpol = ''V'', sin recibos).';
END
GO

-- (b) Inclusión de un vehículo con su conductor como certificado, SIN recibo (@generarRecibo = 0).
--     Equivalente a insertData + acceptEmission por un vehículo, sin sorecibos ni adBRecibo_Frecuencia_Colectivo.
--     ccerti = adpoliza.cultcert + 1 (o MAX(ccerti)+1 como hoy en vhofcert); vhcerti istatcer 'V';
--     coberturas del plan en adpolcob/adpoltar con prima 0 (la prima llega por viaje).
CREATE OR ALTER PROCEDURE dbo.sp_flota_incluir_certificado_nexus
    @cnpoliza      NVARCHAR(30),
    @xplaca        NVARCHAR(15),
    @xsercar       NVARCHAR(30) = NULL,
    @xsermot       NVARCHAR(30) = NULL,
    @cano          INT = NULL,
    @cmarca        INT = NULL,
    @cmodelo       INT = NULL,
    @cversion      INT = NULL,
    @xcolor        NVARCHAR(30) = NULL,
    @cid_conductor NVARCHAR(20),     -- asegurado del certificado (maclient); se crea si no existe
    @xconductor    NVARCHAR(100),
    @fdesde        DATE,
    @generarRecibo BIT = 0,          -- 1 = comportamiento actual de flota (recibo por certificado)
    @cusuario      INT = 1,
    @pCcerti       INT           OUTPUT,
    @pSuccess      BIT           OUTPUT,
    @pErrorMessage NVARCHAR(MAX) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT @pSuccess = 0, @pCcerti = NULL,
           @pErrorMessage = 'PROPUESTA: implementar con La Mundial (vhcerti + adpolcob/adpoltar sin adrecibos cuando @generarRecibo = 0).';
END
GO

-- (c) Exclusión del certificado: vhcerti.istatcer = 'N' (o el estado que use La Mundial) con fecha de exclusión.
--     No anula recibos ya generados por viajes (cada uno es un cobro cerrado).
CREATE OR ALTER PROCEDURE dbo.sp_flota_excluir_certificado_nexus
    @cnpoliza      NVARCHAR(30),
    @ccerti        INT,
    @fexclusion    DATE,
    @cusuario      INT = 1,
    @pSuccess      BIT           OUTPUT,
    @pErrorMessage NVARCHAR(MAX) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT @pSuccess = 0, @pErrorMessage = 'PROPUESTA: implementar con La Mundial.';
END
GO
