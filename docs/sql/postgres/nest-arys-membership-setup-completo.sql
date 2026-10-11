-- Preparación completa de la BD para el respaldo/reintento de membresías Arys y el monitor.
-- Une en un solo paso: tablas + config (nest-arys-membership.sql) y permisos (nest-arys-membership-grants.sql).
-- Idempotente: se puede ejecutar varias veces. Todo corre en una transacción: si algo falla, no queda nada a medias.
--
-- Cuándo: la BD no tiene las tablas (error Prisma "The table `nest_auth.arys_membership_config` does not exist")
-- o faltan columnas / permisos para el usuario de la app.
--
-- Ejecutar con un usuario ADMINISTRADOR (dueño del esquema nest_auth) en la BD que usa la app
-- (la de NEST_PG_DATABASE_URL del .env), indicando el usuario de ESE .env:
--   psql -h <host> -U <admin> -d nest_api -v app_role=<usuario_del_.env> \
--        -f docs/sql/postgres/nest-arys-membership-setup-completo.sql
--
-- Después NO hace falta reiniciar PM2 (la config se relee cada ~30 s). La config nace con todo apagado.

\set ON_ERROR_STOP on

\if :{?app_role}
\else
  \echo 'ERROR: falta -v app_role=<usuario de la app>. Ejemplo: psql ... -v app_role=nexus_user -f este_archivo.sql'
  \quit
\endif

\echo 'Usuario de la app:' :app_role
BEGIN;

-- =============================== 1) Tablas y configuración ===============================

CREATE TABLE IF NOT EXISTS nest_auth.arys_membership_job (
  id               TEXT PRIMARY KEY,
  cnpoliza         VARCHAR(30) NOT NULL UNIQUE,
  cpoliza          VARCHAR(19),
  xplaca           VARCHAR(15),
  tipo_membresia   INTEGER NOT NULL,
  status           VARCHAR(12) NOT NULL DEFAULT 'PENDING', -- PENDING | RETRYING | SUCCESS | FAILED | DEAD
  attempts         INTEGER NOT NULL DEFAULT 0,
  max_attempts     INTEGER NOT NULL DEFAULT 5,
  last_stage       VARCHAR(20),                            -- propietario | vehiculo | coberturas | subscripcion
  persona_id       INTEGER,
  vehiculo_id      INTEGER,
  last_error       TEXT,
  last_http_status INTEGER,
  next_retry_at    TIMESTAMPTZ,
  succeeded_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS arys_membership_job_status_next_retry_at_idx
  ON nest_auth.arys_membership_job (status, next_retry_at);

CREATE TABLE IF NOT EXISTS nest_auth.arys_membership_attempt (
  id            TEXT PRIMARY KEY,
  job_id        TEXT NOT NULL REFERENCES nest_auth.arys_membership_job (id) ON DELETE CASCADE,
  attempt_no    INTEGER NOT NULL,
  ok            BOOLEAN NOT NULL,
  stage         VARCHAR(20),
  http_status   INTEGER,
  error         TEXT,
  request_body  JSONB,
  response_body TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS arys_membership_attempt_job_id_idx
  ON nest_auth.arys_membership_attempt (job_id);

-- Configuración editable en caliente (fila única). Cambiarla aquí o con PUT /v1/arys/membership/config;
-- el servicio la relee cada ~30 s, sin reiniciar PM2.
CREATE TABLE IF NOT EXISTS nest_auth.arys_membership_config (
  id                     INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  retry_enabled          BOOLEAN NOT NULL DEFAULT FALSE,  -- reintento automático
  retry_interval_seconds INTEGER NOT NULL DEFAULT 300,    -- cada cuánto corre el reintento
  max_attempts           INTEGER NOT NULL DEFAULT 5,      -- tras esto el trabajo pasa a DEAD
  retry_base_minutes     INTEGER NOT NULL DEFAULT 15,     -- backoff: base * 2^(intentos-1)
  retry_max_minutes      INTEGER NOT NULL DEFAULT 360,    -- tope del backoff
  batch_size             INTEGER NOT NULL DEFAULT 10,     -- trabajos por ciclo
  monitor_enabled        BOOLEAN NOT NULL DEFAULT FALSE,  -- reportar fallos a Exelixi Monitor
  monitor_url            VARCHAR(300),                    -- ej. http://127.0.0.1:3099/monitor-api/events/business
  monitor_app_id         VARCHAR(80) NOT NULL DEFAULT 'sysip-nest-api', -- id en inventory.json del monitor
  monitor_token          VARCHAR(200),                    -- MONITOR_INGEST_TOKEN del monitor
  monitor_report_5xx     BOOLEAN NOT NULL DEFAULT TRUE,   -- reportar todo 5xx de la API al monitor
  monitor_security_observe BOOLEAN NOT NULL DEFAULT FALSE, -- observar tráfico externo (solo dry-run, nunca bloquea)
  monitor_security_enforce BOOLEAN NOT NULL DEFAULT FALSE, -- hacer cumplir la blocklist del monitor (403); apagado por defecto
  arys_emission_enabled  BOOLEAN NOT NULL DEFAULT TRUE,   -- emitir membresía Arys en TODA emisión de automóvil
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by             VARCHAR(80)
);

INSERT INTO nest_auth.arys_membership_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Si la tabla ya existía sin las columnas del monitor:
ALTER TABLE nest_auth.arys_membership_config
  ADD COLUMN IF NOT EXISTS monitor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS monitor_url     VARCHAR(300),
  ADD COLUMN IF NOT EXISTS monitor_app_id  VARCHAR(80) NOT NULL DEFAULT 'sysip-nest-api',
  ADD COLUMN IF NOT EXISTS monitor_token   VARCHAR(200),
  ADD COLUMN IF NOT EXISTS monitor_report_5xx BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS monitor_security_observe BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS monitor_security_enforce BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS arys_emission_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Activar el reporte al monitor (sin reiniciar PM2):
--   UPDATE nest_auth.arys_membership_config
--   SET monitor_enabled = TRUE,
--       monitor_url = 'http://127.0.0.1:3099/monitor-api/events/business',
--       monitor_token = '<MONITOR_INGEST_TOKEN>'
--   WHERE id = 1;

-- =============================== 2) Permisos del usuario de la app ===============================
GRANT USAGE ON SCHEMA nest_auth TO :"app_role";

GRANT SELECT, INSERT, UPDATE, DELETE ON
  nest_auth.arys_membership_job,
  nest_auth.arys_membership_attempt,
  nest_auth.arys_membership_config
TO :"app_role";

-- Verificación: las tres filas deben decir "t".
SELECT t AS tabla,
       has_table_privilege(:'app_role', 'nest_auth.' || t, 'SELECT')  AS puede_leer,
       has_table_privilege(:'app_role', 'nest_auth.' || t, 'INSERT')  AS puede_insertar,
       has_table_privilege(:'app_role', 'nest_auth.' || t, 'UPDATE')  AS puede_actualizar
FROM (VALUES ('arys_membership_job'), ('arys_membership_attempt'), ('arys_membership_config')) AS v(t);

-- =============================== 3) Verificación final ===============================
SELECT id, retry_enabled, monitor_enabled, monitor_security_observe, monitor_security_enforce, arys_emission_enabled
FROM nest_auth.arys_membership_config;

COMMIT;
\echo 'Listo. Las tres filas de permisos deben decir "t" y la config debe mostrar id = 1.'
