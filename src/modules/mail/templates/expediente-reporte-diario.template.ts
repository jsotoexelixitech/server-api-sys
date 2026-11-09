/**
 * Reporte nocturno del monitor de expedientes (Nexus) para La Mundial: «Control documental
 * diario». Cifras de la emisión del día, documentos pendientes, listado de pólizas incompletas
 * de hoy, cartera acumulada, pendientes históricos, conciliación con Nexus, entregabilidad y
 * errores técnicos. Si no hay incompletas, bloque destacado «0 pendientes de la emisión del día».
 *
 * El asegurado llega protegido desde Nexus (iniciales y documento parcial). Aquí todo se valida,
 * se recorta y se escapa; además se enmascaran cifras largas y correos que llegaran por error.
 * Nunca dice «vendedor» (se usa «Emitida por»).
 *
 * HTML de correo: tablas, máx. 640 px, estilos en línea; la tabla de pólizas usa clases cortas
 * (para no pasar el límite de recorte de Gmail con 200 filas) y se apila en pantallas angostas.
 */
import { escapeHtml, type BuiltEmail } from './lamundial-branded.template';
import { enlaceSeguro } from './expediente-documentos.template';

export const REPORTE_MAX_FILAS = 200;

export type ReporteFila = {
  poliza: string;
  /** Protegido: iniciales y documento parcial («M. P. · V-12•••678»). */
  asegurado: string;
  producto: string;
  emitidaPor: string;
  observacion: string;
  dias: number;
  intentos: number;
  ultimoResultado: string;
  noEnviar: boolean;
  siguienteAccion: string;
};

export type ReporteDiarioParams = {
  subject: string;
  areas: string;
  fecha: string;
  corte: string;
  dia: { emitidas: number; completas: number; incompletas: number; sinDatos: number };
  distribucion: { faltantes: number; ilegibles: number; inconsistentes: number; porValidar: number };
  polizas: ReporteFila[];
  /** Pólizas incompletas de hoy que no caben en el correo (están en el monitor). */
  polizasRestantes: number;
  cartera: {
    total: number;
    completos: number;
    incompletos: number;
    sinDatos: number;
    desglose: { label: string; valor: number }[];
  };
  historicos: { anteriores: number; sinRespuesta: number; sinCorreoValido: number; noEnviar: number };
  conciliacion: { emisionesNexus: number; enMonitor: number; noPasaronOcr: number; sinVinculo: number };
  entregabilidad: {
    intentos: number;
    entregados: number;
    conError: number;
    sinCorreo: number;
    bloqueados: number;
    excluidos: number;
  };
  tecnicos: { documentosNoLeidos: number; fallasTecnicas: number };
  enlace: string;
};

const LOGO_URL =
  'https://lamundialdeseguros.com/wp-content/uploads/2023/02/Logotipo-La-Mundial-01.jpg';
const BRAND_BLUE = '#0f3462';
const BRAND_RED = '#c8102e';
const MUTED = '#6b7280';
const TEXT = '#1f2937';
const LINE = '#e5e7eb';
const SOFT = '#f8fafc';
const FONT = 'Arial,Helvetica,sans-serif';

// ─── Validación ───────────────────────────────────────────────────────────

function corto(v: unknown, max: number): string {
  const s = String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function entero(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 10_000_000) : 0;
}

function siNo(v: unknown): boolean {
  return v === true || /^(true|s[ií]|1)$/i.test(String(v ?? '').trim());
}

/** Correos que llegaran por error en texto libre: nunca salen en el reporte. */
function sinCorreos(s: string): string {
  return s.replace(/[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/gi, '•••');
}

/** Cifras de 6 o más dígitos (cédulas, RIF, teléfonos): solo inicio y final. */
export function protegerAsegurado(v: unknown): string {
  return sinCorreos(corto(v, 40)).replace(/\d{6,}/g, (d) => `${d.slice(0, 2)}•••${d.slice(-3)}`);
}

function texto(v: unknown, max: number): string {
  return sinCorreos(corto(v, max));
}

export function normalizarReporteDiario(raw: unknown): ReporteDiarioParams {
  const r = obj(raw);
  const areas = texto(r.areas, 60) || 'Canales';
  const fechaRaw = corto(r.fecha, 10);
  const fecha = /^\d{2}\/\d{2}\/\d{4}$/.test(fechaRaw) ? fechaRaw : '';
  const subject =
    corto(r.subject, 200) ||
    `Marketplace | ${areas} | Control documental diario${fecha ? ` – ${fecha}` : ''}`;

  const filasRaw = Array.isArray(r.polizas) ? r.polizas : [];
  const polizas: ReporteFila[] = [];
  for (const item of filasRaw.slice(0, REPORTE_MAX_FILAS)) {
    const f = obj(item);
    const poliza = texto(f.poliza, 40);
    if (!poliza) continue;
    polizas.push({
      poliza,
      asegurado: protegerAsegurado(f.asegurado),
      producto: texto(f.producto, 40),
      emitidaPor: texto(f.emitidaPor, 80),
      observacion: texto(f.observacion, 160),
      dias: entero(f.dias),
      intentos: entero(f.intentos),
      ultimoResultado: texto(f.ultimoResultado, 40),
      noEnviar: siNo(f.noEnviar),
      siguienteAccion: texto(f.siguienteAccion, 80),
    });
  }

  const dia = obj(r.dia);
  const dist = obj(r.distribucion);
  const cartera = obj(r.cartera);
  const hist = obj(r.historicos);
  const conc = obj(r.conciliacion);
  const ent = obj(r.entregabilidad);
  const tec = obj(r.tecnicos);
  const desglose = (Array.isArray(cartera.desglose) ? cartera.desglose : [])
    .slice(0, 10)
    .map((d) => ({ label: texto(obj(d).label, 60), valor: entero(obj(d).valor) }))
    .filter((d) => d.label);

  return {
    subject,
    areas,
    fecha,
    corte: texto(r.corte, 40),
    dia: {
      emitidas: entero(dia.emitidas),
      completas: entero(dia.completas),
      incompletas: entero(dia.incompletas),
      sinDatos: entero(dia.sinDatos),
    },
    distribucion: {
      faltantes: entero(dist.faltantes),
      ilegibles: entero(dist.ilegibles),
      inconsistentes: entero(dist.inconsistentes),
      porValidar: entero(dist.porValidar),
    },
    polizas,
    polizasRestantes:
      entero(r.polizasRestantes) + Math.max(0, filasRaw.length - REPORTE_MAX_FILAS),
    cartera: {
      total: entero(cartera.total),
      completos: entero(cartera.completos),
      incompletos: entero(cartera.incompletos),
      sinDatos: entero(cartera.sinDatos),
      desglose,
    },
    historicos: {
      anteriores: entero(hist.anteriores),
      sinRespuesta: entero(hist.sinRespuesta),
      sinCorreoValido: entero(hist.sinCorreoValido),
      noEnviar: entero(hist.noEnviar),
    },
    conciliacion: {
      emisionesNexus: entero(conc.emisionesNexus),
      enMonitor: entero(conc.enMonitor),
      noPasaronOcr: entero(conc.noPasaronOcr),
      sinVinculo: entero(conc.sinVinculo),
    },
    entregabilidad: {
      intentos: entero(ent.intentos),
      entregados: entero(ent.entregados),
      conError: entero(ent.conError),
      sinCorreo: entero(ent.sinCorreo),
      bloqueados: entero(ent.bloqueados),
      excluidos: entero(ent.excluidos),
    },
    tecnicos: {
      documentosNoLeidos: entero(tec.documentosNoLeidos),
      fallasTecnicas: entero(tec.fallasTecnicas),
    },
    enlace: enlaceSeguro(String(r.enlace ?? '')),
  };
}

// ─── Formato ──────────────────────────────────────────────────────────────

/** 1234567 → «1.234.567». */
function num(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function pct(parte: number, total: number): string {
  if (!total) return '—';
  const v = Math.round((parte / total) * 1000) / 10;
  return `${String(v).replace('.', ',')} %`;
}

function dias(n: number): string {
  if (n === 0) return 'Hoy';
  return n === 1 ? '1 día' : `${num(n)} días`;
}

function plural(n: number, uno: string, varios: string): string {
  return `${num(n)} ${n === 1 ? uno : varios}`;
}

export function estadoConciliacion(sinVinculo: number): string {
  return sinVinculo === 0
    ? 'Cuadrada'
    : `Con diferencias: ${plural(sinVinculo, 'póliza', 'pólizas')} sin vínculo`;
}

type Fila = [label: string, valor: string, destacado?: boolean];

function filasCartera(p: ReporteDiarioParams): Fila[] {
  return [
    ...p.cartera.desglose.map((d): Fila => [`Incompletas: ${d.label.toLowerCase()}`, num(d.valor)]),
    ...(p.cartera.sinDatos
      ? ([['Sin datos de documentos (no se controlan)', num(p.cartera.sinDatos)]] as Fila[])
      : []),
  ];
}

function filasHistoricos(p: ReporteDiarioParams): Fila[] {
  const h = p.historicos;
  return [
    ['Incompletas de días anteriores', num(h.anteriores)],
    ['Sin respuesta tras todos los recordatorios', num(h.sinRespuesta), h.sinRespuesta > 0],
    ['Sin correo válido del asegurado', num(h.sinCorreoValido), h.sinCorreoValido > 0],
    ['Con «No enviar correos»', num(h.noEnviar)],
  ];
}

function filasConciliacion(p: ReporteDiarioParams): Fila[] {
  const c = p.conciliacion;
  return [
    ['Pólizas emitidas en Nexus', num(c.emisionesNexus)],
    ['Registradas en el monitor', num(c.enMonitor)],
    ['No pasaron por el OCR (fuera del control)', num(c.noPasaronOcr)],
    ['Sin vínculo con el monitor', num(c.sinVinculo), c.sinVinculo > 0],
    ['Estado', estadoConciliacion(c.sinVinculo), c.sinVinculo > 0],
  ];
}

function filasEntregabilidad(p: ReporteDiarioParams): Fila[] {
  const e = p.entregabilidad;
  return [
    ['Correos intentados al asegurado', num(e.intentos)],
    ['Entregados (aceptados por el servidor)', num(e.entregados)],
    ['Con error o rebotados', num(e.conError), e.conError > 0],
    ['Sin correo válido', num(e.sinCorreo)],
    ...(e.bloqueados ? ([['Bloqueados (lista de pruebas)', num(e.bloqueados)]] as Fila[]) : []),
    ['Excluidos («No enviar correos»)', num(e.excluidos)],
    [
      'Documentos que no se pudieron leer',
      num(p.tecnicos.documentosNoLeidos),
      p.tecnicos.documentosNoLeidos > 0,
    ],
    ['Fallas técnicas registradas', num(p.tecnicos.fallasTecnicas), p.tecnicos.fallasTecnicas > 0],
  ];
}

function lineaFila(f: ReporteFila): string[] {
  return [
    `N.º ${f.poliza} · ${f.producto || 'Producto'} · ${dias(f.dias)}`,
    `   Asegurado: ${f.asegurado || '—'} · Emitida por: ${f.emitidaPor || '—'}`,
    `   Observación: ${f.observacion || '—'}`,
    `   Intentos: ${num(f.intentos)} · Último resultado: ${f.ultimoResultado || '—'} · No enviar correos: ${
      f.noEnviar ? 'Sí' : 'No'
    }`,
    `   Siguiente acción: ${f.siguienteAccion || '—'}`,
  ];
}

// ─── HTML ─────────────────────────────────────────────────────────────────

function titulo(t: string): string {
  return `<p style="margin:24px 0 10px;font-family:${FONT};font-size:13px;line-height:18px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND_BLUE};">${escapeHtml(t)}</p>`;
}

/** Cifras grandes en recuadros (3 o 4 por fila; caben a 360 px). */
function cifras(items: [string, string, string?][]): string {
  const ancho = `${Math.floor(100 / items.length)}%`;
  const celdas = items
    .map(
      ([label, valor, color]) => `<td width="${ancho}" align="center" valign="top" bgcolor="${SOFT}" style="padding:12px 4px;background:${SOFT};border:1px solid ${LINE};border-radius:6px;">
                    <div style="font-family:${FONT};font-size:22px;line-height:26px;font-weight:700;color:${color ?? BRAND_BLUE};">${escapeHtml(valor)}</div>
                    <div style="font-family:${FONT};font-size:11px;line-height:15px;color:${MUTED};word-break:break-word;">${escapeHtml(label)}</div>
                  </td>`,
    )
    .join('\n                  ');
  return `<table role="presentation" width="100%" cellspacing="4" cellpadding="0" border="0" style="border-collapse:separate;">
                <tr>
                  ${celdas}
                </tr>
              </table>`;
}

/** Etiqueta a la izquierda y cifra a la derecha: legible en cualquier ancho. */
function tablaValores(filas: Fila[]): string {
  const tr = filas
    .map(
      ([label, valor, destacado]) => `<tr>
                  <td style="padding:7px 0;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:14px;line-height:20px;color:${TEXT};">${escapeHtml(label)}</td>
                  <td align="right" style="padding:7px 0 7px 12px;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:14px;line-height:20px;font-weight:700;color:${destacado ? BRAND_RED : BRAND_BLUE};">${escapeHtml(valor)}</td>
                </tr>`,
    )
    .join('\n                ');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                ${tr}
              </table>`;
}

/**
 * Marcado mínimo por fila (estilos en <style>, <small> y <b> sin clase, una clase de 1 letra
 * para apilar en móvil): sin <style> se sigue leyendo gracias a cellpadding y bgcolor.
 */
function filaPolizaHtml(f: ReporteFila, i: number): string {
  const e = escapeHtml;
  const seguimiento =
    `<small>Intentos: ${num(f.intentos)} · ${e(f.ultimoResultado || '—')}<br>` +
    `No enviar correos: ${f.noEnviar ? 'Sí' : 'No'}</small><br>${e(f.siguienteAccion || '—')}`;
  return (
    `<tr${i % 2 ? ` bgcolor="${SOFT}"` : ''}>` +
    `<td class="a"><b>N.º ${e(f.poliza)}</b><br><small>${e(f.producto || 'Producto')} · ${dias(f.dias)}</small></td>` +
    `<td>${e(f.asegurado || '—')}<br><small>Emitida por: ${e(f.emitidaPor || '—')}</small></td>` +
    `<td>${e(f.observacion || '—')}</td>` +
    `<td class="z">${seguimiento}</td></tr>`
  );
}

/**
 * Gmail recorta el HTML por encima de ~102 KB y el resto del correo ocupa unos 25 KB. Las
 * filas se agregan hasta este presupuesto (unas 180 a 200 filas normales); las que no caben se
 * suman a las que están en el monitor.
 */
export const PRESUPUESTO_FILAS_HTML = 72_000;

function recortarListado(p: ReporteDiarioParams): ReporteDiarioParams {
  let bytes = 0;
  let caben = 0;
  for (const [i, f] of p.polizas.entries()) {
    bytes += Buffer.byteLength(filaPolizaHtml(f, i), 'utf8');
    if (bytes > PRESUPUESTO_FILAS_HTML) break;
    caben++;
  }
  if (caben === p.polizas.length) return p;
  return {
    ...p,
    polizas: p.polizas.slice(0, caben),
    polizasRestantes: p.polizasRestantes + (p.polizas.length - caben),
  };
}

function tablaPolizas(p: ReporteDiarioParams): string {
  const th = (t: string, w: string) =>
    `<td class="hd" width="${w}" bgcolor="#eef2f7" style="font-size:11px;line-height:15px;font-weight:700;text-transform:uppercase;color:${MUTED};">${t}</td>`;
  const restantes = p.polizasRestantes
    ? `<p style="margin:10px 0 0;font-family:${FONT};font-size:13px;line-height:19px;color:${BRAND_RED};">Se muestran ${num(
        p.polizas.length,
      )} pólizas; ${plural(p.polizasRestantes, 'póliza más está', 'pólizas más están')} en el detalle del monitor.</p>`
    : '';
  return `<table class="lst" role="presentation" width="100%" cellspacing="0" cellpadding="8" border="0" style="border-collapse:collapse;font-family:${FONT};font-size:13px;line-height:18px;color:${TEXT};">
                <tr class="hd">${th('Póliza', '28%')}${th('Asegurado y emisión', '27%')}${th('Observación', '22%')}${th('Seguimiento', '23%')}</tr>
${p.polizas.map(filaPolizaHtml).join('\n')}
              </table>
              <p style="margin:8px 0 0;font-family:${FONT};font-size:11px;line-height:16px;color:${MUTED};">Asegurado protegido: iniciales y documento parcial. Los datos completos están en el monitor.</p>
              ${restantes}`;
}

export function buildExpedienteReporteDiarioEmail(params: ReporteDiarioParams): BuiltEmail {
  const p = recortarListado(params);
  const d = p.dia;
  const cero = d.incompletas === 0;
  const estadoConc = estadoConciliacion(p.conciliacion.sinVinculo);
  const corte = p.corte ? `Corte: ${p.corte} (hora de Caracas)` : '';
  const pie =
    'Mensaje automático del monitor de expedientes del Marketplace. No responda a este correo.';
  const preheader = cero
    ? `0 pendientes de la emisión del día · ${plural(d.emitidas, 'póliza emitida', 'pólizas emitidas')}`
    : `${plural(d.incompletas, 'póliza incompleta', 'pólizas incompletas')} de ${num(d.emitidas)} emitidas hoy`;

  // ─── Texto plano ──────────────────────────────────────────────────────
  const kv = (filas: Fila[]) => filas.map(([l, v]) => `- ${l}: ${v}`).join('\n');
  const text = [
    p.subject,
    corte,
    cero
      ? `0 pendientes de la emisión del día. Total emitido: ${num(d.emitidas)}. Conciliación: ${estadoConc}.`
      : '',
    [
      'EMISIÓN DEL DÍA',
      `- Emitidas hoy: ${num(d.emitidas)}`,
      `- Completas: ${num(d.completas)}`,
      `- Incompletas: ${num(d.incompletas)}`,
      d.sinDatos ? `- Sin datos de documentos: ${num(d.sinDatos)}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    cero
      ? ''
      : [
          'DOCUMENTOS PENDIENTES DE LAS PÓLIZAS INCOMPLETAS DE HOY',
          `- Faltantes: ${num(p.distribucion.faltantes)}`,
          `- Ilegibles: ${num(p.distribucion.ilegibles)}`,
          `- Inconsistentes: ${num(p.distribucion.inconsistentes)}`,
          `- Por validar: ${num(p.distribucion.porValidar)}`,
        ].join('\n'),
    p.polizas.length
      ? [
          `PÓLIZAS INCOMPLETAS DE HOY (${num(p.polizas.length + p.polizasRestantes)})`,
          ...p.polizas.flatMap((f, i) => {
            const [primera, ...resto] = lineaFila(f);
            return [`${i + 1}. ${primera}`, ...resto];
          }),
          'Asegurado protegido: iniciales y documento parcial. Los datos completos están en el monitor.',
          p.polizasRestantes
            ? `${plural(p.polizasRestantes, 'póliza más está', 'pólizas más están')} en el detalle del monitor.`
            : '',
        ]
          .filter(Boolean)
          .join('\n')
      : '',
    [
      `TODA LA CARTERA · ${p.areas.toUpperCase()}`,
      `- Total: ${num(p.cartera.total)}`,
      `- Completas: ${num(p.cartera.completos)} (${pct(p.cartera.completos, p.cartera.total)})`,
      `- Incompletas: ${num(p.cartera.incompletos)}`,
      kv(filasCartera(p)),
    ]
      .filter(Boolean)
      .join('\n'),
    ['PENDIENTES HISTÓRICOS', kv(filasHistoricos(p))].join('\n'),
    ['CONCILIACIÓN DEL DÍA (TODAS LAS ÁREAS)', kv(filasConciliacion(p))].join('\n'),
    ['ENTREGABILIDAD Y ERRORES TÉCNICOS (HOY)', kv(filasEntregabilidad(p))].join('\n'),
    p.enlace ? `Ver detalle en el monitor (requiere iniciar sesión): ${p.enlace}` : '',
    pie,
  ]
    .filter(Boolean)
    .join('\n\n');

  // ─── HTML ─────────────────────────────────────────────────────────────
  const bloqueCero = cero
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:18px 0 0;">
                <tr>
                  <td bgcolor="#ecfdf5" style="padding:16px 18px;background:#ecfdf5;border:1px solid #10b981;border-radius:8px;">
                    <p style="margin:0 0 4px;font-family:${FONT};font-size:18px;line-height:24px;font-weight:700;color:#065f46;">0 pendientes de la emisión del día</p>
                    <p style="margin:0;font-family:${FONT};font-size:14px;line-height:20px;color:#065f46;">Total emitido: <strong>${num(
                      d.emitidas,
                    )}</strong> · Conciliación: <strong>${escapeHtml(estadoConc)}</strong></p>
                  </td>
                </tr>
              </table>`
    : '';

  const emision = `${titulo('Emisión del día')}
              ${cifras([
                ['Emitidas hoy', num(d.emitidas)],
                ['Completas', num(d.completas), '#047857'],
                ['Incompletas', num(d.incompletas), d.incompletas ? BRAND_RED : BRAND_BLUE],
              ])}${
                d.sinDatos
                  ? `
              <p style="margin:6px 0 0;font-family:${FONT};font-size:12px;line-height:17px;color:${MUTED};">${escapeHtml(
                plural(d.sinDatos, 'póliza sin datos de documentos', 'pólizas sin datos de documentos'),
              )} (no se controlan).</p>`
                  : ''
              }`;

  const distribucion = cero
    ? ''
    : `${titulo('Documentos pendientes de las pólizas incompletas de hoy')}
              ${cifras([
                ['Faltantes', num(p.distribucion.faltantes)],
                ['Ilegibles', num(p.distribucion.ilegibles)],
                ['Inconsistentes', num(p.distribucion.inconsistentes)],
                ['Por validar', num(p.distribucion.porValidar)],
              ])}`;

  const listado = p.polizas.length
    ? `${titulo(`Pólizas incompletas de hoy (${num(p.polizas.length + p.polizasRestantes)})`)}
              ${tablaPolizas(p)}`
    : '';

  const cartera = `${titulo(`Toda la cartera · ${p.areas}`)}
              ${cifras([
                ['Total', num(p.cartera.total)],
                ['Completas', num(p.cartera.completos), '#047857'],
                ['Incompletas', num(p.cartera.incompletos), p.cartera.incompletos ? BRAND_RED : BRAND_BLUE],
                ['% completas', pct(p.cartera.completos, p.cartera.total)],
              ])}${
                filasCartera(p).length
                  ? `
              ${tablaValores(filasCartera(p))}`
                  : ''
              }`;

  const boton = p.enlace
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:26px 0 6px;">
                <tr>
                  <td align="center" bgcolor="${BRAND_BLUE}" style="background:${BRAND_BLUE};border-radius:8px;">
                    <a href="${escapeHtml(p.enlace)}" target="_blank" rel="noopener noreferrer"
                      style="display:block;padding:14px 20px;font-family:${FONT};font-size:16px;line-height:22px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">Ver detalle en el monitor</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};">Requiere iniciar sesión. Si el botón no funciona, copie este enlace:<br>
                <a href="${escapeHtml(p.enlace)}" style="color:${BRAND_BLUE};word-break:break-all;">${escapeHtml(p.enlace)}</a></p>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(p.subject)}</title>
  <style>
    .lst td { border-top: 1px solid ${LINE}; vertical-align: top; }
    .lst small { color: ${MUTED}; font-size: 12px; }
    .lst b { color: ${BRAND_BLUE}; white-space: nowrap; }
    @media only screen and (max-width: 520px) {
      .px { padding-left: 16px !important; padding-right: 16px !important; }
      .lst .hd { display: none !important; }
      .lst td { display: block !important; width: auto !important; border-top: 0 !important; padding: 2px 10px !important; }
      .lst td.a { border-top: 1px solid ${LINE} !important; padding-top: 10px !important; }
      .lst td.z { padding-bottom: 10px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f3f4f6;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f3f4f6" style="background:#f3f4f6;">
    <tr>
      <td align="center" style="padding:20px 8px;">
        <!--[if mso]><table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:8px;">
          <tr>
            <td class="px" style="padding:22px 28px 12px;text-align:center;">
              <img src="${LOGO_URL}" alt="La Mundial de Seguros" width="170" style="width:170px;max-width:60%;height:auto;border:0;display:inline-block;">
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:0 28px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="height:3px;background:${BRAND_BLUE};font-size:0;line-height:0;">&nbsp;</td>
                  <td style="width:36px;height:3px;background:#cbd5e1;font-size:0;line-height:0;">&nbsp;</td>
                  <td style="width:36px;height:3px;background:${BRAND_RED};font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:20px 28px 0;">
              <p style="margin:0 0 6px;font-family:${FONT};font-size:11px;line-height:16px;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND_RED};">Control documental diario</p>
              <h1 style="margin:0 0 6px;font-family:${FONT};font-size:20px;line-height:26px;font-weight:700;color:${BRAND_BLUE};">Marketplace · ${escapeHtml(p.areas)}${
                p.fecha ? ` · ${escapeHtml(p.fecha)}` : ''
              }</h1>
              ${corte ? `<p style="margin:0;font-family:${FONT};font-size:13px;line-height:19px;color:${MUTED};">${escapeHtml(corte)}</p>` : ''}
              ${bloqueCero}
              ${emision}
              ${distribucion}
              ${listado}
              ${cartera}
              ${titulo('Pendientes históricos')}
              ${tablaValores(filasHistoricos(p))}
              ${titulo('Conciliación del día (todas las áreas)')}
              ${tablaValores(filasConciliacion(p))}
              ${titulo('Entregabilidad y errores técnicos (hoy)')}
              ${tablaValores(filasEntregabilidad(p))}
              ${boton}
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:22px 28px 24px;text-align:center;">
              <p style="margin:0;font-family:${FONT};font-size:11px;line-height:16px;color:${MUTED};">${escapeHtml(pie)}</p>
            </td>
          </tr>
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject: p.subject, html, text };
}
