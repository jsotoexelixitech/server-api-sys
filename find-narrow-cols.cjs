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
  
  // Check all tables touched by the trigger for narrow numeric columns
  const tables = ['adpoltar', 'adpolcob', 'adpolrea', 'adpoliza'];
  
  for (const table of tables) {
    try {
      const res = await pool.request().query(`
        SELECT COLUMN_NAME, DATA_TYPE, NUMERIC_PRECISION, NUMERIC_SCALE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = '${table}'
        AND DATA_TYPE = 'numeric'
        AND NUMERIC_PRECISION <= 12
        ORDER BY NUMERIC_PRECISION
      `);
      if (res.recordset.length > 0) {
        console.log(`\n=== ${table} (narrow numeric cols) ===`);
        res.recordset.forEach(c => {
          console.log(`  ${c.COLUMN_NAME}: numeric(${c.NUMERIC_PRECISION},${c.NUMERIC_SCALE})`);
        });
      }
    } catch (e) {
      console.log(`Error checking ${table}:`, e.message);
    }
  }
  
  process.exit(0);
}
run().catch(console.error);
