const sql = require('mssql');
require('dotenv').config();

const sqlConfig = {
  user: process.env.USER_BD,
  password: process.env.PASSWORD_BD,
  database: process.env.NAME_BD,
  server: process.env.SERVER_BD,
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  options: { encrypt: false, trustServerCertificate: true }
};

async function run() {
  const pool = await sql.connect(sqlConfig);
  
  const query = `
    DECLARE @cpoliza NUMERIC(19) = 9000000000000121382;
    DECLARE @cplan VARCHAR(6) = '6';
    DECLARE @cramo INT = 9;
    DECLARE @ncobertura TINYINT = 1;
    DECLARE @ctablatar CHAR(10);
    DECLARE @nedad_asegurado VARCHAR(20);
    DECLARE @mprimaext_tar NUMERIC(18,2);
    DECLARE @msumatabla numeric(18,2);
    DECLARE @msumaasegext numeric(18,2);
    DECLARE @msumaaseg numeric(18,2) = 0;
    DECLARE @ptasamon numeric(18,6) = 1;
    DECLARE @cmoneda char(4) = '$';

    SELECT @mprimaext_tar = 0;

    DECLARE cursito4 CURSOR FOR 
    select ctablatar, DATEDIFF(YEAR, peasegurados.fnacimiento, GETDATE()) from mapltarifas_per 
    INNER JOIN peasegurados ON peasegurados.cpoliza = @cpoliza AND peasegurados.cparentesco = mapltarifas_per.cparen
    WHERE mapltarifas_per.cplan=@cplan AND mapltarifas_per.cramo=@cramo AND mapltarifas_per.ccobertura=@ncobertura;
    
    OPEN cursito4;
    FETCH NEXT FROM cursito4 INTO @ctablatar, @nedad_asegurado;
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
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

        FETCH NEXT FROM cursito4 INTO @ctablatar, @nedad_asegurado;
    END 
    CLOSE cursito4;
    DEALLOCATE cursito4;
    
    SELECT @mprimaext_tar as mprimaext_tar;
  `;
  
  const res = await pool.request().query(query);
  console.log('RESULTADO FINAL:', res.recordset);
  
  process.exit(0);
}
run().catch(console.error);
