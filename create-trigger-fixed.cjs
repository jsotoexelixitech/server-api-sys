const fs = require('fs');

let content = fs.readFileSync('c:/Users/javier.soto/Desktop/backend-api-sys/nest-api/trigger_output.txt', 'utf-8');

// 1. Declare @mprimaext_api
content = content.replace('DECLARE @error VARCHAR(max)', 'DECLARE @error VARCHAR(max)\r\n    DECLARE @mprimaext_api NUMERIC(18,2) = @mprimaext;');

// 2. Modify cursito4 to use @mprimaext_api
const originalMapLogic = "IF @msumatabla is null BEGIN\r\n                            SELECT @msumaasegext = msuma FROM mapltabedad_d \r\n                            WHERE ctablaedad = @ctablatar and @nedad_asegurado >= nedad_min and @nedad_asegurado <= nedad_max;\r\n\r\n                            SELECT @mprimaext_tar = mprima + @mprimaext_tar FROM mapltabedad_d \r\n                            WHERE ctablaedad = @ctablatar and @nedad_asegurado >= nedad_min and @nedad_asegurado <= nedad_max;\r\n                        END ELSE BEGIN\r\n                            IF @cmoneda != 'Bs' BEGIN\r\n                                SELECT @msumaasegext = @msumaaseg\r\n                                SELECT @msumaaseg = @msumaaseg * @ptasamon\r\n                            END ELSE BEGIN \r\n                                SELECT @msumaasegext = @msumaaseg / @ptasamon\r\n                            END\r\n\r\n                            SELECT @mprimaext_tar = @msumaasegext * pprima / 100 FROM mapltabedad_d \r\n                            WHERE ctablaedad = @ctablatar and @nedad_asegurado >= nedad_min and @nedad_asegurado <= nedad_max;\r\n                        END";

const newMapLogic = `                        IF ISNULL(@mprimaext_api, 0) > 0 BEGIN
                            -- Use the premium passed from the API instead of recalculating
                            -- Since the API sends monthly premium and this trigger divides by @cuotas later,
                            -- we multiply by @cuotas here so the division restores the correct monthly premium per receipt.
                            -- We only assign this once (if there are multiple dependents, we don't want to multiply it multiple times, 
                            -- so we do it directly inside the cursito4 loop but assign the fixed value)
                            SET @mprimaext_tar = @mprimaext_api * @cuotas;
                        END ELSE BEGIN
                            -- Fallback to old logic
                            IF @msumatabla is null BEGIN
                                SELECT @msumaasegext = msuma FROM mapltabedad_d 
                                WHERE ctablaedad = @ctablatar and @nedad_asegurado >= nedad_min and @nedad_asegurado <= nedad_max;

                                SELECT @mprimaext_tar = mprima + @mprimaext_tar FROM mapltabedad_d 
                                WHERE ctablaedad = @ctablatar and @nedad_asegurado >= nedad_min and @nedad_asegurado <= nedad_max;
                            END ELSE BEGIN
                                IF @cmoneda != 'Bs' BEGIN
                                    SELECT @msumaasegext = @msumaaseg
                                    SELECT @msumaaseg = @msumaaseg * @ptasamon
                                END ELSE BEGIN 
                                    SELECT @msumaasegext = @msumaaseg / @ptasamon
                                END

                                SELECT @mprimaext_tar = @msumaasegext * pprima / 100 FROM mapltabedad_d 
                                WHERE ctablaedad = @ctablatar and @nedad_asegurado >= nedad_min and @nedad_asegurado <= nedad_max;
                            END
                        END`;

if (content.includes(originalMapLogic)) {
  content = content.replace(originalMapLogic, newMapLogic);
} else {
  console.log("WARNING: Could not find originalMapLogic to replace. Trying with regex.");
  // Fallback regex if newline chars differ
  const regex = /IF @msumatabla is null BEGIN[\s\S]*?WHERE ctablaedad = @ctablatar and @nedad_asegurado >= nedad_min and @nedad_asegurado <= nedad_max;\s*END/;
  if (regex.test(content)) {
      content = content.replace(regex, newMapLogic);
  } else {
      console.log("ERROR: Could not find replacement block at all.");
  }
}

// Convert CREATE TRIGGER to ALTER TRIGGER
content = content.replace('CREATE   TRIGGER', 'ALTER TRIGGER');

fs.writeFileSync('c:/Users/javier.soto/Desktop/backend-api-sys/nest-api/trigger_fixed.sql', content);
console.log('Done!');
