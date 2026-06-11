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
    DECLARE @cpoliza NUMERIC(19) = 9000000000000122000;
    
    select ctablatar, DATEDIFF(YEAR, peasegurados.fnacimiento, GETDATE()) as edad 
    from mapltarifas_per 
    INNER JOIN peasegurados ON peasegurados.cpoliza = @cpoliza AND peasegurados.cparentesco = mapltarifas_per.cparen
    WHERE mapltarifas_per.cplan='6' AND mapltarifas_per.cramo=9
  `;
  
  try {
    const res = await pool.request().query(query);
    console.log('CURSITO 4 RESULT:', res.recordset);
  } catch (e) {
    console.log('ERROR:', e.message);
  }
  
  process.exit(0);
}
run().catch(console.error);
