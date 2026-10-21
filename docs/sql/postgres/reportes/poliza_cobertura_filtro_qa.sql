-- =============================================================================
-- Reporte de pólizas: filtro por cobertura (PostgreSQL de reportes, QA 121)
--
-- Qué hace:
--   1. poliza.coberturas_codigos (text[]): coberturas de cada póliza, "<cramo>-<ccobertura>" (p. ej. {7-1,7-3}).
--      Se llena sola con la sincronización de pólizas (al abrir el reporte); no hay migración de datos.
--   2. cobertura: catálogo por ramo. Se llena con el sync de catálogos (al cargar los filtros del reporte).
--   3. sp_rpt_polizas: nuevo filtro "ccobertura" (código "<cramo>-<ccobertura>").
--   4. origen_config de la aseguradora MUNDIAL: la consulta de pólizas devuelve coberturas_codigos y se
--      agrega la entidad "coberturas" (macoberturas de Sis2000).
--
-- Parte de la versión de sp_rpt_polizas de QA 121 (con la columna coberturas):
-- requiere antes ddl_coberturas_poliza.sql.
-- Idempotente: se puede correr más de una vez. Aplicar con un usuario administrador y dar GRANT al usuario de la app.
-- Las pólizas ya sincronizadas reciben coberturas_codigos cuando se vuelve a abrir el reporte sobre su rango
-- de fechas (el upsert las actualiza); mientras tanto el filtro por cobertura no las incluye.
-- =============================================================================
BEGIN;

-- 1. Columna en poliza + índice para el filtro
ALTER TABLE public.poliza ADD COLUMN IF NOT EXISTS coberturas_codigos text[];
CREATE INDEX IF NOT EXISTS idx_poliza_coberturas_codigos ON public.poliza USING gin (coberturas_codigos);

-- 2. Catálogo de coberturas por ramo (código único = "<cramo>-<ccobertura>")
CREATE TABLE IF NOT EXISTS public.cobertura (
    id_aseguradora integer NOT NULL,
    codigo         varchar(30) NOT NULL,
    id_ramo        integer,
    ccobertura     varchar(10),
    descripcion    varchar(150),
    activo         boolean NOT NULL DEFAULT true,
    synced_at      timestamp without time zone DEFAULT now(),
    PRIMARY KEY (id_aseguradora, codigo)
);
CREATE INDEX IF NOT EXISTS idx_cobertura_aseguradora_ramo ON public.cobertura (id_aseguradora, id_ramo);

-- 3. sp_rpt_polizas con el filtro ccobertura
CREATE OR REPLACE FUNCTION public.sp_rpt_polizas(p_payload_json jsonb DEFAULT '{}'::jsonb, p_usuario numeric DEFAULT NULL::numeric)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_filtros jsonb := '{}'::jsonb;
    v_polzia text;
    v_cramo integer;
    v_cestatus text;
    v_cproductor integer;
    v_ccanal text;
    v_moneda text;
    v_fdesdeemi date;
    v_fhastaemi date;
    v_ccobertura text;
BEGIN
    IF jsonb_typeof(p_payload_json -> 'filtros') = 'object' THEN
        v_filtros := p_payload_json -> 'filtros';
    ELSE
        v_filtros := p_payload_json;
    END IF;

    v_polzia     := NULLIF(TRIM(v_filtros ->> 'polzia'), '');
    v_cramo      := NULLIF(TRIM(v_filtros ->> 'cramo'), '')::integer;
    v_cestatus   := NULLIF(TRIM(v_filtros ->> 'cestatus'), '');
    v_cproductor := NULLIF(TRIM(v_filtros ->> 'cproductor'), '')::integer;
    v_ccanal     := NULLIF(TRIM(v_filtros ->> 'ccanal'), '');
    v_moneda     := NULLIF(TRIM(v_filtros ->> 'moneda'), '');
    v_fdesdeemi  := NULLIF(TRIM(v_filtros ->> 'fdesdeemi'), '')::date;
    v_fhastaemi  := NULLIF(TRIM(v_filtros ->> 'fhastaemi'), '')::date;
    v_ccobertura := NULLIF(TRIM(v_filtros ->> 'ccobertura'), '');

    RETURN QUERY
    SELECT to_jsonb(t)
    FROM (
        SELECT
            p.id,
            p.id_aseguradora,
            p.origen_clave,
            p.numero_poliza,
            p.numero_poliza_relacionada,
            p.fecha_emision_poliza,
            p.fecha_desde_poliza,
            p.fecha_hasta_poliza,
            TRIM(p.moneda) AS moneda,
            TRIM(p.sucursal) AS sucursal,
            p.id_productor,
            TRIM(pr.descripcion) AS productor,
            TRIM(p.canal_venta) AS canal_venta,
            COALESCE(
                NULLIF(TRIM(ca.descripcion), ''),
                NULLIF(TRIM(p.canal_alterno), '')
            ) AS canal_alterno,
            p.id_ramo,
            TRIM(r.descripcion) AS ramo,
            TRIM(p.plan) AS plan,
            TRIM(p.frecuencia) AS frecuencia,
            TRIM(p.tipo_ramo) AS tipo_ramo,
            TRIM(p.forma) AS forma,
            TRIM(p.estado) AS estado,
            TRIM(p.estatus_poliza) AS estatus_poliza,
            p.prima_total,
            COALESCE(TRIM(p.coberturas), '') AS coberturas,
            TRIM(p.marca_vehiculo) AS marca_vehiculo,
            TRIM(p.modelo_vehiculo) AS modelo_vehiculo,
            TRIM(p.version_vehiculo) AS version_vehiculo,
            p.anio_vehiculo,
            TRIM(p.placa) AS placa,
            TRIM(p.color_vehiculo) AS color_vehiculo,
            TRIM(p.serial_carroceria) AS serial_carroceria,
            TRIM(p.serial_motor) AS serial_motor,
            TRIM(p.nombre_tomador) AS nombre_tomador,
            TRIM(p.cedula_tomador) AS cedula_tomador,
            TRIM(p.nombre_asegurado) AS nombre_asegurado,
            TRIM(p.cedula_asegurado) AS cedula_asegurado,
            TRIM(p.nombre_beneficiario_preferencial) AS nombre_beneficiario_preferencial,
            TRIM(p.cedula_beneficiario_preferencial) AS cedula_beneficiario_preferencial
        FROM public.poliza p
        LEFT JOIN public.ramos r
            ON r.id = p.id_ramo
        LEFT JOIN public.productor pr
            ON pr.id = p.id_productor
        LEFT JOIN public.canal ca
            ON ca.id = (CASE WHEN NULLIF(TRIM(p.canal_alterno), '') ~ '^[0-9]+$' THEN NULLIF(TRIM(p.canal_alterno), '')::integer END)
        WHERE
            (v_polzia IS NULL OR p.numero_poliza = v_polzia)
            AND (v_cramo IS NULL OR p.id_ramo = v_cramo)
            AND (v_cestatus IS NULL OR p.estatus_poliza = v_cestatus)
            AND (v_cproductor IS NULL OR p.id_productor = v_cproductor)
            AND (v_ccanal IS NULL OR TRIM(p.canal_alterno) = v_ccanal)
            AND (v_moneda IS NULL OR p.moneda = v_moneda)
            AND (v_fdesdeemi IS NULL OR p.fecha_emision_poliza >= v_fdesdeemi)
            AND (v_fhastaemi IS NULL OR p.fecha_emision_poliza <= v_fhastaemi)
            AND (v_ccobertura IS NULL OR p.coberturas_codigos @> ARRAY[v_ccobertura])
        ORDER BY p.fecha_emision_poliza DESC NULLS LAST, p.numero_poliza
    ) t;
END;
$function$;

-- 4. Configuración de extracción de la aseguradora MUNDIAL
UPDATE public.aseguradora_conexion
SET origen_config = jsonb_set(
      origen_config,
      '{polizas,querySql}',
      to_jsonb(replace(
        origen_config -> 'polizas' ->> 'querySql',
        'COALESCE(pol.fultmod, pol.forigen, pol.fdesde) AS modified_at',
        $q$CAST((SELECT STRING_AGG(x.k, ',') WITHIN GROUP (ORDER BY x.k) FROM (SELECT DISTINCT CAST(pol.cramo AS varchar(10)) + '-' + RTRIM(c.ccober) AS k FROM adpolcob c WITH (NOLOCK) WHERE c.cpoliza = pol.cpoliza AND c.fanopol = pol.fanopol AND c.fmespol = pol.fmespol AND c.cramo = pol.cramo AND RTRIM(c.iestado) <> 'A') x) AS varchar(2000)) AS coberturas_codigos,
  COALESCE(pol.fultmod, pol.forigen, pol.fdesde) AS modified_at$q$))
    )
WHERE codigo = 'MUNDIAL'
  AND origen_config -> 'polizas' ->> 'querySql' NOT LIKE '%coberturas_codigos%';

UPDATE public.aseguradora_conexion
SET origen_config = jsonb_set(origen_config, '{polizas,columnMap,coberturasCodigos}', '"coberturas_codigos"')
WHERE codigo = 'MUNDIAL'
  AND NOT (origen_config -> 'polizas' -> 'columnMap' ? 'coberturasCodigos');

UPDATE public.aseguradora_conexion
SET origen_config = jsonb_set(
      origen_config,
      '{coberturas}',
      jsonb_build_object(
        'mode', 'query',
        'dateCol', 'id',
        'origenClave', 'id',
        'watermarkCol', 'modified_at',
        'watermarkExpr', 'CAST(GETDATE() AS datetime)',
        'querySql', $q$SELECT
  CAST(cramo AS varchar(10)) + '-' + RTRIM(ccobertura) AS id,
  CAST(cramo AS int) AS cramo,
  CAST(RTRIM(ccobertura) AS varchar(10)) AS ccobertura,
  CAST(TRIM(xdescripcion_l) AS varchar(150)) AS descripcion,
  CAST(CASE WHEN RTRIM(iestado) = 'V' THEN 1 ELSE 0 END AS bit) AS activo,
  CAST(GETDATE() AS datetime) AS modified_at
FROM macoberturas WITH (NOLOCK)
WHERE 1=1
/*SYNC_WHERE*/
/*SYNC_ORDER BY*/$q$
      )
    )
WHERE codigo = 'MUNDIAL'
  AND NOT (origen_config ? 'coberturas');

-- Permisos (ajustar al usuario de la app si no es "reports"):
-- GRANT SELECT, INSERT, UPDATE ON public.cobertura TO reports;

COMMIT;

-- Verificación:
--   SELECT COUNT(*) FROM public.cobertura;                       -- tras abrir el reporte (sync de catálogos)
--   SELECT numero_poliza, coberturas_codigos FROM public.poliza WHERE coberturas_codigos IS NOT NULL LIMIT 5;
--
-- Reversa:
--   DROP INDEX IF EXISTS public.idx_poliza_coberturas_codigos; ALTER TABLE public.poliza DROP COLUMN coberturas_codigos;
--   DROP TABLE IF EXISTS public.cobertura;
--   (y restaurar sp_rpt_polizas y origen_config desde el respaldo previo)
