const fetch = require('node-fetch');

async function run() {
  const EXTERNAL_API_URL = 'https://qaapisys2000.lamundialdeseguros.com/api/v1/external/createEmissionPerson';
  const EXTERNAL_API_KEY = '2729cc160b985890e0e6df72a161aea27f8e45682511c2dfd045f94eb9868f10';
  const EXTERNAL_BASIC_AUTH = 'Basic YWRtaW46cGFzc3dvcmQxMjM0';

  const payload = {
    "cramo": 9,
    "plan": "7",
    "tipo_cedula_tomador": "V",
    "rif_tomador": 22345433,
    "nombre_tomador": "MARIA",
    "apellido_tomador": "PEREZ",
    "telefono_tomador": "04123456634",
    "correo_tomador": "maria1232@gmail.com",
    "fnac_tomador": "1990-05-15",
    "isexo_tomador": "F",
    "iestado_civil_tomador": "S",
    "estado_tomador": 1,
    "ciudad_tomador": 128,
    "direccion_tomador": "adf132424",
    "tipo_cedula_titular": "V",
    "rif_titular": 22345433,
    "nombre_titular": "MARIA",
    "apellido_titular": "PEREZ",
    "telefono_titular": "04123456634",
    "correo_titular": "maria1232@gmail.com",
    "fnac_titular": "1990-05-15",
    "isexo_titular": "F",
    "iestado_civil_titular": "S",
    "estado_titular": 1,
    "ciudad_titular": 128,
    "direccion_titular": "adf132424",
    "dec_persona_politica": 0,
    "cpersona_politica": 0,
    "dec_term_y_cod": 1,
    "cterm_y_cod": 1,
    "dec_diagnos_enferm": 0,
    "cdiagnos_enferm": 0,
    "cproductor": 80080,
    "frecuencia": "M",
    "fecha_emision": "2026-06-05",
    "fdesde": "2026-06-05",
    "fhasta": "2027-06-04",
    "asegurados": [
      {
        "icedula_asegurado": "V",
        "xrif_asegurado": "22345433",
        "xnombre_asegurado": "MARIA",
        "xapellido_asegurado": "PEREZ",
        "fnac_asegurado": "1990-05-15",
        "isexo_asegurado": "F",
        "nparentesco_asegurado": 1,
        "iestado_civil_asegurado": "S"
      }
    ],
    "beneficiarios": []
  };

  const response = await fetch(EXTERNAL_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': EXTERNAL_API_KEY,
      'Authorization': EXTERNAL_BASIC_AUTH
    },
    body: JSON.stringify(payload)
  });

  const resData = await response.json();
  console.log(`HTTP ${response.status}`);
  console.log(JSON.stringify(resData, null, 2));
}

run().catch(console.error);
