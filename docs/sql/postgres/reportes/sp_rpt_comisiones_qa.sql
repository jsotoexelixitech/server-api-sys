-- sp_rpt_comisiones (QA 192.168.8.121) con la columna coberturas. La firma no cambia: CREATE OR REPLACE.
-- Requiere antes ddl_coberturas_comision.sql.

CREATE OR REPLACE FUNCTION public.sp_rpt_comisiones(p_payload_json jsonb, p_usuario numeric)
 RETURNS TABLE(data jsonb)
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_filtros jsonb := '{}'::jsonb;
    v_id_aseguradora integer;
    v_poliza text;
    v_recibo text;
    v_cramo integer;
    v_cproductor integer;
    v_cmoneda text;
    v_tipo_movimiento text;
    v_estado_recibo text;
    v_tipo_fecha text;
    v_desde date;
    v_hasta date;
    v_fdesdepago date;
    v_fhastapago date;
BEGIN
    IF jsonb_typeof(p_payload_json -> 'filtros') = 'object' THEN
        v_filtros := p_payload_json -> 'filtros';
    ELSE
        v_filtros := p_payload_json;
    END IF;

    v_id_aseguradora  := NULLIF(TRIM(v_filtros ->> 'id_aseguradora'), '')::integer;
    v_poliza          := NULLIF(TRIM(v_filtros ->> 'poliza'), '');
    v_recibo          := NULLIF(TRIM(v_filtros ->> 'recibo'), '');
    v_cramo           := NULLIF(TRIM(v_filtros ->> 'cramo'), '')::integer;
    v_cproductor      := NULLIF(TRIM(v_filtros ->> 'cproductor'), '')::integer;
    v_cmoneda         := NULLIF(TRIM(v_filtros ->> 'moneda'), '');
    v_tipo_movimiento := NULLIF(TRIM(v_filtros ->> 'tipo_movimiento'), '');
    v_estado_recibo   := NULLIF(TRIM(v_filtros ->> 'estado_recibo'), '');
    v_tipo_fecha      := COALESCE(NULLIF(TRIM(v_filtros ->> 'tipoFecha'), ''), 'fecha_cobro');
    v_desde           := NULLIF(TRIM(v_filtros ->> 'desde'), '')::date;
    v_hasta           := NULLIF(TRIM(v_filtros ->> 'hasta'), '')::date;
    v_fdesdepago      := NULLIF(TRIM(v_filtros ->> 'fdesdepago'), '')::date;
    v_fhastapago      := NULLIF(TRIM(v_filtros ->> 'fhastapago'), '')::date;

    RETURN QUERY
    SELECT to_jsonb(t)
    FROM (
        SELECT
            c.id,
            c.id_aseguradora,
            c.origen_clave,
            c.numero_poliza,
            c.numero_recibo,
            c.id_ramo,
            COALESCE(NULLIF(TRIM(r.descripcion), ''), TRIM(c.ramo)) AS ramo,
            TRIM(c.cedula_tomador)   AS cedula_tomador,
            TRIM(c.nombre_tomador)   AS nombre_tomador,
            TRIM(c.cedula_asegurado) AS cedula_asegurado,
            TRIM(c.nombre_asegurado) AS nombre_asegurado,
            c.fecha_emision_recibo,
            c.fecha_desde_recibo,
            c.fecha_hasta_recibo,
            c.dias_vigencia,
            TRIM(c.estado_recibo)      AS estado_recibo,
            TRIM(c.estado_recibo_desc) AS estado_recibo_desc,
            c.fecha_cobro_recibo,
            c.numero_ingreso,
            TRIM(c.moneda_recibo)      AS moneda_recibo,
            c.suma_asegurada,
            c.suma_asegurada_ext,
            c.monto_recibo_bruto,
            c.monto_recibo_bruto_ext,
            c.monto_recibo_pagado,
            c.monto_recibo_pagado_ext,
            c.id_sucursal,
            TRIM(c.sucursal) AS sucursal,
            c.id_productor,
            COALESCE(NULLIF(TRIM(pr.descripcion), ''), TRIM(c.productor)) AS productor,
            TRIM(c.cedula_productor)       AS cedula_productor,
            TRIM(c.tipo_persona_productor) AS tipo_persona_productor,
            TRIM(c.tipo_movimiento_codigo) AS tipo_movimiento_codigo,
            TRIM(c.tipo_movimiento)        AS tipo_movimiento,
            c.monto_movimiento,
            c.monto_movimiento_bs,
            c.monto_movimiento_ext,
            c.porcentaje_comision,
            c.porcentaje_islr,
            c.monto_islr,
            TRIM(c.moneda_cobro)           AS moneda_cobro,
            TRIM(c.moneda_pago)            AS moneda_pago,
            c.tasa_cobro,
            c.numero_orden_pago,
            TRIM(c.banco)                  AS banco,
            TRIM(c.referencia_bancaria)    AS referencia_bancaria,
            c.fecha_pago_comision,
            c.monto_sustraendo,
            c.monto_neto_orden,
            c.monto_islr_orden,
            c.monto_bruto_orden,
            COALESCE(TRIM(c.coberturas), '') AS coberturas,
            c.origen_modified_at,
            c.synced_at
        FROM public.comision c
        LEFT JOIN public.ramos r
            ON r.id = c.id_ramo
        LEFT JOIN public.productor pr
            ON pr.id = c.id_productor
        WHERE
            (v_id_aseguradora IS NULL OR c.id_aseguradora = v_id_aseguradora)
            AND (v_poliza IS NULL OR c.numero_poliza = v_poliza)
            AND (v_recibo IS NULL OR c.numero_recibo = v_recibo)
            AND (v_cramo IS NULL OR c.id_ramo = v_cramo)
            AND (v_cproductor IS NULL OR c.id_productor = v_cproductor)
            AND (v_cmoneda IS NULL OR c.moneda_pago = v_cmoneda OR c.moneda_cobro = v_cmoneda OR c.moneda_recibo = v_cmoneda)
            AND (v_tipo_movimiento IS NULL OR c.tipo_movimiento_codigo = v_tipo_movimiento OR c.tipo_movimiento = v_tipo_movimiento)
            AND (v_estado_recibo IS NULL OR c.estado_recibo = v_estado_recibo)
            AND (
                CASE 
                    WHEN v_tipo_fecha = 'fecha_pago' THEN
                        (v_desde IS NULL OR c.fecha_pago_comision >= v_desde) AND
                        (v_hasta IS NULL OR c.fecha_pago_comision <= v_hasta)
                    WHEN v_tipo_fecha = 'fecha_emision' THEN
                        (v_desde IS NULL OR c.fecha_emision_recibo >= v_desde) AND
                        (v_hasta IS NULL OR c.fecha_emision_recibo <= v_hasta)
                    ELSE
                        (v_desde IS NULL OR c.fecha_cobro_recibo >= v_desde) AND
                        (v_hasta IS NULL OR c.fecha_cobro_recibo <= v_hasta)
                END
            )
            AND (v_fdesdepago IS NULL OR c.fecha_pago_comision >= v_fdesdepago)
            AND (v_fhastapago IS NULL OR c.fecha_pago_comision <= v_fhastapago)
        ORDER BY c.fecha_cobro_recibo DESC NULLS LAST, c.numero_recibo ASC
    ) t;
END;
$function$
;
