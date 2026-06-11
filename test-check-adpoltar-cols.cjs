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
      const res = await pool.request().query("EXEC sp_help adpoltar");
      console.log('adpoltar cols:', res.recordsets[1].filter(c => c.Column_name.includes('msuma')).map(c => c.Column_name + ': ' + c.Type + '(' + c.Length + ', ' + c.Scale + ')'));
  } catch (err) {
      console.error(err);
  }
  process.exit(0);
}
run().catch(console.error);
