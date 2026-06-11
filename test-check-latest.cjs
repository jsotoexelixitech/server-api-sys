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
  
  const polizas = await pool.request().query("SELECT TOP 5 cpoliza, cnpoliza, casegurado FROM adpoliza ORDER BY cpoliza DESC");
  console.log('LATEST POLICIES:', polizas.recordset);
  
  const gen = await pool.request().query("SELECT TOP 5 id, cnpoliza_rel, xrif_titular, xnombre_titular FROM TMEMISION_PERSONAS_GENERAL ORDER BY id DESC");
  console.log('LATEST IN TMEMISION:', gen.recordset);
  
  process.exit(0);
}
run().catch(console.error);
