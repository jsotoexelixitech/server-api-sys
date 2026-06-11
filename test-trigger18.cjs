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
  const text = await pool.request().query(`sp_helptext 'speeValidatePersonGeneral'`);
  const fs = require('fs');
  fs.writeFileSync('speeValidatePersonGeneral.txt', text.recordset.map(r => r.Text).join(''));
  process.exit(0);
}
run().catch(console.error);
