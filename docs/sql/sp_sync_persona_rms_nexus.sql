-- Puente personas Sis2000 ↔ RMS (outbox + validación).
-- La póliza nace en Sis2000. Si cambia un lado, el otro se actualiza vía nest-api.
-- Esta tabla sobrevive al corte de red; nest drena PENDIENTE.
-- Apply hacia maclient: reutilizar sp_cambio_datos_poliza_endoso_nexus (no duplicar).
-- Publicar en Sis2000 QA (DBA). nest-api no ejecuta este script.
--
-- DROP + CREATE del SP: DBeaver parte CREATE OR ALTER en cada ';'.

IF OBJECT_ID(N'dbo.sync_persona_rms_nexus', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.sync_persona_rms_nexus (
        id            INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
        cnpoliza      NVARCHAR(30)  NOT NULL,
        fanopol       INT           NULL,
        fmespol       INT           NULL,
        direccion     NVARCHAR(20)  NOT NULL, -- SIS_TO_RMS | RMS_TO_SIS
        estado        NVARCHAR(20)  NOT NULL, -- PENDIENTE | OK | ERROR | CONFLICTO
        tipoCambio    NVARCHAR(20)  NULL,     -- TOMADOR | ASEGURADO | BENEFICIARIO
        cci_rif       NUMERIC(19, 0) NULL,
        icedula       CHAR(1)       NULL,
        xcliente      NVARCHAR(250) NULL,
        xnombre       NVARCHAR(120) NULL,
        xapellido     NVARCHAR(120) NULL,
        xdireccion    NVARCHAR(500) NULL,
        xtelefono     NVARCHAR(50)  NULL,
        xcorreo       NVARCHAR(250) NULL,
        payload_json  NVARCHAR(MAX) NULL,     -- foto sis + rms + snapshot
        snapshot_json NVARCHAR(MAX) NULL,     -- última versión homologada
        intentos      INT           NOT NULL CONSTRAINT DF_sync_persona_rms_intentos DEFAULT (0),
        xerror        NVARCHAR(MAX) NULL,
        fcreated      DATETIME      NOT NULL CONSTRAINT DF_sync_persona_rms_fcreated DEFAULT (GETDATE()),
        fupdated      DATETIME      NOT NULL CONSTRAINT DF_sync_persona_rms_fupdated DEFAULT (GETDATE())
    );

    CREATE INDEX IX_sync_persona_rms_pendiente
        ON dbo.sync_persona_rms_nexus (estado, id);
    CREATE INDEX IX_sync_persona_rms_poliza
        ON dbo.sync_persona_rms_nexus (cnpoliza, id);
END;
GO

IF OBJECT_ID(N'dbo.sp_valida_sync_persona_rms_nexus', N'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_valida_sync_persona_rms_nexus;
GO

CREATE PROCEDURE [dbo].[sp_valida_sync_persona_rms_nexus]
    @cnpoliza       NVARCHAR(30),
    @fanopol        INT = NULL,
    @fmespol        INT = NULL,
    @rms_json       NVARCHAR(MAX) = NULL, -- {"tomador":{...},"asegurado":{...},"beneficiario":{...}}
    @snapshot_json  NVARCHAR(MAX) = NULL,
    @pSuccess       BIT = 0 OUTPUT,
    @pErrorMessage  NVARCHAR(MAX) = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @clean NVARCHAR(30) = LTRIM(RTRIM(@cnpoliza));
    DECLARE @msg NVARCHAR(400);

    IF @clean IS NULL OR @clean = N''
    BEGIN
        SET @pSuccess = 0;
        SET @pErrorMessage = N'cnpoliza es obligatorio.';
        RETURN;
    END;

    IF @snapshot_json IS NULL
    BEGIN
        SELECT TOP 1 @snapshot_json = snapshot_json
        FROM dbo.sync_persona_rms_nexus
        WHERE LTRIM(RTRIM(cnpoliza)) = @clean
          AND estado = N'OK'
          AND snapshot_json IS NOT NULL
        ORDER BY id DESC;
    END;

    IF OBJECT_ID('tempdb..#roles') IS NOT NULL DROP TABLE #roles;
    CREATE TABLE #roles (
        rol            NVARCHAR(20)  NOT NULL,
        sis_rif        NVARCHAR(30)  NULL,
        sis_icedula    NVARCHAR(5)   NULL,
        sis_xcliente   NVARCHAR(250) NULL,
        rms_rif        NVARCHAR(30)  NULL,
        rms_icedula    NVARCHAR(5)   NULL,
        rms_xcliente   NVARCHAR(250) NULL,
        snap_rif       NVARCHAR(30)  NULL,
        snap_icedula   NVARCHAR(5)   NULL,
        snap_xcliente  NVARCHAR(250) NULL
    );

    ;WITH pol AS (
        SELECT TOP 1
            p.ctenedor,
            p.casegurado,
            p.cbeneficiario,
            LTRIM(RTRIM(t.cid)) AS cid_tom,
            t.cci_rif AS rif_tom,
            t.xcliente AS x_tom,
            LTRIM(RTRIM(s.cid)) AS cid_aseg,
            s.cci_rif AS rif_aseg,
            s.xcliente AS x_aseg,
            LTRIM(RTRIM(b.cid)) AS cid_ben,
            b.cci_rif AS rif_ben,
            b.xcliente AS x_ben
        FROM adpoliza p
        LEFT JOIN maclient t ON t.cci_rif = p.ctenedor
        LEFT JOIN maclient s ON s.cci_rif = p.casegurado
        LEFT JOIN maclient b ON b.cci_rif = p.cbeneficiario
        WHERE LTRIM(RTRIM(p.cnpoliza)) = @clean
          AND (@fanopol IS NULL OR p.fanopol = @fanopol)
          AND (@fmespol IS NULL OR p.fmespol = @fmespol)
        ORDER BY p.fanopol DESC, p.fmespol DESC
    )
    INSERT INTO #roles (rol, sis_rif, sis_icedula, sis_xcliente)
    SELECT N'tomador',
           CONVERT(NVARCHAR(30), rif_tom),
           LEFT(ISNULL(cid_tom, N''), 1),
           LTRIM(RTRIM(x_tom))
    FROM pol
    UNION ALL
    SELECT N'asegurado',
           CONVERT(NVARCHAR(30), rif_aseg),
           LEFT(ISNULL(cid_aseg, N''), 1),
           LTRIM(RTRIM(x_aseg))
    FROM pol
    UNION ALL
    SELECT N'beneficiario',
           CONVERT(NVARCHAR(30), rif_ben),
           LEFT(ISNULL(cid_ben, N''), 1),
           LTRIM(RTRIM(x_ben))
    FROM pol;

    IF NOT EXISTS (SELECT 1 FROM #roles)
    BEGIN
        SET @pSuccess = 0;
        SET @pErrorMessage = N'No se encontró la póliza especificada.';
        RETURN;
    END;

    IF ISJSON(ISNULL(@rms_json, N'{}')) = 0
    BEGIN
        SET @pSuccess = 0;
        SET @pErrorMessage = N'rms_json no es JSON válido.';
        RETURN;
    END;

    UPDATE #roles SET
        rms_rif = NULLIF(LTRIM(RTRIM(JSON_VALUE(@rms_json, '$.tomador.cci_rif'))), N''),
        rms_icedula = LEFT(NULLIF(LTRIM(RTRIM(JSON_VALUE(@rms_json, '$.tomador.icedula'))), N''), 1),
        rms_xcliente = NULLIF(LTRIM(RTRIM(JSON_VALUE(@rms_json, '$.tomador.xcliente'))), N'')
    WHERE rol = N'tomador';
    UPDATE #roles SET
        rms_rif = NULLIF(LTRIM(RTRIM(JSON_VALUE(@rms_json, '$.asegurado.cci_rif'))), N''),
        rms_icedula = LEFT(NULLIF(LTRIM(RTRIM(JSON_VALUE(@rms_json, '$.asegurado.icedula'))), N''), 1),
        rms_xcliente = NULLIF(LTRIM(RTRIM(JSON_VALUE(@rms_json, '$.asegurado.xcliente'))), N'')
    WHERE rol = N'asegurado';
    UPDATE #roles SET
        rms_rif = NULLIF(LTRIM(RTRIM(JSON_VALUE(@rms_json, '$.beneficiario.cci_rif'))), N''),
        rms_icedula = LEFT(NULLIF(LTRIM(RTRIM(JSON_VALUE(@rms_json, '$.beneficiario.icedula'))), N''), 1),
        rms_xcliente = NULLIF(LTRIM(RTRIM(JSON_VALUE(@rms_json, '$.beneficiario.xcliente'))), N'')
    WHERE rol = N'beneficiario';

    IF ISJSON(ISNULL(@snapshot_json, N'{}')) = 1 AND @snapshot_json IS NOT NULL
    BEGIN
        UPDATE #roles SET
            snap_rif = NULLIF(LTRIM(RTRIM(JSON_VALUE(@snapshot_json, '$.tomador.cci_rif'))), N''),
            snap_icedula = LEFT(NULLIF(LTRIM(RTRIM(JSON_VALUE(@snapshot_json, '$.tomador.icedula'))), N''), 1),
            snap_xcliente = NULLIF(LTRIM(RTRIM(JSON_VALUE(@snapshot_json, '$.tomador.xcliente'))), N'')
        WHERE rol = N'tomador';
        UPDATE #roles SET
            snap_rif = NULLIF(LTRIM(RTRIM(JSON_VALUE(@snapshot_json, '$.asegurado.cci_rif'))), N''),
            snap_icedula = LEFT(NULLIF(LTRIM(RTRIM(JSON_VALUE(@snapshot_json, '$.asegurado.icedula'))), N''), 1),
            snap_xcliente = NULLIF(LTRIM(RTRIM(JSON_VALUE(@snapshot_json, '$.asegurado.xcliente'))), N'')
        WHERE rol = N'asegurado';
        UPDATE #roles SET
            snap_rif = NULLIF(LTRIM(RTRIM(JSON_VALUE(@snapshot_json, '$.beneficiario.cci_rif'))), N''),
            snap_icedula = LEFT(NULLIF(LTRIM(RTRIM(JSON_VALUE(@snapshot_json, '$.beneficiario.icedula'))), N''), 1),
            snap_xcliente = NULLIF(LTRIM(RTRIM(JSON_VALUE(@snapshot_json, '$.beneficiario.xcliente'))), N'')
        WHERE rol = N'beneficiario';
    END;

    IF OBJECT_ID('tempdb..#informe') IS NOT NULL DROP TABLE #informe;
    CREATE TABLE #informe (
        rol             NVARCHAR(20)  NOT NULL,
        campo           NVARCHAR(30)  NOT NULL,
        valor_sis       NVARCHAR(250) NULL,
        valor_rms       NVARCHAR(250) NULL,
        valor_snapshot  NVARCHAR(250) NULL,
        estado          NVARCHAR(20)  NOT NULL,
        origen_cambio   NVARCHAR(20)  NULL,
        detalle         NVARCHAR(400) NULL
    );

    ;WITH campos AS (
        SELECT rol, N'cci_rif' AS campo, sis_rif AS sis, rms_rif AS rms, snap_rif AS snap FROM #roles
        UNION ALL
        SELECT rol, N'icedula', sis_icedula, rms_icedula, snap_icedula FROM #roles
        UNION ALL
        SELECT rol, N'xcliente',
               UPPER(LTRIM(RTRIM(ISNULL(sis_xcliente, N'')))),
               UPPER(LTRIM(RTRIM(ISNULL(rms_xcliente, N'')))),
               UPPER(LTRIM(RTRIM(ISNULL(snap_xcliente, N''))))
        FROM #roles
    )
    INSERT INTO #informe (rol, campo, valor_sis, valor_rms, valor_snapshot, estado, origen_cambio, detalle)
    SELECT
        c.rol,
        c.campo,
        NULLIF(c.sis, N''),
        NULLIF(c.rms, N''),
        NULLIF(c.snap, N''),
        CASE
            WHEN ISNULL(c.sis, N'') = ISNULL(c.rms, N'') AND ISNULL(c.sis, N'') <> N'' THEN N'OK'
            WHEN ISNULL(c.sis, N'') = ISNULL(c.rms, N'') AND ISNULL(c.sis, N'') = N'' THEN N'FALTA_EN_AMBOS'
            WHEN ISNULL(c.sis, N'') = N'' AND ISNULL(c.rms, N'') <> N'' THEN N'FALTA_EN_SIS'
            WHEN ISNULL(c.rms, N'') = N'' AND ISNULL(c.sis, N'') <> N'' THEN N'FALTA_EN_RMS'
            WHEN ISNULL(c.snap, N'') <> N''
                 AND ISNULL(c.sis, N'') <> ISNULL(c.snap, N'')
                 AND ISNULL(c.rms, N'') <> ISNULL(c.snap, N'')
                 AND ISNULL(c.sis, N'') <> ISNULL(c.rms, N'') THEN N'CONFLICTO'
            WHEN ISNULL(c.sis, N'') <> ISNULL(c.rms, N'') THEN N'DISTINTO'
            ELSE N'OK'
        END,
        CASE
            WHEN ISNULL(c.snap, N'') <> N''
                 AND ISNULL(c.sis, N'') <> ISNULL(c.snap, N'')
                 AND ISNULL(c.rms, N'') <> ISNULL(c.snap, N'')
                 AND ISNULL(c.sis, N'') <> ISNULL(c.rms, N'') THEN N'AMBOS'
            WHEN ISNULL(c.snap, N'') <> N''
                 AND ISNULL(c.sis, N'') <> ISNULL(c.snap, N'')
                 AND ISNULL(c.rms, N'') = ISNULL(c.snap, N'') THEN N'SIS'
            WHEN ISNULL(c.snap, N'') <> N''
                 AND ISNULL(c.rms, N'') <> ISNULL(c.snap, N'')
                 AND ISNULL(c.sis, N'') = ISNULL(c.snap, N'') THEN N'RMS'
            WHEN ISNULL(c.sis, N'') <> N'' AND ISNULL(c.rms, N'') = N'' THEN N'SIS'
            WHEN ISNULL(c.rms, N'') <> N'' AND ISNULL(c.sis, N'') = N'' THEN N'RMS'
            ELSE NULL
        END,
        CASE
            WHEN ISNULL(c.sis, N'') = ISNULL(c.rms, N'') AND ISNULL(c.sis, N'') <> N'' THEN N'Homologado'
            WHEN ISNULL(c.sis, N'') = N'' AND ISNULL(c.rms, N'') <> N'' THEN N'Está en RMS y falta en Sis2000'
            WHEN ISNULL(c.rms, N'') = N'' AND ISNULL(c.sis, N'') <> N'' THEN N'Está en Sis2000 y falta en RMS'
            WHEN ISNULL(c.snap, N'') <> N''
                 AND ISNULL(c.sis, N'') <> ISNULL(c.snap, N'')
                 AND ISNULL(c.rms, N'') <> ISNULL(c.snap, N'')
                 AND ISNULL(c.sis, N'') <> ISNULL(c.rms, N'') THEN N'Ambos cambiaron respecto al snapshot; no se pisa a ciegas'
            WHEN ISNULL(c.sis, N'') <> ISNULL(c.rms, N'') THEN N'Sis2000 y RMS no coinciden'
            ELSE N'OK'
        END
    FROM campos c;

    SELECT
        rol,
        campo,
        valor_sis,
        valor_rms,
        valor_snapshot,
        estado,
        origen_cambio,
        detalle
    FROM #informe
    ORDER BY
        CASE rol WHEN N'tomador' THEN 1 WHEN N'asegurado' THEN 2 ELSE 3 END,
        CASE campo WHEN N'cci_rif' THEN 1 WHEN N'icedula' THEN 2 ELSE 3 END;

    SET @msg = (
        SELECT
            N'OK=' + CONVERT(NVARCHAR(10), SUM(CASE WHEN estado = N'OK' THEN 1 ELSE 0 END))
            + N' DISTINTO=' + CONVERT(NVARCHAR(10), SUM(CASE WHEN estado = N'DISTINTO' THEN 1 ELSE 0 END))
            + N' FALTA_EN_RMS=' + CONVERT(NVARCHAR(10), SUM(CASE WHEN estado = N'FALTA_EN_RMS' THEN 1 ELSE 0 END))
            + N' FALTA_EN_SIS=' + CONVERT(NVARCHAR(10), SUM(CASE WHEN estado = N'FALTA_EN_SIS' THEN 1 ELSE 0 END))
            + N' CONFLICTO=' + CONVERT(NVARCHAR(10), SUM(CASE WHEN estado = N'CONFLICTO' THEN 1 ELSE 0 END))
        FROM #informe
    );

    SET @pSuccess = 1;
    SET @pErrorMessage = @msg;
END;
GO
