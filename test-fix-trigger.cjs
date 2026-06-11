const fs = require('fs');
let content = fs.readFileSync('c:/Users/javier.soto/Desktop/backend-api-sys/nest-api/trigger_actual.txt', 'utf-8');

// Replace the problematic block in TEmision_Per_Ge
const badBlock = `                           IF @cmoneda != 'Bs' BEGIN
                                SELECT @msumaasegext = @msumaaseg
                                SELECT @msumaaseg = @msumaaseg * @ptasamon
                            END ELSE BEGIN 
                                SELECT @msumaasegext = @msumaaseg / @ptasamon
                            END`;

const goodBlock = `                           IF @cmoneda != 'Bs' BEGIN
                                IF @cramo = 9 OR @cramo = 18 BEGIN
                                    SELECT @msumaasegext = @msumatabla / @ptasamon
                                    SELECT @msumaaseg = @msumatabla
                                END ELSE BEGIN
                                    SELECT @msumaasegext = @msumatabla
                                    SELECT @msumaaseg = @msumatabla * @ptasamon
                                END
                            END ELSE BEGIN 
                                SELECT @msumaasegext = @msumatabla / @ptasamon
                                SELECT @msumaaseg = @msumatabla
                            END`;

content = content.replace(badBlock, goodBlock);

// Ensure we use ALTER TRIGGER instead of CREATE TRIGGER
content = content.replace(/CREATE\s+TRIGGER/i, 'ALTER TRIGGER');

fs.writeFileSync('c:/Users/javier.soto/Desktop/backend-api-sys/nest-api/trigger_fixed4.sql', content);
