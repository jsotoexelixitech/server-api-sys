-- nest_auth.arys_membership_job / arys_membership_attempt
-- Respaldo y reintento de membresías Arys/Sarys post-emisión.
-- Ejecutar en nest_api:
--   psql -h 192.168.8.120 -U jsoto -d nest_api -f docs/sql/postgres/nest-arys-membership.sql

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
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by             VARCHAR(80)
);

INSERT INTO nest_auth.arys_membership_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
