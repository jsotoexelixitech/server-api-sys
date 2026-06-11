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
  
  const query = "SELECT top 1 * FROM adpoliza WHERE cnpoliza = '9-1-1000000959                '";
  const res = await pool.request().query(query);
  console.log('OLD POL:', res.recordset[0]);
  
  const query2 = "SELECT top 1 * FROM adpoliza WHERE cnpoliza = '9-1-1000000964                '";
  const res2 = await pool.request().query(query2);
  console.log('NEW POL:', res2.recordset[0]);
  
  process.exit(0);
}
run().catch(console.error);
