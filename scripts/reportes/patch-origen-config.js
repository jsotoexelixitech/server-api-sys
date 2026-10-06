/**
 * Aplica a aseguradora_conexion.origen_config[entidad] el contenido del seed versionado en
 * docs/reportes/seed/<aseguradora>_<entidad>_origen.json (querySql, dateColByEstado, filterParams...).
 *
 * Uso:
 *   node scripts/reportes/patch-origen-config.js [CODIGO] [entidad] [--apply]
 *     CODIGO   código de aseguradora (defecto MUNDIAL)
 *     entidad  recibos | siniestros (defecto recibos)
 *     --apply  escribe en la base; sin él solo muestra qué cambiaría (simulación)
 *
 * Antes de escribir guarda el origen_config actual en origen_config_backup_<codigo>_<entidad>_<fecha>.json
 * (en el directorio actual). Conexión: REPORTES_PG_* (.env o variables de entorno).
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const APPLY = process.argv.includes('--apply');
const CODIGO = (args[0] || 'MUNDIAL').toUpperCase();
const ENTIDAD = (args[1] || 'recibos').toLowerCase();

if (!['recibos', 'siniestros'].includes(ENTIDAD)) {
  console.error(`Entidad no soportada: ${ENTIDAD} (use recibos o siniestros)`);
  process.exit(1);
}

const SEED_PATH = path.resolve(
  __dirname,
  `../../docs/reportes/seed/${CODIGO.toLowerCase()}_${ENTIDAD}_origen.json`,
);

function buildPoolConfig() {
  const host = process.env.REPORTES_PG_HOST;
  const user = process.env.REPORTES_PG_USER;
  if (!host || !user) throw new Error('Defina REPORTES_PG_HOST y REPORTES_PG_USER');
  return {
    host,
    port: Number(process.env.REPORTES_PG_PORT || 5432),
    user,
    password: process.env.REPORTES_PG_PASSWORD || '',
    database: process.env.REPORTES_PG_DATABASE || 'reportes',
    ssl: process.env.REPORTES_PG_ENCRYPT === 'true' ? { rejectUnauthorized: false } : undefined,
  };
}

async function main() {
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  const nuevo = seed[ENTIDAD];
  if (!nuevo?.querySql) throw new Error(`Seed inválido: falta ${ENTIDAD}.querySql en ${SEED_PATH}`);

  const pool = new Pool(buildPoolConfig());
  try {
    const { rows } = await pool.query(
      `SELECT id, codigo, origen_config FROM aseguradora_conexion WHERE UPPER(codigo) = $1`,
      [CODIGO],
    );
    if (rows.length !== 1) {
      throw new Error(`Se esperaba 1 aseguradora ${CODIGO}, hay ${rows.length}`);
    }
    const { id, origen_config: actualCfg } = rows[0];
    const origenConfig = actualCfg && typeof actualCfg === 'object' ? { ...actualCfg } : {};
    const previo = origenConfig[ENTIDAD] || {};

    // jsonb no conserva el orden de las claves: comparar con claves ordenadas.
    const estable = (v) =>
      JSON.stringify(v, (_, x) =>
        x && typeof x === 'object' && !Array.isArray(x)
          ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b)))
          : x,
      );
    const cambios = Object.keys(nuevo).filter((k) => estable(previo[k]) !== estable(nuevo[k]));
    console.log(`${CODIGO} (id=${id}) · ${ENTIDAD}: ${cambios.length} clave(s) cambian → ${cambios.join(', ') || 'ninguna'}`);
    if (cambios.length === 0) return;
    if (cambios.includes('querySql')) {
      console.log(`  querySql: ${String(previo.querySql || '').length} → ${nuevo.querySql.length} caracteres`);
    }

    if (!APPLY) {
      console.log('Simulación: no se escribió nada. Repita con --apply para aplicar.');
      return;
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = path.resolve(process.cwd(), `origen_config_backup_${CODIGO}_${ENTIDAD}_${stamp}.json`);
    fs.writeFileSync(backup, JSON.stringify({ id, codigo: CODIGO, origen_config: actualCfg }, null, 2));
    console.log(`Respaldo guardado en ${backup}`);

    origenConfig[ENTIDAD] = { ...previo, ...nuevo };
    delete origenConfig[ENTIDAD].queryKey;
    delete origenConfig[ENTIDAD].source;

    await pool.query(
      `UPDATE aseguradora_conexion SET origen_config = $2::jsonb, modificado = NOW() WHERE id = $1`,
      [id, JSON.stringify(origenConfig)],
    );
    console.log(`origen_config.${ENTIDAD} actualizado. Recargue con forceSync para ver los datos nuevos.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
