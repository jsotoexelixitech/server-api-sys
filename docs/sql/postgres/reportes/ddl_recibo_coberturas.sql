-- Columna coberturas en recibo (resumen STRING_AGG desde Sis2000 adpolcob/macoberturas)
-- Ejecutar contra PostgreSQL reportes

BEGIN;

ALTER TABLE public.recibo
  ADD COLUMN IF NOT EXISTS coberturas VARCHAR(1000);

COMMENT ON COLUMN public.recibo.coberturas IS
  'Coberturas asociadas al recibo (descripciones concatenadas desde adpolcob + macoberturas)';

COMMIT;
