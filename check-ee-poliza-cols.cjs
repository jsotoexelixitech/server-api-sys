const sql = require('mssql');
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
  
  // Check eePoliza_Personas_General columns
  try {
    const res = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, NUMERIC_PRECISION, NUMERIC_SCALE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'eePoliza_Personas_General'
      AND DATA_TYPE = 'numeric'
      ORDER BY COLUMN_NAME
    `);
    console.log('=== eePoliza_Personas_General numeric columns ===');
    res.recordset.forEach(c => {
      console.log(`  ${c.COLUMN_NAME}: numeric(${c.NUMERIC_PRECISION},${c.NUMERIC_SCALE})`);
    });
  } catch (e) {
    console.log('Error:', e.message);
  }

  // Also check what the actual msumaaseg value is in the table for our test case
  try {
    const res2 = await pool.request().query(`
      SELECT TOP 5 msumaaseg, mprimaext, ptasamon, cmoneda
      FROM eePoliza_Personas_General
      ORDER BY fingreso DESC
    `);
    console.log('\n=== Recent eePoliza_Personas_General entries ===');
    console.log(res2.recordset);
  } catch (e) {
    console.log('Error querying table:', e.message);
  }
  
  process.exit(0);
}
run().catch(console.error);
