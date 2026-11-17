-- Coberturas en el reporte de pólizas (poliza.coberturas).
-- Aditivo e idempotente. EJECUTAR ANTES de desplegar el backend que escribe la columna y antes de aplicar el SP nuevo;
-- si no, el INSERT del sync de pólizas falla ("column coberturas does not exist").
-- Las filas ya cargadas quedan con coberturas vacías hasta recargar (sync de pólizas con forceSync).

ALTER TABLE public.poliza
  ADD COLUMN IF NOT EXISTS coberturas varchar(1000);

COMMENT ON COLUMN public.poliza.coberturas IS 'Coberturas contratadas de la póliza (descripciones distintas de adpolcob/macoberturas, separadas por " / ")';

-- Rollback (solo si hiciera falta):
--   ALTER TABLE public.poliza DROP COLUMN IF EXISTS coberturas;
