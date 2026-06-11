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
  
  const r = await pool.request().query("SELECT cbeneficiario FROM maplanes_per WHERE cramo = 9 AND cplan = '6'");
  console.log('BENEFICIARIO IN MAPLANES_PER:', r.recordset);
  
  process.exit(0);
}
run().catch(console.error);
