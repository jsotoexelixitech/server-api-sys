-- =============================================================================
-- Arys · reclasificar los DEAD por error de datos como NEEDS_DATA (opcional)
-- Fecha: 2026-11-08 · BD nest_api, esquema nest_auth
--
-- Desde fix/arys-errores-datos, un error de datos (estado/ciudad/marca/modelo/versión/color sin
-- equivalente, teléfono vacío, catálogo incompleto, rechazo result=0 de Arys) queda en NEEDS_DATA
-- desde el primer intento, sin reintentos. Este script aplica la misma regla a los DEAD anteriores
-- para que el listado por estado los muestre igual. No borra nada ni toca los intentos.
-- No requiere DDL: status es VARCHAR(12) sin CHECK.
-- =============================================================================

-- 1) Vista previa
SELECT status, last_stage, left(last_error, 60) AS error, count(*) AS jobs
FROM nest_auth.arys_membership_job
WHERE status = 'DEAD'
  AND last_http_status IS NULL
  AND (   last_error LIKE 'Estado no encontrado en Arys%'
       OR last_error LIKE 'Ciudad no encontrada en Arys%'
       OR last_error LIKE 'Marca no encontrada en Arys%'
       OR last_error LIKE 'Modelo no encontrado en Arys%'
       OR last_error LIKE 'Versión no encontrada en Arys%'
       OR last_error LIKE 'Color no encontrado en Arys%'
       OR last_error LIKE 'Catálogo Arys incompleto%'
       OR last_error LIKE 'El teléfono del titular%'
       OR last_error LIKE 'Arys rechazó el registro%')
GROUP BY 1, 2, 3
ORDER BY jobs DESC;

-- 2) Aplicar (revisar antes la vista previa)
BEGIN;
UPDATE nest_auth.arys_membership_job
SET status = 'NEEDS_DATA', next_retry_at = NULL, updated_at = now()
WHERE status = 'DEAD'
  AND last_http_status IS NULL
  AND (   last_error LIKE 'Estado no encontrado en Arys%'
       OR last_error LIKE 'Ciudad no encontrada en Arys%'
       OR last_error LIKE 'Marca no encontrada en Arys%'
       OR last_error LIKE 'Modelo no encontrado en Arys%'
       OR last_error LIKE 'Versión no encontrada en Arys%'
       OR last_error LIKE 'Color no encontrado en Arys%'
       OR last_error LIKE 'Catálogo Arys incompleto%'
       OR last_error LIKE 'El teléfono del titular%'
       OR last_error LIKE 'Arys rechazó el registro%');
-- Debe decir UPDATE 52 aprox. (todos los DEAD del 08-nov menos 18-1-0000122727). Si cuadra:
COMMIT;
-- Si no: ROLLBACK;
