const https = require('https');

const today = new Date().toISOString().split('T')[0];
const nextYear = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0];

const payload = {
  cramo: 9,
  plan: "6",
  icedula_tomador: "V",
  xrif_tomador: 24164789,
  xnombre_tomador: "HAMILTON TEST",
  xapellido_tomador: "LEON",
  xtelefono_tomador: "04124565464",
  xcorreo_tomador: "HAMILTONHAMILTON@GMAIL.COM",
  fnac_tomador: "2002-02-09",
  cestado_tomador: "1",
  cciudad_tomador: "128",
  xdireccion_tomador: "SDFWE23314",
  icedula_titular: "V",
  xrif_titular: 24164789,
  xnombre_titular: "HAMILTON TEST",
  xapellido_titular: "LEON",
  xtelefono_titular: "04124565464",
  xcorreo_titular: "HAMILTONHAMILTON@GMAIL.COM",
  cestado_titular: "1",
  cciudad_titular: "128",
  xdireccion_titular: "SDFWE23314",
  dec_persona_politica: 0,
  cpersona_politica: 0,
  dec_term_y_cod: 1,
  cterm_y_cod: 1,
  dec_diagnos_enferm: 0,
  cdiagnos_enferm: 0,
  cproductor: 80080,
  femision: today,
  fdesde: today,
  fhasta: nextYear,
  ifrecuencia: "M", // Faltaba esto
  apikey: "EXELIXI-TEST",
  asegurados: [
    {
      icedula_asegurado: "V",
      xrif_asegurado: "24164789",
      xnombre_asegurado: "HAMILTON TEST",
      xapellido_asegurado: "LEON",
      fnac_asegurado: "2002-02-09",
      isexo_asegurado: "M",
      nparentesco_asegurado: 1,
      iestado_civil_asegurado: "S"
    }
  ],
  beneficiarios: []
};

const payloadStr = JSON.stringify(payload);

const options = {
  hostname: 'qaapisys2000.lamundialdeseguros.com',
  path: '/api/v1/external/createEmissionPerson',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payloadStr),
    'apikey': 'EXELIXI-TEST'
  },
  auth: 'admin:password1234'
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('--- RESULTADO DE LA NUEVA API ---');
    console.log('HTTP Status:', res.statusCode);
    try {
      console.log(JSON.stringify(JSON.parse(data), null, 2));
    } catch(e) {
      console.log('Raw output:\n', data);
    }
  });
});
req.on('error', err => console.error(err.message));
req.write(payloadStr);
req.end();
