/**
 * Correo al asegurado del monitor de expedientes (Nexus): lista de documentos con su estado,
 * botón para subirlos y vencimiento del enlace. Marca igual que `branded` (logo, colores, pie).
 * HTML de correo: tablas y estilos en línea, máx. 600 px, legible a 360 px (Gmail y Outlook).
 */
import { escapeHtml, type BuiltEmail } from './lamundial-branded.template';

export const EXPEDIENTE_TIPOS = [
  'solicitud',
  'recordatorio',
  'observado',
  'recibido',
  'completo',
] as const;
export type ExpedienteTipoCorreo = (typeof EXPEDIENTE_TIPOS)[number];

export const EXPEDIENTE_ESTADOS_DOC = [
  'pendiente',
  'corregir',
  'en_revision',
  'recibido',
  'aprobado',
] as const;
export type ExpedienteEstadoDoc = (typeof EXPEDIENTE_ESTADOS_DOC)[number];

export type ExpedienteDocumento = {
  nombre: string;
  estado: ExpedienteEstadoDoc;
  /** Solo en `corregir`: motivo ya redactado para el asegurado. */
  motivo?: string;
  /** Cuando el correo cubre varias pólizas. */
  poliza?: string;
};

export type ExpedienteDocumentosParams = {
  tipo: ExpedienteTipoCorreo;
  subject?: string;
  nombre?: string;
  poliza?: string;
  documentos?: ExpedienteDocumento[];
  enlace?: string;
  /** Fecha ISO de vencimiento del enlace. */
  venceEn?: string;
  /** Textos opcionales (si no vienen se usan los del tipo). */
  title?: string;
  intro?: string;
  notas?: string[];
  callCenterPhone?: string;
};

const LOGO_URL =
  'https://lamundialdeseguros.com/wp-content/uploads/2023/02/Logotipo-La-Mundial-01.jpg';
const BRAND_BLUE = '#0f3462';
const BRAND_RED = '#c8102e';
const MUTED = '#6b7280';
const TEXT = '#1f2937';
const FONT = 'Arial,Helvetica,sans-serif';

const MAX_DOCS = 30;

const ESTADO_UI: Record<
  ExpedienteEstadoDoc,
  { label: string; fg: string; bg: string; bar: string }
> = {
  pendiente: { label: 'Pendiente', fg: '#92400e', bg: '#fef3c7', bar: '#f59e0b' },
  corregir: { label: 'Envíalo de nuevo', fg: '#991b1b', bg: '#fee2e2', bar: BRAND_RED },
  en_revision: { label: 'En revisión', fg: '#1e40af', bg: '#dbeafe', bar: '#3b82f6' },
  recibido: { label: 'Recibido', fg: '#334155', bg: '#e2e8f0', bar: '#64748b' },
  aprobado: { label: 'Aprobado', fg: '#166534', bg: '#dcfce7', bar: '#16a34a' },
};

/** `{poliza}` se reemplaza por «tu póliza N° X» (o «tus pólizas …») con el número en negrita. */
const COPY: Record<ExpedienteTipoCorreo, { subject: string; title: string; intro: string }> = {
  solicitud: {
    subject: 'La Mundial | Completa la documentación de tu póliza',
    title: 'Completa la documentación de tu póliza',
    intro:
      'Ya emitimos {poliza}. Para completar tu expediente, envíanos los documentos de esta lista.',
  },
  recordatorio: {
    subject: 'La Mundial | Aún necesitamos un documento de tu expediente',
    title: 'Aún necesitamos documentos de tu expediente',
    intro: 'Todavía faltan documentos para completar el expediente de {poliza}.',
  },
  observado: {
    subject: 'La Mundial | Necesitamos corregir un documento',
    title: 'Necesitamos que envíes un documento de nuevo',
    intro:
      'Revisamos lo que enviaste para {poliza} y hay un documento que debes enviar otra vez. Tu póliza sigue emitida.',
  },
  recibido: {
    subject: 'La Mundial | Documento recibido',
    title: 'Recibimos tu documento',
    intro:
      'Recibimos tu documento de {poliza}. Lo estamos revisando y te avisaremos si hace falta corregir algo.',
  },
  completo: {
    subject: 'La Mundial | Tu expediente está completo',
    title: 'Tu expediente está completo',
    intro: 'Validamos toda la documentación de {poliza}. No necesitas hacer nada más.',
  },
};

/** Nota única por tipo (el aviso de correo automático va solo en el pie). */
function notaPorDefecto(tipo: ExpedienteTipoCorreo, conEnlace: boolean): string[] {
  if (tipo !== 'solicitud' && tipo !== 'recordatorio') return [];
  return [
    conEnlace
      ? 'Si ya los entregaste a tu asesor de seguros, no tienes que enviarlos de nuevo: los estamos validando.'
      : 'Puedes entregarlos a tu asesor de seguros. Si ya lo hiciste, no tienes que enviarlos de nuevo: los estamos validando.',
  ];
}

/** Texto con `{poliza}`: HTML escapado con el número en negrita, y versión plana. */
function conPoliza(
  plantilla: string,
  poliza: string,
  varias: boolean,
): { html: string; text: string } {
  const prefijo = varias ? 'tus pólizas' : 'tu póliza';
  const numero = poliza ? (varias ? poliza : `N° ${poliza}`) : '';
  const partes = plantilla.split('{poliza}');
  const refHtml = numero
    ? `${prefijo} <strong style="color:${BRAND_BLUE};white-space:nowrap;">${escapeHtml(numero)}</strong>`
    : prefijo;
  const refText = numero ? `${prefijo} ${numero}` : prefijo;
  return {
    html: partes.map((x) => escapeHtml(x)).join(refHtml),
    text: partes.join(refText),
  };
}

const PASOS = ['Abre el enlace', 'Toma una foto o elige el archivo', 'Listo, nosotros lo revisamos'];

function corto(v: unknown, max: number): string {
  const s = String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function callCenter(raw?: string): string {
  return String(raw || process.env.CALL_CENTER_PHONE || '0800LaMundial').trim() || '0800LaMundial';
}

/** Solo http(s): nunca `javascript:` ni otros esquemas en el botón. */
export function enlaceSeguro(raw?: string): string {
  const s = String(raw ?? '').trim();
  return /^https?:\/\/[^\s"'<>]+$/i.test(s) ? s : '';
}

/** "lunes, 14 de noviembre de 2026" en hora de Caracas; '' si la fecha no es válida. */
export function formatoVence(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString('es-VE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Caracas',
    });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function normalizarDocumentos(raw: unknown): ExpedienteDocumento[] {
  if (!Array.isArray(raw)) return [];
  const out: ExpedienteDocumento[] = [];
  for (const item of raw.slice(0, MAX_DOCS)) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const nombre = corto(r.nombre, 120);
    if (!nombre) continue;
    const estado = (EXPEDIENTE_ESTADOS_DOC as readonly string[]).includes(String(r.estado))
      ? (String(r.estado) as ExpedienteEstadoDoc)
      : 'pendiente';
    const motivo = estado === 'corregir' ? corto(r.motivo, 300) : '';
    const poliza = corto(r.poliza, 60);
    out.push({ nombre, estado, ...(motivo ? { motivo } : {}), ...(poliza ? { poliza } : {}) });
  }
  return out;
}

function pill(estado: ExpedienteEstadoDoc): string {
  const ui = ESTADO_UI[estado];
  return `<span style="display:inline-block;background:${ui.bg};color:${ui.fg};font-family:${FONT};font-size:12px;font-weight:700;line-height:16px;padding:4px 10px;border-radius:12px;white-space:nowrap;">&#9679;&nbsp;${escapeHtml(ui.label)}</span>`;
}

function documentoHtml(d: ExpedienteDocumento): string {
  const ui = ESTADO_UI[d.estado];
  const polizaHtml = d.poliza
    ? `<div style="font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};">Póliza ${escapeHtml(d.poliza)}</div>`
    : '';
  const motivoHtml = d.motivo
    ? `<div style="margin-top:8px;font-family:${FONT};font-size:13px;line-height:19px;color:${ui.fg};"><strong>Qué corregir:</strong> ${escapeHtml(d.motivo)}</div>`
    : '';
  return `<tr>
                  <td style="padding:0 0 10px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate;">
                      <tr>
                        <td width="4" style="width:4px;background:${ui.bar};font-size:0;line-height:0;">&nbsp;</td>
                        <td style="padding:12px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-left:0;">
                          <div style="font-family:${FONT};font-size:15px;line-height:21px;font-weight:700;color:${TEXT};">${escapeHtml(d.nombre)}</div>
                          ${polizaHtml}
                          <div style="margin-top:6px;">${pill(d.estado)}</div>
                          ${motivoHtml}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`;
}

export function buildExpedienteDocumentosEmail(params: ExpedienteDocumentosParams): BuiltEmail {
  const tipo: ExpedienteTipoCorreo = (EXPEDIENTE_TIPOS as readonly string[]).includes(params.tipo)
    ? params.tipo
    : 'solicitud';
  const copy = COPY[tipo];
  const phone = callCenter(params.callCenterPhone);
  const subject = corto(params.subject, 200) || copy.subject;
  const nombre = corto(params.nombre, 80) || 'cliente';
  const poliza = corto(params.poliza, 200);
  const title = corto(params.title, 160) || copy.title;
  const varias = /,| y /.test(poliza);
  const intro = conPoliza(corto(params.intro, 600) || copy.intro, poliza, varias);
  const documentos = normalizarDocumentos(params.documentos);
  const enlace = tipo === 'completo' || tipo === 'recibido' ? '' : enlaceSeguro(params.enlace);
  const vence = enlace ? formatoVence(params.venceEn) : '';
  const notasParam = (params.notas ?? []).map((n) => corto(n, 400)).filter(Boolean).slice(0, 4);
  const notas = notasParam.length ? notasParam : notaPorDefecto(tipo, Boolean(enlace));
  const pendientes = documentos.filter((d) => d.estado === 'pendiente' || d.estado === 'corregir');

  // ─── Texto plano ──────────────────────────────────────────────────────
  const text = [
    'La Mundial de Seguros',
    '',
    title,
    '',
    `Hola ${nombre},`,
    intro.text,
    documentos.length ? '\nTus documentos:' : '',
    ...documentos.map(
      (d) =>
        `- ${d.nombre}${d.poliza ? ` (póliza ${d.poliza})` : ''}: ${ESTADO_UI[d.estado].label}` +
        (d.motivo ? `\n  Qué corregir: ${d.motivo}` : ''),
    ),
    enlace ? `\nSubir mis documentos: ${enlace}` : '',
    vence ? `El enlace vence el ${vence}.` : '',
    enlace ? `\nCómo hacerlo:\n${PASOS.map((p, i) => `${i + 1}. ${p}`).join('\n')}` : '',
    notas.length ? `\n${notas.join('\n')}` : '',
    '',
    `Teléfono: ${phone}`,
    'Correo: info@lamundialdeseguros.com',
    'Web: https://lamundialdeseguros.com/',
    '',
    'Mensaje automático. No respondas a este correo.',
  ]
    .filter((line) => line !== '')
    .join('\n');

  // ─── HTML ─────────────────────────────────────────────────────────────
  // Vista previa de la bandeja (oculta): un dato que no repite el cuerpo.
  const preheader =
    pendientes.length && enlace
      ? `${pendientes.length === 1 ? 'Falta 1 documento' : `Faltan ${pendientes.length} documentos`}${vence ? `. El enlace vence el ${vence}` : ''}.`
      : title;

  const docsHtml = documentos.length
    ? `<tr>
            <td class="px" style="padding:24px 32px 0;">
              <div style="font-family:${FONT};font-size:13px;line-height:18px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND_BLUE};margin:0 0 12px;">Tus documentos</div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                ${documentos.map(documentoHtml).join('')}
              </table>
            </td>
          </tr>`
    : '';

  const ctaHtml = enlace
    ? `<tr>
            <td class="px" style="padding:16px 32px 0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" bgcolor="${BRAND_BLUE}" style="background:${BRAND_BLUE};border-radius:8px;">
                    <a href="${escapeHtml(enlace)}" target="_blank" rel="noopener noreferrer"
                      style="display:block;padding:16px 20px;font-family:${FONT};font-size:17px;line-height:22px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">Subir mis documentos</a>
                  </td>
                </tr>
              </table>
              ${
                vence
                  ? `<p style="margin:10px 0 0;font-family:${FONT};font-size:13px;line-height:19px;color:${MUTED};text-align:center;">El enlace vence el <strong style="color:${TEXT};">${escapeHtml(vence)}</strong>.</p>`
                  : ''
              }
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:24px 32px 0;">
              <div style="font-family:${FONT};font-size:13px;line-height:18px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND_BLUE};margin:0 0 10px;">Cómo hacerlo</div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                ${PASOS.map(
                  (p, i) => `<tr>
                  <td width="36" valign="top" style="width:36px;padding:0 0 10px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
                      <td align="center" valign="middle" width="26" height="26" bgcolor="${BRAND_BLUE}" style="width:26px;height:26px;background:${BRAND_BLUE};border-radius:13px;font-family:${FONT};font-size:13px;line-height:26px;font-weight:700;color:#ffffff;">${i + 1}</td>
                    </tr></table>
                  </td>
                  <td valign="middle" style="padding:0 0 10px;font-family:${FONT};font-size:15px;line-height:26px;color:${TEXT};">${escapeHtml(p)}</td>
                </tr>`,
                ).join('')}
              </table>
            </td>
          </tr>`
    : '';

  const notasHtml = notas.length
    ? `<tr>
            <td class="px" style="padding:16px 32px 0;">
              ${notas
                .map(
                  (n) =>
                    `<p style="margin:0 0 8px;font-family:${FONT};font-size:13px;line-height:20px;color:${MUTED};">${escapeHtml(n)}</p>`,
                )
                .join('')}
            </td>
          </tr>`
    : '';

  const fallbackHtml = enlace
    ? `<tr>
            <td class="px" style="padding:8px 32px 0;">
              <p style="margin:0;font-family:${FONT};font-size:12px;line-height:18px;color:#9ca3af;">
                Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
                <a href="${escapeHtml(enlace)}" style="color:${BRAND_BLUE};word-break:break-all;">${escapeHtml(enlace)}</a>
              </p>
            </td>
          </tr>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(subject)}</title>
  <style>
    @media only screen and (max-width: 480px) {
      .px { padding-left: 18px !important; padding-right: 18px !important; }
      .h1 { font-size: 21px !important; line-height: 27px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f3f4f6;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f3f4f6" style="background:#f3f4f6;">
    <tr>
      <td align="center" style="padding:20px 8px;">
        <!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;">
          <tr>
            <td class="px" style="padding:24px 32px 14px;text-align:center;">
              <img src="${LOGO_URL}" alt="La Mundial de Seguros" width="200" style="width:200px;max-width:70%;height:auto;border:0;display:inline-block;">
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:0 32px;">
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
            <td class="px" style="padding:22px 32px 0;">
              <h1 class="h1" style="margin:0;font-family:${FONT};font-size:23px;line-height:30px;font-weight:800;color:${BRAND_BLUE};">${escapeHtml(title)}</h1>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:16px 32px 0;">
              <p style="margin:0 0 8px;font-family:${FONT};font-size:16px;line-height:24px;color:${TEXT};">Hola <strong>${escapeHtml(nombre)}</strong>,</p>
              <p style="margin:0;font-family:${FONT};font-size:15px;line-height:23px;color:${TEXT};">${intro.html}</p>
            </td>
          </tr>
          ${docsHtml}
          ${ctaHtml}
          ${notasHtml}
          ${fallbackHtml}
          <tr>
            <td class="px" style="padding:24px 32px 0;">
              <div style="border-top:1px solid #e5e7eb;font-size:0;line-height:0;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:12px 32px 26px;text-align:center;">
              <p style="margin:0 0 6px;font-family:${FONT};font-size:15px;font-weight:800;color:${BRAND_BLUE};">La Mundial de Seguros</p>
              <p style="margin:0 0 10px;font-family:${FONT};font-size:13px;line-height:20px;color:${BRAND_BLUE};">
                Teléfono: ${escapeHtml(phone)}<br>
                Correo: <a href="mailto:info@lamundialdeseguros.com" style="color:${BRAND_BLUE};">info@lamundialdeseguros.com</a><br>
                Web: <a href="https://lamundialdeseguros.com/" style="color:${BRAND_BLUE};">lamundialdeseguros.com</a>
              </p>
              <p style="margin:0;font-family:${FONT};font-size:11px;line-height:16px;color:${MUTED};">Mensaje automático. No respondas a este correo.</p>
            </td>
          </tr>
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}
