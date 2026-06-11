const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.USER_BD,
    password: process.env.PASSWORD_BD,
    server: process.env.SERVER_BD,
    database: process.env.NAME_BD,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
    }
};

async function checkTrigger() {
    try {
        let pool = await sql.connect(config);
        
        const q = await pool.request().query(`
            SELECT name, is_disabled 
            FROM sys.triggers 
            WHERE parent_id = OBJECT_ID('TMEMISION_PERSONAS_GENERAL')
        `);
        console.log('Triggers en TMEMISION_PERSONAS_GENERAL:');
        console.log(q.recordset);
        
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        sql.close();
    }
}

checkTrigger();
