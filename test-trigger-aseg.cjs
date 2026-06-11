const sql = require('mssql');
require('dotenv').config();

const cfg = {
  user: process.env.USER_BD,
  password: process.env.PASSWORD_BD,
  database: process.env.NAME_BD,
  server: process.env.SERVER_BD,
  options: { encrypt: false, trustServerCertificate: true }
};

sql.connect(cfg).then(async pool => {
  const res = await pool.request().query("EXEC sp_helptext 'TEmision_Per_Ge'");
  const txt = res.recordset.map(r => r.Text).join('');
  const lines = txt.split('\n');
  lines.forEach((l, i) => {
    if (l.toLowerCase().includes('eepoliza_salud_aseg')) {
      console.log('L' + (i+1) + ':', l);
      for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 2); j++) {
        if (j !== i) console.log('  ' + (j+1) + ':', lines[j]);
      }
    }
  });
  process.exit(0);
}).catch(e => { 
  console.error(e.message); 
  process.exit(1); 
});
