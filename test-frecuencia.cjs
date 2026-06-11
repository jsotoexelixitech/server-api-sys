const sql = require('mssql');
const config = {
    user: 'sa',
    password: 'Seguros!',
    server: '172.30.149.67',
    database: 'sis2000_qa',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function test() {
    try {
        await sql.connect(config);
        const request = new sql.Request();
        
        const res = await request.query(`
            SELECT DISTINCT cplan FROM maplanes_frec
        `);
        console.log("Distinct plans in maplanes_frec:", res.recordset.map(r=>r.cplan));
    } catch (e) {
        console.error(e);
    } finally {
        sql.close();
    }
}
test();
