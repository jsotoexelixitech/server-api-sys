-- Placa y tipo de vehículo en los recibos (reporte dinámico de recibos, ramo automóvil).
--
-- Aditivo e idempotente. EJECUTAR ANTES de desplegar el backend que escribe estas columnas;
-- si no, el INSERT del sync de recibos falla ("column ... does not exist").
-- Las filas ya cargadas quedan con NULL hasta recargar (ver docs/reportes/RPT_TIPO_CANAL.md).

ALTER TABLE public.recibo
  ADD COLUMN IF NOT EXISTS placa varchar(15),
  ADD COLUMN IF NOT EXISTS tipo_vehiculo varchar(60);

COMMENT ON COLUMN public.recibo.placa IS 'Placa del vehículo del certificado (vhcerti.xplaca); solo ramo automóvil';
COMMENT ON COLUMN public.recibo.tipo_vehiculo IS 'Tipo de vehículo (matipos.xtipo vía vhcerti.ctipo): MOTOCICLETA, PARTICULARES, RUSTICO, CARGA...';

-- Rollback (solo si hiciera falta):
--   ALTER TABLE public.recibo DROP COLUMN IF EXISTS placa, DROP COLUMN IF EXISTS tipo_vehiculo;
