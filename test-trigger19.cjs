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
  
  const res = await req.query(`
    DECLARE @cpoliza NUMERIC(19), @cnpoliza NVARCHAR(30), @crecibo NUMERIC(19), @cnrecibo NVARCHAR(30), @cproces NUMERIC(13);
    EXEC spContador_v1 @cpoliza OUTPUT, @cnpoliza OUTPUT, @crecibo OUTPUT, @cnrecibo OUTPUT, @cproces OUTPUT, 1, '2026-06-03', 9, 'POL_FUN';
    SELECT @cpoliza AS cpoliza, @cnpoliza AS cnpoliza, @crecibo AS crecibo, @cnrecibo AS cnrecibo, @cproces AS cproces;
  `);
  console.log(res.recordset);
  
  process.exit(0);
}
run().catch(console.error);
