/**
 * PostgreSQL reportes: columna recibo.coberturas + SP detalle con coberturas.
 * Uso (desde server-api-sys, con .env REPORTES_PG_*):
 *   node scripts/reportes/apply-recibos-coberturas-pg.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function buildPoolConfig() {
  const host = process.env.REPORTES_PG_HOST;
  const user = process.env.REPORTES_PG_USER;
  const database = process.env.REPORTES_PG_DATABASE || 'reportes';
  if (!host || !user) {
    throw new Error('Defina REPORTES_PG_HOST y REPORTES_PG_USER en .env');
  }
  return {
    host,
    port: Number(process.env.REPORTES_PG_PORT || 5432),
    user,
    password: process.env.REPORTES_PG_PASSWORD || '',
    database,
    ssl: process.env.REPORTES_PG_ENCRYPT === 'true' ? { rejectUnauthorized: false } : undefined,
  };
}

async function applyFile(pool, relativePath) {
  const full = path.resolve(__dirname, relativePath);
  const sql = fs.readFileSync(full, 'utf8');
  console.log(`→ ${relativePath}`);
  await pool.query(sql);
  console.log(`✔ ${relativePath}`);
}

async function main() {
  const pool = new Pool(buildPoolConfig());
  try {
    await applyFile(pool, '../../docs/sql/postgres/reportes/ddl_recibo_coberturas.sql');
    await applyFile(
      pool,
      '../../docs/sql/postgres/reportes/sp_patch_recibos_v6_catalog_join.sql',
    );
    console.log(
      '✔ PG listo. Actualice origen_config.recibos y re-sincronice: node scripts/reportes/patch-mundial-recibos-origen-config.js',
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('✖', err.message);
  process.exitCode = 1;
});
