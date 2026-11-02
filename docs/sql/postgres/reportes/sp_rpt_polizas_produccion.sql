-- sp_rpt_polizas para PRODUCCIÓN (PG reportes 172.30.149.75).
-- Igual al de QA (sp_rpt_polizas_qa.sql) salvo que los cruces con ramos, productor y canal también filtran por id_aseguradora
-- (en Producción esos catálogos llevan id_aseguradora).
-- Cambios 2026-10-15/16: el cruce con canal ya no puede fallar con canales no numéricos (el ::integer va dentro de un CASE;
-- PostgreSQL no garantiza el orden de evaluación de los AND) y se agrega la columna coberturas.
-- Requiere antes ddl_coberturas_poliza.sql. La firma no cambia: CREATE OR REPLACE.
-- Rollback: volver a crear el SP sin la columna coberturas (no hace falta borrar la columna).

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
           AND r.id_aseguradora = p.id_aseguradora
        LEFT JOIN public.productor pr
            ON pr.id = p.id_productor
           AND pr.id_aseguradora = p.id_aseguradora
        LEFT JOIN public.canal ca
            ON ca.id = (CASE WHEN NULLIF(TRIM(p.canal_alterno), '') ~ '^[0-9]+$' THEN NULLIF(TRIM(p.canal_alterno), '')::integer END)
           AND ca.id_aseguradora = p.id_aseguradora
        WHERE
            (v_polzia IS NULL OR p.numero_poliza = v_polzia)
            AND (v_cramo IS NULL OR p.id_ramo = v_cramo)
            AND (v_cestatus IS NULL OR p.estatus_poliza = v_cestatus)
            AND (v_cproductor IS NULL OR p.id_productor = v_cproductor)
            AND (v_ccanal IS NULL OR TRIM(p.canal_alterno) = v_ccanal)
            AND (v_moneda IS NULL OR p.moneda = v_moneda)
            AND (v_fdesdeemi IS NULL OR p.fecha_emision_poliza >= v_fdesdeemi)
            AND (v_fhastaemi IS NULL OR p.fecha_emision_poliza <= v_fhastaemi)
        ORDER BY p.fecha_emision_poliza DESC NULLS LAST, p.numero_poliza
    ) t;
END;
$function$
;
