/**
 * Conciliación de recibos: Sis2000 (origen) vs PostgreSQL reportes (destino del sync).
 * Solo lectura en ambos lados. Compara por mes y por estado usando la misma fecha que el
 * SP sp_rpt_recibos_v6 (Cobrado→fecha de pago, Anulado→anulación, Pendiente→vigencia (fdesde),
 * Notificado→vigencia), de modo que una diferencia equivale a datos que el reporte no ve.
 *
 * Uso:
 *   node scripts/reportes/reconcile-recibos.js [--desde 2026-01-01] [--hasta 2026-09-14]
 *        [--umbral 0.5] [--json]
 *
 * Variables (.env): SERVER_BD, USER_BD, PASSWORD_BD, NAME_BD (origen; RECONCILE_ORIGEN_DB
 * sobrescribe la base) y REPORTES_PG_HOST/PORT/USER/PASSWORD/DATABASE (destino).
 * Código de salida: 0 = dentro del umbral, 2 = diferencia sobre el umbral, 1 = error.
 *
 * Nota: el extract de Mundial usa INNER JOIN a póliza y tomador, así que una brecha
 * pequeña y estable (< 0,5 %) es esperable; una brecha creciente indica fallo del sync.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env') });
const sql = require('mssql');
const { Pool } = require('pg');

const ESTADOS = [
  { letra: 'C', id: 3, nombre: 'Cobrado', origen: 'fcobro', destino: 'fecha_pago' },
  { letra: 'P', id: 2, nombre: 'Pendiente', origen: 'fdesde', destino: 'fecha_desde' },
  { letra: 'A', id: 4, nombre: 'Anulado', origen: 'fanulacion', destino: 'fecha_anulacion' },
  { letra: 'N', id: 1, nombre: 'Notificado', origen: 'fdesde', destino: 'fecha_desde' },
];

function parseArgs(argv) {
  const args = { desde: null, hasta: null, umbral: 0.5, json: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--desde') args.desde = argv[++i];
    else if (a === '--hasta') args.hasta = argv[++i];
    else if (a === '--umbral') args.umbral = Number(argv[++i]);
  }
  const hoy = new Date();
  args.hasta = args.hasta || hoy.toISOString().slice(0, 10);
  args.desde = args.desde || `${hoy.getUTCFullYear()}-01-01`;
  for (const k of ['desde', 'hasta']) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args[k])) throw new Error(`--${k} debe ser YYYY-MM-DD`);
  }
  if (!Number.isFinite(args.umbral) || args.umbral < 0) throw new Error('--umbral inválido');
  return args;
}

async function contarOrigen(pool, desde, hasta) {
  const out = new Map();
  for (const e of ESTADOS) {
    // e.origen viene de una lista fija (no de entrada externa).
    const r = await pool
      .request()
      .input('desde', sql.Date, new Date(`${desde}T00:00:00Z`))
      .input('hasta', sql.Date, new Date(`${hasta}T00:00:00Z`))
      .query(
        `SELECT FORMAT(${e.origen}, 'yyyy-MM') AS mes, COUNT(*) AS n
           FROM adrecibos WITH (NOLOCK)
          WHERE iestadorec = '${e.letra}'
            AND ${e.origen} >= @desde AND ${e.origen} < DATEADD(day, 1, @hasta)
          GROUP BY FORMAT(${e.origen}, 'yyyy-MM')`,
      );
    for (const row of r.recordset) out.set(`${e.letra}|${row.mes}`, Number(row.n));
  }
  return out;
}

async function contarDestino(pg, desde, hasta) {
  const out = new Map();
  for (const e of ESTADOS) {
    const r = await pg.query(
      `SELECT to_char(${e.destino}, 'YYYY-MM') AS mes, COUNT(*)::int AS n
         FROM recibo
        WHERE id_estatus = $1
          AND ${e.destino} >= $2::date AND ${e.destino} < ($3::date + 1)
        GROUP BY 1`,
      [e.id, desde, hasta],
    );
    for (const row of r.rows) out.set(`${e.letra}|${row.mes}`, Number(row.n));
  }
  return out;
}

function conciliar(origen, destino) {
  const claves = new Set([...origen.keys(), ...destino.keys()]);
  const filas = [];
  for (const clave of claves) {
    const [letra, mes] = clave.split('|');
    const o = origen.get(clave) || 0;
    const d = destino.get(clave) || 0;
    const faltan = o - d;
    filas.push({
      estado: ESTADOS.find((e) => e.letra === letra).nombre,
      mes,
      sis2000: o,
      pg: d,
      diferencia: faltan,
      pct: o === 0 ? (d === 0 ? 0 : 100) : Math.round((Math.abs(faltan) / o) * 10000) / 100,
    });
  }
  return filas.sort((a, b) => a.estado.localeCompare(b.estado) || a.mes.localeCompare(b.mes));
}

async function main() {
  const args = parseArgs(process.argv);
  const origen = await sql.connect({
    server: process.env.SERVER_BD,
    database: process.env.RECONCILE_ORIGEN_DB || process.env.NAME_BD,
    user: process.env.USER_BD,
    password: process.env.PASSWORD_BD,
    options: { encrypt: false, trustServerCertificate: true },
    requestTimeout: 300000,
  });
  const pg = new Pool({
    host: process.env.REPORTES_PG_HOST,
    port: Number(process.env.REPORTES_PG_PORT || 5432),
    user: process.env.REPORTES_PG_USER,
    password: process.env.REPORTES_PG_PASSWORD,
    database: process.env.REPORTES_PG_DATABASE || 'reportes',
  });
  await pg.query('SET default_transaction_read_only = on');

  try {
    const [o, d] = await Promise.all([
      contarOrigen(origen, args.desde, args.hasta),
      contarDestino(pg, args.desde, args.hasta),
    ]);
    const filas = conciliar(o, d);
    const fuera = filas.filter((f) => f.pct > args.umbral && f.diferencia !== 0);
    const totalO = filas.reduce((s, f) => s + f.sis2000, 0);
    const totalD = filas.reduce((s, f) => s + f.pg, 0);

    if (args.json) {
      console.log(JSON.stringify({ args, totalO, totalD, fuera, filas }, null, 2));
    } else {
      console.table(filas);
      console.log(
        `Total Sis2000=${totalO} PG=${totalD} diferencia=${totalO - totalD} ` +
          `(${totalO ? ((Math.abs(totalO - totalD) / totalO) * 100).toFixed(2) : 0} %)`,
      );
      console.log(
        fuera.length
          ? `ALERTA: ${fuera.length} combinaciones estado/mes superan ${args.umbral} %`
          : `OK: todas las combinaciones dentro de ${args.umbral} %`,
      );
    }
    process.exitCode = fuera.length ? 2 : 0;
  } finally {
    await origen.close();
    await pg.end();
  }
}

main().catch((err) => {
  console.error(`Error de conciliación: ${err.message}`);
  process.exit(1);
});
