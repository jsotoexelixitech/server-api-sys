-- Patch sp_rpt_recibos_v6: joins de catálogo por (id_aseguradora, id)
-- Basado en la versión de PRODUCCIÓN (currency / monto_reporte).
-- Ejecutar DESPUÉS de ddl_catalogos_sync.sql
-- Idempotente vía CREATE OR REPLACE.

CREATE OR REPLACE PROCEDURE public.sp_rpt_recibos_v6(
    IN p_payload_json jsonb,
    IN p_usuario numeric,
    INOUT p_cursor_kpi refcursor DEFAULT 'p_cursor_kpi'::refcursor,
    INOUT p_cursor_detalle refcursor DEFAULT 'p_cursor_detalle'::refcursor,
    INOUT p_cursor_emitido_cobrado_vencido refcursor DEFAULT 'p_cursor_emitido_cobrado_vencido'::refcursor,
    INOUT p_cursor_aging_mora refcursor DEFAULT 'p_cursor_aging_mora'::refcursor,
    INOUT p_cursor_mora_canal refcursor DEFAULT 'p_cursor_mora_canal'::refcursor,
    INOUT p_cursor_mora_producto refcursor DEFAULT 'p_cursor_mora_producto'::refcursor,
    INOUT p_cursor_mora_frecuencia refcursor DEFAULT 'p_cursor_mora_frecuencia'::refcursor,
    INOUT p_cursor_eficiencia_productor refcursor DEFAULT 'p_cursor_eficiencia_productor'::refcursor
)
LANGUAGE plpgsql
AS $procedure$
DECLARE
    v_payload jsonb := COALESCE(p_payload_json, '{}'::jsonb);
    v_filtros jsonb := '{}'::jsonb;
    v_bexportar boolean := false;
    v_bpreview boolean := false;
    v_pagina integer := 1;
    v_tamano integer := 25;
    v_offset integer := 0;
    v_fdesde date;
    v_fhasta date;
    v_iestado integer;
    v_cramo text;
    v_ccanal text;
    v_cproductor integer;
    v_cmoneda text;
    v_id_aseguradora integer;
BEGIN

	IF jsonb_typeof(v_payload -> 'filtros') = 'object' THEN
        v_filtros := v_payload -> 'filtros';
    ELSE
        v_filtros := v_payload;
    END IF;

    v_bpreview := COALESCE(NULLIF(v_payload ->> 'bpreview', '')::int, 0) = 1;
    v_bexportar := COALESCE(NULLIF(v_payload ->> 'bexportar', '')::int, 0) = 1;
    v_pagina := GREATEST(COALESCE(NULLIF(v_payload #>> '{paginacion,pagina}', '')::int, 1), 1);
    v_tamano := GREATEST(COALESCE(NULLIF(v_payload #>> '{paginacion,tamano}', '')::int, 25), 1);
    v_offset := (v_pagina - 1) * v_tamano;

    v_fdesde := NULLIF(COALESCE(v_filtros ->> 'desde', v_payload ->> 'desde', ''), '')::date;
    v_fhasta := NULLIF(COALESCE(v_filtros ->> 'hasta', v_payload ->> 'hasta', ''), '')::date;
    v_iestado := NULLIF(BTRIM(COALESCE(v_filtros ->> 'estado', v_payload ->> 'estado', '')), '')::integer;
    v_cramo := NULLIF(BTRIM(COALESCE(v_filtros ->> 'ramo', v_payload ->> 'ramo', '')), '')::integer;
    v_ccanal := NULLIF(BTRIM(COALESCE(v_filtros ->> 'canal', v_payload ->> 'canal', '')), '')::integer;
    v_cproductor := NULLIF(BTRIM(COALESCE(v_filtros ->> 'productor', v_payload ->> 'productor', '')), '')::integer;
    v_cmoneda := NULLIF(BTRIM(COALESCE(v_filtros ->> 'cmoneda', v_payload ->> 'cmoneda', v_filtros ->> 'moneda', v_payload ->> 'moneda', '')), '');
    v_id_aseguradora := NULLIF(BTRIM(COALESCE(v_filtros ->> 'aseguradoraId', v_filtros ->> 'id_aseguradora', v_payload ->> 'aseguradoraId', '')), '')::integer;

	DROP TABLE IF EXISTS tmp_recibos_filtrados;

	CREATE TEMP TABLE tmp_recibos_filtrados ON COMMIT DROP AS
		SELECT
			r.*,
			-- Mismo criterio que el detalle/Excel: USD/EUR usa ext truncado a 2 decimales.
			-- No hacer fallback a Bs cuando ext = 0 (el Excel suma esa columna en 0).
			TRUNC(
				CASE
					WHEN BTRIM(UPPER(COALESCE(r.moneda, ''))) IN ('$', 'USD', 'EUR', '€')
						THEN COALESCE(r.monto_recibo_ext, 0)
					ELSE COALESCE(r.monto_recibo, 0)
				END::numeric,
				2
			) AS monto_reporte
		FROM recibo r
		WHERE r.id_estatus <> 0
		  AND (v_id_aseguradora IS NULL OR r.id_aseguradora = v_id_aseguradora)
		  AND (v_cramo IS NULL OR r.id_ramo = v_cramo::int)
		  AND (v_ccanal IS NULL OR r.id_canal = v_ccanal::int)
		  AND (v_cproductor IS NULL OR r.id_productor = v_cproductor::int)
		  AND (
		    (v_iestado IS NULL AND r.id_estatus <> 4 AND (v_fdesde IS NULL OR r.fecha_desde BETWEEN v_fdesde AND v_fhasta))
		    OR (v_iestado = 1 AND r.id_estatus = 1 AND (v_fdesde IS NULL OR r.fecha_desde BETWEEN v_fdesde AND v_fhasta))
		    OR (v_iestado = 2 AND r.id_estatus IN (2) AND r.fecha_pago IS NULL AND (v_fdesde IS NULL OR r.fecha_hasta BETWEEN v_fdesde AND v_fhasta))
		    OR (v_iestado = 3 AND r.id_estatus = 3 AND (v_fdesde IS NULL OR r.fecha_pago BETWEEN v_fdesde AND v_fhasta))
		    OR (v_iestado = 4 AND r.id_estatus = 4 AND (v_fdesde IS NULL OR r.fecha_anulacion BETWEEN v_fdesde AND v_fhasta))
		    OR (v_iestado = 5 AND r.id_estatus = 5)
		  )
          AND (
            v_cmoneda IS NULL
            OR BTRIM(UPPER(COALESCE(r.moneda, ''))) = UPPER(v_cmoneda)
            OR (UPPER(v_cmoneda) IN ('$', 'USD') AND BTRIM(UPPER(COALESCE(r.moneda, ''))) IN ('$', 'USD'))
          );

    -- 1. PRIMERA CONSULTA: KPI_RESUMEN
    -- tmp_recibos_filtrados ya aplicó estado + ventana de fechas (pago/desde/hasta/anulación).
    -- No volver a filtrar por fecha_desde: con Cobrado eso excluía recibos pagados en el rango
    -- cuya vigencia empezó fuera del rango, y el Excel sí los incluye.
    OPEN p_cursor_kpi FOR
		WITH base AS (
		    SELECT
				CASE
					WHEN v_iestado IS NULL OR v_iestado IN (1, 2, 3) THEN
				        COALESCE(SUM(r.monto_reporte), 0)
					ELSE NULL
					END AS prima_emitida,

				CASE
					WHEN v_iestado IS NULL OR v_iestado IN (3) THEN
				        COALESCE(SUM(r.monto_reporte) FILTER (WHERE r.id_estatus = 3), 0)
					ELSE NULL
					END AS prima_cobrada,

				CASE
					WHEN v_iestado IS NULL OR v_iestado IN (1,2,3) THEN
				        COALESCE(SUM(r.monto_reporte) FILTER (WHERE r.id_estatus IN (1, 2, 3)), 0)
					ELSE NULL
					END AS prima_exigible,

				CASE
					WHEN v_iestado IS NULL OR v_iestado IN (1,2) THEN
				        COALESCE(SUM(r.monto_reporte) FILTER (
							WHERE r.id_estatus IN (1, 2)
							  AND r.fecha_pago IS NULL
				        ), 0)
					ELSE NULL
					END AS cartera_vencida,

				CASE
					WHEN v_iestado IS NULL OR v_iestado IN (1, 2) THEN
				        COALESCE(SUM(r.monto_reporte) FILTER (
							WHERE r.id_estatus IN (1, 2)
							  AND r.fecha_pago IS NULL
				        ), 0)
					ELSE NULL
					END AS prima_pendiente
		    FROM tmp_recibos_filtrados r
		)
		SELECT
		    b.prima_emitida,
		    b.prima_cobrada,
		    b.prima_exigible,
		    b.cartera_vencida,
			b.prima_pendiente,
		    ROUND((b.prima_cobrada * 100 / NULLIF(b.prima_exigible, 0))::numeric, 6) AS eficiencia_cobro,
		    ROUND((b.cartera_vencida * 100 / NULLIF(b.prima_exigible, 0))::numeric, 6) AS porcentaje_cartera_vencida,
		    (SELECT COUNT(*)::int FROM tmp_recibos_filtrados) AS total_filas
		FROM base b;

	IF v_iestado IS NULL OR v_iestado IN (1, 2, 3) THEN

		OPEN p_cursor_emitido_cobrado_vencido FOR
			SELECT
			    DATE_TRUNC('month', r.fecha_desde)::date AS periodo,
			    SUM(
					CASE
						WHEN BTRIM(UPPER(COALESCE(r.moneda, ''))) IN ('$', 'USD', 'EUR', '€')
							THEN COALESCE(NULLIF(r.monto_recibo_ext, 0), r.monto_recibo)
						ELSE r.monto_recibo
					END
				) FILTER (
			        WHERE v_fdesde IS NULL OR (r.fecha_desde between v_fdesde AND v_fhasta
								and r.fecha_hasta between v_fdesde AND v_fhasta and r.id_estatus not in (0, 4))
			    ) AS monto_emitido,
			    SUM(
					CASE
						WHEN BTRIM(UPPER(COALESCE(r.moneda, ''))) IN ('$', 'USD', 'EUR', '€')
							THEN COALESCE(NULLIF(r.monto_recibo_ext, 0), r.monto_recibo)
						ELSE r.monto_recibo
					END
				) FILTER (
			        WHERE v_fdesde IS NULL OR (r.id_estatus = 3
			          AND r.fecha_pago BETWEEN v_fdesde AND v_fhasta
		         	  AND r.fecha_desde BETWEEN v_fdesde AND v_fhasta)
			    ) AS monto_cobrado,
			    SUM(
					CASE
						WHEN BTRIM(UPPER(COALESCE(r.moneda, ''))) IN ('$', 'USD', 'EUR', '€')
							THEN COALESCE(NULLIF(r.monto_recibo_ext, 0), r.monto_recibo)
						ELSE r.monto_recibo
					END
				) FILTER (
			        WHERE v_fdesde IS NULL OR (r.id_estatus in (1, 2)
			          AND r.fecha_desde >= v_fdesde
			          AND r.fecha_hasta <= v_fhasta)
			    ) AS monto_vencido
			FROM recibo r
			WHERE r.id_estatus not in (0, 4)
			  AND (v_id_aseguradora IS NULL OR r.id_aseguradora = v_id_aseguradora)
			  and (v_fdesde IS NULL OR (r.fecha_desde >= v_fdesde and r.fecha_hasta <= v_fhasta))
              AND (
                v_cmoneda IS NULL
                OR BTRIM(UPPER(COALESCE(r.moneda, ''))) = UPPER(v_cmoneda)
                OR (UPPER(v_cmoneda) IN ('$', 'USD') AND BTRIM(UPPER(COALESCE(r.moneda, ''))) IN ('$', 'USD'))
              )
			GROUP BY DATE_TRUNC('month', r.fecha_desde)
			ORDER BY periodo;

	ELSE

		OPEN p_cursor_emitido_cobrado_vencido FOR
			SELECT
			    NULL::numeric AS monto_emitido,
			    NULL::numeric AS monto_cobrado,
			    NULL::numeric AS monto_vencido
			WHERE FALSE;

	END IF;

	IF v_iestado = 3 THEN

		OPEN p_cursor_aging_mora FOR
			SELECT
			    NULL::numeric AS monto_total,
			    NULL::text AS dias_mora
			WHERE FALSE;

	ELSE

		OPEN p_cursor_aging_mora FOR
			SELECT
			    SUM(
					CASE
						WHEN BTRIM(UPPER(COALESCE(moneda, ''))) IN ('$', 'USD', 'EUR', '€')
							THEN COALESCE(NULLIF(monto_recibo_ext, 0), monto_recibo)
						ELSE monto_recibo
					END
				) monto_total,
			    CASE
			        WHEN GREATEST(0, COALESCE(v_fhasta, CURRENT_DATE)::date - fecha_hasta::date) <= 30 THEN '0-30 días'
			        WHEN GREATEST(0, COALESCE(v_fhasta, CURRENT_DATE)::date - fecha_hasta::date) <= 60 THEN '31-60 días'
			        WHEN GREATEST(0, COALESCE(v_fhasta, CURRENT_DATE)::date - fecha_hasta::date) <= 90 THEN '61-90 días'
			        ELSE 'Más de 90 días'
			    END AS dias_mora
			FROM recibo
			WHERE id_estatus in (1, 2)
			  AND (v_id_aseguradora IS NULL OR id_aseguradora = v_id_aseguradora)
			and (v_fdesde IS NULL OR fecha_hasta between v_fdesde and v_fhasta)
            AND (
              v_cmoneda IS NULL
              OR BTRIM(UPPER(COALESCE(moneda, ''))) = UPPER(v_cmoneda)
              OR (UPPER(v_cmoneda) IN ('$', 'USD') AND BTRIM(UPPER(COALESCE(moneda, ''))) IN ('$', 'USD'))
            )
			group by dias_mora;

	END IF;

	IF v_iestado = 3 THEN

		OPEN p_cursor_mora_canal FOR
			SELECT
			    NULL::text AS canal,
			    NULL::int AS dias_mora,
			    NULL::numeric AS monto_total
			WHERE FALSE;

	ELSE

		OPEN p_cursor_mora_canal FOR
			SELECT
			    c.descripcion AS canal,
			    CASE
			        WHEN GREATEST(0, COALESCE(v_fhasta, CURRENT_DATE)::date - r.fecha_hasta::date) <= 30 THEN '0-30 días'
			        WHEN GREATEST(0, COALESCE(v_fhasta, CURRENT_DATE)::date - r.fecha_hasta::date) <= 60 THEN '31-60 días'
			        WHEN GREATEST(0, COALESCE(v_fhasta, CURRENT_DATE)::date - r.fecha_hasta::date) <= 90 THEN '61-90 días'
			        ELSE 'Más de 90 días'
			    END AS dias_mora,
			    SUM(
					CASE
						WHEN BTRIM(UPPER(COALESCE(r.moneda, ''))) IN ('$', 'USD', 'EUR', '€')
							THEN COALESCE(NULLIF(r.monto_recibo_ext, 0), r.monto_recibo)
						ELSE r.monto_recibo
					END
				) AS monto_total
			FROM recibo r
			JOIN canal c ON r.id_canal = c.id AND c.id_aseguradora = r.id_aseguradora
			WHERE r.id_estatus IN (1, 2)
			  AND (v_id_aseguradora IS NULL OR r.id_aseguradora = v_id_aseguradora)
			  AND (v_fdesde IS NULL OR r.fecha_hasta BETWEEN v_fdesde AND v_fhasta)
              AND (
                v_cmoneda IS NULL
                OR BTRIM(UPPER(COALESCE(r.moneda, ''))) = UPPER(v_cmoneda)
                OR (UPPER(v_cmoneda) IN ('$', 'USD') AND BTRIM(UPPER(COALESCE(r.moneda, ''))) IN ('$', 'USD'))
              )
			GROUP BY
			    c.descripcion,
			    CASE
			        WHEN GREATEST(0, COALESCE(v_fhasta, CURRENT_DATE)::date - r.fecha_hasta::date) <= 30 THEN '0-30 días'
			        WHEN GREATEST(0, COALESCE(v_fhasta, CURRENT_DATE)::date - r.fecha_hasta::date) <= 60 THEN '31-60 días'
			        WHEN GREATEST(0, COALESCE(v_fhasta, CURRENT_DATE)::date - r.fecha_hasta::date) <= 90 THEN '61-90 días'
			        ELSE 'Más de 90 días'
			    END
			ORDER BY c.descripcion, dias_mora;

	END IF;

	IF v_iestado = 3 THEN

		OPEN p_cursor_mora_producto FOR
			SELECT
			    NULL::text AS producto,
			    NULL::text AS dias_mora,
			    NULL::numeric AS monto_total
			WHERE FALSE;

	ELSE

		OPEN p_cursor_mora_producto FOR
			SELECT
			    ra.descripcion AS producto,
			    CASE
			        WHEN GREATEST(0, COALESCE(v_fhasta, CURRENT_DATE)::date - r.fecha_hasta::date) <= 30 THEN '0-30 días'
			        WHEN GREATEST(0, COALESCE(v_fhasta, CURRENT_DATE)::date - r.fecha_hasta::date) <= 60 THEN '31-60 días'
			        WHEN GREATEST(0, COALESCE(v_fhasta, CURRENT_DATE)::date - r.fecha_hasta::date) <= 90 THEN '61-90 días'
			        ELSE 'Más de 90 días'
			    END AS dias_mora,
			    SUM(
					CASE
						WHEN BTRIM(UPPER(COALESCE(r.moneda, ''))) IN ('$', 'USD', 'EUR', '€')
							THEN COALESCE(NULLIF(r.monto_recibo_ext, 0), r.monto_recibo)
						ELSE r.monto_recibo
					END
				) AS monto_total
			FROM recibo r
			JOIN ramos ra ON r.id_ramo = ra.id AND ra.id_aseguradora = r.id_aseguradora
			WHERE r.id_estatus IN (1, 2)
			  AND (v_id_aseguradora IS NULL OR r.id_aseguradora = v_id_aseguradora)
			  AND (v_fdesde IS NULL OR r.fecha_hasta BETWEEN v_fdesde AND v_fhasta)
              AND (
                v_cmoneda IS NULL
                OR BTRIM(UPPER(COALESCE(r.moneda, ''))) = UPPER(v_cmoneda)
                OR (UPPER(v_cmoneda) IN ('$', 'USD') AND BTRIM(UPPER(COALESCE(r.moneda, ''))) IN ('$', 'USD'))
              )
			GROUP BY
			    ra.descripcion,
			    CASE
			        WHEN GREATEST(0, COALESCE(v_fhasta, CURRENT_DATE)::date - r.fecha_hasta::date) <= 30 THEN '0-30 días'
			        WHEN GREATEST(0, COALESCE(v_fhasta, CURRENT_DATE)::date - r.fecha_hasta::date) <= 60 THEN '31-60 días'
			        WHEN GREATEST(0, COALESCE(v_fhasta, CURRENT_DATE)::date - r.fecha_hasta::date) <= 90 THEN '61-90 días'
			        ELSE 'Más de 90 días'
			    END
			ORDER BY ra.descripcion, dias_mora;

	END IF;

	IF v_iestado = 3 THEN

		OPEN p_cursor_mora_frecuencia FOR
			SELECT
			    NULL::int AS frecuencia,
			    NULL::text AS dias_mora,
			    NULL::numeric AS monto_total
			WHERE FALSE;

	ELSE

		OPEN p_cursor_mora_frecuencia FOR
			SELECT
			    r.id_frecuencia AS frecuencia,
			    CASE
			        WHEN GREATEST(0, COALESCE(v_fhasta, CURRENT_DATE)::date - r.fecha_hasta::date) <= 30 THEN '0-30 días'
			        WHEN GREATEST(0, COALESCE(v_fhasta, CURRENT_DATE)::date - r.fecha_hasta::date) <= 60 THEN '31-60 días'
			        WHEN GREATEST(0, COALESCE(v_fhasta, CURRENT_DATE)::date - r.fecha_hasta::date) <= 90 THEN '61-90 días'
			        ELSE 'Más de 90 días'
			    END AS dias_mora,
			    SUM(
					CASE
						WHEN BTRIM(UPPER(COALESCE(r.moneda, ''))) IN ('$', 'USD', 'EUR', '€')
							THEN COALESCE(NULLIF(r.monto_recibo_ext, 0), r.monto_recibo)
						ELSE r.monto_recibo
					END
				) AS monto_total
			FROM recibo r
			WHERE r.id_estatus IN (1, 2)
			  AND (v_id_aseguradora IS NULL OR r.id_aseguradora = v_id_aseguradora)
			  AND (v_fdesde IS NULL OR r.fecha_hasta BETWEEN v_fdesde AND v_fhasta)
              AND (
                v_cmoneda IS NULL
                OR BTRIM(UPPER(COALESCE(r.moneda, ''))) = UPPER(v_cmoneda)
                OR (UPPER(v_cmoneda) IN ('$', 'USD') AND BTRIM(UPPER(COALESCE(r.moneda, ''))) IN ('$', 'USD'))
              )
			GROUP BY
			    r.id_frecuencia,
			    CASE
			        WHEN GREATEST(0, COALESCE(v_fhasta, CURRENT_DATE)::date - r.fecha_hasta::date) <= 30 THEN '0-30 días'
			        WHEN GREATEST(0, COALESCE(v_fhasta, CURRENT_DATE)::date - r.fecha_hasta::date) <= 60 THEN '31-60 días'
			        WHEN GREATEST(0, COALESCE(v_fhasta, CURRENT_DATE)::date - r.fecha_hasta::date) <= 90 THEN '61-90 días'
			        ELSE 'Más de 90 días'
			    END
			ORDER BY r.id_frecuencia, dias_mora;

	END IF;

	IF v_iestado IS NULL OR v_iestado = 3 THEN

		OPEN p_cursor_eficiencia_productor FOR
			SELECT
			    p.descripcion AS productor,
			    SUM(
					CASE
						WHEN BTRIM(UPPER(COALESCE(r.moneda, ''))) IN ('$', 'USD', 'EUR', '€')
							THEN COALESCE(NULLIF(r.monto_recibo_ext, 0), r.monto_recibo)
						ELSE r.monto_recibo
					END
				) AS monto_total
			FROM recibo r
			JOIN productor p ON r.id_productor = p.id AND p.id_aseguradora = r.id_aseguradora
			WHERE r.id_estatus IN (3)
			  AND (v_id_aseguradora IS NULL OR r.id_aseguradora = v_id_aseguradora)
			  AND (v_fdesde IS NULL OR (r.fecha_desde BETWEEN v_fdesde AND v_fhasta AND r.fecha_hasta BETWEEN v_fdesde AND v_fhasta))
              AND (
                v_cmoneda IS NULL
                OR BTRIM(UPPER(COALESCE(r.moneda, ''))) = UPPER(v_cmoneda)
                OR (UPPER(v_cmoneda) IN ('$', 'USD') AND BTRIM(UPPER(COALESCE(r.moneda, ''))) IN ('$', 'USD'))
              )
			GROUP BY
			    p.descripcion
			ORDER BY monto_total desc
			limit 20;

	ELSE

		OPEN p_cursor_eficiencia_productor FOR
			SELECT
			    NULL::text AS productor,
			    NULL::numeric AS monto_total
			WHERE FALSE;

	END IF;

    -- 2. SEGUNDA CONSULTA: DETALLE_RECIBOS
    OPEN p_cursor_detalle FOR
        SELECT
            TO_CHAR(r.fecha_emision, 'DD/MM/YYYY') AS fecha_emision_poliza,
            TO_CHAR(r.fecha_desde, 'DD/MM/YYYY') AS fecha_desde,
            TO_CHAR(r.fecha_hasta, 'DD/MM/YYYY') AS fecha_hasta,
            r.poliza,
            r.recibo,
			r.numero_cuota,
            r.cliente,
            TRIM(r.cedula) AS cedula,
            TRIM(ram.descripcion) AS ramo,
            c.descripcion AS canal,
            p.descripcion AS productor_nombre,
            CASE
                WHEN r.id_frecuencia = 'A' THEN 'Anual'
                WHEN r.id_frecuencia = 'B' THEN 'Bimensual'
                WHEN r.id_frecuencia = 'E' THEN 'Especial'
                WHEN r.id_frecuencia = 'M' THEN 'Mensual'
                WHEN r.id_frecuencia = 'S' THEN 'Semestral'
				WHEN r.id_frecuencia = 'T' THEN 'Trimestral'
                ELSE r.id_frecuencia
            END AS frecuencia,
            e.descripcion AS estado_recibo,
			TO_CHAR(TRUNC(r.monto_recibo::NUMERIC, 2), 'FM999,999,990.00') AS monto_recibo,
			TO_CHAR(TRUNC(r.monto_recibo_ext::NUMERIC, 2), 'FM999,999,990.00') AS monto_moneda_extranjera,
			r.moneda,
            TO_CHAR(r.fecha_pago, 'DD/MM/YYYY') AS fecha_pago,
            r.fecha_anulacion,
            COALESCE(r.coberturas, '') AS coberturas
        FROM tmp_recibos_filtrados r
        JOIN estatus e ON r.id_estatus = e.id
        JOIN ramos ram ON r.id_ramo = ram.id AND ram.id_aseguradora = r.id_aseguradora
        LEFT JOIN canal c ON r.id_canal = c.id AND c.id_aseguradora = r.id_aseguradora
        LEFT JOIN productor p ON r.id_productor = p.id AND p.id_aseguradora = r.id_aseguradora
        ORDER BY r.poliza, r.recibo
        LIMIT CASE
            WHEN v_bexportar THEN 2147483647
            WHEN v_bpreview THEN LEAST(v_tamano, 100)
            ELSE v_tamano
        END
        OFFSET CASE WHEN v_bexportar THEN 0 ELSE v_offset END;

END;
$procedure$;
