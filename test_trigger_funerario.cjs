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
        console.log('Connecting to SQL Server...');
        let pool = await sql.connect(config);
        console.log('Connected!');

        pool.on('info', info => console.log('\n[SQL INFO/WARNING]', info.message));
        pool.on('error', err => console.error('\n[SQL FATAL ERROR]', err));

        // 1. Limpiar tablas temporales
        await pool.request().query('DELETE FROM eePoliza_Salud_Aseg');

        // 2. Insertar asegurado
        await pool.request().query(`
            INSERT INTO eePoliza_Salud_Aseg (
                icedula_asegurado, xrif_asegurado, xnombre_asegurado, xapellido_asegurado,
                fnac_asegurado, isexo_asegurado, nparentesco_asegurado, iestado_civil_asegurado
            ) VALUES (
                'V', '45461175', 'HAMILTON', 'LEON',
                '2002-02-09', 'M', 1, 'S'
            )
        `);
        console.log('Inserted into eePoliza_Salud_Aseg');

        // 3. Insertar principal
        console.log('\nExecuting INSERT INTO eePoliza_Personas_General... (Pay attention to [SQL INFO] below)');
        const result = await pool.request().query(`
            INSERT INTO eePoliza_Personas_General (
                cramo, cplan, icedula_tomador, xrif_tomador, xnombre_tomador, xapellido_tomador,
                isexo_tomador, iestado_civil_tomador, fnac_tomador, cestado_tomador, cciudad_tomador,
                xdireccion_tomador, xtelefono_tomador, xcorreo_tomador,
                icedula_titular, xrif_titular, xnombre_titular, xapellido_titular,
                isexo_titular, iestado_civil_titular, fnac_titular, cestado_titular, cciudad_titular,
                xdireccion_titular, xtelefono_titular, xcorreo_titular,
                cpersona_politica, cterm_y_cod, cdiagnos_enferm, xdiagnos_enferm,
                cproductor, ptasamon, msumaaseg, cmoneda, mprimaext, ifrecuencia,
                femision, fdesde, fhasta, xcanal_venta, corigen_rel,
                api, method, cprog, ifuente, fingreso
            ) VALUES (
                9, '6', 'V', 45461175, 'HAMILTON', 'LEON',
                'M', 'S', '2002-02-09', '1', '128',
                '12312d12d', '04243878876', 'javieruzcateguisoto@gmail.com',
                'V', 45461175, 'HAMILTON', 'LEON',
                'M', 'S', '2002-02-09', '1', '128',
                '12312d12d', '04243878876', 'javieruzcateguisoto@gmail.com',
                0, 1, 0, '',
                80080, 577.7758, 3000.00, 'USD', 6.29, 'T',
                '2026-06-11', '2026-06-11', '2027-06-10', 'BRCV', '14',
                'EmissionGeneral', 'createEmmisionPersonGeneral', 'eePoliza_PerGe', 'BRCV', GETDATE()
            )
        `);
        console.log('\nResult from INSERT:', JSON.stringify(result, null, 2));
    } catch (err) {
        console.error('\nCaught Exception:', err.message);
    } finally {
        sql.close();
    }
}

testTrigger();
