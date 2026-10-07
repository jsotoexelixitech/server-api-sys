/**
 * Chequeo previo al despliegue: el esquema de PG reportes debe tener las columnas que escribe el sync.
 * Si falta alguna, el INSERT del sync fallaría tras reiniciar la API; mejor frenar el despliegue antes.
 *
 * Solo lectura. Conexión: REPORTES_PG_* del .env del directorio actual (o del entorno).
 * Con REPORTES_ENABLED distinto de "true" no hace nada.
 * Código de salida: 0 = esquema completo u omitido, 1 = faltan columnas o no hay conexión.
 */
require('dotenv').config({ path: require('path').resolve(process.cwd(), '.env') });
const { Pool } = require('pg');

const REQUERIDAS = {
  recibo: ['tipo_canal', 'placa', 'tipo_vehiculo'],
  siniestro: ['id_canal', 'tipo_canal', 'cobertura_afectada', 'tipo_vehiculo'],
};

async function main() {
  if (String(process.env.REPORTES_ENABLED).toLowerCase() !== 'true') {
    console.log('REPORTES_ENABLED no es true: se omite el chequeo del esquema de PG reportes.');
    return 0;
  }
  const host = process.env.REPORTES_PG_HOST;
  const user = process.env.REPORTES_PG_USER;
  if (!host || !user) {
    console.error('Faltan REPORTES_PG_HOST / REPORTES_PG_USER en el .env.');
    return 1;
  }
  const encrypt = String(process.env.REPORTES_PG_ENCRYPT).toLowerCase() === 'true';
  const trust = String(process.env.REPORTES_PG_TRUST_SERVER_CERTIFICATE).toLowerCase() === 'true';
  const pool = new Pool({
    host,
    port: Number(process.env.REPORTES_PG_PORT || 5432),
    user,
    password: process.env.REPORTES_PG_PASSWORD,
    database: process.env.REPORTES_PG_DATABASE || 'reportes',
    connectionTimeoutMillis: 15000,
    ssl: encrypt ? { rejectUnauthorized: !trust } : false,
  });
  const schema = process.env.REPORTES_PG_SCHEMA || 'public';
  try {
    const { rows } = await pool.query(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = ANY($2::text[])`,
      [schema, Object.keys(REQUERIDAS)],
    );
    const existentes = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
    const faltan = [];
    for (const [tabla, columnas] of Object.entries(REQUERIDAS)) {
      for (const col of columnas) if (!existentes.has(`${tabla}.${col}`)) faltan.push(`${tabla}.${col}`);
    }
    if (faltan.length > 0) {
      console.error(`PG reportes ${host}/${process.env.REPORTES_PG_DATABASE || 'reportes'}: faltan columnas: ${faltan.join(', ')}`);
      console.error('Ejecute antes los DDL de docs/sql/postgres/reportes/ (ddl_tipo_canal, ddl_vehiculo_recibo, ddl_vehiculo_siniestro).');
      return 1;
    }
    console.log(`PG reportes ${host}: esquema completo (${Object.values(REQUERIDAS).flat().length} columnas verificadas).`);
    return 0;
  } catch (e) {
    console.error('No se pudo verificar el esquema de PG reportes:', e.message);
    return 1;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

main().then((code) => process.exit(code));
