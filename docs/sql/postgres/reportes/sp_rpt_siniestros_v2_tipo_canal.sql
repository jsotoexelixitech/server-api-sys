-- sp_rpt_siniestros_v2 con canal y tipo de canal.
-- Base: definición vigente en PG reportes de producción (172.30.149.75) el 2026-10-06.
-- Cambios: columnas canal (nombre del canal alterno o, si no tiene, el tipo de canal) y tipo_canal.
-- Requiere antes docs/sql/postgres/reportes/ddl_tipo_canal.sql. La firma no cambia (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.sp_rpt_siniestros_v2(p_payload_json jsonb DEFAULT '{}'::jsonb, p_usuario numeric DEFAULT NULL::numeric)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_filtros jsonb := '{}'::jsonb;
    v_poliza text;
    v_cnsinies text;
    v_cramo int;
	v_cproductor int;
    v_fdesdenot date;
    v_fhastanot date;
    v_fdesdeinc date;
    v_fhastainc date;
    v_fdesdeestatus date;
    v_fhastaestatus date;
    v_casegurado text;
    v_csinies text;
    v_moneda text;
    v_estatus int;
BEGIN
    -- 1. Extracción de filtros del JSONB
    IF jsonb_typeof(p_payload_json -> 'filtros') = 'object' THEN
        v_filtros := p_payload_json -> 'filtros';
    ELSE
        v_filtros := p_payload_json;
    END IF;

	v_poliza     := REPLACE(NULLIF(v_filtros ->> 'polzia', ''), '-', '');
    v_cnsinies   := REPLACE(NULLIF(v_filtros ->> 'cnsinies', ''), '-', '');
    v_cramo      := NULLIF(v_filtros ->> 'cramo', '')::int;
    v_cproductor := NULLIF(v_filtros ->> 'cproductor', '')::int;
    v_fdesdenot  := NULLIF(v_filtros ->> 'fdesdenot', '')::date;
    v_fhastanot  := NULLIF(v_filtros ->> 'fhastanot', '')::date;
    v_fdesdeinc  := NULLIF(v_filtros ->> 'fdesdeinc', '')::date;
    v_fhastainc  := NULLIF(v_filtros ->> 'fhastainc', '')::date;
    v_fdesdeestatus := NULLIF(v_filtros ->> 'fdesdeestatus', '')::date;
    v_fhastaestatus := NULLIF(v_filtros ->> 'fhastaestatus', '')::date;
    v_casegurado := REPLACE(NULLIF(v_filtros ->> 'casegurado', ''), '-', '');
    v_csinies    := REPLACE(NULLIF(v_filtros ->> 'csinies', ''), '-', '');
    v_moneda     := NULLIF(v_filtros ->> 'moneda', '')::text;
    v_estatus	 := NULLIF(v_filtros ->> 'cestatus', '')::int;

    -- 2. Ejecución de la consulta devolviendo SETOF jsonb
    RETURN QUERY
    SELECT to_jsonb(t)
    FROM (
        SELECT 	ramos.descripcion AS ramo,
                numero_poliza,
                numero_siniestro,
                cedula_asegurado,
                nombre_apellido_asegurado,
                certificado,
                placa AS placa_vehiculo,
                serial_carroceria,
                serial_motor,
                color_vehiculo,
                numero_puestos,
                marca_vehiculo,
                modelo_vehiculo,
                version_vehiculo,
                cedula_siniestrado,
                nombre_apellido_siniestrado,
                fecha_ocurrencia,
                fecha_notificacion,
                TRIM(moneda) AS moneda,
				tasa_cambio,
				monto_siniestro_bs,
				monto_siniestro_ext AS monto_siniestro,
				monto_reserva_bs,
				monto_reserva_ext AS monto_reserva,
				monto_pagado_bs,
				monto_pagado_ext AS monto_pagado,
                tipo_movimiento,
                numero_orden_pago,
                fecha_emision_orden,
                fecha_pago_orden,
                estatus.descripcion AS estatus_siniestro,
                prod.descripcion AS productor,
                COALESCE(can.descripcion, siniestro.tipo_canal) AS canal,
                siniestro.tipo_canal AS tipo_canal,
                plan_poliza,
				(CASE WHEN id_estatus = 4 THEN fecha_anulacion ELSE NULL END) AS fecha_anulacion,
				(CASE WHEN id_estatus = 5 THEN fecha_rechazo ELSE NULL END) AS fecha_rechazo
            FROM siniestro
			INNER JOIN ramos ON ramos.id = siniestro.id_ramo
			LEFT JOIN productor AS prod ON prod.id = siniestro.productor
			LEFT JOIN canal AS can ON can.id = siniestro.id_canal AND can.id_aseguradora = siniestro.id_aseguradora
			INNER JOIN estatus ON estatus.id = siniestro.id_estatus
            WHERE 
                (v_poliza IS NULL OR REPLACE(numero_poliza, '-', '') = v_poliza) AND
                (v_cnsinies IS NULL OR REPLACE(numero_siniestro, '-', '') = v_cnsinies) AND
                (v_cramo IS NULL OR id_ramo = v_cramo) AND
                (v_cproductor IS NULL OR productor = v_cproductor) AND
				(
                    (v_fdesdenot IS NULL AND v_fhastanot IS NULL) OR
                    (fecha_notificacion::date BETWEEN COALESCE(v_fdesdenot, '1900-01-01') AND COALESCE(v_fhastanot, '2100-12-31'))
                ) AND
				(
                    (v_fdesdeinc IS NULL AND v_fhastainc IS NULL) OR
                    (fecha_ocurrencia::date BETWEEN COALESCE(v_fdesdeinc, '1900-01-01') AND COALESCE(v_fhastainc, '2100-12-31'))
                ) AND
				(
                    (v_fdesdeestatus IS NULL AND v_fhastaestatus IS NULL) OR
                    (
                        CASE 
                            WHEN v_estatus = 3 THEN fecha_pago_orden 
                            WHEN v_estatus = 4 THEN fecha_anulacion 
                            WHEN v_estatus = 5 THEN fecha_rechazo 
                            ELSE fecha_emision_orden 
                        END::date BETWEEN COALESCE(v_fdesdeestatus, '1900-01-01') AND COALESCE(v_fhastaestatus, '2100-12-31')
                    )
                ) AND
                (v_casegurado IS NULL OR REPLACE(cedula_asegurado, '-', '') = v_casegurado) AND
                (v_csinies IS NULL OR REPLACE(cedula_siniestrado, '-', '') = v_csinies) AND
                (v_moneda IS NULL OR moneda = v_moneda) AND 
                (v_estatus IS NULL OR id_estatus = v_estatus)
        ) t;
END;
$function$;
