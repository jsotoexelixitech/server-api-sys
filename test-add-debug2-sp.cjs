const fs = require('fs');
let content = fs.readFileSync('c:/Users/javier.soto/Desktop/backend-api-sys/nest-api/spGeneraAdpolrea.txt', 'utf-8');
content = content.replace('select top 1 @isuma = isuma from adpolcob', "DECLARE @dbg_val numeric(38,2); DECLARE @dbg_val2 numeric(38,2); select @dbg_val = sum(msumaaseg), @dbg_val2 = sum(msumaasegext) from adpolcob where ccontrea = @ccontrea and crecibo = @crecibo; PRINT 'DBG MSUMA:' + CAST(@dbg_val AS VARCHAR(100)); PRINT 'DBG MSUMAEXT:' + CAST(@dbg_val2 AS VARCHAR(100)); select top 1 @isuma = isuma from adpolcob");
content = content.replace('CREATE   PROCEDURE', 'ALTER PROCEDURE');
fs.writeFileSync('c:/Users/javier.soto/Desktop/backend-api-sys/nest-api/spGeneraAdpolrea-debug2.sql', content);
