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
  
  // Get live trigger text from DB
  const res = await pool.request().query("EXEC sp_helptext 'TEmision_Per_Ge'");
  const lines = res.recordset.map(r => r.Text);
  
  // Print lines 425-440 (1-indexed)
  lines.forEach((l, i) => {
    if (i >= 424 && i <= 440) {
      process.stdout.write(`LINE ${i+1}: ${l}`);
    }
  });
  
  process.exit(0);
}
run().catch(console.error);
