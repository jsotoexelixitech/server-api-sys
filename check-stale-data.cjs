// Verificar y limpiar datos residuales en eePoliza_Salud_Aseg para test limpio
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
  // Ver qué hay en eePoliza_Salud_Aseg
  const r1 = await pool.request().query('SELECT COUNT(*) AS total FROM eePoliza_Salud_Aseg');
  console.log('Registros en eePoliza_Salud_Aseg:', r1.recordset[0].total);
  
  if (r1.recordset[0].total > 0) {
    const r2 = await pool.request().query('SELECT * FROM eePoliza_Salud_Aseg');
    console.log('Datos:', JSON.stringify(r2.recordset, null, 2));
  }

  const r3 = await pool.request().query('SELECT COUNT(*) AS total FROM eePoliza_Salud_Ben');
  console.log('Registros en eePoliza_Salud_Ben:', r3.recordset[0].total);

  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
