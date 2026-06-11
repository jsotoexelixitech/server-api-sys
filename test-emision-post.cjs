const http = require('http');

const body = JSON.stringify({
  "poliza": "9-1-1000000966",
  "cramo": 9,
  "plan": "6",
  "frecuencia": "M",
  "fecha_emision": "2026-06-03",
  "fdesde": "2026-06-03",
  "fhasta": "2027-06-03",
  "rif_tomador": "28461175",
  "nombre_tomador": "JAVIER ENRIQUE",
  "apellido_tomador": "SOTO",
  "cedula_tomador": "V",
  "sexo_tomador": "M",
  "estado_civil_tomador": "S",
  "fnac_tomador": "1999-01-01",
  "direccion_tomador": "CARACAS",
  "telefono_tomador": "04120000000",
  "correo_tomador": "javier@example.com",
  "estado_tomador": "DISTRITO CAPITAL",
  "ciudad_tomador": "CARACAS",
  "rif_titular": "28461175",
  "nombre_titular": "JAVIER ENRIQUE",
  "apellido_titular": "SOTO",
  "cedula_titular": "V",
  "sexo_titular": "M",
  "estado_civil_titular": "S",
  "fnac_titular": "1999-01-01",
  "direccion_titular": "CARACAS",
  "telefono_titular": "04120000000",
  "correo_titular": "javier@example.com",
  "estado_titular": "DISTRITO CAPITAL",
  "ciudad_titular": "CARACAS",
  "prima": 2.1,
  "tasa": 557.9762,
  "msumaaseg": 3000,
  "cmoneda": "$",
  "asegurados": [
    {
      "tipoDoc": "V",
      "identificacion": "28461175",
      "nombre": "JAVIER ENRIQUE",
      "apellido": "SOTO",
      "fechaNac": "1999-01-01",
      "sexo": "M",
      "parentesco": "1"
    }
  ],
  "beneficiarios": []
});

const req = http.request({
  hostname: 'localhost',
  port: 3001,
  path: '/v2/emision/personas',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'x-api-key': '27f91899-70bd-4ff2-8d76-599d10e0dc0e' // dummy or missing?
  }
}, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('API RESPONSE:', res.statusCode, data));
});

req.on('error', console.error);
req.write(body);
req.end();
