/**
 * «Control documental diario» en versión corta (pedido de La Mundial, 9-nov-2026): solo quién no
 * cargó el expediente en cifras. Completados, incompletos y cuántos son de canales y de
 * productores (los gestores cuentan en canales). El detalle va en el Excel adjunto, nunca en el
 * cuerpo: aquí no hay nombres, documentos, listados ni enlaces. Nunca dice «vendedor».
 *
 * HTML de correo: tablas, máx. 640 px, estilos en línea.
 */
import { escapeHtml, type BuiltEmail } from './lamundial-branded.template';

export type ReporteSimpleParams = {
  subject: string;
  /** DD/MM/AAAA. */
  fecha: string;
  /** «DD/MM/AAAA HH:MM» (hora de Caracas). */
  corte: string;
  completados: number;
  incompletos: number;
  canales: { completos: number; incompletos: number };
  productores: { completos: number; incompletos: number };
  /** Pólizas sin datos de quién las emitió (solo se muestra si es mayor que 0). */
  sinDatos: number;
  /** false: el correo salió sin el Excel (no se menciona). */
  adjunto: boolean;
  /** Filas que no cupieron en el Excel por tamaño. */
  omitidas: { incompletos: number; completados: number };
};

const LOGO_URL =
  'https://lamundialdeseguros.com/wp-content/uploads/2023/02/Logotipo-La-Mundial-01.jpg';
const BRAND_BLUE = '#0f3462';
const BRAND_RED = '#c8102e';
const GREEN = '#047857';
const MUTED = '#6b7280';
const TEXT = '#1f2937';
const LINE = '#e5e7eb';
const SOFT = '#f8fafc';
const FONT = 'Arial,Helvetica,sans-serif';

export const LINEA_EXCEL =
  'En el Excel adjunto está el detalle de las pólizas incompletas (quién no ha cargado sus documentos) y de las completadas.';

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

function num(n: number): string {
  return n.toLocaleString('es-VE');
}

export function normalizarReporteSimple(raw: unknown): ReporteSimpleParams {
  const r = obj(raw);
  const fechaRaw = corto(r.fecha, 10);
  const fecha = /^\d{2}\/\d{2}\/\d{4}$/.test(fechaRaw) ? fechaRaw : '';
  const areas = corto(r.areas, 60).replace(/[^\p{L}\s]/gu, '').trim() || 'Canales';
  const subject =
    corto(r.subject, 200) ||
    `Marketplace | ${areas} | Control documental diario${fecha ? ` – ${fecha}` : ''}`;
  const canales = obj(r.canales);
  const productores = obj(r.productores);
  const omitidas = obj(r.omitidas);
  return {
    subject,
    fecha,
    corte: /^[\d/: ]{0,20}$/.test(corto(r.corte, 20)) ? corto(r.corte, 20) : '',
    completados: entero(r.completados),
    incompletos: entero(r.incompletos),
    canales: { completos: entero(canales.completos), incompletos: entero(canales.incompletos) },
    productores: {
      completos: entero(productores.completos),
      incompletos: entero(productores.incompletos),
    },
    sinDatos: entero(r.sinDatos),
    adjunto: !(r.adjunto === false || r.adjunto === 'false'),
    omitidas: {
      incompletos: entero(omitidas.incompletos),
      completados: entero(omitidas.completados),
    },
  };
}

function plural(n: number, uno: string, varios: string): string {
  return `${num(n)} ${n === 1 ? uno : varios}`;
}

function lineaOmitidas(p: ReporteSimpleParams): string {
  const partes = [
    p.omitidas.incompletos
      ? plural(p.omitidas.incompletos, 'póliza incompleta (la más antigua)', 'pólizas incompletas (las más antiguas)')
      : '',
    p.omitidas.completados
      ? plural(p.omitidas.completados, 'póliza completada', 'pólizas completadas')
      : '',
  ].filter(Boolean);
  return partes.length ? `Por tamaño, el Excel no incluye ${partes.join(' ni ')}.` : '';
}

function porArea(c: { completos: number; incompletos: number }): string {
  return `${plural(c.completos, 'completo', 'completos')} / ${plural(c.incompletos, 'incompleto', 'incompletos')}`;
}

export function buildExpedienteReporteSimpleEmail(p: ReporteSimpleParams): BuiltEmail {
  const titulo = `Control documental diario${p.fecha ? ` – ${p.fecha}` : ''}`;
  const corte = p.corte ? `Corte: ${p.corte} (hora de Caracas)` : '';
  const cero = p.incompletos === 0;
  const sinDatos = p.sinDatos
    ? `Sin datos de canal o productor: ${num(p.sinDatos)}`
    : '';
  const excel = p.adjunto ? LINEA_EXCEL : '';
  const omitidas = p.adjunto ? lineaOmitidas(p) : '';
  const pie = 'Mensaje automático de control documental del Marketplace. No responda a este correo.';
  const preheader = cero
    ? `0 incompletos · ${plural(p.completados, 'completado', 'completados')}`
    : `${plural(p.incompletos, 'incompleto', 'incompletos')} · ${plural(p.completados, 'completado', 'completados')}`;

  const text = [
    titulo,
    corte,
    [
      `Completados: ${num(p.completados)}`,
      `Incompletos: ${num(p.incompletos)}`,
      `De canales: ${porArea(p.canales)}`,
      `De productores: ${porArea(p.productores)}`,
      sinDatos,
    ]
      .filter(Boolean)
      .join('\n'),
    excel,
    omitidas,
    pie,
  ]
    .filter(Boolean)
    .join('\n\n');

  const cifra = (label: string, valor: number, color: string) =>
    `<td width="50%" align="center" valign="top" bgcolor="${SOFT}" style="padding:14px 6px;background:${SOFT};border:1px solid ${LINE};border-radius:6px;">
                    <div style="font-family:${FONT};font-size:28px;line-height:32px;font-weight:700;color:${color};">${escapeHtml(num(valor))}</div>
                    <div style="font-family:${FONT};font-size:13px;line-height:17px;color:${MUTED};">${escapeHtml(label)}</div>
                  </td>`;
  const fila = (label: string, valor: string) =>
    `<tr>
                  <td style="padding:9px 0;border-top:1px solid ${LINE};font-family:${FONT};font-size:14px;line-height:20px;color:${TEXT};">${escapeHtml(label)}</td>
                  <td align="right" style="padding:9px 0;border-top:1px solid ${LINE};font-family:${FONT};font-size:14px;line-height:20px;color:${TEXT};font-weight:700;">${escapeHtml(valor)}</td>
                </tr>`;
  const parrafo = (t: string, size = 14, color = TEXT) =>
    t
      ? `<p style="margin:16px 0 0;font-family:${FONT};font-size:${size}px;line-height:${size + 6}px;color:${color};">${escapeHtml(t)}</p>`
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
    @media only screen and (max-width: 520px) {
      .px { padding-left: 16px !important; padding-right: 16px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f3f4f6;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f3f4f6" style="background:#f3f4f6;">
    <tr>
      <td align="center" style="padding:20px 8px;">
        <!--[if mso]><table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;">
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
              <h1 style="margin:0 0 6px;font-family:${FONT};font-size:20px;line-height:26px;font-weight:700;color:${BRAND_BLUE};">${escapeHtml(titulo)}</h1>
              ${corte ? `<p style="margin:0 0 16px;font-family:${FONT};font-size:13px;line-height:19px;color:${MUTED};">${escapeHtml(corte)}</p>` : ''}
              <table role="presentation" width="100%" cellspacing="4" cellpadding="0" border="0" style="border-collapse:separate;">
                <tr>
                  ${cifra('Completados', p.completados, GREEN)}
                  ${cifra('Incompletos', p.incompletos, cero ? GREEN : BRAND_RED)}
                </tr>
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:12px 0 0;border-bottom:1px solid ${LINE};">
                ${fila('De canales', porArea(p.canales))}
                ${fila('De productores', porArea(p.productores))}
              </table>
              ${parrafo(sinDatos, 12, MUTED)}
              ${parrafo(excel)}
              ${parrafo(omitidas, 12, MUTED)}
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
