-- QA Sis2000 (NAME_BD de nest-api, casi siempre sis2000_qa).
-- Publica DBA en SSMS. El agente no ejecuta este script.
-- Sin trigger. Sin HTTP. Sin cron sobre adpolcob.
--
-- Objetos:
--   1) tabla sync_poliza_evento_rms_nexus  buzon PENDIENTE / MIGRADO / ERROR
--   2) sp_encola_poliza_rms_nexus          SysIP / endoso EXEC: snapshot completo
--   3) sp_sync_poliza_pendientes_rms_nexus nest lee PENDIENTE
--   4) sp_sync_poliza_marcar_rms_nexus     nest marca MIGRADO tras homologar RMS
--
-- El SP arma el JSON del webhook RMS (personas + coberturas). No manda marca ni vehiculo.
-- Si ya hay PENDIENTE de la misma poliza, actualiza el snapshot (no duplica).
--
-- Azure Data Studio: ejecutar lote por lote (no pega GO al motor).

IF OBJECT_ID(N'dbo.sync_poliza_evento_rms_nexus', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.sync_poliza_evento_rms_nexus (
        id            INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
        cnpoliza      NVARCHAR(30)  NOT NULL,
        cpoliza       NUMERIC(19, 0) NULL,
        fanopol       INT           NULL,
        fmespol       INT           NULL,
        origen        NVARCHAR(20)  NOT NULL CONSTRAINT DF_sync_poliza_evt_origen DEFAULT (N'SP'),
        estado        NVARCHAR(20)  NOT NULL CONSTRAINT DF_sync_poliza_evt_estado DEFAULT (N'PENDIENTE'),
        payload_json  NVARCHAR(MAX) NULL,
        intentos      INT           NOT NULL CONSTRAINT DF_sync_poliza_evt_intentos DEFAULT (0),
        xerror        NVARCHAR(MAX) NULL,
        fcreated      DATETIME      NOT NULL CONSTRAINT DF_sync_poliza_evt_fcreated DEFAULT (GETDATE()),
        fupdated      DATETIME      NOT NULL CONSTRAINT DF_sync_poliza_evt_fupdated DEFAULT (GETDATE())
    );

    CREATE INDEX IX_sync_poliza_evt_pendiente
        ON dbo.sync_poliza_evento_rms_nexus (estado, id);
    CREATE INDEX IX_sync_poliza_evt_poliza
        ON dbo.sync_poliza_evento_rms_nexus (cnpoliza, estado);
END;
GO

IF OBJECT_ID(N'dbo.sp_encola_poliza_rms_nexus', N'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_encola_poliza_rms_nexus;
GO

CREATE PROCEDURE dbo.sp_encola_poliza_rms_nexus
    @cnpoliza       NVARCHAR(30),
    @fanopol        INT = NULL,
    @fmespol        INT = NULL,
    @origen         NVARCHAR(20) = N'SP',
    @cusuario       INT = NULL,
    @pSuccess       BIT = 0 OUTPUT,
    @pErrorMessage  NVARCHAR(MAX) = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @clean NVARCHAR(30) = LTRIM(RTRIM(@cnpoliza));
    DECLARE @cpoliza NUMERIC(19, 0);
    DECLARE @ano INT;
    DECLARE @mes INT;
    DECLARE @polizaJson NVARCHAR(MAX);
    DECLARE @riesgoJson NVARCHAR(MAX);
    DECLARE @cobJson NVARCHAR(MAX);
    DECLARE @payload NVARCHAR(MAX);
    DECLARE @idExistente INT;

    IF @clean IS NULL OR @clean = N''
    BEGIN
        SET @pSuccess = 0;
        SET @pErrorMessage = N'cnpoliza es obligatorio.';
        RETURN;
    END;

    IF ISNULL(@cusuario, 0) = 999
    BEGIN
        SET @pSuccess = 1;
        SET @pErrorMessage = N'Omitido: cusuariomod 999 (vuelta RMS).';
        RETURN;
    END;

    SELECT TOP 1
        @cpoliza = p.cpoliza,
        @ano = p.fanopol,
        @mes = p.fmespol
    FROM dbo.adpoliza p
    WHERE LTRIM(RTRIM(p.cnpoliza)) = @clean
      AND (@fanopol IS NULL OR p.fanopol = @fanopol)
      AND (@fmespol IS NULL OR p.fmespol = @fmespol)
    ORDER BY p.fanopol DESC, p.fmespol DESC;

    IF @cpoliza IS NULL
    BEGIN
        SET @pSuccess = 0;
        SET @pErrorMessage = N'No se encontro la poliza.';
        RETURN;
    END;

    SELECT @polizaJson = (
        SELECT
            LTRIM(RTRIM(p.cnpoliza)) AS poliza,
            CONVERT(varchar(30), p.cpoliza) AS codPoliza,
            p.cramo AS cramo,
            N'INDIVIDUAL' AS tipopol,
            CONVERT(varchar(20), p.cproductor) AS cproductor,
            LTRIM(RTRIM(p.cmoneda)) AS moneda,
            LTRIM(RTRIM(p.iestado)) AS iestado,
            CONVERT(varchar(10), p.fdesde, 23) AS fdesde,
            CONVERT(varchar(10), p.fhasta, 23) AS fhasta,
            CONVERT(varchar(10), p.fdesde, 23) AS emision,
            CASE
                WHEN t.cci_rif IS NULL THEN NULL
                ELSE LEFT(LTRIM(RTRIM(ISNULL(t.cid, N'V'))), 1)
                     + N'-' + CONVERT(varchar(20), CONVERT(bigint, t.cci_rif))
            END AS ctendor,
            CASE
                WHEN s.cci_rif IS NULL THEN NULL
                ELSE LEFT(LTRIM(RTRIM(ISNULL(s.cid, N'V'))), 1)
                     + N'-' + CONVERT(varchar(20), CONVERT(bigint, s.cci_rif))
            END AS casegurado,
            CASE
                WHEN b.cci_rif IS NULL THEN NULL
                ELSE LEFT(LTRIM(RTRIM(ISNULL(b.cid, N'V'))), 1)
                     + N'-' + CONVERT(varchar(20), CONVERT(bigint, b.cci_rif))
            END AS cbeneficiario,
            LTRIM(RTRIM(t.xcliente)) AS xtenedor,
            LTRIM(RTRIM(s.xcliente)) AS xtitular,
            LTRIM(RTRIM(s.xcliente)) AS xasegurado,
            LTRIM(RTRIM(b.xcliente)) AS xbeneficiario
        FROM dbo.adpoliza p
        LEFT JOIN dbo.maclient t ON t.cci_rif = p.ctenedor
        LEFT JOIN dbo.maclient s ON s.cci_rif = p.casegurado
        LEFT JOIN dbo.maclient b ON b.cci_rif = p.cbeneficiario
        WHERE p.cpoliza = @cpoliza
          AND p.fanopol = @ano
          AND p.fmespol = @mes
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    SELECT @riesgoJson = (
        SELECT Tipo_pers, cid, xpersona, xnombre, xapellido
        FROM (
            SELECT
                N'tomador' AS Tipo_pers,
                CASE WHEN t.cci_rif IS NULL THEN NULL
                     ELSE LEFT(LTRIM(RTRIM(ISNULL(t.cid, N'V'))), 1)
                          + N'-' + CONVERT(varchar(20), CONVERT(bigint, t.cci_rif))
                END AS cid,
                LTRIM(RTRIM(t.xcliente)) AS xpersona,
                LTRIM(RTRIM(t.xnombre)) AS xnombre,
                LTRIM(RTRIM(t.xapellido)) AS xapellido
            FROM dbo.adpoliza p
            LEFT JOIN dbo.maclient t ON t.cci_rif = p.ctenedor
            WHERE p.cpoliza = @cpoliza AND p.fanopol = @ano AND p.fmespol = @mes
            UNION ALL
            SELECT
                N'titular',
                CASE WHEN s.cci_rif IS NULL THEN NULL
                     ELSE LEFT(LTRIM(RTRIM(ISNULL(s.cid, N'V'))), 1)
                          + N'-' + CONVERT(varchar(20), CONVERT(bigint, s.cci_rif))
                END,
                LTRIM(RTRIM(s.xcliente)),
                LTRIM(RTRIM(s.xnombre)),
                LTRIM(RTRIM(s.xapellido))
            FROM dbo.adpoliza p
            LEFT JOIN dbo.maclient s ON s.cci_rif = p.casegurado
            WHERE p.cpoliza = @cpoliza AND p.fanopol = @ano AND p.fmespol = @mes
            UNION ALL
            SELECT
                N'asegurado',
                CASE WHEN s.cci_rif IS NULL THEN NULL
                     ELSE LEFT(LTRIM(RTRIM(ISNULL(s.cid, N'V'))), 1)
                          + N'-' + CONVERT(varchar(20), CONVERT(bigint, s.cci_rif))
                END,
                LTRIM(RTRIM(s.xcliente)),
                LTRIM(RTRIM(s.xnombre)),
                LTRIM(RTRIM(s.xapellido))
            FROM dbo.adpoliza p
            LEFT JOIN dbo.maclient s ON s.cci_rif = p.casegurado
            WHERE p.cpoliza = @cpoliza AND p.fanopol = @ano AND p.fmespol = @mes
            UNION ALL
            SELECT
                N'beneficiario',
                CASE WHEN b.cci_rif IS NULL THEN NULL
                     ELSE LEFT(LTRIM(RTRIM(ISNULL(b.cid, N'V'))), 1)
                          + N'-' + CONVERT(varchar(20), CONVERT(bigint, b.cci_rif))
                END,
                LTRIM(RTRIM(b.xcliente)),
                LTRIM(RTRIM(b.xnombre)),
                LTRIM(RTRIM(b.xapellido))
            FROM dbo.adpoliza p
            LEFT JOIN dbo.maclient b ON b.cci_rif = p.cbeneficiario
            WHERE p.cpoliza = @cpoliza AND p.fanopol = @ano AND p.fmespol = @mes
        ) r
        WHERE r.cid IS NOT NULL
        FOR JSON PATH
    );

    SELECT @cobJson = (
        SELECT
            c.ccober,
            LTRIM(RTRIM(m.xdescripcion_l)) AS xcobertura,
            c.msumaaseg,
            c.msumaasegext,
            c.mprimabruta,
            c.mprimabrutaext,
            CONVERT(varchar(10), c.fdesde, 23) AS fdesde,
            CONVERT(varchar(10), c.fhasta, 23) AS fhasta,
            LTRIM(RTRIM(c.iestado)) AS iestado
        FROM dbo.adpolcob c
        LEFT JOIN dbo.macoberturas m
            ON m.ccobertura = c.ccober
           AND m.cramo = c.cramo
        WHERE c.cpoliza = @cpoliza
          AND c.fanopol = @ano
          AND c.fmespol = @mes
          AND ISNULL(c.iestado, N'V') NOT IN (N'A')
          AND c.crecibo = (
                SELECT MAX(x.crecibo)
                FROM dbo.adpolcob x
                WHERE x.cpoliza = c.cpoliza
                  AND x.fanopol = c.fanopol
                  AND x.fmespol = c.fmespol
                  AND ISNULL(x.iestado, N'V') NOT IN (N'A')
          )
        FOR JSON PATH
    );

    SELECT @payload = (
        SELECT
            N'poliza.actualizada' AS evento,
            CONVERT(varchar(30), @cpoliza) AS cpoliza,
            @clean AS poliza,
            JSON_QUERY(@polizaJson) AS [poliza_detalle.poliza],
            JSON_QUERY(ISNULL(@riesgoJson, N'[]')) AS [poliza_detalle.riesgo],
            JSON_QUERY(ISNULL(@cobJson, N'[]')) AS [poliza_detalle.Coberturas]
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    SELECT TOP 1 @idExistente = id
    FROM dbo.sync_poliza_evento_rms_nexus
    WHERE estado = N'PENDIENTE'
      AND LTRIM(RTRIM(cnpoliza)) = @clean
    ORDER BY id ASC;

    IF @idExistente IS NOT NULL
    BEGIN
        UPDATE dbo.sync_poliza_evento_rms_nexus
           SET payload_json = @payload,
               cpoliza = @cpoliza,
               fanopol = @ano,
               fmespol = @mes,
               origen = ISNULL(NULLIF(LTRIM(RTRIM(@origen)), N''), N'SP'),
               xerror = NULL,
               fupdated = GETDATE()
         WHERE id = @idExistente;
    END
    ELSE
    BEGIN
        INSERT INTO dbo.sync_poliza_evento_rms_nexus (
            cnpoliza, cpoliza, fanopol, fmespol, origen, estado, payload_json
        )
        VALUES (
            @clean,
            @cpoliza,
            @ano,
            @mes,
            ISNULL(NULLIF(LTRIM(RTRIM(@origen)), N''), N'SP'),
            N'PENDIENTE',
            @payload
        );
        SET @idExistente = SCOPE_IDENTITY();
    END;

    SET @pSuccess = 1;
    SET @pErrorMessage = N'OK id=' + CONVERT(varchar(20), @idExistente);
END;
GO

IF OBJECT_ID(N'dbo.sp_sync_poliza_pendientes_rms_nexus', N'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_sync_poliza_pendientes_rms_nexus;
GO

CREATE PROCEDURE dbo.sp_sync_poliza_pendientes_rms_nexus
    @limit          INT = 20,
    @pSuccess       BIT = 0 OUTPUT,
    @pErrorMessage  NVARCHAR(MAX) = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @take INT = CASE WHEN ISNULL(@limit, 20) < 1 THEN 20
                             WHEN @limit > 50 THEN 50
                             ELSE @limit END;

    SELECT TOP (@take)
        id,
        LTRIM(RTRIM(cnpoliza)) AS cnpoliza,
        cpoliza,
        fanopol,
        fmespol,
        origen,
        estado,
        payload_json,
        intentos,
        fcreated
    FROM dbo.sync_poliza_evento_rms_nexus
    WHERE estado = N'PENDIENTE'
    ORDER BY id ASC;

    SET @pSuccess = 1;
    SET @pErrorMessage = N'OK';
END;
GO

IF OBJECT_ID(N'dbo.sp_sync_poliza_marcar_rms_nexus', N'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_sync_poliza_marcar_rms_nexus;
GO

CREATE PROCEDURE dbo.sp_sync_poliza_marcar_rms_nexus
    @id             INT,
    @estado         NVARCHAR(20),
    @xerror         NVARCHAR(MAX) = NULL,
    @pSuccess       BIT = 0 OUTPUT,
    @pErrorMessage  NVARCHAR(MAX) = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    IF @id IS NULL OR ISNULL(@estado, N'') NOT IN (N'MIGRADO', N'OK', N'ERROR', N'PENDIENTE')
    BEGIN
        SET @pSuccess = 0;
        SET @pErrorMessage = N'id y estado (MIGRADO|OK|ERROR|PENDIENTE) son obligatorios.';
        RETURN;
    END;

    UPDATE dbo.sync_poliza_evento_rms_nexus
       SET estado = @estado,
           xerror = @xerror,
           intentos = intentos + CASE WHEN @estado IN (N'ERROR', N'PENDIENTE') THEN 1 ELSE 0 END,
           fupdated = GETDATE()
     WHERE id = @id;

    SET @pSuccess = CASE WHEN @@ROWCOUNT = 1 THEN 1 ELSE 0 END;
    SET @pErrorMessage = CASE WHEN @@ROWCOUNT = 1 THEN N'OK' ELSE N'No existe el id.' END;
END;
GO
