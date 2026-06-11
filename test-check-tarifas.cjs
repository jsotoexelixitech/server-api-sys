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
  
  const query = "select top 5 * from mapltarifas_per WHERE cplan='6' AND cramo=9";
  const res = await pool.request().query(query);
  console.log(res.recordset);
  
  process.exit(0);
}
run().catch(console.error);
