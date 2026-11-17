-- =============================================================================
-- Diagnóstico (solo lectura): pólizas RCV de Nexus emitidas desde marketplace/canal/:ccanalalt/:cscanalalt
-- con el gestor/subcanal equivocado.
--
-- Qué pasó: desde el 23-09-2026 (eb3ad62) resolveMarketplaceEntity, con centidad C, tomaba el último gestor
-- creado en el canal (TOP 1 magestor ORDER BY fingreso DESC) y sobrescribía cscanalalt. El subcanal del enlace
-- se perdía antes de grabar TMEMISION/adpoliza, así que el valor real no está en la BD (solo en el enlace).
--
-- Criterio de "sospechosa": póliza de Nexus RCV (cprog TEmision_Auto_RCV2, ctipocanal A), en un canal con más de
-- un subcanal, cuyo gestor era el más reciente del canal al momento de emitir. Es lo que habría puesto el error;
-- puede ser correcta si el enlace era justo de ese subcanal (no se distingue desde la BD).
-- =============================================================================
SET NOCOUNT ON;
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;

DECLARE @desde DATETIME = '2026-09-23';

WITH canales AS (
    SELECT ccanalalt, COUNT(DISTINCT cscanalalt) AS subcanales, COUNT(*) AS gestores
    FROM magestor
    WHERE ccanalalt IS NOT NULL
    GROUP BY ccanalalt
    HAVING COUNT(DISTINCT cscanalalt) > 1
),
pol AS (
    SELECT
        p.cnpoliza, p.cramo, p.fingreso, p.ccanalalt, p.cscanalalt, RTRIM(p.cgestor) AS cgestor,
        RTRIM(p.ifuente) AS ifuente, c.subcanales,
        CASE WHEN g.cgestor IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM magestor g2
                WHERE g2.ccanalalt = p.ccanalalt
                  AND g2.fingreso > g.fingreso
                  AND g2.fingreso <= p.fingreso
             ) THEN 1 ELSE 0 END AS sospechosa
    FROM adpoliza p WITH (NOLOCK)
    JOIN canales c ON c.ccanalalt = p.ccanalalt
    LEFT JOIN magestor g ON LTRIM(RTRIM(g.cgestor)) = LTRIM(RTRIM(p.cgestor)) AND g.ccanalalt = p.ccanalalt
    WHERE p.fingreso >= @desde
      AND RTRIM(p.cprog) = 'TEmision_Auto_RCV2'
      AND p.ctipocanal = 'A'
)
SELECT * INTO #pol FROM pol;

-- 1. Resumen por canal: pocas combinaciones de gestor para muchas pólizas indica el error
SELECT
    p.ccanalalt, RTRIM(ca.xcanalalt) AS canal, MAX(p.subcanales) AS subcanales_canal,
    COUNT(DISTINCT p.cnpoliza) AS polizas, COUNT(DISTINCT p.cgestor) AS gestores_distintos,
    SUM(CASE WHEN ISNULL(p.cgestor, '') = '' THEN 1 ELSE 0 END) AS sin_gestor,
    SUM(p.sospechosa) AS sospechosas, MIN(p.fingreso) AS primera, MAX(p.fingreso) AS ultima
FROM #pol p
LEFT JOIN macanalalt ca ON ca.ccanalalt = p.ccanalalt
GROUP BY p.ccanalalt, RTRIM(ca.xcanalalt)
ORDER BY sospechosas DESC, polizas DESC;

-- 2. Detalle de las sospechosas
SELECT p.ccanalalt, p.cscanalalt, p.cgestor, RTRIM(g.xgestor) AS gestor, p.cnpoliza, p.cramo, p.ifuente, p.fingreso
FROM #pol p
LEFT JOIN magestor g ON LTRIM(RTRIM(g.cgestor)) = p.cgestor
WHERE p.sospechosa = 1
ORDER BY p.ccanalalt, p.fingreso;

DROP TABLE #pol;
