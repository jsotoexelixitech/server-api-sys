import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type Transporter from 'nodemailer/lib/mailer';
import {
  asuntoBienvenida,
  renderPolicyWelcomeHtml,
  type PolizaAdicionalCorreo,
} from './templates/policy-welcome.template';
import type { SendPolicyEmailDto } from './dto/send-policy-email.dto';
import type { SendFuneralPaymentLinkDto } from './dto/send-funeral-payment-link.dto';
import type { SendFuneralReviewAlertDto } from './dto/send-funeral-review-alert.dto';
import type { SendFuneralRejectedDto } from './dto/send-funeral-rejected.dto';
import { buildFuneralPaymentLinkEmail } from './templates/funeral-payment-link.template';
import { buildFuneralReviewAlertEmail } from './templates/funeral-review-alert.template';
import { buildFuneralRejectedEmail } from './templates/funeral-rejected.template';
import { buildLamundialBrandedEmail } from './templates/lamundial-branded.template';
import {
  buildExpedienteDocumentosEmail,
  normalizarDocumentos,
  normalizarPolizas,
  type ExpedienteTipoCorreo,
} from './templates/expediente-documentos.template';
import { buildExpedienteCodigoEmail, codigoSeguro } from './templates/expediente-codigo.template';
import {
  buildExpedienteReporteDiarioEmail,
  normalizarReporteDiario,
} from './templates/expediente-reporte-diario.template';
import {
  buildExpedienteReporteSimpleEmail,
  normalizarReporteSimple,
} from './templates/expediente-reporte-diario-simple.template';
import type { SendTemplatedMailDto } from './dto/send-templated-mail.dto';
import {
  MAIL_ATTACHMENTS_MAX,
  MAIL_ATTACHMENTS_MAX_BYTES,
  megas,
  prepararAdjunto,
  prepararAdjuntos,
  sanearNombreAdjunto,
  MAIL_ATTACHMENT_TYPES,
  type AdjuntoPendiente,
  type MailAttachmentInput,
  type PreparedAttachment,
} from './mail-attachments';
import {
  construirPoliticaUrl,
  descargarAdjuntoUrl,
  detectarTipoAdjunto,
  validarUrlAdjunto,
  type DepsDescarga,
  type PoliticaUrlAdjuntos,
} from './mail-attachment-url';

/** Qué adjuntos salieron en el correo y cuáles se omitieron (con el motivo). */
export type ResumenAdjuntos = {
  enviados: string[];
  omitidos: Array<{ archivo: string; motivo: string }>;
};

export type PolicyEmissionMailResult = {
  sent: boolean;
  mode: 'disabled' | 'smtp' | 'sisip';
  messageId?: string;
  error?: string;
  /** Solo `/mail/policy-emission` en modo smtp. */
  adjuntos?: ResumenAdjuntos;
};

/** Documento a adjuntar en el correo de póliza: URL fija (urlpoliza, url_recibo…) o ítem de `attachments`. */
type FuenteAdjunto =
  | { archivo: string; url: string; fijo: true }
  | { archivo: string; pendiente: AdjuntoPendiente; fijo: false }
  | { archivo: string; error: string; fijo: false };

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  /** Inyectable en pruebas (fetch / DNS falsos); en producción usa fetch y dns.lookup. */
  protected descargaDeps: DepsDescarga = {};

  constructor(private readonly config: ConfigService) {}

  private politicaUrl(): PoliticaUrlAdjuntos {
    return construirPoliticaUrl((k) => this.config.get(k));
  }

  /** Descarga un adjunto por URL (lista blanca, https, tope de tamaño) y valida que sea pdf/xlsx/csv. */
  private async descargarAdjunto(
    url: string,
    filename: string,
    pol: PoliticaUrlAdjuntos,
    opciones: { nombreFijo: boolean; contentType?: string },
  ): Promise<PreparedAttachment> {
    const { content, contentTypeRespuesta } = await descargarAdjuntoUrl(url, pol, this.descargaDeps);
    const tipo = detectarTipoAdjunto(content, {
      declarado: opciones.contentType,
      respuesta: contentTypeRespuesta,
      filename,
    });
    if (!tipo) throw new Error('contenido no es pdf, xlsx ni csv');
    return {
      filename: opciones.nombreFijo ? filename : sanearNombreAdjunto(filename, MAIL_ATTACHMENT_TYPES[tipo]),
      content,
      contentType: tipo,
    };
  }

  /** `/mail/send`: todo adjunto debe salir; el primero que falle corta con 400. */
  private async resolverAdjuntosEstrictos(
    pendientes: AdjuntoPendiente[],
    pol: PoliticaUrlAdjuntos,
  ): Promise<PreparedAttachment[]> {
    const listos = await Promise.all(
      pendientes.map(async (p) => {
        if (p.tipo === 'base64') return p.adjunto;
        try {
          return await this.descargarAdjunto(p.url, p.filename, pol, {
            nombreFijo: false,
            contentType: p.contentType,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new BadRequestException(`No se pudo usar el adjunto ${p.filename || p.url}: ${msg}.`);
        }
      }),
    );
    const total = listos.reduce((s, a) => s + a.content.length, 0);
    if (total > MAIL_ATTACHMENTS_MAX_BYTES) {
      throw new BadRequestException(`Los adjuntos superan ${megas(MAIL_ATTACHMENTS_MAX_BYTES)}.`);
    }
    return listos;
  }

  /** Joi puede devolver boolean; .env suele ser string — aceptar ambos. */
  private envFlag(key: string, defaultValue = false): boolean {
    const raw = this.config.get<boolean | string | undefined>(key);
    if (raw === undefined || raw === null) return defaultValue;
    if (typeof raw === 'boolean') return raw;
    return String(raw).trim().toLowerCase() === 'true';
  }

  isEnabled(): boolean {
    return this.envFlag('MAIL_ENABLED', false);
  }

  getTransportMode(): 'smtp' | 'sisip' {
    const mode = this.config.get<string>('MAIL_TRANSPORT', 'smtp').toLowerCase();
    return mode === 'sisip' ? 'sisip' : 'smtp';
  }

  shouldAutoSendOnEmit(): boolean {
    return this.isEnabled() && this.envFlag('MAIL_AUTO_ON_EMIT', false);
  }

  async sendPolicyEmissionEmail(dto: SendPolicyEmailDto): Promise<PolicyEmissionMailResult> {
    if (!this.isEnabled()) {
      return { sent: false, mode: 'disabled', error: 'MAIL_ENABLED=false' };
    }

    const mode = this.getTransportMode();
    if (mode === 'sisip') {
      return this.sendViaSisipApi(dto);
    }
    return this.sendViaSmtp(dto);
  }

  async sendFuneralPaymentLinkEmail(
    dto: SendFuneralPaymentLinkDto,
  ): Promise<PolicyEmissionMailResult> {
    return this.sendTemplatedEmail({
      to: dto.to,
      toName: dto.name,
      template: 'funeral-payment-link',
      data: {
        name: dto.name,
        planName: dto.planName,
        productLabel: dto.productLabel,
        paymentUrl: dto.paymentUrl,
        expiresAt: dto.expiresAt,
      },
    });
  }

  async sendFuneralReviewAlertEmail(
    dto: SendFuneralReviewAlertDto,
  ): Promise<PolicyEmissionMailResult> {
    return this.sendTemplatedEmail({
      to: dto.to,
      template: 'funeral-review-alert',
      data: {
        tomadorNombre: dto.tomadorNombre,
        planName: dto.planName,
        productLabel: dto.productLabel,
        scoreTotal: dto.scoreTotal,
      },
    });
  }

  async sendFuneralRejectedEmail(
    dto: SendFuneralRejectedDto,
  ): Promise<PolicyEmissionMailResult> {
    return this.sendTemplatedEmail({
      to: dto.to,
      toName: dto.tomadorNombre,
      template: 'funeral-rejected',
      data: {
        tomadorNombre: dto.tomadorNombre,
        planName: dto.planName,
        productLabel: dto.productLabel,
        reason: dto.reason,
      },
    });
  }

  async sendTemplatedEmail(dto: SendTemplatedMailDto): Promise<PolicyEmissionMailResult> {
    // Adjuntos inválidos = 400 (el cliente puede reintentar sin adjunto); sin adjuntos no cambia nada.
    const prepared = prepararAdjuntos(dto.attachments);
    if ('error' in prepared) throw new BadRequestException(prepared.error);
    // URL fuera de la lista blanca o sin https: 400 antes de tocar la red.
    const pol = this.politicaUrl();
    for (const p of prepared.pendientes) {
      if (p.tipo !== 'url') continue;
      const v = validarUrlAdjunto(p.url, pol);
      if ('error' in v) throw new BadRequestException(`Adjunto ${p.filename || p.url}: ${v.error}.`);
    }

    if (!this.isEnabled()) {
      return { sent: false, mode: 'disabled', error: 'MAIL_ENABLED=false' };
    }

    const built = this.buildTemplate(dto);
    if ('error' in built) {
      return { sent: false, mode: 'smtp', error: built.error };
    }

    const adjuntos = await this.resolverAdjuntosEstrictos(prepared.pendientes, pol);

    const recipients = [
      dto.to.trim().toLowerCase(),
      ...(dto.toExtra || []).map((e) => e.trim().toLowerCase()),
    ].filter((e, i, arr) => e.includes('@') && arr.indexOf(e) === i);

    return this.sendSmtp({
      to: recipients,
      toName: dto.toName,
      subject: built.subject,
      html: built.html,
      text: built.text,
      logLabel: dto.template,
      ...(adjuntos.length ? { attachments: adjuntos } : {}),
      ...(dto.ocultarDestinatarios === true ? { ocultarDestinatarios: true } : {}),
    });
  }

  private buildTemplate(dto: SendTemplatedMailDto):
    | { subject: string; html: string; text: string }
    | { error: string } {
    const data = dto.data && typeof dto.data === 'object' ? dto.data : {};
    const str = (key: string, fallback = ''): string => {
      const v = data[key];
      if (v == null) return fallback;
      const t = String(v).trim();
      return t || fallback;
    };
    const phone = this.config.get<string>('CALL_CENTER_PHONE');

    if (dto.template === 'funeral-payment-link') {
      const paymentUrl = str('paymentUrl');
      if (!paymentUrl) return { error: 'data.paymentUrl es obligatorio.' };
      let expiresLabel: string | undefined;
      const expiresAt = str('expiresAt');
      if (expiresAt) {
        try {
          expiresLabel = new Date(expiresAt).toLocaleString('es-VE', {
            dateStyle: 'medium',
            timeStyle: 'short',
          });
        } catch {
          expiresLabel = expiresAt;
        }
      }
      return buildFuneralPaymentLinkEmail({
        nombre: str('name', 'Cliente'),
        planName: str('planName', 'Funerario'),
        productLabel: str('productLabel', 'Funerario'),
        paymentUrl,
        expiresLabel,
        callCenterPhone: phone,
      });
    }

    if (dto.template === 'funeral-review-alert') {
      return buildFuneralReviewAlertEmail({
        tomadorNombre: str('tomadorNombre', 'Tomador'),
        planName: str('planName', 'Funerario'),
        productLabel: str('productLabel', 'Funerario'),
        scoreTotal: str('scoreTotal', '—'),
        callCenterPhone: phone,
      });
    }

    if (dto.template === 'funeral-rejected') {
      return buildFuneralRejectedEmail({
        tomadorNombre: str('tomadorNombre', 'Cliente'),
        planName: str('planName', 'Funerario'),
        productLabel: str('productLabel', 'Funerario'),
        reason: str('reason'),
        callCenterPhone: phone,
      });
    }

    if (dto.template === 'expediente-codigo') {
      const codigo = codigoSeguro(data.codigo);
      if (!codigo) return { error: 'data.codigo es obligatorio (solo dígitos).' };
      return buildExpedienteCodigoEmail({
        subject: str('subject') || undefined,
        nombre: str('nombre') || undefined,
        codigo,
        minutos: Number(data.minutos),
        callCenterPhone: phone,
      });
    }

    if (dto.template === 'expediente-reporte-diario-simple') {
      return buildExpedienteReporteSimpleEmail(normalizarReporteSimple(data));
    }

    if (dto.template === 'expediente-reporte-diario') {
      return buildExpedienteReporteDiarioEmail(normalizarReporteDiario(data));
    }

    if (dto.template === 'expediente-documentos') {
      return buildExpedienteDocumentosEmail({
        tipo: str('tipo', 'solicitud') as ExpedienteTipoCorreo,
        subject: str('subject') || undefined,
        nombre: str('nombre') || undefined,
        polizas: normalizarPolizas(data.polizas, data.poliza),
        documentos: normalizarDocumentos(data.documentos),
        enlace: str('enlace') || undefined,
        callCenterPhone: phone,
      });
    }

    const fieldsFromDto = Array.isArray(dto.fields)
      ? dto.fields.map((f) => ({ label: String(f.label || ''), value: String(f.value || '') }))
      : [];
    const fieldsFromData = Array.isArray(data.fields)
      ? (data.fields as Array<{ label?: string; value?: string }>).map((f) => ({
          label: String(f?.label || ''),
          value: String(f?.value || ''),
        }))
      : [];
    const subject = str('subject');
    const title = str('title');
    const intro = str('intro');
    if (!subject || !title || !intro) {
      return { error: 'Plantilla branded requiere data.subject, data.title y data.intro.' };
    }
    return buildLamundialBrandedEmail({
      subject,
      eyebrow: str('eyebrow', 'La Mundial de Seguros'),
      title,
      intro,
      fields: (fieldsFromDto.length ? fieldsFromDto : fieldsFromData).filter((f) => f.label),
      ctaLabel: str('ctaLabel') || undefined,
      ctaUrl: str('ctaUrl') || undefined,
      extraNote: str('extraNote') || undefined,
      callCenterPhone: phone,
      introArriba: data.introArriba === false || data.introArriba === 'false' ? false : undefined,
    });
  }

  private async sendSmtp(opts: {
    to: string | string[];
    toName?: string;
    subject: string;
    html: string;
    text: string;
    logLabel: string;
    attachments?: PreparedAttachment[];
    /** true + más de un destinatario: "Para" = remitente y la lista va en CCO (BCC). */
    ocultarDestinatarios?: boolean;
  }): Promise<PolicyEmissionMailResult> {
    const fromEmail = this.config.get<string>('SMTP_FROM', 'info@lamundialdeseguros.com');
    const fromName = this.config.get<string>('SMTP_FROM_NAME', 'La Mundial de Seguros');
    const replyTo = this.config.get<string>('SMTP_REPLY_TO', fromEmail);
    const toList = Array.isArray(opts.to) ? opts.to : [opts.to];
    const enCco = opts.ocultarDestinatarios === true && toList.length > 1;
    const destino = enCco
      ? { to: { name: fromName, address: fromEmail }, bcc: toList }
      : {
          to: toList.length === 1 && opts.toName
            ? { name: opts.toName, address: toList[0] }
            : toList,
        };
    try {
      const info = await this.getTransporter().sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        replyTo,
        ...destino,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        ...(opts.attachments?.length
          ? {
              attachments: opts.attachments.map((a) => ({
                filename: a.filename,
                content: a.content,
                contentType: a.contentType,
              })),
            }
          : {}),
      });
      const adj = opts.attachments?.length ? ` (${opts.attachments.length} adjunto(s))` : '';
      const cco = enCco ? ' (CCO)' : '';
      this.logger.log(`Correo ${opts.logLabel} enviado a ${toList.join(', ')}${cco}${adj}`);
      return { sent: true, mode: 'smtp', messageId: info.messageId };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Fallo correo ${opts.logLabel}: ${msg}`);
      return { sent: false, mode: 'smtp', error: msg };
    }
  }

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;

    const host = this.config.get<string>('SMTP_HOST', 'mail.lamundialdeseguros.com');
    const port = Number(this.config.get<string>('SMTP_PORT', '25'));
    const secure = this.envFlag('SMTP_SECURE', false);
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const pass = this.config.get<string>('SMTP_PASS')?.trim();

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
      tls: { minVersion: 'TLSv1.2', rejectUnauthorized: false },
    });

    return this.transporter;
  }

  private buildAttachmentList(dto: SendPolicyEmailDto): { filename: string; url: string }[] {
    const items: { filename: string; url: string }[] = [];
    if (dto.urlpoliza) items.push({ filename: `poliza-${dto.cnpoliza}.pdf`, url: dto.urlpoliza });
    if (dto.urlpoliza_rcv) {
      const cn = dto.cnpoliza_rcv?.trim() || `rcv-${dto.cnpoliza}`;
      items.push({ filename: `poliza-${cn}.pdf`, url: dto.urlpoliza_rcv });
    }
    if (dto.url_conductor_habitual) {
      items.push({ filename: `conductor-${dto.cnpoliza}.pdf`, url: dto.url_conductor_habitual });
    }
    if (dto.url_club_arys) items.push({ filename: `club-arys-${dto.cnpoliza}.pdf`, url: dto.url_club_arys });
    if (dto.url_ingreso_caja) {
      items.push({ filename: `ingreso-caja-${dto.cnpoliza}.pdf`, url: dto.url_ingreso_caja });
    }
    if (dto.url_recibo) items.push({ filename: `recibo-${dto.cnrecibo ?? dto.cnpoliza}.pdf`, url: dto.url_recibo });
    if (dto.url_beneficiario_preferencial) {
      items.push({
        filename: `beneficiario-preferencial-${dto.cnpoliza}.pdf`,
        url: dto.url_beneficiario_preferencial,
      });
    }
    return items;
  }

  /**
   * Adjuntos del correo de póliza: los fijos (urlpoliza, urlpoliza_rcv, conductor, club Arys, ingreso de caja,
   * recibo, beneficiario preferencial) y luego `attachments`. Nada de esto tumba el correo: lo que no se pueda
   * descargar, no sea pdf/xlsx/csv, pase de 8 adjuntos o de 15 MB se omite y queda en `omitidos`.
   */
  private async armarAdjuntosPoliza(
    dto: SendPolicyEmailDto,
  ): Promise<{ adjuntos: PreparedAttachment[]; resumen: ResumenAdjuntos }> {
    const fuentes: FuenteAdjunto[] = this.buildAttachmentList(dto).map((i) => ({
      archivo: i.filename,
      url: i.url,
      fijo: true,
    }));
    for (const item of (Array.isArray(dto.attachments) ? dto.attachments : []) as MailAttachmentInput[]) {
      const archivo = String(item?.filename ?? '').trim() || String(item?.url ?? '') || 'adjunto';
      const p = prepararAdjunto(item);
      fuentes.push('error' in p ? { archivo, error: p.error, fijo: false } : { archivo, pendiente: p, fijo: false });
    }

    const pol = this.politicaUrl();
    const omitidos: ResumenAdjuntos['omitidos'] = [];
    const resueltos = await Promise.all(
      fuentes.map(async (f, i): Promise<PreparedAttachment | { motivo: string }> => {
        if (i >= MAIL_ATTACHMENTS_MAX) return { motivo: `supera el máximo de ${MAIL_ATTACHMENTS_MAX} adjuntos` };
        if ('error' in f) return { motivo: f.error };
        try {
          if (f.fijo) return await this.descargarAdjunto(f.url, f.archivo, pol, { nombreFijo: true });
          if (f.pendiente.tipo === 'base64') return f.pendiente.adjunto;
          return await this.descargarAdjunto(f.pendiente.url, f.pendiente.filename, pol, {
            nombreFijo: false,
            contentType: f.pendiente.contentType,
          });
        } catch (err) {
          return { motivo: err instanceof Error ? err.message : String(err) };
        }
      }),
    );

    const adjuntos: PreparedAttachment[] = [];
    let total = 0;
    resueltos.forEach((r, i) => {
      let motivo = 'motivo' in r ? r.motivo : '';
      if (!motivo && 'content' in r && total + r.content.length > MAIL_ATTACHMENTS_MAX_BYTES) {
        motivo = `los adjuntos superan ${megas(MAIL_ATTACHMENTS_MAX_BYTES)}`;
      }
      if (motivo || !('content' in r)) {
        omitidos.push({ archivo: fuentes[i].archivo, motivo });
        this.logger.warn(`Adjunto omitido ${fuentes[i].archivo}: ${motivo}`);
        return;
      }
      total += r.content.length;
      adjuntos.push(r);
    });
    return { adjuntos, resumen: { enviados: adjuntos.map((a) => a.filename), omitidos } };
  }

  /** Segunda póliza (p. ej. RCV aparte de Auto Casco) si viene y no repite la principal. */
  private otrasPolizas(dto: SendPolicyEmailDto): PolizaAdicionalCorreo[] {
    const cn = dto.cnpoliza_rcv?.trim();
    if (!cn || cn === dto.cnpoliza?.trim()) return [];
    return [{ cnpoliza: cn, producto: dto.producto_rcv, url: dto.urlpoliza_rcv }];
  }

  private parseDefaultCc(): string[] {
    const raw = this.config.get<string>('MAIL_DEFAULT_CC', '')?.trim();
    if (!raw) return [];
    return raw.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
  }

  private async sendViaSmtp(dto: SendPolicyEmailDto): Promise<PolicyEmissionMailResult> {
    const fromEmail = this.config.get<string>('SMTP_FROM', 'info@lamundialdeseguros.com');
    const fromName = this.config.get<string>('SMTP_FROM_NAME', 'La Mundial de Seguros');
    const replyTo = this.config.get<string>('SMTP_REPLY_TO', fromEmail);
    const name = dto.name?.trim() || 'Cliente';
    const polizaUrl = dto.urlpoliza ?? '';
    const otras = this.otrasPolizas(dto);
    const subject = asuntoBienvenida(dto.cnpoliza, otras);

    const html = renderPolicyWelcomeHtml({
      nombre: name,
      cnpoliza: dto.cnpoliza,
      polizaUrl: polizaUrl || '#',
      reciboUrl: dto.url_recibo,
      ...(otras.length ? { producto: dto.producto, otrasPolizas: otras } : {}),
    });

    const { adjuntos, resumen } = await this.armarAdjuntosPoliza(dto);
    const attachments = adjuntos.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    }));

    const cc = [...new Set([...(dto.cc ?? []), ...this.parseDefaultCc()])];

    try {
      const info = await this.getTransporter().sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        replyTo,
        to: { name, address: dto.to },
        cc: cc.length ? cc : undefined,
        subject,
        html,
        attachments,
      });

      const extra = otras.length ? ` y ${otras.map((p) => p.cnpoliza).join(', ')}` : '';
      this.logger.log(
        `Correo SMTP enviado a ${dto.to} póliza ${dto.cnpoliza}${extra} (${info.messageId ?? 'ok'}) ` +
          `adjuntos=${resumen.enviados.length} omitidos=${resumen.omitidos.length}`,
      );
      return { sent: true, mode: 'smtp', messageId: info.messageId, adjuntos: resumen };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Fallo SMTP póliza ${dto.cnpoliza}: ${msg}`);
      return { sent: false, mode: 'smtp', error: msg, adjuntos: resumen };
    }
  }

  /** Mismo contrato que SysIP email_php.service.js → sendmail_sisip (PHP arma cuerpo y adjuntos). */
  private async sendViaSisipApi(dto: SendPolicyEmailDto): Promise<PolicyEmissionMailResult> {
    const url = this.config.get<string>('URL_API_EMAIL')?.trim();
    if (!url) {
      return { sent: false, mode: 'sisip', error: 'URL_API_EMAIL no configurada' };
    }

    const cc = [...new Set([...(dto.cc ?? []), ...this.parseDefaultCc()])];
    if (dto.cnpoliza_rcv || dto.url_beneficiario_preferencial || dto.attachments?.length) {
      // El PHP sendmail_sisip arma cuerpo y adjuntos de una sola póliza; lo nuevo solo aplica en modo smtp.
      this.logger.warn(
        `Modo sisip: se ignoran cnpoliza_rcv/url_beneficiario_preferencial/attachments (póliza ${dto.cnpoliza})`,
      );
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cnpoliza: dto.cnpoliza,
          fanopol: dto.fanopol,
          fmespol: dto.fmespol,
          iestadorec: dto.iestadorec ?? null,
          cc: cc.length ? cc : null,
        }),
        signal: AbortSignal.timeout(60000),
      });

      const body = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
      }

      this.logger.log(`Correo sisip enviado póliza ${dto.cnpoliza}: ${body.slice(0, 120)}`);
      return { sent: true, mode: 'sisip', messageId: body.slice(0, 120) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Fallo sendmail_sisip póliza ${dto.cnpoliza}: ${msg}`);
      return { sent: false, mode: 'sisip', error: msg };
    }
  }
}
