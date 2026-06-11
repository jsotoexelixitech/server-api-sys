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
  
  const polizaRes = await pool.request().query("SELECT cpoliza FROM adpoliza WHERE cnpoliza = '9-1-1000000964                '");
  if (polizaRes.recordset.length > 0) {
      const cpoliza = polizaRes.recordset[0].cpoliza;
      try {
        const asegRes = await pool.request().query("SELECT count(*) as cnt FROM peasegurados WHERE cpoliza = " + cpoliza);
        console.log('PEASEGURADOS COUNT:', asegRes.recordset[0].cnt);
      } catch (e) { console.log('PEASEGURADOS ERROR:', e.message); }
      
      try {
        const benRes = await pool.request().query("SELECT count(*) as cnt FROM pebenefi WHERE cpoliza = " + cpoliza);
        console.log('PEBENEFI COUNT:', benRes.recordset[0].cnt);
      } catch (e) { console.log('PEBENEFI ERROR:', e.message); }
  } else {
      console.log('Poliza not found');
  }
  process.exit(0);
}
run().catch(console.error);
