/**
 * test-sp.js — Prueba spUpsertCbreportePago_Ad en QA
 *
 * Uso:
 *   node docs/test-sp.js [ctransaccion]
 *
 * Ejemplo:
 *   node docs/test-sp.js 183034
 *
 * Lee las credenciales del .env del proyecto.
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const sql = require('mssql');

const ctransaccion = parseInt(process.argv[2] ?? '183034', 10);

const config = {
  server:   process.env.SERVER_BD,
  database: process.env.NAME_BD,
  user:     process.env.USER_BD,
  password: process.env.PASSWORD_BD,
  options: {
    encrypt:                  process.env.MSSQL_ENCRYPT === 'true',
    trustServerCertificate:   process.env.MSSQL_TRUST_SERVER_CERTIFICATE !== 'false',
    enableArithAbort:         true,
    requestTimeout:           30000,
  },
};

async function main() {
  let pool;
  try {
    console.log(`\n🔌  Conectando a ${config.server}/${config.database}…`);
    pool = await sql.connect(config);
    console.log('✅  Conectado.\n');

    /* ── 1. Verificar que el SP existe ─────────────────────────── */
    const spCheck = await pool.request().query(`
      SELECT name, create_date, modify_date
      FROM sys.procedures
      WHERE name = 'spUpsertCbreportePago_Ad'
    `);
    if (!spCheck.recordset.length) {
      console.error('❌  SP no encontrado en la BD. Revisa el script de creación.');
      return;
    }
    const sp = spCheck.recordset[0];
    console.log(`📦  SP encontrado:`);
    console.log(`    Nombre      : ${sp.name}`);
    console.log(`    Creado      : ${sp.create_date}`);
    console.log(`    Modificado  : ${sp.modify_date}\n`);

    /* ── 2. Estado ANTES ────────────────────────────────────────── */
    const antes = await pool.request()
      .input('ct', sql.Numeric(18, 0), ctransaccion)
      .query(`
        SELECT ctransaccion, npago, cbanco_destino, ctipopago,
               freporte, fingreso, cusuario, xreferencia
        FROM dbo.cbreporte_pago
        WHERE ctransaccion = @ct
      `);
    console.log(`📋  Estado ANTES  (ctransaccion=${ctransaccion}):`);
    if (antes.recordset.length) {
      console.table(antes.recordset);
    } else {
      console.log('    (no hay fila aún — se hará INSERT)\n');
    }

    /* ── 3. Ejecutar el SP ──────────────────────────────────────── */
    console.log(`🚀  Ejecutando spUpsertCbreportePago_Ad…`);
    const req = pool.request();
    req.input ('ctransaccion',   sql.Numeric(18, 0), ctransaccion);
    req.input ('npago',          sql.Numeric(18, 0), 1);
    req.input ('casegurado',     sql.Numeric(18, 0), 1);
    req.input ('cmoneda',        sql.Char(4),        'Bs  ');
    req.input ('cbanco',         sql.Numeric(18, 2), 102);
    req.input ('cbanco_destino', sql.Numeric(18, 2), 35);
    req.input ('ctipopago',      sql.Numeric(10, 0), 3);
    req.input ('mpago',          sql.Numeric(18, 2), 7.24);
    req.input ('mpagoext',       sql.Numeric(18, 2), 0.01);
    req.input ('mpagoigtf',      sql.Numeric(18, 2), 0);
    req.input ('mpagoigtfext',   sql.Numeric(18, 2), 0);
    req.input ('mtotal',         sql.Numeric(18, 2), 7.24);
    req.input ('mtotalext',      sql.Numeric(18, 2), 0.01);
    req.input ('ptasamon',       sql.Numeric(18, 4), 1);
    req.input ('ptasaref',       sql.Numeric(18, 4), 1);
    req.input ('xreferencia',    sql.VarChar(30),    String(ctransaccion));
    req.input ('xruta',          sql.VarChar(100),   'Sin soporte');
    req.input ('cusuario',       sql.Numeric(18, 0), 4);
    req.input ('fingreso',       sql.DateTime,       new Date());
    req.input ('freporte',       sql.DateTime,       new Date());
    req.input ('cprog',          sql.Char(20),       'TEST_NODE');
    req.output('accion',         sql.Char(1));
    req.output('mensaje',        sql.VarChar(500));

    const result = await req.execute('spUpsertCbreportePago_Ad');
    const accion  = result.output['accion']?.trim()  ?? '?';
    const mensaje = result.output['mensaje']?.trim() ?? '?';

    const iconAccion = accion === 'I' ? '🆕' : accion === 'U' ? '✏️ ' : '❌';
    console.log(`\n${iconAccion}  Resultado:`);
    console.log(`    accion  : ${accion}  (I=insert · U=update · E=error)`);
    console.log(`    mensaje : ${mensaje}\n`);

    if (accion === 'E') {
      console.error('❌  El SP devolvió error. Revisar mensaje arriba.');
      return;
    }

    /* ── 4. Estado DESPUÉS ──────────────────────────────────────── */
    const despues = await pool.request()
      .input('ct', sql.Numeric(18, 0), ctransaccion)
      .query(`
        SELECT ctransaccion, npago, cbanco_destino, ctipopago,
               freporte, fingreso, cusuario, xreferencia
        FROM dbo.cbreporte_pago
        WHERE ctransaccion = @ct
      `);
    console.log(`📋  Estado DESPUÉS (ctransaccion=${ctransaccion}):`);
    console.table(despues.recordset);

    /* ── 5. Validaciones críticas ───────────────────────────────── */
    const fila = despues.recordset[0];
    const ok = { destino: false, fecha: false };
    if (fila) {
      ok.destino = fila['cbanco_destino'] != null;
      ok.fecha   = fila['freporte'] != null || fila['fingreso'] != null;
    }

    console.log('🔍  Validaciones para ingreso_caja:');
    console.log(`    cbanco_destino presente : ${ok.destino ? '✅' : '❌ FALTA'}`);
    console.log(`    freporte / fingreso     : ${ok.fecha   ? '✅' : '❌ FALTA'}`);
    console.log(
      ok.destino && ok.fecha
        ? '\n✅  SP funciona correctamente. Banco Destino y Fecha Operación se guardan.\n'
        : '\n⚠️   Revisar columnas faltantes.\n',
    );

  } catch (err) {
    console.error('\n❌  Error:', err.message ?? err);
  } finally {
    if (pool) await pool.close();
  }
}

main();
