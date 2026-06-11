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
  try {
      const query = `
      DECLARE @m numeric(18,2) = 1673928.60;
      DECLARE @p numeric(18,4) = 557.9762;
      SELECT @m = @m * @p;
      `;
      await pool.request().batch(query);
      console.log('SUCCESS');
  } catch (err) {
      console.error(err);
  }
  process.exit(0);
}
run().catch(console.error);
