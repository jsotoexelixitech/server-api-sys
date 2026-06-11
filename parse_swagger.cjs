const https = require('https');
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
    try {
      const match = data.match(/"swaggerDoc": (\{.*?\})\n\s*};/s);
      if (match) {
        const doc = JSON.parse(match[1]);
        for (const [path, methods] of Object.entries(doc.paths)) {
          if (path.toLowerCase().includes('emision') || path.toLowerCase().includes('persona')) {
            console.log('Path:', path);
            for (const [method, details] of Object.entries(methods)) {
               console.log('  [' + method.toUpperCase() + ']', details.summary || '');
            }
          }
        }
      } else {
        console.log('JSON no encontrado');
      }
    } catch(e) { console.error(e.message); }
  });
});
req.on('error', err => console.error(err.message));
req.end();
