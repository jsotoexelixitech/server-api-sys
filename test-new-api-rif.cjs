const https = require('https');
const sql = require('mssql');
require('dotenv').config();

const APIKEY = '2729cc160b985890e0e6df72a161aea27f8e45682511c2dfd045f94eb9868f10';
const HOST = 'qaapisys2000.lamundialdeseguros.com';
const BASIC_AUTH = 'admin:password1234';

const cfg = {
  user: process.env.USER_BD, password: process.env.PASSWORD_BD,
  database: process.env.NAME_BD, server: process.env.SERVER_BD,
  options: { encrypt: false, trustServerCertificate: true }
};

async function callAPI(testName, payload) {
  return new Promise((resolve) => {
    const payloadStr = JSON.stringify(payload);
    const options = {
      hostname: HOST, path: '/api/v1/external/createEmissionPerson',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payloadStr),
        'apikey': APIKEY
      },
      auth: BASIC_AUTH
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          console.log(`\n=== [${testName}] HTTP ${res.statusCode} ===`);
          console.log(JSON.stringify(JSON.parse(data), null, 2));
          resolve(JSON.parse(data));
        } catch(e) {
          console.log(`\n=== [${testName}] HTTP ${res.statusCode} (raw) ===`);
          console.log(data); resolve({});
        }
      });
    });
    req.on('error', err => { console.error(testName, err.message); resolve({}); });
    req.write(payloadStr);
    req.end();
  });
}

const today = new Date().toISOString().split('T')[0];
const nextYear = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0];

async function run() {
  const pool = await sql.connect(cfg);

  // Buscar tabla de clientes correcta
  const tbl = await pool.request().query(`
    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
    WHERE TABLE_NAME LIKE '%client%' OR TABLE_NAME LIKE '%clien%'
    ORDER BY TABLE_NAME
  `);
  console.log('Tablas de clientes:', tbl.recordset.map(r => r.TABLE_NAME));

  // Limpiar tabla residual
  await pool.request().query('DELETE FROM eePoliza_Salud_Aseg');
  console.log('Tabla limpia ✓');

  // Usar RIF 24164738 que ya emitió exitosamente (de poliza 9-1-1000000965)
  // Lo sabemos del log anterior donde el trig lo procesó
  const rif = 24164738;
  console.log('\nProbando con RIF:', rif, '(el que funcionó en nuestra API)');

  await callAPI('T_RIF_24164738', {
    cramo: 9, plan: "6",
    icedula_tomador: "V", xrif_tomador: rif,
    xnombre_tomador: "HAMILTON", xapellido_tomador: "LEON",
    xtelefono_tomador: "04124565464", xcorreo_tomador: "test@test.com",
    fnac_tomador: "2002-02-09", isexo_tomador: "M", iestado_civil_tomador: "S",
    cestado_tomador: "1", cciudad_tomador: "128",
    xdireccion_tomador: "Calle Test 123",
    icedula_titular: "V", xrif_titular: rif,
    xnombre_titular: "HAMILTON", xapellido_titular: "LEON",
    xtelefono_titular: "04124565464", xcorreo_titular: "test@test.com",
    fnac_titular: "2002-02-09", isexo_titular: "M", iestado_civil_titular: "S",
    cestado_titular: "1", cciudad_titular: "128",
    xdireccion_titular: "Calle Test 123",
    dec_persona_politica: 0, cpersona_politica: 0,
    dec_term_y_cod: 1, cterm_y_cod: 1,
    dec_diagnos_enferm: 0, cdiagnos_enferm: 0,
    cproductor: 80080, ifrecuencia: "M",
    femision: today, fdesde: today, fhasta: nextYear,
    asegurados: [
      {
        icedula_asegurado: "V", xrif_asegurado: String(rif),
        xnombre_asegurado: "HAMILTON", xapellido_asegurado: "LEON",
        fnac_asegurado: "2002-02-09", isexo_asegurado: "M",
        nparentesco_asegurado: 1, iestado_civil_asegurado: "S"
      }
    ],
    beneficiarios: []
  });

  // Ahora con RIF nuevo: 22462275 (el de la poliza 9-1-1000000966 que emitimos exitosamente)
  await pool.request().query('DELETE FROM eePoliza_Salud_Aseg');
  console.log('\nTabla limpia ✓ (segunda prueba)');

  await callAPI('T_RIF_22462275', {
    cramo: 9, plan: "6",
    icedula_tomador: "V", xrif_tomador: 22462275,
    xnombre_tomador: "HAMILTON", xapellido_tomador: "LEON",
    xtelefono_tomador: "04124565464", xcorreo_tomador: "test@test.com",
    fnac_tomador: "2002-02-09", isexo_tomador: "M", iestado_civil_tomador: "S",
    cestado_tomador: "1", cciudad_tomador: "128",
    xdireccion_tomador: "Calle Test 456",
    icedula_titular: "V", xrif_titular: 22462275,
    xnombre_titular: "HAMILTON", xapellido_titular: "LEON",
    xtelefono_titular: "04124565464", xcorreo_titular: "test@test.com",
    fnac_titular: "2002-02-09", isexo_titular: "M", iestado_civil_titular: "S",
    cestado_titular: "1", cciudad_titular: "128",
    xdireccion_titular: "Calle Test 456",
    dec_persona_politica: 0, cpersona_politica: 0,
    dec_term_y_cod: 1, cterm_y_cod: 1,
    dec_diagnos_enferm: 0, cdiagnos_enferm: 0,
    cproductor: 80080, ifrecuencia: "M",
    femision: today, fdesde: today, fhasta: nextYear,
    asegurados: [
      {
        icedula_asegurado: "V", xrif_asegurado: "22462275",
        xnombre_asegurado: "HAMILTON", xapellido_asegurado: "LEON",
        fnac_asegurado: "2002-02-09", isexo_asegurado: "M",
        nparentesco_asegurado: 1, iestado_civil_asegurado: "S"
      }
    ],
    beneficiarios: []
  });

  const r2 = await pool.request().query('SELECT COUNT(*) AS total FROM eePoliza_Salud_Aseg');
  console.log('\n=== eePoliza_Salud_Aseg final:', r2.recordset[0].total, 'registros ===');

  await pool.close();
}

run().catch(console.error);
