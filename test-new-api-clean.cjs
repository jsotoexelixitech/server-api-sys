const https = require('https');

const APIKEY = '2729cc160b985890e0e6df72a161aea27f8e45682511c2dfd045f94eb9868f10';
const HOST = 'qaapisys2000.lamundialdeseguros.com';
const BASIC_AUTH = 'admin:password1234';

async function callAPI(testName, payload) {
  return new Promise((resolve) => {
    const payloadStr = JSON.stringify(payload);
    const options = {
      hostname: HOST,
      path: '/api/v1/external/createEmissionPerson',
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
          const parsed = JSON.parse(data);
          console.log(`\n=== [${testName}] HTTP ${res.statusCode} ===`);
          console.log(JSON.stringify(parsed, null, 2));
          resolve({ status: res.statusCode, body: parsed });
        } catch(e) {
          console.log(`\n=== [${testName}] HTTP ${res.statusCode} (raw) ===`);
          console.log(data);
          resolve({ status: res.statusCode, body: data });
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

async function runTests() {
  // TEST LIMPIO 1: Emision completa con todos los campos necesarios
  console.log('=== PRUEBA LIMPIA (sin datos residuales) ===');
  await callAPI('CLEAN_T1_EMISION_COMPLETA', {
    cramo: 9, plan: "6",
    icedula_tomador: "V",       xrif_tomador: 24164799,
    xnombre_tomador: "HAMILTON PRUEBA", xapellido_tomador: "LEON",
    xtelefono_tomador: "04124565464", xcorreo_tomador: "test@test.com",
    fnac_tomador: "2002-02-09",
    isexo_tomador: "M", iestado_civil_tomador: "S",
    cestado_tomador: "1", cciudad_tomador: "128",
    xdireccion_tomador: "Calle Test 123",
    icedula_titular: "V",       xrif_titular: 24164799,
    xnombre_titular: "HAMILTON PRUEBA", xapellido_titular: "LEON",
    xtelefono_titular: "04124565464", xcorreo_titular: "test@test.com",
    fnac_titular: "2002-02-09",
    isexo_titular: "M", iestado_civil_titular: "S",
    cestado_titular: "1", cciudad_titular: "128",
    xdireccion_titular: "Calle Test 123",
    dec_persona_politica: 0, cpersona_politica: 0,
    dec_term_y_cod: 1,          cterm_y_cod: 1,
    dec_diagnos_enferm: 0,      cdiagnos_enferm: 0,
    cproductor: 80080,
    ifrecuencia: "M",
    femision: today, fdesde: today, fhasta: nextYear,
    asegurados: [
      {
        icedula_asegurado: "V", xrif_asegurado: "24164799",
        xnombre_asegurado: "HAMILTON PRUEBA", xapellido_asegurado: "LEON",
        fnac_asegurado: "2002-02-09",
        isexo_asegurado: "M", nparentesco_asegurado: 1,
        iestado_civil_asegurado: "S"
      }
    ],
    beneficiarios: []
  });

  // Verificar tabla despues
  const sql = require('mssql');
  require('dotenv').config();
  const cfg = {
    user: process.env.USER_BD, password: process.env.PASSWORD_BD,
    database: process.env.NAME_BD, server: process.env.SERVER_BD,
    options: { encrypt: false, trustServerCertificate: true }
  };
  const pool = await sql.connect(cfg);
  const r = await pool.request().query('SELECT COUNT(*) AS total FROM eePoliza_Salud_Aseg');
  console.log('\n=== Estado de eePoliza_Salud_Aseg post-emision ===');
  console.log('Registros:', r.recordset[0].total);
  await pool.close();
}

runTests().catch(console.error);
