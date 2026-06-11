const fs = require('fs');
let content = fs.readFileSync('c:/Users/javier.soto/Desktop/backend-api-sys/nest-api/spGeneraAdpolrea.txt', 'utf-8');
content = content.replace('update adpolrea set', "PRINT 'SUM MPRIMAEXT: ' + CAST(@mprimabrutaext AS VARCHAR(100)); \n PRINT 'SUM MSUMAASEG: ' + CAST(@msumaaseg AS VARCHAR(100)); \n PRINT 'SUM MSUMAASEGEXT: ' + CAST(@msumaasegext AS VARCHAR(100)); \n update adpolrea set");
content = content.replace('CREATE   PROCEDURE', 'ALTER PROCEDURE');
fs.writeFileSync('c:/Users/javier.soto/Desktop/backend-api-sys/nest-api/spGeneraAdpolrea-debug.sql', content);
