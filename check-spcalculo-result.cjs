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
  
  // Try calling spCalculoPer with the same params as the test emission
  try {
    const req = pool.request();
    req.input('ptasamon', sql.Numeric(13, 6), 557.9762);
    req.input('cramo', sql.Int, 9);
    req.input('cplan', sql.VarChar(10), '6');
    req.input('cparen', sql.Int, 1);      // Titular
    req.input('xrif_asegurado', sql.VarChar(10), '27461115');
    req.input('nedad_asegurado', sql.Int, 24);  // 2002-02-09 -> ~24 years
    req.input('ifrecuencia', sql.Char(1), 'M');
    req.input('msumaaseg', sql.Numeric(18, 2), null);
    
    const result = await req.execute('spCalculoPer');
    console.log('spCalculoPer recordsets count:', result.recordsets.length);
    result.recordsets.forEach((rs, i) => {
      console.log(`recordset[${i}]:`, rs);
    });
  } catch (e) {
    console.error('Error calling spCalculoPer:', e.message);
  }
  
  process.exit(0);
}
run().catch(console.error);
