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
  
  // Is it possible there are multiple cursito4 loops?
  // Let me execute the snippet from the trigger directly with dummy values
  const query = `
    DECLARE @mprimaext NUMERIC(18,2) = 2.1;
    DECLARE @mprimaext_api NUMERIC(18,2) = @mprimaext;
    DECLARE @cuotas INT = 12;
    DECLARE @mprimaext_tar NUMERIC(18,2) = 0;
    
    IF ISNULL(@mprimaext_api, 0) > 0 BEGIN
        SET @mprimaext_tar = @mprimaext_api * @cuotas;
    END ELSE BEGIN
        SET @mprimaext_tar = 100;
    END
    
    SELECT @mprimaext_tar as result;
  `;
  try {
      const res = await pool.request().query(query);
      console.log('RESULT:', res.recordset);
  } catch (err) {
      console.error(err);
  }
  
  process.exit(0);
}
run().catch(console.error);
