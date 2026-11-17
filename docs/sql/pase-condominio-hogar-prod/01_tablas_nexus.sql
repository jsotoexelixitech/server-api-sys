-- 01 · Tablas Nexus de Condominio y Hogar (estructura de QA .80). Idempotente: crea la tabla si falta y agrega columnas faltantes.
-- Base: Sis2000 (PROD). Sin datos (los datos van en 03).
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRAN;

IF OBJECT_ID('dbo.MATARIFA_ANTIGUEDAD_NEXUS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.[MATARIFA_ANTIGUEDAD_NEXUS] (
    [cramo] smallint NOT NULL,
    [iuso] char(1) NOT NULL,
    [itramo] tinyint NOT NULL,
    [pprima] numeric(9,6) NOT NULL,
    [fultmod] datetime NULL,
    [cusuariomod] numeric(18,0) NULL,
    CONSTRAINT [PK_MATARIFA_ANTIGUEDAD_NEXUS] PRIMARY KEY ([cramo], [iuso], [itramo])
  );
  PRINT 'Creada dbo.MATARIFA_ANTIGUEDAD_NEXUS';
END
IF COL_LENGTH('dbo.MATARIFA_ANTIGUEDAD_NEXUS', 'cramo') IS NULL BEGIN ALTER TABLE dbo.[MATARIFA_ANTIGUEDAD_NEXUS] ADD [cramo] smallint NULL; PRINT 'Agregada MATARIFA_ANTIGUEDAD_NEXUS.cramo'; END
IF COL_LENGTH('dbo.MATARIFA_ANTIGUEDAD_NEXUS', 'iuso') IS NULL BEGIN ALTER TABLE dbo.[MATARIFA_ANTIGUEDAD_NEXUS] ADD [iuso] char(1) NULL; PRINT 'Agregada MATARIFA_ANTIGUEDAD_NEXUS.iuso'; END
IF COL_LENGTH('dbo.MATARIFA_ANTIGUEDAD_NEXUS', 'itramo') IS NULL BEGIN ALTER TABLE dbo.[MATARIFA_ANTIGUEDAD_NEXUS] ADD [itramo] tinyint NULL; PRINT 'Agregada MATARIFA_ANTIGUEDAD_NEXUS.itramo'; END
IF COL_LENGTH('dbo.MATARIFA_ANTIGUEDAD_NEXUS', 'pprima') IS NULL BEGIN ALTER TABLE dbo.[MATARIFA_ANTIGUEDAD_NEXUS] ADD [pprima] numeric(9,6) NULL; PRINT 'Agregada MATARIFA_ANTIGUEDAD_NEXUS.pprima'; END
IF COL_LENGTH('dbo.MATARIFA_ANTIGUEDAD_NEXUS', 'fultmod') IS NULL BEGIN ALTER TABLE dbo.[MATARIFA_ANTIGUEDAD_NEXUS] ADD [fultmod] datetime NULL; PRINT 'Agregada MATARIFA_ANTIGUEDAD_NEXUS.fultmod'; END
IF COL_LENGTH('dbo.MATARIFA_ANTIGUEDAD_NEXUS', 'cusuariomod') IS NULL BEGIN ALTER TABLE dbo.[MATARIFA_ANTIGUEDAD_NEXUS] ADD [cusuariomod] numeric(18,0) NULL; PRINT 'Agregada MATARIFA_ANTIGUEDAD_NEXUS.cusuariomod'; END
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_MATARIFA_ANTIGUEDAD_NEXUS_USO') ALTER TABLE dbo.[MATARIFA_ANTIGUEDAD_NEXUS] WITH CHECK ADD CONSTRAINT [CK_MATARIFA_ANTIGUEDAD_NEXUS_USO] CHECK ([iuso]='C' OR [iuso]='R');
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_MATARIFA_ANTIGUEDAD_NEXUS_TRAMO') ALTER TABLE dbo.[MATARIFA_ANTIGUEDAD_NEXUS] WITH CHECK ADD CONSTRAINT [CK_MATARIFA_ANTIGUEDAD_NEXUS_TRAMO] CHECK ([itramo]>=(1) AND [itramo]<=(4));

IF OBJECT_ID('dbo.MATARIFA_RANGO_NEXUS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.[MATARIFA_RANGO_NEXUS] (
    [cramo] smallint NOT NULL,
    [ccober] char(4) NOT NULL,
    [ctarifa] char(4) NOT NULL,
    [ptasa_min] numeric(9,6) NOT NULL,
    [ptasa_max] numeric(9,6) NOT NULL,
    [fultmod] datetime NULL,
    [cusuariomod] numeric(18,0) NULL,
    CONSTRAINT [PK_MATARIFA_RANGO_NEXUS] PRIMARY KEY ([cramo], [ccober], [ctarifa])
  );
  PRINT 'Creada dbo.MATARIFA_RANGO_NEXUS';
END
IF COL_LENGTH('dbo.MATARIFA_RANGO_NEXUS', 'cramo') IS NULL BEGIN ALTER TABLE dbo.[MATARIFA_RANGO_NEXUS] ADD [cramo] smallint NULL; PRINT 'Agregada MATARIFA_RANGO_NEXUS.cramo'; END
IF COL_LENGTH('dbo.MATARIFA_RANGO_NEXUS', 'ccober') IS NULL BEGIN ALTER TABLE dbo.[MATARIFA_RANGO_NEXUS] ADD [ccober] char(4) NULL; PRINT 'Agregada MATARIFA_RANGO_NEXUS.ccober'; END
IF COL_LENGTH('dbo.MATARIFA_RANGO_NEXUS', 'ctarifa') IS NULL BEGIN ALTER TABLE dbo.[MATARIFA_RANGO_NEXUS] ADD [ctarifa] char(4) NULL; PRINT 'Agregada MATARIFA_RANGO_NEXUS.ctarifa'; END
IF COL_LENGTH('dbo.MATARIFA_RANGO_NEXUS', 'ptasa_min') IS NULL BEGIN ALTER TABLE dbo.[MATARIFA_RANGO_NEXUS] ADD [ptasa_min] numeric(9,6) NULL; PRINT 'Agregada MATARIFA_RANGO_NEXUS.ptasa_min'; END
IF COL_LENGTH('dbo.MATARIFA_RANGO_NEXUS', 'ptasa_max') IS NULL BEGIN ALTER TABLE dbo.[MATARIFA_RANGO_NEXUS] ADD [ptasa_max] numeric(9,6) NULL; PRINT 'Agregada MATARIFA_RANGO_NEXUS.ptasa_max'; END
IF COL_LENGTH('dbo.MATARIFA_RANGO_NEXUS', 'fultmod') IS NULL BEGIN ALTER TABLE dbo.[MATARIFA_RANGO_NEXUS] ADD [fultmod] datetime NULL; PRINT 'Agregada MATARIFA_RANGO_NEXUS.fultmod'; END
IF COL_LENGTH('dbo.MATARIFA_RANGO_NEXUS', 'cusuariomod') IS NULL BEGIN ALTER TABLE dbo.[MATARIFA_RANGO_NEXUS] ADD [cusuariomod] numeric(18,0) NULL; PRINT 'Agregada MATARIFA_RANGO_NEXUS.cusuariomod'; END
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_MATARIFA_RANGO_NEXUS_ORDEN') ALTER TABLE dbo.[MATARIFA_RANGO_NEXUS] WITH CHECK ADD CONSTRAINT [CK_MATARIFA_RANGO_NEXUS_ORDEN] CHECK ([ptasa_min]>=(0) AND [ptasa_min]<[ptasa_max] AND [ptasa_max]<=(100));

IF OBJECT_ID('dbo.MATARIFA_REPARTO_NEXUS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.[MATARIFA_REPARTO_NEXUS] (
    [cramo] smallint NOT NULL,
    [ccober] varchar(4) NOT NULL,
    [ctarifa] varchar(4) NOT NULL,
    [itipo] char(1) NOT NULL,
    [pvalor] numeric(14,6) NOT NULL,
    [fultmod] datetime NULL,
    [cusuariomod] numeric(18,0) NULL,
    [iopcional] bit NOT NULL CONSTRAINT [DF_MATARIFA_REPARTO_NEXUS_OPCIONAL] DEFAULT ((0)),
    [plimite] numeric(9,4) NULL,
    CONSTRAINT [PK_MATARIFA_REPARTO_NEXUS] PRIMARY KEY ([cramo], [ccober], [ctarifa])
  );
  PRINT 'Creada dbo.MATARIFA_REPARTO_NEXUS';
END
IF COL_LENGTH('dbo.MATARIFA_REPARTO_NEXUS', 'cramo') IS NULL BEGIN ALTER TABLE dbo.[MATARIFA_REPARTO_NEXUS] ADD [cramo] smallint NULL; PRINT 'Agregada MATARIFA_REPARTO_NEXUS.cramo'; END
IF COL_LENGTH('dbo.MATARIFA_REPARTO_NEXUS', 'ccober') IS NULL BEGIN ALTER TABLE dbo.[MATARIFA_REPARTO_NEXUS] ADD [ccober] varchar(4) NULL; PRINT 'Agregada MATARIFA_REPARTO_NEXUS.ccober'; END
IF COL_LENGTH('dbo.MATARIFA_REPARTO_NEXUS', 'ctarifa') IS NULL BEGIN ALTER TABLE dbo.[MATARIFA_REPARTO_NEXUS] ADD [ctarifa] varchar(4) NULL; PRINT 'Agregada MATARIFA_REPARTO_NEXUS.ctarifa'; END
IF COL_LENGTH('dbo.MATARIFA_REPARTO_NEXUS', 'itipo') IS NULL BEGIN ALTER TABLE dbo.[MATARIFA_REPARTO_NEXUS] ADD [itipo] char(1) NULL; PRINT 'Agregada MATARIFA_REPARTO_NEXUS.itipo'; END
IF COL_LENGTH('dbo.MATARIFA_REPARTO_NEXUS', 'pvalor') IS NULL BEGIN ALTER TABLE dbo.[MATARIFA_REPARTO_NEXUS] ADD [pvalor] numeric(14,6) NULL; PRINT 'Agregada MATARIFA_REPARTO_NEXUS.pvalor'; END
IF COL_LENGTH('dbo.MATARIFA_REPARTO_NEXUS', 'fultmod') IS NULL BEGIN ALTER TABLE dbo.[MATARIFA_REPARTO_NEXUS] ADD [fultmod] datetime NULL; PRINT 'Agregada MATARIFA_REPARTO_NEXUS.fultmod'; END
IF COL_LENGTH('dbo.MATARIFA_REPARTO_NEXUS', 'cusuariomod') IS NULL BEGIN ALTER TABLE dbo.[MATARIFA_REPARTO_NEXUS] ADD [cusuariomod] numeric(18,0) NULL; PRINT 'Agregada MATARIFA_REPARTO_NEXUS.cusuariomod'; END
IF COL_LENGTH('dbo.MATARIFA_REPARTO_NEXUS', 'iopcional') IS NULL BEGIN ALTER TABLE dbo.[MATARIFA_REPARTO_NEXUS] ADD [iopcional] bit NOT NULL CONSTRAINT [DF_MATARIFA_REPARTO_NEXUS_OPCIONAL] DEFAULT ((0)); PRINT 'Agregada MATARIFA_REPARTO_NEXUS.iopcional'; END
IF COL_LENGTH('dbo.MATARIFA_REPARTO_NEXUS', 'plimite') IS NULL BEGIN ALTER TABLE dbo.[MATARIFA_REPARTO_NEXUS] ADD [plimite] numeric(9,4) NULL; PRINT 'Agregada MATARIFA_REPARTO_NEXUS.plimite'; END
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_MATARIFA_REPARTO_NEXUS_TIPO') ALTER TABLE dbo.[MATARIFA_REPARTO_NEXUS] WITH CHECK ADD CONSTRAINT [CK_MATARIFA_REPARTO_NEXUS_TIPO] CHECK ([itipo]='M' OR [itipo]='P' OR [itipo]='F');
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_MATARIFA_REPARTO_NEXUS_LIMITE') ALTER TABLE dbo.[MATARIFA_REPARTO_NEXUS] WITH CHECK ADD CONSTRAINT [CK_MATARIFA_REPARTO_NEXUS_LIMITE] CHECK ([plimite] IS NULL OR [plimite]>(0) AND [plimite]<=(100));

IF OBJECT_ID('dbo.TMEMISION_CONDOMINIO_COB_NEXUS', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.[TMEMISION_CONDOMINIO_COB_NEXUS] (
    [id] int IDENTITY(1,1) NOT NULL,
    [id_condominio] int NOT NULL,
    [ccober] char(4) NOT NULL,
    [ctarifa] char(4) NOT NULL,
    [msumaasegext] numeric(18,2) NOT NULL,
    [mprimabrutaext] numeric(18,2) NOT NULL,
    [mdescuentoext] numeric(18,2) NOT NULL CONSTRAINT [DF__TMEMISION__mdesc__2DF355BE] DEFAULT ((0)),
    [mrecargoext] numeric(18,2) NOT NULL CONSTRAINT [DF__TMEMISION__mreca__2EE779F7] DEFAULT ((0)),
    [mprimaext] numeric(18,2) NOT NULL,
    [pcomision] numeric(13,6) NOT NULL CONSTRAINT [DF__TMEMISION__pcomi__2FDB9E30] DEFAULT ((0)),
    [mcomisionext] numeric(18,2) NOT NULL CONSTRAINT [DF__TMEMISION__mcomi__30CFC269] DEFAULT ((0)),
    [fingreso] datetime NOT NULL CONSTRAINT [DF__TMEMISION__fingr__31C3E6A2] DEFAULT (getdate()),
    CONSTRAINT [PK__TMEMISIO__3213E83F499BA82B] PRIMARY KEY ([id])
  );
  PRINT 'Creada dbo.TMEMISION_CONDOMINIO_COB_NEXUS';
END
IF COL_LENGTH('dbo.TMEMISION_CONDOMINIO_COB_NEXUS', 'id_condominio') IS NULL BEGIN ALTER TABLE dbo.[TMEMISION_CONDOMINIO_COB_NEXUS] ADD [id_condominio] int NULL; PRINT 'Agregada TMEMISION_CONDOMINIO_COB_NEXUS.id_condominio'; END
IF COL_LENGTH('dbo.TMEMISION_CONDOMINIO_COB_NEXUS', 'ccober') IS NULL BEGIN ALTER TABLE dbo.[TMEMISION_CONDOMINIO_COB_NEXUS] ADD [ccober] char(4) NULL; PRINT 'Agregada TMEMISION_CONDOMINIO_COB_NEXUS.ccober'; END
IF COL_LENGTH('dbo.TMEMISION_CONDOMINIO_COB_NEXUS', 'ctarifa') IS NULL BEGIN ALTER TABLE dbo.[TMEMISION_CONDOMINIO_COB_NEXUS] ADD [ctarifa] char(4) NULL; PRINT 'Agregada TMEMISION_CONDOMINIO_COB_NEXUS.ctarifa'; END
IF COL_LENGTH('dbo.TMEMISION_CONDOMINIO_COB_NEXUS', 'msumaasegext') IS NULL BEGIN ALTER TABLE dbo.[TMEMISION_CONDOMINIO_COB_NEXUS] ADD [msumaasegext] numeric(18,2) NULL; PRINT 'Agregada TMEMISION_CONDOMINIO_COB_NEXUS.msumaasegext'; END
IF COL_LENGTH('dbo.TMEMISION_CONDOMINIO_COB_NEXUS', 'mprimabrutaext') IS NULL BEGIN ALTER TABLE dbo.[TMEMISION_CONDOMINIO_COB_NEXUS] ADD [mprimabrutaext] numeric(18,2) NULL; PRINT 'Agregada TMEMISION_CONDOMINIO_COB_NEXUS.mprimabrutaext'; END
IF COL_LENGTH('dbo.TMEMISION_CONDOMINIO_COB_NEXUS', 'mdescuentoext') IS NULL BEGIN ALTER TABLE dbo.[TMEMISION_CONDOMINIO_COB_NEXUS] ADD [mdescuentoext] numeric(18,2) NOT NULL CONSTRAINT [DF__TMEMISION__mdesc__2DF355BE] DEFAULT ((0)); PRINT 'Agregada TMEMISION_CONDOMINIO_COB_NEXUS.mdescuentoext'; END
IF COL_LENGTH('dbo.TMEMISION_CONDOMINIO_COB_NEXUS', 'mrecargoext') IS NULL BEGIN ALTER TABLE dbo.[TMEMISION_CONDOMINIO_COB_NEXUS] ADD [mrecargoext] numeric(18,2) NOT NULL CONSTRAINT [DF__TMEMISION__mreca__2EE779F7] DEFAULT ((0)); PRINT 'Agregada TMEMISION_CONDOMINIO_COB_NEXUS.mrecargoext'; END
IF COL_LENGTH('dbo.TMEMISION_CONDOMINIO_COB_NEXUS', 'mprimaext') IS NULL BEGIN ALTER TABLE dbo.[TMEMISION_CONDOMINIO_COB_NEXUS] ADD [mprimaext] numeric(18,2) NULL; PRINT 'Agregada TMEMISION_CONDOMINIO_COB_NEXUS.mprimaext'; END
IF COL_LENGTH('dbo.TMEMISION_CONDOMINIO_COB_NEXUS', 'pcomision') IS NULL BEGIN ALTER TABLE dbo.[TMEMISION_CONDOMINIO_COB_NEXUS] ADD [pcomision] numeric(13,6) NOT NULL CONSTRAINT [DF__TMEMISION__pcomi__2FDB9E30] DEFAULT ((0)); PRINT 'Agregada TMEMISION_CONDOMINIO_COB_NEXUS.pcomision'; END
IF COL_LENGTH('dbo.TMEMISION_CONDOMINIO_COB_NEXUS', 'mcomisionext') IS NULL BEGIN ALTER TABLE dbo.[TMEMISION_CONDOMINIO_COB_NEXUS] ADD [mcomisionext] numeric(18,2) NOT NULL CONSTRAINT [DF__TMEMISION__mcomi__30CFC269] DEFAULT ((0)); PRINT 'Agregada TMEMISION_CONDOMINIO_COB_NEXUS.mcomisionext'; END
IF COL_LENGTH('dbo.TMEMISION_CONDOMINIO_COB_NEXUS', 'fingreso') IS NULL BEGIN ALTER TABLE dbo.[TMEMISION_CONDOMINIO_COB_NEXUS] ADD [fingreso] datetime NOT NULL CONSTRAINT [DF__TMEMISION__fingr__31C3E6A2] DEFAULT (getdate()); PRINT 'Agregada TMEMISION_CONDOMINIO_COB_NEXUS.fingreso'; END
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.TMEMISION_CONDOMINIO_COB_NEXUS') AND name = 'IX_TMEMISION_CONDOMINIO_COB_NEXUS_id') CREATE NONCLUSTERED INDEX [IX_TMEMISION_CONDOMINIO_COB_NEXUS_id] ON dbo.[TMEMISION_CONDOMINIO_COB_NEXUS] ([id_condominio]);

-- Descuento por rango de suma asegurada (Core #177). En QA no existe: sin la tabla el Core no aplica descuentos.
-- Se crea vacía para que el panel pueda cargar tramos; sin tramos no cambia ninguna prima.
-- Condominio (ramo 16) y Hogar Blindado (ramo 38): descuento por rango de suma asegurada.
--
-- Técnica configura los tramos en el panel; el portal y el Core aplican el mismo % sobre la prima bruta de cada cobertura,
-- sumado al descuento por dispositivos de seguridad (madisseg). La emisión no cambia: el descuento ya viaja por cobertura
-- en la cotización preestablecida y sp_emision_condominio_nexus lo graba en adpoltar.mdescuento/mdescuentoext.
--
-- Un tramo cubre msuma_desde <= suma < msuma_hasta (msuma_hasta NULL = sin tope). Montos en US$, % sobre la prima bruta.
-- Sin filas para un ramo no hay descuento por suma.
-- Idempotente: solo crea la tabla si no existe; no carga tramos (los define Técnica).

SET NOCOUNT ON;

IF OBJECT_ID('dbo.MATARIFA_DESCUENTO_SUMA_NEXUS', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.MATARIFA_DESCUENTO_SUMA_NEXUS (
        cramo       SMALLINT       NOT NULL,
        msuma_desde NUMERIC(18, 2) NOT NULL,
        msuma_hasta NUMERIC(18, 2) NULL,
        pdescuento  NUMERIC(9, 4)  NOT NULL,
        fultmod     DATETIME       NULL,
        cusuariomod NUMERIC(18, 0) NULL,
        CONSTRAINT PK_MATARIFA_DESCUENTO_SUMA_NEXUS PRIMARY KEY (cramo, msuma_desde),
        CONSTRAINT CK_MATARIFA_DESCUENTO_SUMA_NEXUS_RAMO CHECK (cramo IN (16, 38)),
        CONSTRAINT CK_MATARIFA_DESCUENTO_SUMA_NEXUS_RANGO CHECK (msuma_desde >= 0 AND (msuma_hasta IS NULL OR msuma_hasta > msuma_desde)),
        CONSTRAINT CK_MATARIFA_DESCUENTO_SUMA_NEXUS_PCT CHECK (pdescuento >= 0 AND pdescuento < 100)
    );
END;

-- Verificación
SELECT cramo, msuma_desde, msuma_hasta, pdescuento, fultmod, cusuariomod
FROM dbo.MATARIFA_DESCUENTO_SUMA_NEXUS
ORDER BY cramo, msuma_desde;

COMMIT;
PRINT 'Fin 01';
