-- =============================================================================
-- Profesión, ocupación y actividad económica en la emisión de personas
-- Fecha: 2026-10-30 · Ambiente: Sis2000 PRODUCCIÓN (mismo script aplicado en QA el 30-oct-2026)
--
-- Columnas opcionales (NULL) en las tablas de paso de personas:
--   TMEMISION_PERSONAS_GENERAL      → tomador y titular
--   TMEMISION_PERSONAS_GENERAL_ASEG → cada asegurado
-- Los INSERT actuales nombran sus columnas, así que siguen funcionando igual.
-- Se puede correr más de una vez.
-- =============================================================================
SET XACT_ABORT ON;
BEGIN TRAN;

IF COL_LENGTH('dbo.TMEMISION_PERSONAS_GENERAL', 'cprofesion_tomador') IS NULL
    ALTER TABLE dbo.TMEMISION_PERSONAS_GENERAL ADD cprofesion_tomador SMALLINT NULL;
IF COL_LENGTH('dbo.TMEMISION_PERSONAS_GENERAL', 'cocupacion_tomador') IS NULL
    ALTER TABLE dbo.TMEMISION_PERSONAS_GENERAL ADD cocupacion_tomador SMALLINT NULL;
IF COL_LENGTH('dbo.TMEMISION_PERSONAS_GENERAL', 'cactividad_tomador') IS NULL
    ALTER TABLE dbo.TMEMISION_PERSONAS_GENERAL ADD cactividad_tomador NUMERIC(18,0) NULL;
IF COL_LENGTH('dbo.TMEMISION_PERSONAS_GENERAL', 'cprofesion_titular') IS NULL
    ALTER TABLE dbo.TMEMISION_PERSONAS_GENERAL ADD cprofesion_titular SMALLINT NULL;
IF COL_LENGTH('dbo.TMEMISION_PERSONAS_GENERAL', 'cocupacion_titular') IS NULL
    ALTER TABLE dbo.TMEMISION_PERSONAS_GENERAL ADD cocupacion_titular SMALLINT NULL;
IF COL_LENGTH('dbo.TMEMISION_PERSONAS_GENERAL', 'cactividad_titular') IS NULL
    ALTER TABLE dbo.TMEMISION_PERSONAS_GENERAL ADD cactividad_titular NUMERIC(18,0) NULL;

IF COL_LENGTH('dbo.TMEMISION_PERSONAS_GENERAL_ASEG', 'cprofesion') IS NULL
    ALTER TABLE dbo.TMEMISION_PERSONAS_GENERAL_ASEG ADD cprofesion SMALLINT NULL;
IF COL_LENGTH('dbo.TMEMISION_PERSONAS_GENERAL_ASEG', 'cocupacion') IS NULL
    ALTER TABLE dbo.TMEMISION_PERSONAS_GENERAL_ASEG ADD cocupacion SMALLINT NULL;
IF COL_LENGTH('dbo.TMEMISION_PERSONAS_GENERAL_ASEG', 'cactividad') IS NULL
    ALTER TABLE dbo.TMEMISION_PERSONAS_GENERAL_ASEG ADD cactividad NUMERIC(18,0) NULL;

COMMIT;

SELECT t.name AS tabla, c.name AS columna, TYPE_NAME(c.user_type_id) AS tipo
FROM sys.columns c JOIN sys.tables t ON t.object_id = c.object_id
WHERE t.name IN ('TMEMISION_PERSONAS_GENERAL', 'TMEMISION_PERSONAS_GENERAL_ASEG')
  AND (c.name LIKE 'cprofesion%' OR c.name LIKE 'cocupacion%' OR c.name LIKE 'cactividad%')
ORDER BY t.name, c.name;
