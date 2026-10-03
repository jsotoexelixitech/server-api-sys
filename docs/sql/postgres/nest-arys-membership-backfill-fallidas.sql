-- Carga de las membresías Arys que fallaron antes de existir el respaldo (arys_membership_job).
-- Fuente: ~/.pm2/logs/sysip-nest-api-out.log (srv 172.30.149.75), 19/09/2026 – 03/10/2026.
-- Todas fallaron en la etapa "subscripcion": Arys respondió HTTP 500 en
--   POST /api/v1/Cotizador/RegistrarSubcripcion/{vehiculoId}/{personaId}/6
-- El propietario y el vehículo SÍ se crearon en Arys (ids abajo), por eso el reintento los reutiliza.
--
-- Requiere haber ejecutado antes nest-arys-membership.sql.
--   psql -h 192.168.8.120 -U jsoto -d nest_api -f docs/sql/postgres/nest-arys-membership-backfill-fallidas.sql
--
-- Idempotente: si la póliza ya tiene un trabajo, no se toca (ON CONFLICT DO NOTHING).
-- Quedan como FAILED con next_retry_at = NULL, es decir, el reintento automático NO las toma
-- hasta que se liberen (ver el bloque final). Esto es intencional: confirmar primero con Arys que
-- el 500 no dejó la membresía creada, para no duplicarla.

BEGIN;

WITH fallidas (cnpoliza, xplaca, persona_id, vehiculo_id, fallo_local) AS (
  VALUES
    ('18-1-0000122727', 'AC124K11', 67815, 68435, TIMESTAMP '2026-09-19 03:27:58'),
    ('18-1-0000122983', 'AS7T59M',  68089, 68598, TIMESTAMP '2026-09-21 13:54:34'),
    ('18-1-0000123890', 'AX3A90A',  69120, 69246, TIMESTAMP '2026-09-24 14:47:56'),
    ('18-1-0000124179', 'AL1Z00J',  69431, 69450, TIMESTAMP '2026-09-25 15:14:27'),
    ('18-1-0000125806', 'AA442AM',  71277, 70682, TIMESTAMP '2026-10-01 17:38:03'),
    ('18-1-0000125919', '7A6A1IU',  71413, 70765, TIMESTAMP '2026-10-01 22:48:17'),
    ('18-1-0000125966', 'AC197IG',  71468, 70800, TIMESTAMP '2026-10-02 13:49:24'),
    ('18-1-0000126024', 'AO6T28D',  71533, 70840, TIMESTAMP '2026-10-02 15:04:52'),
    ('18-1-0000126299', 'ACON93K',  71873, 71068, TIMESTAMP '2026-10-03 12:41:55'),
    ('18-1-0000126309', 'ADB07E',   71890, 71078, TIMESTAMP '2026-10-03 13:33:30'),
    ('18-1-0000126327', 'AE141XM',  71911, 71091, TIMESTAMP '2026-10-03 14:19:43'),
    ('18-1-0000126339', 'AC978EP',  71930, 71105, TIMESTAMP '2026-10-03 14:49:48')
),
nuevos AS (
  INSERT INTO nest_auth.arys_membership_job (
    id, cnpoliza, xplaca, tipo_membresia, status, attempts, max_attempts,
    last_stage, persona_id, vehiculo_id, last_error, last_http_status,
    next_retry_at, created_at, updated_at
  )
  SELECT
    'backfill-' || f.cnpoliza,
    f.cnpoliza,
    f.xplaca,
    6,
    'FAILED',
    1,
    5,
    'subscripcion',
    f.persona_id,
    f.vehiculo_id,
    'Arys respondió HTTP 500 en /api/v1/Cotizador/RegistrarSubcripcion/'
      || f.vehiculo_id || '/' || f.persona_id || '/6.',
    500,
    NULL,
    f.fallo_local AT TIME ZONE 'America/Caracas',
    f.fallo_local AT TIME ZONE 'America/Caracas'
  FROM fallidas f
  ON CONFLICT (cnpoliza) DO NOTHING
  RETURNING id, cnpoliza, vehiculo_id, persona_id, created_at
)
INSERT INTO nest_auth.arys_membership_attempt (
  id, job_id, attempt_no, ok, stage, http_status, error, created_at
)
SELECT
  n.id || '-1',
  n.id,
  1,
  FALSE,
  'subscripcion',
  500,
  'Arys respondió HTTP 500 en /api/v1/Cotizador/RegistrarSubcripcion/'
    || n.vehiculo_id || '/' || n.persona_id || '/6. (recuperado de logs PM2; sin cuerpo de respuesta)',
  n.created_at
FROM nuevos n;

-- Verificación: deben aparecer las 12 pólizas.
SELECT cnpoliza, xplaca, status, last_stage, persona_id, vehiculo_id, last_http_status, created_at
FROM nest_auth.arys_membership_job
WHERE id LIKE 'backfill-%'
ORDER BY created_at;

COMMIT;

-- ---------------------------------------------------------------------------------------------
-- LIBERAR PARA REINTENTO (ejecutar solo después de confirmar con Arys que no hay membresías
-- duplicadas, y con retry_enabled = true en nest_auth.arys_membership_config):
--
--   UPDATE nest_auth.arys_membership_job
--   SET next_retry_at = now()
--   WHERE id LIKE 'backfill-%' AND status = 'FAILED';
--
-- Alternativa, una por una:  POST /api/v1/arys/membership/{cnpoliza}/retry
-- ---------------------------------------------------------------------------------------------
