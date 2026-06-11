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
      const res = await pool.request().query("SELECT CAST(1673928.60 AS numeric(9,2)) as val");
      console.log('CAST SUCCESS:', res.recordset);
  } catch (err) {
      console.error(err);
  }
  process.exit(0);
}
run().catch(console.error);
