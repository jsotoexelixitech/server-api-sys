import { createHash } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SendPolicyEmailDto } from './dto/send-policy-email.dto';
import { SendTemplatedMailDto } from './dto/send-templated-mail.dto';
import { MailService } from './mail.service';

const PDF = Buffer.from('%PDF-1.4\n% cuadro póliza de prueba\n');
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const BASE = 'https://qaapi.lamundialdeseguros.com/sis2000/poliza';
const URL_137515 = `${BASE}/18-1-0000137515/2026/11/`;
const URL_137516 = `${BASE}/26-1-0000137516/2026/11/`;

/** fetch falso: cada URL conocida devuelve su cuerpo; `colgado` espera hasta que aborte el timeout. */
function fetchFalso(rutas: Record<string, Buffer | 'colgado' | number>) {
  return jest.fn(async (url: string, init?: RequestInit) => {
    const r = rutas[url];
    if (r === 'colgado') {
      return new Promise<Response>((_, rej) =>
        init?.signal?.addEventListener('abort', () => rej(init.signal!.reason)),
      );
    }
    if (typeof r === 'number') return new Response('error', { status: r });
    if (!r) return new Response('no existe', { status: 404 });
    return new Response(new Uint8Array(r), { status: 200, headers: { 'content-type': 'application/pdf' } });
  });
}

function servicio(rutas: Record<string, Buffer | 'colgado' | number> = {}, envExtra: Record<string, string> = {}) {
  const env: Record<string, string> = { MAIL_ENABLED: 'true', MAIL_TRANSPORT: 'smtp', ...envExtra };
  const svc = new MailService({ get: (k: string, d?: unknown) => env[k] ?? d } as never);
  const sendMail = jest.fn().mockResolvedValue({ messageId: '<x@test>' });
  const fetchFn = fetchFalso(rutas);
  const lookupFn = jest.fn(async () => [{ address: '200.44.32.12', family: 4 }]);
  Object.assign(svc as unknown as Record<string, unknown>, {
    transporter: { sendMail },
    descargaDeps: { fetchFn, lookupFn },
  });
  return { svc, sendMail, fetchFn, lookupFn };
}

const sha = (s: string) => createHash('sha256').update(s.replace(/\r\n/g, '\n')).digest('hex');
/** Hash del HTML de bienvenida ANTES de este cambio (mismos parámetros): una póliza debe quedar idéntica. */
const HTML_UNA_POLIZA_ORIGINAL = 'eff3b3896ca4b9beca94d3c107ec97f3c919532682a0ee6b46a645ebda6a269c';

const base = {
  to: 'cliente@test.com',
  name: 'Juan Pérez',
  cnpoliza: '18-1-0000137515',
  urlpoliza: URL_137515,
  url_recibo: 'https://qaapi.lamundialdeseguros.com/sis2000/recibo/1',
};

describe('MailService: /mail/policy-emission', () => {
  it('una sola póliza: asunto, HTML y adjunto exactamente como antes', async () => {
    const { svc, sendMail } = servicio({ [URL_137515]: PDF, [base.url_recibo]: PDF });
    const r = await svc.sendPolicyEmissionEmail({ ...base } as never);
    const opts = sendMail.mock.calls[0][0];
    expect(opts.subject).toBe('Bienvenido a La Mundial de Seguros — Póliza 18-1-0000137515');
    expect(sha(opts.html)).toBe(HTML_UNA_POLIZA_ORIGINAL);
    expect(opts.attachments.map((a: { filename: string }) => a.filename)).toEqual([
      'poliza-18-1-0000137515.pdf',
      'recibo-18-1-0000137515.pdf',
    ]);
    expect(r).toMatchObject({
      sent: true,
      mode: 'smtp',
      adjuntos: { enviados: ['poliza-18-1-0000137515.pdf', 'recibo-18-1-0000137515.pdf'], omitidos: [] },
    });
  });

  it('una póliza con producto pero sin segunda: el HTML no cambia', async () => {
    const { svc, sendMail } = servicio({ [URL_137515]: PDF, [base.url_recibo]: PDF });
    await svc.sendPolicyEmissionEmail({ ...base, producto: 'Pérdida Total' } as never);
    expect(sha(sendMail.mock.calls[0][0].html)).toBe(HTML_UNA_POLIZA_ORIGINAL);
  });

  it('dos pólizas: el asunto y el texto nombran ambas y se adjuntan los dos cuadros', async () => {
    const { svc, sendMail, fetchFn } = servicio({ [URL_137515]: PDF, [URL_137516]: PDF });
    const r = await svc.sendPolicyEmissionEmail({
      to: 'cliente@test.com',
      name: 'Ana',
      cnpoliza: '18-1-0000137515',
      producto: 'Pérdida Total',
      urlpoliza: URL_137515,
      cnpoliza_rcv: '26-1-0000137516',
      cnrecibo_rcv: '999',
      fanopol_rcv: 2026,
      fmespol_rcv: 11,
      producto_rcv: 'RCV',
      urlpoliza_rcv: URL_137516,
    } as never);
    const opts = sendMail.mock.calls[0][0];
    expect(opts.subject).toBe('Bienvenido a La Mundial de Seguros — Pólizas 18-1-0000137515 y 26-1-0000137516');
    expect(opts.html).toContain(
      'Tus pólizas <strong>18-1-0000137515</strong> (Pérdida Total) y <strong>26-1-0000137516</strong> (RCV) han sido emitidas.',
    );
    expect(opts.html).toContain(`href="${URL_137516}">Visualizar Póliza 26-1-0000137516</a>`);
    expect(opts.attachments.map((a: { filename: string }) => a.filename)).toEqual([
      'poliza-18-1-0000137515.pdf',
      'poliza-26-1-0000137516.pdf',
    ]);
    expect(opts.attachments[1].contentType).toBe('application/pdf');
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(r.adjuntos?.omitidos).toEqual([]);
  });

  it('segunda póliza igual a la principal: se trata como una sola', async () => {
    const { svc, sendMail } = servicio({ [URL_137515]: PDF, [base.url_recibo]: PDF });
    await svc.sendPolicyEmissionEmail({ ...base, cnpoliza_rcv: '18-1-0000137515' } as never);
    expect(sha(sendMail.mock.calls[0][0].html)).toBe(HTML_UNA_POLIZA_ORIGINAL);
  });

  it('beneficiario preferencial: se adjunta', async () => {
    const urlBenef = 'https://qaapi.lamundialdeseguros.com/sis2000/beneficiario/18-1-0000137515';
    const { svc, sendMail } = servicio({ [URL_137515]: PDF, [urlBenef]: PDF });
    const r = await svc.sendPolicyEmissionEmail({
      to: 'c@test.com',
      cnpoliza: '18-1-0000137515',
      urlpoliza: URL_137515,
      url_beneficiario_preferencial: urlBenef,
    } as never);
    expect(sendMail.mock.calls[0][0].attachments.map((a: { filename: string }) => a.filename)).toEqual([
      'poliza-18-1-0000137515.pdf',
      'beneficiario-preferencial-18-1-0000137515.pdf',
    ]);
    expect(r.adjuntos?.enviados).toHaveLength(2);
  });

  it('attachments por url y base64: los válidos salen; host no permitido y http se omiten sin tumbar el correo', async () => {
    const urlCobro = 'https://pagos.exelixitech.com/comprobantes/abc.pdf';
    const { svc, sendMail, fetchFn } = servicio({ [URL_137515]: PDF, [urlCobro]: PDF });
    const r = await svc.sendPolicyEmissionEmail({
      to: 'c@test.com',
      cnpoliza: '18-1-0000137515',
      urlpoliza: URL_137515,
      attachments: [
        { filename: 'Comprobante de pago.pdf', url: urlCobro },
        { filename: 'malo.pdf', url: 'https://evil.example.com/x.pdf' },
        { filename: 'plano.pdf', url: 'http://qaapi.lamundialdeseguros.com/x.pdf' },
        { filename: 'condiciones.pdf', contentType: 'application/pdf', contentBase64: PDF.toString('base64') },
      ],
    } as never);
    expect(r.sent).toBe(true);
    expect(sendMail.mock.calls[0][0].attachments.map((a: { filename: string }) => a.filename)).toEqual([
      'poliza-18-1-0000137515.pdf',
      'Comprobante-de-pago.pdf',
      'condiciones.pdf',
    ]);
    expect(r.adjuntos?.omitidos).toEqual([
      { archivo: 'malo.pdf', motivo: 'host no permitido (evil.example.com)' },
      { archivo: 'plano.pdf', motivo: 'solo se aceptan URLs https (qaapi.lamundialdeseguros.com)' },
    ]);
    expect(fetchFn.mock.calls.map((c) => c[0])).not.toContain('https://evil.example.com/x.pdf');
  });

  it('adjunto que no responde a tiempo se omite y el correo sale', async () => {
    const lento = 'https://qaapi.lamundialdeseguros.com/sis2000/lento.pdf';
    const { svc, sendMail } = servicio(
      { [URL_137515]: PDF, [lento]: 'colgado' },
      { MAIL_ATTACHMENT_URL_TIMEOUT_MS: '50' },
    );
    const r = await svc.sendPolicyEmissionEmail({
      to: 'c@test.com',
      cnpoliza: '18-1-0000137515',
      urlpoliza: URL_137515,
      attachments: [{ filename: 'lento.pdf', url: lento }],
    } as never);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(r.sent).toBe(true);
    expect(r.adjuntos?.omitidos).toEqual([{ archivo: 'lento.pdf', motivo: 'tiempo de espera agotado (50 ms)' }]);
  });

  it('PDF caído (HTTP 500) o contenido que no es PDF: se omite', async () => {
    const html = 'https://qaapi.lamundialdeseguros.com/sis2000/error.pdf';
    const { svc, sendMail } = servicio({ [URL_137515]: 500, [html]: Buffer.from('<html>error</html>') });
    const r = await svc.sendPolicyEmissionEmail({
      to: 'c@test.com',
      cnpoliza: '18-1-0000137515',
      urlpoliza: URL_137515,
      url_club_arys: html,
    } as never);
    expect(sendMail.mock.calls[0][0].attachments).toEqual([]);
    expect(r.adjuntos?.omitidos).toEqual([
      { archivo: 'poliza-18-1-0000137515.pdf', motivo: 'HTTP 500' },
      { archivo: 'club-arys-18-1-0000137515.pdf', motivo: 'contenido no es pdf, xlsx ni csv' },
    ]);
  });

  it('máximo 8 adjuntos: del noveno en adelante se omite', async () => {
    const rutas: Record<string, Buffer> = {};
    const attachments = Array.from({ length: 8 }, (_, i) => {
      const url = `https://qaapi.lamundialdeseguros.com/doc/${i}.pdf`;
      rutas[url] = PDF;
      return { filename: `doc-${i}.pdf`, url };
    });
    const { svc, sendMail } = servicio({ ...rutas, [URL_137515]: PDF, [base.url_recibo]: PDF });
    const r = await svc.sendPolicyEmissionEmail({ ...base, attachments } as never);
    expect(sendMail.mock.calls[0][0].attachments).toHaveLength(8);
    expect(r.adjuntos?.enviados).toHaveLength(8);
    expect(r.adjuntos?.omitidos).toEqual([
      { archivo: 'doc-6.pdf', motivo: 'supera el máximo de 8 adjuntos' },
      { archivo: 'doc-7.pdf', motivo: 'supera el máximo de 8 adjuntos' },
    ]);
  });

  it('DTO: conserva los campos nuevos con whitelist y limita attachments a 8', () => {
    const dto = plainToInstance(SendPolicyEmailDto, {
      to: 'c@test.com',
      cnpoliza: '18-1-0000137515',
      cnpoliza_rcv: '26-1-0000137516',
      cnrecibo_rcv: '1',
      fanopol_rcv: '2026',
      fmespol_rcv: 11,
      urlpoliza_rcv: URL_137516,
      producto_rcv: 'RCV',
      url_beneficiario_preferencial: 'https://qaapi.lamundialdeseguros.com/b.pdf',
      attachments: [{ filename: 'a.pdf', url: 'https://qaapi.lamundialdeseguros.com/a.pdf' }],
    });
    expect(validateSync(dto, { whitelist: true })).toHaveLength(0);
    expect(dto).toMatchObject({
      cnpoliza_rcv: '26-1-0000137516',
      fanopol_rcv: 2026,
      urlpoliza_rcv: URL_137516,
      url_beneficiario_preferencial: 'https://qaapi.lamundialdeseguros.com/b.pdf',
    });
    expect(dto.attachments).toHaveLength(1);
    const nueve = plainToInstance(SendPolicyEmailDto, {
      to: 'c@test.com',
      cnpoliza: '1',
      attachments: Array.from({ length: 9 }, () => ({ filename: 'a.pdf', url: 'https://x.exelixitech.com/a.pdf' })),
    });
    expect(validateSync(nueve)).not.toHaveLength(0);
  });

  it('MAIL_ENABLED=false: no descarga ni envía (igual que antes)', async () => {
    const { svc, sendMail, fetchFn } = servicio({}, { MAIL_ENABLED: 'false' });
    const r = await svc.sendPolicyEmissionEmail({ ...base } as never);
    expect(r).toEqual({ sent: false, mode: 'disabled', error: 'MAIL_ENABLED=false' });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe('MailService: /mail/send con attachments por url', () => {
  const datos = { subject: 'S', title: 'T', intro: 'I' };

  it('descarga el archivo, detecta el tipo y sanea el nombre', async () => {
    const url = 'https://reportes.exelixitech.com/control.xlsx';
    const xlsx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('resto')]);
    const { svc, sendMail } = servicio({ [url]: xlsx });
    const r = await svc.sendTemplatedEmail({
      to: 'a@test.com',
      template: 'branded',
      data: datos,
      attachments: [{ filename: 'Control documental.xlsx', url }],
    } as never);
    expect(r.sent).toBe(true);
    expect(sendMail.mock.calls[0][0].attachments).toEqual([
      { filename: 'Control-documental.xlsx', content: xlsx, contentType: XLSX },
    ]);
  });

  it('base64 sigue funcionando junto a url', async () => {
    const url = 'https://qaapi.lamundialdeseguros.com/p.pdf';
    const { svc, sendMail } = servicio({ [url]: PDF });
    await svc.sendTemplatedEmail({
      to: 'a@test.com',
      template: 'branded',
      data: datos,
      attachments: [
        { filename: 'b.csv', contentType: 'text/csv', contentBase64: Buffer.from('a;b\n1;2').toString('base64') },
        { filename: 'p.pdf', url },
      ],
    } as never);
    expect(sendMail.mock.calls[0][0].attachments.map((a: { filename: string }) => a.filename)).toEqual([
      'b.csv',
      'p.pdf',
    ]);
  });

  it('host no permitido o http: 400 sin descargar ni enviar', async () => {
    const { svc, sendMail, fetchFn } = servicio();
    for (const url of ['https://evil.example.com/a.pdf', 'http://qaapi.lamundialdeseguros.com/a.pdf', 'https://127.0.0.1/a.pdf']) {
      await expect(
        svc.sendTemplatedEmail({
          to: 'a@test.com',
          template: 'branded',
          data: datos,
          attachments: [{ filename: 'a.pdf', url }],
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(fetchFn).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('host por comodín que resuelve a IP privada: 400', async () => {
    const { svc, sendMail, lookupFn } = servicio({ 'https://interno.exelixitech.com/a.pdf': PDF });
    lookupFn.mockResolvedValueOnce([{ address: '10.0.0.5', family: 4 }]);
    await expect(
      svc.sendTemplatedEmail({
        to: 'a@test.com',
        template: 'branded',
        data: datos,
        attachments: [{ filename: 'a.pdf', url: 'https://interno.exelixitech.com/a.pdf' }],
      } as never),
    ).rejects.toThrow('resuelve a una IP privada');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('timeout de descarga: 400', async () => {
    const url = 'https://qaapi.lamundialdeseguros.com/lento.pdf';
    const { svc, sendMail } = servicio({ [url]: 'colgado' }, { MAIL_ATTACHMENT_URL_TIMEOUT_MS: '50' });
    await expect(
      svc.sendTemplatedEmail({
        to: 'a@test.com',
        template: 'branded',
        data: datos,
        attachments: [{ filename: 'lento.pdf', url }],
      } as never),
    ).rejects.toThrow('tiempo de espera agotado');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('máximo 8 adjuntos: 9 responde 400 y el DTO también lo rechaza', async () => {
    const { svc } = servicio();
    const nueve = Array.from({ length: 9 }, () => ({
      filename: 'a.csv',
      contentType: 'text/csv',
      contentBase64: 'QUJD',
    }));
    await expect(
      svc.sendTemplatedEmail({ to: 'a@test.com', template: 'branded', data: datos, attachments: nueve } as never),
    ).rejects.toThrow('Máximo 8 adjuntos.');
    const dto = plainToInstance(SendTemplatedMailDto, { to: 'a@test.com', template: 'branded', data: datos, attachments: nueve });
    expect(validateSync(dto)).not.toHaveLength(0);
    const ocho = plainToInstance(SendTemplatedMailDto, {
      to: 'a@test.com',
      template: 'branded',
      data: datos,
      attachments: nueve.slice(1),
    });
    expect(validateSync(ocho)).toHaveLength(0);
  });

  it('DTO: url sin base64 es válido; sin url ni base64 no', () => {
    const conUrl = plainToInstance(SendTemplatedMailDto, {
      to: 'a@test.com',
      template: 'branded',
      data: datos,
      attachments: [{ filename: 'a.pdf', url: 'https://qaapi.lamundialdeseguros.com/a.pdf' }],
    });
    expect(validateSync(conUrl)).toHaveLength(0);
    const vacio = plainToInstance(SendTemplatedMailDto, {
      to: 'a@test.com',
      template: 'branded',
      data: datos,
      attachments: [{ filename: 'a.pdf' }],
    });
    expect(validateSync(vacio)).not.toHaveLength(0);
  });
});
