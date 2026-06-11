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
  
  const rec = await pool.request().query("SELECT * FROM ADRECIBOS WHERE cnpoliza = '9-1-1000000964                '");
  console.log('RECIBOS:', rec.recordset.length > 0 ? rec.recordset[0] : 'NONE');
  
  process.exit(0);
}
run().catch(console.error);
