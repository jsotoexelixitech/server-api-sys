/* =====================================================================================
   PROPUESTA — NO EJECUTAR en Sis2000 sin revisión y aprobación de La Mundial (DBA / Luis).
   Exélixi no crea ni modifica SP en Sis2000: este archivo es la propuesta para que La Mundial
   la revise, la ajuste y la cree en su ambiente (primero Sis2000_QA).

   Objetivo (Ridery, 3-nov-2026): "La PÓLIZA la creamos nosotros, pero con una condición especial
   que no tiene hoy el proceso de flota: crear la póliza con certificados pero SIN recibo".
   Cada viaje genera después UN recibo sobre el certificado del conductor con
   sp_crear_recibo_certificado_nexus (archivo 01). Ni la emisión de la póliza ni la inclusión de
   certificados generan recibos.

   nest-api (módulo flota, rama feat/flota-ridery) ya llama estos 3 SP con EXACTAMENTE estos
   parámetros; mientras no existan, los endpoints responden 501:
     POST /api/flota/polizas                                        → sp_flota_crear_poliza_nexus
     POST /api/flota/polizas/:cnpoliza/certificados                 → sp_flota_incluir_certificado_nexus (@generarRecibo = 0)
     POST /api/flota/polizas/:cnpoliza/certificados/:ccerti/excluir → sp_flota_excluir_certificado_nexus
   Si el SP devuelve @pSuccess = 1 con texto en @pErrorMessage, nest-api lo muestra como mensaje
   informativo (se usa para "ya existía" en las llamadas idempotentes).

   ── Proceso de flota ACTUAL en Sis2000 / SysIP (base de esta propuesta) ──────────────────────
     1) Cabecera: INSERT TMEMISION_FLOTA_AUTO (SysIP-backend db/Emissions.js:1984-2007) → trigger
        TEmision_Flota_Auto crea la póliza matriz en adpoliza (el volcado del trigger está truncado).
        Numeración (codeGenerator, db/automobile_colectivo.js:48-85): macontadores CPOLIZA, POL_VEH,
        CRECIBO, RECIBO, CPROCES → cnpoliza = <ramo>-<sucursal>-<POL_VEH>.
     2) Carga de vehículos (db/automobile_colectivo.js insertData 131-592), por vehículo:
          ccerti = MAX(ccerti) de vhofcert + 1; si la placa ya está pendiente en vhofcert → rechazo;
          vhofcert (istatcer 'P'); sopolcob / sopoltar (coberturas y tarifas SIN crecibo);
          sorecibos (UN recibo por certificado, crecibo de macontadores CRECIBO);
          spCreateMaclient del asegurado; al final EXEC SP_CalculoAltas @cproces (prorrateo).
     3) Aceptación (db/automobile_colectivo_recibos.js insertData 301-667), por certificado:
          vhcerti (istatcer 'V'); adpolcob / adpoltar con el crecibo del sorecibos; adrecibos;
          EXEC adBRecibo_Frecuencia_Colectivo (clona el recibo + adpolcob/adpoltar/adpolfp/adpolrea
          hasta completar la frecuencia: M → 12); EXEC spCorrigeCertificadoFlota (divide la prima por
          cuotas); adpoliza.iestado = 'V'; vhofcert 'E'.
     Hallazgo: adpolcob y adpoltar llevan crecibo (lo exigen: adBRecibo_Frecuencia_Colectivo.sql:87-99,
     sp_genera_coberturas_recibos_auto_rcv_nexus los inserta con @crecibo). Las únicas tablas del proceso
     actual con las coberturas del certificado SIN recibo son sopolcob / sopoltar (paso 2).

   ── Qué toma de nuestro SP de emisión RCV Nexus ────────────────────────────────────────────
     sp_pre_emision_automovil_rcv_nexus (numeración con sp_contador_nexus 'POL_VEH'),
     sp_emision_automovil_rcv_nexus (INSERT adpoliza / vhcerti / tetitcer, sp_create_maclient_nexus)
     y sp_genera_coberturas_recibos_auto_rcv_nexus (JOIN maplantar/maarancel/matarifa/macoberturas).

   Marcas en el código:
     -- DIFERENCIA FLOTA RIDERY: sin recibo   → donde el proceso actual crea sorecibos/adrecibos.
     -- PREGUNTA LM:                          → dato que no se puede inferir; lo define La Mundial.
   ===================================================================================== */


/* =====================================================================================
   (a) sp_flota_crear_poliza_nexus
   Cabecera de la póliza de flota colectiva (itipopol 'C'), vigente, SIN recibos.
   Equivale al paso 1 del proceso actual (TMEMISION_FLOTA_AUTO + trigger), devolviendo el número.
   Idempotente: si ya existe una póliza de flota creada por este SP para el mismo tomador, ramo,
   plan y vigencia, devuelve esa misma (pSuccess = 1 y el mensaje "ya existía").
   ===================================================================================== */
CREATE OR ALTER PROCEDURE dbo.sp_flota_crear_poliza_nexus
    @cramo         INT,
    @cplan         NVARCHAR(10),
    @cid_tomador   NVARCHAR(20),     -- cédula/RIF del tomador (Ridery). Debe existir en maclient.
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
    SET XACT_ABORT ON;
    SELECT @pSuccess = 0, @pErrorMessage = NULL, @pCnpoliza = NULL, @pCpoliza = NULL;

    DECLARE @cprog CHAR(30) = 'sp_flota_crear_poliza_nexus', @ifuente CHAR(10) = 'NEXUS';

    BEGIN TRY
        -- 1. Validaciones (antes de abrir la transacción)
        IF @cramo IS NULL OR NULLIF(LTRIM(RTRIM(@cplan)), '') IS NULL
            RAISERROR('Ramo y plan son obligatorios.', 16, 1);
        IF @fdesde IS NULL OR @fhasta IS NULL OR @fhasta <= @fdesde
            RAISERROR('La vigencia es inválida (fhasta debe ser posterior a fdesde).', 16, 1);
        IF NOT EXISTS (SELECT 1 FROM maplanes WHERE cramo = @cramo AND TRIM(cplan) = TRIM(@cplan))
            RAISERROR('El plan no existe para el ramo indicado (maplanes).', 16, 1);
        -- PREGUNTA LM: plan de la flota Ridery (RIDERY / RIDER1 / RIDER2) y si maplantar ya tiene sus tarifas.
        IF NOT EXISTS (SELECT 1 FROM maplantar WHERE cramo = @cramo AND TRIM(cplan) = TRIM(@cplan))
            RAISERROR('El plan no tiene coberturas/tarifas en maplantar.', 16, 1);

        SET @cmoneda = ISNULL(NULLIF(LTRIM(RTRIM(@cmoneda)), ''), '$');
        SET @csucur  = ISNULL(@csucur, 1);              -- PREGUNTA LM: sucursal de la flota Ridery.
        IF @cproductor IS NULL OR @cproductor = 0
            SET @cproductor = 80080;                    -- PREGUNTA LM: productor de Ridery (80080 = directo, igual que RCV Nexus).

        -- Tomador: cid tipo 'J-501234567' / 'J501234567' / '501234567' → maclient.cci_rif
        DECLARE @cidLimpio NVARCHAR(20) = UPPER(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(@cid_tomador)), '-', ''), ' ', ''), '.', ''));
        DECLARE @ctenedor NUMERIC(13, 0) =
            TRY_CONVERT(NUMERIC(13, 0), CASE WHEN LEFT(@cidLimpio, 1) LIKE '[A-Z]' THEN SUBSTRING(@cidLimpio, 2, 20) ELSE @cidLimpio END);
        IF @ctenedor IS NULL OR @ctenedor <= 0
            RAISERROR('La identificación del tomador es inválida.', 16, 1);
        IF NOT EXISTS (SELECT 1 FROM maclient WHERE cci_rif = @ctenedor)
            RAISERROR('El tomador no existe en maclient: créelo antes de emitir la póliza.', 16, 1);

        -- Tasa del día (misma fuente que SPCargaRecibosColectivos / archivo 01)
        DECLARE @ptasamon NUMERIC(18, 6);
        IF @cmoneda IN ('Bs', 'BS') SET @ptasamon = 1;
        ELSE
            SELECT TOP 1 @ptasamon = ptasamon FROM mavamoneda
            WHERE TRIM(cmoneda) = '$' AND CONVERT(DATE, fmoneda) <= @fdesde ORDER BY fmoneda DESC;
        IF @ptasamon IS NULL RAISERROR('No hay tasa de cambio para la fecha de inicio de la póliza.', 16, 1);

        BEGIN TRAN;

        -- 2. Idempotencia (serializada por tomador para que dos llamadas simultáneas no creen dos pólizas)
        DECLARE @lockName NVARCHAR(255) = CONCAT('flota_poliza_', @cramo, '_', @ctenedor), @lockRes INT;
        EXEC @lockRes = sp_getapplock @Resource = @lockName, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 15000;
        IF @lockRes < 0 RAISERROR('No se pudo obtener el bloqueo de emisión de la póliza de flota.', 16, 1);

        SELECT TOP 1 @pCpoliza = cpoliza, @pCnpoliza = LTRIM(RTRIM(cnpoliza))
        FROM adpoliza
        WHERE ctenedor = @ctenedor AND cramo = @cramo AND TRIM(cplan) = TRIM(@cplan)
          AND itipopol = 'C' AND istatpol = 'V' AND TRIM(cprog) = TRIM(@cprog)
          AND CONVERT(DATE, fdesde) = @fdesde AND CONVERT(DATE, fhasta) = @fhasta
        ORDER BY fanopol DESC, fmespol DESC;

        IF @pCpoliza IS NOT NULL
        BEGIN
            COMMIT;
            SELECT @pSuccess = 1, @pErrorMessage = 'La póliza de flota ya existía para este tomador, plan y vigencia.';
            RETURN;
        END

        -- 3. Numeración: igual que sp_pre_emision_automovil_rcv_nexus (sp_contador_nexus con 'POL_VEH';
        --    cnpoliza = <ramo>-<sucursal>-<POL_VEH 10 dígitos>, p. ej. 18-1-1130480881).
        DECLARE @cpoliza NUMERIC(19, 0), @cnpoliza_cont VARCHAR(30), @cnpoliza VARCHAR(30), @cproces NUMERIC(13, 0),
                @crecibo_descartado NUMERIC(19, 0), @cnrecibo_descartado VARCHAR(30), @qcontador NUMERIC(18, 0);
        EXEC sp_contador_nexus
            @cpoliza OUTPUT, @cnpoliza_cont OUTPUT,
            @crecibo_descartado OUTPUT, @cnrecibo_descartado OUTPUT,   -- DIFERENCIA FLOTA RIDERY: sin recibo (no se usan)
            @cproces OUTPUT, @csucur, @fdesde, @cramo, 'POL_VEH';
        -- PREGUNTA LM: sp_contador_nexus también avanza el correlativo de recibo (CRECIBO/RECIBO) aunque aquí no se use.
        --              ¿Aceptan el salto o prefieren una variante que solo avance CPOLIZA / POL_VEH / CPROCES?

        SELECT @qcontador = qcontador FROM macontadores WHERE ccontador = 'POL_VEH';
        SET @cnpoliza = CONVERT(VARCHAR, @cramo) + '-' + CONVERT(VARCHAR, @csucur) + '-' + FORMAT(@qcontador, '0000000000');
        IF @cpoliza IS NULL OR @cproces IS NULL RAISERROR('Fallo al generar el número de póliza (sp_contador_nexus).', 16, 1);
        IF EXISTS (SELECT 1 FROM adpoliza WHERE cnpoliza = @cnpoliza OR cpoliza = @cpoliza)
            RAISERROR('El número de póliza generado ya existe.', 16, 1);

        DECLARE @fano SMALLINT = YEAR(@fdesde), @fmes SMALLINT = MONTH(@fdesde);
        DECLARE @ctipocanal CHAR(1) = CASE WHEN @cproductor = 80080 THEN 'D' ELSE 'T' END;

        -- 4. Cabecera: mismas columnas que sp_emision_automovil_rcv_nexus, con estas diferencias:
        --    itipopol 'C' (colectiva), cultcert 0 (sin certificados aún), casegurado = tomador,
        --    ifrecuencia 'E' y qcuotas 0 (no hay plan de cuotas: los recibos los crean los viajes).
        -- PREGUNTA LM: ¿ifrecuencia 'E' es la correcta para "recibo por evento/viaje"? ¿qcuotas 0 o 1?
        -- PREGUNTA LM: ¿la póliza de flota necesita además fila en sopoliza? (el trigger TEmision_Flota_Auto
        --              la crea en el proceso actual; el volcado del trigger está truncado).
        INSERT INTO adpoliza
        (cpoliza, fanopol, fmespol, u_version, cramo, cnpoliza, cproces, cplan, itipoprod, itipopol, itiponegocio, clider,
         cpolizalider, istatpol, iestado, itipoingreso, cpoliza_mae, ccerti_mae, itiporen, iperren, ccauren, iestadoren,
         csucur, csucurrec, criesgo, cpolnum, cultcert, casegurado, ctenedor, cbeneficiario, cacreedor, cfinanciera,
         cproductor, czonaprod, cejecta, cmoneda, ptasamon, forigen, fdesde, fhasta, itipoanul, canula, idevolucion,
         iformadevo, qcuotas, ifrecuencia, itipovenprima, iestadovenprima, icalculoedad, igemi, iqgemi, iapligemi,
         mgemi, mgemiext, cprog, ifuente, fingreso, cusuario, ccategoria, cnpoliza_rel, corigen_rel, ccanalalt, cscanalalt,
         ctipocanal, itipo_diligencia, cgestor)
        VALUES
        (@cpoliza, @fano, @fmes, '!', @cramo, @cnpoliza, @cproces, TRIM(@cplan), 'NU', 'C', 'DI', 0,
         0, 'V', 'V', 'N', 0, 0, 'A', 1, 0, 'N',
         @csucur, @csucur, 0, 0, 0, @ctenedor, @ctenedor, @ctenedor, 0, 0,
         @cproductor, 0, 0, @cmoneda, @ptasamon, CAST(GETDATE() AS DATE), @fdesde, @fhasta, 'N', 0, 'P',
         'N', 0, 'E', 'N', 'N', 'R', 'N', 'N', 'N',
         0, 0, @cprog, @ifuente, GETDATE(), @cusuario, 1, NULL, NULL, NULL, NULL,
         @ctipocanal, NULL, NULL);
        -- PREGUNTA LM: canal (ccanalalt/cscanalalt/ctipocanal) y gestor con que debe quedar la flota Ridery.

        -- 5. Título de la póliza (tetitcer ccerti 0), igual que sp_emision_automovil_rcv_nexus.
        IF NOT EXISTS (SELECT 1 FROM tetitcer WITH (UPDLOCK, HOLDLOCK)
                       WHERE cpoliza = @cpoliza AND fanopol = @fano AND fmespol = @fmes AND ccerti = 0)
            INSERT INTO tetitcer
            SELECT a.cpoliza, a.fanopol, a.fmespol, 0, a.u_version, a.cramo, a.itipoprod, a.cproces,
                   a.casegurado, a.ctenedor, 0, a.cacreedor, a.cbeneficiario, a.cproductor,
                   a.itiporen, a.iestadoren, 'V', a.fdesde, a.fhasta, a.forigen,
                   a.cprog, a.ifuente, a.bok, a.cerror, a.fingreso, a.cusuario, a.ccategoria,
                   a.cusuarioauto, a.ccategoriaauto, a.fultmod, a.cusuariomod, a.ccategoriamod
            FROM adpoliza a
            WHERE a.cpoliza = @cpoliza AND a.fanopol = @fano AND a.fmespol = @fmes;

        -- DIFERENCIA FLOTA RIDERY: sin recibo
        --   El proceso actual crea aquí sorecibos (automobile_colectivo.js:391-521) y luego adrecibos +
        --   adBRecibo_Frecuencia_Colectivo; la emisión RCV Nexus llama sp_genera_coberturas_recibos_auto_rcv_nexus.
        --   La póliza de flota Ridery NO genera recibos ni coberturas por recibo: las coberturas viven por
        --   certificado (sp_flota_incluir_certificado_nexus) y los recibos los crea cada viaje (archivo 01).

        COMMIT;
        SELECT @pCpoliza = @cpoliza, @pCnpoliza = @cnpoliza, @pSuccess = 1;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        SELECT @pSuccess = 0, @pErrorMessage = ERROR_MESSAGE(), @pCnpoliza = NULL, @pCpoliza = NULL;
    END CATCH
END
GO


/* =====================================================================================
   (b) sp_flota_incluir_certificado_nexus
   Incluye UN vehículo con su conductor como certificado de la póliza de flota, SIN recibo.
   Equivale a los pasos 2 + 3 del proceso actual para un vehículo, sin sorecibos, sin adrecibos,
   sin adBRecibo_Frecuencia_Colectivo, sin spCorrigeCertificadoFlota y sin SP_CalculoAltas.
   Idempotente por placa + conductor: si la placa ya está vigente en la póliza con el mismo conductor,
   devuelve ese ccerti (pSuccess = 1, mensaje "ya existía").
   ===================================================================================== */
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
    @cid_conductor NVARCHAR(20),     -- cédula del conductor ('V-12345678'): asegurado del certificado
    @xconductor    NVARCHAR(100),    -- nombre del conductor (se usa si hay que crearlo en maclient)
    @fdesde        DATE,             -- fecha de inclusión
    @generarRecibo BIT = 0,          -- 0 = Ridery (sin recibo). 1 = no soportado aquí: usar el proceso actual de flota.
    @cusuario      INT = 1,
    @pCcerti       INT           OUTPUT,
    @pSuccess      BIT           OUTPUT,
    @pErrorMessage NVARCHAR(MAX) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    SELECT @pSuccess = 0, @pErrorMessage = NULL, @pCcerti = NULL;

    DECLARE @cprog CHAR(30) = 'sp_flota_incluir_certificado_nexus', @ifuente CHAR(10) = 'NEXUS';

    BEGIN TRY
        -- 1. Validaciones de entrada
        IF ISNULL(@generarRecibo, 0) = 1
            RAISERROR('@generarRecibo = 1 no está soportado: para flota con recibo por certificado use el proceso actual de flota (carga + aceptación).', 16, 1);
        SET @xplaca = UPPER(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(@xplaca, ''))), '-', ''), ' ', ''));
        IF @xplaca = '' RAISERROR('La placa es obligatoria.', 16, 1);
        IF NULLIF(LTRIM(RTRIM(@xconductor)), '') IS NULL RAISERROR('El nombre del conductor es obligatorio.', 16, 1);
        SET @fdesde = ISNULL(@fdesde, CAST(GETDATE() AS DATE));

        DECLARE @cidLimpio NVARCHAR(20) = UPPER(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(@cid_conductor, ''))), '-', ''), ' ', ''), '.', ''));
        DECLARE @icedula CHAR(1) = CASE WHEN LEFT(@cidLimpio, 1) LIKE '[A-Z]' THEN LEFT(@cidLimpio, 1) ELSE 'V' END;
        DECLARE @casegurado NUMERIC(13, 0) =
            TRY_CONVERT(NUMERIC(13, 0), CASE WHEN LEFT(@cidLimpio, 1) LIKE '[A-Z]' THEN SUBSTRING(@cidLimpio, 2, 20) ELSE @cidLimpio END);
        IF @casegurado IS NULL OR @casegurado <= 0 RAISERROR('La cédula del conductor es inválida.', 16, 1);

        BEGIN TRAN;

        -- 2. Póliza (último período) bloqueada: serializa la numeración de certificados de la póliza
        DECLARE @cpoliza NUMERIC(19, 0), @fanopol INT, @fmespol INT, @cramo INT, @cplan VARCHAR(10), @itipopol CHAR(1),
                @istatpol CHAR(1), @polFdesde DATE, @polFhasta DATE, @cproces NUMERIC(13, 0), @ctenedor NUMERIC(13, 0),
                @csucur SMALLINT, @cmoneda VARCHAR(4), @ptasamon NUMERIC(18, 6), @cproductor NUMERIC(9, 0),
                @itipoprod CHAR(2), @cultcert INT;
        SELECT TOP 1 @cpoliza = cpoliza, @fanopol = fanopol, @fmespol = fmespol, @cramo = cramo, @cplan = TRIM(cplan),
               @itipopol = itipopol, @istatpol = istatpol, @polFdesde = fdesde, @polFhasta = fhasta, @cproces = cproces,
               @ctenedor = ctenedor, @csucur = ISNULL(csucur, 1), @cmoneda = LTRIM(RTRIM(cmoneda)), @ptasamon = ptasamon,
               @cproductor = cproductor, @itipoprod = itipoprod, @cultcert = ISNULL(cultcert, 0)
        FROM adpoliza WITH (UPDLOCK, HOLDLOCK)
        WHERE cnpoliza = @cnpoliza
        ORDER BY fanopol DESC, fmespol DESC;

        IF @cpoliza IS NULL RAISERROR('No existe la póliza indicada.', 16, 1);
        IF @itipopol <> 'C' RAISERROR('La póliza no es colectiva (itipopol <> C).', 16, 1);
        IF @istatpol <> 'V' RAISERROR('La póliza no está vigente.', 16, 1);
        IF @fdesde < @polFdesde OR @fdesde >= @polFhasta RAISERROR('La fecha de inclusión está fuera de la vigencia de la póliza.', 16, 1);

        -- 3. Idempotencia por placa / conductor (dentro de la póliza)
        DECLARE @ccertiPlaca INT, @asegPlaca NUMERIC(13, 0), @ccertiCond INT;
        SELECT TOP 1 @ccertiPlaca = ccerti, @asegPlaca = casegurado
        FROM vhcerti
        WHERE cpoliza = @cpoliza AND fanopol = @fanopol AND fmespol = @fmespol
          AND UPPER(REPLACE(REPLACE(LTRIM(RTRIM(xplaca)), '-', ''), ' ', '')) = @xplaca
          AND istatcer IN ('V', 'E')
        ORDER BY ccerti DESC;

        IF @ccertiPlaca IS NOT NULL AND @asegPlaca = @casegurado
        BEGIN
            COMMIT;
            SELECT @pCcerti = @ccertiPlaca, @pSuccess = 1, @pErrorMessage = 'El certificado ya existía para esta placa y conductor.';
            RETURN;
        END
        -- PREGUNTA LM: si la placa está vigente con OTRO conductor, ¿se rechaza (propuesta) o se cambia el conductor del certificado?
        IF @ccertiPlaca IS NOT NULL
            RAISERROR('La placa ya está vigente en la póliza con otro conductor: excluya ese certificado antes de incluirla de nuevo.', 16, 1);

        SELECT TOP 1 @ccertiCond = ccerti
        FROM vhcerti
        WHERE cpoliza = @cpoliza AND fanopol = @fanopol AND fmespol = @fmespol
          AND casegurado = @casegurado AND istatcer IN ('V', 'E');
        -- PREGUNTA LM: ¿un conductor puede tener más de un vehículo vigente en la flota? Propuesta: no.
        IF @ccertiCond IS NOT NULL
            RAISERROR('El conductor ya tiene un certificado vigente en la póliza con otra placa.', 16, 1);

        -- 4. Conductor en maclient (asegurado del certificado); se crea si no existe, como en la emisión RCV Nexus
        IF NOT EXISTS (SELECT 1 FROM maclient WHERE cci_rif = @casegurado)
        BEGIN
            DECLARE @nombreCompleto VARCHAR(250) = LTRIM(RTRIM(@xconductor));
            DECLARE @espacio INT = CHARINDEX(' ', @nombreCompleto);
            DECLARE @xnombre VARCHAR(250) = CASE WHEN @espacio > 0 THEN LEFT(@nombreCompleto, @espacio - 1) ELSE @nombreCompleto END;
            DECLARE @xapellido VARCHAR(250) = CASE WHEN @espacio > 0 THEN LTRIM(SUBSTRING(@nombreCompleto, @espacio + 1, 250)) ELSE NULL END;
            -- PREGUNTA LM: datos mínimos del conductor en maclient (sexo, fecha de nacimiento, dirección, teléfono, correo).
            EXEC sp_create_maclient_nexus
                @icedula, @casegurado, @xnombre, @xapellido, @nombreCompleto,
                NULL, NULL, NULL, NULL, 58,
                NULL, NULL, NULL, NULL, NULL,
                @ifuente, NULL;
        END

        -- 5. Número de certificado: como el proceso actual (MAX(ccerti) + 1, automobile_colectivo.js:132-156),
        --    tomando también vhcerti y adpoliza.cultcert para no repetir números de certificados excluidos.
        DECLARE @ccerti INT;
        SELECT @ccerti = MAX(n) + 1 FROM (
            SELECT ISNULL(MAX(ccerti), 0) AS n FROM vhcerti   WHERE cpoliza = @cpoliza
            UNION ALL SELECT ISNULL(MAX(ccerti), 0) FROM vhofcert WHERE cpoliza = @cpoliza
            UNION ALL SELECT @cultcert
        ) t;

        -- 6. Datos del vehículo (como sp_emision_automovil_rcv_nexus: maanomod)
        DECLARE @mvalor NUMERIC(18, 2), @qpuestos SMALLINT, @ctipo INT;
        IF @cmarca IS NOT NULL AND @cmodelo IS NOT NULL AND @cversion IS NOT NULL AND @cano IS NOT NULL
            SELECT TOP 1 @mvalor = mvalor, @qpuestos = npasajero, @ctipo = ctipo
            FROM maanomod WHERE cmarca = @cmarca AND cmodelo = @cmodelo AND cversion = @cversion AND cano = @cano;
        -- PREGUNTA LM: ¿marca/modelo/versión/año son obligatorios para el certificado de flota? Hoy son opcionales.
        -- PREGUNTA LM: uso del vehículo (cuso) para transporte por aplicación (Ridery).

        -- 7. Certificado vigente (vhcerti 'V'), mismas columnas que sp_emision_automovil_rcv_nexus.
        --    DIFERENCIA con el proceso actual: no pasa por vhofcert ('P' → 'E'); se inserta directo vigente.
        -- PREGUNTA LM: xconductor guarda el nombre (proceso actual de flota) o la cédula (emisión RCV Nexus)?
        INSERT INTO vhcerti
        (cproces, ccerti, u_version, cramo, cpoliza, cnpoliza, cplan, fanopol, fmespol, casegurado, ctenedor,
         cbeneficiario, cacreedor, ccategovh, cmarca, cmodelo, cano, mvalor, xplaca, xsercar, xsermot, xcolor,
         qpuestos, qtoneladas, istatcer, fdesde, fhasta, fingreso, cusuario, ccategoria, itipoprod, cversion, ctipo,
         cuso, cprog, ifuente, femision, xconductor)
        VALUES
        (@cproces, @ccerti, '!', @cramo, @cpoliza, @cnpoliza, @cplan, @fanopol, @fmespol, @casegurado, @ctenedor,
         @casegurado, 0, 0, @cmarca, @cmodelo, @cano, ISNULL(@mvalor, 0), @xplaca, @xsercar, @xsermot, @xcolor,
         @qpuestos, 0, 'V', @fdesde, @polFhasta, GETDATE(), @cusuario, 1, @itipoprod, @cversion, @ctipo,
         NULL, @cprog, @ifuente, GETDATE(), LEFT(LTRIM(RTRIM(@xconductor)), 100));

        -- 8. Título del certificado (tetitcer con ccerti del certificado y el conductor como asegurado)
        -- PREGUNTA LM: ¿en colectivos de auto se lleva tetitcer por certificado o solo el ccerti 0 de la póliza?
        IF NOT EXISTS (SELECT 1 FROM tetitcer WHERE cpoliza = @cpoliza AND fanopol = @fanopol AND fmespol = @fmespol AND ccerti = @ccerti)
            INSERT INTO tetitcer
            SELECT a.cpoliza, a.fanopol, a.fmespol, @ccerti, a.u_version, a.cramo, a.itipoprod, a.cproces,
                   @casegurado, a.ctenedor, 0, a.cacreedor, @casegurado, a.cproductor,
                   a.itiporen, a.iestadoren, 'V', @fdesde, a.fhasta, a.forigen,
                   @cprog, @ifuente, a.bok, a.cerror, GETDATE(), @cusuario, a.ccategoria,
                   a.cusuarioauto, a.ccategoriaauto, a.fultmod, a.cusuariomod, a.ccategoriamod
            FROM adpoliza a
            WHERE a.cpoliza = @cpoliza AND a.fanopol = @fanopol AND a.fmespol = @fmespol;

        -- 9. Coberturas del certificado SIN recibo.
        --    adpolcob / adpoltar exigen crecibo (proceso actual: los inserta con el crecibo del sorecibos;
        --    adBRecibo_Frecuencia_Colectivo y sp_genera_coberturas_recibos_auto_rcv_nexus igual).
        --    PROPUESTA: dejar las coberturas del certificado donde el proceso actual las tiene antes del recibo,
        --    en sopolcob / sopoltar (sin crecibo), con prima 0 (la prima llega por viaje). Cada recibo de viaje
        --    (sp_crear_recibo_certificado_nexus) las copia a adpolcob / adpoltar con su crecibo y la prima del viaje.
        -- PREGUNTA LM: ¿aceptan sopolcob / sopoltar como "coberturas del certificado" permanentes, o prefieren
        --              una tabla propia (p. ej. nxflota_cert_cobertura) o adpolcob/adpoltar con un crecibo técnico?
        --              Ojo: no correr SP_CalculoAltas sobre este cproces (prorratea sopolcob/sopoltar).
        -- PREGUNTA LM: suma asegurada por cobertura del plan Ridery (aquí 0; la emisión RCV Nexus la obtiene de
        --              sp_calculo_auto_nexus, que pide tipo/uso/puestos del vehículo).
        DECLARE @pcomProductor BIT = CASE WHEN @cproductor = 80080 THEN 0 ELSE 1 END;

        INSERT INTO sopoltar
        (cpoliza, cproces, ccerti, ccober, ctarifa, u_version, ccoberimp, ietiqtarimp, qordenimp, cramo, fanopol, fmespol,
         csucur, cmoneda, ptasamon, fdesde, fhasta, msumaaseg, msumaasegext, mprima, mprimaext, mdescuento, mdescuentoext,
         pdescuento, mrecargo, mrecargoext, precargo, mprimabruta, mprimabrutaext, pcomision, mcomision, mcomisionext,
         bfraded, mdedu_fran, mdedu_franext, pdedu_fran, isuma, istattar, cramoint, ccoberturaint, ctarifaint,
         cprog, ifuente, fingreso, cusuario, ccategoria)
        SELECT @cpoliza, @cproces, @ccerti, A.ccober, A.ctarifa, '!', C.ccoberimp, C.ietiqtarimp, C.qordenimp, @cramo, @fanopol, @fmespol,
               @csucur, @cmoneda, @ptasamon, @fdesde, @polFhasta, 0, 0, 0, 0, 0, 0,
               0, 0, 0, 0, 0, 0, CASE WHEN @pcomProductor = 1 THEN B.pcomision ELSE 0 END, 0, 0,
               ISNULL(fd.bfraded, 'N'), ISNULL(fd.mdedu_fran, 0), ISNULL(fd.mdedu_franext, 0), ISNULL(fd.pdedu_fran, 0),
               E.isuma, 'V', E.cramoint, E.ccoberturaint, C.ctarifaint,
               @cprog, @ifuente, GETDATE(), @cusuario, 1
        FROM maplantar A
        INNER JOIN maarancel B ON A.ccober = B.ccober AND A.cramo = B.cramo
        INNER JOIN matarifa C ON A.ccober = C.ccober AND A.cramo = C.cramo AND A.ctarifa = C.ctarifa
        INNER JOIN macoberturas E ON E.ccobertura = C.ccober AND E.cramo = C.cramo
        LEFT JOIN matarifa_d fd ON fd.ccober = C.ccober AND fd.cramo = C.cramo AND fd.ctarifa = C.ctarifa
        WHERE A.cramo = @cramo AND TRIM(A.cplan) = TRIM(@cplan) AND B.iestado = 'V';
        IF @@ROWCOUNT = 0 RAISERROR('El plan de la póliza no produjo coberturas (maplantar/maarancel/matarifa/macoberturas).', 16, 1);

        INSERT INTO sopolcob
        (cpoliza, ccerti, cproces, ccober, u_version, cramo, fanopol, fmespol, csucur, cmoneda, ptasamon, fdesde, fhasta,
         msumaaseg, msumaasegext, mprimabruta, mprimabrutaext, pcomision, mcomision, mcomisionext, mprimareas, mprimareasext,
         iestado, isuma, ccontrea, cramorea, cramopcnd, ccoberpcnd, cramoint, ccoberturaint, btarifaok,
         cprog, ifuente, fingreso, cusuario, ccategoria)
        SELECT @cpoliza, @ccerti, @cproces, t.ccober, '!', @cramo, @fanopol, @fmespol, @csucur, @cmoneda, @ptasamon, @fdesde, @polFhasta,
               MAX(t.msumaaseg), MAX(t.msumaasegext), 0, 0, MAX(t.pcomision), 0, 0, 0, 0,
               'V', MAX(t.isuma), NULL, NULL, NULL, NULL, MAX(t.cramoint), MAX(t.ccoberturaint), 0,
               @cprog, @ifuente, GETDATE(), @cusuario, 1
        FROM sopoltar t
        WHERE t.cpoliza = @cpoliza AND t.ccerti = @ccerti
        GROUP BY t.ccober;
        -- PREGUNTA LM: contrato/ramo de reaseguro (ccontrea, cramorea) de las coberturas; el proceso actual los deja NULL.

        -- DIFERENCIA FLOTA RIDERY: sin recibo
        --   Aquí el proceso actual inserta sorecibos (automobile_colectivo.js:391-521), luego adrecibos +
        --   adpolcob/adpoltar con ese crecibo, EXEC adBRecibo_Frecuencia_Colectivo y EXEC spCorrigeCertificadoFlota
        --   (automobile_colectivo_recibos.js:301-667), y SP_CalculoAltas @cproces. Nada de eso se hace:
        --   el certificado queda vigente sin recibos; cada viaje crea el suyo con sp_crear_recibo_certificado_nexus.

        -- 10. Último certificado de la póliza
        UPDATE adpoliza SET cultcert = @ccerti, fultmod = GETDATE(), cusuariomod = @cusuario
        WHERE cpoliza = @cpoliza AND fanopol = @fanopol AND fmespol = @fmespol;

        COMMIT;
        SELECT @pCcerti = @ccerti, @pSuccess = 1;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        SELECT @pSuccess = 0, @pErrorMessage = ERROR_MESSAGE(), @pCcerti = NULL;
    END CATCH
END
GO


/* =====================================================================================
   (c) sp_flota_excluir_certificado_nexus
   Excluye el certificado (vehículo + conductor) desde @fexclusion. Igual que las anulaciones de
   SysIP (db/Changes.js:54, db/Emissions.js:2328): vhcerti.istatcer 'N' + fanulacion + canula.
   NO anula recibos de viajes ya generados (cada uno es un cobro cerrado). Rechaza la exclusión si
   hay recibos de viajes con fecha igual o posterior a @fexclusion.
   Idempotente: si el certificado ya está excluido, pSuccess = 1 con el mensaje "ya estaba excluido".
   ===================================================================================== */
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
    SET XACT_ABORT ON;
    SELECT @pSuccess = 0, @pErrorMessage = NULL;

    BEGIN TRY
        IF @ccerti IS NULL OR @ccerti <= 0 RAISERROR('El certificado es inválido (ccerti 0 es la póliza).', 16, 1);
        SET @fexclusion = ISNULL(@fexclusion, CAST(GETDATE() AS DATE));

        BEGIN TRAN;

        DECLARE @cpoliza NUMERIC(19, 0), @fanopol INT, @fmespol INT, @itipopol CHAR(1), @polFhasta DATE;
        SELECT TOP 1 @cpoliza = cpoliza, @fanopol = fanopol, @fmespol = fmespol, @itipopol = itipopol, @polFhasta = fhasta
        FROM adpoliza WITH (UPDLOCK, HOLDLOCK)
        WHERE cnpoliza = @cnpoliza
        ORDER BY fanopol DESC, fmespol DESC;
        IF @cpoliza IS NULL RAISERROR('No existe la póliza indicada.', 16, 1);
        IF @itipopol <> 'C' RAISERROR('La póliza no es colectiva (itipopol <> C).', 16, 1);

        DECLARE @istatcer CHAR(1), @certFdesde DATE;
        SELECT @istatcer = istatcer, @certFdesde = fdesde
        FROM vhcerti WITH (UPDLOCK)
        WHERE cpoliza = @cpoliza AND fanopol = @fanopol AND fmespol = @fmespol AND ccerti = @ccerti;
        IF @istatcer IS NULL RAISERROR('El certificado no existe en la póliza.', 16, 1);

        IF @istatcer IN ('N', 'A')
        BEGIN
            COMMIT;
            SELECT @pSuccess = 1, @pErrorMessage = 'El certificado ya estaba excluido.';
            RETURN;
        END
        IF @fexclusion < @certFdesde RAISERROR('La fecha de exclusión es anterior a la inclusión del certificado.', 16, 1);
        IF @fexclusion > @polFhasta RAISERROR('La fecha de exclusión es posterior al fin de la vigencia de la póliza.', 16, 1);

        IF EXISTS (SELECT 1 FROM adrecibos
                   WHERE cpoliza = @cpoliza AND fanopol = @fanopol AND fmespol = @fmespol AND ccerti = @ccerti
                     AND iestadorec <> 'A' AND CONVERT(DATE, fdesde) >= @fexclusion)
            RAISERROR('Hay recibos de viajes con fecha igual o posterior a la exclusión: revíselos antes de excluir.', 16, 1);

        -- PREGUNTA LM: código de causa de exclusión (canula) y estado: 'N' (Changes.js / Emissions.js) o 'A' (adAnulaPoliza).
        UPDATE vhcerti
        SET istatcer = 'N', fanulacion = @fexclusion, canula = 0,
            fultmod = GETDATE(), cusuariomod = @cusuario
        WHERE cpoliza = @cpoliza AND fanopol = @fanopol AND fmespol = @fmespol AND ccerti = @ccerti;

        -- Coberturas del certificado (propuesta del SP b): dejan de usarse para viajes nuevos.
        UPDATE sopolcob SET iestado = 'A' WHERE cpoliza = @cpoliza AND ccerti = @ccerti AND iestado = 'V';
        UPDATE sopoltar SET istattar = 'A' WHERE cpoliza = @cpoliza AND ccerti = @ccerti AND istattar = 'V';

        -- DIFERENCIA FLOTA RIDERY: sin recibo
        --   En una flota con recibo por certificado, la exclusión emitiría una devolución o anularía las cuotas
        --   pendientes. Aquí no hay cuotas: los recibos de viajes anteriores quedan como están y no se crea
        --   recibo de devolución.

        COMMIT;
        SET @pSuccess = 1;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        SELECT @pSuccess = 0, @pErrorMessage = ERROR_MESSAGE();
    END CATCH
END
GO
