const fs = require('fs');
let content = fs.readFileSync('c:/Users/javier.soto/Desktop/backend-api-sys/nest-api/trigger_fixed2.sql', 'utf-8');

content = content.replace('BEGIN', "BEGIN\r\n    SELECT 'TRIGGER TEmision_Per_Ge STARTED' as debug;");

fs.writeFileSync('c:/Users/javier.soto/Desktop/backend-api-sys/nest-api/trigger_debug2.sql', content);
console.log('Done!');
