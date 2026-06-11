const sql = require('mssql');
const fs = require('fs');
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
  let query = fs.readFileSync('c:/Users/javier.soto/Desktop/backend-api-sys/nest-api/trigger_output.txt', 'utf-8');
  query = query.replace('CREATE   TRIGGER', 'ALTER TRIGGER').replace(/\bGO\b/g, '');
  
  query = query.replace('SET NOCOUNT ON;', "SET NOCOUNT ON; PRINT 'TRIGGER STARTED';");
  query = query.replace(/INSERT INTO adpoltar/g, "PRINT 'BEFORE ADPOLTAR'; INSERT INTO adpoltar");
  query = query.replace(/INSERT INTO ADRECIBOS/g, "PRINT 'BEFORE ADRECIBOS'; INSERT INTO ADRECIBOS");
  query = query.replace(/SELECT cpoliza, cnpoliza/g, "PRINT 'BEFORE FINAL SELECT'; SELECT cpoliza, cnpoliza");
  
  try {
      await pool.request().query(query);
      console.log('TRIGGER ALTERED WITH PRINTS!');
  } catch (err) {
      console.error(err);
  }
  process.exit(0);
}
run().catch(console.error);
