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
  req.on('error', err => console.log('ERROR:', err));
  
  // Minimal insert to eePoliza_Personas_General to see what happens
  try {
    const res = await req.query(`
      INSERT INTO eePoliza_Personas_General (
        cplan, cramo, xrif_tomador, xrif_titular, ifrecuencia, cproductor, mprimaext
      ) VALUES (
        '6', 9, 14484939, 14484939, 'M', 80080, 2.1
      )
    `);
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error('CAUGHT:', err.message);
  }
  process.exit(0);
}
run().catch(console.error);
