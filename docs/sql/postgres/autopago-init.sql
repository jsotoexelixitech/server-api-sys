-- Autopago retail (Farmatodo): venta en caja → enlaces de emisión por unidad.
-- nest-api las crea solas al arrancar (AutopagoStoreService.onModuleInit) en la BD de NEST_PG_DATABASE_URL.
-- Este archivo es referencia / para crearlas a mano:
--   psql "$NEST_PG_DATABASE_URL" -f docs/sql/postgres/autopago-init.sql

CREATE SCHEMA IF NOT EXISTS nest_auth;

-- Cabecera: una fila por ticket de caja (única por canal + factura).
CREATE TABLE IF NOT EXISTS nest_auth.autopago_venta (
  id           SERIAL PRIMARY KEY,
  ccanalalt    INTEGER NOT NULL DEFAULT 0,       -- macanalalt.ccanalalt del integrador (0 = sin canal)
  cproductor   INTEGER,
  nfactura     VARCHAR(20) NOT NULL,
  fventa       TIMESTAMPTZ NOT NULL,
  tipo_persona CHAR(1) NOT NULL,                 -- V/E/J/G/P
  cci_rif      VARCHAR(15) NOT NULL,
  xcliente     VARCHAR(100) NOT NULL,
  xcorreo      VARCHAR(100) NOT NULL,
  xtelefono    VARCHAR(20),
  xsucursal    VARCHAR(250),
  mmonto       NUMERIC(14,2),
  cmoneda      VARCHAR(3),
  api_key      VARCHAR(40),                      -- prefijo de la API key que registró la venta
  xpayload_raw JSONB NOT NULL,                   -- JSON recibido tal cual (conciliación)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ccanalalt, nfactura)
);

-- Detalle: una fila (y un enlace) por unidad vendida.
CREATE TABLE IF NOT EXISTS nest_auth.autopago_venta_item (
  id              SERIAL PRIMARY KEY,
  venta_id        INTEGER NOT NULL REFERENCES nest_auth.autopago_venta(id) ON DELETE CASCADE,
  ncorrelativo    INTEGER NOT NULL,              -- 1..N dentro del ticket
  token           VARCHAR(64) NOT NULL UNIQUE,   -- secreto del enlace (?ap=)
  csku            VARCHAR(30) NOT NULL,
  cproducto       VARCHAR(20),
  cramo           INTEGER,
  cplan           VARCHAR(6),
  xproducto       VARCHAR(250),
  xplan           VARCHAR(250),
  tipo_formulario VARCHAR(40),                   -- rcv | personas
  iestado         CHAR(1) NOT NULL DEFAULT 'P',  -- P pendiente · E emitida · A anulada
  cnpoliza        VARCHAR(30),
  cpoliza         NUMERIC(19,0),
  fanopol         INTEGER,
  fmespol         INTEGER,
  casegurado      NUMERIC(11,0),
  femision        TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venta_id, ncorrelativo)
);

CREATE INDEX IF NOT EXISTS autopago_venta_item_venta_idx ON nest_auth.autopago_venta_item (venta_id);
