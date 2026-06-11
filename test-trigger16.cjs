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
  req.on('info', info => console.log('INFO:', info.message));
  
  try {
    const res = await req.query(`
      INSERT INTO eePoliza_Personas_General (
        cnpoliza_rel, cramo, cplan,
        icedula_tomador, xrif_tomador, xnombre_tomador, xapellido_tomador, isexo_tomador, iestado_civil_tomador, fnac_tomador,
        cestado_tomador, cciudad_tomador, xdireccion_tomador, xtelefono_tomador, xcorreo_tomador,
        icedula_titular, xrif_titular, xnombre_titular, xapellido_titular, isexo_titular, iestado_civil_titular, fnac_titular,
        cestado_titular, cciudad_titular, xdireccion_titular, xtelefono_titular, xcorreo_titular,
        cpersona_politica, cterm_y_cod, cdiagnos_enferm, xdiagnos_enferm,
        cproductor, ctipocanal, ccanalalt, cscanalalt, ptasamon, msumaaseg, cmoneda, mprimaext,
        ifrecuencia, femision, fdesde, fhasta, xcanal_venta, corigen_rel,
        api, method, cprog, ifuente, fingreso
      ) VALUES (
        NULL, 9, '6',
        'V', 14484939, 'JOSE', 'SOUTO', 'M', 'S', '1979-09-07T00:00:00Z',
        '1', '128', 'asd12e2e', '04123453453', 'javier@gmail.com',
        'V', 14484939, 'JOSE', 'SOUTO', 'M', 'S', '1979-09-07T00:00:00Z',
        '1', '128', 'asd12e2e', '04123453453', 'javier@gmail.com',
        0, 1, 0, '',
        80080, NULL, NULL, NULL, NULL, NULL, 'USD', 2.1,
        'M', '2026-06-03T00:00:00Z', '2026-06-03T00:00:00Z', '2027-06-03T00:00:00Z', 'ExelixiTech-Funerario', 'WE',
        'EmissionGeneral', 'createEmmisionPersonGeneral', 'eePoliza_PerGe', 'API', GETDATE()
      )
    `);
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error('CAUGHT:', err.message);
  }
  
  process.exit(0);
}
run().catch(console.error);
