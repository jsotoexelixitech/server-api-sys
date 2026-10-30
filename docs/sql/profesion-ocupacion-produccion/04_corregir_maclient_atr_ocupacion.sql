-- =============================================================================
-- Corrección de datos: profesiones inexistentes en el CORE (maclient_atr) grabadas por Nexus
--
-- Qué pasó: desde el 20-08-2026 sp_create_maclient_nexus grabó en maclient_atr.cprofesion códigos de
-- maocupac (ocupaciones), porque el campo "Profesión" de Nexus usa ese catálogo. maprofes solo tiene
-- 1 Administrador, 2 Contador y 3 Ingeniero, así que el reporte de legitimación de capitales muestra
-- profesiones que no existen (o, para el código 1, "Administrador" cuando el cliente es "Abogado").
--
-- Qué hace: mueve el código a cocupacion y deja cprofesion en 0 (valor del resto de clientes).
-- Filas afectadas: escritas por Nexus (cprog NULL), desde 2026-08-20, con cprofesion <> 0 y ocupación vacía.
--   Conteo al 29-10-2026: Producción 96 (86 con código > 3 y 10 con código 1). QA 62.
--   La columna ifuente del ticket (API, BRCV, OS_LMDS...) es la fuente original del cliente, no quien
--   escribió la profesión: el SP conserva la ifuente existente al actualizar.
--
-- Orden en producción (profesion-ocupacion-produccion/README.md):
--   - DESPUÉS de 03_sp_create_maclient_nexus.sql: sin él Nexus vuelve a grabarlo mal, y es el que marca
--     cprog = 'NEXUS'. Este script solo toca filas con cprog NULL, así que nunca mueve una profesión real
--     grabada por la versión nueva.
--   - ANTES de 05_maprofes_catalogo_OPCIONAL.sql: con el catálogo completo, los códigos de ocupación mal
--     grabados (p. ej. 29) pasan a parecer profesiones válidas y el paso 4 ya no los detecta.
-- Uso: correr con @aplicar = 0 (revisa y deshace); si el conteo es el esperado, correr con @aplicar = 1.
-- =============================================================================
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @aplicar BIT = 0;                      -- 0 = prueba (ROLLBACK), 1 = aplica (COMMIT)
DECLARE @desde DATETIME = '2026-08-20';        -- commit 37fe3b4: catálogo de ocupaciones en el campo profesión

BEGIN TRANSACTION;

-- 1. Respaldo de las filas que se van a tocar (en modo prueba también se deshace)
IF OBJECT_ID('dbo.bk_maclient_atr_profesion_20261029') IS NULL
    CREATE TABLE dbo.bk_maclient_atr_profesion_20261029 (
        cci_rif       NUMERIC(13, 0) NOT NULL PRIMARY KEY,
        cprofesion    SMALLINT NULL,
        cocupacion    SMALLINT NULL,
        cprog         CHAR(20) NULL,
        ifuente       CHAR(10) NULL,
        fingreso      DATETIME NULL,
        fultmod       DATETIME NULL,
        cusuariomod   NUMERIC(9, 0) NULL,
        ccategoriamod SMALLINT NULL,
        frespaldo     DATETIME NOT NULL DEFAULT GETDATE()
    );

INSERT INTO dbo.bk_maclient_atr_profesion_20261029
    (cci_rif, cprofesion, cocupacion, cprog, ifuente, fingreso, fultmod, cusuariomod, ccategoriamod)
SELECT a.cci_rif, a.cprofesion, a.cocupacion, a.cprog, a.ifuente, a.fingreso, a.fultmod, a.cusuariomod, a.ccategoriamod
FROM dbo.maclient_atr a
WHERE a.cprog IS NULL
  AND ISNULL(a.cprofesion, 0) <> 0
  AND ISNULL(a.cocupacion, 0) = 0
  AND COALESCE(a.fultmod, a.fingreso) >= @desde
  AND EXISTS (SELECT 1 FROM dbo.maocupac o WHERE o.cocupacion = a.cprofesion)
  AND NOT EXISTS (SELECT 1 FROM dbo.bk_maclient_atr_profesion_20261029 b WHERE b.cci_rif = a.cci_rif);

-- 2. Antes: por fuente y código (debe cuadrar con el ticket: API 78, OS_LMDS 4, Ventacards 2, BRCV 1,
--    SoliWebSys 1 en producción, más 10 con código 1)
SELECT RTRIM(b.ifuente) AS ifuente, b.cprofesion, RTRIM(o.xocupacion) AS ocupacion, COUNT(*) AS clientes
FROM dbo.bk_maclient_atr_profesion_20261029 b
LEFT JOIN dbo.maocupac o ON o.cocupacion = b.cprofesion
GROUP BY RTRIM(b.ifuente), b.cprofesion, RTRIM(o.xocupacion)
ORDER BY 1, 2;

-- 3. Corrección
UPDATE a SET
    a.cocupacion    = b.cprofesion,
    a.cprofesion    = 0,
    a.cprog         = 'FIX_PROFESION',
    a.fultmod       = GETDATE(),
    a.ccategoriamod = 1
FROM dbo.maclient_atr a
JOIN dbo.bk_maclient_atr_profesion_20261029 b ON b.cci_rif = a.cci_rif
WHERE a.cprofesion = b.cprofesion;

PRINT CONCAT('Filas corregidas: ', @@ROWCOUNT);

-- 4. Después: no debe quedar ninguna profesión fuera de maprofes escrita por Nexus
SELECT COUNT(*) AS profesiones_inexistentes_restantes
FROM dbo.maclient_atr a
WHERE ISNULL(a.cprofesion, 0) <> 0
  AND NOT EXISTS (SELECT 1 FROM dbo.maprofes p WHERE p.cprofesion = a.cprofesion);

IF @aplicar = 1
BEGIN
    COMMIT TRANSACTION;
    PRINT 'APLICADO';
END
ELSE
BEGIN
    ROLLBACK TRANSACTION;
    PRINT 'PRUEBA: cambios deshechos (incluido el respaldo). Para aplicar, @aplicar = 1.';
END;

-- =============================================================================
-- Reversa (solo si hace falta, después de aplicar):
--   UPDATE a SET a.cprofesion = b.cprofesion, a.cocupacion = b.cocupacion, a.cprog = b.cprog,
--                a.fultmod = b.fultmod, a.cusuariomod = b.cusuariomod, a.ccategoriamod = b.ccategoriamod
--   FROM dbo.maclient_atr a JOIN dbo.bk_maclient_atr_profesion_20261029 b ON b.cci_rif = a.cci_rif;
-- =============================================================================
