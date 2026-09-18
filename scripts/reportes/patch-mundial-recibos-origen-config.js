/**
 * Actualiza solo origen_config.recibos (querySql con coberturas_agg) en aseguradora_conexion.
 * Uso: node scripts/reportes/patch-mundial-recibos-origen-config.js [CODIGO_ASEGURADORA]
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const CODIGO = process.argv[2] || 'MUNDIAL';
const SEED_PATH = path.resolve(
  __dirname,
  '../../docs/reportes/seed/mundial_recibos_origen.json',
);

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

async function main() {
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  if (!seed.recibos?.querySql) {
    throw new Error('Seed inválido: falta recibos.querySql');
  }

  const pool = new Pool(buildPoolConfig());
  const { rows } = await pool.query(
    `SELECT id, codigo, origen_config
     FROM aseguradora_conexion
     WHERE UPPER(codigo) = UPPER($1)`,
    [CODIGO],
  );

  if (rows.length === 0) {
    throw new Error(`No se encontró aseguradora_conexion con código ${CODIGO}`);
  }

  const row = rows[0];
  const origenConfig =
    row.origen_config && typeof row.origen_config === 'object'
      ? { ...row.origen_config }
      : {};

  origenConfig.recibos = {
    ...(origenConfig.recibos || {}),
    ...seed.recibos,
  };
  delete origenConfig.recibos.queryKey;
  delete origenConfig.recibos.source;

  await pool.query(
    `UPDATE aseguradora_conexion
     SET origen_config = $2::jsonb, modificado = NOW()
     WHERE id = $1`,
    [row.id, JSON.stringify(origenConfig)],
  );

  console.log(
    `origen_config.recibos actualizado (${row.codigo}, id=${row.id}); mode=${origenConfig.recibos.mode}`,
  );
  console.log(
    'Ejecute el reporte con forceSync:true o POST /reportes/sync?entidad=recibos&forceSync=true',
  );
  await pool.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
