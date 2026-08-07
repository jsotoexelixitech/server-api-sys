/*
  Consulta catálogo de ramos (maramos + matiporamo + insramo) y planes vigentes.
  BD: Sis2000 · SQL Server

  Uso sqlcmd (desde nest-api con .env cargado):
    sqlcmd -S "$SERVER_BD" -d "$NAME_BD" -U "$USER_BD" -P "$PASSWORD_BD" \
      -i docs/sql/consulta-ramos-planes.sql -v CRAMO=5

  Parámetro opcional @cramo: NULL = todos los ramos; ej. 5 viajero, 18 RCV, 9 funerario.
*/

SET NOCOUNT ON;

DECLARE @cramo INT = NULL;  -- cambiar a un número concreto o usar sqlcmd -v CRAMO=5

-- Si se invoca con sqlcmd -v CRAMO=N, descomentar la línea siguiente:
-- SET @cramo = $(CRAMO);

/* ── 1. Catálogo de ramos + tipo + datos insramo ─────────────────────── */
SELECT
    r.cramo,
    TRIM(r.xdescripcion_l)     AS xramo,
    r.ctiporamo,
    TRIM(tr.xdescripcion_l)    AS xtipo_ramo,
    r.cramoint,
    r.iestado                  AS iestado_ramo,
    i.cnaprsudpr,
    i.faprsudpr
FROM dbo.maramos r
LEFT JOIN dbo.matiporamo tr ON tr.ctiporamo = r.ctiporamo
LEFT JOIN dbo.insramo   i  ON i.cramo      = r.cramo
WHERE (@cramo IS NULL OR r.cramo = @cramo)
ORDER BY r.cramo;

/* ── 2. Planes PERSONAS (maplanes_per) — viajero, funerario, etc. ───── */
SELECT
    p.cramo,
    TRIM(r.xdescripcion_l)     AS xramo,
    TRIM(p.cplan)              AS cplan,
    TRIM(p.xplan)              AS xplan,
    TRIM(p.xplan_c)            AS xplan_corto,
    p.cproducto,
    p.cproductor,
    p.cmoneda,
    p.iestado,
    p.itarifa
FROM dbo.maplanes_per p
INNER JOIN dbo.maramos r ON r.cramo = p.cramo
WHERE p.iestado = 'V'
  AND (@cramo IS NULL OR p.cramo = @cramo)
ORDER BY p.cramo, p.cplan;

/* ── 3. Planes PATRIMONIALES (maplanes) — RCV, auto, etc. ────────────── */
SELECT
    p.cramo,
    TRIM(r.xdescripcion_l)     AS xramo,
    TRIM(p.cplan)              AS cplan,
    TRIM(p.xplan)              AS xplan,
    TRIM(p.xplan_c)            AS xplan_corto,
    p.cproducto,
    p.cproductor,
    p.cmoneda,
    p.iestado,
    p.bnacional
FROM dbo.maplanes p
INNER JOIN dbo.maramos r ON r.cramo = p.cramo
WHERE p.iestado = 'V'
  AND (@cramo IS NULL OR p.cramo = @cramo)
ORDER BY p.cramo, p.cplan;

/* ── 4. Vista unificada: ramo → planes (personas + patrimoniales) ────── */
SELECT
    r.cramo,
    TRIM(r.xdescripcion_l)     AS xramo,
    TRIM(tr.xdescripcion_l)    AS xtipo_ramo,
    'PER'                      AS origen_plan,
    TRIM(p.cplan)              AS cplan,
    TRIM(p.xplan)              AS xplan,
    p.cproducto,
    p.iestado
FROM dbo.maramos r
LEFT JOIN dbo.matiporamo tr ON tr.ctiporamo = r.ctiporamo
INNER JOIN dbo.maplanes_per p ON p.cramo = r.cramo AND p.iestado = 'V'
WHERE (@cramo IS NULL OR r.cramo = @cramo)

UNION ALL

SELECT
    r.cramo,
    TRIM(r.xdescripcion_l),
    TRIM(tr.xdescripcion_l),
    'PAT',
    TRIM(p.cplan),
    TRIM(p.xplan),
    p.cproducto,
    p.iestado
FROM dbo.maramos r
LEFT JOIN dbo.matiporamo tr ON tr.ctiporamo = r.ctiporamo
INNER JOIN dbo.maplanes p ON p.cramo = r.cramo AND p.iestado = 'V'
WHERE (@cramo IS NULL OR r.cramo = @cramo)

ORDER BY cramo, origen_plan, cplan;
