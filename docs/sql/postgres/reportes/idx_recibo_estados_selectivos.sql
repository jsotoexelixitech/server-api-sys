-- Índices parciales para los estados selectivos de recibo (sp_rpt_recibos_v6).
--
-- Medido con EXPLAIN en PG reportes (250.913 filas, 2026-10-05):
--   Pendiente (id_estatus=2, por fecha_hasta)   ~1.3k filas  -> Parallel Seq Scan
--   Anulado   (id_estatus=4, por fecha_anulacion) ~3.3k filas -> Parallel Seq Scan
--   Cobrado   (id_estatus=3, por fecha_pago)     ~70k filas  -> Seq Scan (28 % de la tabla)
--   Sin estado (por fecha_desde)                 ~110k filas -> Seq Scan (44 % de la tabla)
--
-- Cobrado y "sin estado" leen una fracción grande de la tabla: un índice no cambia el plan,
-- por eso NO se crean para ellos. Los parciales de abajo son pequeños y solo cubren los
-- estados donde el filtro es selectivo.
--
-- Ejecutar con un usuario con permiso DDL. CONCURRENTLY no bloquea escrituras (el sync) pero
-- no puede correr dentro de una transacción: lanzar cada sentencia por separado.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recibo_pendiente_hasta
  ON public.recibo (id_aseguradora, fecha_hasta)
  WHERE id_estatus = 2 AND fecha_pago IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_recibo_anulado_fecha
  ON public.recibo (id_aseguradora, fecha_anulacion)
  WHERE id_estatus = 4;

-- Verificación posterior:
--   EXPLAIN SELECT * FROM recibo
--   WHERE id_estatus = 2 AND fecha_pago IS NULL AND fecha_hasta BETWEEN '2026-01-01' AND '2026-09-14';
--   (debe usar idx_recibo_pendiente_hasta)
--
-- Rollback:
--   DROP INDEX CONCURRENTLY IF EXISTS public.idx_recibo_pendiente_hasta;
--   DROP INDEX CONCURRENTLY IF EXISTS public.idx_recibo_anulado_fecha;
