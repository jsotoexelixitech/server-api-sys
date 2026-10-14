-- Tipo de vehículo en los siniestros (reporte dinámico de siniestros, ramo automóvil).
--
-- Aditivo e idempotente. EJECUTAR ANTES de desplegar el backend que escribe esta columna;
-- si no, el INSERT del sync de siniestros falla ("column tipo_vehiculo does not exist").
-- Las filas ya cargadas quedan con NULL hasta recargar (reemplazo completo de siniestros).

ALTER TABLE public.siniestro
  ADD COLUMN IF NOT EXISTS tipo_vehiculo varchar(60);

COMMENT ON COLUMN public.siniestro.tipo_vehiculo IS 'Tipo de vehículo (matipos.xtipo vía vhcerti.ctipo): MOTOCICLETA, PARTICULARES, RUSTICO, CARGA...';

-- Rollback (solo si hiciera falta):
--   ALTER TABLE public.siniestro DROP COLUMN IF EXISTS tipo_vehiculo;
