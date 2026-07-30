-- Enlace Swagger filtrado por token (docs_slug en api_key)
-- Ejecutar en nest_api / esquema nest_auth

ALTER TABLE nest_auth.api_key
  ADD COLUMN IF NOT EXISTS docs_slug VARCHAR(48);

CREATE UNIQUE INDEX IF NOT EXISTS api_key_docs_slug_key
  ON nest_auth.api_key (docs_slug)
  WHERE docs_slug IS NOT NULL;
