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
  
  const query = "SELECT top 1 CAST(cpoliza as varchar(30)) as cpoliza_str FROM adpoliza WHERE cnpoliza = '9-1-1000000964                '";
  const res = await pool.request().query(query);
  console.log('REAL CPOLIZA:', res.recordset[0].cpoliza_str);
  
  const query2 = "SELECT ctablatar, DATEDIFF(YEAR, peasegurados.fnacimiento, GETDATE()) as edad FROM mapltarifas_per INNER JOIN peasegurados ON CAST(peasegurados.cpoliza as varchar(30)) = '" + res.recordset[0].cpoliza_str + "' AND peasegurados.cparentesco = mapltarifas_per.cparen WHERE mapltarifas_per.cplan='6' AND mapltarifas_per.cramo=9";
  const res2 = await pool.request().query(query2);
  console.log('CURSITO 4 RESULT:', res2.recordset);
  
  process.exit(0);
}
run().catch(console.error);
