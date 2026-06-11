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
  
  const query = "SELECT * FROM mapltabedad_d WHERE ctablaedad = 'C57       ' and nedad_min <= 47 and nedad_max >= 47";
  const res = await pool.request().query(query);
  console.log('EDAD 47 RESULT:', res.recordset);
  
  const query2 = "SELECT * FROM mapltabedad_d WHERE ctablaedad = 'C57       ' and nedad_min <= 24 and nedad_max >= 24";
  const res2 = await pool.request().query(query2);
  console.log('EDAD 24 RESULT:', res2.recordset);
  
  process.exit(0);
}
run().catch(console.error);
