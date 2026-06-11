const fs = require('fs');
let content = fs.readFileSync('c:/Users/javier.soto/Desktop/backend-api-sys/nest-api/trigger_output.txt', 'utf-8');

// 1. Declare @mprimaext_api
content = content.replace('DECLARE @error VARCHAR(max)', 'DECLARE @error VARCHAR(max)\r\n    DECLARE @mprimaext_api NUMERIC(18,2) = @mprimaext;');

// 2. Inject right before division
const targetLine = 'SET @mprimaext_tar = @mprimaext_tar / @cuotas';
const replacementLine = `
                    IF ISNULL(@mprimaext_api, 0) > 0 BEGIN
                        SET @mprimaext_tar = @mprimaext_api * @cuotas
                    END
                    SET @mprimaext_tar = @mprimaext_tar / @cuotas
`;
content = content.replace(targetLine, replacementLine);

// Convert CREATE TRIGGER to ALTER TRIGGER
content = content.replace('CREATE   TRIGGER', 'ALTER TRIGGER');

fs.writeFileSync('c:/Users/javier.soto/Desktop/backend-api-sys/nest-api/trigger_fixed2.sql', content);
console.log('Done!');
