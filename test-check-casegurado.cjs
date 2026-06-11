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
  
  const columns = await pool.request().query("sp_columns 'adpoliza'");
  const c = columns.recordset.find(r => r.COLUMN_NAME === 'casegurado');
  console.log('casegurado:', c.TYPE_NAME, c.PRECISION, c.LENGTH);
  process.exit(0);
}
run().catch(console.error);
