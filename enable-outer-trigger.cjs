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
      await pool.request().query("ALTER TABLE eePoliza_Personas_General ENABLE TRIGGER Emision_Personas_General_copy1");
      console.log('Emision_Personas_General_copy1 ENABLED');
  } catch (err) {
      console.error(err);
  }
  process.exit(0);
}
run().catch(console.error);
