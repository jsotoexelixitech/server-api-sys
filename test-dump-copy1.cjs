const sql = require('mssql');
const fs = require('fs');
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
  const res = await pool.request().query("EXEC sp_helptext 'Emision_Personas_General_copy1'");
  
  const lines = res.recordset.map(r => r.Text).join('');
  fs.writeFileSync('c:/Users/javier.soto/Desktop/backend-api-sys/nest-api/trigger_copy1_output.txt', lines);
  console.log('Saved trigger output');
  
  process.exit(0);
}
run().catch(console.error);
