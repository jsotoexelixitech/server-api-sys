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
  
  const p = await pool.request().query("SELECT TOP 5 cpoliza, cnpoliza, casegurado, ctenedor FROM adpoliza WHERE cramo = 9 AND cnpoliza NOT LIKE '9-1-100000096%' ORDER BY cpoliza DESC");
  console.log('OLD POLICIES:', p.recordset);
  
  process.exit(0);
}
run().catch(console.error);
