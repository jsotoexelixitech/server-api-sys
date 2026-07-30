-- nest_auth.api_key — canal / subcanal (Sis2000 macanalalt)
-- Ejecutar en nest_api si la tabla ya existía sin estas columnas:
--   psql -h 192.168.8.120 -U jsoto -d nest_api -f docs/sql/postgres/nest-auth-add-canal.sql

ALTER TABLE nest_auth.api_key
  ADD COLUMN IF NOT EXISTS ccanalalt  INTEGER,
  ADD COLUMN IF NOT EXISTS cscanalalt INTEGER,
  ADD COLUMN IF NOT EXISTS ctipocanal CHAR(1);

COMMENT ON COLUMN nest_auth.api_key.ccanalalt IS 'Canal alterno Sis2000 (macanalalt.ccanalalt)';
COMMENT ON COLUMN nest_auth.api_key.cscanalalt IS 'Subcanal Sis2000 (macanalalt / magestor)';
COMMENT ON COLUMN nest_auth.api_key.ctipocanal IS 'Tipo canal T/A/D — opcional si se deriva de macanalalt';
