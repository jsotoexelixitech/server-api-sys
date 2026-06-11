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
  
  const query = `
    SELECT sm.object_id, OBJECT_NAME(sm.object_id) AS object_name, o.type, o.type_desc, sm.definition
    FROM sys.sql_modules AS sm
    JOIN sys.objects AS o ON sm.object_id = o.object_id
    WHERE sm.definition LIKE '%adpoliza%' AND sm.definition LIKE '%maclient%'
    AND o.type IN ('V', 'P')
  `;
  const res = await pool.request().query(query);
  
  for (const row of res.recordset) {
      if (row.object_name.toLowerCase().includes('pdf') || row.object_name.toLowerCase().includes('solicitud') || row.object_name.toLowerCase().includes('planilla')) {
         console.log('FOUND MATCH IN NAME:', row.object_name);
      }
      if (row.type === 'V') {
          console.log('VIEW:', row.object_name);
      }
  }
  
  process.exit(0);
}
run().catch(console.error);
