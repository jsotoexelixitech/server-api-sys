-- =============================================================================
-- Diagnóstico para cerrar el correo de revisión (póliza 25-27-27100015781)
-- SOLO LECTURA. Una fila por bloque, en JSON, para copiar todo de una vez.
-- =============================================================================
SET NOCOUNT ON;
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;

-- 1) Configuración de numeración por ramo (tabla del técnico).
-- 2) Formato real que genera Sis2000 (no API) en los ramos de personas: 3 últimas por ramo.
-- 3) Canales tradicionales activos (para la prueba que pidió el revisor).
-- 4) Usuarios con los que se emite en Sis2000 el último mes (candidatos a reemplazar el 7).
SELECT 'insramo' AS bloque,
  (SELECT * FROM insramo
   WHERE cramo IN (25, 9, 1, 5, 7, 45)
      OR cramo IN (SELECT DISTINCT cramo FROM adpoliza WHERE cprog = 'TEmision_Per_Ge')
   FOR JSON PATH, INCLUDE_NULL_VALUES) AS j
UNION ALL
SELECT 'formato_sis2000',
  (SELECT cramo, cnpoliza, cnrecibo, csucur, cprog, ifuente, cusuario, fingreso
   FROM (
     SELECT r.cramo, p.cnpoliza, r.cnrecibo, p.csucur, p.cprog, p.ifuente, p.cusuario, p.fingreso,
            ROW_NUMBER() OVER (PARTITION BY r.cramo ORDER BY p.fingreso DESC) AS rn
     FROM adpoliza p
     INNER JOIN adrecibos r ON r.cpoliza = p.cpoliza AND r.qcuotas = 1
     WHERE p.cramo IN (25, 9, 1, 5, 7, 45)
       AND ISNULL(p.cprog, '') NOT IN ('TEmision_Per_Ge', 'eePoliza_PerGe')
       AND p.fingreso >= DATEADD(MONTH, -12, GETDATE())
   ) x WHERE rn <= 3
   FOR JSON PATH, INCLUDE_NULL_VALUES)
UNION ALL
SELECT 'canales_tradicionales',
  (SELECT TOP 10 c.ccanalalt, c.xcanalalt, c.ctipocanal, c.csucur, c.cproductor,
          (SELECT TOP 1 g.cgestor FROM magestor g WHERE g.ccanalalt = c.ccanalalt AND g.bactivo = 1 ORDER BY g.fingreso) AS cgestor_raiz
   FROM macanalalt c
   WHERE c.ctipocanal = 'T' AND ISNULL(c.bactivo, 1) = 1
   ORDER BY c.ccanalalt
   FOR JSON PATH, INCLUDE_NULL_VALUES)
UNION ALL
SELECT 'usuarios_emision_sis2000',
  (SELECT TOP 15 p.cusuario, p.ccategoria, p.cprog, COUNT(*) AS polizas
   FROM adpoliza p
   WHERE p.fingreso >= DATEADD(MONTH, -1, GETDATE())
   GROUP BY p.cusuario, p.ccategoria, p.cprog
   ORDER BY COUNT(*) DESC
   FOR JSON PATH, INCLUDE_NULL_VALUES);
