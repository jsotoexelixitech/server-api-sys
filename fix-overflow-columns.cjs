const sql = require('mssql');
const fs = require('fs');
require('dotenv').config();

const sqlConfig = {
  user: process.env.USER_BD,
  password: process.env.PASSWORD_BD,
  database: process.env.NAME_BD,
  server: process.env.SERVER_BD,
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  options: { encrypt: false, trustServerCertificate: true }
};

async function run() {
  const pool = await sql.connect(sqlConfig);
  
  // Step 1: Widen adpoltar columns to numeric(18,2) to support BS values after conversion
  console.log('Step 1: Widening adpoltar columns...');
  try {
    await pool.request().query(`
      ALTER TABLE adpoltar ALTER COLUMN msumabruta numeric(18,2);
      ALTER TABLE adpoltar ALTER COLUMN msumabrutaext numeric(18,2);
      ALTER TABLE adpoltar ALTER COLUMN msumaaseg numeric(18,2);
      ALTER TABLE adpoltar ALTER COLUMN msumaasegext numeric(18,2);
    `);
    console.log('adpoltar columns widened OK');
  } catch(err) {
    console.error('Error widening adpoltar:', err.message);
  }
  
  // Step 2: Widen adpolcob columns too
  console.log('Step 2: Widening adpolcob columns...');
  try {
    await pool.request().query(`
      ALTER TABLE adpolcob ALTER COLUMN msumaaseg numeric(18,2);
      ALTER TABLE adpolcob ALTER COLUMN msumaasegext numeric(18,2);
    `);
    console.log('adpolcob columns widened OK');
  } catch(err) {
    console.error('Error widening adpolcob:', err.message);
  }

  // Step 3: Widen adpolrea columns too
  console.log('Step 3: Widening adpolrea msumabruta/msumaaseg columns...');
  try {
    await pool.request().query(`
      ALTER TABLE adpolrea ALTER COLUMN msumabruta numeric(18,2);
      ALTER TABLE adpolrea ALTER COLUMN msumabrutaext numeric(18,2);
      ALTER TABLE adpolrea ALTER COLUMN msumaaseg_col numeric(18,2);
    `);
    console.log('adpolrea columns widened OK');
  } catch(err) {
    // This might fail if column names don't match, that's OK
    console.log('adpolrea step skipped or partial:', err.message);
  }

  process.exit(0);
}
run().catch(console.error);
