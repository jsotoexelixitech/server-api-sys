/*
  Consulta por RAMO INTERNO (cramoint) en insramo.

  Modelo:
    insramo.cramoint  → ramo interno / padre  (ej. 22 = Personas)
    insramo.cramo     → ramo externo / hijo   (ej. 5, 6 asociados al 22)

  Planes:
    maplanes_per  → personas (viajero, funerario, salud, etc.)
    maplanes      → patrimoniales (RCV, incendio, vehículo, etc.)

  Uso:
    DECLARE @cramoint INT = 22;
    -- o sqlcmd: cambiar el valor en la línea DECLARE

  Ejemplos cramoint (validar en tu BD):
    10 → cramo 18, 26 (RCV / patrimonial)
    22 → cramo 5, 6  (personas / viajero)
    23 → cramo 9, 43, 45, 46
*/

SET NOCOUNT ON;

DECLARE @cramoint INT = 22;   -- ← RAMO INTERNO A CONSULTAR

/* ── 1. Ramos externos hijos del ramo interno ───────────────────────── */
SELECT
    i.cramoint,
    i.cramo,
    TRIM(r.xdescripcion_l)     AS xramo_externo,
    r.ctiporamo,
    TRIM(tr.xdescripcion_l)    AS xtipo_ramo,
    r.iestado                  AS iestado_ramo,
    i.cnaprsudpr,
    i.faprsudpr
FROM dbo.insramo i
INNER JOIN dbo.maramos r      ON r.cramo = i.cramo
LEFT  JOIN dbo.matiporamo tr  ON tr.ctiporamo = r.ctiporamo
WHERE i.cramoint = @cramoint
ORDER BY i.cramo;

/* ── 2. Planes PERSONAS (maplanes_per) de todos los cramo del interno ─ */
SELECT
    i.cramoint,
    i.cramo,
    TRIM(r.xdescripcion_l)     AS xramo_externo,
    'PERSONAS'                 AS tabla_planes,
    TRIM(p.cplan)              AS cplan,
    TRIM(p.xplan)              AS xplan,
    TRIM(p.cproducto)          AS cproducto,
    p.cmoneda,
    p.iestado,
    p.itarifa
FROM dbo.insramo i
INNER JOIN dbo.maramos r         ON r.cramo = i.cramo
INNER JOIN dbo.maplanes_per p    ON p.cramo = i.cramo AND p.iestado = 'V'
WHERE i.cramoint = @cramoint
ORDER BY i.cramo, p.cplan;

/* ── 3. Planes PATRIMONIALES (maplanes) de todos los cramo del interno ─ */
SELECT
    i.cramoint,
    i.cramo,
    TRIM(r.xdescripcion_l)     AS xramo_externo,
    'PATRIMONIAL'              AS tabla_planes,
    TRIM(p.cplan)              AS cplan,
    TRIM(p.xplan)              AS xplan,
    TRIM(p.cproducto)          AS cproducto,
    p.cmoneda,
    p.iestado,
    p.bnacional,
    p.ctipo                    AS ctipo_vehiculo
FROM dbo.insramo i
INNER JOIN dbo.maramos r      ON r.cramo = i.cramo
INNER JOIN dbo.maplanes p     ON p.cramo = i.cramo AND p.iestado = 'V'
WHERE i.cramoint = @cramoint
ORDER BY i.cramo, p.cplan;

/* ── 4. Vista unificada: interno → externo → plan ───────────────────── */
SELECT
    i.cramoint,
    i.cramo,
    TRIM(r.xdescripcion_l)     AS xramo_externo,
    'PER'                      AS origen,
    TRIM(p.cplan)              AS cplan,
    TRIM(p.xplan)              AS xplan,
    TRIM(p.cproducto)          AS cproducto
FROM dbo.insramo i
INNER JOIN dbo.maramos r       ON r.cramo = i.cramo
INNER JOIN dbo.maplanes_per p  ON p.cramo = i.cramo AND p.iestado = 'V'
WHERE i.cramoint = @cramoint

UNION ALL

SELECT
    i.cramoint,
    i.cramo,
    TRIM(r.xdescripcion_l),
    'PAT',
    TRIM(p.cplan),
    TRIM(p.xplan),
    TRIM(p.cproducto)
FROM dbo.insramo i
INNER JOIN dbo.maramos r   ON r.cramo = i.cramo
INNER JOIN dbo.maplanes p  ON p.cramo = i.cramo AND p.iestado = 'V'
WHERE i.cramoint = @cramoint

ORDER BY cramo, origen, cplan;

/* ── 5. Catálogo: todos los ramos internos y cuántos externos/planes ── */
SELECT
    i.cramoint,
    COUNT(DISTINCT i.cramo)                                              AS q_ramos_externos,
    STRING_AGG(CAST(i.cramo AS VARCHAR(10)), ', ')
        WITHIN GROUP (ORDER BY i.cramo)                                  AS cramos_externos,
    SUM(CASE WHEN mp.cplan IS NOT NULL THEN 1 ELSE 0 END)                AS q_planes_personas,
    SUM(CASE WHEN ml.cplan IS NOT NULL THEN 1 ELSE 0 END)                AS q_planes_patrimoniales
FROM dbo.insramo i
LEFT JOIN dbo.maplanes_per mp
    ON mp.cramo = i.cramo AND mp.iestado = 'V'
LEFT JOIN dbo.maplanes ml
    ON ml.cramo = i.cramo AND ml.iestado = 'V'
GROUP BY i.cramoint
ORDER BY i.cramoint;
