const fs = require('fs');
let content = fs.readFileSync('c:/Users/javier.soto/Desktop/backend-api-sys/nest-api/trigger_fixed2.sql', 'utf-8');

content = content.replace(/INSERT INTO ADRECIBOS/g, "SELECT 'BEFORE ADRECIBOS' as debug; INSERT INTO ADRECIBOS");
content = content.replace("SELECT cpoliza, cnpoliza, cnrecibo, cproces, qcuotas, fanopol, fmespol FROM adrecibos WHERE cpoliza = @cpoliza and qcuotas = 1", 
    "SELECT 'END' as debug; SELECT cpoliza, cnpoliza, cnrecibo, cproces, qcuotas, fanopol, fmespol FROM adrecibos WHERE cpoliza = @cpoliza and qcuotas = 1");

fs.writeFileSync('c:/Users/javier.soto/Desktop/backend-api-sys/nest-api/trigger_debug.sql', content);
console.log('Done!');
