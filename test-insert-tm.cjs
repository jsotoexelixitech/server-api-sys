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
  pool.on('infoMessage', info => console.log('INFO:', info.message));
  
  const query = `
    INSERT INTO TMEMISION_PERSONAS_GENERAL (cpoliza, cnpoliza_rel, cplan, cramo, msumaaseg, mprimaext, ifrecuencia, femision, fdesde, fhasta, fingreso)
    VALUES (9000000000000999999, '9-1-1000000999', '6', 9, 3000, 2.1, 'M', GETDATE(), GETDATE(), GETDATE(), GETDATE());
  `;
  
  try {
      const req = pool.request();
      req.on('infoMessage', info => console.log('REQ INFO:', info.message));
      await req.query(query);
      console.log('DONE');
  } catch (err) {
      console.error('ERROR:', err);
  }
  
  process.exit(0);
}
run().catch(console.error);
