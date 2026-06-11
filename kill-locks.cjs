const sql = require('mssql');
require('dotenv').config();

const sqlConfig = {
  user: process.env.USER_BD,
  password: process.env.PASSWORD_BD,
  database: process.env.NAME_BD,
  server: process.env.SERVER_BD,
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  options: { encrypt: false, trustServerCertificate: true },
  requestTimeout: 10000
};

async function run() {
  const pool = await sql.connect(sqlConfig);
  const query = "SELECT session_id, blocking_session_id, wait_type, wait_time FROM sys.dm_exec_requests WHERE blocking_session_id <> 0;";
  try {
      const res = await pool.request().query(query);
      console.log('BLOCKING:', res.recordset);
      
      for (const row of res.recordset) {
          console.log('KILLING', row.blocking_session_id);
          await pool.request().query('KILL ' + row.blocking_session_id);
      }
  } catch (err) {
      console.log(err);
  }
  process.exit(0);
}
run().catch(console.error);
