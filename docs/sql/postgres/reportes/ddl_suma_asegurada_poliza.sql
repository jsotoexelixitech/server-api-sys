-- Suma asegurada de casco en el reporte de pólizas (poliza.suma_asegurada).
-- Aditivo e idempotente. EJECUTAR ANTES de desplegar el backend que escribe la columna; si no, el INSERT del
-- sync de pólizas falla ("column suma_asegurada does not exist"). Después aplicar sp_rpt_polizas_<entorno>.sql.
-- Aplicado: QA (192.168.8.121) 2026-11-17.
--
-- Regla (Automóvil, cramo 18): suma asegurada de las coberturas de casco
--   2 = PÉRDIDA TOTAL, 28 = PÉRDIDA PARCIAL, 1 = COBERTURA AMPLIA, en la moneda de la póliza (msumaasegext).
-- - Se lee por los recibos NO anulados de la anualidad (adrecibos -> adpolcob por crecibo):
--   las renovaciones guardan adpolcob con la anualidad anterior, y el adpolcob de un recibo anulado sigue en estado V.
-- - Por certificado se toma el máximo (las coberturas de casco cubren el mismo vehículo); la póliza suma sus
--   certificados (flotas).
-- - NULL si la póliza no tiene casco vigente (otros ramos, pólizas anuladas o endosos que quitaron el casco).

ALTER TABLE public.poliza
  ADD COLUMN IF NOT EXISTS suma_asegurada numeric(17, 4);

COMMENT ON COLUMN public.poliza.suma_asegurada IS
  'Automóvil: suma asegurada de casco (pérdida total, parcial o cobertura amplia) en la moneda de la póliza; NULL si no tiene casco';

-- Extracción (aseguradora_conexion.origen_config.polizas.querySql, SQL Server). Se agrega:
--
-- En el SELECT, después de prima_total:
--   CAST(sa.suma_casco AS numeric(17, 4)) AS suma_asegurada,
--
-- Después del LEFT JOIN de recibos (alias rc):
--   LEFT JOIN (
--     SELECT x.cpoliza, x.fanopol, x.fmespol, SUM(x.suma) AS suma_casco
--     FROM (
--       SELECT r.cpoliza, r.fanopol, r.fmespol, c.ccerti, MAX(c.msumaasegext) AS suma
--       FROM adrecibos r WITH (NOLOCK)
--       INNER JOIN adpolcob c WITH (NOLOCK) ON c.crecibo = r.crecibo AND c.cpoliza = r.cpoliza
--       WHERE r.iestadorec <> 'A' AND c.cramo = 18 AND RTRIM(c.ccober) IN ('1', '2', '28') AND RTRIM(c.iestado) <> 'A'
--       GROUP BY r.cpoliza, r.fanopol, r.fmespol, c.ccerti
--     ) x
--     GROUP BY x.cpoliza, x.fanopol, x.fmespol
--   ) sa ON pol.cramo = 18 AND sa.cpoliza = pol.cpoliza AND sa.fanopol = pol.fanopol AND sa.fmespol = pol.fmespol
--
-- Las filas ya cargadas quedan con suma_asegurada NULL hasta volver a sincronizar su rango (el sync por
-- diferencias las actualiza; no hace falta vaciar la tabla).
