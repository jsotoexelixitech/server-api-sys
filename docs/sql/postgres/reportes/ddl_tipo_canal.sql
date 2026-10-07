-- Tipo de canal en los reportes dinámicos de recibos y siniestros.
--
-- 1) Aditivo e idempotente: se puede ejecutar varias veces y NO afecta a los datos existentes.
-- 2) EJECUTAR ANTES de desplegar el código que escribe estas columnas; si no, el INSERT del sync
--    falla ("column ... does not exist") y los reportes dejan de actualizarse.
-- 3) Las filas ya cargadas quedan con tipo_canal NULL hasta recargar (ver docs/reportes/RPT_TIPO_CANAL.md).
--
-- cobertura_afectada: el código de sync ya la escribe en siniestro y en producción (PG reportes
-- 172.30.149.75, 2026-10-06) la columna no existe; en desarrollo es varchar(240).

ALTER TABLE public.recibo
  ADD COLUMN IF NOT EXISTS tipo_canal varchar(20);

ALTER TABLE public.siniestro
  ADD COLUMN IF NOT EXISTS id_canal integer,
  ADD COLUMN IF NOT EXISTS tipo_canal varchar(20),
  ADD COLUMN IF NOT EXISTS cobertura_afectada varchar(240);

COMMENT ON COLUMN public.recibo.tipo_canal IS 'Tipo de canal de la póliza: Alterno, Punto de venta, Tradicional, Directo (u Otro)';
COMMENT ON COLUMN public.siniestro.tipo_canal IS 'Tipo de canal de la póliza: Alterno, Punto de venta, Tradicional, Directo (u Otro)';
COMMENT ON COLUMN public.siniestro.id_canal IS 'Canal alterno de la póliza (canal.id); 0 si no tiene';

-- Rollback (solo si hiciera falta):
--   ALTER TABLE public.recibo DROP COLUMN IF EXISTS tipo_canal;
--   ALTER TABLE public.siniestro DROP COLUMN IF EXISTS tipo_canal, DROP COLUMN IF EXISTS id_canal;
