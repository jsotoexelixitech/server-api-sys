const fetch = require('node-fetch');

async function run() {
  const EXTERNAL_API_URL = 'http://localhost:3002/api/v1/personas/emision';

  const payload = {
    "cramo": 9,
    "plan": "8",
    "tipo_cedula_tomador": "V",
    "rif_tomador": 28461199,
    "nombre_tomador": "HAMILTON",
    "apellido_tomador": "LEON",
    "telefono_tomador": "04125676576",
    "correo_tomador": "hamilton232323@gmail.com",
    "fnac_tomador": "2002-02-09",
    "isexo_tomador": "M",
    "iestado_civil_tomador": "S",
    "estado_tomador": 1,
    "ciudad_tomador": 128,
    "direccion_tomador": "sadf3q2wf23143f23f",
    "tipo_cedula_titular": "V",
    "rif_titular": 28461199,
    "nombre_titular": "HAMILTON",
    "apellido_titular": "LEON",
    "telefono_titular": "04125676576",
    "correo_titular": "hamilton232323@gmail.com",
    "fnac_titular": "2002-02-09",
    "isexo_titular": "M",
    "iestado_civil_titular": "S",
    "estado_titular": 1,
    "ciudad_titular": 128,
    "direccion_titular": "sadf3q2wf23143f23f",
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
        "xrif_asegurado": "28461199",
        "xnombre_asegurado": "HAMILTON",
        "xapellido_asegurado": "LEON",
        "fnac_asegurado": "2002-02-09",
        "isexo_asegurado": "M",
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
      'apikey': 'testing'
    },
    body: JSON.stringify(payload)
  });

  const resData = await response.json();
  console.log(`HTTP ${response.status}`);
  console.log(JSON.stringify(resData, null, 2));
}

run().catch(console.error);
