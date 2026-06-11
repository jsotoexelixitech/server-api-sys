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
  
  const query = `
    select cparentesco from peasegurados WHERE cpoliza = 9000000000000122000
  `;
  const res = await pool.request().query(query);
  console.log('PEASEGURADOS PARENTESCO:', res.recordset);
  
  const query2 = `
    select cparen from mapltarifas_per WHERE cplan='6' AND cramo=9
  `;
  const res2 = await pool.request().query(query2);
  console.log('MAPLTARIFAS PAREN:', res2.recordset);
  
  process.exit(0);
}
run().catch(console.error);
