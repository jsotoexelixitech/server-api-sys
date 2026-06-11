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
        
        console.log('--- BUSCANDO EN ADPOLIZA POR RIF ---');
        const search = await pool.request().query(`
            SELECT TOP 3 cnpoliza, cramo, xrif, fdesde
            FROM adpoliza
            WHERE xrif = '45461175'
            ORDER BY cnpoliza DESC
        `);
        console.log(search.recordset);

        console.log('--- BUSCANDO ÚLTIMAS PÓLIZAS GLOBALES ---');
        const latest = await pool.request().query(`
            SELECT TOP 3 cnpoliza, cramo, xrif, fdesde
            FROM adpoliza
            ORDER BY cnpoliza DESC
        `);
        console.log(latest.recordset);
        
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        sql.close();
    }
}

testTrigger();
