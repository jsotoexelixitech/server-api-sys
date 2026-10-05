-- =============================================================================
-- Verificación previa a sp_emision_personas_general_nexus v2 y sp_genera_adpolrea_nexus v2
-- SOLO LECTURA: no modifica nada.
-- =============================================================================
SET NOCOUNT ON;

-- 1) Las fechas de cobro/pago deben aceptar NULL (recibo pendiente sin fechas).
--    Si alguna sale is_nullable = NO, no aplicar el cambio 4 tal cual.
SELECT TABLE_NAME, COLUMN_NAME, IS_NULLABLE, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE (TABLE_NAME = 'adrecibos' AND COLUMN_NAME IN ('fcobro', 'fpago', 'fpago_aseg'))
   OR (TABLE_NAME = 'adpolrea'  AND COLUMN_NAME IN ('fcobro', 'fpago_aseg'))
   OR (TABLE_NAME = 'TMEMISION_PERSONAS_GENERAL' AND COLUMN_NAME = 'cusuario')
ORDER BY TABLE_NAME, COLUMN_NAME;

-- 2) Otros objetos de la BD que llaman a estos SP (impacto del cambio).
SELECT OBJECT_NAME(m.object_id) AS objeto, o.type_desc
FROM sys.sql_modules m
INNER JOIN sys.objects o ON o.object_id = m.object_id
WHERE m.definition LIKE '%sp_emision_personas_general_nexus%'
   OR m.definition LIKE '%sp_genera_adpolrea_nexus%'
ORDER BY objeto;

-- 3) Recibos pendientes de personas emitidos por API con fecha de cobro (lo que corrige el v2).
SELECT TOP 20 cnpoliza, cnrecibo, cramo, cplan, iestadorec, fcobro, fpago, fpago_aseg, csucur, criesgo, cproductor, pcomision, cusuario, fingreso
FROM adrecibos
WHERE cprog = 'TEmision_Per_Ge' AND iestadorec = 'P' AND fcobro IS NOT NULL
ORDER BY fingreso DESC;

-- 4) Sucursal que tomaría el v2 para los canales y productores usados en emisiones por API.
SELECT 'canal' AS origen, c.ccanalalt AS codigo, c.xcanalalt AS nombre, c.csucur
FROM macanalalt c
WHERE c.ccanalalt IN (SELECT DISTINCT ccanalalt FROM adpoliza WHERE cprog = 'TEmision_Per_Ge' AND ccanalalt IS NOT NULL)
UNION ALL
SELECT 'productor', p.cproductor, NULL, p.csucur
FROM maproduc p
WHERE p.cproductor IN (SELECT DISTINCT cproductor FROM adpoliza WHERE cprog = 'TEmision_Per_Ge' AND ccanalalt IS NULL);

-- 5) Dato de configuración (no es del SP): cobertura 40 ramo 25 con ccoberturaint distinto
--    entre matarifa (lo usa adpoltar) y macoberturas (lo usa adpolcob).
SELECT 'matarifa' AS tabla, cramo, ccober AS ccobertura, ctarifa, ccoberturaint FROM matarifa WHERE cramo = 25 AND ccober IN ('38','39','40','41','42')
UNION ALL
SELECT 'macoberturas', cramo, ccobertura, NULL, ccoberturaint FROM macoberturas WHERE cramo = 25 AND ccobertura IN ('38','39','40','41','42')
ORDER BY ccobertura, tabla;
