-- nest-api · PostgreSQL auth (esquema nest_auth)
-- Servidor: srv001 · 192.168.8.120:5432
-- Ejecutar como superuser (postgres) o rol con CREATEDB.
--
-- Después en nest-api:
--   NEST_PG_DATABASE_URL=postgresql://jsoto:***@192.168.8.120:5432/nest_api?schema=nest_auth
--   npx prisma db push
--   npx prisma generate

-- 1) Base dedicada (opcional si ya existe)
SELECT 'CREATE DATABASE nest_api OWNER jsoto'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'nest_api')\gexec

\c nest_api

-- 2) Esquema aislado
CREATE SCHEMA IF NOT EXISTS nest_auth AUTHORIZATION jsoto;

GRANT USAGE ON SCHEMA nest_auth TO jsoto;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA nest_auth TO jsoto;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA nest_auth TO jsoto;

ALTER DEFAULT PRIVILEGES IN SCHEMA nest_auth
  GRANT ALL ON TABLES TO jsoto;
ALTER DEFAULT PRIVILEGES IN SCHEMA nest_auth
  GRANT ALL ON SEQUENCES TO jsoto;

COMMENT ON SCHEMA nest_auth IS 'API keys, sesiones JWT y refresh tokens de sysip-nest-api';
