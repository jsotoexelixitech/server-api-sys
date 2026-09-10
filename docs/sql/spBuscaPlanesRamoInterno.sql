/*
  spBuscaPlanesRamoInterno — catálogo UI + planes por cramoint
  BD: Sis2000 · SQL Server

  Flujo Exélixi (OCR → emisión):
    1. Botones = filas de insramoint (cramoint + xramoint)
    2. Usuario elige cramoint → consulta 2 devuelve planes de todos los cramo hijos
    3. Usuario elige plan → guardar cramo + cplan + cproducto + origen (PER|PAT)
    4. Cotización / emisión con el cramo EXTERNO (no cramoint)

  Desplegar en Sis2000 antes de exponer endpoint nest-api.
*/

CREATE OR ALTER PROCEDURE [dbo].[spBuscaPlanesRamoInterno]
    @cramoint       INT           = NULL,   -- NULL = solo catálogo; valor = planes del interno
    @citem          NVARCHAR(20)  = NULL,   -- productor/canal (opcional, filtro mausuplan)
    @centidad       CHAR(1)       = NULL,   -- P=productor, C=canal, G=gestor
    @solo_vigentes  BIT           = 1
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @iestado CHAR(1) = CASE WHEN @solo_vigentes = 1 THEN 'V' ELSE NULL END;

    /* ── Resultset 1: catálogo ramos internos (botones OCR / módulos) ─────── */
    IF @cramoint IS NULL
    BEGIN
        SELECT
            ri.cramoint,
            TRIM(ri.xramoint)                                              AS xramoint,
            COUNT(DISTINCT i.cramo)                                        AS q_ramos_externos,
            COUNT(DISTINCT CASE WHEN mp.cplan IS NOT NULL THEN mp.cplan END) AS q_planes_personas,
            COUNT(DISTINCT CASE WHEN ml.cplan IS NOT NULL THEN ml.cplan END) AS q_planes_patrimoniales,
            CASE
                WHEN COUNT(DISTINCT mp.cplan) > 0 AND COUNT(DISTINCT ml.cplan) > 0 THEN 'MIXTO'
                WHEN COUNT(DISTINCT mp.cplan) > 0 THEN 'PERSONAS'
                WHEN COUNT(DISTINCT ml.cplan) > 0 THEN 'PATRIMONIAL'
                ELSE 'SIN PLANES'
            END                                                            AS clase_dominante
        FROM dbo.insramoint ri
        LEFT JOIN dbo.insramo i
            ON i.cramoint = ri.cramoint
        LEFT JOIN dbo.maplanes_per mp
            ON mp.cramo = i.cramo
           AND (@iestado IS NULL OR mp.iestado = @iestado)
        LEFT JOIN dbo.maplanes ml
            ON ml.cramo = i.cramo
           AND (@iestado IS NULL OR ml.iestado = @iestado)
        GROUP BY ri.cramoint, ri.xramoint
        HAVING COUNT(DISTINCT i.cramo) > 0
        ORDER BY TRIM(ri.xramoint);

        RETURN;
    END;

    /* ── Resultset 1 (con cramoint): ramos externos del interno ───────────── */
    SELECT
        ri.cramoint,
        TRIM(ri.xramoint)          AS xramoint,
        i.cramo,
        TRIM(r.xdescripcion_l)     AS xramo_externo,
        r.ctiporamo,
        TRIM(tr.xdescripcion_l)    AS xtipo_ramo,
        r.iestado                  AS iestado_ramo
    FROM dbo.insramoint ri
    INNER JOIN dbo.insramo i      ON i.cramoint = ri.cramoint
    INNER JOIN dbo.maramos r      ON r.cramo = i.cramo
    LEFT  JOIN dbo.matiporamo tr  ON tr.ctiporamo = r.ctiporamo
    WHERE ri.cramoint = @cramoint
    ORDER BY i.cramo;

    /* ── Resultset 2: planes unificados (PER + PAT) ───────────────────────── */
    ;WITH ramos AS (
        SELECT i.cramo
        FROM dbo.insramo i
        WHERE i.cramoint = @cramoint
    ),
    planes_per AS (
        SELECT
            p.cramo,
            TRIM(p.cplan)     AS cplan,
            TRIM(p.xplan)     AS xplan,
            TRIM(p.xplan_c)   AS xplan_corto,
            TRIM(p.cproducto) AS cproducto,
            TRIM(p.cmoneda)   AS cmoneda,
            p.iestado,
            p.cproductor,
            p.itarifa,
            CAST(NULL AS NUMERIC(4)) AS ctipo_vehiculo,
            'PER'             AS origen,
            'personas'        AS modulo_emision
        FROM dbo.maplanes_per p
        INNER JOIN ramos x ON x.cramo = p.cramo
        WHERE (@iestado IS NULL OR p.iestado = @iestado)
          AND (
              @citem IS NULL OR @centidad IS NULL
              OR EXISTS (
                  SELECT 1
                  FROM dbo.mausuplan m
                  WHERE m.cramo = p.cramo
                    AND TRIM(m.cplan) = TRIM(p.cplan)
                    AND m.itipouso = 'A'
                    AND m.centidad = @centidad
                    AND (m.citem = @citem OR m.citem IS NULL)
              )
          )
    ),
    planes_pat AS (
        SELECT
            p.cramo,
            TRIM(p.cplan)     AS cplan,
            TRIM(p.xplan)     AS xplan,
            TRIM(p.xplan_c)   AS xplan_corto,
            TRIM(p.cproducto) AS cproducto,
            TRIM(p.cmoneda)   AS cmoneda,
            p.iestado,
            p.cproductor,
            CAST(NULL AS CHAR(1)) AS itarifa,
            p.ctipo           AS ctipo_vehiculo,
            'PAT'             AS origen,
            CASE
                WHEN p.cramo IN (18, 28) THEN 'valrep'
                ELSE 'valrep'
            END               AS modulo_emision
        FROM dbo.maplanes p
        INNER JOIN ramos x ON x.cramo = p.cramo
        WHERE (@iestado IS NULL OR p.iestado = @iestado)
          AND (
              @citem IS NULL OR @centidad IS NULL
              OR EXISTS (
                  SELECT 1
                  FROM dbo.mausuplan m
                  WHERE m.cramo = p.cramo
                    AND TRIM(m.cplan) = TRIM(p.cplan)
                    AND m.itipouso = 'A'
                    AND m.centidad = @centidad
                    AND (m.citem = @citem OR m.citem IS NULL)
              )
          )
    )
    SELECT
        @cramoint                     AS cramoint,
        TRIM(ri.xramoint)             AS xramoint,
        u.cramo,
        TRIM(r.xdescripcion_l)        AS xramo_externo,
        u.cplan,
        u.xplan,
        u.xplan_corto,
        u.cproducto,
        u.cmoneda,
        u.iestado,
        u.cproductor,
        u.itarifa,
        u.ctipo_vehiculo,
        u.origen,
        u.modulo_emision
    FROM (
        SELECT * FROM planes_per
        UNION ALL
        SELECT * FROM planes_pat
    ) u
    INNER JOIN dbo.insramoint ri ON ri.cramoint = @cramoint
    INNER JOIN dbo.maramos r     ON r.cramo = u.cramo
    ORDER BY u.cramo, u.origen, u.cplan;

END;
GO

/*
  ── Consultas ad-hoc (sin SP) ─────────────────────────────────────────────

  -- Botones OCR / productos por ramo interno
  EXEC dbo.spBuscaPlanesRamoInterno @cramoint = NULL;

  -- Automóvil (RCV, etc.)
  EXEC dbo.spBuscaPlanesRamoInterno @cramoint = 10;

  -- Accidentes personales
  EXEC dbo.spBuscaPlanesRamoInterno @cramoint = 22;

  -- Funerario
  EXEC dbo.spBuscaPlanesRamoInterno @cramoint = 23;

  -- Con filtro productor (mismo patrón spBuscaPlan)
  EXEC dbo.spBuscaPlanesRamoInterno
       @cramoint = 22,
       @citem = '80080',
       @centidad = 'P';
*/
