/*
  Script de prueba — ramos internos (insramoint) → externos (insramo) → planes
  Ejecutar en Sis2000 (DBeaver / SSMS / sqlcmd)

  Cambiar solo @cramoint:
    NULL  → catálogo de botones
    10    → Automóvil
    22    → Accidentes personales
    23    → Funerario
*/

SET NOCOUNT ON;

DECLARE @cramoint INT = 22;   -- ← CAMBIAR AQUÍ (NULL = catálogo)

/* ═══════════════════════════════════════════════════════════════════════
   MODO CATÁLOGO — @cramoint = NULL
   Lista ramos internos con conteo de externos y planes (para botones UI)
   ═══════════════════════════════════════════════════════════════════════ */
IF @cramoint IS NULL
BEGIN
    SELECT
        ri.cramoint,
        TRIM(ri.xramoint)                                              AS xramoint,
        COUNT(DISTINCT i.cramo)                                        AS q_ramos_externos,
        STRING_AGG(CAST(i.cramo AS VARCHAR(10)), ', ')
            WITHIN GROUP (ORDER BY i.cramo)                            AS cramos_externos,
        COUNT(DISTINCT CASE WHEN mp.cplan IS NOT NULL THEN mp.cplan END) AS q_planes_per,
        COUNT(DISTINCT CASE WHEN ml.cplan IS NOT NULL THEN ml.cplan END) AS q_planes_pat,
        CASE
            WHEN COUNT(DISTINCT mp.cplan) > 0 AND COUNT(DISTINCT ml.cplan) > 0 THEN 'MIXTO'
            WHEN COUNT(DISTINCT mp.cplan) > 0 THEN 'PERSONAS'
            WHEN COUNT(DISTINCT ml.cplan) > 0 THEN 'PATRIMONIAL'
            ELSE 'SIN PLANES'
        END                                                            AS clase
    FROM dbo.insramoint ri
    LEFT JOIN dbo.insramo i
        ON i.cramoint = ri.cramoint
    LEFT JOIN dbo.maplanes_per mp
        ON mp.cramo = i.cramo AND mp.iestado = 'V'
    LEFT JOIN dbo.maplanes ml
        ON ml.cramo = i.cramo AND ml.iestado = 'V'
    GROUP BY ri.cramoint, ri.xramoint
    HAVING COUNT(DISTINCT i.cramo) > 0
    ORDER BY TRIM(ri.xramoint);
END
ELSE
BEGIN
    /* ═══════════════════════════════════════════════════════════════════
       PASO 1 — Ramos externos del interno
       ═══════════════════════════════════════════════════════════════════ */
    PRINT '--- Ramos externos ---';

    SELECT
        ri.cramoint,
        TRIM(ri.xramoint)          AS xramoint,
        i.cramo,
        TRIM(r.xdescripcion_l)     AS xramo_externo,
        r.ctiporamo,
        TRIM(tr.xdescripcion_l)    AS xtipo_ramo,
        i.cnaprsudpr,
        i.faprsudpr
    FROM dbo.insramoint ri
    INNER JOIN dbo.insramo i      ON i.cramoint = ri.cramoint
    INNER JOIN dbo.maramos r      ON r.cramo = i.cramo
    LEFT  JOIN dbo.matiporamo tr  ON tr.ctiporamo = r.ctiporamo
    WHERE ri.cramoint = @cramoint
    ORDER BY i.cramo;

    /* ═══════════════════════════════════════════════════════════════════
       PASO 2 — Planes unificados (personas + patrimoniales)
       ═══════════════════════════════════════════════════════════════════ */
    PRINT '--- Planes vigentes ---';

    SELECT
        ri.cramoint,
        TRIM(ri.xramoint)          AS xramoint,
        i.cramo,
        TRIM(r.xdescripcion_l)     AS xramo_externo,
        u.origen,
        u.cplan,
        u.xplan,
        u.cproducto,
        u.cmoneda,
        u.iestado
    FROM dbo.insramoint ri
    INNER JOIN dbo.insramo i ON i.cramoint = ri.cramoint
    INNER JOIN dbo.maramos r ON r.cramo = i.cramo
    CROSS APPLY (
        SELECT
            'PER'                 AS origen,
            TRIM(p.cplan)         AS cplan,
            TRIM(p.xplan)         AS xplan,
            TRIM(p.cproducto)     AS cproducto,
            TRIM(p.cmoneda)       AS cmoneda,
            p.iestado
        FROM dbo.maplanes_per p
        WHERE p.cramo = i.cramo AND p.iestado = 'V'

        UNION ALL

        SELECT
            'PAT',
            TRIM(p.cplan),
            TRIM(p.xplan),
            TRIM(p.cproducto),
            TRIM(p.cmoneda),
            p.iestado
        FROM dbo.maplanes p
        WHERE p.cramo = i.cramo AND p.iestado = 'V'
    ) u
    WHERE ri.cramoint = @cramoint
    ORDER BY i.cramo, u.origen, u.cplan;
END;
