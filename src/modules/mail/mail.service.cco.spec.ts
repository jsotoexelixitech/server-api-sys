import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SendTemplatedMailDto } from './dto/send-templated-mail.dto';
import { MailService } from './mail.service';

function servicio(env: Record<string, string> = {}) {
  const vars: Record<string, string> = { MAIL_ENABLED: 'true', ...env };
  const svc = new MailService({ get: (k: string, d?: unknown) => vars[k] ?? d } as never);
  const sendMail = jest.fn().mockResolvedValue({ messageId: '<x@test>' });
  (svc as unknown as { transporter: unknown }).transporter = { sendMail };
  return { svc, sendMail };
}

/** Mismas opciones que el ValidationPipe global de main.ts. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: false,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});
const meta: ArgumentMetadata = { type: 'body', metatype: SendTemplatedMailDto, data: '' };

const datosSimple = {
  subject: 'Marketplace | Canales | Control documental diario – 09/11/2026',
  fecha: '09/11/2026',
  corte: '09/11/2026 23:00',
  completados: 3,
  incompletos: 2,
};

const base = {
  to: 'a@test.com',
  toExtra: ['b@test.com', 'c@test.com'],
  template: 'expediente-reporte-diario-simple',
  data: datosSimple,
};

describe('MailService: ocultarDestinatarios (CCO)', () => {
  it('el ValidationPipe global conserva ocultarDestinatarios=true', async () => {
    const dto = (await pipe.transform({ ...base, ocultarDestinatarios: true }, meta)) as SendTemplatedMailDto;
    expect(dto.ocultarDestinatarios).toBe(true);
  });

  it('sin conversión implícita, IsBoolean rechaza un valor no booleano', () => {
    const dto = plainToInstance(SendTemplatedMailDto, { ...base, ocultarDestinatarios: 'si' });
    expect(validateSync(dto).map((e) => e.property)).toContain('ocultarDestinatarios');
  });

  it('el ValidationPipe global deja el campo ausente como undefined', async () => {
    const dto = (await pipe.transform({ ...base }, meta)) as SendTemplatedMailDto;
    expect(dto.ocultarDestinatarios).toBeUndefined();
  });

  it('con el flag y varios destinatarios: Para = remitente y la lista en BCC', async () => {
    const { svc, sendMail } = servicio({ SMTP_FROM: 'info@lamundialdeseguros.com' });
    const dto = (await pipe.transform({ ...base, ocultarDestinatarios: true }, meta)) as SendTemplatedMailDto;
    const r = await svc.sendTemplatedEmail(dto);
    expect(r.sent).toBe(true);
    const arg = sendMail.mock.calls[0][0];
    expect(arg.to).toEqual({ name: 'La Mundial de Seguros', address: 'info@lamundialdeseguros.com' });
    expect(arg.bcc).toEqual(['a@test.com', 'b@test.com', 'c@test.com']);
    expect(arg.from).toBe('"La Mundial de Seguros" <info@lamundialdeseguros.com>');
  });

  it('usa SMTP_FROM_NAME si está configurado', async () => {
    const { svc, sendMail } = servicio({ SMTP_FROM: 'reportes@test.com', SMTP_FROM_NAME: 'LM Reportes' });
    await svc.sendTemplatedEmail({ ...base, ocultarDestinatarios: true } as SendTemplatedMailDto);
    expect(sendMail.mock.calls[0][0].to).toEqual({ name: 'LM Reportes', address: 'reportes@test.com' });
  });

  it('también aplica al fallback branded', async () => {
    const { svc, sendMail } = servicio();
    await svc.sendTemplatedEmail({
      ...base,
      template: 'branded',
      data: { subject: 'Reporte', title: 'Reporte', intro: 'Hola' },
      ocultarDestinatarios: true,
    } as SendTemplatedMailDto);
    const arg = sendMail.mock.calls[0][0];
    expect(arg.bcc).toEqual(['a@test.com', 'b@test.com', 'c@test.com']);
    expect(arg.to).toEqual({ name: 'La Mundial de Seguros', address: 'info@lamundialdeseguros.com' });
  });

  it('sin el flag el envío no cambia (todos en Para, sin BCC)', async () => {
    const { svc, sendMail } = servicio();
    const dto = (await pipe.transform({ ...base }, meta)) as SendTemplatedMailDto;
    await svc.sendTemplatedEmail(dto);
    const arg = sendMail.mock.calls[0][0];
    expect(arg.to).toEqual(['a@test.com', 'b@test.com', 'c@test.com']);
    expect(arg).not.toHaveProperty('bcc');
  });

  it('con el flag y un solo destinatario no usa BCC', async () => {
    const { svc, sendMail } = servicio();
    await svc.sendTemplatedEmail({
      to: 'a@test.com',
      toName: 'Ana',
      template: 'expediente-reporte-diario-simple',
      data: datosSimple,
      ocultarDestinatarios: true,
    } as SendTemplatedMailDto);
    const arg = sendMail.mock.calls[0][0];
    expect(arg.to).toEqual({ name: 'Ana', address: 'a@test.com' });
    expect(arg).not.toHaveProperty('bcc');
  });

  it('ocultarDestinatarios=false se comporta como sin flag', async () => {
    const { svc, sendMail } = servicio();
    await svc.sendTemplatedEmail({ ...base, ocultarDestinatarios: false } as SendTemplatedMailDto);
    const arg = sendMail.mock.calls[0][0];
    expect(arg.to).toEqual(['a@test.com', 'b@test.com', 'c@test.com']);
    expect(arg).not.toHaveProperty('bcc');
  });
});
