-- nest_auth.cfg_plan_cobro_dias
-- Configurador (product-builder): cobro por días de un plan Sis2000 (prima diaria por cobertura).
-- Sis2000 no tiene columnas para esto y no se altera: la configuración vive en la BD propia de nest-api.
-- Idempotente. Ejecutar en nest_api (la BD de NEST_PG_DATABASE_URL) con un usuario que pueda crear en nest_auth:
--   psql -h 192.168.8.120 -U <admin> -d nest_api -v app_role=<usuario_de_NEST_PG_DATABASE_URL> \
--        -f docs/sql/postgres/nest-cfg-plan-cobro-dias.sql

CREATE TABLE IF NOT EXISTS nest_auth.cfg_plan_cobro_dias (
  id              SERIAL PRIMARY KEY,
  cramo           INTEGER NOT NULL,
  cplan           VARCHAR(10) NOT NULL,
  activo          BOOLEAN NOT NULL DEFAULT false,
  dias_min        INTEGER NOT NULL CHECK (dias_min >= 1),
  dias_max        INTEGER NOT NULL CHECK (dias_max <= 366),
  cmoneda         VARCHAR(4),
  primas          JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{ "ccober": "1", "prima_diaria": 1.25 }]
  actualizado_por VARCHAR(80),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cfg_plan_cobro_dias_rango_chk CHECK (dias_max >= dias_min)
);

CREATE UNIQUE INDEX IF NOT EXISTS cfg_plan_cobro_dias_cramo_cplan_key
  ON nest_auth.cfg_plan_cobro_dias (cramo, cplan);

GRANT USAGE ON SCHEMA nest_auth TO :"app_role";
GRANT SELECT, INSERT, UPDATE ON nest_auth.cfg_plan_cobro_dias TO :"app_role";
GRANT USAGE, SELECT ON SEQUENCE nest_auth.cfg_plan_cobro_dias_id_seq TO :"app_role";

-- Verificación: debe decir t, t, t.
SELECT has_table_privilege(:'app_role', 'nest_auth.cfg_plan_cobro_dias', 'SELECT') AS puede_leer,
       has_table_privilege(:'app_role', 'nest_auth.cfg_plan_cobro_dias', 'INSERT') AS puede_insertar,
       has_table_privilege(:'app_role', 'nest_auth.cfg_plan_cobro_dias', 'UPDATE') AS puede_actualizar;
