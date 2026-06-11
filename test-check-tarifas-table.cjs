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
  try {
      const res = await pool.request().query("SELECT * FROM mapltarifas_per WHERE cramo=9 AND cplan='6'");
      console.log('TARIFAS:', res.recordset);
  } catch (err) {
      console.error(err);
  }
  process.exit(0);
}
run().catch(console.error);
