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
          resolve(parsed);
        } catch(e) {
          console.log(`\n=== [${testName}] HTTP ${res.statusCode} (raw) ===`);
          console.log(data);
          resolve({});
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

const BASE_COMPLETE = {
  cramo: 9,
  plan: "6",
  icedula_tomador: "V",       xrif_tomador: 24164799,
  xnombre_tomador: "HAMILTON TEST", xapellido_tomador: "LEON",
  xtelefono_tomador: "04124565464", xcorreo_tomador: "test@test.com",
  fnac_tomador: "2002-02-09",
  cestado_tomador: "1",       cciudad_tomador: "128",
  xdireccion_tomador: "Calle test 123",
  icedula_titular: "V",       xrif_titular: 24164799,
  xnombre_titular: "HAMILTON TEST", xapellido_titular: "LEON",
  xtelefono_titular: "04124565464", xcorreo_titular: "test@test.com",
  fnac_titular: "2002-02-09", // <-- campo que faltaba
  cestado_titular: "1",       cciudad_titular: "128",
  xdireccion_titular: "Calle test 123",
  dec_persona_politica: 0,    cpersona_politica: 0,
  dec_term_y_cod: 1,          cterm_y_cod: 1,
  dec_diagnos_enferm: 0,      cdiagnos_enferm: 0,
  cproductor: 80080,
  ifrecuencia: "M",
  femision: today, fdesde: today, fhasta: nextYear,
  asegurados: [
    {
      icedula_asegurado: "V", xrif_asegurado: "24164799",
      xnombre_asegurado: "HAMILTON TEST", xapellido_asegurado: "LEON",
      fnac_asegurado: "2002-02-09",
      isexo_asegurado: "M",
      nparentesco_asegurado: 1,
      iestado_civil_asegurado: "S"
    }
  ],
  beneficiarios: []
};

async function runTests() {
  // TEST 7: Con fnac_titular incluido
  await callAPI('T7_CON_FNAC_TITULAR', BASE_COMPLETE);

  // TEST 8: Sin isexo_tomador ni isexo_titular (ver si los requiere)
  await callAPI('T8_SIN_SEXO', {
    ...BASE_COMPLETE,
    xrif_tomador: 24164800, xrif_titular: 24164800,
    asegurados: [{ ...BASE_COMPLETE.asegurados[0], xrif_asegurado: "24164800" }]
    // sin isexo_tomador ni isexo_titular
  });

  // TEST 9: Con isexo pero sin iestado_civil del titular
  await callAPI('T9_CON_SEXO_TITULAR', {
    ...BASE_COMPLETE,
    xrif_tomador: 24164801, xrif_titular: 24164801,
    isexo_tomador: "M",
    isexo_titular: "M",
    asegurados: [{ ...BASE_COMPLETE.asegurados[0], xrif_asegurado: "24164801" }]
  });

  // TEST 10: Payload completo con todos los campos posibles del titular/tomador
  await callAPI('T10_COMPLETO_MAXIMO', {
    ...BASE_COMPLETE,
    xrif_tomador: 24164802, xrif_titular: 24164802,
    isexo_tomador: "M",     isexo_titular: "M",
    iestado_civil_tomador: "S", iestado_civil_titular: "S",
    asegurados: [{ ...BASE_COMPLETE.asegurados[0], xrif_asegurado: "24164802" }]
  });
}

runTests();
