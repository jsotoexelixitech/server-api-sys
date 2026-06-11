const fs = require('fs');
let content = fs.readFileSync('c:/Users/javier.soto/Desktop/backend-api-sys/nest-api/trigger_actual.txt', 'utf-8');

content = content.replace(/IF @cmoneda != 'Bs' BEGIN\s*SELECT @msumaasegext = @msumaaseg\s*SELECT @msumaaseg = @msumaaseg \* @ptasamon\s*END ELSE BEGIN\s*SELECT @msumaasegext = @msumaaseg \/ @ptasamon\s*END/g, 
`IF @cmoneda != 'Bs' BEGIN
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
END`);

content = content.replace(/CREATE\s+TRIGGER/i, 'ALTER TRIGGER');
fs.writeFileSync('c:/Users/javier.soto/Desktop/backend-api-sys/nest-api/trigger_fixed4.sql', content);
console.log('REPLACED SUCCESSFULLY');
