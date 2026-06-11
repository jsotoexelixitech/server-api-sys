const fs = require('fs');
let content = fs.readFileSync('c:/Users/javier.soto/Desktop/backend-api-sys/nest-api/test-check-insert-notry.cjs', 'utf-8');
content = content.replace(/28461175/g, '24164738');
content = content.replace(/9-1-1000000966/g, '9-1-1000000998');
content = content.replace('const pool = await sql.connect(sqlConfig);', "const pool = await sql.connect(sqlConfig);\nconst infos = [];\npool.on('infoMessage', info => infos.push(info.message));");
content = content.replace('} catch (err) {', "} catch (err) {\nconsole.log('INFOS:', infos.join('\\n'));");
fs.writeFileSync('c:/Users/javier.soto/Desktop/backend-api-sys/nest-api/test-check-insert-notry6.cjs', content);
