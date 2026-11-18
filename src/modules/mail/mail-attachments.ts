/**
 * Adjuntos de `POST /api/v1/mail/send` y `POST /api/v1/mail/policy-emission` (campo opcional `attachments`):
 * solo xlsx, csv y pdf, máximo 8 archivos y 15 MB en total (ya decodificados), nombres saneados.
 * Cada adjunto llega en base64 (`contentBase64` + `contentType`) o por `url` (la descarga la hace
 * `mail-attachment-url.ts` con lista blanca de hosts). Los correos sin adjuntos no cambian.
 *
 * 15 MB decodificados ≈ 20 MB ya codificados en el mensaje MIME (base64 suma ~33 %): cabe en el
 * límite habitual de 25 MB de los buzones (Gmail/Outlook). Un cuadro póliza de Sis2000 pesa < 1 MB,
 * así que 8 PDFs de póliza quedan muy por debajo.
 */
export const MAIL_ATTACHMENT_TYPES = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/csv': 'csv',
  'application/pdf': 'pdf',
} as const;

export type MailAttachmentType = keyof typeof MAIL_ATTACHMENT_TYPES;
export const MAIL_ATTACHMENT_CONTENT_TYPES = Object.keys(MAIL_ATTACHMENT_TYPES) as MailAttachmentType[];

export const MAIL_ATTACHMENTS_MAX = 8;
export const MAIL_ATTACHMENTS_MAX_BYTES = 15 * 1024 * 1024;
/** Base64 del total permitido (+ margen): tope por archivo en el DTO, antes de decodificar. */
export const MAIL_ATTACHMENT_MAX_BASE64 = Math.ceil(MAIL_ATTACHMENTS_MAX_BYTES / 3) * 4 + 4;
/** Límite del body JSON de `/api/v1/mail/send` y `/mail/policy-emission` (main.ts): base64 de 15 MB + plantilla. */
export const MAIL_SEND_BODY_LIMIT = '22mb';

export type MailAttachmentInput = {
  filename?: unknown;
  contentBase64?: unknown;
  contentType?: unknown;
  url?: unknown;
};

export type PreparedAttachment = {
  filename: string;
  content: Buffer;
  contentType: MailAttachmentType;
};

/** Adjunto ya validado en forma: listo (base64) o pendiente de descargar (url). */
export type AdjuntoPendiente =
  | { tipo: 'base64'; adjunto: PreparedAttachment }
  | { tipo: 'url'; filename: string; url: string; contentType?: MailAttachmentType };

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

export function megas(bytes: number): string {
  return `${bytes / 1024 / 1024} MB`;
}

/** Solo letras, dígitos, punto, guion y guion bajo; sin rutas; extensión según el tipo. */
export function sanearNombreAdjunto(raw: unknown, ext: string): string {
  const base = String(raw ?? '')
    .split(/[\\/]/)
    .pop()!
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\.[^.]*$/, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 100);
  return `${base || 'adjunto'}.${ext}`;
}

/** Valida un adjunto suelto (sin red). */
export function prepararAdjunto(item: MailAttachmentInput): AdjuntoPendiente | { error: string } {
  const tipoTexto = String(item?.contentType ?? '').trim().toLowerCase();
  const url = typeof item?.url === 'string' ? item.url.trim() : '';
  if (url) {
    if (tipoTexto && !(tipoTexto in MAIL_ATTACHMENT_TYPES)) {
      return { error: 'Tipo de adjunto no permitido (solo xlsx, csv o pdf).' };
    }
    return {
      tipo: 'url',
      filename: String(item?.filename ?? ''),
      url,
      ...(tipoTexto ? { contentType: tipoTexto as MailAttachmentType } : {}),
    };
  }
  const contentType = tipoTexto as MailAttachmentType;
  const ext = MAIL_ATTACHMENT_TYPES[contentType];
  if (!ext) return { error: 'Tipo de adjunto no permitido (solo xlsx, csv o pdf).' };
  const b64 = String(item?.contentBase64 ?? '').replace(/\s+/g, '');
  if (!b64 || b64.length % 4 !== 0 || !BASE64.test(b64)) {
    return { error: 'Adjunto con contenido base64 inválido.' };
  }
  const content = Buffer.from(b64, 'base64');
  if (content.length > MAIL_ATTACHMENTS_MAX_BYTES) {
    return { error: `Los adjuntos superan ${megas(MAIL_ATTACHMENTS_MAX_BYTES)}.` };
  }
  return {
    tipo: 'base64',
    adjunto: { filename: sanearNombreAdjunto(item?.filename, ext), content, contentType },
  };
}

/** Lista completa: cualquier adjunto inválido corta con error (así funciona `/mail/send`). */
export function prepararAdjuntos(
  raw: unknown,
): { pendientes: AdjuntoPendiente[] } | { error: string } {
  if (raw == null) return { pendientes: [] };
  if (!Array.isArray(raw)) return { error: 'attachments debe ser una lista.' };
  if (raw.length > MAIL_ATTACHMENTS_MAX) {
    return { error: `Máximo ${MAIL_ATTACHMENTS_MAX} adjuntos.` };
  }
  const pendientes: AdjuntoPendiente[] = [];
  let total = 0;
  for (const item of raw as MailAttachmentInput[]) {
    const p = prepararAdjunto(item);
    if ('error' in p) return p;
    if (p.tipo === 'base64') {
      total += p.adjunto.content.length;
      if (total > MAIL_ATTACHMENTS_MAX_BYTES) {
        return { error: `Los adjuntos superan ${megas(MAIL_ATTACHMENTS_MAX_BYTES)}.` };
      }
    }
    pendientes.push(p);
  }
  return { pendientes };
}
