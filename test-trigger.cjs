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
  const result = await pool.request().query("SELECT name FROM sys.triggers WHERE parent_id = OBJECT_ID('eePoliza_Personas_General')");
  console.log('Triggers for view:', result.recordset);
  
  if (result.recordset.length > 0) {
    const tName = result.recordset[0].name;
    const text = await pool.request().query(`sp_helptext '${tName}'`);
    console.log(text.recordset.map(r => r.Text).join(''));
  }
  process.exit(0);
}
run().catch(console.error);
