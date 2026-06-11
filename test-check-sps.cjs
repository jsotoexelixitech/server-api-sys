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
  
  const sps = await pool.request().query("SELECT name FROM sys.objects WHERE type = 'P' AND (name LIKE '%pdf%' OR name LIKE '%planilla%' OR name LIKE '%solicitud%')");
  console.log('SPs:', sps.recordset.map(r => r.name));
  
  const views = await pool.request().query("SELECT name FROM sys.objects WHERE type = 'V' AND (name LIKE '%pdf%' OR name LIKE '%planilla%' OR name LIKE '%solicitud%' OR name LIKE '%poliza%')");
  console.log('Views:', views.recordset.map(r => r.name));
  
  process.exit(0);
}
run().catch(console.error);
