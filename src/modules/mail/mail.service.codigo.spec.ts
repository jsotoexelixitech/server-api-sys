import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SendTemplatedMailDto } from './dto/send-templated-mail.dto';
import { MailService } from './mail.service';
import { buildExpedienteCodigoEmail, codigoSeguro } from './templates/expediente-codigo.template';

describe('MailService: plantilla expediente-codigo', () => {
  const svc = new MailService({ get: (_k: string, d?: unknown) => d } as never);
  const build = (data: Record<string, unknown>) =>
    (
      svc as unknown as {
        buildTemplate(dto: unknown): { subject: string; html: string; text: string } | { error: string };
      }
    ).buildTemplate({ to: 'a@test.com', template: 'expediente-codigo', data });

  it('el DTO acepta la plantilla', () => {
    const dto = plainToInstance(SendTemplatedMailDto, {
      to: 'a@test.com',
      template: 'expediente-codigo',
      data: { codigo: '123456' },
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('arma el correo de usted con el código y su vigencia, sin pólizas ni «vendedor»', () => {
    const r = build({
      subject: 'La Mundial de Seguros | Código de verificación',
      nombre: 'María',
      codigo: '048213',
      minutos: 10,
    });
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.subject).toBe('La Mundial de Seguros | Código de verificación');
    expect(r.html).toContain('048213');
    expect(r.text).toContain('048213');
    expect(r.text).toContain('Estimado(a) María:');
    expect(r.text).toContain('vence en 10 minutos');
    expect(r.html).not.toMatch(/vendedor|póliza/i);
  });

  it('sin código válido responde error (Nexus cae al respaldo branded)', () => {
    expect(build({ codigo: '<script>' })).toEqual({ error: expect.stringContaining('codigo') });
    expect(build({})).toEqual({ error: expect.stringContaining('codigo') });
  });

  it('solo dígitos y asunto por defecto', () => {
    expect(codigoSeguro('12 34 56')).toBe('123456');
    expect(codigoSeguro('12a456')).toBe('');
    const r = buildExpedienteCodigoEmail({ codigo: '123456' });
    expect(r.subject).toBe('La Mundial de Seguros | Código de verificación');
    expect(r.text).toContain('Estimado(a) asegurado(a):');
  });
});
