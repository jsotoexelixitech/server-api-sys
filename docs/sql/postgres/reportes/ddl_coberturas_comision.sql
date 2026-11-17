-- Coberturas en el reporte de comisiones (comision.coberturas).
-- Aditivo e idempotente. Las filas ya cargadas quedan con coberturas vacías hasta el siguiente sync de esas comisiones.
ALTER TABLE public.comision
  ADD COLUMN IF NOT EXISTS coberturas varchar(1000);
COMMENT ON COLUMN public.comision.coberturas IS 'Coberturas del recibo (descripciones distintas de adpolcob/macoberturas, separadas por " / ")';
-- Rollback: ALTER TABLE public.comision DROP COLUMN IF EXISTS coberturas;
