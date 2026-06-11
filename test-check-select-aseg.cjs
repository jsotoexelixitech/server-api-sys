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
    SELECT 
        cpoliza, fanopol, fmespol, 'T' as iclaseaseg, cl.cci_rif, 0 as nmenor, '!' as u_version, 0 as ccerti,  cproces,  cramo,  cnpoliza,  cl.fnacimiento,
        cl.isexo, cl.iestado_civil, 1 as cparentesco, iestadoren, fdesde, fhasta, fdesde as fdesde_2, null as v1, null as v2, null as v3, null as v4, 'V' as iestado, a.cprog,
        a.ifuente, a.bok, a.cerror, GETDATE() as fingreso, a.cusuario, a.ccategoria, a.cusuarioauto, a.ccategoriaauto, a.fultmod, a.cusuariomod, a.ccategoriamod
    FROM adpoliza a
    INNER JOIN maclient cl ON cl.cci_rif = a.casegurado
    WHERE cpoliza = 9000000000000122000
  `;
  
  try {
    const res = await pool.request().query(query);
    console.log('SELECT RESULT COUNT:', res.recordset.length);
    if (res.recordset.length > 0) {
        console.log('FIRST ROW:', res.recordset[0]);
    }
  } catch (e) {
    console.log('ERROR:', e.message);
  }
  
  process.exit(0);
}
run().catch(console.error);
