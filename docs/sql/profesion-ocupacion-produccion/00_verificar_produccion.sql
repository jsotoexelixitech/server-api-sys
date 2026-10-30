-- =============================================================================
-- Profesión / ocupación (RCV y personas) · VERIFICACIÓN DE PRODUCCIÓN · solo lectura
-- Fecha: 2026-10-30
--
-- Correr ANTES de aplicar nada y enviar el resultado completo. Dice qué versión de cada SP hay,
-- qué parámetros ya existen y cómo está el catálogo de profesiones. No modifica nada.
-- =============================================================================
SET NOCOUNT ON;

SELECT @@SERVERNAME AS servidor, DB_NAME() AS base, GETDATE() AS fecha;

-- 1. SP que se tocan y fecha de su última modificación
SELECT name AS sp, create_date, modify_date
FROM sys.procedures
WHERE name IN ('sp_create_maclient_nexus', 'sp_pre_emision_automovil_rcv_nexus', 'sp_emision_automovil_rcv_nexus',
               'sp_pre_emision_personas_general_nexus', 'sp_emision_personas_general_nexus',
               'sp_get_profesiones_nexus', 'sp_get_ocupaciones_nexus', 'sp_get_actividades_nexus')
ORDER BY name;

-- 2. Parámetros de profesión, ocupación, actividad y país (los cambios dependen de ellos)
SELECT OBJECT_NAME(p.object_id) AS sp, p.parameter_id, p.name, TYPE_NAME(p.user_type_id) AS tipo
FROM sys.parameters p
WHERE OBJECT_NAME(p.object_id) IN ('sp_create_maclient_nexus', 'sp_pre_emision_automovil_rcv_nexus',
                                   'sp_emision_automovil_rcv_nexus', 'sp_pre_emision_personas_general_nexus')
  AND (p.name LIKE '%profes%' OR p.name LIKE '%ocupac%' OR p.name LIKE '%activi%' OR p.name LIKE '%cpais%'
       OR p.name LIKE '%diligencia%' OR p.name LIKE '%precargo%' OR p.name LIKE '%pdescuento%')
ORDER BY sp, p.parameter_id;

-- 3. Columnas que devuelven los catálogos (nest-api las lee por nombre)
SELECT OBJECT_NAME(o.object_id) AS sp, r.column_ordinal, r.name
FROM sys.procedures o
CROSS APPLY sys.dm_exec_describe_first_result_set_for_object(o.object_id, 0) r
WHERE o.name IN ('sp_get_ocupaciones_nexus', 'sp_get_actividades_nexus')
ORDER BY sp, r.column_ordinal;

-- 4. Columnas de las tablas de paso
SELECT t.name AS tabla, c.name AS columna
FROM sys.columns c JOIN sys.tables t ON t.object_id = c.object_id
WHERE t.name IN ('TMEMISION_AUTOMOVIL_RCV2', 'TMEMISION_PERSONAS_GENERAL', 'TMEMISION_PERSONAS_GENERAL_ASEG')
  AND (c.name LIKE '%profes%' OR c.name LIKE '%ocupac%' OR c.name LIKE '%activi%'
       OR c.name LIKE '%precargo%' OR c.name LIKE '%pdescuento%' OR c.name LIKE '%diligencia%')
ORDER BY tabla, columna;

-- 5. Catálogos
SELECT 'maprofes' AS catalogo, iestado, COUNT(*) AS filas FROM maprofes GROUP BY iestado
UNION ALL SELECT 'maocupac', iestado, COUNT(*) FROM maocupac GROUP BY iestado
UNION ALL SELECT 'maactivi', NULL, COUNT(*) FROM maactivi;
SELECT cprofesion, RTRIM(xprofesion) AS xprofesion, iestado FROM maprofes ORDER BY cprofesion;
SELECT cactividad, COUNT(*) AS repetidos FROM maactivi GROUP BY cactividad HAVING COUNT(*) > 1;

-- 6. Clientes con un código de ocupación en cprofesion (incidencia del 29-oct). Debe dar 0: ya se corrigió.
SELECT RTRIM(a.ifuente) AS ifuente, COUNT(*) AS clientes
FROM maclient_atr a
WHERE a.cprog IS NULL
  AND ISNULL(a.cprofesion, 0) <> 0
  AND ISNULL(a.cocupacion, 0) = 0
  AND COALESCE(a.fultmod, a.fingreso) >= '2026-08-20'
  AND EXISTS (SELECT 1 FROM maocupac o WHERE o.cocupacion = a.cprofesion)
GROUP BY RTRIM(a.ifuente)
ORDER BY clientes DESC;
