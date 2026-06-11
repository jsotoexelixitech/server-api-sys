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
  
  const lines = fullText.split('\n');

  // Show full INSERT INTO adpoltar block
  let insideInsert = false;
  lines.forEach((l, i) => {
    if (l.includes('INSERT INTO adpoltar')) {
      insideInsert = true;
    }
    if (insideInsert) {
      console.log(`Line ${i+1}: ${l.trim()}`);
    }
    if (insideInsert && l.includes('from adpoltar') || insideInsert && (l.includes('FETCH NEXT') && i > 470)) {
      insideInsert = false;
    }
  });
  
  process.exit(0);
}
run().catch(console.error);
