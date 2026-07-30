-- Migración: enlace Swagger filtrado por token (docs_slug)
-- REGLA: solo ADD COLUMN + índice — NO borra ni modifica filas existentes.
-- BD: nest_api · esquema nest_auth
--
-- Ejecutar en srv001 (quitar ?schema=nest_auth — es solo para Prisma, psql no lo acepta):
--   cd ~/server-api-sys
--   PGURL=$(grep '^NEST_PG_DATABASE_URL=' .env | cut -d= -f2- | sed 's/?schema=nest_auth//')
--   psql "$PGURL" -f docs/sql/postgres/nest-auth-add-docs-slug.sql
--
-- Alternativa inline (misma migración, no borra datos):
--   psql "$PGURL" -c "ALTER TABLE nest_auth.api_key ADD COLUMN IF NOT EXISTS docs_slug VARCHAR(48);"
--   psql "$PGURL" -c "CREATE UNIQUE INDEX IF NOT EXISTS api_key_docs_slug_key ON nest_auth.api_key (docs_slug) WHERE docs_slug IS NOT NULL;"

ALTER TABLE nest_auth.api_key
  ADD COLUMN IF NOT EXISTS docs_slug VARCHAR(48);

CREATE UNIQUE INDEX IF NOT EXISTS api_key_docs_slug_key
  ON nest_auth.api_key (docs_slug)
  WHERE docs_slug IS NOT NULL;

-- Verificación (opcional):
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'nest_auth' AND table_name = 'api_key' AND column_name = 'docs_slug';
