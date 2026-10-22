-- Pólizas QA (PG reportes 192.168.8.121): claves con fecha ISO y sin duplicados.
--
-- Problema: la clave compuesta numero_poliza|id_ramo|fecha_emision_poliza se armaba con String(Date), que depende de la
-- zona horaria del proceso ("Sun Jan 04 2026 20:00:00 GMT-0400 (hora de Bolivia)" vs "Mon Jan 05 2026 00:00:00 GMT+0000").
-- La misma póliza quedaba dos veces: una fila vieja (sin coberturas) y otra nueva.
-- El backend ahora arma la fecha como YYYY-MM-DD (column-mapper.ts), igual que en Producción.
--
-- Aplicar ANTES (o junto) con el despliegue del backend; si no, el próximo sync vuelve a insertar cada póliza con la clave nueva.
-- Producción NO lo necesita: sus claves ya son YYYY-MM-DD y no tiene duplicados.
-- Todo en una transacción. Revise los conteos del paso 0 antes del COMMIT.

BEGIN;

-- 0) Diagnóstico (solo lectura)
SELECT
  count(*)                                                        AS filas,
  count(*) FILTER (WHERE origen_clave !~ '\|\d{4}-\d{2}-\d{2}$')  AS claves_no_iso,
  count(*) - count(DISTINCT (id_aseguradora, numero_poliza, id_ramo, fecha_emision_poliza)) AS filas_duplicadas
FROM public.poliza;

-- 1) Duplicados: por póliza (aseguradora, número, ramo, fecha de emisión) se queda la fila con coberturas y, entre
--    ellas, la sincronizada más reciente.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY id_aseguradora, numero_poliza, id_ramo, fecha_emision_poliza
           ORDER BY (NULLIF(TRIM(coberturas), '') IS NOT NULL) DESC, synced_at DESC NULLS LAST, id DESC
         ) AS rn
  FROM public.poliza
)
DELETE FROM public.poliza p
USING ranked r
WHERE p.id = r.id AND r.rn > 1;

-- 2) Clave con fecha YYYY-MM-DD (mismo formato que arma el backend: partes nulas quedan vacías).
UPDATE public.poliza
SET origen_clave = COALESCE(numero_poliza, '') || '|' || COALESCE(id_ramo::text, '') || '|' ||
                   COALESCE(to_char(fecha_emision_poliza, 'YYYY-MM-DD'), '')
WHERE origen_clave IS DISTINCT FROM
      COALESCE(numero_poliza, '') || '|' || COALESCE(id_ramo::text, '') || '|' ||
      COALESCE(to_char(fecha_emision_poliza, 'YYYY-MM-DD'), '');

-- 3) Verificación: debe dar 0 y 0
SELECT
  count(*) FILTER (WHERE origen_clave !~ '\|\d{4}-\d{2}-\d{2}$' AND fecha_emision_poliza IS NOT NULL) AS claves_no_iso,
  count(*) - count(DISTINCT (id_aseguradora, numero_poliza, id_ramo, fecha_emision_poliza))        AS filas_duplicadas
FROM public.poliza;

COMMIT;   -- o ROLLBACK si los conteos no cuadran
