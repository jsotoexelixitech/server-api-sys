-- Probar en Sis2000_DES (permisos completos). Combo de la conexión = Sis2000_DES.
-- Los triggers de TABLA no salen en la carpeta "Database triggers" (eso es DDL de BD).
-- Tras ejecutar: Tablas → adpoliza → Triggers → tr_adpoliza_sync_rms_nexus

USE [Sis2000_DES];
GO

-- Sis2000 SQL Server 2019.
-- El trigger NO llama HTTP (la DBA lo prohibió). Deja el evento en tabla.
-- La API (gateway RMS / nest drenar) lee PENDIENTE y avisa a RMS.
-- Publicar DBA. No ejecutar desde el agente.
--
-- Anti rebote: si cusuariomod = 999 (sync RMS→Sis) no encola de nuevo.

IF OBJECT_ID(N'dbo.sync_poliza_evento_rms_nexus', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.sync_poliza_evento_rms_nexus (
        id            INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
        cnpoliza      NVARCHAR(30)  NOT NULL,
        cpoliza       NUMERIC(19, 0) NULL,
        fanopol       INT           NULL,
        fmespol       INT           NULL,
        origen        NVARCHAR(20)  NOT NULL, -- ADPOLIZA | MACLIENT
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

IF OBJECT_ID(N'dbo.tr_adpoliza_sync_rms_nexus', N'TR') IS NOT NULL
    DROP TRIGGER dbo.tr_adpoliza_sync_rms_nexus;
GO

CREATE TRIGGER dbo.tr_adpoliza_sync_rms_nexus
ON dbo.adpoliza
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM inserted) RETURN;

    -- Solo personas / vigencia / estatus de póliza (no coberturas).
    IF TRIGGER_NESTLEVEL() > 1 RETURN;

    INSERT INTO dbo.sync_poliza_evento_rms_nexus (
        cnpoliza, cpoliza, fanopol, fmespol, origen, estado, payload_json
    )
    SELECT
        LTRIM(RTRIM(i.cnpoliza)),
        i.cpoliza,
        i.fanopol,
        i.fmespol,
        N'ADPOLIZA',
        N'PENDIENTE',
        (
            SELECT
                LTRIM(RTRIM(i.cnpoliza)) AS cnpoliza,
                i.cpoliza AS cpoliza,
                i.cramo AS cramo,
                i.fanopol AS fanopol,
                i.fmespol AS fmespol,
                i.iestado AS iestado,
                i.ctenedor AS ctenedor,
                i.casegurado AS casegurado,
                i.cbeneficiario AS cbeneficiario,
                CONVERT(varchar(10), i.fdesde, 23) AS fdesde,
                CONVERT(varchar(10), i.fhasta, 23) AS fhasta,
                i.cusuariomod AS cusuariomod
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        )
    FROM inserted i
    WHERE ISNULL(i.cusuariomod, 0) <> 999
      AND LTRIM(RTRIM(ISNULL(i.cnpoliza, N''))) <> N''
      AND (
            NOT EXISTS (SELECT 1 FROM deleted)
            OR UPDATE(ctenedor)
            OR UPDATE(casegurado)
            OR UPDATE(cbeneficiario)
            OR UPDATE(iestado)
            OR UPDATE(fdesde)
            OR UPDATE(fhasta)
            OR UPDATE(cnpoliza)
          )
      AND NOT EXISTS (
            SELECT 1
            FROM dbo.sync_poliza_evento_rms_nexus e
            WHERE e.estado = N'PENDIENTE'
              AND LTRIM(RTRIM(e.cnpoliza)) = LTRIM(RTRIM(i.cnpoliza))
              AND e.origen = N'ADPOLIZA'
        );
END;
GO

IF OBJECT_ID(N'dbo.tr_maclient_sync_rms_nexus', N'TR') IS NOT NULL
    DROP TRIGGER dbo.tr_maclient_sync_rms_nexus;
GO

CREATE TRIGGER dbo.tr_maclient_sync_rms_nexus
ON dbo.maclient
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM inserted) RETURN;
    IF TRIGGER_NESTLEVEL() > 1 RETURN;
    IF NOT (UPDATE(xcliente) OR UPDATE(xnombre) OR UPDATE(xapellido) OR UPDATE(cid) OR UPDATE(cci_rif))
        RETURN;

    INSERT INTO dbo.sync_poliza_evento_rms_nexus (
        cnpoliza, cpoliza, fanopol, fmespol, origen, estado, payload_json
    )
    SELECT
        LTRIM(RTRIM(p.cnpoliza)),
        p.cpoliza,
        p.fanopol,
        p.fmespol,
        N'MACLIENT',
        N'PENDIENTE',
        (
            SELECT
                LTRIM(RTRIM(p.cnpoliza)) AS cnpoliza,
                i.cci_rif AS cci_rif,
                LTRIM(RTRIM(i.cid)) AS cid,
                LTRIM(RTRIM(i.xcliente)) AS xcliente,
                LTRIM(RTRIM(i.xnombre)) AS xnombre,
                LTRIM(RTRIM(i.xapellido)) AS xapellido
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        )
    FROM inserted i
    INNER JOIN dbo.adpoliza p
        ON p.ctenedor = i.cci_rif
        OR p.casegurado = i.cci_rif
        OR p.cbeneficiario = i.cci_rif
    WHERE LTRIM(RTRIM(ISNULL(p.cnpoliza, N''))) <> N''
      AND NOT EXISTS (
            SELECT 1
            FROM dbo.sync_poliza_evento_rms_nexus e
            WHERE e.estado = N'PENDIENTE'
              AND LTRIM(RTRIM(e.cnpoliza)) = LTRIM(RTRIM(p.cnpoliza))
        );
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
    @estado         NVARCHAR(20), -- OK | ERROR | PENDIENTE
    @xerror         NVARCHAR(MAX) = NULL,
    @pSuccess       BIT = 0 OUTPUT,
    @pErrorMessage  NVARCHAR(MAX) = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    IF @id IS NULL OR ISNULL(@estado, N'') NOT IN (N'OK', N'ERROR', N'PENDIENTE')
    BEGIN
        SET @pSuccess = 0;
        SET @pErrorMessage = N'id y estado (OK|ERROR|PENDIENTE) son obligatorios.';
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
