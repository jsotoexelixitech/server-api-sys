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
  
  // Simular exactamente lo que hace el trigger en linea 431-432
  // @msumaaseg = 3000, @ptasamon = 557.9762
  // @cmoneda = 'Bs' (probablemente)
  // Probar ambas ramas
  try {
    const r1 = await pool.request().query(`
      DECLARE @msumaaseg numeric(18,2) = 3000;
      DECLARE @msumaasegext numeric(18,2);
      DECLARE @ptasamon numeric(18,6) = 557.9762;
      DECLARE @cmoneda char(4) = 'USD';
      
      IF @cmoneda != 'Bs' BEGIN
        SELECT @msumaasegext = @msumaaseg
        SELECT @msumaaseg = @msumaaseg * @ptasamon
      END ELSE BEGIN
        SELECT @msumaasegext = @msumaaseg / @ptasamon
      END
      
      SELECT @msumaaseg as msumaaseg, @msumaasegext as msumaasegext
    `);
    console.log('Result USD branch:', r1.recordset);
  } catch (e) {
    console.error('ERROR USD branch:', e.message);
  }

  try {
    const r2 = await pool.request().query(`
      DECLARE @msumaaseg numeric(18,2) = 3000;
      DECLARE @msumaasegext numeric(18,2);
      DECLARE @ptasamon numeric(18,6) = 557.9762;
      DECLARE @cmoneda char(4) = 'Bs  ';
      
      IF @cmoneda != 'Bs' BEGIN
        SELECT @msumaasegext = @msumaaseg
        SELECT @msumaaseg = @msumaaseg * @ptasamon
      END ELSE BEGIN
        SELECT @msumaasegext = @msumaaseg / @ptasamon
      END
      
      SELECT @msumaaseg as msumaaseg, @msumaasegext as msumaasegext
    `);
    console.log('Result Bs branch:', r2.recordset);
  } catch (e) {
    console.error('ERROR Bs branch:', e.message);
  }
  
  process.exit(0);
}
run().catch(console.error);
