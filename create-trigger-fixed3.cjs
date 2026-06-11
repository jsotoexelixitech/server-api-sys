const fs = require('fs');
let content = fs.readFileSync('c:/Users/javier.soto/Desktop/backend-api-sys/nest-api/trigger_copy1_output.txt', 'utf-8');

// The original trigger is saved in trigger_output.txt
let originalContent = fs.readFileSync('c:/Users/javier.soto/Desktop/backend-api-sys/nest-api/trigger_output.txt', 'utf-8');

originalContent = originalContent.replace('CREATE   TRIGGER', 'ALTER TRIGGER');

const targetLine = 'SET @mprimaext_tar = @mprimaext_tar / @cuotas';
const replacementLine = `
                    IF ISNULL(@mprimaext, 0) > 0 BEGIN
                        SET @mprimaext_tar = @mprimaext * @cuotas
                    END
                    SET @mprimaext_tar = @mprimaext_tar / @cuotas
`;
originalContent = originalContent.replace(targetLine, replacementLine);

fs.writeFileSync('c:/Users/javier.soto/Desktop/backend-api-sys/nest-api/trigger_fixed3.sql', originalContent);
console.log('Done!');
