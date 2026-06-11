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
  let query = fs.readFileSync('c:/Users/javier.soto/Desktop/backend-api-sys/nest-api/trigger_fixed2.sql', 'utf-8');
  
  query = query.replace(/\bGO\b/g, '');
  
  try {
      await pool.request().query(query);
      console.log('TRIGGER ALTERED SUCCESSFULLY!');
  } catch (err) {
      console.error('ERROR ALTERING TRIGGER:', err);
  }
  
  process.exit(0);
}
run().catch(console.error);
