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

async function enableTrigger() {
    try {
        let pool = await sql.connect(config);
        
        console.log('--- HABILITANDO EL TRIGGER ---');
        await pool.request().query(`
            ALTER TABLE TMEMISION_PERSONAS_GENERAL ENABLE TRIGGER TEmision_Per_Ge;
        `);
        
        console.log('Trigger habilitado con éxito.');
        
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        sql.close();
    }
}

enableTrigger();
