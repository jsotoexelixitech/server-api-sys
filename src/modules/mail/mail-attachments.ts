/**
 * Adjuntos de `POST /api/v1/mail/send` (campo opcional `attachments`): solo xlsx, csv y pdf,
 * máximo 5 archivos y 8 MB en total (ya decodificados), nombres saneados. Lo usa el control
 * documental diario de Nexus para mandar su Excel. Los correos sin adjuntos no cambian.
 */
export const MAIL_ATTACHMENT_TYPES = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/csv': 'csv',
  'application/pdf': 'pdf',
} as const;

export type MailAttachmentType = keyof typeof MAIL_ATTACHMENT_TYPES;
export const MAIL_ATTACHMENT_CONTENT_TYPES = Object.keys(MAIL_ATTACHMENT_TYPES) as MailAttachmentType[];

export const MAIL_ATTACHMENTS_MAX = 5;
export const MAIL_ATTACHMENTS_MAX_BYTES = 8 * 1024 * 1024;
/** Base64 de 8 MB (+ margen): tope por archivo en el DTO, antes de decodificar. */
export const MAIL_ATTACHMENT_MAX_BASE64 = Math.ceil(MAIL_ATTACHMENTS_MAX_BYTES / 3) * 4 + 4;
/** Límite del body JSON de la ruta `/api/v1/mail/send` (main.ts): base64 + plantilla holgada. */
export const MAIL_SEND_BODY_LIMIT = '12mb';

export type MailAttachmentInput = {
  filename?: unknown;
  contentBase64?: unknown;
  contentType?: unknown;
};

export type PreparedAttachment = {
  filename: string;
  content: Buffer;
  contentType: MailAttachmentType;
};

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

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

export function prepararAdjuntos(
  raw: unknown,
): { adjuntos: PreparedAttachment[] } | { error: string } {
  if (raw == null) return { adjuntos: [] };
  if (!Array.isArray(raw)) return { error: 'attachments debe ser una lista.' };
  if (raw.length > MAIL_ATTACHMENTS_MAX) {
    return { error: `Máximo ${MAIL_ATTACHMENTS_MAX} adjuntos.` };
  }
  const adjuntos: PreparedAttachment[] = [];
  let total = 0;
  for (const item of raw as MailAttachmentInput[]) {
    const contentType = String(item?.contentType ?? '').trim().toLowerCase() as MailAttachmentType;
    const ext = MAIL_ATTACHMENT_TYPES[contentType];
    if (!ext) return { error: 'Tipo de adjunto no permitido (solo xlsx, csv o pdf).' };
    const b64 = String(item?.contentBase64 ?? '').replace(/\s+/g, '');
    if (!b64 || b64.length % 4 !== 0 || !BASE64.test(b64)) {
      return { error: 'Adjunto con contenido base64 inválido.' };
    }
    const content = Buffer.from(b64, 'base64');
    total += content.length;
    if (total > MAIL_ATTACHMENTS_MAX_BYTES) {
      return { error: `Los adjuntos superan ${MAIL_ATTACHMENTS_MAX_BYTES / 1024 / 1024} MB.` };
    }
    adjuntos.push({ filename: sanearNombreAdjunto(item?.filename, ext), content, contentType });
  }
  return { adjuntos };
}
