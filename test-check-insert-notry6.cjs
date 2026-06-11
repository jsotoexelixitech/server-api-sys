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
const infos = [];
pool.on('infoMessage', info => infos.push(info.message));
  
  const colList = 'cnpoliza_rel, cplan, cramo, xcanal_venta, icedula_tomador, xrif_tomador, xnombre_tomador, xapellido_tomador, isexo_tomador, iestado_civil_tomador, fnac_tomador, cestado_tomador, cciudad_tomador, xdireccion_tomador, xtelefono_tomador, xcorreo_tomador, icedula_titular, xrif_titular, xnombre_titular, xapellido_titular, isexo_titular, iestado_civil_titular, fnac_titular, cestado_titular, cciudad_titular, xdireccion_titular, xtelefono_titular, xcorreo_titular, ptasamon, msumaaseg, mprimaext, ifrecuencia, femision, fdesde, fhasta, api, method, cprog, ifuente, fingreso, cproductor';
  
  const valList = "'9-1-1000000998', '6', 9, '', 'V', 24164738, 'HAMILTON', 'LEON', 'M', 'S', '2002-02-09', '1', '128', 'CARACAS', '04123456345', 'hamilton.hamilton@gmail.com', 'V', 24164738, 'HAMILTON', 'LEON', 'M', 'S', '2002-02-09', '1', '128', 'CARACAS', '04123456345', 'hamilton.hamilton@gmail.com', 557.9762, 3000, 2.1, 'M', '2026-06-03', '2026-06-03', '2027-06-03', 'API', 'POST', 'TEST', 'sysip', GETDATE(), 80080";

  const query = `
    INSERT INTO eePoliza_Personas_General (${colList}) VALUES (${valList});
    SELECT 'AFTER INSERT' as status;
  `;
  
  try {
      const res = await pool.request().query(query);
      console.log('RESULT:', JSON.stringify(res, null, 2));
  } catch (err) {
console.log('INFOS:', infos.join('\n'));
      console.error('ERROR:', err);
  }
  
  process.exit(0);
}
run().catch(console.error);
