import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type Transporter from 'nodemailer/lib/mailer';
import { renderPolicyWelcomeHtml } from './templates/policy-welcome.template';
import type { SendPolicyEmailDto } from './dto/send-policy-email.dto';

export type PolicyEmissionMailResult = {
  sent: boolean;
  mode: 'disabled' | 'smtp' | 'sisip';
  messageId?: string;
  error?: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return this.config.get<string>('MAIL_ENABLED', 'false').toLowerCase() === 'true';
  }

  getTransportMode(): 'smtp' | 'sisip' {
    const mode = this.config.get<string>('MAIL_TRANSPORT', 'smtp').toLowerCase();
    return mode === 'sisip' ? 'sisip' : 'smtp';
  }

  shouldAutoSendOnEmit(): boolean {
    return (
      this.isEnabled()
      && this.config.get<string>('MAIL_AUTO_ON_EMIT', 'false').toLowerCase() === 'true'
    );
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

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;

    const host = this.config.get<string>('SMTP_HOST', 'mail.lamundialdeseguros.com');
    const port = Number(this.config.get<string>('SMTP_PORT', '25'));
    const secure = this.config.get<string>('SMTP_SECURE', 'false').toLowerCase() === 'true';
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
    if (dto.url_conductor_habitual) {
      items.push({ filename: `conductor-${dto.cnpoliza}.pdf`, url: dto.url_conductor_habitual });
    }
    if (dto.url_club_arys) items.push({ filename: `club-arys-${dto.cnpoliza}.pdf`, url: dto.url_club_arys });
    if (dto.url_ingreso_caja) {
      items.push({ filename: `ingreso-caja-${dto.cnpoliza}.pdf`, url: dto.url_ingreso_caja });
    }
    if (dto.url_recibo) items.push({ filename: `recibo-${dto.cnrecibo ?? dto.cnpoliza}.pdf`, url: dto.url_recibo });
    return items;
  }

  private async fetchAttachment(url: string, filename: string) {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} al descargar ${filename}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    return { filename, content: buffer };
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
    const subject = `Bienvenido a La Mundial de Seguros — Póliza ${dto.cnpoliza}`;

    const html = renderPolicyWelcomeHtml({
      nombre: name,
      cnpoliza: dto.cnpoliza,
      polizaUrl: polizaUrl || '#',
      reciboUrl: dto.url_recibo,
    });

    const attachments = [];
    for (const item of this.buildAttachmentList(dto)) {
      try {
        attachments.push(await this.fetchAttachment(item.url, item.filename));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Adjunto omitido ${item.filename}: ${msg}`);
      }
    }

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

      this.logger.log(`Correo SMTP enviado a ${dto.to} póliza ${dto.cnpoliza} (${info.messageId ?? 'ok'})`);
      return { sent: true, mode: 'smtp', messageId: info.messageId };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Fallo SMTP póliza ${dto.cnpoliza}: ${msg}`);
      return { sent: false, mode: 'smtp', error: msg };
    }
  }

  /** Mismo contrato que SysIP email_php.service.js → sendmail_sisip (PHP arma cuerpo y adjuntos). */
  private async sendViaSisipApi(dto: SendPolicyEmailDto): Promise<PolicyEmissionMailResult> {
    const url = this.config.get<string>('URL_API_EMAIL')?.trim();
    if (!url) {
      return { sent: false, mode: 'sisip', error: 'URL_API_EMAIL no configurada' };
    }

    const cc = [...new Set([...(dto.cc ?? []), ...this.parseDefaultCc()])];

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
