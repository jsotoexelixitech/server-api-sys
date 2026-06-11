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
  
  // Get live trigger text
  const res = await pool.request().query("EXEC sp_helptext 'TEmision_Per_Ge'");
  let fullText = res.recordset.map(r => r.Text).join('');
  
  // Show declarations for @msumaaseg
  const lines = fullText.split('\n');
  lines.forEach((l, i) => {
    if (l.includes('@msumaaseg') && i < 60) {
      console.log(`Line ${i+1}: ${l.trim()}`);
    }
  });
  
  process.exit(0);
}
run().catch(console.error);
