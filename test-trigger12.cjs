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
  const req = pool.request();
  req.on('info', info => console.log('INFO:', info.message));
  
  try {
    const res = await req.query(`
      INSERT INTO eePoliza_Personas_General (
        cplan, cramo, xrif_tomador, xrif_titular, ifrecuencia, cproductor, mprimaext,
        icedula_tomador, icedula_titular, api, method, cprog, ifuente, fingreso
      ) VALUES (
        '6', 9, 14484939, 14484939, 'M', 0, 2.1,
        'V', 'V', 'API', 'method', 'prog', 'fuente', GETDATE()
      )
    `);
    console.log("cproductor=0:", JSON.stringify(res, null, 2));
  } catch (err) {
    console.error('CAUGHT cproductor=0:', err.message);
  }
  
  process.exit(0);
}
run().catch(console.error);
