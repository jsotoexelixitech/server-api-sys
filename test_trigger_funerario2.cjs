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

async function testTrigger() {
    try {
        let pool = await sql.connect(config);
        
        console.log('--- BUSCANDO EN TMEMISION_PERSONAS_GENERAL POR RIF ---');
        const search = await pool.request().query(`
            SELECT TOP 3 id, cnpoliza, cplan, xrif_titular, fingreso
            FROM TMEMISION_PERSONAS_GENERAL
            WHERE xrif_titular = 45461175
            ORDER BY id DESC
        `);
        console.log(search.recordset);
        
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        sql.close();
    }
}

testTrigger();
