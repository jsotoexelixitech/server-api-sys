const https = require('https');

const payload = {
  "state": {
    "product": "funerario",
    "tomador": {
      "tipoDoc": "V",
      "identificacion": "22462275",
      "nombre": "HAMILTON",
      "apellido": "LEON",
      "telefono": "04124565464",
      "email": "HAMILTONHAMILTON@GMAIL.COM",
      "email2": "HAMILTONHAMILTON@GMAIL.COM",
      "fechaNac": "2002-02-09",
      "sexo": "Masculino",
      "estadoCivil": "Soltero",
      "estado": "Distrito Capital",
      "ciudad": "Caracas",
      "direccion": "SDFWE23314",
      "personaPoliticamenteExpuesta": false,
      "cestado": 1,
      "cciudad": 128
    },
    "funeral": {
      "asegurados": [
        {
          "tipoDoc": "V",
          "identificacion": "22462275",
          "nombre": "HAMILTON",
          "apellido": "LEON",
          "fechaNac": "2002-02-09",
          "sexo": "Masculino",
          "parentesco": "1"
        }
      ],
      "beneficiarios": [],
      "frecuencia": "M",
      "diagnosticoEnfermedad": false,
      "descripcionEnfermedad": "",
      "aceptaTerminos": true
    },
    "sameInsured": true,
    "asegurado": {
      "nombre": "",
      "apellido": "",
      "identificacion": "",
      "tipoDoc": "V",
      "fechaNac": "",
      "parentesco": "",
      "licencia": "",
      "relacion": "",
      "telefono": "",
      "email": ""
    },
    "differentPayer": false,
    "pagador": {
      "nombre": "",
      "apellido": "",
      "identificacion": "",
      "tipoDoc": "V",
      "fechaNac": "",
      "parentesco": "",
      "licencia": "",
      "relacion": "",
      "telefono": "",
      "email": ""
    },
    "hasBeneficiary": false,
    "beneficiario": {
      "nombre": "",
      "apellido": "",
      "identificacion": "",
      "tipoDoc": "V",
      "fechaNac": "",
      "parentesco": "",
      "licencia": "",
      "relacion": "",
      "telefono": "",
      "email": ""
    },
    "hasDriver": false,
    "conductor": {
      "nombre": "",
      "apellido": "",
      "identificacion": "",
      "tipoDoc": "V",
      "fechaNac": "",
      "parentesco": "",
      "licencia": "",
      "relacion": "",
      "telefono": "",
      "email": ""
    },
    "vehicle": {
      "placa": "",
      "tipoPlaca": "nacional",
      "marca": "",
      "modelo": "",
      "año": "",
      "color": "",
      "serial": "",
      "serialMotor": "",
      "uso": "Particular"
    },
    "category": "3.000$ Funerario Individual",
    "selectedPlan": {
      "cplan": "6",
      "name": "3.000$ Funerario Individual",
      "price": "Tarifa La Mundial",
      "priceNum": 0,
      "tag": "Funerario",
      "desc": "Cobertura de servicios funerarios para las personas aseguradas.",
      "benefits": [
        "Servicio funerario completo",
        "Cobertura para el grupo familiar asegurado",
        "Asistencia y traslado"
      ],
      "sumaAsegurada": 0
    },
    "paymentMethod": "mobile"
  },
  "frecuencia": "M"
};

const payloadStr = JSON.stringify(payload);

const options = {
  hostname: 'qaapisys2000.lamundialdeseguros.com',
  path: '/api/v1/external/createEmissionPerson', // Usando la ruta de external que vimos en logs
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payloadStr)
  },
  auth: 'admin:password1234'
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
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
