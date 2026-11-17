-- 03R · Reversa de 03: deja las filas de los ramos 16/38 como estaban en PROD (desde bk_pase_condo_20261117_<tabla>).
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRAN;

-- maramos
IF OBJECT_ID('dbo.bk_pase_condo_20261117_maramos', 'U') IS NOT NULL
BEGIN
  DELETE t FROM dbo.[maramos] t WHERE t.cramo IN (16, 38);
  INSERT INTO dbo.[maramos] SELECT * FROM dbo.[bk_pase_condo_20261117_maramos];
  PRINT 'Repuesta maramos';
END

-- raramos
IF OBJECT_ID('dbo.bk_pase_condo_20261117_raramos', 'U') IS NOT NULL
BEGIN
  DELETE t FROM dbo.[raramos] t WHERE t.cramo IN (16, 38);
  INSERT INTO dbo.[raramos] SELECT * FROM dbo.[bk_pase_condo_20261117_raramos];
  PRINT 'Repuesta raramos';
END

-- insramo
IF OBJECT_ID('dbo.bk_pase_condo_20261117_insramo', 'U') IS NOT NULL
BEGIN
  DELETE t FROM dbo.[insramo] t WHERE t.cramo IN (16, 38);
  INSERT INTO dbo.[insramo] SELECT * FROM dbo.[bk_pase_condo_20261117_insramo];
  PRINT 'Repuesta insramo';
END

-- maproductos
IF OBJECT_ID('dbo.bk_pase_condo_20261117_maproductos', 'U') IS NOT NULL
BEGIN
  DELETE t FROM dbo.[maproductos] t WHERE t.cramo IN (16, 38);
  INSERT INTO dbo.[maproductos] SELECT * FROM dbo.[bk_pase_condo_20261117_maproductos];
  PRINT 'Repuesta maproductos';
END

-- macoberturas
IF OBJECT_ID('dbo.bk_pase_condo_20261117_macoberturas', 'U') IS NOT NULL
BEGIN
  DELETE t FROM dbo.[macoberturas] t WHERE t.cramo IN (16, 38);
  INSERT INTO dbo.[macoberturas] SELECT * FROM dbo.[bk_pase_condo_20261117_macoberturas];
  PRINT 'Repuesta macoberturas';
END

-- matarifa
IF OBJECT_ID('dbo.bk_pase_condo_20261117_matarifa', 'U') IS NOT NULL
BEGIN
  DELETE t FROM dbo.[matarifa] t WHERE t.cramo IN (16, 38);
  INSERT INTO dbo.[matarifa] SELECT * FROM dbo.[bk_pase_condo_20261117_matarifa];
  PRINT 'Repuesta matarifa';
END

-- matarifa_d
IF OBJECT_ID('dbo.bk_pase_condo_20261117_matarifa_d', 'U') IS NOT NULL
BEGIN
  DELETE t FROM dbo.[matarifa_d] t WHERE t.cramo IN (16, 38);
  INSERT INTO dbo.[matarifa_d] SELECT * FROM dbo.[bk_pase_condo_20261117_matarifa_d];
  PRINT 'Repuesta matarifa_d';
END

-- inscobint
IF OBJECT_ID('dbo.bk_pase_condo_20261117_inscobint', 'U') IS NOT NULL
BEGIN
  DELETE t FROM dbo.[inscobint] t WHERE EXISTS (SELECT 1 FROM dbo.macoberturas m WHERE m.cramo IN (16, 38) AND m.cramoint = t.cramoint AND m.ccoberturaint = t.ccoberturaint);
  INSERT INTO dbo.[inscobint] SELECT * FROM dbo.[bk_pase_condo_20261117_inscobint];
  PRINT 'Repuesta inscobint';
END

-- instarint
IF OBJECT_ID('dbo.bk_pase_condo_20261117_instarint', 'U') IS NOT NULL
BEGIN
  DELETE t FROM dbo.[instarint] t WHERE EXISTS (SELECT 1 FROM dbo.matarifa m WHERE m.cramo IN (16, 38) AND m.cramoint = t.cramoint AND m.ccoberturaint = t.ccoberturaint AND m.ctarifaint = t.ctarifaint);
  INSERT INTO dbo.[instarint] SELECT * FROM dbo.[bk_pase_condo_20261117_instarint];
  PRINT 'Repuesta instarint';
END

-- maplanes
IF OBJECT_ID('dbo.bk_pase_condo_20261117_maplanes', 'U') IS NOT NULL
BEGIN
  DELETE t FROM dbo.[maplanes] t WHERE t.cramo IN (16, 38);
  INSERT INTO dbo.[maplanes] SELECT * FROM dbo.[bk_pase_condo_20261117_maplanes];
  PRINT 'Repuesta maplanes';
END

-- maplanes_frec
IF OBJECT_ID('dbo.bk_pase_condo_20261117_maplanes_frec', 'U') IS NOT NULL
BEGIN
  DELETE t FROM dbo.[maplanes_frec] t WHERE t.cramo IN (16, 38);
  INSERT INTO dbo.[maplanes_frec] SELECT * FROM dbo.[bk_pase_condo_20261117_maplanes_frec];
  PRINT 'Repuesta maplanes_frec';
END

-- mausuplan
IF OBJECT_ID('dbo.bk_pase_condo_20261117_mausuplan', 'U') IS NOT NULL
BEGIN
  DELETE t FROM dbo.[mausuplan] t WHERE t.cramo IN (16, 38);
  INSERT INTO dbo.[mausuplan] SELECT * FROM dbo.[bk_pase_condo_20261117_mausuplan];
  PRINT 'Repuesta mausuplan';
END

-- maplancob
IF OBJECT_ID('dbo.bk_pase_condo_20261117_maplancob', 'U') IS NOT NULL
BEGIN
  DELETE t FROM dbo.[maplancob] t WHERE t.cramo IN (16, 38);
  INSERT INTO dbo.[maplancob] SELECT * FROM dbo.[bk_pase_condo_20261117_maplancob];
  PRINT 'Repuesta maplancob';
END

-- maplantar
IF OBJECT_ID('dbo.bk_pase_condo_20261117_maplantar', 'U') IS NOT NULL
BEGIN
  DELETE t FROM dbo.[maplantar] t WHERE t.cramo IN (16, 38);
  INSERT INTO dbo.[maplantar] SELECT * FROM dbo.[bk_pase_condo_20261117_maplantar];
  PRINT 'Repuesta maplantar';
END

-- madisseg
IF OBJECT_ID('dbo.bk_pase_condo_20261117_madisseg', 'U') IS NOT NULL
BEGIN
  DELETE t FROM dbo.[madisseg] t WHERE t.cramo IN (16, 38);
  INSERT INTO dbo.[madisseg] SELECT * FROM dbo.[bk_pase_condo_20261117_madisseg];
  PRINT 'Repuesta madisseg';
END

-- masustac
IF OBJECT_ID('dbo.bk_pase_condo_20261117_masustac', 'U') IS NOT NULL
BEGIN
  DELETE t FROM dbo.[masustac] t WHERE t.cramo IN (16, 38);
  INSERT INTO dbo.[masustac] SELECT * FROM dbo.[bk_pase_condo_20261117_masustac];
  PRINT 'Repuesta masustac';
END

-- madetaincentivos
IF OBJECT_ID('dbo.bk_pase_condo_20261117_madetaincentivos', 'U') IS NOT NULL
BEGIN
  DELETE t FROM dbo.[madetaincentivos] t WHERE t.cramo IN (16, 38);
  INSERT INTO dbo.[madetaincentivos] SELECT * FROM dbo.[bk_pase_condo_20261117_madetaincentivos];
  PRINT 'Repuesta madetaincentivos';
END

-- maarancel
IF OBJECT_ID('dbo.bk_pase_condo_20261117_maarancel', 'U') IS NOT NULL
BEGIN
  DELETE t FROM dbo.[maarancel] t WHERE t.cramo IN (16, 38);
  INSERT INTO dbo.[maarancel] SELECT * FROM dbo.[bk_pase_condo_20261117_maarancel];
  PRINT 'Repuesta maarancel';
END

-- mabonos
IF OBJECT_ID('dbo.bk_pase_condo_20261117_mabonos', 'U') IS NOT NULL
BEGIN
  DELETE t FROM dbo.[mabonos] t WHERE t.cramo IN (16, 38);
  INSERT INTO dbo.[mabonos] SELECT * FROM dbo.[bk_pase_condo_20261117_mabonos];
  PRINT 'Repuesta mabonos';
END

-- magastosramo
IF OBJECT_ID('dbo.bk_pase_condo_20261117_magastosramo', 'U') IS NOT NULL
BEGIN
  DELETE t FROM dbo.[magastosramo] t WHERE t.cramo IN (16, 38);
  INSERT INTO dbo.[magastosramo] SELECT * FROM dbo.[bk_pase_condo_20261117_magastosramo];
  PRINT 'Repuesta magastosramo';
END

-- macausasin
IF OBJECT_ID('dbo.bk_pase_condo_20261117_macausasin', 'U') IS NOT NULL
BEGIN
  DELETE t FROM dbo.[macausasin] t WHERE t.cramo IN (16, 38);
  INSERT INTO dbo.[macausasin] SELECT * FROM dbo.[bk_pase_condo_20261117_macausasin];
  PRINT 'Repuesta macausasin';
END

-- macauscob
IF OBJECT_ID('dbo.bk_pase_condo_20261117_macauscob', 'U') IS NOT NULL
BEGIN
  DELETE t FROM dbo.[macauscob] t WHERE t.cramo IN (16, 38);
  INSERT INTO dbo.[macauscob] SELECT * FROM dbo.[bk_pase_condo_20261117_macauscob];
  PRINT 'Repuesta macauscob';
END

-- MATARIFA_ANTIGUEDAD_NEXUS
IF OBJECT_ID('dbo.bk_pase_condo_20261117_MATARIFA_ANTIGUEDAD_NEXUS', 'U') IS NOT NULL
BEGIN
  DELETE t FROM dbo.[MATARIFA_ANTIGUEDAD_NEXUS] t WHERE t.cramo IN (16, 38);
  INSERT INTO dbo.[MATARIFA_ANTIGUEDAD_NEXUS] SELECT * FROM dbo.[bk_pase_condo_20261117_MATARIFA_ANTIGUEDAD_NEXUS];
  PRINT 'Repuesta MATARIFA_ANTIGUEDAD_NEXUS';
END

-- MATARIFA_RANGO_NEXUS
IF OBJECT_ID('dbo.bk_pase_condo_20261117_MATARIFA_RANGO_NEXUS', 'U') IS NOT NULL
BEGIN
  DELETE t FROM dbo.[MATARIFA_RANGO_NEXUS] t WHERE t.cramo IN (16, 38);
  INSERT INTO dbo.[MATARIFA_RANGO_NEXUS] SELECT * FROM dbo.[bk_pase_condo_20261117_MATARIFA_RANGO_NEXUS];
  PRINT 'Repuesta MATARIFA_RANGO_NEXUS';
END

-- MATARIFA_REPARTO_NEXUS
IF OBJECT_ID('dbo.bk_pase_condo_20261117_MATARIFA_REPARTO_NEXUS', 'U') IS NOT NULL
BEGIN
  DELETE t FROM dbo.[MATARIFA_REPARTO_NEXUS] t WHERE t.cramo IN (16, 38);
  INSERT INTO dbo.[MATARIFA_REPARTO_NEXUS] SELECT * FROM dbo.[bk_pase_condo_20261117_MATARIFA_REPARTO_NEXUS];
  PRINT 'Repuesta MATARIFA_REPARTO_NEXUS';
END

COMMIT;
PRINT 'Fin 03R';
