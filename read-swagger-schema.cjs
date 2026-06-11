const https = require('https');

// Extraer el schema completo del endpoint createEmissionPerson del Swagger
const options = {
  hostname: 'qaapisys2000.lamundialdeseguros.com',
  path: '/api-docs/swagger-ui-init.js',
  method: 'GET',
  auth: 'admin:password1234'
};
const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    // Buscar el inicio del JSON y extraerlo
    const start = data.indexOf('"swaggerDoc":');
    const end = data.lastIndexOf('};');
    const jsonStr = '{' + data.slice(start, end) + '}';
    try {
      const doc = JSON.parse(jsonStr);
      const swaggerDoc = doc.swaggerDoc;
      
      // Buscar el endpoint de emision
      const path = '/api/v1/external/createEmissionPerson';
      const endpoint = swaggerDoc.paths[path];
      
      if (endpoint) {
        console.log('=== ENDPOINT: POST', path, '===');
        const postOp = endpoint.post;
        const bodyRef = postOp.requestBody?.content?.['application/json']?.schema;
        
        // Resolver el $ref si existe
        if (bodyRef && bodyRef['$ref']) {
          const refName = bodyRef['$ref'].replace('#/components/schemas/', '');
          const schema = swaggerDoc.components?.schemas?.[refName];
          console.log('\nSchema name:', refName);
          console.log('Required fields:', JSON.stringify(schema?.required, null, 2));
          console.log('\nAll properties:');
          if (schema?.properties) {
            for (const [field, def] of Object.entries(schema.properties)) {
              console.log(`  ${field}: ${def.type || def['$ref'] || 'object'} ${def.description ? '| ' + def.description : ''}`);
            }
          }
        } else if (bodyRef) {
          console.log('Schema inline:', JSON.stringify(bodyRef, null, 2).slice(0, 3000));
        }
        
        console.log('\nResponses:', JSON.stringify(Object.keys(postOp.responses || {})));
      } else {
        console.log('Endpoint no encontrado. Paths disponibles:');
        console.log(Object.keys(swaggerDoc.paths).filter(p => p.includes('external') || p.includes('emision')));
      }
    } catch(e) {
      console.error('Error parseando JSON:', e.message);
      // Buscar manualmente el endpoint
      const idx = data.indexOf('createEmissionPerson');
      if (idx > 0) {
        console.log('Contexto alrededor de createEmissionPerson:');
        console.log(data.slice(Math.max(0, idx-200), idx+2000));
      }
    }
  });
});
req.on('error', err => console.error(err.message));
req.end();
