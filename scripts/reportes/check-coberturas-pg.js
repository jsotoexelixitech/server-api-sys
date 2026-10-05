require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env') });
const { Pool } = require('pg');

async function main() {
  const p = new Pool({
    host: process.env.REPORTES_PG_HOST,
    port: Number(process.env.REPORTES_PG_PORT || 5432),
    user: process.env.REPORTES_PG_USER,
    password: process.env.REPORTES_PG_PASSWORD,
    database: process.env.REPORTES_PG_DATABASE,
  });
  const stats = await p.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (
        WHERE coberturas IS NOT NULL AND BTRIM(coberturas) <> ''
      )::int AS con_coberturas
    FROM recibo`);
  console.log('recibo:', stats.rows[0]);
  const sp = await p.query(`
    SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'sp_rpt_recibos_v6'
    LIMIT 1`);
  const def = sp.rows[0]?.def || '';
  console.log('SP incluye coberturas en detalle:', /AS coberturas/i.test(def));
  await p.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
