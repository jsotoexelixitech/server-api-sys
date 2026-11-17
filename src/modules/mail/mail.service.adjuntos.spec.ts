import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SendTemplatedMailDto } from './dto/send-templated-mail.dto';
import { MailService } from './mail.service';
import {
  MAIL_ATTACHMENTS_MAX_BYTES,
  prepararAdjuntos,
  sanearNombreAdjunto,
} from './mail-attachments';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function servicio() {
  const env: Record<string, string> = { MAIL_ENABLED: 'true' };
  const svc = new MailService({ get: (k: string, d?: unknown) => env[k] ?? d } as never);
  const sendMail = jest.fn().mockResolvedValue({ messageId: '<x@test>' });
  (svc as unknown as { transporter: unknown }).transporter = { sendMail };
  return { svc, sendMail };
}

const datosSimple = {
  subject: 'Marketplace | Canales | Control documental diario – 09/11/2026',
  fecha: '09/11/2026',
  corte: '09/11/2026 23:00',
  completados: 3,
  incompletos: 2,
  canales: { completos: 2, incompletos: 1 },
  productores: { completos: 1, incompletos: 1 },
};

describe('MailService: adjuntos en /mail/send', () => {
  it('el DTO acepta attachments y rechaza tipos fuera de la lista blanca', () => {
    const ok = plainToInstance(SendTemplatedMailDto, {
      to: 'a@test.com',
      template: 'expediente-reporte-diario-simple',
      data: datosSimple,
      attachments: [{ filename: 'c.xlsx', contentBase64: 'QUJD', contentType: XLSX }],
    });
    expect(validateSync(ok)).toHaveLength(0);
    const malo = plainToInstance(SendTemplatedMailDto, {
      to: 'a@test.com',
      template: 'branded',
      data: {},
      attachments: [{ filename: 'x.exe', contentBase64: 'QUJD', contentType: 'application/x-msdownload' }],
    });
    expect(validateSync(malo)).not.toHaveLength(0);
  });

  it('pasa el Excel al transporte SMTP con nombre saneado y su tipo', async () => {
    const { svc, sendMail } = servicio();
    const contenido = Buffer.from('PK excel de prueba');
    const r = await svc.sendTemplatedEmail({
      to: 'a@test.com',
      template: 'expediente-reporte-diario-simple',
      data: datosSimple,
      attachments: [
        {
          filename: '../Control documental 2026-11-09.xlsx',
          contentBase64: contenido.toString('base64'),
          contentType: XLSX,
        },
      ],
    } as never);
    expect(r.sent).toBe(true);
    const opts = sendMail.mock.calls[0][0];
    expect(opts.subject).toBe(datosSimple.subject);
    expect(opts.attachments).toEqual([
      { filename: 'Control-documental-2026-11-09.xlsx', content: contenido, contentType: XLSX },
    ]);
  });

  it('sin adjuntos el correo sale igual que antes (sin la propiedad attachments)', async () => {
    const { svc, sendMail } = servicio();
    await svc.sendTemplatedEmail({
      to: 'a@test.com',
      template: 'branded',
      data: { subject: 'S', title: 'T', intro: 'I' },
    } as never);
    expect(sendMail.mock.calls[0][0]).not.toHaveProperty('attachments');
  });

  it('adjunto inválido o demasiado grande: 400 sin enviar', async () => {
    const { svc, sendMail } = servicio();
    const enviar = (attachments: unknown) =>
      svc.sendTemplatedEmail({
        to: 'a@test.com',
        template: 'expediente-reporte-diario-simple',
        data: datosSimple,
        attachments,
      } as never);
    await expect(
      enviar([{ filename: 'a.xlsx', contentBase64: 'no es base64!', contentType: XLSX }]),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      enviar([{ filename: 'a.html', contentBase64: 'QUJD', contentType: 'text/html' }]),
    ).rejects.toBeInstanceOf(BadRequestException);
    const grande = Buffer.alloc(MAIL_ATTACHMENTS_MAX_BYTES / 2 + 1).toString('base64');
    await expect(
      enviar([
        { filename: 'a.xlsx', contentBase64: grande, contentType: XLSX },
        { filename: 'b.xlsx', contentBase64: grande, contentType: XLSX },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('nombres: sin rutas, sin acentos ni caracteres raros y con la extensión del tipo', () => {
    expect(sanearNombreAdjunto('C:\\tmp\\Reporte ñandú (1).exe', 'pdf')).toBe('Reporte-nandu-1.pdf');
    expect(sanearNombreAdjunto('', 'csv')).toBe('adjunto.csv');
    expect(sanearNombreAdjunto('../../etc/passwd', 'xlsx')).toBe('passwd.xlsx');
    expect(prepararAdjuntos(undefined)).toEqual({ adjuntos: [] });
    expect(prepararAdjuntos(new Array(6).fill({}))).toEqual({ error: 'Máximo 5 adjuntos.' });
  });
});
