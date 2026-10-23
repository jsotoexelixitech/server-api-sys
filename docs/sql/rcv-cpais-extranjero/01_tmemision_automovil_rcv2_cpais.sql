-- =============================================================================
-- 01 — TMEMISION_AUTOMOVIL_RCV2: país de la dirección del tomador y del titular
-- RCV placa extranjera (dirección en Colombia, cpais 57). Columnas OPCIONALES (NULL):
-- las emisiones actuales no cambian. Ejecutar ANTES de 02 y 03.
-- Idempotente: se puede correr más de una vez.
-- =============================================================================
USE Sis2000;
GO
IF COL_LENGTH('dbo.TMEMISION_AUTOMOVIL_RCV2', 'cpais_tomador') IS NULL
    ALTER TABLE dbo.TMEMISION_AUTOMOVIL_RCV2 ADD cpais_tomador SMALLINT NULL;
GO
IF COL_LENGTH('dbo.TMEMISION_AUTOMOVIL_RCV2', 'cpais_titular') IS NULL
    ALTER TABLE dbo.TMEMISION_AUTOMOVIL_RCV2 ADD cpais_titular SMALLINT NULL;
GO
-- Verificación: deben salir 2 filas
SELECT name, TYPE_NAME(user_type_id) AS tipo, is_nullable
FROM sys.columns
WHERE object_id = OBJECT_ID('dbo.TMEMISION_AUTOMOVIL_RCV2') AND name IN ('cpais_tomador', 'cpais_titular');
GO
