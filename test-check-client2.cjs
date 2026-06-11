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
  
  try {
    const r1 = await pool.request().input('cid', sql.Int, 28461175).query("SELECT cci_rif, xcliente FROM maclient WHERE cid = @cid");
    console.log('CID 28461175:', r1.recordset);
  } catch (e) { console.log(e.message); }

  try {
    const r2 = await pool.request().input('rif', sql.VarChar, '14484939').query("SELECT cid, cci_rif, xcliente FROM maclient WHERE cci_rif = @rif");
    console.log('RIF 14484939:', r2.recordset);
  } catch (e) { console.log(e.message); }
  
  process.exit(0);
}
run().catch(console.error);
