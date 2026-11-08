/**
 * Correo al asegurado del monitor de expedientes (Nexus). Texto oficial de La Mundial
 * (de usted): saludo, póliza en negrita, documentación pendiente como lista simple,
 * botón «Completar mi expediente», firma y pie de control documental.
 * Marca igual que `branded` (logo, colores). HTML de correo: tablas y estilos en línea,
 * máx. 600 px, legible a 360 px (Gmail y Outlook).
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
  /** Solo en `corregir`: motivo corto ya redactado para el asegurado. */
  motivo?: string;
  /** Cuando el correo cubre varias pólizas. */
  poliza?: string;
};

export type ExpedienteDocumentosParams = {
  tipo: ExpedienteTipoCorreo;
  subject?: string;
  nombre?: string;
  /** Números de póliza (sin «N.º»). */
  polizas?: string[];
  documentos?: ExpedienteDocumento[];
  enlace?: string;
  callCenterPhone?: string;
};

const LOGO_URL =
  'https://lamundialdeseguros.com/wp-content/uploads/2023/02/Logotipo-La-Mundial-01.jpg';
const BRAND_BLUE = '#0f3462';
const BRAND_RED = '#c8102e';
const MUTED = '#6b7280';
const TEXT = '#1f2937';
const FONT = 'Arial,Helvetica,sans-serif';
const MARCA = 'La Mundial de Seguros';
const MAX_DOCS = 30;

const PIE_BASE =
  'Este es un mensaje automático generado por nuestro sistema de control documental. No requiere responder a este correo';
const PIE_ENLACE = '; puede completar la gestión a través del enlace indicado.';

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

/** Acepta `polizas[]` o, por compatibilidad, `poliza` separada por comas. */
export function normalizarPolizas(raw: unknown, legacy?: unknown): string[] {
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : String(legacy ?? '')
        .split(/\s*,\s*/)
        .filter(Boolean);
  return list
    .map((p) => corto(p, 60).replace(/^N\.?\s*[°º]\s*/i, ''))
    .filter(Boolean)
    .slice(0, 10);
}

/** «N.º X», «N.º X y N.º Y», «N.º X, N.º Y y N.º Z». */
export function listaPolizas(polizas: string[]): string {
  const n = polizas.map((p) => `N.º ${p}`);
  return n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}`;
}

/** Asunto oficial; el recordatorio lleva «Recordatorio:» delante. */
export function asuntoExpediente(tipo: ExpedienteTipoCorreo, polizas: string[]): string {
  const ref = `${polizas.length > 1 ? 'sus pólizas' : 'su póliza'}${
    polizas.length ? ` ${listaPolizas(polizas)}` : ''
  }`;
  switch (tipo) {
    case 'recordatorio':
      return `Recordatorio: ${MARCA} | Complete la documentación de ${ref}`;
    case 'observado':
      return `${MARCA} | Necesitamos corregir un documento de ${ref}`;
    case 'recibido':
      return `${MARCA} | Documento recibido de ${ref}`;
    case 'completo':
      return `${MARCA} | Expediente completo de ${ref}`;
    default:
      return `${MARCA} | Complete la documentación de ${ref}`;
  }
}

/** «Licencia de conducir (La licencia está vencida).» */
function lineaDoc(d: ExpedienteDocumento): string {
  const motivo = d.motivo ? d.motivo.replace(/[.\s]+$/, '') : '';
  return motivo ? `${d.nombre} (${motivo}).` : `${d.nombre}.`;
}

/** Párrafo como segmentos [texto, negrita]. */
type Seg = [string, boolean?];
type Bloque = { p: Seg[] } | { lista: string[]; titulo?: string } | { boton: true };

function cuerpo(
  tipo: ExpedienteTipoCorreo,
  polizas: string[],
  documentos: ExpedienteDocumento[],
  conEnlace: boolean,
): Bloque[] {
  const varias = polizas.length > 1;
  const su = varias ? 'sus pólizas' : 'su póliza';
  const num = listaPolizas(polizas);
  const refPoliza: Seg[] = num ? [[`${su} `], [num, true]] : [[su]];
  const saludoMarca: Bloque = { p: [['Reciba un cordial saludo de '], [MARCA, true], ['.']] };
  const noAfecta: Bloque = { p: [[`Esta gestión no afecta la emisión de ${su}.`]] };
  const boton: Bloque[] = conEnlace ? [{ boton: true }] : [];

  if (tipo === 'solicitud' || tipo === 'recordatorio') {
    const pend = documentos.filter((d) => d.estado === 'pendiente' || d.estado === 'corregir');
    const listas: Bloque[] = [];
    if (varias && pend.some((d) => d.poliza)) {
      for (const pol of polizas) {
        const items = pend.filter((d) => d.poliza === pol).map(lineaDoc);
        if (items.length) listas.push({ titulo: `Póliza N.º ${pol}:`, lista: items });
      }
    } else if (pend.length) {
      listas.push({ lista: pend.map(lineaDoc) });
    }
    const emitida = varias ? 'han sido emitidas exitosamente' : 'ha sido emitida exitosamente';
    return [
      saludoMarca,
      { p: [[`Le confirmamos que ${su} `], [num ? `${num} ${emitida}` : emitida, true], ['.']] },
      {
        p: [
          [
            'Como parte de nuestros procesos de control y actualización de expedientes, hemos identificado que aún se encuentra pendiente completar la siguiente documentación:',
          ],
        ],
      },
      ...listas,
      {
        p: [
          ['Es importante que complete este proceso a la brevedad', true],
          [
            `, ya que mantener su expediente actualizado forma parte de los requisitos documentales de ${su}.`,
          ],
        ],
      },
      ...(conEnlace
        ? ([
            {
              p: [
                [
                  'Para facilitarle la gestión, hemos habilitado un enlace seguro donde podrá cargar los documentos directamente:',
                ],
              ],
            },
          ] as Bloque[])
        : []),
      ...boton,
      { p: [['¿Ya entregó estos documentos a La Mundial de Seguros?', true]] },
      {
        p: [
          [
            'Si los entregó previamente por alguno de nuestros canales autorizados, no necesita cargarlos nuevamente. Sin embargo, mientras no se confirme su validación, su expediente continuará registrado como pendiente y recibirá las notificaciones de seguimiento correspondientes.',
          ],
        ],
      },
      {
        p: [
          [
            'Le agradecemos atender esta solicitud oportunamente para mantener su documentación completa y debidamente validada.',
          ],
        ],
      },
      noAfecta,
    ];
  }

  if (tipo === 'observado') {
    const corr = documentos.filter((d) => d.estado === 'corregir');
    return [
      saludoMarca,
      {
        p: [
          ['Revisamos la documentación recibida para '],
          ...refPoliza,
          [' y necesitamos que cargue nuevamente el siguiente documento:'],
        ],
      },
      ...(corr.length ? ([{ lista: corr.map(lineaDoc) }] as Bloque[]) : []),
      ...(conEnlace
        ? ([{ p: [['Puede hacerlo directamente en el enlace seguro:']] }] as Bloque[])
        : []),
      ...boton,
      noAfecta,
    ];
  }

  if (tipo === 'recibido') {
    const doc = documentos.find((d) => d.estado === 'recibido');
    return [
      saludoMarca,
      {
        p: [
          ['Le confirmamos que recibimos '],
          ...(doc ? ([['el documento '], [doc.nombre, true]] as Seg[]) : ([['su documento']] as Seg[])),
          [' de '],
          ...refPoliza,
          ['. Lo estamos verificando y le informaremos si hace falta alguna corrección.'],
        ],
      },
    ];
  }

  return [
    saludoMarca,
    {
      p: [
        ['Le confirmamos que hemos completado y validado la documentación de '],
        ...refPoliza,
        ['. No necesita realizar ninguna otra gestión para este expediente.'],
      ],
    },
  ];
}

function parrafoHtml(p: Seg[]): string {
  const inner = p
    .map(([t, b]) =>
      b ? `<strong style="color:${BRAND_BLUE};">${escapeHtml(t)}</strong>` : escapeHtml(t),
    )
    .join('');
  return `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:23px;color:${TEXT};">${inner}</p>`;
}

function listaHtml(items: string[]): string {
  const filas = items
    .map(
      (i) => `<tr>
                  <td width="22" valign="top" style="width:22px;font-family:${FONT};font-size:15px;line-height:23px;color:${BRAND_RED};">&#8226;</td>
                  <td valign="top" style="font-family:${FONT};font-size:15px;line-height:23px;color:${TEXT};">${escapeHtml(i)}</td>
                </tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 14px;">${filas}</table>`;
}

export function buildExpedienteDocumentosEmail(params: ExpedienteDocumentosParams): BuiltEmail {
  const tipo: ExpedienteTipoCorreo = (EXPEDIENTE_TIPOS as readonly string[]).includes(params.tipo)
    ? params.tipo
    : 'solicitud';
  const phone = callCenter(params.callCenterPhone);
  const polizas = normalizarPolizas(params.polizas);
  const subject = corto(params.subject, 200) || asuntoExpediente(tipo, polizas);
  const nombre = corto(params.nombre, 80);
  const documentos = normalizarDocumentos(params.documentos);
  const enlace = tipo === 'completo' || tipo === 'recibido' ? '' : enlaceSeguro(params.enlace);
  const bloques = cuerpo(tipo, polizas, documentos, Boolean(enlace));
  const saludo = `Estimado(a) ${nombre || 'asegurado(a)'}:`;
  const pie = PIE_BASE + (enlace ? PIE_ENLACE : '.');

  // ─── Texto plano ──────────────────────────────────────────────────────
  const text = [
    saludo,
    ...bloques.map((b) => {
      if ('p' in b) return b.p.map(([t]) => t).join('');
      if ('lista' in b)
        return [b.titulo ?? '', ...b.lista.map((i) => `- ${i}`)].filter(Boolean).join('\n');
      return `Completar mi expediente: ${enlace}`;
    }),
    `Atentamente,\n${MARCA}`,
    `Teléfono: ${phone}\nCorreo: info@lamundialdeseguros.com\nWeb: https://lamundialdeseguros.com/`,
    pie,
  ].join('\n\n');

  // ─── HTML ─────────────────────────────────────────────────────────────
  const botonHtml = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 8px;">
                <tr>
                  <td align="center" bgcolor="${BRAND_BLUE}" style="background:${BRAND_BLUE};border-radius:8px;">
                    <a href="${escapeHtml(enlace)}" target="_blank" rel="noopener noreferrer"
                      style="display:block;padding:16px 20px;font-family:${FONT};font-size:17px;line-height:22px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">Completar mi expediente</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 18px;font-family:${FONT};font-size:12px;line-height:18px;color:#9ca3af;">
                Si el botón no funciona, copie y pegue este enlace en su navegador:<br>
                <a href="${escapeHtml(enlace)}" style="color:${BRAND_BLUE};word-break:break-all;">${escapeHtml(enlace)}</a>
              </p>`;

  const cuerpoHtml = bloques
    .map((b) => {
      if ('p' in b) return parrafoHtml(b.p);
      if ('lista' in b)
        return (
          (b.titulo
            ? `<p style="margin:0 0 6px;font-family:${FONT};font-size:15px;line-height:23px;font-weight:700;color:${BRAND_BLUE};">${escapeHtml(b.titulo)}</p>`
            : '') + listaHtml(b.lista)
        );
      return botonHtml;
    })
    .join('\n              ');

  const preheader =
    tipo === 'solicitud' || tipo === 'recordatorio'
      ? 'Tiene documentación pendiente por completar en su expediente.'
      : subject;

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
            <td class="px" style="padding:24px 32px 0;">
              <p style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:24px;color:${TEXT};">${escapeHtml(saludo)}</p>
              ${cuerpoHtml}
              <p style="margin:18px 0 0;font-family:${FONT};font-size:15px;line-height:23px;color:${TEXT};">Atentamente,<br><strong style="color:${BRAND_BLUE};">${MARCA}</strong></p>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:24px 32px 0;">
              <div style="border-top:1px solid #e5e7eb;font-size:0;line-height:0;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:12px 32px 26px;text-align:center;">
              <p style="margin:0 0 10px;font-family:${FONT};font-size:13px;line-height:20px;color:${BRAND_BLUE};">
                Teléfono: ${escapeHtml(phone)}<br>
                Correo: <a href="mailto:info@lamundialdeseguros.com" style="color:${BRAND_BLUE};">info@lamundialdeseguros.com</a><br>
                Web: <a href="https://lamundialdeseguros.com/" style="color:${BRAND_BLUE};">lamundialdeseguros.com</a>
              </p>
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

  return { subject, html, text };
}
